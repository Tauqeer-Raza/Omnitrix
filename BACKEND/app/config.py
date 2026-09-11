import json
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)
    environment: Literal["development", "production", "test"] = "development"
    database_url: str = "sqlite:///./data/omnitrix.db"
    data_dir: Path = Path("./data")
    auto_create_schema: bool = True
    allowed_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]
    cookie_secure: bool = False
    session_hours: int = Field(8, ge=1, le=72)
    login_attempts: int = Field(8, ge=1)
    login_window_seconds: int = 900
    bootstrap_admin_email: str = "admin@omnitrix.local"
    bootstrap_admin_password: SecretStr = SecretStr("")
    organization: str = "OMNITRIX"
    worker_enabled: bool = True
    worker_concurrency: int = Field(2, ge=1, le=16)
    worker_poll_seconds: float = Field(1, ge=0.05)
    worker_lease_seconds: int = Field(90, ge=30)
    task_timeout_seconds: int = Field(300, ge=10, le=3600)
    token_reservation: int = Field(16384, ge=1000)
    max_output_tokens: int = Field(2048, ge=64, le=8192)
    text_max_output_tokens: int = Field(512, ge=64, le=8192)
    code_max_output_tokens: int = Field(1024, ge=64, le=8192)
    text_reasoning_effort: Literal["", "none", "low", "medium", "high"] = "none"
    code_reasoning_effort: Literal["", "none", "low", "medium", "high"] = ""
    max_history_chars: int = Field(6000, ge=0, le=32000)
    max_context_chars: int = Field(10000, ge=1000, le=100000)
    max_upload_mb: int = Field(20, ge=1, le=100)
    max_document_pages: int = Field(40, ge=1, le=500)
    max_document_chars: int = Field(200000, ge=1000)
    max_ocr_pages: int = Field(8, ge=1, le=40)
    daily_token_limit: int = 2000000
    monthly_token_limit: int = 40000000
    user_daily_token_limit: int = 100000
    user_monthly_token_limit: int = 2000000
    retention_days: int = 365
    provider_timeout_seconds: int = Field(120, ge=5, le=600)
    provider_health_timeout_seconds: int = Field(5, ge=1, le=30)
    provider_response_max_mb: int = Field(8, ge=1, le=32)
    provider_verify_tls: bool = True
    ollama_managed_base_urls: list[str] = []
    ollama_pin_orchestrator: bool = True
    ollama_context_length: int = Field(4096, ge=1024, le=32768)
    ollama_cleanup_timeout_seconds: int = Field(15, ge=1, le=60)
    orchestrator_base_url: str = ""
    orchestrator_api_key: SecretStr = SecretStr("")
    orchestrator_model: str = ""
    orchestrator_max_tokens: int = Field(96, ge=32, le=512)
    text_base_url: str = ""
    text_api_key: SecretStr = SecretStr("")
    text_model: str = ""
    text_fallback_model: str = ""
    vision_base_url: str = ""
    vision_api_key: SecretStr = SecretStr("")
    vision_model: str = ""
    vision_fallback_model: str = ""
    code_base_url: str = ""
    code_api_key: SecretStr = SecretStr("")
    code_model: str = ""
    code_fallback_model: str = ""
    embedding_base_url: str = ""
    embedding_api_key: SecretStr = SecretStr("")
    embedding_model: str = ""
    embedding_registry_id: Literal["librarian-1", "librarian-2"] = "librarian-1"
    embedding_dimensions: int = Field(1024, ge=1, le=16384)
    extra_workers_json: SecretStr = SecretStr("{}")
    rag_mode: Literal["semantic", "lexical"] = "semantic"
    vector_store: Literal["sql", "qdrant"] = "sql"
    qdrant_url: str = ""
    qdrant_api_key: SecretStr = SecretStr("")
    qdrant_collection: str = "omnitrix"
    rag_top_k: int = Field(5, ge=1, le=20)

    @model_validator(mode="after")
    def validate_deployment(self):
        if "*" in self.allowed_origins:
            raise ValueError("Use explicit ALLOWED_ORIGINS for authenticated requests.")
        if self.environment == "production" and not self.cookie_secure:
            raise ValueError("Production requires COOKIE_SECURE=true and HTTPS at the gateway.")
        extra = json.loads(self.extra_workers_json.get_secret_value())
        if not isinstance(extra, dict):
            raise ValueError("EXTRA_WORKERS_JSON must be an object keyed by registered node ID.")
        for worker in extra.values():
            if (
                not isinstance(worker, dict)
                or not isinstance(worker.get("models"), dict)
                or not isinstance(worker.get("groups"), list)
            ):
                raise ValueError("Each extra worker requires models and groups.")
            if any(g not in {"FAST", "VISION", "MASTER"} for g in worker["groups"]):
                raise ValueError("Extra workers support FAST, VISION or MASTER groups.")
            if (
                not isinstance(worker.get("base_url"), str)
                or not isinstance(worker.get("api_key", ""), str)
                or any(not isinstance(m, str) for m in worker["models"].values())
            ):
                raise ValueError("Worker URLs, API keys and model IDs must be strings.")
        for url in [
            self.orchestrator_base_url,
            self.text_base_url,
            self.vision_base_url,
            self.code_base_url,
            self.embedding_base_url,
            self.qdrant_url,
            *self.ollama_managed_base_urls,
            *[w["base_url"] for w in extra.values()],
        ]:
            if url and (
                urlparse(url).scheme not in {"http", "https"}
                or not urlparse(url).hostname
                or urlparse(url).username
                or urlparse(url).query
                or urlparse(url).fragment
            ):
                raise ValueError(
                    "Service URLs must be HTTP(S) URLs without embedded credentials, query or fragment."
                )
        if any(not url.rstrip("/").endswith("/v1") for url in self.ollama_managed_base_urls):
            raise ValueError("Managed Ollama base URLs must end in /v1.")
        return self

    def workers(self) -> dict:
        result = {}
        for node, prefix, group, first, second in [
            ("node-01", "text", "FAST", "fast-1", "fast-2"),
            ("node-02", "vision", "VISION", "vision-1", "vision-2"),
            ("node-03", "code", "MASTER", "master-1", "master-2"),
        ]:
            result[node] = {
                "base_url": getattr(self, f"{prefix}_base_url"),
                "api_key": getattr(self, f"{prefix}_api_key").get_secret_value(),
                "groups": [group],
                "models": {
                    first: getattr(self, f"{prefix}_model"),
                    second: getattr(self, f"{prefix}_fallback_model"),
                },
            }
        result.update(json.loads(self.extra_workers_json.get_secret_value()))
        return result
