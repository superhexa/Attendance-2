"""Signup approval endpoints: Director reviews and approves student signups."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from core import db, new_id, iso, get_current_user, require, log_audit, notify

router = APIRouter(prefix="/api/signups", tags=["signups"])


async def _enrich_signup(u: dict) -> dict:
    data = u.get("pending_signup_data") or {}
    grade = await db.grades.find_one({"id": data.get("grade_id")}, {"_id": 0, "name": 1})
    section = await db.sections.find_one({"id": data.get("section_id")}, {"_id": 0, "name": 1})
    return {
        "user_id": u["id"],
        "full_name": u.get("full_name", ""),
        "email": u.get("email", ""),
        "status": u.get("status", ""),
        "created_at": u.get("created_at"),
        "signup_data": data,
        "grade_name": grade.get("name") if grade else "",
        "section_name": section.get("name") if section else "",
        "reject_reason": u.get("reject_reason", ""),
    }


@router.get("/pending")
async def list_pending(user: dict = Depends(require("signups.view", "signups.approve"))):
    docs = await db.users.find(
        {"role": "STUDENT", "status": "pending_approval"},
        {"_id": 0, "password_hash": 0, "twofa_secret": 0, "recovery_codes": 0},
    ).sort("created_at", -1).to_list(200)
    items = []
    for d in docs:
        items.append(await _enrich_signup(d))
    return {"items": items, "total": len(items)}


@router.get("/history")
async def list_history(status: str = "rejected", user: dict = Depends(require("signups.view", "signups.approve"))):
    if status not in ("rejected", "approved", "all"):
        status = "rejected"
    q = {"role": "STUDENT"}
    if status == "approved":
        q["_prev_pending"] = True
        q["status"] = "active"
    elif status == "rejected":
        q["status"] = "rejected"
    docs = await db.users.find(
        q, {"_id": 0, "password_hash": 0, "twofa_secret": 0, "recovery_codes": 0},
    ).sort("created_at", -1).limit(100).to_list(100)
    items = []
    for d in docs:
        items.append(await _enrich_signup(d))
    return {"items": items, "total": len(items)}


class ApproveBody(BaseModel):
    # Editable fields director can override before approving
    full_name: Optional[str] = None
    student_number: Optional[str] = None
    grade_id: str
    section_id: str
    dob: Optional[str] = ""
    gender: Optional[str] = "male"
    guardian_name: Optional[str] = ""
    guardian_phone: Optional[str] = ""
    contact_phone: Optional[str] = ""


@router.post("/{user_id}/approve")
async def approve_signup(user_id: str, body: ApproveBody, request: Request,
                         user: dict = Depends(require("signups.approve"))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if target.get("status") != "pending_approval":
        raise HTTPException(status_code=400, detail="هذا الطلب ليس بانتظار الموافقة")

    grade = await db.grades.find_one({"id": body.grade_id, "deleted": {"$ne": True}})
    section = await db.sections.find_one({"id": body.section_id, "deleted": {"$ne": True}})
    if not grade or not section:
        raise HTTPException(status_code=400, detail="الصف أو الشعبة غير صالحة")

    student_number = (body.student_number or "").strip() or None
    if student_number:
        clash = await db.students.find_one(
            {"student_number": student_number, "deleted": {"$ne": True}}
        )
        if clash:
            raise HTTPException(status_code=400, detail="رقم الطالب مستخدم مسبقًا")

    # Create the Student record
    full_name = (body.full_name or target.get("full_name", "")).strip()
    student_id = new_id()
    student_doc = {
        "id": student_id,
        "full_name": full_name,
        "student_number": student_number,
        "dob": body.dob or "",
        "gender": body.gender or "male",
        "grade_id": body.grade_id,
        "section_id": body.section_id,
        "academic_year_id": grade.get("academic_year_id", ""),
        "guardian_name": body.guardian_name or "",
        "guardian_phone": body.guardian_phone or "",
        "contact_phone": body.contact_phone or "",
        "email": target.get("email", ""),
        "status": "active",
        "user_id": user_id,
        "deleted": False,
        "created_at": iso(),
    }
    await db.students.insert_one(student_doc)

    # Activate the user
    updates = {
        "status": "active",
        "student_id": student_id,
        "full_name": full_name,
        "_prev_pending": True,
        "approved_at": iso(),
        "approved_by": user["id"],
    }
    await db.users.update_one({"id": user_id}, {
        "$set": updates,
        "$unset": {"pending_signup_data": ""},
    })

    await log_audit(user, "signup.approve", "user", user_id,
                    new_value={"grade_id": body.grade_id, "section_id": body.section_id}, request=request)
    await notify(user_id, "account_created",
                 "تم تفعيل حسابك",
                 "وافق مدير المدرسة على حسابك. يمكنك الآن تسجيل الدخول.")
    return {"ok": True, "student_id": student_id}


class RejectBody(BaseModel):
    reason: Optional[str] = ""


@router.post("/{user_id}/reject")
async def reject_signup(user_id: str, body: RejectBody, request: Request,
                        user: dict = Depends(require("signups.approve"))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if target.get("status") != "pending_approval":
        raise HTTPException(status_code=400, detail="هذا الطلب ليس بانتظار الموافقة")
    await db.users.update_one({"id": user_id}, {
        "$set": {
            "status": "rejected",
            "reject_reason": body.reason or "",
            "rejected_at": iso(),
            "rejected_by": user["id"],
        }
    })
    await log_audit(user, "signup.reject", "user", user_id,
                    new_value={"reason": body.reason or ""}, request=request)
    return {"ok": True}


@router.delete("/{user_id}")
async def delete_signup(user_id: str, request: Request,
                        user: dict = Depends(require("signups.approve"))):
    """Permanently delete a rejected/pending signup record."""
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if target.get("status") not in ("pending_approval", "rejected"):
        raise HTTPException(status_code=400, detail="لا يمكن حذف حساب نشط من هنا")
    await db.users.delete_one({"id": user_id})
    await log_audit(user, "signup.delete", "user", user_id, request=request)
    return {"ok": True}
