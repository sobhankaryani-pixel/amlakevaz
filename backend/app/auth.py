from datetime import datetime, timedelta, timezone
import jwt
from pwdlib import PasswordHash
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from .config import settings

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
ROLES = {"owner", "admin", "data_entry", "analyst", "editor", "viewer"}

def hash_password(value: str) -> str: return password_hash.hash(value)
def verify_password(value: str, hashed: str) -> bool: return password_hash.verify(value, hashed)
def create_token(user_id: str, role: str) -> str:
    return jwt.encode({"sub": user_id, "role": role, "exp": datetime.now(timezone.utc)+timedelta(hours=8)}, settings.jwt_secret, algorithm="HS256")

def current_user(credentials=Depends(bearer)) -> dict:
    if not credentials: raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try: return jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc: raise HTTPException(status_code=401, detail="Invalid token") from exc

def require_roles(*roles: str):
    invalid = set(roles) - ROLES
    if invalid: raise ValueError(f"Unknown roles: {invalid}")
    def dependency(user=Depends(current_user)):
        if user.get("role") not in roles: raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dependency
