import time
import uuid
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import (
    JSON,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    create_engine,
    event,
    select,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def uid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex}"


class Base(DeclarativeBase):
    pass


class Record(Base):
    __tablename__ = "registry"
    kind: Mapped[str] = mapped_column(String(32), primary_key=True)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    data: Mapped[dict] = mapped_column(JSON)


class LoginSession(Base):
    __tablename__ = "sessions"
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    csrf_digest: Mapped[str] = mapped_column(String(64))
    expires: Mapped[float] = mapped_column(Float, index=True)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    scope: Mapped[str] = mapped_column(String(64), index=True)
    timestamp: Mapped[float] = mapped_column(Float, index=True)


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    conversation_id: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(16), index=True)
    created: Mapped[float] = mapped_column(Float, default=time.time)
    lease_until: Mapped[float] = mapped_column(Float, default=0)
    claim: Mapped[str] = mapped_column(String(64), default="")
    reservation: Mapped[int] = mapped_column(Integer, default=0)
    tokens: Mapped[int] = mapped_column(Integer, default=0)
    data: Mapped[dict] = mapped_column(JSON)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    path: Mapped[str] = mapped_column(String(128))
    data: Mapped[dict] = mapped_column(JSON)


class Chunk(Base):
    __tablename__ = "chunks"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    document_id: Mapped[str] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    page: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(String)
    vector: Mapped[list | None] = mapped_column(JSON, nullable=True)
    embedding_model: Mapped[str] = mapped_column(String(256), default="")


class Event(Base):
    __tablename__ = "task_events"
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(64), unique=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    data: Mapped[dict] = mapped_column(JSON)


class Audit(Base):
    __tablename__ = "audit_log"
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[str] = mapped_column(String(64), index=True)
    created: Mapped[float] = mapped_column(Float, default=time.time, index=True)
    data: Mapped[dict] = mapped_column(JSON)


class Usage(Base):
    __tablename__ = "token_usage"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    tokens: Mapped[int] = mapped_column(Integer)
    created: Mapped[float] = mapped_column(Float, default=time.time)
    estimated: Mapped[bool]
    service: Mapped[str] = mapped_column(String(128))


Index("usage_period", Usage.user_id, Usage.created)


class Database:
    def __init__(self, settings):
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        if settings.database_url.startswith("sqlite:///"):
            path = settings.database_url.removeprefix("sqlite:///")
            if path != ":memory:":
                Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.sqlite = settings.database_url.startswith("sqlite")
        self.engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            connect_args={"check_same_thread": False, "timeout": 30} if self.sqlite else {},
        )
        if self.sqlite:

            @event.listens_for(self.engine, "connect")
            def configure(connection, _):
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute("PRAGMA journal_mode=WAL")

        self.sessions = sessionmaker(self.engine, expire_on_commit=False)

    def initialize(self):
        Base.metadata.create_all(self.engine)

    @contextmanager
    def read(self):
        with self.sessions() as session:
            yield session

    @contextmanager
    def write(self):
        # One admission/accounting lock across processes. PostgreSQL locks the policy row.
        with self.sessions() as session:
            try:
                if self.sqlite:
                    session.execute(text("BEGIN IMMEDIATE"))
                else:
                    session.execute(
                        select(Record).where(Record.kind == "settings").with_for_update()
                    )
                yield session
                session.commit()
            except BaseException:
                session.rollback()
                raise
