import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

PASSWORD = "test-only-passphrase-2026"


@pytest.fixture
def environment(tmp_path):
    calls = []

    def respond(request):
        if request.method == "GET" and request.url.path.endswith("/models"):
            available = {
                "orchestrator.local": ["router-2b"],
                "text.local": ["text-actual", "text-fallback"],
                "vision.local": ["vision-actual"],
                "code.local": ["code-actual"],
                "embedding.local": ["embedding-actual"],
            }[request.url.host]
            calls.append((request.url.host, request.url.path, None))
            return httpx.Response(
                200,
                json={"data": [{"id": model} for model in available]},
            )
        body = json.loads(request.content)
        calls.append((request.url.host, request.url.path, body))
        if request.url.path.endswith("/embeddings"):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"index": i, "embedding": [1.0, 0.1, 0.2]}
                        for i in range(len(body["input"]))
                    ],
                    "usage": {"total_tokens": 25},
                },
            )
        if request.url.host == "orchestrator.local":
            prompt = json.loads(body["messages"][-1]["content"].split("\nINPUT:\n", 1)[-1])
            kind = (
                "code"
                if "python" in prompt["prompt"].lower()
                else "document"
                if prompt["attachments"]
                else "general"
            )
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps(
                                    {"type": kind, "use_knowledge": "SOP" in prompt["prompt"]}
                                )
                            }
                        }
                    ],
                    "usage": {"total_tokens": 20},
                },
            )
        if not body.get("stream"):
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": "Actual OCR fixture: valve V-42 requires recorded calibration verification."
                            }
                        }
                    ],
                    "usage": {"total_tokens": 40},
                },
            )
        answer = (
            '```python\nprint("local result")\n```\nReview before use.'
            if request.url.host == "code.local"
            else "The local worker says: verify valve V-42 calibration. [inspection.docx, page 1]"
        )
        parts = [answer[:25], answer[25:]]
        stream = "".join(
            "data: "
            + json.dumps({"choices": [{"delta": {"content": part}, "finish_reason": None}]})
            + "\n\n"
            for part in parts
        )
        stream += (
            "data: "
            + json.dumps({"choices": [], "usage": {"total_tokens": 75}})
            + "\n\ndata: [DONE]\n\n"
        )
        return httpx.Response(
            200, headers={"content-type": "text/event-stream"}, content=stream.encode()
        )

    cfg = Settings(
        _env_file=None,
        environment="test",
        data_dir=tmp_path / "data",
        database_url=f"sqlite:///{tmp_path / 'db.sqlite'}",
        worker_enabled=False,
        bootstrap_admin_password=PASSWORD,
        embedding_dimensions=3,
        orchestrator_base_url="http://orchestrator.local/v1",
        orchestrator_model="router-2b",
        text_base_url="http://text.local/v1",
        text_model="text-actual",
        text_fallback_model="text-fallback",
        vision_base_url="http://vision.local/v1",
        vision_model="vision-actual",
        code_base_url="http://code.local/v1",
        code_model="code-actual",
        embedding_base_url="http://embedding.local/v1",
        embedding_model="embedding-actual",
    )
    app = create_app(cfg, httpx.MockTransport(respond))
    with TestClient(app, headers={"origin": "http://127.0.0.1:5173"}) as client:
        yield client, app, cfg, calls


def login(client, email="admin@omnitrix.local", password=PASSWORD):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    client.headers["x-csrf-token"] = client.cookies["omnitrix_csrf"]
    return response.json()["user"]


def create_operator(client, email="engineer@omnitrix.local"):
    response = client.post(
        "/api/v1/users",
        json={"name": "Engineer", "email": email, "department": "Operations", "password": PASSWORD},
    )
    assert response.status_code == 201, response.text
    return response.json()


def drain(client, app):
    for _ in range(20):
        entry = app.state.worker.claim()
        if not entry:
            return
        client.portal.call(app.state.worker.process, *entry)
    raise AssertionError("Queue did not drain")
