"""Core attendance: take/submit/lock, corrections workflow, QR mode, integrity checks."""
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta

from core import (
    db, new_id, iso, now_utc, get_current_user, require, log_audit,
    notify, notify_roles, get_settings,
)
import rbac

router = APIRouter(prefix="/api", tags=["attendance"])

VALID_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED", "LEFT_EARLY"]


async def _assert_teacher_owns(user: dict, entry: dict):
    """Anti-cheating: a TEACHER may only manage their own lessons."""
    if user.get("role") in ("SUPER_ADMIN", "DIRECTOR", "VICE_DIRECTOR", "ATTENDANCE_OFFICER", "CLASS_SUPERVISOR"):
        return
    if user.get("role") == "TEACHER":
        if user.get("teacher_id") != entry.get("teacher_id"):
            raise HTTPException(status_code=403, detail="لا يمكنك تسجيل حضور حصة معلم آخر")
        return
    raise HTTPException(status_code=403, detail="ليس لديك صلاحية تسجيل الحضور")


class RecordItem(BaseModel):
    student_id: str
    status: str
    note: Optional[str] = ""


class SubmitBody(BaseModel):
    timetable_id: str
    date: str
    records: List[RecordItem]


@router.get("/attendance/roster")
async def get_roster(timetable_id: str, date: str, user: dict = Depends(require("attendance.view", "attendance.create"))):
    entry = await db.timetable.find_one({"id": timetable_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="الحصة غير موجودة")
    await _assert_teacher_owns(user, entry)
    students = await db.students.find(
        {"section_id": entry["section_id"], "deleted": {"$ne": True}}, {"_id": 0}
    ).sort("full_name", 1).to_list(500)
    session = await db.attendance_sessions.find_one({"timetable_id": timetable_id, "date": date}, {"_id": 0})
    existing = {}
    if session:
        recs = await db.attendance_records.find({"timetable_id": timetable_id, "date": date}, {"_id": 0}).to_list(1000)
        existing = {r["student_id"]: r for r in recs}
    roster = []
    for s in students:
        prev = existing.get(s["id"])
        roster.append({
            "student_id": s["id"], "full_name": s["full_name"],
            "student_number": s.get("student_number"),
            "status": prev["status"] if prev else "PRESENT",
            "note": prev.get("note", "") if prev else "",
        })
    subj = await db.subjects.find_one({"id": entry["subject_id"]}, {"_id": 0, "name": 1})
    section = await db.sections.find_one({"id": entry["section_id"]}, {"_id": 0, "name": 1})
    grade = await db.grades.find_one({"id": entry["grade_id"]}, {"_id": 0, "name": 1})
    return {
        "lesson": {
            "timetable_id": timetable_id, "date": date, "period": entry["period"],
            "start_time": entry.get("start_time"), "end_time": entry.get("end_time"),
            "subject_name": subj["name"] if subj else "", "section_name": section["name"] if section else "",
            "grade_name": grade["name"] if grade else "", "classroom": entry.get("classroom", ""),
        },
        "session": session,
        "locked": bool(session and session.get("status") == "locked"),
        "roster": roster,
    }


@router.post("/attendance")
async def submit_attendance(body: SubmitBody, request: Request, user: dict = Depends(require("attendance.create"))):
    entry = await db.timetable.find_one({"id": body.timetable_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="الحصة غير موجودة")
    await _assert_teacher_owns(user, entry)

    existing = await db.attendance_sessions.find_one({"timetable_id": body.timetable_id, "date": body.date})
    if existing and existing.get("status") == "locked":
        raise HTTPException(status_code=409, detail="تم قفل هذا الحضور. يرجى طلب تصحيح")

    for r in body.records:
        if r.status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"حالة غير صالحة: {r.status}")

    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "")
    ua = request.headers.get("user-agent", "")
    session_id = existing["id"] if existing else new_id()
    session_doc = {
        "id": session_id, "timetable_id": body.timetable_id, "date": body.date,
        "teacher_id": entry["teacher_id"], "section_id": entry["section_id"],
        "subject_id": entry["subject_id"], "grade_id": entry["grade_id"], "period": entry["period"],
        "status": "locked", "submitted_by": user["id"], "submitted_by_name": user["full_name"],
        "submitted_at": iso(), "ip": (ip or "").split(",")[0].strip(), "user_agent": ua,
    }
    await db.attendance_sessions.update_one(
        {"timetable_id": body.timetable_id, "date": body.date},
        {"$set": session_doc}, upsert=True,
    )
    # replace records
    await db.attendance_records.delete_many({"timetable_id": body.timetable_id, "date": body.date})
    docs = []
    for r in body.records:
        docs.append({
            "id": new_id(), "session_id": session_id, "timetable_id": body.timetable_id,
            "date": body.date, "student_id": r.student_id, "section_id": entry["section_id"],
            "subject_id": entry["subject_id"], "teacher_id": entry["teacher_id"],
            "grade_id": entry["grade_id"], "status": r.status, "note": r.note or "",
            "created_at": iso(),
        })
    if docs:
        await db.attendance_records.insert_many(docs)

    await log_audit(user, "attendance.create", "attendance_session", session_id,
                    new_value={"count": len(docs), "date": body.date}, request=request)

    # Absence alerts + notify guardians (in-app to student account) + admins
    settings = await get_settings()
    thresholds = settings["absence_thresholds"]
    absent_students = [r for r in body.records if r.status == "ABSENT"]
    for r in absent_students:
        stu = await db.students.find_one({"id": r.student_id}, {"_id": 0})
        if not stu:
            continue
        total_absences = await db.attendance_records.count_documents({"student_id": r.student_id, "status": "ABSENT"})
        level = None
        if total_absences >= thresholds["critical"]:
            level = ("critical", "تنبيه حرج")
        elif total_absences >= thresholds["alert"]:
            level = ("alert", "تنبيه")
        elif total_absences >= thresholds["warning"]:
            level = ("warning", "تحذير")
        if level and stu.get("user_id"):
            await notify(stu["user_id"], "repeated_absence", f"{level[1]}: غياب متكرر",
                         f"لديك {total_absences} حالات غياب مسجلة")
        if level:
            await notify_roles(["DIRECTOR", "CLASS_SUPERVISOR", "ATTENDANCE_OFFICER"], "repeated_absence",
                               f"{level[1]}: {stu['full_name']}", f"عدد الغيابات: {total_absences}")

    return {"ok": True, "session_id": session_id, "records": len(docs)}


# ---------------- Correction workflow ----------------
class CorrectionBody(BaseModel):
    session_id: str
    student_id: str
    new_status: str
    reason: str


@router.post("/attendance/correction-request")
async def request_correction(body: CorrectionBody, request: Request, user: dict = Depends(require("attendance.view", "attendance.create"))):
    rec = await db.attendance_records.find_one({"session_id": body.session_id, "student_id": body.student_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="السجل غير موجود")
    if user.get("role") == "TEACHER" and user.get("teacher_id") != rec.get("teacher_id"):
        raise HTTPException(status_code=403, detail="لا يمكنك طلب تصحيح لحصة معلم آخر")
    if body.new_status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    doc = {
        "id": new_id(), "session_id": body.session_id, "record_id": rec["id"],
        "student_id": body.student_id, "date": rec["date"], "timetable_id": rec["timetable_id"],
        "old_status": rec["status"], "new_status": body.new_status, "reason": body.reason,
        "requested_by": user["id"], "requested_by_name": user["full_name"],
        "status": "pending", "reviewed_by": None, "reviewed_at": None, "created_at": iso(),
    }
    await db.attendance_change_requests.insert_one(doc)
    await log_audit(user, "attendance.correction_request", "attendance_record", rec["id"],
                    old_value={"status": rec["status"]}, new_value={"status": body.new_status},
                    reason=body.reason, request=request)
    await notify_roles(["DIRECTOR", "ATTENDANCE_OFFICER"], "attendance_correction",
                       "طلب تصحيح حضور جديد", f"طلب من {user['full_name']} تصحيح حضور طالب")
    doc.pop("_id", None)
    return doc


@router.get("/attendance/corrections")
async def list_corrections(status: Optional[str] = None, user: dict = Depends(require("attendance.approve", "attendance.view"))):
    q = {}
    if status:
        q["status"] = status
    if user.get("role") == "TEACHER":
        q["requested_by"] = user["id"]
    reqs = await db.attendance_change_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
    for r in reqs:
        stu = await db.students.find_one({"id": r["student_id"]}, {"_id": 0, "full_name": 1})
        r["student_name"] = stu["full_name"] if stu else ""
    return reqs


class ReviewBody(BaseModel):
    action: str  # approve | reject
    reason: Optional[str] = ""


@router.post("/attendance/corrections/{req_id}/review")
async def review_correction(req_id: str, body: ReviewBody, request: Request, user: dict = Depends(require("attendance.approve"))):
    req = await db.attendance_change_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="تمت مراجعة الطلب مسبقًا")
    if body.action == "approve":
        await db.attendance_records.update_one(
            {"id": req["record_id"]}, {"$set": {"status": req["new_status"], "updated_at": iso()}})
        await db.attendance_change_requests.update_one(
            {"id": req_id}, {"$set": {"status": "approved", "reviewed_by": user["id"],
                                      "reviewer_name": user["full_name"], "reviewed_at": iso(), "review_reason": body.reason}})
        await log_audit(user, "attendance.correction_approve", "attendance_record", req["record_id"],
                        old_value={"status": req["old_status"]}, new_value={"status": req["new_status"]},
                        reason=body.reason, request=request)
        await notify(req["requested_by"], "attendance_correction", "تمت الموافقة على التصحيح",
                     f"تمت الموافقة على طلب تصحيح الحضور")
    else:
        await db.attendance_change_requests.update_one(
            {"id": req_id}, {"$set": {"status": "rejected", "reviewed_by": user["id"],
                                      "reviewer_name": user["full_name"], "reviewed_at": iso(), "review_reason": body.reason}})
        await log_audit(user, "attendance.correction_reject", "attendance_record", req["record_id"],
                        reason=body.reason, request=request)
        await notify(req["requested_by"], "attendance_correction", "تم رفض التصحيح",
                     f"تم رفض طلب تصحيح الحضور. السبب: {body.reason or 'غير محدد'}")
    return {"ok": True}


# ---------------- Direct admin edit ----------------
class DirectEditBody(BaseModel):
    status: str
    reason: str


@router.patch("/attendance/{record_id}")
async def direct_edit(record_id: str, body: DirectEditBody, request: Request, user: dict = Depends(require("attendance.edit"))):
    rec = await db.attendance_records.find_one({"id": record_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="السجل غير موجود")
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    await db.attendance_records.update_one({"id": record_id}, {"$set": {"status": body.status, "updated_at": iso()}})
    await log_audit(user, "attendance.modify", "attendance_record", record_id,
                    old_value={"status": rec["status"]}, new_value={"status": body.status},
                    reason=body.reason, request=request)
    return {"ok": True}


# ---------------- QR attendance ----------------
class QRGenBody(BaseModel):
    timetable_id: str
    date: str


@router.post("/attendance/qr/generate")
async def qr_generate(body: QRGenBody, request: Request, user: dict = Depends(require("attendance.create"))):
    settings = await get_settings()
    if not settings.get("qr_enabled"):
        raise HTTPException(status_code=400, detail="ميزة الحضور عبر QR غير مفعّلة")
    entry = await db.timetable.find_one({"id": body.timetable_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="الحصة غير موجودة")
    await _assert_teacher_owns(user, entry)
    code = secrets.token_urlsafe(12)
    doc = {
        "id": new_id(), "code": code, "timetable_id": body.timetable_id, "date": body.date,
        "section_id": entry["section_id"], "subject_id": entry["subject_id"], "teacher_id": entry["teacher_id"],
        "grade_id": entry["grade_id"], "period": entry["period"],
        "expires_at": (now_utc() + timedelta(minutes=5)).isoformat(), "used_by": [], "created_by": user["id"],
        "created_at": iso(),
    }
    await db.qr_sessions.insert_one(doc)
    await log_audit(user, "attendance.qr_generate", "qr_session", doc["id"], request=request)
    return {"code": code, "expires_at": doc["expires_at"], "timetable_id": body.timetable_id}


class QRScanBody(BaseModel):
    code: str


@router.post("/attendance/qr/scan")
async def qr_scan(body: QRScanBody, request: Request, user: dict = Depends(get_current_user)):
    if user.get("role") != "STUDENT" or not user.get("student_id"):
        raise HTTPException(status_code=403, detail="مسح QR متاح للطلاب فقط")
    qr = await db.qr_sessions.find_one({"code": body.code}, {"_id": 0})
    if not qr:
        raise HTTPException(status_code=404, detail="رمز غير صالح")
    if qr["expires_at"] < iso():
        raise HTTPException(status_code=410, detail="انتهت صلاحية الرمز")
    stu = await db.students.find_one({"id": user["student_id"]}, {"_id": 0})
    if not stu or stu.get("section_id") != qr["section_id"]:
        raise HTTPException(status_code=403, detail="هذا الرمز ليس لشعبتك")
    if user["student_id"] in qr.get("used_by", []):
        raise HTTPException(status_code=409, detail="تم تسجيل حضورك مسبقًا")
    # mark present
    session = await db.attendance_sessions.find_one({"timetable_id": qr["timetable_id"], "date": qr["date"]})
    session_id = session["id"] if session else new_id()
    if not session:
        await db.attendance_sessions.insert_one({
            "id": session_id, "timetable_id": qr["timetable_id"], "date": qr["date"],
            "teacher_id": qr["teacher_id"], "section_id": qr["section_id"], "subject_id": qr["subject_id"],
            "grade_id": qr["grade_id"], "period": qr["period"], "status": "submitted",
            "submitted_by": qr["created_by"], "submitted_at": iso(), "qr_mode": True,
        })
    await db.attendance_records.update_one(
        {"timetable_id": qr["timetable_id"], "date": qr["date"], "student_id": user["student_id"]},
        {"$set": {"id": new_id(), "session_id": session_id, "timetable_id": qr["timetable_id"],
                  "date": qr["date"], "student_id": user["student_id"], "section_id": qr["section_id"],
                  "subject_id": qr["subject_id"], "teacher_id": qr["teacher_id"], "grade_id": qr["grade_id"],
                  "status": "PRESENT", "note": "QR", "created_at": iso()}}, upsert=True)
    await db.qr_sessions.update_one({"id": qr["id"]}, {"$push": {"used_by": user["student_id"]}})
    await log_audit(user, "attendance.qr_scan", "attendance_record", session_id, request=request)
    return {"ok": True, "status": "PRESENT"}


# ---------------- Attendance queries ----------------
@router.get("/attendance")
async def query_attendance(student_id: Optional[str] = None, section_id: Optional[str] = None,
                           date: Optional[str] = None, status: Optional[str] = None,
                           date_from: Optional[str] = None, date_to: Optional[str] = None,
                           user: dict = Depends(require("attendance.view"))):
    q = {}
    if user.get("role") == "STUDENT":
        q["student_id"] = user.get("student_id")
    elif student_id:
        q["student_id"] = student_id
    if section_id:
        q["section_id"] = section_id
    if date:
        q["date"] = date
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    if status:
        q["status"] = status
    recs = await db.attendance_records.find(q, {"_id": 0}).sort("date", -1).limit(1000).to_list(1000)
    for r in recs:
        subj = await db.subjects.find_one({"id": r["subject_id"]}, {"_id": 0, "name": 1})
        teacher = await db.teachers.find_one({"id": r["teacher_id"]}, {"_id": 0, "full_name": 1})
        r["subject_name"] = subj["name"] if subj else ""
        r["teacher_name"] = teacher["full_name"] if teacher else ""
    return recs
