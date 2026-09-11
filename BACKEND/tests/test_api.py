import io
import json
import time
import zipfile

from conftest import PASSWORD, create_operator, drain, login
from docx import Document as WordDocument
from sqlalchemy import select

from app.db import Audit, Chunk, Job, LoginSession, Usage, User
from app.security import COOKIE


def task(client, prompt="Please prepare a maintenance note", documents=None, conversation=None):
    return client.post(
        "/api/v1/tasks",
        json={
            "prompt": prompt,
            "documentIds": documents or [],
            "conversationId": conversation,
            "scenario": "normal",
        },
    )


def upload_word(client, knowledge=False):
    doc = WordDocument()
    doc.add_paragraph(
        "Valve V-42 inspection requires recorded calibration verification before review. This is the actual uploaded text."
    )
    stream = io.BytesIO()
    doc.save(stream)
    response = client.post(
        "/api/v1/documents",
        files={
            "file": (
                "inspection.docx",
                stream.getvalue(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"knowledge": str(knowledge).lower()},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_credentials_cookie_csrf_and_logout(environment):
    client, app, _, _ = environment
    assert client.get("/api/v1/system/snapshot").status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "admin@omnitrix.local", "password": "wrong"}
        ).status_code
        == 401
    )
    user = login(client)
    assert user["role"] == "admin" and user["used"] == 0
    with app.state.db.read() as s:
        row = s.get(User, user["id"])
        assert row.password_hash.startswith("$argon2id$")
        assert PASSWORD not in row.password_hash
        assert s.scalar(select(LoginSession)).digest != client.cookies[COOKIE]
    saved = client.headers.pop("x-csrf-token")
    assert task(client).status_code == 403
    client.headers["x-csrf-token"] = saved
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_bad_origins_and_throttle(environment):
    client, _, cfg, _ = environment
    assert (
        client.post(
            "/api/v1/auth/login",
            headers={"origin": "https://evil.invalid"},
            json={"email": "admin@omnitrix.local", "password": PASSWORD},
        ).status_code
        == 403
    )
    for _ in range(cfg.login_attempts):
        assert (
            client.post(
                "/api/v1/auth/login", json={"email": "nobody@local.test", "password": "bad"}
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "nobody@local.test", "password": "bad"}
        ).status_code
        == 429
    )


def test_real_streamed_answer_history_and_accounting(environment):
    client, app, _, calls = environment
    login(client)
    first = task(client).json()
    assert task(client, conversation=first["conversationId"]).status_code == 409
    drain(client, app)
    result = client.get(f"/api/v1/tasks/{first['id']}").json()
    assert result["status"] == "completed" and result["reply"].startswith("The local worker says:")
    assert result["tokens"] == 95
    assert result["plan"]["routeGroup"] == "FAST"
    assert result["plan"]["routingReason"].startswith("General conversation")
    assert result["route"]["selectedModel"] == "text-actual"
    assert result["route"]["fallback"] is False
    assert {
        event.get("planStepId") for event in result["events"] if event["type"] != "response_delta"
    } >= {"accept", "classify", "context", "route", "generate", "review", "complete"}
    assert [c[0] for c in calls] == ["orchestrator.local", "text.local"]
    assert calls[0][2]["reasoning_effort"] == "none"
    assert calls[0][2]["response_format"] == {"type": "json_object"}
    assert calls[0][2]["max_tokens"] == 96
    assert calls[1][2]["max_tokens"] == 512
    assert calls[1][2]["reasoning_effort"] == "none"
    assert client.get("/api/v1/users/me/allocation").json()["used"] == 95
    again = task(client, "Make that shorter", conversation=first["conversationId"]).json()
    drain(client, app)
    assert again["conversationId"] == first["id"]
    assert any(
        m["role"] == "assistant" and result["reply"] == m["content"]
        for m in calls[-1][2]["messages"]
    )
    stream = client.get(f"/api/v1/tasks/{first['id']}/stream")
    assert stream.status_code == 200 and "response_delta" in stream.text
    last = result["events"][-1]["id"]
    assert (
        "task_completed"
        not in client.get(
            f"/api/v1/tasks/{first['id']}/stream", headers={"last-event-id": last}
        ).text
    )
    assert client.post(f"/api/v1/tasks/{first['id']}/retry").status_code == 409
    with app.state.db.read() as s:
        assert sum(r.tokens for r in s.scalars(select(Usage))) == 190


def test_uploaded_document_embedding_retrieval_and_real_export(environment):
    client, app, _, calls = environment
    login(client)
    doc = upload_word(client)
    response = task(client, "Review calibration of the valve", [doc["id"]])
    assert response.status_code == 201
    drain(client, app)
    result = client.get("/api/v1/tasks/" + response.json()["id"]).json()
    assert result["status"] == "completed", result.get("error")
    assert result["type"] == "document" and result["citations"][0]["documentId"] == doc["id"]
    assert "actual uploaded text" in result["citations"][0]["excerpt"]
    assert any(c[0] == "embedding.local" for c in calls)
    assert "actual uploaded text" in json.dumps(calls[-1][2])
    for format, entry in [
        ("docx", "word/document.xml"),
        ("xlsx", "xl/worksheets/sheet1.xml"),
        ("pptx", "ppt/slides/slide2.xml"),
    ]:
        export = client.get(f"/api/v1/tasks/{result['id']}/outputs/{format}")
        assert export.status_code == 200, export.text[:200]
        with zipfile.ZipFile(io.BytesIO(export.content)) as archive:
            assert b"local worker says" in archive.read(entry)
    pdf = client.get(f"/api/v1/tasks/{result['id']}/outputs/pdf")
    assert pdf.content.startswith(b"%PDF-")
    assert client.get(f"/api/v1/documents/{doc['id']}/file").content.startswith(b"PK")


def test_vision_and_code_specialists(environment):
    from PIL import Image

    client, app, _, calls = environment
    login(client)
    image = io.BytesIO()
    Image.new("RGB", (60, 60), "white").save(image, "PNG")
    doc = client.post(
        "/api/v1/documents", files={"file": ("scan.png", image.getvalue(), "image/png")}
    ).json()
    result = task(client, "Review this scan", [doc["id"]]).json()
    drain(client, app)
    assert client.get("/api/v1/tasks/" + result["id"]).json()["status"] == "completed"
    assert any(c[0] == "vision.local" for c in calls)
    code = task(client, "Write python to validate an input").json()
    drain(client, app)
    result = client.get("/api/v1/tasks/" + code["id"]).json()
    assert result["type"] == "code" and "print(" in result["code"]
    assert result["executionStatus"] == "not_executed"
    assert calls[-1][0] == "code.local"
    assert calls[-1][2]["max_tokens"] == 1024
    assert "reasoning_effort" not in calls[-1][2]


def test_explicit_code_request_overrides_incorrect_general_plan(environment, monkeypatch):
    client, app, _, calls = environment
    login(client)

    async def incorrect_general_plan(*args, **kwargs):
        return (
            json.dumps(
                {
                    "type": "general",
                    "use_knowledge": False,
                    "reason": "General request.",
                }
            ),
            (20, False),
        )

    monkeypatch.setattr(app.state.providers, "chat", incorrect_general_plan)
    created = task(client, "Write a code to add two numbers in python").json()
    drain(client, app)
    result = client.get("/api/v1/tasks/" + created["id"]).json()

    assert result["status"] == "completed"
    assert result["type"] == "code"
    assert result["plan"]["classificationSource"] == "control_plane_guardrail"
    assert result["plan"]["orchestratorType"] == "general"
    assert result["plan"]["routeGroup"] == "MASTER"
    assert result["route"]["selectedModel"] == "code-actual"
    assert calls[-1][0] == "code.local"

    ordinary = task(client, "Show me the employee code of conduct").json()
    drain(client, app)
    ordinary_result = client.get("/api/v1/tasks/" + ordinary["id"]).json()
    assert ordinary_result["type"] == "general"
    assert ordinary_result["route"]["group"] == "FAST"


def test_plan_normalization_and_malformed_code_recovery(environment, monkeypatch):
    from app.worker import parse_orchestrator_plan

    normalized = parse_orchestrator_plan(
        '<think>Classifying</think>\n```json\n{"type":"Programming",'
        '"useKnowledge":"false","reason":null,"extra":"ignored"}\n```'
    )
    assert normalized.type == "code"
    assert normalized.use_knowledge is False

    client, app, _, calls = environment
    login(client)

    async def truncated_plan(*args, **kwargs):
        return '{"type":"code","use_knowledge":false,"reason":"Code request', (20, False)

    monkeypatch.setattr(app.state.providers, "chat", truncated_plan)
    created = task(client, "Write a code to print numbers from 1 to 450 in python").json()
    drain(client, app)
    result = client.get("/api/v1/tasks/" + created["id"]).json()

    assert result["status"] == "completed"
    assert result["type"] == "code"
    assert result["plan"]["classificationSource"] == "control_plane_recovery"
    assert result["plan"]["orchestratorType"] is None
    assert result["route"]["group"] == "MASTER"
    assert calls[-1][0] == "code.local"


def test_user_isolation_and_server_enforced_admin(environment):
    client, app, _, _ = environment
    admin = login(client)
    operator = create_operator(client)
    private = upload_word(client)
    admin_task = task(client).json()
    login(client, operator["email"])
    assert client.get("/api/v1/users").status_code == 403
    assert client.get("/api/v1/audit").status_code == 403
    assert client.patch("/api/v1/models/fast-1", json={"enabled": False}).status_code == 403
    assert client.get("/api/v1/tasks/" + admin_task["id"]).status_code == 404
    assert client.get("/api/v1/tasks/" + admin_task["id"] + "/stream").status_code == 404
    assert client.get("/api/v1/documents/" + private["id"] + "/file").status_code == 404
    assert task(client, documents=[private["id"]]).status_code == 404
    assert task(client, conversation=admin_task["id"]).status_code == 404
    snapshot = client.get("/api/v1/system/snapshot").json()
    assert snapshot["tasks"] == [] and snapshot["documents"] == [] and snapshot["audit"] == []
    assert [u["id"] for u in snapshot["users"]] == [operator["id"]]
    assert "password" not in json.dumps(snapshot).lower()
    login(client)
    assert client.patch("/api/v1/users/" + admin["id"], json={"enabled": False}).status_code == 422
    assert client.patch("/api/v1/users/" + operator["id"], json={"used": 0}).status_code == 422


def test_shared_knowledge_search_and_revoked_access(environment):
    client, app, _, _ = environment
    login(client)
    operator = create_operator(client)
    shared = upload_word(client, knowledge=True)
    drain(client, app)
    login(client, operator["email"])
    results = client.get("/api/v1/knowledge/search?q=calibration").json()
    assert results[0]["document"]["id"] == shared["id"]
    assert client.get(f"/api/v1/documents/{shared['id']}/file").status_code == 200
    assert client.delete(f"/api/v1/documents/{shared['id']}").status_code == 404


def test_quota_reservations_cancel_and_retry(environment):
    client, app, cfg, _ = environment
    admin = login(client)
    client.patch("/api/v1/users/" + admin["id"], json={"dailyLimit": cfg.token_reservation})
    first = task(client).json()
    assert task(client).status_code == 429
    assert client.post("/api/v1/tasks/" + first["id"] + "/cancel").status_code == 204
    assert client.post("/api/v1/tasks/" + first["id"] + "/retry").status_code == 204
    drain(client, app)
    assert client.get("/api/v1/tasks/" + first["id"]).json()["status"] == "completed"
    assert client.get("/api/v1/users/me/allocation").json()["used"] == 95


def test_unconfigured_provider_fails_without_fabricated_result(environment):
    client, app, cfg, _ = environment
    login(client)
    cfg.orchestrator_model = ""
    created = task(client).json()
    drain(client, app)
    result = client.get("/api/v1/tasks/" + created["id"]).json()
    assert result["status"] == "failed" and "not configured" in result["error"]
    assert result["reply"] == "" and result["tokens"] == 0
    assert client.get(f"/api/v1/tasks/{created['id']}/outputs/pdf").status_code == 409


def test_routing_changes_and_disabled_model_fallback(environment):
    client, app, _, calls = environment
    login(client)
    assert (
        client.patch("/api/v1/routing/route-fast", json={"primaryId": "vision-1"}).status_code
        == 422
    )
    assert client.patch("/api/v1/models/fast-1", json={"enabled": False}).status_code == 200
    created = task(client).json()
    drain(client, app)
    result = client.get("/api/v1/tasks/" + created["id"]).json()
    assert result["modelId"] == "fast-2" and result["status"] == "completed"
    assert calls[-1][2]["model"] == "text-fallback"


def test_invalid_files_and_document_lifecycle(environment):
    client, app, _, _ = environment
    login(client)
    assert (
        client.post("/api/v1/documents", files={"file": ("file.pdf", b"not a PDF")}).status_code
        == 422
    )
    assert client.post("/api/v1/documents", files={"file": ("run.exe", b"MZ")}).status_code == 422
    assert client.post("/api/v1/documents", files={"file": ("empty.pdf", b"")}).status_code == 422
    doc = upload_word(client)
    assert client.delete("/api/v1/documents/" + doc["id"]).status_code == 409
    drain(client, app)
    assert client.delete("/api/v1/documents/" + doc["id"]).status_code == 204
    assert client.get("/api/v1/documents/" + doc["id"] + "/file").status_code == 404
    with app.state.db.read() as s:
        assert not s.scalars(select(Chunk).where(Chunk.document_id == doc["id"])).all()


def test_expired_job_recovery_and_persistent_state(environment):
    client, app, _, _ = environment
    login(client)
    created = task(client).json()
    with app.state.db.write() as s:
        job = s.get(Job, created["id"])
        job.status = "running"
        job.lease_until = time.time() - 1
    app.state.worker.claim()
    assert client.get("/api/v1/tasks/" + created["id"]).json()["status"] == "failed"
    with app.state.db.read() as s:
        assert any(a.data["action"] == "LEASE_EXPIRED" for a in s.scalars(select(Audit)))


def test_health_and_openapi_match_frontend(environment):
    client, _, _, _ = environment
    assert client.get("/health/live").json()["status"] == "ok"
    assert client.get("/health/ready").json()["inferenceConfigured"] is True
    schema = client.get("/api/v1/openapi.json").json()
    for path in [
        "/tasks",
        "/auth/login",
        "/models/{id}",
        "/routing/{id}",
        "/users",
        "/documents",
        "/system/snapshot",
        "/system/providers/health",
    ]:
        assert "/api/v1" + path in schema["paths"]


def test_runtime_model_identity_and_provider_health(environment):
    client, app, cfg, _ = environment
    login(client)
    snapshot = client.get("/api/v1/system/snapshot").json()
    models = {model["id"]: model for model in snapshot["models"]}
    assert snapshot["orchestrator"]["model"] == "router-2b"
    assert models["fast-1"]["name"] == "text-actual"
    assert models["fast-1"]["configured"] is True
    assert models["vision-2"]["configured"] is False
    assert models["vision-2"]["enabled"] is False

    response = client.get("/api/v1/system/providers/health")
    assert response.status_code == 200
    health = {entry["id"]: entry for entry in response.json()}
    assert health["orchestrator"]["status"] == "online"
    assert health["fast-1"]["modelAvailable"] is True
    assert health["vision-1"]["status"] == "online"
    assert health["vision-2"]["status"] == "unconfigured"

    rejected = client.patch("/api/v1/models/vision-2", json={"enabled": True})
    assert rejected.status_code == 422
    assert rejected.json()["code"] == "MODEL_NOT_CONFIGURED"

    from app.bootstrap import seed_registry

    cfg.vision_fallback_model = "vision-fallback"
    seed_registry(app.state.db, cfg)
    refreshed = client.get("/api/v1/system/snapshot").json()
    newly_configured = next(model for model in refreshed["models"] if model["id"] == "vision-2")
    assert newly_configured["configured"] is True
    assert newly_configured["enabled"] is True
