"""Timetable (recurring schedule) with conflict detection + today's lessons."""
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone

from core import db, new_id, iso, get_current_user, require, log_audit

router = APIRouter(prefix="/api", tags=["timetable"])

DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]


class TimetableBody(BaseModel):
    academic_year_id: str
    day_of_week: int  # 0=Sunday .. 6=Saturday
    period: int
    start_time: str  # "08:00"
    end_time: str    # "08:45"
    subject_id: str
    teacher_id: str
    grade_id: str
    section_id: str
    classroom: Optional[str] = ""


async def _enrich_tt(e: dict) -> dict:
    subj = await db.subjects.find_one({"id": e.get("subject_id")}, {"_id": 0, "name": 1})
    teacher = await db.teachers.find_one({"id": e.get("teacher_id")}, {"_id": 0, "full_name": 1})
    section = await db.sections.find_one({"id": e.get("section_id")}, {"_id": 0, "name": 1})
    grade = await db.grades.find_one({"id": e.get("grade_id")}, {"_id": 0, "name": 1})
    e["subject_name"] = subj["name"] if subj else ""
    e["teacher_name"] = teacher["full_name"] if teacher else ""
    e["section_name"] = section["name"] if section else ""
    e["grade_name"] = grade["name"] if grade else ""
    e["day_name"] = DAY_NAMES[e["day_of_week"]] if 0 <= e.get("day_of_week", -1) <= 6 else ""
    return e


@router.get("/timetable")
async def list_timetable(academic_year_id: Optional[str] = None, teacher_id: Optional[str] = None,
                         section_id: Optional[str] = None, day_of_week: Optional[int] = None,
                         user: dict = Depends(get_current_user)):
    q = {"deleted": {"$ne": True}}
    if academic_year_id:
        q["academic_year_id"] = academic_year_id
    if teacher_id:
        q["teacher_id"] = teacher_id
    if section_id:
        q["section_id"] = section_id
    if day_of_week is not None:
        q["day_of_week"] = day_of_week
    entries = await db.timetable.find(q, {"_id": 0}).sort([("day_of_week", 1), ("period", 1)]).to_list(2000)
    for e in entries:
        await _enrich_tt(e)
    return entries


@router.post("/timetable")
async def create_timetable(body: TimetableBody, request: Request, user: dict = Depends(require("timetable.create"))):
    # Conflict: same teacher same day+period
    teacher_conflict = await db.timetable.find_one({
        "deleted": {"$ne": True}, "academic_year_id": body.academic_year_id,
        "day_of_week": body.day_of_week, "period": body.period, "teacher_id": body.teacher_id,
    })
    if teacher_conflict:
        raise HTTPException(status_code=409, detail="تعارض: المعلم مسند لحصة أخرى في نفس اليوم والحصة")
    section_conflict = await db.timetable.find_one({
        "deleted": {"$ne": True}, "academic_year_id": body.academic_year_id,
        "day_of_week": body.day_of_week, "period": body.period, "section_id": body.section_id,
    })
    if section_conflict:
        raise HTTPException(status_code=409, detail="تعارض: الشعبة لديها حصة أخرى في نفس اليوم والحصة")
    doc = {"id": new_id(), **body.dict(), "deleted": False, "created_at": iso()}
    await db.timetable.insert_one(doc)
    await log_audit(user, "create", "timetable", doc["id"], new_value=body.dict(), request=request)
    doc.pop("_id", None)
    return await _enrich_tt(doc)


@router.patch("/timetable/{entry_id}")
async def update_timetable(entry_id: str, body: TimetableBody, request: Request, user: dict = Depends(require("timetable.edit"))):
    conflict = await db.timetable.find_one({
        "id": {"$ne": entry_id}, "deleted": {"$ne": True}, "academic_year_id": body.academic_year_id,
        "day_of_week": body.day_of_week, "period": body.period,
        "$or": [{"teacher_id": body.teacher_id}, {"section_id": body.section_id}],
    })
    if conflict:
        raise HTTPException(status_code=409, detail="تعارض في الجدول مع حصة أخرى")
    await db.timetable.update_one({"id": entry_id}, {"$set": body.dict()})
    await log_audit(user, "update", "timetable", entry_id, new_value=body.dict(), request=request)
    return {"ok": True}


@router.delete("/timetable/{entry_id}")
async def delete_timetable(entry_id: str, request: Request, user: dict = Depends(require("timetable.delete"))):
    await db.timetable.update_one({"id": entry_id}, {"$set": {"deleted": True}})
    await log_audit(user, "delete", "timetable", entry_id, request=request)
    return {"ok": True}


def _weekday_sunday_based(dt: datetime) -> int:
    # Python weekday(): Mon=0..Sun=6 -> convert to Sun=0..Sat=6
    return (dt.weekday() + 1) % 7


@router.get("/lessons/today")
async def lessons_today(date: Optional[str] = None, user: dict = Depends(get_current_user)):
    if date:
        target = datetime.fromisoformat(date)
    else:
        target = datetime.now(timezone.utc)
    dow = _weekday_sunday_based(target)
    date_str = target.strftime("%Y-%m-%d")
    q = {"deleted": {"$ne": True}, "day_of_week": dow}

    if user.get("role") == "TEACHER" and user.get("teacher_id"):
        q["teacher_id"] = user["teacher_id"]
    elif user.get("role") == "STUDENT" and user.get("student_id"):
        stu = await db.students.find_one({"id": user["student_id"]}, {"_id": 0, "section_id": 1})
        q["section_id"] = (stu or {}).get("section_id", "__none__")

    entries = await db.timetable.find(q, {"_id": 0}).sort("period", 1).to_list(500)
    result = []
    for e in entries:
        await _enrich_tt(e)
        session = await db.attendance_sessions.find_one({"timetable_id": e["id"], "date": date_str}, {"_id": 0})
        e["attendance_status"] = session["status"] if session else "pending"
        e["date"] = date_str
        result.append(e)
    return result


@router.get("/lessons/{entry_id}")
async def get_lesson(entry_id: str, date: Optional[str] = None, user: dict = Depends(get_current_user)):
    e = await db.timetable.find_one({"id": entry_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="الحصة غير موجودة")
    await _enrich_tt(e)
    return e
