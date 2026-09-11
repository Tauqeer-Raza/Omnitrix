import argparse
import asyncio
import getpass

from sqlalchemy import delete, select

from .bootstrap import new_user, seed_registry
from .config import Settings
from .db import Database, LoginSession, User
from .domain import audit
from .providers import Providers
from .retrieval import Retrieval
from .security import password_hash


def main():
    parser = argparse.ArgumentParser(description="OMNITRIX local administration")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init-db", help="Create the initial SQL schema and default registry")
    create = sub.add_parser(
        "create-admin", help="Provision an administrator with a prompted password"
    )
    create.add_argument("--email", required=True)
    create.add_argument("--name", default="Administrator")
    reset = sub.add_parser("reset-password", help="Set a new password and revoke existing sessions")
    reset.add_argument("--email", required=True)
    sub.add_parser("init-vectors", help="Create/validate the configured Qdrant collection")
    args = parser.parse_args()
    cfg = Settings()
    db = Database(cfg)
    try:
        db.initialize()
        seed_registry(db, cfg)
        if args.command in {"create-admin", "reset-password"}:
            password = getpass.getpass("Password (12–128 characters): ")
            if password != getpass.getpass("Confirm password: "):
                parser.error("Passwords do not match.")
            with db.write() as s:
                user = s.scalar(select(User).where(User.email == args.email.strip().lower()))
                if args.command == "create-admin":
                    if user:
                        parser.error("This email already exists. Use reset-password if needed.")
                    user = new_user(
                        cfg, args.name, args.email, "IT & Infrastructure", password, "admin"
                    )
                    s.add(user)
                    audit(s, user, "ADMIN_PROVISIONED", user.email)
                else:
                    if not user:
                        parser.error("Account not found.")
                    user.password_hash = password_hash(password)
                    s.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
                    audit(s, user, "PASSWORD_RESET", user.email)
            print("Account updated. Passwords are never written to logs.")
        elif args.command == "init-vectors":

            async def initialize():
                providers = Providers(cfg)
                try:
                    await Retrieval(cfg, db, providers).ensure_collection()
                finally:
                    await providers.close()

            asyncio.run(initialize())
            print("Qdrant collection is configured.")
        else:
            print("Initial schema and registry are ready.")
    finally:
        db.engine.dispose()


if __name__ == "__main__":
    main()
