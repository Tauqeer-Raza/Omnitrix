import hashlib
import secrets
import time

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Request

from .db import LoginSession, User
from .domain import APIError, permitted

hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(32))
COOKIE = "omnitrix_session"
CSRF_COOKIE = "omnitrix_csrf"


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password):
    if len(password) < 12 or len(password) > 128:
        raise APIError("VALIDATION", "Passwords must contain between 12 and 128 characters.", 422)
    return hasher.hash(password)


def verify_password(encoded, password):
    try:
        return hasher.verify(encoded, password)
    except (VerificationError, InvalidHashError):
        return False


def current_user(request: Request):
    token = request.cookies.get(COOKIE, "")
    with request.app.state.db.read() as session:
        login = session.get(LoginSession, digest(token)) if token else None
        user = session.get(User, login.user_id) if login and login.expires > time.time() else None
        if not user or not user.data["enabled"]:
            raise APIError("UNAUTHENTICATED", "Your session has ended. Please sign in.", 401)
        # Knowledge search can consume embedding tokens even though it retains the UI's GET contract.
        if (
            request.method not in {"GET", "HEAD", "OPTIONS"}
            or request.url.path.rstrip("/") == "/api/v1/knowledge/search"
        ):
            csrf = request.headers.get("x-csrf-token", "")
            if not csrf or not secrets.compare_digest(digest(csrf), login.csrf_digest):
                raise APIError(
                    "CSRF_REJECTED", "Reload the page before submitting this request.", 403
                )
        return user


def require(permission):
    def dependency(request: Request):
        user = current_user(request)
        permitted(user, permission)
        return user

    return dependency
