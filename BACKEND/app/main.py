import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from . import exports, routes_admin, routes_auth, routes_documents, routes_tasks
from .bootstrap import seed_registry
from .config import Settings
from .db import Database
from .domain import APIError
from .providers import Providers
from .retrieval import Retrieval
from .worker import Worker


class RequestLimitMiddleware:
    def __init__(self, app, limit):
        self.app, self.limit = app, limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        count = 0

        async def limited_receive():
            nonlocal count
            message = await receive()
            count += len(message.get("body", b""))
            if count > self.limit:
                raise APIError("FILE_SIZE", "Request body exceeds the configured limit.", 413)
            return message

        return await self.app(scope, limited_receive, send)


def create_app(settings=None, provider_transport=None):
    cfg = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        db = Database(cfg)
        if cfg.auto_create_schema:
            db.initialize()
        seed_registry(db, cfg)
        providers = Providers(cfg, provider_transport)
        retrieval = Retrieval(cfg, db, providers)
        worker = Worker(cfg, db, providers, retrieval)
        app.state.cfg, app.state.db = cfg, db
        app.state.providers, app.state.retrieval, app.state.worker = providers, retrieval, worker
        if cfg.worker_enabled:
            worker.start()
        preload = asyncio.create_task(providers.ollama.prime()) if cfg.worker_enabled else None
        try:
            yield
        finally:
            await worker.stop()
            if preload:
                preload.cancel()
                await asyncio.gather(preload, return_exceptions=True)
            await providers.close()
            db.engine.dispose()

    app = FastAPI(
        title="OMNITRIX Control Plane",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url="/api/v1/openapi.json" if cfg.environment != "production" else None,
    )
    app.add_middleware(RequestLimitMiddleware, limit=cfg.max_upload_mb * 1024 * 1024 + 65536)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token", "X-Requested-With", "Last-Event-ID"],
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=cfg.allowed_hosts)

    @app.middleware("http")
    async def boundaries(request: Request, call_next):
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            if origin and origin not in cfg.allowed_origins:
                return JSONResponse(
                    {"code": "ORIGIN_REJECTED", "detail": "This request origin is not allowed."},
                    status_code=403,
                )
            if not origin and request.headers.get("x-requested-with") != "Omnitrix":
                return JSONResponse(
                    {
                        "code": "ORIGIN_REQUIRED",
                        "detail": "Use the configured frontend or supply X-Requested-With: Omnitrix.",
                    },
                    status_code=403,
                )
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.exception_handler(APIError)
    async def api_error(request, exc):
        return JSONResponse({"code": exc.code, "detail": exc.detail}, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        errors = [f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors()]
        return JSONResponse({"code": "VALIDATION", "detail": "; ".join(errors)}, status_code=422)

    @app.exception_handler(Exception)
    async def unexpected_error(request, exc):
        logging.getLogger(__name__).error(
            "Unhandled request error: %s", type(exc).__name__, exc_info=exc
        )
        return JSONResponse(
            {
                "code": "INTERNAL_ERROR",
                "detail": "The local service could not complete this request.",
            },
            status_code=500,
        )

    @app.get("/health/live", tags=["Health"])
    def live():
        return {"status": "ok", "service": "omnitrix-control-plane"}

    @app.get("/health/ready", tags=["Health"])
    def ready(request: Request):
        with request.app.state.db.read() as s:
            s.execute(text("SELECT 1"))
        configured = bool(
            cfg.orchestrator_base_url
            and cfg.orchestrator_model
            and cfg.text_base_url
            and cfg.text_model
        )
        return {
            "status": "ready",
            "database": "available",
            "inferenceConfigured": configured,
            "capabilities": {
                "orchestrator": bool(cfg.orchestrator_base_url and cfg.orchestrator_model),
                "text": bool(cfg.text_base_url and cfg.text_model),
                "vision": bool(cfg.vision_base_url and cfg.vision_model),
                "code": bool(cfg.code_base_url and cfg.code_model),
                "embeddings": bool(cfg.embedding_base_url and cfg.embedding_model),
            },
            "note": "Readiness verifies the API and database. It does not certify inference worker availability.",
        }

    for router in [
        routes_auth.router,
        routes_tasks.router,
        routes_documents.router,
        routes_admin.router,
        exports.router,
    ]:
        app.include_router(router, prefix="/api/v1")
    return app


app = create_app()
