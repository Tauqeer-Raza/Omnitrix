from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import delete, func, select

from .bootstrap import new_user
from .db import Audit, Document, Job, LoginSession, Record, Usage, User, uid
from .domain import APIError, audit, policy, public_task, public_user
from .schemas import (
    ModelPatch,
    NodeCreate,
    NodePatch,
    PolicyPatch,
    RoutingPatch,
    UserCreate,
    UserPatch,
    patch_values,
)
from .security import current_user, password_hash, require
from .topology import orchestrator_runtime

router = APIRouter(tags=["Control plane"])


def usage_history(session, user, admin):
    end = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    day = end.replace(hour=0)
    rows = session.scalars(
        select(Usage).where(Usage.created >= (day - timedelta(days=6)).timestamp())
    ).all()
    if not admin:
        rows = [row for row in rows if row.user_id == user.id]

    def buckets(count, step, anchor, format):
        result = []
        for i in range(count - 1, -1, -1):
            start = anchor - step * i
            result.append(
                {
                    "label": start.strftime(format),
                    "tokens": sum(
                        r.tokens
                        for r in rows
                        if start.timestamp() <= r.created < (start + step).timestamp()
                    ),
                }
            )
        return result

    return {
        "usageHourly": buckets(24, timedelta(hours=1), end, "%H:%M"),
        "usageDaily": buckets(7, timedelta(days=1), day, "%d %b"),
    }


@router.get("/system/snapshot")
def snapshot(request: Request, user=Depends(current_user)):
    with request.app.state.db.read() as s:
        admin = user.data["role"] == "admin"
        users = s.scalars(select(User)).all() if admin else [s.get(User, user.id)]
        jobs = s.scalars(select(Job).where(Job.kind == "task").order_by(Job.created.desc())).all()
        jobs = [j for j in jobs if admin or j.owner_id == user.id]
        docs = [
            d.data
            for d in s.scalars(select(Document))
            if admin
            or d.owner_id == user.id
            or (d.data["knowledge"] and "knowledge" in user.data["permissions"])
        ]
        records = {
            kind: [r.data for r in s.scalars(select(Record).where(Record.kind == kind))]
            for kind in ["models", "nodes", "routing"]
        }
        active = s.scalars(select(Job).where(Job.status == "running")).all()
        records["nodes"] = [
            {
                **n,
                "activeTasks": sum(1 for j in active if j.data.get("nodeId") == n["id"]),
                "utilization": 0,
            }
            for n in records["nodes"]
        ]
        logs = (
            s.scalars(select(Audit).order_by(Audit.sequence.desc()).limit(1000)).all()
            if admin
            else []
        )
        return {
            **records,
            "orchestrator": orchestrator_runtime(request.app.state.cfg),
            "users": [public_user(s, u) for u in users],
            "tasks": [public_task(s, j) for j in jobs],
            "documents": docs,
            "audit": [a.data for a in logs],
            "settings": policy(s),
            "localRequests": s.scalar(
                select(func.count())
                .select_from(Usage)
                .where(True if admin else Usage.user_id == user.id)
            ),
            "telemetry": {
                "networkVerified": False,
                "hardwareMetricsAvailable": False,
                "mode": "live",
                **usage_history(s, user, admin),
            },
        }


@router.get("/system/providers/health")
async def provider_health(request: Request, user=Depends(require("admin"))):
    return await request.app.state.providers.health()


@router.patch("/system/settings")
def update_policy(body: PolicyPatch, request: Request, user=Depends(require("admin"))):
    with request.app.state.db.write() as s:
        row = s.get(Record, ("settings", "organization"))
        row.data = {**row.data, **patch_values(body)}
        audit(s, user, "SETTINGS_CHANGED", "Organization policy")
        return policy(s)


@router.post("/system/reconnect")
def reconnect(request: Request, user=Depends(require("admin"))):
    with request.app.state.db.write() as s:
        row = s.get(Record, ("settings", "organization"))
        row.data = {**row.data, "offline": False}
        audit(s, user, "PROCESSING_RESUMED", "Local queue")
    return {"resumed": True}


@router.get("/models")
def models(request: Request, user=Depends(require("tasks"))):
    with request.app.state.db.read() as s:
        return [m.data for m in s.scalars(select(Record).where(Record.kind == "models"))]


@router.patch("/models/{id}")
def update_model(id: str, body: ModelPatch, request: Request, user=Depends(require("admin"))):
    with request.app.state.db.write() as s:
        row = s.get(Record, ("models", id))
        if not row:
            raise APIError("NOT_FOUND", "Model not found.", 404)
        patch = patch_values(body)
        if "nodeId" in patch and not s.get(Record, ("nodes", patch["nodeId"])):
            raise APIError("VALIDATION", "Select a registered compute node.", 422)
        if patch.get("enabled") and not row.data.get("configured"):
            raise APIError(
                "MODEL_NOT_CONFIGURED",
                "Configure this model and endpoint in BACKEND/.env before enabling it.",
                422,
            )
        row.data = {**row.data, **patch}
        audit(s, user, "MODEL_UPDATED", row.data["name"])
        return row.data


@router.get("/routing")
def routes(request: Request, user=Depends(require("tasks"))):
    with request.app.state.db.read() as s:
        return [r.data for r in s.scalars(select(Record).where(Record.kind == "routing"))]


@router.patch("/routing/{id}")
def update_routing(id: str, body: RoutingPatch, request: Request, user=Depends(require("admin"))):
    with request.app.state.db.write() as s:
        row = s.get(Record, ("routing", id))
        if not row:
            raise APIError("NOT_FOUND", "Routing rule not found.", 404)
        data = {**row.data, **patch_values(body)}
        entries = [s.get(Record, ("models", data[key])) for key in ["primaryId", "fallbackId"]]
        if data["primaryId"] == data["fallbackId"] or any(
            not m or m.data["group"] != data["group"] for m in entries
        ):
            raise APIError(
                "VALIDATION",
                "Primary and fallback must be distinct models from the same group.",
                422,
            )
        row.data = data
        audit(s, user, "ROUTING_CHANGED", data["task"])
        return data


@router.post("/nodes", status_code=201)
def create_node(body: NodeCreate, request: Request, user=Depends(require("admin"))):
    id = uid("node")
    data = {"id": id, **body.model_dump(), "utilization": 0, "activeTasks": 0}
    with request.app.state.db.write() as s:
        s.add(Record(kind="nodes", id=id, data=data))
        audit(s, user, "NODE_REGISTERED", body.name)
    return data


@router.patch("/nodes/{id}")
def update_node(id: str, body: NodePatch, request: Request, user=Depends(require("admin"))):
    with request.app.state.db.write() as s:
        row = s.get(Record, ("nodes", id))
        if not row:
            raise APIError("NOT_FOUND", "Compute node not found.", 404)
        row.data = {**row.data, **patch_values(body)}
        audit(s, user, "NODE_UPDATED", row.data["name"])
        return row.data


@router.get("/users/me/allocation")
def user_allocation(request: Request, user=Depends(current_user)):
    with request.app.state.db.read() as s:
        return public_user(s, user)


@router.get("/users")
def users(request: Request, user=Depends(require("admin"))):
    with request.app.state.db.read() as s:
        return [public_user(s, u) for u in s.scalars(select(User))]


@router.post("/users", status_code=201)
def create_user(body: UserCreate, request: Request, user=Depends(require("admin"))):
    new = new_user(request.app.state.cfg, body.name, body.email, body.department, body.password)
    with request.app.state.db.write() as s:
        if s.scalar(select(User).where(User.email == new.email)):
            raise APIError("VALIDATION", "An account already uses this email.", 409)
        s.add(new)
        audit(s, user, "USER_CREATED", new.email)
        return public_user(s, new)


@router.patch("/users/{id}")
def update_user(id: str, body: UserPatch, request: Request, user=Depends(require("admin"))):
    patch = patch_values(body)
    encoded = password_hash(patch.pop("password")) if "password" in patch else None
    with request.app.state.db.write() as s:
        target = s.get(User, id)
        if not target:
            raise APIError("NOT_FOUND", "User not found.", 404)
        previous_role = target.data["role"]
        data = {**target.data, **patch}
        if id == user.id and (
            not data["enabled"] or data["role"] != "admin" or "admin" not in data["permissions"]
        ):
            raise APIError("VALIDATION", "You cannot remove your own administrative access.", 422)
        if data["role"] != "admin":
            data["permissions"] = [p for p in data["permissions"] if p != "admin"]
        target.data = data
        if encoded:
            target.password_hash = encoded
        if encoded or not data["enabled"] or data["role"] != previous_role:
            s.execute(delete(LoginSession).where(LoginSession.user_id == id))
        audit(s, user, "USER_UPDATED", target.email)
        return public_user(s, target)


@router.get("/audit")
def audits(request: Request, limit: int = 1000, user=Depends(require("admin"))):
    with request.app.state.db.read() as s:
        return [
            a.data
            for a in s.scalars(
                select(Audit).order_by(Audit.sequence.desc()).limit(max(1, min(limit, 5000)))
            )
        ]
