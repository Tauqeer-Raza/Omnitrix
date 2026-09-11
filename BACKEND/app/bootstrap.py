from sqlalchemy import select

from .db import Record, User, uid
from .domain import GROUPS, PERMISSIONS, audit, now_iso
from .security import password_hash
from .topology import endpoint_host, runtime_models


def new_user(settings, name, email, department, password, role="user"):
    return User(
        id=uid("usr"),
        email=email.strip().lower(),
        password_hash=password_hash(password),
        data={
            "name": name,
            "department": department,
            "role": role,
            "enabled": True,
            "permissions": PERMISSIONS
            if role == "admin"
            else ["tasks", "documents", "knowledge", "code"],
            "modelAccess": GROUPS,
            "dailyLimit": settings.user_daily_token_limit,
            "monthlyLimit": settings.user_monthly_token_limit,
            "lastActivity": now_iso(),
        },
    )


def seed_registry(db, cfg):
    with db.write() as s:

        def add(kind, id, data):
            if not s.get(Record, (kind, id)):
                s.add(Record(kind=kind, id=id, data={"id": id, **data}))

        add(
            "settings",
            "organization",
            {
                "organization": cfg.organization,
                "dailyLimit": cfg.daily_token_limit,
                "monthlyLimit": cfg.monthly_token_limit,
                "retentionDays": cfg.retention_days,
                "timeout": cfg.task_timeout_seconds,
                "offline": False,
                "departmentLimits": {},
                "requireReview": True,
            },
        )
        for node, name, kind in [
            ("node-01", "Text specialist", "TEXT"),
            ("node-02", "Vision specialist", "VISION"),
            ("node-03", "Code & reasoning specialist", "CODE"),
        ]:
            worker = cfg.workers()[node]
            data = {
                "name": name,
                "host": endpoint_host(worker["base_url"]) or "Not configured",
                "type": kind,
                "accelerator": "Configure deployment hardware",
                "memory": 0,
                "capacity": 1,
                "status": "online" if worker["base_url"] else "offline",
                "utilization": 0,
                "activeTasks": 0,
            }
            existing = s.get(Record, ("nodes", node))
            if existing:
                was_unconfigured = existing.data.get("host") in {"", "Not configured"}
                existing.data = {
                    **existing.data,
                    **({"name": name} if "Mac mini" in existing.data.get("name", "") else {}),
                    "host": data["host"],
                    **(
                        {"status": "offline"}
                        if not worker["base_url"]
                        else {"status": "online"}
                        if was_unconfigured
                        else {}
                    ),
                }
            else:
                add("nodes", node, data)
        control = s.get(Record, ("nodes", "control-plane"))
        if control:
            control.data = {
                **control.data,
                **(
                    {"name": "Control plane"}
                    if "Jetson TX2" in control.data.get("name", "")
                    else {}
                ),
                "capacity": cfg.worker_concurrency,
            }
        else:
            add(
                "nodes",
                "control-plane",
                {
                    "name": "Control plane",
                    "host": "localhost",
                    "type": "CONTROL",
                    "accelerator": "Configure deployment hardware",
                    "memory": 0,
                    "capacity": cfg.worker_concurrency,
                    "status": "online",
                    "utilization": 0,
                    "activeTasks": 0,
                },
            )
        for runtime in runtime_models(cfg):
            id = runtime["id"]
            name = runtime["servedModel"] or f"{runtime['label']} · not configured"
            data = {
                "name": name,
                "group": runtime["group"],
                "nodeId": runtime["nodeId"],
                "enabled": runtime["configured"],
                "priority": 1 if id.endswith("1") else 2,
                "context": 32768,
                "role": runtime["label"],
                "servedModel": runtime["servedModel"],
                "configured": runtime["configured"],
                "endpointHost": runtime["endpointHost"],
            }
            existing = s.get(Record, ("models", id))
            if existing:
                was_configured = bool(existing.data.get("configured"))
                existing.data = {
                    **existing.data,
                    "name": name,
                    "servedModel": runtime["servedModel"],
                    "configured": runtime["configured"],
                    "endpointHost": runtime["endpointHost"],
                    **(
                        {"enabled": False}
                        if not runtime["configured"]
                        else {"enabled": True}
                        if not was_configured
                        else {}
                    ),
                }
            else:
                add("models", id, data)
        for group, prefix, description in [
            ("FAST", "fast", "Text & chat"),
            ("VISION", "vision", "Document vision"),
            ("MASTER", "master", "Code & reasoning"),
            ("LIBRARIAN", "librarian", "Knowledge retrieval"),
        ]:
            add(
                "routing",
                f"route-{prefix}",
                {
                    "task": description,
                    "group": group,
                    "primaryId": f"{prefix}-1",
                    "fallbackId": f"{prefix}-2",
                    "strategy": "priority",
                },
            )
        s.flush()
        password = cfg.bootstrap_admin_password.get_secret_value()
        if password and not s.scalar(
            select(User).where(User.email == cfg.bootstrap_admin_email.lower())
        ):
            user = new_user(
                cfg,
                "Administrator",
                cfg.bootstrap_admin_email,
                "IT & Infrastructure",
                password,
                "admin",
            )
            s.add(user)
            audit(s, user, "ADMIN_PROVISIONED", user.email)
