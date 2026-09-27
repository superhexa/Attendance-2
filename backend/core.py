"""Shared core: DB, security, dependencies, audit, notifications, models."""
import os
import re
import uuid
import jwt
import bcrypt
import secrets
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from dotenv import load_dotenv
from fastapi import HTTPException, Request, Depends, Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

import rbac

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 30
REFRESH_TTL_DAYS = 7


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Optional[datetime] = None) -> str:
    return (dt or now_utc()).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ----------------- Passwords -----------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ----------------- JWT -----------------
def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id, "role": role, "type": "access",
        "exp": now_utc() + timedelta(minutes=ACCESS_TTL_MIN),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, jti: str) -> str:
    payload = {
        "sub": user_id, "jti": jti, "type": "refresh",
        "exp": now_utc() + timedelta(days=REFRESH_TTL_DAYS),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])


def set_auth_cookies(response: Response, access: str, refresh: str, remember: bool = False):
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=ACCESS_TTL_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=REFRESH_TTL_DAYS * 86400, path="/")


def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def public_user(user: dict) -> dict:
    u = dict(user)
    u.pop("password_hash", None)
    u.pop("_id", None)
    u.pop("twofa_secret", None)
    u.pop("recovery_codes", None)
    u["permissions"] = sorted(list(rbac.effective_permissions(user)))
    return u


# ----------------- Auth dependency -----------------
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="غير مصرح - يرجى تسجيل الدخول")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="رمز غير صالح")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="المستخدم غير موجود")
        if user.get("status") == "disabled":
            raise HTTPException(status_code=403, detail="تم تعطيل الحساب")
        if user.get("status") in ("pending_approval", "rejected"):
            raise HTTPException(status_code=403, detail="الحساب غير مفعّل")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="انتهت صلاحية الجلسة")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="رمز غير صالح")


def require(*permissions: str):
    """Dependency factory: user must have at least one of the given permissions."""
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") in ("SUPER_ADMIN", "DIRECTOR"):
            return user
        eff = rbac.effective_permissions(user)
        if not any(p in eff for p in permissions):
            raise HTTPException(status_code=403, detail="ليس لديك صلاحية لهذا الإجراء")
        return user
    return dep


# ----------------- Audit + Notifications -----------------
async def log_audit(user: dict, action: str, resource: str, resource_id: str = "",
                    old_value=None, new_value=None, reason: str = "", request: Request = None):
    ip = ""
    ua = ""
    if request is not None:
        ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "") or ""
        ua = request.headers.get("user-agent", "")
    doc = {
        "id": new_id(),
        "user_id": user.get("id") if user else None,
        "user_name": user.get("full_name") if user else "النظام",
        "user_role": user.get("role") if user else None,
        "action": action,
        "resource": resource,
        "resource_id": resource_id,
        "timestamp": iso(),
        "ip": ip.split(",")[0].strip() if ip else "",
        "user_agent": ua,
        "old_value": old_value,
        "new_value": new_value,
        "reason": reason,
    }
    await db.audit_logs.insert_one(doc)


async def notify(user_id: str, ntype: str, title: str, message: str, meta: dict = None):
    if not user_id:
        return
    await db.notifications.insert_one({
        "id": new_id(), "user_id": user_id, "type": ntype, "title": title,
        "message": message, "read": False, "created_at": iso(), "meta": meta or {},
    })


async def notify_roles(roles: List[str], ntype: str, title: str, message: str, meta: dict = None):
    cursor = db.users.find({"role": {"$in": roles}, "status": {"$ne": "disabled"}}, {"id": 1, "_id": 0})
    async for u in cursor:
        await notify(u["id"], ntype, title, message, meta)


# ----------------- Settings -----------------
DEFAULT_SETTINGS = {
    "id": "global",
    "school_name_ar": "مدرسة الملك حسين بن طلال الثانوية الشاملة للبنين",
    "school_name_en": "King Hussein Bin Talal Comprehensive Secondary School for Boys",
    "logo_url": "",
    "late_threshold_minutes": 10,
    "attendance_window_minutes": 60,
    "grace_period_minutes": 15,
    "absence_thresholds": {"warning": 3, "alert": 5, "critical": 10},
    "qr_enabled": False,
    "timezone": "Asia/Amman",
    "week_start": 0,  # 0 = Sunday
    "lesson_duration": 45,
    "periods_count": 7,
    "maintenance_mode": False,
    "require_2fa_admins": False,
    "student_signup_key": "",
    "student_signup_enabled": True,
    "last_backup_at": None,
}


async def get_settings() -> dict:
    s = await db.settings.find_one({"id": "global"}, {"_id": 0})
    if not s:
        await db.settings.insert_one(dict(DEFAULT_SETTINGS))
        return dict(DEFAULT_SETTINGS)
    merged = dict(DEFAULT_SETTINGS)
    merged.update(s)
    return merged


# ----------------- Common request models -----------------
class LoginBody(BaseModel):
    email: str
    password: str
    remember: bool = False
    otp: Optional[str] = None


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class ForgotBody(BaseModel):
    email: str


class ResetBody(BaseModel):
    token: str
    new_password: str


# ----------------- Startup: indexes + seed -----------------
async def ensure_indexes():
    await db.users.create_index("id", unique=True)
    await db.users.create_index("email", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    await db.students.create_index("id", unique=True)
    await db.students.create_index("student_number", unique=True, sparse=True)
    await db.teachers.create_index("id", unique=True)
    await db.attendance_sessions.create_index([("timetable_id", 1), ("date", 1)], unique=True)
    await db.attendance_records.create_index([("student_id", 1), ("date", 1), ("timetable_id", 1)], unique=True)
    await db.audit_logs.create_index("timestamp")
    await db.notifications.create_index([("user_id", 1), ("read", 1)])


async def seed_admin():
    await get_settings()
    email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    password = os.environ.get("ADMIN_PASSWORD", "admin123")
    name = os.environ.get("ADMIN_NAME", "مدير المدرسة")
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({
            "id": new_id(),
            "email": email,
            "username": "director",
            "password_hash": hash_password(password),
            "full_name": name,
            "role": "DIRECTOR",
            "permission_overrides": {"grant": [], "revoke": []},
            "status": "active",
            "twofa_enabled": False,
            "last_login": None,
            "created_at": iso(),
        })
    elif not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})
