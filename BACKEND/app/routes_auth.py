import secrets
import time

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, func, select

from .db import LoginAttempt, LoginSession, User, uid
from .domain import APIError, audit, now_iso, public_user
from .schemas import LoginInput
from .security import COOKIE, CSRF_COOKIE, DUMMY_HASH, current_user, digest, verify_password

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login")
def login(body: LoginInput, request: Request, response: Response):
    cfg, db = request.app.state.cfg, request.app.state.db
    scope = digest(body.email.lower())
    ip_scope = digest("ip:" + (request.client.host if request.client else "unknown"))
    # Reserve the attempt before verifying, preventing concurrent bypass of throttling.
    with db.write() as s:
        s.execute(
            delete(LoginAttempt).where(
                LoginAttempt.timestamp < time.time() - cfg.login_window_seconds
            )
        )
        for key in [scope, ip_scope]:
            count = s.scalar(
                select(func.count()).select_from(LoginAttempt).where(LoginAttempt.scope == key)
            )
            if count >= cfg.login_attempts * (4 if key == ip_scope else 1):
                raise APIError(
                    "LOGIN_THROTTLED",
                    "Too many sign-in attempts. Please wait before trying again.",
                    429,
                )
            s.add(LoginAttempt(id=uid("attempt"), scope=key, timestamp=time.time()))
    with db.read() as s:
        user = s.scalar(select(User).where(User.email == body.email.lower()))
        valid = verify_password(user.password_hash if user else DUMMY_HASH, body.password)
        enabled = user is not None and user.data["enabled"]
    if not valid or not enabled:
        with db.write() as s:
            audit(s, None, "LOGIN_FAILED", "Sign-in rejected", "failed")
        raise APIError(
            "INVALID_CREDENTIALS",
            "Email or password is incorrect, or the account is disabled.",
            401,
        )
    session_token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    with db.write() as s:
        user = s.get(User, user.id)
        if not user.data["enabled"]:
            raise APIError("INVALID_CREDENTIALS", "This account is disabled.", 401)
        s.execute(delete(LoginAttempt).where(LoginAttempt.scope == scope))
        s.execute(delete(LoginSession).where(LoginSession.expires < time.time()))
        old = request.cookies.get(COOKIE)
        if old:
            s.execute(delete(LoginSession).where(LoginSession.digest == digest(old)))
        s.add(
            LoginSession(
                digest=digest(session_token),
                user_id=user.id,
                csrf_digest=digest(csrf),
                expires=time.time() + cfg.session_hours * 3600,
            )
        )
        user.data = {**user.data, "lastActivity": now_iso()}
        audit(s, user, "LOGIN", "Local workbench")
        result = {"user": public_user(s, user), "token": "", "csrfToken": csrf}
    for key, value, http_only in [(COOKIE, session_token, True), (CSRF_COOKIE, csrf, False)]:
        response.set_cookie(
            key,
            value,
            httponly=http_only,
            secure=cfg.cookie_secure,
            samesite="strict",
            max_age=cfg.session_hours * 3600,
            path="/",
        )
    return result


@router.get("/me")
def me(request: Request, user=Depends(current_user)):
    with request.app.state.db.read() as s:
        return public_user(s, user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, user=Depends(current_user)):
    with request.app.state.db.write() as s:
        s.execute(
            delete(LoginSession).where(
                LoginSession.digest == digest(request.cookies.get(COOKIE, ""))
            )
        )
        audit(s, user, "LOGOUT", "Local workbench")
    response.delete_cookie(COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
