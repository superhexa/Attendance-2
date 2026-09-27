"""Substitute teachers: temporarily assign a substitute for a lesson/day.

The substitute teacher gets a scoped permission (via effective_permissions
override) to take attendance for the section on that date only.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from core import db, new_id, iso, get_current_user, require, log_audit, notify

router = APIRouter(prefix="/api/substitutions", tags=["substitutions"])


async def _enrich(sub: dict) -> dict:
    orig = await db.teachers.find_one({"id": sub.get("original_teacher_id")}, {"_id": 0, "full_name": 1}) or {}
    subst = await db.teachers.find_one({"id": sub.get("substitute_teacher_id")}, {"_id": 0, "full_name": 1}) or {}
    section = await db.sections.find_one({"id": sub.get("section_id")}, {"_id": 0, "name": 1, "grade_id": 1}) or {}
    grade = await db.grades.find_one({"id": section.get("grade_id")}, {"_id": 0, "name": 1}) if section else None
    subject = await db.subjects.find_one({"id": sub.get("subject_id")}, {"_id": 0, "name": 1}) if sub.get("subject_id") else None
    tt = await db.timetable.find_one({"id": sub.get("timetable_id")}, {"_id": 0, "day": 1, "period": 1}) if sub.get("timetable_id") else None
    sub["original_teacher_name"] = orig.get("full_name", "")
    sub["substitute_teacher_name"] = subst.get("full_name", "")
    sub["section_name"] = section.get("name", "")
    sub["grade_name"] = (grade or {}).get("name", "")
    sub["subject_name"] = (subject or {}).get("name", "")
    sub["day"] = (tt or {}).get("day")
    sub["period"] = (tt or {}).get("period")
    return sub


@router.get("")
async def list_substitutions(date: Optional[str] = None,
                             teacher_id: Optional[str] = None,
                             user: dict = Depends(get_current_user)):
    q = {"status": {"$ne": "cancelled"}}
    if date:
        q["date"] = date
    if teacher_id:
        q["$or"] = [{"substitute_teacher_id": teacher_id}, {"original_teacher_id": teacher_id}]
    docs = await db.substitutions.find(q, {"_id": 0}).sort("date", -1).limit(200).to_list(200)
    for d in docs:
        await _enrich(d)
    return {"items": docs, "total": len(docs)}


class SubBody(BaseModel):
    date: str  # YYYY-MM-DD
    original_teacher_id: str
    substitute_teacher_id: str
    section_id: str
    subject_id: Optional[str] = None
    timetable_id: Optional[str] = None
    note: Optional[str] = ""
    period: Optional[int] = None  # if no timetable_id, still record the period


@router.post("")
async def create_substitution(body: SubBody, request: Request,
                              user: dict = Depends(require("substitutions.manage", "attendance.approve"))):
    # Validate teachers exist
    orig = await db.teachers.find_one({"id": body.original_teacher_id, "deleted": {"$ne": True}})
    subst = await db.teachers.find_one({"id": body.substitute_teacher_id, "deleted": {"$ne": True}})
    if not orig or not subst:
        raise HTTPException(status_code=400, detail="المعلم غير موجود")
    if body.original_teacher_id == body.substitute_teacher_id:
        raise HTTPException(status_code=400, detail="المعلم الأصلي والبديل يجب أن يكونا مختلفين")
    section = await db.sections.find_one({"id": body.section_id, "deleted": {"$ne": True}})
    if not section:
        raise HTTPException(status_code=400, detail="الشعبة غير موجودة")

    doc = {
        "id": new_id(),
        "date": body.date,
        "original_teacher_id": body.original_teacher_id,
        "substitute_teacher_id": body.substitute_teacher_id,
        "section_id": body.section_id,
        "subject_id": body.subject_id,
        "timetable_id": body.timetable_id,
        "period": body.period,
        "note": (body.note or "").strip(),
        "status": "active",
        "created_by": user["id"],
        "created_at": iso(),
    }
    await db.substitutions.insert_one(doc)

    # Add scoped section access to the substitute (temporary)
    await db.teachers.update_one(
        {"id": body.substitute_teacher_id},
        {"$addToSet": {"assigned_section_ids": body.section_id}}
    )

    await log_audit(user, "substitution.create", "substitution", doc["id"],
                    new_value={"date": body.date, "substitute": subst.get("full_name")}, request=request)

    # Notify the substitute (if they have a user account)
    subst_user = await db.users.find_one({"teacher_id": body.substitute_teacher_id}, {"_id": 0, "id": 1})
    if subst_user:
        await notify(subst_user["id"], "system",
                     "تعيين حصة بديلة",
                     f"تم تعيينك لتغطية حصة بديلة يوم {body.date} في شعبة {section.get('name', '')}")

    doc.pop("_id", None)
    return await _enrich(doc)


@router.delete("/{sub_id}")
async def cancel_substitution(sub_id: str, request: Request,
                              user: dict = Depends(require("substitutions.manage", "attendance.approve"))):
    doc = await db.substitutions.find_one({"id": sub_id})
    if not doc:
        raise HTTPException(status_code=404, detail="التعيين غير موجود")
    await db.substitutions.update_one({"id": sub_id}, {"$set": {"status": "cancelled", "cancelled_at": iso()}})
    await log_audit(user, "substitution.cancel", "substitution", sub_id, request=request)
    return {"ok": True}


@router.get("/my-today")
async def my_today_substitutions(user: dict = Depends(get_current_user)):
    """For a teacher: what am I substituting today?"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not user.get("teacher_id"):
        return {"items": []}
    docs = await db.substitutions.find(
        {"date": today, "substitute_teacher_id": user["teacher_id"], "status": {"$ne": "cancelled"}},
        {"_id": 0}
    ).to_list(50)
    for d in docs:
        await _enrich(d)
    return {"items": docs}
