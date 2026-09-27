"""Authentication, sessions, and 2FA endpoints."""
import os
import secrets
from typing import Optional
import pyotp
from fastapi import APIRouter, Request, Response, Depends, HTTPException
from pydantic import BaseModel

from core import (
    db, new_id, iso, now_utc, hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    set_auth_cookies, clear_auth_cookies, public_user, get_current_user,
    log_audit, notify, get_settings,
    LoginBody, ChangePasswordBody, ForgotBody, ResetBody,
)
from datetime import timedelta
import jwt as pyjwt

router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_ATTEMPTS = 5
LOCK_MINUTES = 15


def parse_device(ua: str) -> str:
    ua = (ua or "").lower()
    browser = "متصفح"
    if "edg" in ua:
        browser = "Edge"
    elif "chrome" in ua:
        browser = "Chrome"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "safari" in ua:
        browser = "Safari"
    osname = "جهاز"
    if "windows" in ua:
        osname = "Windows"
    elif "iphone" in ua or "ios" in ua:
        osname = "iPhone"
    elif "android" in ua:
        osname = "Android"
    elif "mac" in ua:
        osname = "macOS"
    elif "linux" in ua:
        osname = "Linux"
    return f"{browser} - {osname}"


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else ""


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    email = body.email.strip().lower()
    ip = client_ip(request)
    identifier = f"{ip}:{email}"

    la = await db.login_attempts.find_one({"identifier": identifier})
    if la and la.get("count", 0) >= MAX_ATTEMPTS:
        locked_until = la.get("locked_until")
        if locked_until and locked_until > iso():
            raise HTTPException(status_code=429, detail="تم قفل الحساب مؤقتًا بسبب محاولات فاشلة. حاول لاحقًا")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        cnt = (la.get("count", 0) if la else 0) + 1
        locked_until = (now_utc() + timedelta(minutes=LOCK_MINUTES)).isoformat() if cnt >= MAX_ATTEMPTS else None
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$set": {"count": cnt, "locked_until": locked_until, "last_attempt": iso()}},
            upsert=True,
        )
        await log_audit(user, "login.failed", "auth", email, reason="بيانات دخول خاطئة", request=request)
        raise HTTPException(status_code=401, detail="البريد الإلكتروني أو كلمة المرور غير صحيحة")

    if user.get("status") == "disabled":
        raise HTTPException(status_code=403, detail="تم تعطيل هذا الحساب")
    if user.get("status") == "pending_approval":
        raise HTTPException(status_code=403, detail="حسابك بانتظار موافقة مدير المدرسة. سيتم إعلامك عند التفعيل.")
    if user.get("status") == "rejected":
        raise HTTPException(status_code=403, detail="تم رفض طلب التسجيل. يرجى التواصل مع إدارة المدرسة.")

    # 2FA gate
    if user.get("twofa_enabled"):
        code = getattr(body, "otp", None)
        return {"requires_2fa": True, "user_id": user["id"]}

    await db.login_attempts.delete_one({"identifier": identifier})

    jti = new_id()
    ua = request.headers.get("user-agent", "")
    await db.sessions.insert_one({
        "id": jti, "user_id": user["id"], "device": parse_device(ua),
        "ip": ip, "user_agent": ua, "created_at": iso(), "last_active": iso(),
        "revoked": False, "remember": body.remember,
    })
    access = create_access_token(user["id"], user["role"])
    refresh = create_refresh_token(user["id"], jti)
    set_auth_cookies(response, access, refresh, body.remember)
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login": iso()}})
    await log_audit(user, "login", "auth", user["id"], request=request)
    return {"user": public_user(user), "access_token": access}


class Login2FABody(BaseModel):
    user_id: str
    otp: str


@router.post("/login/2fa")
async def login_2fa(body: Login2FABody, request: Request, response: Response):
    user = await db.users.find_one({"id": body.user_id})
    if not user or not user.get("twofa_enabled"):
        raise HTTPException(status_code=400, detail="طلب غير صالح")
    secret = user.get("twofa_secret")
    ok = pyotp.TOTP(secret).verify(body.otp, valid_window=1)
    if not ok and body.otp in (user.get("recovery_codes") or []):
        ok = True
        await db.users.update_one({"id": user["id"]}, {"$pull": {"recovery_codes": body.otp}})
    if not ok:
        raise HTTPException(status_code=401, detail="رمز التحقق غير صحيح")
    jti = new_id()
    ua = request.headers.get("user-agent", "")
    await db.sessions.insert_one({
        "id": jti, "user_id": user["id"], "device": parse_device(ua),
        "ip": client_ip(request), "user_agent": ua, "created_at": iso(),
        "last_active": iso(), "revoked": False,
    })
    access = create_access_token(user["id"], user["role"])
    refresh = create_refresh_token(user["id"], jti)
    set_auth_cookies(response, access, refresh)
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login": iso()}})
    await log_audit(user, "login.2fa", "auth", user["id"], request=request)
    return {"user": public_user(user), "access_token": access}


@router.post("/logout")
async def logout(request: Request, response: Response, user: dict = Depends(get_current_user)):
    token = request.cookies.get("refresh_token")
    if token:
        try:
            payload = decode_token(token)
            await db.sessions.update_one({"id": payload.get("jti")}, {"$set": {"revoked": True}})
        except Exception:
            pass
    clear_auth_cookies(response)
    await log_audit(user, "logout", "auth", user["id"], request=request)
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="لا توجد جلسة")
    try:
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="رمز غير صالح")
    except Exception:
        raise HTTPException(status_code=401, detail="انتهت صلاحية الجلسة")
    session = await db.sessions.find_one({"id": payload.get("jti")})
    if not session or session.get("revoked"):
        raise HTTPException(status_code=401, detail="تم إنهاء الجلسة")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="المستخدم غير موجود")
    await db.sessions.update_one({"id": session["id"]}, {"$set": {"last_active": iso()}})
    access = create_access_token(user["id"], user["role"])
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=30 * 60, path="/")
    return {"user": public_user(user), "access_token": access}


@router.post("/change-password")
async def change_password(body: ChangePasswordBody, request: Request, user: dict = Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="كلمة المرور الحالية غير صحيحة")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 6 أحرف على الأقل")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await log_audit(user, "password.change", "user", user["id"], request=request)
    await notify(user["id"], "password_reset", "تم تغيير كلمة المرور", "تم تحديث كلمة المرور الخاصة بك بنجاح")
    return {"ok": True}


@router.post("/forgot-password")
async def forgot_password(body: ForgotBody):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "id": new_id(), "user_id": user["id"], "token": token,
            "expires_at": now_utc() + timedelta(hours=1), "used": False, "created_at": iso(),
        })
        print(f"[PASSWORD RESET] {email} -> token: {token}")
    return {"ok": True, "message": "إذا كان البريد مسجلاً ستصلك تعليمات إعادة التعيين"}


# ---------- Public signup (Students only, requires school key) ----------
@router.get("/school-info")
async def school_info():
    s = await get_settings()
    return {
        "school_name_ar": s.get("school_name_ar", ""),
        "school_name_en": s.get("school_name_en", ""),
        "signup_enabled": bool(s.get("student_signup_enabled", True)) and bool(s.get("student_signup_key")),
    }


@router.get("/public-structure")
async def public_structure(school_key: str):
    """Return grades + sections for the signup wizard. Requires a valid school key."""
    settings = await get_settings()
    expected_key = (settings.get("student_signup_key") or "").strip()
    if not expected_key or (school_key or "").strip().upper() != expected_key.upper():
        raise HTTPException(status_code=403, detail="مفتاح المدرسة غير صحيح")
    # Only active academic year (if any is active), otherwise all
    year = await db.academic_years.find_one({"is_active": True, "deleted": {"$ne": True}}, {"_id": 0})
    q_g = {"deleted": {"$ne": True}}
    q_s = {"deleted": {"$ne": True}}
    if year:
        q_g["academic_year_id"] = year["id"]
        q_s["academic_year_id"] = year["id"]
    grades = await db.grades.find(q_g, {"_id": 0, "id": 1, "name": 1, "level": 1}).sort("level", 1).to_list(200)
    sections = await db.sections.find(q_s, {"_id": 0, "id": 1, "name": 1, "grade_id": 1}).to_list(500)
    return {"grades": grades, "sections": sections}


class StudentSignupBody(BaseModel):
    school_key: str
    full_name: str
    email: str
    password: str
    student_number: Optional[str] = None
    grade_id: Optional[str] = None
    section_id: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = "male"
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    contact_phone: Optional[str] = None


@router.post("/signup/student")
async def student_signup(body: StudentSignupBody, request: Request):
    settings = await get_settings()
    if not settings.get("student_signup_enabled", True):
        raise HTTPException(status_code=403, detail="التسجيل الذاتي للطلاب معطّل حاليًا")
    expected_key = (settings.get("student_signup_key") or "").strip()
    if not expected_key:
        raise HTTPException(status_code=403, detail="لم يقم مدير المدرسة بإنشاء مفتاح تسجيل بعد")
    if (body.school_key or "").strip().upper() != expected_key.upper():
        raise HTTPException(status_code=400, detail="مفتاح المدرسة غير صحيح")

    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني غير صالح")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 6 أحرف على الأقل")
    if len(body.full_name.strip()) < 2:
        raise HTTPException(status_code=400, detail="الاسم الكامل مطلوب")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم مسبقًا")
    if not body.grade_id or not body.section_id:
        raise HTTPException(status_code=400, detail="الرجاء اختيار الصف والشعبة")
    grade = await db.grades.find_one({"id": body.grade_id, "deleted": {"$ne": True}})
    section = await db.sections.find_one({"id": body.section_id, "deleted": {"$ne": True}})
    if not grade or not section:
        raise HTTPException(status_code=400, detail="الصف أو الشعبة غير صالحة")

    signup_data = {
        "student_number": (body.student_number or "").strip() or None,
        "grade_id": body.grade_id,
        "section_id": body.section_id,
        "dob": (body.dob or "").strip(),
        "gender": (body.gender or "male"),
        "guardian_name": (body.guardian_name or "").strip(),
        "guardian_phone": (body.guardian_phone or "").strip(),
        "contact_phone": (body.contact_phone or "").strip(),
        "submitted_at": iso(),
    }

    uid = new_id()
    user_doc = {
        "id": uid, "email": email, "username": email.split("@")[0],
        "password_hash": hash_password(body.password), "full_name": body.full_name.strip(),
        "role": "STUDENT", "permission_overrides": {"grant": [], "revoke": []},
        "status": "pending_approval",
        "twofa_enabled": False, "last_login": None,
        "created_at": iso(),
        "pending_signup_data": signup_data,
    }
    await db.users.insert_one(user_doc)
    await log_audit(user_doc, "signup.submitted", "auth", uid, request=request)
    # Notify admins
    try:
        from core import notify_roles as _nr
        await _nr(["SUPER_ADMIN", "DIRECTOR"], "account_created",
                  "طلب تسجيل طالب جديد",
                  f"طلب الطالب {body.full_name.strip()} إنشاء حساب — بانتظار الموافقة",
                  meta={"signup_user_id": uid})
    except Exception:
        pass
    return {"ok": True, "status": "pending_approval",
            "message": "تم استلام طلبك. سيقوم مدير المدرسة بمراجعته قريبًا."}


@router.post("/reset-password")
async def reset_password(body: ResetBody):
    rec = await db.password_reset_tokens.find_one({"token": body.token, "used": False})
    if not rec:
        raise HTTPException(status_code=400, detail="رمز غير صالح أو منتهي")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await db.password_reset_tokens.update_one({"id": rec["id"]}, {"$set": {"used": True}})
    return {"ok": True}


# ---------- Sessions ----------
@router.get("/sessions")
async def list_sessions(request: Request, user: dict = Depends(get_current_user)):
    current_jti = None
    token = request.cookies.get("refresh_token")
    if token:
        try:
            current_jti = decode_token(token).get("jti")
        except Exception:
            pass
    sessions = await db.sessions.find({"user_id": user["id"], "revoked": False}, {"_id": 0}).sort("last_active", -1).to_list(100)
    for s in sessions:
        s["current"] = s["id"] == current_jti
    return sessions


@router.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    await db.sessions.update_one({"id": session_id, "user_id": user["id"]}, {"$set": {"revoked": True}})
    await log_audit(user, "session.revoke", "session", session_id, request=request)
    return {"ok": True}


@router.post("/sessions/revoke-all")
async def revoke_all(request: Request, user: dict = Depends(get_current_user)):
    current_jti = None
    token = request.cookies.get("refresh_token")
    if token:
        try:
            current_jti = decode_token(token).get("jti")
        except Exception:
            pass
    await db.sessions.update_many(
        {"user_id": user["id"], "id": {"$ne": current_jti}}, {"$set": {"revoked": True}}
    )
    await log_audit(user, "session.revoke_all", "session", user["id"], request=request)
    return {"ok": True}


# ---------- 2FA ----------
@router.post("/2fa/setup")
async def twofa_setup(user: dict = Depends(get_current_user)):
    secret = pyotp.random_base32()
    await db.users.update_one({"id": user["id"]}, {"$set": {"twofa_pending_secret": secret}})
    settings = await get_settings()
    uri = pyotp.TOTP(secret).provisioning_uri(name=user["email"], issuer_name=settings["school_name_en"])
    return {"secret": secret, "otpauth_uri": uri}


class TwoFAVerify(BaseModel):
    otp: str


@router.post("/2fa/enable")
async def twofa_enable(body: TwoFAVerify, request: Request, user: dict = Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    secret = full.get("twofa_pending_secret")
    if not secret or not pyotp.TOTP(secret).verify(body.otp, valid_window=1):
        raise HTTPException(status_code=400, detail="رمز التحقق غير صحيح")
    recovery = [secrets.token_hex(4) for _ in range(8)]
    await db.users.update_one({"id": user["id"]}, {
        "$set": {"twofa_enabled": True, "twofa_secret": secret, "recovery_codes": recovery},
        "$unset": {"twofa_pending_secret": ""},
    })
    await log_audit(user, "2fa.enable", "user", user["id"], request=request)
    return {"ok": True, "recovery_codes": recovery}


@router.post("/2fa/disable")
async def twofa_disable(request: Request, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {
        "$set": {"twofa_enabled": False}, "$unset": {"twofa_secret": "", "recovery_codes": ""},
    })
    await log_audit(user, "2fa.disable", "user", user["id"], request=request)
    return {"ok": True}
