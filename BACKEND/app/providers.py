import asyncio
import json
import math
import time
from collections.abc import AsyncIterator
from contextlib import aclosing
from urllib.parse import urlparse

import httpx

from .domain import APIError, now_iso
from .ollama import OllamaRuntime
from .topology import provider_targets


class Providers:
    """OpenAI-compatible local endpoints, not OpenAI cloud. URLs are deployment-owned only."""

    def __init__(self, cfg, transport=None):
        self.cfg = cfg
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(cfg.provider_timeout_seconds, connect=10),
            verify=cfg.provider_verify_tls,
            trust_env=False,
            follow_redirects=False,
            transport=transport,
        )
        self.ollama = OllamaRuntime(self)

    async def close(self):
        await self.client.aclose()

    async def health(self):
        """Probe configured OpenAI-compatible model registries without generating tokens."""
        targets = provider_targets(self.cfg)
        groups = {}
        for target in targets:
            if target["baseUrl"] and target["model"]:
                key = (target["baseUrl"].rstrip("/"), target["apiKey"])
                groups.setdefault(key, []).append(target)

        async def probe(base_url, api_key):
            started = time.monotonic()
            try:
                async with asyncio.timeout(self.cfg.provider_health_timeout_seconds):
                    result = await self.request("GET", base_url + "/models", key=api_key)
                advertised = result.get("data", result.get("models", []))
                models = sorted(
                    {
                        value
                        for entry in advertised
                        if isinstance(entry, dict)
                        for value in [entry.get("id") or entry.get("model") or entry.get("name")]
                        if isinstance(value, str) and value
                    }
                )
                resident = None
                if self.ollama.managed(base_url):
                    try:
                        async with asyncio.timeout(self.cfg.provider_health_timeout_seconds):
                            resident = await self.ollama.loaded(base_url, api_key)
                    except (APIError, TimeoutError):
                        pass  # Availability and memory residency are separate measurements.
                return {
                    "reachable": True,
                    "models": models,
                    "latencyMs": round((time.monotonic() - started) * 1000),
                    "detail": "The local model registry responded.",
                    "resident": resident,
                }
            except TimeoutError:
                return {
                    "reachable": False,
                    "models": [],
                    "latencyMs": None,
                    "detail": "The local model registry health check timed out.",
                }
            except APIError:
                return {
                    "reachable": False,
                    "models": [],
                    "latencyMs": None,
                    "detail": "The local model registry could not be reached.",
                }

        keys = list(groups)
        probes = await asyncio.gather(*(probe(*key) for key in keys))
        results = dict(zip(keys, probes, strict=True))
        checked = now_iso()
        health = []
        for target in targets:
            base_url, expected = target["baseUrl"], target["model"]
            entry = {
                "id": target["id"],
                "group": target["group"],
                "nodeId": target["nodeId"],
                "model": expected,
                "endpointHost": urlparse(base_url).netloc if base_url else "",
                "checkedAt": checked,
                "latencyMs": None,
                "advertisedModels": [],
                "loaded": None,
                "memoryBytes": None,
                "processor": None,
            }
            if not base_url or not expected:
                health.append(
                    {
                        **entry,
                        "status": "unconfigured",
                        "modelAvailable": False,
                        "detail": "No endpoint and model are configured for this slot.",
                    }
                )
                continue
            probe_result = results[(base_url.rstrip("/"), target["apiKey"])]
            advertised = probe_result["models"]
            available = expected in advertised
            resident = probe_result.get("resident")
            loaded = next(
                (m for m in (resident or []) if expected in (m.get("name"), m.get("model"))),
                None,
            )
            health.append(
                {
                    **entry,
                    "status": (
                        "online"
                        if probe_result["reachable"] and available
                        else "model_missing"
                        if probe_result["reachable"]
                        else "offline"
                    ),
                    "modelAvailable": available,
                    "loaded": loaded is not None if resident is not None else None,
                    "memoryBytes": loaded.get("size") if loaded else None,
                    "processor": ("CPU" if loaded.get("size_vram") == 0 else "GPU / shared memory")
                    if loaded and isinstance(loaded.get("size_vram"), (int, float))
                    else None,
                    "latencyMs": probe_result["latencyMs"],
                    "advertisedModels": advertised,
                    "detail": (
                        "Endpoint reachable and configured model advertised."
                        if available
                        else "Endpoint reachable, but the configured model was not advertised."
                        if probe_result["reachable"]
                        else probe_result["detail"]
                    ),
                }
            )
        return health

    @staticmethod
    def headers(key):
        return {"Authorization": f"Bearer {key}"} if key else {}

    @staticmethod
    def configured(base, model):
        if not base or not model:
            raise APIError(
                "SERVICE_NOT_CONFIGURED",
                "A required local model endpoint or model ID is not configured. Ask an administrator to complete BACKEND/.env.",
                503,
            )

    @staticmethod
    async def rejection_detail(response, subject):
        message = ""
        try:
            payload = json.loads(await response.aread())
            error = payload.get("error", payload.get("detail", ""))
            if isinstance(error, dict):
                error = error.get("message") or error.get("detail") or ""
            if isinstance(error, str):
                message = " ".join(error.split())[:240]
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        detail = f"{subject} rejected the request (HTTP {response.status_code})"
        return f"{detail}: {message}" if message else detail + "."

    async def request(self, method, url, *, key="", body=None, headers=None):
        try:
            async with self.client.stream(
                method, url, headers=headers or self.headers(key), json=body
            ) as response:
                if response.status_code >= 300:
                    raise APIError(
                        "INFERENCE_UNAVAILABLE",
                        await self.rejection_detail(response, "The configured local service"),
                        503,
                    )
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > self.cfg.provider_response_max_mb * 1024 * 1024:
                        raise APIError(
                            "INVALID_PROVIDER_RESPONSE",
                            "Local service response exceeded the configured size limit.",
                            502,
                        )
                return json.loads(data) if data else {}
        except (httpx.HTTPError, ValueError) as exc:
            raise APIError(
                "INFERENCE_UNAVAILABLE",
                "The local service could not be reached or returned an invalid response.",
                503,
            ) from exc

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
        self.configured(base, model)
        if self.ollama.managed(base):
            return await self.ollama.chat(
                base, model, key, messages, max_tokens, reasoning_effort, response_format
            )
        body = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens or self.cfg.max_output_tokens,
            "temperature": 0.1,
            "stream": False,
        }
        if reasoning_effort:
            body["reasoning_effort"] = reasoning_effort
        if response_format:
            body["response_format"] = response_format
        result = await self.request(
            "POST",
            base.rstrip("/") + "/chat/completions",
            key=key,
            body=body,
        )
        try:
            content = result["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise ValueError("empty response")
            return content, self.usage(result, messages, content)
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise APIError(
                "INVALID_PROVIDER_RESPONSE", "The model returned no usable answer.", 502
            ) from exc

    @staticmethod
    def usage(result, messages, content=""):
        tokens = result.get("usage", {}).get("total_tokens")
        if isinstance(tokens, int) and tokens >= 0:
            return tokens, False
        # Clearly flagged conservative accounting when a local provider omits usage.
        return max(
            1,
            len(json.dumps(messages, ensure_ascii=False).encode()) // 3
            + len(content.encode()) // 3,
        ), True

    async def stream_chat(
        self,
        base,
        model,
        key,
        messages,
        max_tokens=None,
        reasoning_effort=None,
    ) -> AsyncIterator[tuple[str, object]]:
        self.configured(base, model)
        stream = (
            self.ollama.stream(base, model, key, messages, max_tokens, reasoning_effort)
            if self.ollama.managed(base)
            else self._openai_stream_chat(base, model, key, messages, max_tokens, reasoning_effort)
        )
        async with aclosing(stream):
            async for item in stream:
                yield item

    async def _openai_stream_chat(
        self,
        base,
        model,
        key,
        messages,
        max_tokens=None,
        reasoning_effort=None,
    ) -> AsyncIterator[tuple[str, object]]:
        self.configured(base, model)
        body = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens or self.cfg.max_output_tokens,
            "temperature": 0.1,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if reasoning_effort:
            body["reasoning_effort"] = reasoning_effort
        try:
            async with self.client.stream(
                "POST",
                base.rstrip("/") + "/chat/completions",
                headers=self.headers(key),
                json=body,
            ) as response:
                if response.status_code >= 300:
                    raise APIError(
                        "INFERENCE_UNAVAILABLE",
                        await self.rejection_detail(response, "The configured inference worker"),
                        503,
                    )
                count = 0
                done = False
                async for line in response.aiter_lines():
                    count += len(line.encode())
                    if count > self.cfg.provider_response_max_mb * 1024 * 1024:
                        raise APIError(
                            "INVALID_PROVIDER_RESPONSE",
                            "Inference output exceeded the configured limit.",
                            502,
                        )
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if raw == "[DONE]":
                        done = True
                        break
                    payload = json.loads(raw)
                    if payload.get("error"):
                        raise APIError(
                            "INFERENCE_UNAVAILABLE",
                            "The inference worker reported a generation error.",
                            503,
                        )
                    if payload.get("usage"):
                        yield "usage", payload["usage"]
                    for choice in payload.get("choices", []):
                        content = choice.get("delta", {}).get("content")
                        if content:
                            yield "delta", content
                        if choice.get("finish_reason"):
                            done = True
                if not done:
                    raise APIError(
                        "INFERENCE_INTERRUPTED",
                        "The inference stream ended before completion. Retry this request.",
                        503,
                    )
        except (httpx.HTTPError, ValueError, TypeError, KeyError) as exc:
            raise APIError(
                "INFERENCE_UNAVAILABLE", "The local inference stream was interrupted.", 503
            ) from exc

    async def embed(self, texts):
        cfg = self.cfg
        self.configured(cfg.embedding_base_url, cfg.embedding_model)
        if self.ollama.managed(cfg.embedding_base_url):
            result = await self.ollama.embed(texts)
        else:
            result = await self.request(
                "POST",
                cfg.embedding_base_url.rstrip("/") + "/embeddings",
                key=cfg.embedding_api_key.get_secret_value(),
                body={"model": cfg.embedding_model, "input": texts},
            )
        try:
            vectors = [r["embedding"] for r in sorted(result["data"], key=lambda r: r["index"])]
            if len(vectors) != len(texts) or any(
                len(v) != cfg.embedding_dimensions
                or any(not isinstance(x, (float, int)) or not math.isfinite(x) for x in v)
                for v in vectors
            ):
                raise ValueError("embedding shape")
            return vectors, self.usage(result, texts)
        except (ValueError, TypeError, KeyError) as exc:
            raise APIError(
                "INVALID_EMBEDDING",
                "The embedding service returned an incompatible vector. Check model and dimensions.",
                502,
            ) from exc
