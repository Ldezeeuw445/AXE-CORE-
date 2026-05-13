"""Email+password auth with JWT for operator login."""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)

JWT_SECRET = os.environ.get("JWT_SECRET", "change-me")
JWT_ALG = "HS256"
JWT_EXP_HOURS = 24 * 7


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str


class MeResponse(BaseModel):
    email: str
    operator: bool


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


async def ensure_default_operator(db):
    email = os.environ.get("OPERATOR_EMAIL", "operator@axe.intel").lower()
    password = os.environ.get("OPERATOR_PASSWORD", "axe2026")
    existing = await db.operators.find_one({"email": email})
    if not existing:
        await db.operators.insert_one({
            "email": email,
            "password_hash": _hash(password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


def _make_token(email: str) -> str:
    payload = {
        "sub": email,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXP_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_operator(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    if not creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return email
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, request: Request):
    db = request.app.state.db
    user = await db.operators.find_one({"email": req.email.lower()})
    if not user or not _verify(req.password, user.get("password_hash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = _make_token(req.email.lower())
    return LoginResponse(access_token=token, email=req.email.lower())


@router.get("/me", response_model=MeResponse)
async def me(email: str = Depends(get_current_operator)):
    return MeResponse(email=email, operator=True)
