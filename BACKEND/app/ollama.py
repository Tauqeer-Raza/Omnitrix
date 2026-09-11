"""On-demand lifecycle for explicitly configured, direct Ollama servers."""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from contextvars import ContextVar

import httpx

from .domain import APIError

logger = logging.getLogger(__name__)
runtime_events = ContextVar("runtime_events", default=None)


class OllamaRuntime:
    def __init__(self, providers):
        self.providers = providers
        self.cfg = providers.cfg
        self.locks = {}

    def managed(self, base):
        return base.rstrip("/") in {url.rstrip("/") for url in self.cfg.ollama_managed_base_urls}

    @staticmethod
    def root(base):
        return base.rstrip("/").removesuffix("/v1")

    def pinned(self, base, model):
        return (
            self.cfg.ollama_pin_orchestrator
            and base.rstrip("/") == self.cfg.orchestrator_base_url.rstrip("/")
            and model == self.cfg.orchestrator_model
        )

    def configured_models(self, base):
        names = set()
        for worker in self.cfg.workers().values():
            if worker["base_url"].rstrip("/") == base.rstrip("/"):
                names.update(filter(None, worker["models"].values()))
        for prefix in ("orchestrator", "embedding"):
            if getattr(self.cfg, prefix + "_base_url").rstrip("/") == base.rstrip("/"):
                names.add(getattr(self.cfg, prefix + "_model"))
        return names - {""}

    @staticmethod
    def notify(kind, model, message):
        sink = runtime_events.get()
        if sink:
            sink(kind, model, message)

    async def loaded(self, base, key):
        result = await self.providers.request("GET", self.root(base) + "/api/ps", key=key)
        if (
            not isinstance(result, dict)
            or not isinstance(result.get("models"), list)
            or any(not isinstance(entry, dict) for entry in result["models"])
        ):
            raise APIError("INVALID_PROVIDER_RESPONSE", "Invalid Ollama memory status.", 502)
        return result["models"]

    async def unload(self, base, key, model):
        result = await self.providers.request(
            "POST",
            self.root(base) + "/api/generate",
            key=key,
            body={"model": model, "keep_alive": 0, "stream": False},
        )
        if not isinstance(result, dict) or result.get("done") is not True:
            raise APIError("MODEL_UNLOAD_FAILED", "Ollama did not confirm model unloading.", 503)
        self.notify("model_unloaded", model, f"Released {model} from model memory.")

    async def cleanup(self, base, key, model):
        # Bounded cleanup must finish before the endpoint lock is released, even on cancellation.
        try:
            async with asyncio.timeout(self.cfg.ollama_cleanup_timeout_seconds):
                await self.unload(base, key, model)
        except (APIError, TimeoutError):
            logger.warning("Ollama model cleanup could not be confirmed for %s", model)
            self.notify(
                "model_unload_failed",
                model,
                f"Could not confirm memory release for {model}; check the Ollama server.",
            )

    @asynccontextmanager
    async def use(self, base, key, model):
        lock = self.locks.setdefault(self.root(base), asyncio.Lock())
        self.notify("model_waiting", model, f"Waiting for the model server to run {model}.")
        async with lock:
            # Remove only configured OMNITRIX models left resident by earlier calls.
            # Never preload every registry model or unload unrelated models on this server.
            configured = self.configured_models(base)
            async with asyncio.timeout(self.cfg.ollama_cleanup_timeout_seconds):
                for entry in await self.loaded(base, key):
                    name = entry.get("name") or entry.get("model")
                    if name in configured and name != model and not self.pinned(base, name):
                        await self.unload(base, key, name)
            self.notify("model_loading", model, f"Loading or reusing the selected model: {model}.")
            succeeded = False
            try:
                yield -1 if self.pinned(base, model) else 0
                succeeded = True
            finally:
                if self.pinned(base, model):
                    if succeeded:
                        self.notify(
                            "model_retained", model, f"Keeping orchestrator {model} resident."
                        )
                else:
                    cleanup = asyncio.create_task(self.cleanup(base, key, model))
                    try:
                        await asyncio.shield(cleanup)
                    except asyncio.CancelledError:
                        await cleanup
                        raise

    def body(
        self,
        model,
        messages,
        max_tokens,
        reasoning_effort,
        keep_alive,
        stream,
        response_format=None,
    ):
        converted = []
        for message in messages:
            content = message.get("content", "")
            if isinstance(content, str):
                converted.append({"role": message["role"], "content": content})
                continue
            texts, images = [], []
            for part in content:
                if part.get("type") == "text":
                    texts.append(part["text"])
                elif part.get("type") == "image_url":
                    url = part["image_url"]["url"]
                    if not url.startswith("data:image/") or ";base64," not in url:
                        raise APIError(
                            "INVALID_IMAGE", "Ollama requires a local image attachment.", 422
                        )
                    images.append(url.split(";base64,", 1)[1])
            converted.append(
                {"role": message["role"], "content": "\n".join(texts), "images": images}
            )
        body = {
            "model": model,
            "messages": converted,
            "stream": stream,
            "keep_alive": keep_alive,
            "options": {
                "num_predict": max_tokens or self.cfg.max_output_tokens,
                "temperature": 0.1,
                "num_ctx": self.cfg.ollama_context_length,
            },
        }
        # Omitted effort also means no hidden thinking for managed specialist calls.
        body["think"] = False if reasoning_effort in (None, "", "none") else reasoning_effort
        if response_format:
            if response_format.get("type") == "json_schema":
                body["options"]["temperature"] = 0
            body["format"] = (
                response_format["json_schema"]["schema"]
                if response_format.get("type") == "json_schema"
                else "json"
            )
        return body

    @staticmethod
    def usage(payload):
        counts = (payload.get("prompt_eval_count"), payload.get("eval_count", 0))
        if all(isinstance(n, int) and not isinstance(n, bool) and n >= 0 for n in counts):
            return {"total_tokens": sum(counts)}
        return None

    async def prime(self):
        cfg = self.cfg
        if (
            cfg.ollama_pin_orchestrator
            and cfg.orchestrator_model
            and self.managed(cfg.orchestrator_base_url)
        ):
            base, model = cfg.orchestrator_base_url, cfg.orchestrator_model
            key = cfg.orchestrator_api_key.get_secret_value()
            try:
                async with self.use(base, key, model):
                    result = await self.providers.request(
                        "POST",
                        self.root(base) + "/api/chat",
                        key=key,
                        body={"model": model, "messages": [], "stream": False, "keep_alive": -1},
                    )
                    if not isinstance(result, dict) or result.get("done") is not True:
                        raise APIError(
                            "INVALID_PROVIDER_RESPONSE", "Orchestrator preload failed.", 502
                        )
            except (APIError, TimeoutError):
                logger.warning("Orchestrator preload failed; next request will attempt to load it.")

    async def chat(
        self,
        base,
        model,
        key,
        messages,
        max_tokens=None,
        reasoning_effort=None,
        response_format=None,
    ):
        async with self.use(base, key, model) as keep_alive:
            result = await self.providers.request(
                "POST",
                self.root(base) + "/api/chat",
                key=key,
                body=self.body(
                    model,
                    messages,
                    max_tokens,
                    reasoning_effort,
                    keep_alive,
                    False,
                    response_format,
                ),
            )
            message = result.get("message") if isinstance(result, dict) else None
            content = message.get("content") if isinstance(message, dict) else None
            if (
                not isinstance(result, dict)
                or result.get("done") is not True
                or not isinstance(content, str)
                or not content.strip()
            ):
                raise APIError(
                    "INVALID_PROVIDER_RESPONSE", "The model returned no usable answer.", 502
                )
            usage = self.providers.usage({"usage": self.usage(result) or {}}, messages, content)
            return content, usage

    async def stream(self, base, model, key, messages, max_tokens=None, reasoning_effort=None):
        async with self.use(base, key, model) as keep_alive:
            try:
                async with self.providers.client.stream(
                    "POST",
                    self.root(base) + "/api/chat",
                    headers=self.providers.headers(key),
                    json=self.body(model, messages, max_tokens, reasoning_effort, keep_alive, True),
                ) as response:
                    if response.status_code >= 300:
                        raise APIError(
                            "INFERENCE_UNAVAILABLE",
                            await self.providers.rejection_detail(response, "Ollama"),
                            503,
                        )
                    count, done = 0, False
                    async for line in response.aiter_lines():
                        count += len(line.encode())
                        if count > self.cfg.provider_response_max_mb * 1024 * 1024:
                            raise APIError(
                                "INVALID_PROVIDER_RESPONSE",
                                "Inference output exceeded the configured limit.",
                                502,
                            )
                        if not line.strip():
                            continue
                        payload = json.loads(line)
                        if not isinstance(payload, dict):
                            raise ValueError("Invalid stream payload")
                        if payload.get("error"):
                            raise APIError(
                                "INFERENCE_UNAVAILABLE", "Ollama reported a generation error.", 503
                            )
                        message = payload.get("message", {})
                        if not isinstance(message, dict):
                            raise ValueError("Invalid stream message")
                        content = message.get("content", "")
                        if content:
                            if not isinstance(content, str):
                                raise ValueError("Invalid content")
                            yield "delta", content
                        if payload.get("done") is True:
                            done = True
                            usage = self.usage(payload)
                            if usage:
                                yield "usage", usage
                            break
                    if not done:
                        raise APIError(
                            "INFERENCE_INTERRUPTED",
                            "The inference stream ended before completion.",
                            503,
                        )
            except (httpx.HTTPError, ValueError, TypeError, KeyError) as exc:
                raise APIError(
                    "INFERENCE_UNAVAILABLE", "The local inference stream was interrupted.", 503
                ) from exc

    async def embed(self, texts):
        cfg = self.cfg
        base, model, key = (
            cfg.embedding_base_url,
            cfg.embedding_model,
            cfg.embedding_api_key.get_secret_value(),
        )
        async with self.use(base, key, model) as keep_alive:
            result = await self.providers.request(
                "POST",
                self.root(base) + "/api/embed",
                key=key,
                body={"model": model, "input": texts, "keep_alive": keep_alive, "truncate": False},
            )
            if not isinstance(result, dict) or not isinstance(result.get("embeddings"), list):
                raise APIError(
                    "INVALID_PROVIDER_RESPONSE", "Invalid Ollama embedding response.", 502
                )
            return {
                "data": [
                    {"index": i, "embedding": vector}
                    for i, vector in enumerate(result.get("embeddings", []))
                ],
                "usage": self.usage(result) or {},
            }
