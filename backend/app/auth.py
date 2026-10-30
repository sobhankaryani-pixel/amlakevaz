from datetime import datetime, timedelta, timezone
import hashlib
import hmac
from uuid import UUID
import jwt
from pwdlib import PasswordHash
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from .config import settings
from .db import pool

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
ROLES = {"owner", "admin", "data_entry", "analyst", "editor", "viewer"}

def hash_password(value: str) -> str: return password_hash.hash(value)
def verify_password(value: str, hashed: str) -> bool: return password_hash.verify(value, hashed)
def _session_stamp(user_id: str, stored_password_hash: str) -> str:
    # A keyed fingerprint binds sessions to the current password without exposing
    # its hash in a readable JWT. A password reset invalidates existing tokens.
    message = f"admin-session-v1\0{user_id}\0{stored_password_hash}".encode()
    return hmac.new(settings.jwt_secret.encode(), message, hashlib.sha256).hexdigest()

def create_token(user_id: str, role: str, stored_password_hash: str) -> str:
    if role not in ROLES or not stored_password_hash:
        raise ValueError("Invalid administrator account")
    user_id = str(UUID(user_id))
    return jwt.encode({"sub": user_id, "role": role, "session_stamp": _session_stamp(user_id, stored_password_hash),
                       "exp": datetime.now(timezone.utc)+timedelta(hours=8)}, settings.jwt_secret, algorithm="HS256")

def current_user(credentials=Depends(bearer)) -> dict:
    if not credentials: raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        claims = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"],
                            options={"require": ["sub", "exp", "session_stamp"]})
        user_id = str(UUID(claims["sub"]))
        stamp = claims["session_stamp"]
        if not isinstance(stamp, str) or len(stamp) != 64 or not stamp.isascii():
            raise ValueError("Invalid session stamp")
    except (jwt.PyJWTError, ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid token; please sign in again") from exc
    # Do not cache this lookup: revocations and role changes take effect on the
    # next request after the database change commits, including across workers.
    with pool.connection() as conn:
        user = conn.execute("SELECT id,role,is_active,password_hash FROM app.users WHERE id=%s", (user_id,)).fetchone()
    if (not user or not user["is_active"] or user["role"] not in ROLES
            or not hmac.compare_digest(stamp, _session_stamp(user_id, user["password_hash"]))):
        raise HTTPException(status_code=401, detail="Session revoked; please sign in again")
    # Authorization uses the current database role, never the role in the token.
    return {"sub": user_id, "role": user["role"], "exp": claims["exp"]}

def require_roles(*roles: str):
    invalid = set(roles) - ROLES
    if invalid: raise ValueError(f"Unknown roles: {invalid}")
    def dependency(user=Depends(current_user)):
        if user.get("role") not in roles: raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dependency
