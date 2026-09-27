"""Users, Teachers, Students management with RBAC & scope."""
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from pymongo.errors import DuplicateKeyError

from core import (
    db, new_id, iso, get_current_user, require, log_audit,
    hash_password, public_user, notify,
)
import rbac

router = APIRouter(prefix="/api", tags=["people"])


# =================== RBAC meta ===================
@router.get("/rbac/meta")
async def rbac_meta(user: dict = Depends(get_current_user)):
    return {
        "permissions": rbac.PERMISSIONS,
        "permission_groups": rbac.PERMISSION_GROUPS,
        "roles": rbac.ROLES,
        "role_labels": rbac.ROLE_LABELS,
        "role_permissions": {r: sorted(list(p)) for r, p in rbac.ROLE_PERMISSIONS.items()},
    }


# =================== Users ===================
class UserCreate(BaseModel):
    email: str
    username: Optional[str] = None
    full_name: str
    password: str
    role: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    permission_overrides: Optional[dict] = None


@router.get("/users")
async def list_users(request: Request, role: Optional[str] = None, search: Optional[str] = None,
                     page: int = 1, limit: int = 20, user: dict = Depends(require("users.view"))):
    q = {}
    if role:
        q["role"] = role
    if search:
        q["$or"] = [{"full_name": {"$regex": search, "$options": "i"}},
                    {"email": {"$regex": search, "$options": "i"}}]
    total = await db.users.count_documents(q)
    docs = await db.users.find(q, {"_id": 0, "password_hash": 0, "twofa_secret": 0, "recovery_codes": 0}) \
        .skip((page - 1) * limit).limit(limit).sort("created_at", -1).to_list(limit)
    for d in docs:
        d["permissions"] = sorted(list(rbac.effective_permissions(d)))
    return {"items": docs, "total": total, "page": page, "limit": limit}


@router.post("/users")
async def create_user(body: UserCreate, request: Request, user: dict = Depends(require("users.create"))):
    email = body.email.strip().lower()
    if body.role not in rbac.ROLES:
        raise HTTPException(status_code=400, detail="دور غير صالح")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم مسبقًا")
    doc = {
        "id": new_id(), "email": email, "username": body.username or email.split("@")[0],
        "password_hash": hash_password(body.password), "full_name": body.full_name,
        "role": body.role, "permission_overrides": {"grant": [], "revoke": []},
        "status": "active", "twofa_enabled": False, "last_login": None, "created_at": iso(),
    }
    await db.users.insert_one(doc)
    await log_audit(user, "create", "user", doc["id"], new_value={"email": email, "role": body.role}, request=request)
    await notify(doc["id"], "account_created", "تم إنشاء حسابك", f"تم إنشاء حسابك بدور {rbac.ROLE_LABELS.get(body.role, {}).get('ar', body.role)}")
    return public_user(doc)


@router.patch("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, request: Request, user: dict = Depends(require("users.edit"))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if "status" in updates and updates["status"] == "disabled" and not rbac.has_permission(user, "users.disable"):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية تعطيل الحسابات")
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
    await log_audit(user, "update", "user", user_id, old_value={"role": target.get("role"), "status": target.get("status")},
                    new_value=updates, request=request)
    fresh = await db.users.find_one({"id": user_id}, {"_id": 0})
    return public_user(fresh)


@router.post("/users/{user_id}/reset-password")
async def admin_reset_password(user_id: str, request: Request, user: dict = Depends(require("users.edit"))):
    import secrets
    new_pw = secrets.token_urlsafe(8)
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(new_pw)}})
    await log_audit(user, "password.reset", "user", user_id, request=request)
    await notify(user_id, "password_reset", "تم إعادة تعيين كلمة المرور", "قام المشرف بإعادة تعيين كلمة المرور الخاصة بك")
    return {"ok": True, "temporary_password": new_pw}


# =================== Teachers ===================
class TeacherBody(BaseModel):
    full_name: str
    employee_id: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    subject_ids: Optional[List[str]] = []
    assigned_section_ids: Optional[List[str]] = []
    create_account: Optional[bool] = False
    username: Optional[str] = None
    password: Optional[str] = None


async def _enrich_teacher(t: dict) -> dict:
    subs = await db.subjects.find({"id": {"$in": t.get("subject_ids", [])}}, {"_id": 0, "name": 1}).to_list(50)
    t["subject_names"] = [s["name"] for s in subs]
    t["section_count"] = len(t.get("assigned_section_ids", []))
    if t.get("user_id"):
        u = await db.users.find_one({"id": t["user_id"]}, {"_id": 0, "last_login": 1, "status": 1, "email": 1})
        if u:
            t["last_login"] = u.get("last_login")
            t["account_status"] = u.get("status")
    # submission stats
    total_sessions = await db.attendance_sessions.count_documents({"teacher_id": t["id"]})
    t["submitted_sessions"] = total_sessions
    return t


@router.get("/teachers")
async def list_teachers(search: Optional[str] = None, page: int = 1, limit: int = 20,
                        user: dict = Depends(require("teachers.view"))):
    q = {"deleted": {"$ne": True}}
    if search:
        q["full_name"] = {"$regex": search, "$options": "i"}
    total = await db.teachers.count_documents(q)
    docs = await db.teachers.find(q, {"_id": 0}).skip((page - 1) * limit).limit(limit).sort("created_at", -1).to_list(limit)
    for d in docs:
        await _enrich_teacher(d)
    return {"items": docs, "total": total, "page": page, "limit": limit}


@router.get("/teachers/{teacher_id}")
async def get_teacher(teacher_id: str, user: dict = Depends(require("teachers.view"))):
    t = await db.teachers.find_one({"id": teacher_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")
    return await _enrich_teacher(t)


@router.post("/teachers")
async def create_teacher(body: TeacherBody, request: Request, user: dict = Depends(require("teachers.create"))):
    doc = {
        "id": new_id(), "full_name": body.full_name, "employee_id": body.employee_id,
        "email": (body.email or "").lower(), "phone": body.phone,
        "subject_ids": body.subject_ids or [], "assigned_section_ids": body.assigned_section_ids or [],
        "status": "active", "user_id": None, "deleted": False, "created_at": iso(),
    }
    if body.create_account and body.email and body.password:
        email = body.email.strip().lower()
        if await db.users.find_one({"email": email}):
            raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم مسبقًا")
        uid = new_id()
        await db.users.insert_one({
            "id": uid, "email": email, "username": body.username or email.split("@")[0],
            "password_hash": hash_password(body.password), "full_name": body.full_name,
            "role": "TEACHER", "permission_overrides": {"grant": [], "revoke": []},
            "status": "active", "twofa_enabled": False, "last_login": None,
            "teacher_id": doc["id"], "created_at": iso(),
        })
        doc["user_id"] = uid
    await db.teachers.insert_one(doc)
    await log_audit(user, "create", "teacher", doc["id"], new_value={"name": body.full_name}, request=request)
    doc.pop("_id", None)
    return await _enrich_teacher(doc)


@router.patch("/teachers/{teacher_id}")
async def update_teacher(teacher_id: str, body: TeacherBody, request: Request, user: dict = Depends(require("teachers.edit"))):
    t = await db.teachers.find_one({"id": teacher_id})
    if not t:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")
    updates = {
        "full_name": body.full_name, "employee_id": body.employee_id, "email": (body.email or "").lower(),
        "phone": body.phone, "subject_ids": body.subject_ids or [],
        "assigned_section_ids": body.assigned_section_ids or [],
    }
    await db.teachers.update_one({"id": teacher_id}, {"$set": updates})
    if t.get("user_id"):
        await db.users.update_one({"id": t["user_id"]}, {"$set": {"full_name": body.full_name}})
    await log_audit(user, "update", "teacher", teacher_id, new_value=updates, request=request)
    fresh = await db.teachers.find_one({"id": teacher_id}, {"_id": 0})
    return await _enrich_teacher(fresh)


@router.delete("/teachers/{teacher_id}")
async def delete_teacher(teacher_id: str, request: Request, user: dict = Depends(require("teachers.delete"))):
    t = await db.teachers.find_one({"id": teacher_id})
    await db.teachers.update_one({"id": teacher_id}, {"$set": {"deleted": True}})
    if t and t.get("user_id"):
        await db.users.update_one({"id": t["user_id"]}, {"$set": {"status": "disabled"}})
    await log_audit(user, "delete", "teacher", teacher_id, request=request)
    return {"ok": True}


# =================== Students ===================
class StudentBody(BaseModel):
    full_name: str
    student_number: Optional[str] = ""
    dob: Optional[str] = ""
    gender: Optional[str] = "male"
    grade_id: str
    section_id: str
    academic_year_id: Optional[str] = ""
    guardian_name: Optional[str] = ""
    guardian_phone: Optional[str] = ""
    contact_phone: Optional[str] = ""
    email: Optional[str] = ""
    create_account: Optional[bool] = False
    username: Optional[str] = None
    password: Optional[str] = None


async def _enrich_student(s: dict) -> dict:
    grade = await db.grades.find_one({"id": s.get("grade_id")}, {"_id": 0, "name": 1})
    section = await db.sections.find_one({"id": s.get("section_id")}, {"_id": 0, "name": 1})
    s["grade_name"] = grade["name"] if grade else ""
    s["section_name"] = section["name"] if section else ""
    return s


async def _teacher_section_scope(user: dict) -> Optional[List[str]]:
    """Return list of section ids a non-admin teacher may access, or None for full access."""
    if user.get("role") in ("SUPER_ADMIN", "DIRECTOR", "VICE_DIRECTOR", "ATTENDANCE_OFFICER", "READ_ONLY_ADMIN"):
        return None
    if user.get("role") in ("TEACHER", "CLASS_SUPERVISOR") and user.get("teacher_id"):
        t = await db.teachers.find_one({"id": user["teacher_id"]}, {"_id": 0, "assigned_section_ids": 1})
        return (t or {}).get("assigned_section_ids", [])
    return []


@router.get("/students")
async def list_students(request: Request, search: Optional[str] = None, grade_id: Optional[str] = None,
                        section_id: Optional[str] = None, page: int = 1, limit: int = 20,
                        user: dict = Depends(require("students.view"))):
    q = {"deleted": {"$ne": True}}
    scope = await _teacher_section_scope(user)
    if scope is not None:
        q["section_id"] = {"$in": scope}
    if search:
        q["$or"] = [{"full_name": {"$regex": search, "$options": "i"}},
                    {"student_number": {"$regex": search, "$options": "i"}}]
    if grade_id:
        q["grade_id"] = grade_id
    if section_id:
        if scope is not None and section_id not in scope:
            raise HTTPException(status_code=403, detail="لا يمكنك الوصول لهذه الشعبة")
        q["section_id"] = section_id
    total = await db.students.count_documents(q)
    docs = await db.students.find(q, {"_id": 0}).skip((page - 1) * limit).limit(limit).sort("full_name", 1).to_list(limit)
    for d in docs:
        await _enrich_student(d)
    return {"items": docs, "total": total, "page": page, "limit": limit}


@router.get("/students/{student_id}")
async def get_student(student_id: str, user: dict = Depends(get_current_user)):
    # Students can only view themselves
    if user.get("role") == "STUDENT" and user.get("student_id") != student_id:
        raise HTTPException(status_code=403, detail="لا يمكنك الوصول لبيانات طالب آخر")
    if user.get("role") not in ("STUDENT",) and not rbac.has_permission(user, "students.view"):
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية")
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    scope = await _teacher_section_scope(user)
    if scope is not None and user.get("role") != "STUDENT" and s.get("section_id") not in scope:
        raise HTTPException(status_code=403, detail="لا يمكنك الوصول لهذا الطالب")
    await _enrich_student(s)
    # attendance stats
    records = await db.attendance_records.find({"student_id": student_id}, {"_id": 0}).to_list(5000)
    total = len(records)
    present = sum(1 for r in records if r["status"] in ("PRESENT", "LATE", "LEFT_EARLY"))
    s["stats"] = {
        "total": total,
        "present": sum(1 for r in records if r["status"] == "PRESENT"),
        "absent": sum(1 for r in records if r["status"] == "ABSENT"),
        "late": sum(1 for r in records if r["status"] == "LATE"),
        "excused": sum(1 for r in records if r["status"] == "EXCUSED"),
        "left_early": sum(1 for r in records if r["status"] == "LEFT_EARLY"),
        "attendance_rate": round(present / total * 100, 1) if total else 100.0,
    }
    return s


@router.post("/students")
async def create_student(body: StudentBody, request: Request, user: dict = Depends(require("students.create"))):
    doc = {
        "id": new_id(), "full_name": body.full_name, "student_number": body.student_number or None,
        "dob": body.dob, "gender": body.gender, "grade_id": body.grade_id, "section_id": body.section_id,
        "academic_year_id": body.academic_year_id, "guardian_name": body.guardian_name,
        "guardian_phone": body.guardian_phone, "contact_phone": body.contact_phone,
        "email": (body.email or "").lower(), "status": "active", "user_id": None,
        "deleted": False, "created_at": iso(),
    }
    if body.student_number and await db.students.find_one({"student_number": body.student_number, "deleted": {"$ne": True}}):
        raise HTTPException(status_code=400, detail="رقم الطالب مستخدم مسبقًا")
    if body.create_account and body.email and body.password:
        email = body.email.strip().lower()
        if await db.users.find_one({"email": email}):
            raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم مسبقًا")
        uid = new_id()
        await db.users.insert_one({
            "id": uid, "email": email, "username": body.username or email.split("@")[0],
            "password_hash": hash_password(body.password), "full_name": body.full_name,
            "role": "STUDENT", "permission_overrides": {"grant": [], "revoke": []},
            "status": "active", "twofa_enabled": False, "last_login": None,
            "student_id": doc["id"], "created_at": iso(),
        })
        doc["user_id"] = uid
    try:
        await db.students.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="رقم الطالب مستخدم مسبقًا")
    await log_audit(user, "create", "student", doc["id"], new_value={"name": body.full_name}, request=request)
    doc.pop("_id", None)
    return await _enrich_student(doc)


@router.patch("/students/{student_id}")
async def update_student(student_id: str, body: StudentBody, request: Request, user: dict = Depends(require("students.edit"))):
    s = await db.students.find_one({"id": student_id})
    if not s:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    updates = body.dict(exclude={"create_account", "username", "password"})
    updates["email"] = (updates.get("email") or "").lower()
    await db.students.update_one({"id": student_id}, {"$set": updates})
    if s.get("user_id"):
        await db.users.update_one({"id": s["user_id"]}, {"$set": {"full_name": body.full_name}})
    await log_audit(user, "update", "student", student_id, old_value={"section_id": s.get("section_id")},
                    new_value={"section_id": body.section_id}, request=request)
    fresh = await db.students.find_one({"id": student_id}, {"_id": 0})
    return await _enrich_student(fresh)


class MoveBody(BaseModel):
    section_id: str
    grade_id: Optional[str] = None


@router.post("/students/{student_id}/move")
async def move_student(student_id: str, body: MoveBody, request: Request, user: dict = Depends(require("students.edit"))):
    s = await db.students.find_one({"id": student_id})
    if not s:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    updates = {"section_id": body.section_id}
    if body.grade_id:
        updates["grade_id"] = body.grade_id
    await db.students.update_one({"id": student_id}, {"$set": updates})
    await log_audit(user, "move", "student", student_id, old_value={"section_id": s.get("section_id")},
                    new_value=updates, request=request)
    return {"ok": True}


@router.delete("/students/{student_id}")
async def delete_student(student_id: str, request: Request, user: dict = Depends(require("students.delete"))):
    s = await db.students.find_one({"id": student_id})
    await db.students.update_one({"id": student_id}, {"$set": {"deleted": True, "status": "archived", "student_number": None}})
    if s and s.get("user_id"):
        await db.users.update_one({"id": s["user_id"]}, {"$set": {"status": "disabled"}})
    await log_audit(user, "delete", "student", student_id, request=request)
    return {"ok": True}
