import asyncio
import json
import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from .db import Document, Event, Job, User, uid
from .domain import (
    APIError,
    audit,
    check_quota,
    event_record,
    now_iso,
    owned,
    permitted,
    public_task,
)
from .schemas import TaskInput
from .security import current_user, require

router = APIRouter(prefix="/tasks", tags=["Tasks and conversation streams"])


@router.post("", status_code=201)
def create(body: TaskInput, request: Request, user=Depends(require("tasks"))):
    cfg, db = request.app.state.cfg, request.app.state.db
    with db.write() as s:
        user = s.get(User, user.id)
        permitted(user, "tasks")
        history = (
            s.scalars(
                select(Job)
                .where(Job.conversation_id == body.conversationId, Job.kind == "task")
                .order_by(Job.created)
            ).all()
            if body.conversationId
            else []
        )
        if body.conversationId:
            if not history:
                raise APIError("NOT_FOUND", "Conversation not found.", 404)
            owned(user, history[0].owner_id)
            if any(j.status in {"queued", "running"} for j in history):
                raise APIError(
                    "IN_PROGRESS",
                    "Wait for the current response before sending another message.",
                    409,
                )
        document_ids = list(
            dict.fromkeys(body.documentIds or (history[-1].data["documentIds"] if history else []))
        )
        for id in document_ids:
            doc = s.get(Document, id)
            if not doc:
                raise APIError("NOT_FOUND", "An attachment is unavailable.", 404)
            owned(user, doc.owner_id, "documents")
        check_quota(s, user, cfg.token_reservation)
        id = uid("tsk")
        job = Job(
            id=id,
            kind="task",
            owner_id=user.id,
            conversation_id=body.conversationId or id,
            status="queued",
            reservation=cfg.token_reservation,
            tokens=0,
            data={
                "title": body.title or body.prompt[:80],
                "prompt": body.prompt,
                "documentIds": document_ids,
                "type": "document" if document_ids else "general",
                "started": now_iso(),
                "step": -1,
                "modelId": "",
                "nodeId": "",
                "plan": None,
                "route": None,
                "scenario": "normal",
                "reply": "",
                "citations": [],
                "duration": 0,
                "executionStatus": "not_executed",
            },
        )
        s.add(job)
        s.flush()
        audit(s, user, "TASK_CREATED", job.data["title"], task_id=id)
        return public_task(s, job)


def authorized_job(session, user, id):
    job = session.get(Job, id)
    if not job or job.kind != "task":
        raise APIError("NOT_FOUND", "Task not found.", 404)
    owned(user, job.owner_id)
    return job


@router.get("/{id}")
def get(id: str, request: Request, user=Depends(require("tasks"))):
    with request.app.state.db.read() as s:
        return public_task(s, authorized_job(s, user, id))


@router.get("/{id}/events")
def events(id: str, request: Request, user=Depends(require("tasks"))):
    with request.app.state.db.read() as s:
        return public_task(s, authorized_job(s, user, id))["events"]


@router.post("/{id}/cancel", status_code=204)
def cancel(id: str, request: Request, user=Depends(require("tasks"))):
    with request.app.state.db.write() as s:
        job = authorized_job(s, user, id)
        if job.status not in {"queued", "running"}:
            raise APIError("VALIDATION", "Only active requests can be stopped.", 409)
        job.status = "failed"
        job.data = {
            **job.data,
            "error": "Request stopped by the operator.",
            "duration": int(time.time() - job.created),
        }
        event_record(s, job, "task_failed", job.data["error"], status="failed")
        audit(s, user, "TASK_CANCELLED", job.data["title"], task_id=id)


@router.post("/{id}/retry", status_code=204)
def retry(id: str, request: Request, user=Depends(require("tasks"))):
    with request.app.state.db.write() as s:
        job = authorized_job(s, user, id)
        latest = s.scalar(
            select(Job)
            .where(Job.conversation_id == job.conversation_id, Job.kind == "task")
            .order_by(Job.created.desc())
        )
        if job.status != "failed" or latest.id != id:
            raise APIError(
                "VALIDATION", "Only the latest failed or stopped message may be retried.", 409
            )
        check_quota(s, user, request.app.state.cfg.token_reservation)
        job.status, job.claim, job.created = "queued", "", time.time()
        job.reservation = job.tokens + request.app.state.cfg.token_reservation
        job.data = {
            **job.data,
            "reply": "",
            "error": None,
            "step": -1,
            "started": now_iso(),
            "duration": 0,
            "nodeId": "",
            "modelId": "",
            "plan": None,
            "route": None,
        }
        # Retain old events in SQL for audit/replay. The new attempt is explicitly marked.
        event_record(s, job, "task_retried", "A new attempt was queued.", -1)
        audit(s, user, "TASK_RETRIED", job.data["title"], task_id=id)


@router.get("/{id}/stream")
async def stream(id: str, request: Request, user=Depends(require("tasks"))):
    db = request.app.state.db
    with db.read() as s:
        authorized_job(s, user, id)
    cursor = 0
    last = request.headers.get("last-event-id") or request.query_params.get("after")
    if last:
        with db.read() as s:
            record = s.scalar(select(Event).where(Event.id == last, Event.job_id == id))
            if record:
                cursor = record.sequence

    async def generate():
        nonlocal cursor
        yield "retry: 1500\n\n"
        while not await request.is_disconnected():
            try:
                actor = current_user(
                    request
                )  # Recheck session expiry and disabled accounts while streaming.
                with db.read() as s:
                    job = authorized_job(s, actor, id)
                    events = s.scalars(
                        select(Event)
                        .where(Event.job_id == id, Event.sequence > cursor)
                        .order_by(Event.sequence)
                    ).all()
                    status = job.status
                for event in events:
                    cursor = event.sequence
                    yield f"id: {event.id}\ndata: {json.dumps(event.data)}\n\n"
                if status in {"completed", "failed"}:
                    return
                if not events:
                    yield ": keep-alive\n\n"
                await asyncio.sleep(0.5)
            except APIError:
                return

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
