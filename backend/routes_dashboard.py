"""Dashboards, analytics, reports, notifications, announcements, audit, search, settings."""
import io
import csv
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta

from core import db, new_id, iso, now_utc, get_current_user, require, log_audit, notify, notify_roles, get_settings, DEFAULT_SETTINGS
import rbac

router = APIRouter(prefix="/api", tags=["dashboard"])

DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]


def _weekday_sunday_based(dt: datetime) -> int:
    return (dt.weekday() + 1) % 7


def _today_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ==================== Director dashboard ====================
@router.get("/dashboard/admin")
async def admin_dashboard(user: dict = Depends(require("dashboard.admin", "dashboard.teacher"))):
    today = _today_str()
    dow = _weekday_sunday_based(datetime.now(timezone.utc))

    total_students = await db.students.count_documents({"deleted": {"$ne": True}})
    total_teachers = await db.teachers.count_documents({"deleted": {"$ne": True}})
    active_sections = await db.sections.count_documents({"deleted": {"$ne": True}})
    today_lessons = await db.timetable.count_documents({"deleted": {"$ne": True}, "day_of_week": dow})

    todays_records = await db.attendance_records.find({"date": today}, {"_id": 0}).to_list(10000)
    total_marked = len(todays_records)
    present = sum(1 for r in todays_records if r["status"] in ("PRESENT", "LATE", "LEFT_EARLY"))
    absent = sum(1 for r in todays_records if r["status"] == "ABSENT")
    late = sum(1 for r in todays_records if r["status"] == "LATE")
    rate = round(present / total_marked * 100, 1) if total_marked else 0.0

    # teachers who haven't submitted today's lessons
    today_entries = await db.timetable.find({"deleted": {"$ne": True}, "day_of_week": dow}, {"_id": 0}).to_list(1000)
    submitted_ids = set()
    async for s in db.attendance_sessions.find({"date": today}, {"_id": 0, "timetable_id": 1}):
        submitted_ids.add(s["timetable_id"])
    pending_entries = [e for e in today_entries if e["id"] not in submitted_ids]
    pending_teacher_ids = list({e["teacher_id"] for e in pending_entries})
    pending_teachers = []
    for tid in pending_teacher_ids[:20]:
        t = await db.teachers.find_one({"id": tid}, {"_id": 0, "full_name": 1, "id": 1})
        if t:
            cnt = sum(1 for e in pending_entries if e["teacher_id"] == tid)
            pending_teachers.append({"id": tid, "full_name": t["full_name"], "pending": cnt})

    # weekly trend (last 7 days)
    weekly = []
    for i in range(6, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        recs = await db.attendance_records.find({"date": d}, {"_id": 0, "status": 1}).to_list(10000)
        tot = len(recs)
        pres = sum(1 for r in recs if r["status"] in ("PRESENT", "LATE", "LEFT_EARLY"))
        weekly.append({"date": d, "rate": round(pres / tot * 100, 1) if tot else 0, "present": pres, "absent": tot - pres})

    # most absent students
    pipeline = [{"$match": {"status": "ABSENT"}}, {"$group": {"_id": "$student_id", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}, {"$limit": 8}]
    most_absent = []
    async for row in db.attendance_records.aggregate(pipeline):
        stu = await db.students.find_one({"id": row["_id"]}, {"_id": 0, "full_name": 1, "id": 1})
        if stu:
            most_absent.append({"id": stu["id"], "full_name": stu["full_name"], "absences": row["count"]})

    # class comparison
    class_comp = []
    sections = await db.sections.find({"deleted": {"$ne": True}}, {"_id": 0}).to_list(100)
    for sec in sections[:12]:
        recs = await db.attendance_records.find({"section_id": sec["id"]}, {"_id": 0, "status": 1}).to_list(20000)
        tot = len(recs)
        pres = sum(1 for r in recs if r["status"] in ("PRESENT", "LATE", "LEFT_EARLY"))
        grade = await db.grades.find_one({"id": sec.get("grade_id")}, {"_id": 0, "name": 1})
        class_comp.append({"name": f"{grade['name'] if grade else ''} {sec['name']}",
                           "rate": round(pres / tot * 100, 1) if tot else 0})
    class_comp.sort(key=lambda x: x["rate"], reverse=True)

    return {
        "kpis": {
            "total_students": total_students, "total_teachers": total_teachers,
            "active_sections": active_sections, "today_lessons": today_lessons,
            "today_attendance_rate": rate, "today_absences": absent, "today_late": late,
            "pending_teacher_count": len(pending_teacher_ids), "marked_today": total_marked,
        },
        "pending_teachers": pending_teachers,
        "weekly_trend": weekly,
        "most_absent": most_absent,
        "class_comparison": class_comp[:8],
    }


@router.get("/dashboard/teacher")
async def teacher_dashboard(user: dict = Depends(require("dashboard.teacher"))):
    if not user.get("teacher_id"):
        return {"today_lessons": [], "stats": {}}
    today = _today_str()
    dow = _weekday_sunday_based(datetime.now(timezone.utc))
    entries = await db.timetable.find({"deleted": {"$ne": True}, "day_of_week": dow, "teacher_id": user["teacher_id"]},
                                      {"_id": 0}).sort("period", 1).to_list(50)
    lessons = []
    submitted = 0
    for e in entries:
        subj = await db.subjects.find_one({"id": e["subject_id"]}, {"_id": 0, "name": 1})
        section = await db.sections.find_one({"id": e["section_id"]}, {"_id": 0, "name": 1})
        grade = await db.grades.find_one({"id": e["grade_id"]}, {"_id": 0, "name": 1})
        session = await db.attendance_sessions.find_one({"timetable_id": e["id"], "date": today}, {"_id": 0})
        if session:
            submitted += 1
        lessons.append({
            "timetable_id": e["id"], "period": e["period"], "start_time": e.get("start_time"),
            "end_time": e.get("end_time"), "subject_name": subj["name"] if subj else "",
            "section_name": section["name"] if section else "", "grade_name": grade["name"] if grade else "",
            "classroom": e.get("classroom", ""), "date": today,
            "status": session["status"] if session else "pending",
        })
    total_sessions = await db.attendance_sessions.count_documents({"teacher_id": user["teacher_id"]})
    return {
        "today_lessons": lessons,
        "stats": {
            "today_total": len(entries), "today_submitted": submitted,
            "today_pending": len(entries) - submitted, "total_sessions": total_sessions,
            "submission_rate": round(submitted / len(entries) * 100, 1) if entries else 100.0,
        },
    }


@router.get("/dashboard/student")
async def student_dashboard(user: dict = Depends(get_current_user)):
    if user.get("role") != "STUDENT" or not user.get("student_id"):
        raise HTTPException(status_code=403, detail="متاح للطلاب فقط")
    sid = user["student_id"]
    stu = await db.students.find_one({"id": sid}, {"_id": 0})
    records = await db.attendance_records.find({"student_id": sid}, {"_id": 0}).to_list(5000)
    total = len(records)
    present = sum(1 for r in records if r["status"] in ("PRESENT", "LATE", "LEFT_EARLY"))
    today = _today_str()
    dow = _weekday_sunday_based(datetime.now(timezone.utc))
    section_id = (stu or {}).get("section_id")
    entries = await db.timetable.find({"deleted": {"$ne": True}, "day_of_week": dow, "section_id": section_id},
                                      {"_id": 0}).sort("period", 1).to_list(50)
    today_classes = []
    for e in entries:
        subj = await db.subjects.find_one({"id": e["subject_id"]}, {"_id": 0, "name": 1})
        rec = await db.attendance_records.find_one({"timetable_id": e["id"], "date": today, "student_id": sid}, {"_id": 0})
        today_classes.append({"period": e["period"], "start_time": e.get("start_time"),
                              "subject_name": subj["name"] if subj else "",
                              "status": rec["status"] if rec else "pending"})
    return {
        "student": {"full_name": (stu or {}).get("full_name"), "grade_id": (stu or {}).get("grade_id")},
        "stats": {
            "attendance_rate": round(present / total * 100, 1) if total else 100.0,
            "total_absences": sum(1 for r in records if r["status"] == "ABSENT"),
            "excused": sum(1 for r in records if r["status"] == "EXCUSED"),
            "late": sum(1 for r in records if r["status"] == "LATE"),
            "total": total,
        },
        "today_classes": today_classes,
    }


# ==================== Analytics ====================
@router.get("/analytics")
async def analytics(days: int = 30, user: dict = Depends(require("reports.view", "dashboard.admin"))):
    trend = []
    for i in range(days - 1, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        recs = await db.attendance_records.find({"date": d}, {"_id": 0, "status": 1}).to_list(20000)
        tot = len(recs)
        pres = sum(1 for r in recs if r["status"] in ("PRESENT", "LATE", "LEFT_EARLY"))
        if tot:
            trend.append({"date": d, "rate": round(pres / tot * 100, 1)})
    # distribution
    all_recs = await db.attendance_records.find({}, {"_id": 0, "status": 1}).to_list(50000)
    dist = {s: sum(1 for r in all_recs if r["status"] == s) for s in ["PRESENT", "ABSENT", "LATE", "EXCUSED", "LEFT_EARLY"]}
    # subject comparison
    subj_comp = []
    subjects = await db.subjects.find({"deleted": {"$ne": True}}, {"_id": 0}).to_list(50)
    for sub in subjects:
        recs = await db.attendance_records.find({"subject_id": sub["id"]}, {"_id": 0, "status": 1}).to_list(20000)
        tot = len(recs)
        pres = sum(1 for r in recs if r["status"] in ("PRESENT", "LATE", "LEFT_EARLY"))
        if tot:
            subj_comp.append({"name": sub["name"], "rate": round(pres / tot * 100, 1), "records": tot})
    return {"trend": trend, "distribution": dist, "subject_comparison": subj_comp}


# ==================== Reports + Export ====================
@router.get("/reports/attendance")
async def report_attendance(date_from: Optional[str] = None, date_to: Optional[str] = None,
                            grade_id: Optional[str] = None, section_id: Optional[str] = None,
                            subject_id: Optional[str] = None, student_id: Optional[str] = None,
                            teacher_id: Optional[str] = None, status: Optional[str] = None,
                            user: dict = Depends(require("reports.view"))):
    q = {}
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    for k, v in [("grade_id", grade_id), ("section_id", section_id), ("subject_id", subject_id),
                 ("student_id", student_id), ("teacher_id", teacher_id), ("status", status)]:
        if v:
            q[k] = v
    recs = await db.attendance_records.find(q, {"_id": 0}).sort("date", -1).limit(5000).to_list(5000)
    # enrich + summarize
    summary = {s: 0 for s in ["PRESENT", "ABSENT", "LATE", "EXCUSED", "LEFT_EARLY"]}
    rows = []
    for r in recs:
        summary[r["status"]] = summary.get(r["status"], 0) + 1
        stu = await db.students.find_one({"id": r["student_id"]}, {"_id": 0, "full_name": 1, "student_number": 1})
        subj = await db.subjects.find_one({"id": r["subject_id"]}, {"_id": 0, "name": 1})
        teacher = await db.teachers.find_one({"id": r["teacher_id"]}, {"_id": 0, "full_name": 1})
        rows.append({
            "date": r["date"], "student_name": stu["full_name"] if stu else "",
            "student_number": (stu or {}).get("student_number", ""),
            "subject_name": subj["name"] if subj else "", "teacher_name": teacher["full_name"] if teacher else "",
            "status": r["status"], "note": r.get("note", ""),
        })
    total = len(rows)
    present = summary["PRESENT"] + summary["LATE"] + summary["LEFT_EARLY"]
    return {"rows": rows, "summary": summary, "total": total,
            "attendance_rate": round(present / total * 100, 1) if total else 0}


@router.get("/reports/attendance/export")
async def export_attendance(request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None,
                            grade_id: Optional[str] = None, section_id: Optional[str] = None,
                            subject_id: Optional[str] = None, student_id: Optional[str] = None,
                            teacher_id: Optional[str] = None, status: Optional[str] = None,
                            user: dict = Depends(require("reports.export"))):
    data = await report_attendance(date_from, date_to, grade_id, section_id, subject_id, student_id, teacher_id, status, user)
    output = io.StringIO()
    output.write("\ufeff")  # BOM for Arabic in Excel
    writer = csv.writer(output)
    writer.writerow(["التاريخ", "اسم الطالب", "رقم الطالب", "المادة", "المعلم", "الحالة", "ملاحظة"])
    status_ar = {"PRESENT": "حاضر", "ABSENT": "غائب", "LATE": "متأخر", "EXCUSED": "بعذر", "LEFT_EARLY": "خروج مبكر"}
    for row in data["rows"]:
        writer.writerow([row["date"], row["student_name"], row["student_number"], row["subject_name"],
                         row["teacher_name"], status_ar.get(row["status"], row["status"]), row["note"]])
    output.seek(0)
    await log_audit(user, "report.export", "report", "attendance", new_value={"rows": data["total"]}, request=request)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=attendance_report.csv"})


@router.get("/reports/attendance/pdf")
async def export_attendance_pdf(request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None,
                                grade_id: Optional[str] = None, section_id: Optional[str] = None,
                                subject_id: Optional[str] = None, student_id: Optional[str] = None,
                                teacher_id: Optional[str] = None, status: Optional[str] = None,
                                user: dict = Depends(require("reports.export"))):
    data = await report_attendance(date_from, date_to, grade_id, section_id, subject_id, student_id, teacher_id, status, user)
    settings = await get_settings()
    from pdf_utils import build_attendance_pdf
    meta = []
    if date_from or date_to:
        meta.append(f"الفترة: من {date_from or '—'} إلى {date_to or '—'}")
    meta.append(f"عدد السجلات: {data['total']}")
    pdf_bytes = build_attendance_pdf(settings["school_name_ar"], meta, data["summary"], data["attendance_rate"], data["rows"])
    await log_audit(user, "report.export", "report", "attendance_pdf", new_value={"rows": data["total"]}, request=request)
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf",
                             headers={"Content-Disposition": "attachment; filename=attendance_report.pdf"})


@router.get("/reports/teacher-submissions")
async def teacher_submissions(user: dict = Depends(require("reports.view"))):
    teachers = await db.teachers.find({"deleted": {"$ne": True}}, {"_id": 0}).to_list(200)
    result = []
    for t in teachers:
        total_slots = await db.timetable.count_documents({"deleted": {"$ne": True}, "teacher_id": t["id"]})
        submitted = await db.attendance_sessions.count_documents({"teacher_id": t["id"]})
        result.append({"id": t["id"], "full_name": t["full_name"], "weekly_slots": total_slots,
                       "submitted_sessions": submitted})
    return result


# ==================== Notifications ====================
@router.get("/notifications")
async def list_notifications(unread: Optional[bool] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["id"]}
    if unread:
        q["read"] = False
    items = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    unread_count = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"items": items, "unread_count": unread_count}


@router.post("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": notif_id, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


@router.post("/notifications/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ==================== Announcements ====================
class AnnouncementBody(BaseModel):
    title: str
    content: str
    priority: str = "NORMAL"
    target_type: str = "ALL"  # ALL | TEACHERS | STUDENTS | GRADE | SECTION
    target_id: Optional[str] = None
    expire_date: Optional[str] = None


@router.get("/announcements")
async def list_announcements(user: dict = Depends(get_current_user)):
    now = iso()
    q = {"$or": [{"expire_date": None}, {"expire_date": {"$gte": now}}]}
    anns = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    # filter by target for non-admins
    role = user.get("role")
    visible = []
    for a in anns:
        tt = a.get("target_type", "ALL")
        if role in ("SUPER_ADMIN", "DIRECTOR", "VICE_DIRECTOR"):
            visible.append(a); continue
        if tt == "ALL":
            visible.append(a)
        elif tt == "TEACHERS" and role in ("TEACHER", "CLASS_SUPERVISOR"):
            visible.append(a)
        elif tt == "STUDENTS" and role == "STUDENT":
            visible.append(a)
        elif tt in ("GRADE", "SECTION"):
            visible.append(a)
    return visible


@router.post("/announcements")
async def create_announcement(body: AnnouncementBody, request: Request, user: dict = Depends(require("announcements.create"))):
    doc = {"id": new_id(), **body.dict(), "created_by": user["id"], "created_by_name": user["full_name"],
           "created_at": iso()}
    await db.announcements.insert_one(doc)
    await log_audit(user, "create", "announcement", doc["id"], new_value={"title": body.title}, request=request)
    # notify targets
    role_map = {"TEACHERS": ["TEACHER", "CLASS_SUPERVISOR"], "STUDENTS": ["STUDENT"],
                "ALL": rbac.ROLES}
    roles = role_map.get(body.target_type, ["STUDENT", "TEACHER"])
    await notify_roles(roles, "announcement", f"إعلان: {body.title}", body.content[:120])
    doc.pop("_id", None)
    return doc


@router.delete("/announcements/{ann_id}")
async def delete_announcement(ann_id: str, request: Request, user: dict = Depends(require("announcements.delete"))):
    await db.announcements.delete_one({"id": ann_id})
    await log_audit(user, "delete", "announcement", ann_id, request=request)
    return {"ok": True}


# ==================== Audit logs ====================
@router.get("/audit-logs")
async def audit_logs(action: Optional[str] = None, resource: Optional[str] = None,
                     user_id: Optional[str] = None, search: Optional[str] = None,
                     page: int = 1, limit: int = 30, user: dict = Depends(require("audit_logs.view"))):
    q = {}
    if action:
        q["action"] = action
    if resource:
        q["resource"] = resource
    if user_id:
        q["user_id"] = user_id
    if search:
        q["$or"] = [{"user_name": {"$regex": search, "$options": "i"}},
                    {"action": {"$regex": search, "$options": "i"}}]
    total = await db.audit_logs.count_documents(q)
    items = await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {"items": items, "total": total, "page": page, "limit": limit}


# ==================== Global search ====================
@router.get("/search")
async def global_search(q: str = Query(..., min_length=1), user: dict = Depends(get_current_user)):
    results = {"students": [], "teachers": [], "subjects": [], "announcements": []}
    rgx = {"$regex": q, "$options": "i"}
    if rbac.has_permission(user, "students.view"):
        docs = await db.students.find({"deleted": {"$ne": True}, "full_name": rgx}, {"_id": 0, "id": 1, "full_name": 1, "student_number": 1}).limit(6).to_list(6)
        results["students"] = docs
    if rbac.has_permission(user, "teachers.view"):
        docs = await db.teachers.find({"deleted": {"$ne": True}, "full_name": rgx}, {"_id": 0, "id": 1, "full_name": 1}).limit(6).to_list(6)
        results["teachers"] = docs
    docs = await db.subjects.find({"deleted": {"$ne": True}, "name": rgx}, {"_id": 0, "id": 1, "name": 1}).limit(6).to_list(6)
    results["subjects"] = docs
    return results


# ==================== Settings ====================
@router.get("/settings")
async def read_settings(user: dict = Depends(get_current_user)):
    s = await get_settings()
    # Hide signup key from users who can't manage settings
    if not rbac.has_permission(user, "settings.manage"):
        s = dict(s)
        s.pop("student_signup_key", None)
    return s


class SettingsBody(BaseModel):
    school_name_ar: Optional[str] = None
    school_name_en: Optional[str] = None
    logo_url: Optional[str] = None
    late_threshold_minutes: Optional[int] = None
    attendance_window_minutes: Optional[int] = None
    grace_period_minutes: Optional[int] = None
    absence_thresholds: Optional[dict] = None
    qr_enabled: Optional[bool] = None
    timezone: Optional[str] = None
    week_start: Optional[int] = None
    lesson_duration: Optional[int] = None
    periods_count: Optional[int] = None
    maintenance_mode: Optional[bool] = None
    require_2fa_admins: Optional[bool] = None
    student_signup_enabled: Optional[bool] = None


@router.patch("/settings")
async def update_settings(body: SettingsBody, request: Request, user: dict = Depends(require("settings.manage"))):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    await db.settings.update_one({"id": "global"}, {"$set": updates}, upsert=True)
    await log_audit(user, "settings.change", "settings", "global", new_value=updates, request=request)
    return await get_settings()


@router.post("/settings/rotate-signup-key")
async def rotate_signup_key(request: Request, user: dict = Depends(require("settings.manage"))):
    import secrets as _secrets
    # short readable key: 4 groups of 4 chars
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    parts = []
    for _ in range(4):
        parts.append("".join(_secrets.choice(alphabet) for _ in range(4)))
    key = "-".join(parts)
    await db.settings.update_one({"id": "global"}, {"$set": {"student_signup_key": key}}, upsert=True)
    await log_audit(user, "settings.rotate_signup_key", "settings", "global", request=request)
    return {"student_signup_key": key}


@router.post("/settings/backup")
async def trigger_backup(request: Request, user: dict = Depends(require("settings.manage"))):
    ts = iso()
    await db.backups.insert_one({"id": new_id(), "created_at": ts, "status": "completed", "triggered_by": user["id"]})
    await db.settings.update_one({"id": "global"}, {"$set": {"last_backup_at": ts}})
    await log_audit(user, "backup.create", "backup", "manual", request=request)
    return {"ok": True, "created_at": ts}


@router.get("/settings/backups")
async def list_backups(user: dict = Depends(require("settings.manage"))):
    items = await db.backups.find({}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    return items
