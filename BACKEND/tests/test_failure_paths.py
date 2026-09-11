import asyncio
import io
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from conftest import drain, login
from sqlalchemy import select
from test_api import task, upload_word

from app.db import Chunk, LoginSession, User
from app.domain import APIError


def test_runtime_fallback_before_output(environment, monkeypatch):
    client, app, _, calls = environment
    login(client)
    original = app.state.providers.stream_chat

    async def fail_primary(base, model, key, messages, **options):
        if model == "text-actual":
            raise APIError("INFERENCE_UNAVAILABLE", "Worker unavailable", 503)
        async for item in original(base, model, key, messages, **options):
            yield item

    monkeypatch.setattr(app.state.providers, "stream_chat", fail_primary)
    created = task(client).json()
    drain(client, app)
    result = client.get("/api/v1/tasks/" + created["id"]).json()
    assert result["status"] == "completed" and result["modelId"] == "fast-2"
    assert result["tokens"] == 95
    assert calls[-1][2]["model"] == "text-fallback"
    assert any(e["type"] == "model_retry" for e in result["events"])


def test_exhausted_fallback_preserves_provider_error(environment, monkeypatch):
    client, app, _, _ = environment
    login(client)
    attempts = []

    async def reject_all(base, model, key, messages, **options):
        attempts.append(model)
        raise APIError(
            "INFERENCE_UNAVAILABLE",
            "The configured inference worker rejected the request (HTTP 400): model does not support thinking",
            503,
        )
        yield  # pragma: no cover - makes this an async generator

    monkeypatch.setattr(app.state.providers, "stream_chat", reject_all)
    created = task(client).json()
    drain(client, app)
    result = client.get("/api/v1/tasks/" + created["id"]).json()

    assert result["status"] == "failed"
    assert "HTTP 400" in result["error"]
    assert "does not support thinking" in result["error"]
    assert attempts == ["text-actual", "text-fallback"]


def test_partial_failure_keeps_output_without_mixing_fallback(environment, monkeypatch):
    client, app, _, _ = environment
    login(client)
    attempts = []

    async def partial(base, model, key, messages, **options):
        attempts.append(model)
        yield "delta", "A partial response from the primary worker."
        raise APIError("INFERENCE_INTERRUPTED", "Connection ended", 503)

    monkeypatch.setattr(app.state.providers, "stream_chat", partial)
    created = task(client).json()
    drain(client, app)
    result = client.get("/api/v1/tasks/" + created["id"]).json()
    assert result["status"] == "failed" and result["reply"].startswith("A partial response")
    assert attempts == ["text-actual"] and result["tokens"] > 20


def test_cancel_interrupts_waiting_provider_and_releases_worker(environment, monkeypatch):
    client, app, _, _ = environment
    login(client)
    started = threading.Event()
    stopped = threading.Event()
    original = app.state.providers.stream_chat

    async def blocked(*args, **kwargs):
        started.set()
        try:
            await asyncio.Event().wait()
            yield "delta", "Unreachable"
        finally:
            stopped.set()

    monkeypatch.setattr(app.state.providers, "stream_chat", blocked)
    created = task(client).json()
    entry = app.state.worker.claim()
    future = client.portal.start_task_soon(app.state.worker.process, *entry)
    assert started.wait(3)
    assert client.post("/api/v1/tasks/" + created["id"] + "/cancel").status_code == 204
    future.result(timeout=3)
    assert stopped.is_set()
    assert client.get("/api/v1/tasks/" + created["id"]).json()["status"] == "failed"
    monkeypatch.setattr(app.state.providers, "stream_chat", original)
    next_task = task(client).json()
    drain(client, app)
    assert client.get("/api/v1/tasks/" + next_task["id"]).json()["status"] == "completed"


def test_concurrent_admission_cannot_double_spend_reservation(environment):
    client, _, cfg, _ = environment
    admin = login(client)
    client.patch("/api/v1/users/" + admin["id"], json={"dailyLimit": cfg.token_reservation})
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda _: task(client).status_code, range(2)))
    assert sorted(statuses) == [201, 429]


def test_permission_revoked_during_classification_stops_dispatch(environment, monkeypatch):
    client, app, _, calls = environment
    admin = login(client)
    original = app.state.providers.chat

    async def revoke(*args, **kwargs):
        result = await original(*args, **kwargs)
        with app.state.db.write() as s:
            user = s.get(User, admin["id"])
            user.data = {
                **user.data,
                "permissions": [p for p in user.data["permissions"] if p != "code"],
            }
        return result

    monkeypatch.setattr(app.state.providers, "chat", revoke)
    created = task(client, "Write python").json()
    drain(client, app)
    result = client.get("/api/v1/tasks/" + created["id"]).json()
    assert result["status"] == "failed" and result["tokens"] == 20
    assert [c[0] for c in calls] == ["orchestrator.local"]


def test_password_whitespace_and_session_expiry(environment):
    client, app, _, _ = environment
    login(client)
    password = "  spaces-are-significant  "
    response = client.post(
        "/api/v1/users",
        json={
            "name": "Spaces",
            "email": "spaces@local.test",
            "department": "Operations",
            "password": password,
        },
    )
    assert response.status_code == 201
    assert login(client, "spaces@local.test", password)["name"] == "Spaces"
    with app.state.db.write() as s:
        for session in s.scalars(select(LoginSession)):
            session.expires = time.time() - 1
    assert client.get("/api/v1/auth/me").status_code == 401


def test_invalid_orchestrator_plan_is_not_silently_guessed(environment, monkeypatch):
    client, app, _, _ = environment
    login(client)

    async def invalid(*args, **kwargs):
        return '{"type":"shell_execution"}', (20, False)

    monkeypatch.setattr(app.state.providers, "chat", invalid)
    created = task(client).json()
    drain(client, app)
    result = client.get("/api/v1/tasks/" + created["id"]).json()
    assert result["status"] == "failed" and "invalid plan" in result["error"]
    assert result["tokens"] == 20 and result["reply"] == ""


def test_qdrant_filter_and_sql_acl_recheck(environment, monkeypatch):
    client, app, cfg, _ = environment
    login(client)
    shared = upload_word(client, knowledge=True)
    private = upload_word(client)
    drain(client, app)
    with app.state.db.read() as s:
        good = s.scalar(select(Chunk).where(Chunk.document_id == shared["id"]))
        bad = s.scalar(select(Chunk).where(Chunk.document_id == private["id"]))
    cfg.vector_store = "qdrant"
    requests = []

    async def qrequest(method, path, body=None):
        requests.append(body)
        return {
            "result": {
                "points": [
                    {"score": 0.9, "payload": {"chunk_id": good.id}},
                    {"score": 1, "payload": {"chunk_id": bad.id}},
                ]
            }
        }

    monkeypatch.setattr(app.state.retrieval, "qrequest", qrequest)
    result = client.get("/api/v1/knowledge/search?q=calibration").json()
    assert [r["document"]["id"] for r in result] == [shared["id"]]
    assert requests[0]["filter"]["must"][0]["match"]["any"] == [shared["id"]]
    # UTC chart totals come from persisted usage, including indexing and search.
    snapshot = client.get("/api/v1/system/snapshot").json()
    assert (
        sum(p["tokens"] for p in snapshot["telemetry"]["usageHourly"])
        == snapshot["users"][0]["used"]
    )


def test_librarian_disablement_and_billable_search_csrf(environment):
    client, app, _, _ = environment
    login(client)
    document = upload_word(client, knowledge=True)
    drain(client, app)
    csrf = client.headers.pop("x-csrf-token")
    assert client.get("/api/v1/knowledge/search?q=valve").status_code == 403
    client.headers["x-csrf-token"] = csrf
    assert client.patch("/api/v1/models/librarian-1", json={"enabled": False}).status_code == 200
    assert client.get("/api/v1/knowledge/search?q=valve").status_code == 503
    assert client.patch("/api/v1/models/librarian-1", json={"enabled": True}).status_code == 200
    assert (
        client.get("/api/v1/knowledge/search?q=valve").json()[0]["document"]["id"] == document["id"]
    )


def test_scanned_pdf_is_rendered_and_sent_to_vision(environment):
    from reportlab.pdfgen.canvas import Canvas

    client, app, _, calls = environment
    login(client)
    output = io.BytesIO()
    canvas = Canvas(output)
    canvas.rect(40, 40, 100, 100)
    canvas.showPage()
    canvas.save()
    response = client.post(
        "/api/v1/documents", files={"file": ("scan.pdf", output.getvalue(), "application/pdf")}
    )
    assert response.status_code == 201
    drain(client, app)
    documents = client.get("/api/v1/documents").json()
    assert documents[0]["status"] == "indexed"
    assert any(c[0] == "vision.local" and "data:image/jpeg;base64," in str(c[2]) for c in calls)
