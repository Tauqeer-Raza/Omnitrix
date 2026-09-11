import time
from datetime import UTC, datetime

from sqlalchemy import select

from .db import Audit, Event, Job, Record, Usage, User, uid

PERMISSIONS = ["documents", "knowledge", "code", "tasks", "audit", "admin"]
GROUPS = ["MASTER", "VISION", "FAST", "LIBRARIAN"]


class APIError(Exception):
    def __init__(self, code, detail, status=400):
        self.code, self.detail, self.status = code, detail, status
        super().__init__(detail)


def now_iso():
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def policy(session):
    return {
        k: v for k, v in session.get(Record, ("settings", "organization")).data.items() if k != "id"
    }


def permitted(user, permission):
    if not user or not user.data["enabled"]:
        raise APIError("UNAUTHENTICATED", "Please sign in again.", 401)
    if permission not in user.data["permissions"] or (
        permission == "admin" and user.data["role"] != "admin"
    ):
        raise APIError("FORBIDDEN", "Your account does not have permission for this action.", 403)


def owned(user, owner_id, permission="tasks"):
    permitted(user, permission)
    if user.id != owner_id and user.data["role"] != "admin":
        raise APIError("NOT_FOUND", "This resource is unavailable.", 404)


def audit(session, user, action, resource, status="success", task_id=None):
    session.add(
        Audit(
            actor_id=user.id if user else "",
            data={
                "id": uid("aud"),
                "timestamp": now_iso(),
                "actorId": user.id if user else "",
                "actor": user.data["name"] if user else "System",
                "action": action,
                "resource": str(resource)[:300],
                "status": status,
                "taskId": task_id,
            },
        )
    )


def event_record(session, job, kind, message, step=None, status="running", **extra):
    row = {
        "id": uid("evt"),
        "taskId": job.id,
        "type": kind,
        "step": kind,
        "status": status,
        "message": message,
        "timestamp": now_iso(),
        **extra,
    }
    session.add(Event(id=row["id"], job_id=job.id, data=row))
    data = dict(job.data)
    if step is not None:
        data["step"] = step
    job.data = data
    return row


def allocation(session, user):
    now = datetime.now(UTC)
    day = now.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp()
    usage = session.scalars(
        select(Usage).where(Usage.user_id == user.id, Usage.created >= month)
    ).all()
    return {
        "used": sum(u.tokens for u in usage if u.created >= day),
        "monthlyUsed": sum(u.tokens for u in usage),
    }


def public_user(session, user):
    return {**user.data, "id": user.id, "email": user.email, **allocation(session, user)}


def public_task(session, job):
    return {
        **job.data,
        "id": job.id,
        "ownerId": job.owner_id,
        "conversationId": job.conversation_id,
        "status": job.status,
        "tokens": job.tokens,
        "events": [
            e.data
            for e in session.scalars(
                select(Event).where(Event.job_id == job.id).order_by(Event.sequence)
            )
        ],
        "duration": int(time.time() - job.created)
        if job.status == "running"
        else job.data.get("duration", 0),
    }


def check_quota(session, user, reservation):
    users = session.scalars(select(User)).all()
    amounts = {u.id: allocation(session, u) for u in users}
    reserved = {u.id: 0 for u in users}
    for job in session.scalars(select(Job).where(Job.status.in_(["queued", "running"]))):
        reserved[job.owner_id] += max(0, job.reservation - job.tokens)
    org = policy(session)
    day = amounts[user.id]["used"] + reserved[user.id] + reservation
    month = amounts[user.id]["monthlyUsed"] + reserved[user.id] + reservation
    department = [u.id for u in users if u.data["department"] == user.data["department"]]
    if (
        day > user.data["dailyLimit"]
        or month > user.data["monthlyLimit"]
        or sum(a["used"] for a in amounts.values()) + sum(reserved.values()) + reservation
        > org["dailyLimit"]
        or sum(a["monthlyUsed"] for a in amounts.values()) + sum(reserved.values()) + reservation
        > org["monthlyLimit"]
        or sum(amounts[i]["used"] + reserved[i] for i in department) + reservation
        > org["departmentLimits"].get(user.data["department"], float("inf"))
    ):
        raise APIError(
            "RESOURCE_LIMIT",
            "Your available token allocation cannot accept this request. Contact your administrator.",
            429,
        )
