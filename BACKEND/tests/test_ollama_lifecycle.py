import asyncio
import json
from contextlib import aclosing

import httpx
import pytest
from conftest import PASSWORD, drain, login
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings
from app.domain import APIError
from app.main import create_app
from app.ollama import runtime_events
from app.providers import Providers
from app.worker import ORCHESTRATOR_PLAN_SCHEMA

PC = "http://pc.local/v1"
MAC = "http://mac.local/v1"


def setup_runtime(handler=None):
    cfg = Settings(
        _env_file=None,
        environment="test",
        ollama_managed_base_urls=[PC, MAC],
        orchestrator_base_url=PC,
        orchestrator_model="gemma:2b",
        text_base_url=MAC,
        text_model="text:9b",
        code_base_url=MAC,
        code_model="coder:3b",
        code_fallback_model="text:9b",
        vision_base_url=MAC,
        vision_model="vision:3b",
        embedding_base_url=MAC,
        embedding_model="embed",
        embedding_dimensions=2,
    )
    loaded = {"pc.local": set(), "mac.local": {"coder:3b"}}
    calls = []

    async def respond(request):
        body = json.loads(request.content) if request.content else {}
        host, path = request.url.host, request.url.path
        calls.append((host, path, body))
        if handler:
            override = await handler(request, body)
            if override:
                return override
        if path == "/v1/models":
            models = (
                ["gemma:2b"]
                if host == "pc.local"
                else ["text:9b", "coder:3b", "vision:3b", "embed"]
            )
            return httpx.Response(200, json={"data": [{"id": name} for name in models]})
        if path == "/api/ps":
            return httpx.Response(
                200,
                json={
                    "models": [
                        {"name": name, "size": 1000, "size_vram": 0} for name in loaded[host]
                    ]
                },
            )
        if path == "/api/generate":
            assert body["keep_alive"] == 0
            loaded[host].discard(body["model"])
            return httpx.Response(200, json={"done": True, "done_reason": "unload"})
        assert path in {"/api/chat", "/api/embed"}
        loaded[host].add(body["model"])
        if path == "/api/embed":
            return httpx.Response(200, json={"embeddings": [[1.0, 0.2]], "prompt_eval_count": 3})
        if not body.get("messages"):
            return httpx.Response(200, json={"done": True})
        if not body["stream"]:
            return httpx.Response(
                200,
                json={
                    "done": True,
                    "message": {"content": '{"type":"general"}'},
                    "prompt_eval_count": 4,
                    "eval_count": 2,
                },
            )
        return httpx.Response(
            200,
            content='{"message":{"thinking":"private","content":"Answer"},"done":false}\n{"message":{"content":"."},"done":true,"prompt_eval_count":4,"eval_count":2}\n',
        )

    return Providers(cfg, httpx.MockTransport(respond)), loaded, calls


def test_selected_specialist_unloads_and_orchestrator_stays_on_pc():
    async def run():
        providers, loaded, calls = setup_runtime()
        events = []
        token = runtime_events.set(lambda *args: events.append(args))
        try:
            await providers.ollama.prime()
            await providers.chat(
                PC,
                "gemma:2b",
                "",
                [{"role": "user", "content": "Hi"}],
                response_format={"type": "json_object"},
            )
            response = [
                item
                async for item in providers.stream_chat(
                    MAC, "text:9b", "", [{"role": "user", "content": "Hi"}], max_tokens=64
                )
            ]
            assert response == [("delta", "Answer"), ("delta", "."), ("usage", {"total_tokens": 6})]
            assert loaded == {"pc.local": {"gemma:2b"}, "mac.local": set()}
            inference = [(host, body) for host, path, body in calls if path == "/api/chat"]
            assert [body["model"] for _, body in inference] == ["gemma:2b", "gemma:2b", "text:9b"]
            assert inference[-1][1]["keep_alive"] == 0
            assert inference[-1][1]["think"] is False
            assert inference[-1][1]["options"]["num_predict"] == 64
            assert inference[1][1]["keep_alive"] == -1
            assert inference[1][1]["format"] == "json"
            assert ("model_unloaded", "text:9b", "Released text:9b from model memory.") in events
            assert not any(body.get("model") == "coder:3b" for _, body in inference)
        finally:
            runtime_events.reset(token)
            await providers.close()

    asyncio.run(run())


def test_same_mac_serializes_specialists_until_unload_finishes():
    async def run():
        started, release = asyncio.Event(), asyncio.Event()

        async def handler(request, body):
            if request.url.path == "/api/chat" and body["model"] == "text:9b":
                started.set()
                await release.wait()

        providers, _, calls = setup_runtime(handler)

        async def consume(model):
            return [
                item
                async for item in providers.stream_chat(
                    MAC, model, "", [{"role": "user", "content": "Hi"}]
                )
            ]

        try:
            first = asyncio.create_task(consume("text:9b"))
            await started.wait()
            second = asyncio.create_task(consume("coder:3b"))
            await asyncio.sleep(0)
            assert not any(
                path == "/api/chat" and body["model"] == "coder:3b" for _, path, body in calls
            )
            release.set()
            await asyncio.gather(first, second)
            operations = [(path, body.get("model")) for _, path, body in calls]
            assert operations.index(("/api/generate", "text:9b")) < operations.index(
                ("/api/chat", "coder:3b")
            )
        finally:
            await providers.close()

    asyncio.run(run())


def test_cancelled_stream_unloads_before_another_request():
    async def run():
        started = asyncio.Event()

        class Stalled(httpx.AsyncByteStream):
            async def __aiter__(self):
                started.set()
                yield b'{"message":{"content":"Partial"},"done":false}\n'
                await asyncio.Event().wait()

        async def handler(request, body):
            if request.url.path == "/api/chat":
                return httpx.Response(200, stream=Stalled())

        providers, _, calls = setup_runtime(handler)

        async def consume():
            async with aclosing(
                providers.stream_chat(MAC, "text:9b", "", [{"role": "user", "content": "Hi"}])
            ) as stream:
                async for _ in stream:
                    pass

        try:
            operation = asyncio.create_task(consume())
            await started.wait()
            operation.cancel()
            with pytest.raises(asyncio.CancelledError):
                await operation
            assert calls[-1][1:] == (
                "/api/generate",
                {"model": "text:9b", "keep_alive": 0, "stream": False},
            )
            assert not providers.ollama.locks[providers.ollama.root(MAC)].locked()
        finally:
            await providers.close()

    asyncio.run(run())


def test_failed_generation_releases_model_and_preserves_error():
    async def run():
        async def handler(request, body):
            if request.url.path == "/api/chat":
                return httpx.Response(400, json={"error": "model does not support thinking"})

        providers, _, calls = setup_runtime(handler)
        try:
            with pytest.raises(APIError, match="does not support thinking"):
                async for _ in providers.stream_chat(MAC, "coder:3b", "", []):
                    pass
            assert calls[-1][1] == "/api/generate"
        finally:
            await providers.close()

    asyncio.run(run())


def test_vision_embeddings_and_memory_health_use_same_lifecycle():
    async def run():
        providers, loaded, calls = setup_runtime()
        try:
            # Health must not generate, load, or unload anything.
            health = await providers.health()
            text = next(h for h in health if h["id"] == "fast-1")
            coder = next(h for h in health if h["id"] == "master-1")
            assert text["status"] == "online" and text["loaded"] is False
            assert coder["loaded"] is True and coder["processor"] == "CPU"
            assert all(path in {"/v1/models", "/api/ps"} for _, path, _ in calls)
            await providers.chat(
                MAC,
                "vision:3b",
                "",
                [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Read"},
                            {
                                "type": "image_url",
                                "image_url": {"url": "data:image/png;base64,YWJj"},
                            },
                        ],
                    }
                ],
            )
            image_call = next(body for _, path, body in calls if path == "/api/chat")
            assert image_call["messages"][0]["images"] == ["YWJj"]
            assert image_call["keep_alive"] == 0
            assert not loaded["mac.local"]
            vectors, usage = await providers.embed(["Hi"])
            assert vectors == [[1.0, 0.2]] and usage == (3, False)
            assert not loaded["mac.local"]
        finally:
            await providers.close()

    asyncio.run(run())


def test_task_routes_then_releases_specialist_before_completion(tmp_path):
    providers, loaded, calls = setup_runtime()
    cfg = providers.cfg.model_copy(
        update={
            "database_url": f"sqlite:///{tmp_path / 'lifecycle.sqlite'}",
            "data_dir": tmp_path / "data",
            "worker_enabled": False,
            "bootstrap_admin_password": SecretStr(PASSWORD),
        }
    )
    app = create_app(cfg, providers.client._transport)
    # No old residents: the assertion below concerns this task's final release.
    loaded["mac.local"].clear()
    with TestClient(app, headers={"origin": "http://127.0.0.1:5173"}) as client:
        login(client)
        for prompt, group, model in [
            ("Hello", "FAST", "text:9b"),
            ("Write Python code to add two numbers", "MASTER", "coder:3b"),
        ]:
            response = client.post("/api/v1/tasks", json={"prompt": prompt})
            assert response.status_code == 201, response.text
            task_id = response.json()["id"]
            drain(client, app)
            result = client.get(f"/api/v1/tasks/{task_id}").json()
            assert result["status"] == "completed", result.get("error")
            assert result["reply"] == "Answer."
            assert result["plan"]["routeGroup"] == group
            assert result["route"]["selectedModel"] == model
            assert result["tokens"] == 12
            events = [e["type"] for e in result["events"]]
            assert events.index("task_classified") < events.index("model_unloaded")
            assert events.index("model_unloaded") < events.index("task_completed")
            assert loaded == {"pc.local": {"gemma:2b"}, "mac.local": set()}
        inference = [body["model"] for _, path, body in calls if path == "/api/chat"]
        assert inference == ["gemma:2b", "text:9b", "gemma:2b", "coder:3b"]
    asyncio.run(providers.close())


@pytest.mark.parametrize(
    "prompt",
    [
        "What is programming ?",
        "What is Retrieval augmented generation ?",
        "who is jeff bezoz",
    ],
)
def test_ollama_routing_enforces_required_fields_for_concept_questions(tmp_path, prompt):
    async def handler(request, body):
        if request.url.host != "pc.local" or request.url.path != "/api/chat":
            return None
        # Reproduce Gemma's actual failure in unconstrained JSON mode; a schema enforces type.
        content = (
            '{"type":"general","use_knowledge":false}'
            if body.get("format") == ORCHESTRATOR_PLAN_SCHEMA
            else json.dumps({"prompt": prompt, "use_knowledge": True, "reason": "Explain it."})
        )
        return httpx.Response(
            200,
            json={
                "done": True,
                "message": {"content": content},
                "prompt_eval_count": 12,
                "eval_count": 8,
            },
        )

    providers, _, calls = setup_runtime(handler)
    cfg = providers.cfg.model_copy(
        update={
            "database_url": f"sqlite:///{tmp_path / 'routing.sqlite'}",
            "data_dir": tmp_path / "data",
            "worker_enabled": False,
            "bootstrap_admin_password": SecretStr(PASSWORD),
        }
    )
    app = create_app(cfg, providers.client._transport)
    try:
        with TestClient(app, headers={"origin": "http://127.0.0.1:5173"}) as client:
            login(client)
            created = client.post("/api/v1/tasks", json={"prompt": prompt}).json()
            drain(client, app)
            result = client.get(f"/api/v1/tasks/{created['id']}").json()
            assert result["status"] == "completed", result.get("error")
            assert result["reply"] == "Answer."
            assert result["plan"]["classificationSource"] == "orchestrator"
            assert result["route"]["group"] == "FAST"
            assert result["tokens"] == 26
            request = next(
                body for host, path, body in calls if host == "pc.local" and path == "/api/chat"
            )
            assert set(request["format"]["required"]) == {"type", "use_knowledge"}
            assert request["format"]["properties"]["type"]["enum"] == [
                "general",
                "document",
                "code",
            ]
            assert request["format"]["additionalProperties"] is False
            assert request["options"]["temperature"] == 0
            assert request["options"]["num_predict"] == cfg.orchestrator_max_tokens
            assert request["keep_alive"] == -1
            assert len(request["messages"]) == 1
            instructions, data = request["messages"][0]["content"].split("\nINPUT:\n", 1)
            assert "Classify a user request" in instructions
            assert json.loads(data)["prompt"] == prompt
            assert not any(
                path == "/api/chat" and body["model"] == "coder:3b" for _, path, body in calls
            )
    finally:
        asyncio.run(providers.close())
