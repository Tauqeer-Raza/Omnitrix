import asyncio
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, select

from .db import Chunk, Document, Job, User, uid
from .documents import MIME, extract, safe_path
from .domain import APIError, audit, check_quota, now_iso, owned, permitted
from .security import require

router = APIRouter(tags=["Documents and local knowledge"])


def access(user, doc):
    if not doc:
        raise APIError("NOT_FOUND", "Document not found.", 404)
    if doc.data["knowledge"]:
        permitted(user, "knowledge")
    else:
        owned(user, doc.owner_id, "documents")


@router.post("/documents", status_code=201)
async def upload(
    request: Request,
    file: UploadFile = File(...),
    knowledge: bool = Form(False),
    user=Depends(require("documents")),
):
    cfg, db = request.app.state.cfg, request.app.state.db
    permitted(user, "knowledge" if knowledge else "documents")
    name = Path((file.filename or "").replace("\\", "/")).name[:200]
    kind = name.rsplit(".", 1)[-1].upper()
    if kind not in MIME:
        raise APIError("FILE_TYPE", "Supported files: PDF, PNG, JPG and DOCX.", 422)
    id = uid("doc")
    filename = id + "." + kind.lower()
    path = safe_path(cfg, filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    try:
        with path.open("xb") as target:
            while content := await file.read(1024 * 1024):
                size += len(content)
                if size > cfg.max_upload_mb * 1024 * 1024:
                    raise APIError(
                        "FILE_SIZE", f"Files must be smaller than {cfg.max_upload_mb} MB.", 413
                    )
                target.write(content)
        if size == 0:
            raise APIError("EMPTY_FILE", "This file is empty.", 422)
        pages = await asyncio.to_thread(extract, path, kind, cfg)
        data = {
            "id": id,
            "name": name,
            "type": kind,
            "size": size,
            "pages": len(pages),
            "chunks": 0,
            "status": "processing",
            "updated": now_iso(),
            "ownerId": user.id,
            "source": "upload",
            "knowledge": knowledge,
        }
        with db.write() as s:
            user = s.get(User, user.id)
            permitted(user, "knowledge" if knowledge else "documents")
            check_quota(s, user, cfg.token_reservation)
            s.add(Document(id=id, owner_id=user.id, path=filename, data=data))
            s.add(
                Job(
                    id=uid("index"),
                    kind="index",
                    owner_id=user.id,
                    conversation_id="",
                    status="queued",
                    reservation=cfg.token_reservation,
                    tokens=0,
                    data={"documentId": id, "knowledge": knowledge},
                )
            )
            audit(s, user, "DOCUMENT_UPLOADED", name)
        return data
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@router.get("/documents")
def documents(request: Request, user=Depends(require("documents"))):
    with request.app.state.db.read() as s:
        return [
            d.data
            for d in s.scalars(select(Document))
            if user.data["role"] == "admin"
            or d.owner_id == user.id
            or (d.data["knowledge"] and "knowledge" in user.data["permissions"])
        ]


@router.get("/documents/{id}/file")
def original(id: str, request: Request, user=Depends(require("documents"))):
    with request.app.state.db.read() as s:
        doc = s.get(Document, id)
        access(user, doc)
        path = safe_path(request.app.state.cfg, doc.path)
        if not path.is_file():
            raise APIError("NOT_FOUND", "The original file is unavailable.", 404)
        return FileResponse(
            path,
            media_type=MIME[doc.data["type"]],
            filename=doc.data["name"],
            content_disposition_type="inline",
            headers={"X-Content-Type-Options": "nosniff"},
        )


@router.delete("/documents/{id}", status_code=204)
async def remove(id: str, request: Request, user=Depends(require("documents"))):
    db = request.app.state.db
    with db.write() as s:
        doc = s.get(Document, id)
        if not doc:
            raise APIError("NOT_FOUND", "Document not found.", 404)
        owned(user, doc.owner_id, "knowledge" if doc.data["knowledge"] else "documents")
        jobs = s.scalars(select(Job).where(Job.status.in_(["queued", "running"]))).all()
        if any(id in j.data.get("documentIds", []) or j.data.get("documentId") == id for j in jobs):
            raise APIError("IN_USE", "A running workflow is using this document.", 409)
        path = safe_path(request.app.state.cfg, doc.path)
        s.execute(delete(Chunk).where(Chunk.document_id == id))
        audit(s, user, "DOCUMENT_REMOVED", doc.data["name"])
        s.delete(doc)
    # SQL ACL and existence checks immediately exclude deleted documents even if vector cleanup fails.
    try:
        await request.app.state.retrieval.remove(id)
    except APIError:
        with db.write() as s:
            audit(s, user, "VECTOR_CLEANUP_PENDING", id, "info")
    path.unlink(missing_ok=True)


@router.post("/documents/{id}/reindex", status_code=202)
def reindex(id: str, request: Request, user=Depends(require("documents"))):
    cfg = request.app.state.cfg
    with request.app.state.db.write() as s:
        doc = s.get(Document, id)
        if not doc:
            raise APIError("NOT_FOUND", "Document not found.", 404)
        owned(user, doc.owner_id, "knowledge" if doc.data["knowledge"] else "documents")
        if doc.data["status"] == "processing":
            raise APIError("IN_PROGRESS", "This file is already being indexed.", 409)
        if any(
            id in j.data.get("documentIds", [])
            for j in s.scalars(select(Job).where(Job.status.in_(["queued", "running"])))
        ):
            raise APIError(
                "IN_USE", "Stop workflows using this document before reindexing it.", 409
            )
        check_quota(s, user, cfg.token_reservation)
        doc.data = {**doc.data, "status": "processing", "error": None}
        s.add(
            Job(
                id=uid("index"),
                kind="index",
                owner_id=user.id,
                conversation_id="",
                status="queued",
                reservation=cfg.token_reservation,
                tokens=0,
                data={"documentId": id, "knowledge": doc.data["knowledge"]},
            )
        )
        audit(s, user, "DOCUMENT_REINDEX_QUEUED", doc.data["name"])
        return doc.data


@router.post("/documents/sample")
def sample(request: Request, user=Depends(require("documents"))):
    raise APIError(
        "DEMO_ONLY",
        "Sample documents belong to the frontend demo. Upload a real file to this backend.",
        404,
    )


@router.get("/knowledge/search")
async def search(
    request: Request,
    q: str = Query(min_length=1, max_length=1000),
    user=Depends(require("knowledge")),
):
    cfg, db = request.app.state.cfg, request.app.state.db
    id = uid("search")
    with db.write() as s:
        check_quota(s, user, cfg.token_reservation)
        s.add(
            Job(
                id=id,
                kind="search",
                owner_id=user.id,
                conversation_id="",
                status="running",
                lease_until=time.time() + cfg.worker_lease_seconds + cfg.provider_timeout_seconds,
                reservation=cfg.token_reservation,
                tokens=0,
                data={},
            )
        )
    status = "failed"
    try:
        result = await request.app.state.retrieval.search(
            q, user, charge=lambda n, e, service: request.app.state.worker.charge(id, n, e, service)
        )
        status = "completed"
        return result
    finally:
        with db.write() as s:
            s.get(Job, id).status = status
            audit(
                s,
                user,
                "KNOWLEDGE_SEARCH",
                f"{len(q)}-character query",
                "success" if status == "completed" else "failed",
            )
