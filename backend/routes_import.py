"""Bulk import (CSV/Excel) for students & teachers: template, preview (validate+dedup), commit."""
import io
import csv
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional

from core import db, new_id, iso, require, log_audit

router = APIRouter(prefix="/api/import", tags=["import"])

STUDENT_MAP = {
    "الاسم الكامل": "full_name", "full_name": "full_name", "name": "full_name",
    "رقم الطالب": "student_number", "student_number": "student_number",
    "الصف": "grade", "grade": "grade",
    "الشعبة": "section", "section": "section",
    "الجنس": "gender", "gender": "gender",
    "اسم ولي الأمر": "guardian_name", "guardian_name": "guardian_name",
    "هاتف ولي الأمر": "guardian_phone", "guardian_phone": "guardian_phone",
    "البريد": "email", "email": "email",
}
STUDENT_TEMPLATE = ["الاسم الكامل", "رقم الطالب", "الصف", "الشعبة", "الجنس", "اسم ولي الأمر", "هاتف ولي الأمر", "البريد"]

TEACHER_MAP = {
    "الاسم الكامل": "full_name", "full_name": "full_name", "name": "full_name",
    "الرقم الوظيفي": "employee_id", "employee_id": "employee_id",
    "البريد": "email", "email": "email",
    "الهاتف": "phone", "phone": "phone",
}
TEACHER_TEMPLATE = ["الاسم الكامل", "الرقم الوظيفي", "البريد", "الهاتف"]


@router.get("/template")
async def template(type: str = Query(...), user: dict = Depends(require("students.create", "teachers.create"))):
    cols = STUDENT_TEMPLATE if type == "students" else TEACHER_TEMPLATE
    out = io.StringIO()
    out.write("\ufeff")
    w = csv.writer(out)
    w.writerow(cols)
    if type == "students":
        w.writerow(["عمر خليل الحسين", "S2001", "الصف الأول الثانوي", "شعبة أ", "ذكر", "خليل الحسين", "0790000000", ""])
    else:
        w.writerow(["أ. محمد أحمد", "T-2001", "teacher@school.edu", "0790000000"])
    out.seek(0)
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={type}_template.csv"})


def _read_df(content: bytes, filename: str) -> pd.DataFrame:
    if filename.lower().endswith((".xlsx", ".xls")):
        df = pd.read_excel(io.BytesIO(content))
    else:
        df = pd.read_csv(io.BytesIO(content))
    df = df.fillna("")
    df.columns = [str(c).strip() for c in df.columns]
    return df


async def _active_year_id():
    y = await db.academic_years.find_one({"is_active": True}, {"_id": 0, "id": 1})
    return y["id"] if y else None


@router.post("/preview")
async def preview(type: str = Query(...), file: UploadFile = File(...),
                  user: dict = Depends(require("students.create", "teachers.create"))):
    content = await file.read()
    try:
        df = _read_df(content, file.filename or "f.csv")
    except Exception as e:
        raise HTTPException(status_code=400, detail="تعذّر قراءة الملف. تأكد أنه CSV أو Excel صالح")

    mapping = STUDENT_MAP if type == "students" else TEACHER_MAP
    colmap = {c: mapping[c] for c in df.columns if c in mapping}
    if "full_name" not in colmap.values():
        raise HTTPException(status_code=400, detail="الملف يجب أن يحتوي على عمود «الاسم الكامل»")

    rows = []
    summary = {"valid": 0, "errors": 0, "duplicates": 0}

    if type == "students":
        year_id = await _active_year_id()
        grades = await db.grades.find({"deleted": {"$ne": True}}, {"_id": 0}).to_list(500)
        sections = await db.sections.find({"deleted": {"$ne": True}}, {"_id": 0}).to_list(1000)
        gmap = {g["name"].strip(): g["id"] for g in grades}
        smap = {}
        for s in sections:
            smap[(s["grade_id"], s["name"].strip())] = s["id"]
        existing_numbers = set()
        async for st in db.students.find({"deleted": {"$ne": True}, "student_number": {"$ne": None}}, {"_id": 0, "student_number": 1}):
            existing_numbers.add(str(st["student_number"]))
        seen = set()

        for i, raw in df.iterrows():
            v = {colmap[c]: str(raw[c]).strip() for c in colmap}
            status, msg = "valid", ""
            grade_id = gmap.get(v.get("grade", "").strip())
            section_id = smap.get((grade_id, v.get("section", "").strip())) if grade_id else None
            gender = "female" if v.get("gender", "").strip() in ("أنثى", "female", "f") else "male"
            num = v.get("student_number", "").strip()
            if not v.get("full_name"):
                status, msg = "error", "الاسم مطلوب"
            elif not grade_id:
                status, msg = "error", f"الصف غير موجود: {v.get('grade','')}"
            elif not section_id:
                status, msg = "error", f"الشعبة غير موجودة: {v.get('section','')}"
            elif num and (num in existing_numbers or num in seen):
                status, msg = "duplicate", f"رقم الطالب مكرر: {num}"
            if num:
                seen.add(num)
            summary["valid" if status == "valid" else ("duplicates" if status == "duplicate" else "errors")] += 1
            rows.append({
                "row": int(i) + 2, "status": status, "message": msg,
                "full_name": v.get("full_name", ""), "student_number": num or None,
                "gender": gender, "guardian_name": v.get("guardian_name", ""),
                "guardian_phone": v.get("guardian_phone", ""), "email": v.get("email", ""),
                "grade": v.get("grade", ""), "section": v.get("section", ""),
                "grade_id": grade_id, "section_id": section_id, "academic_year_id": year_id,
            })
    else:  # teachers
        existing_emails = set()
        async for t in db.teachers.find({"deleted": {"$ne": True}}, {"_id": 0, "email": 1}):
            if t.get("email"):
                existing_emails.add(t["email"].lower())
        seen = set()
        for i, raw in df.iterrows():
            v = {colmap[c]: str(raw[c]).strip() for c in colmap}
            status, msg = "valid", ""
            email = v.get("email", "").strip().lower()
            if not v.get("full_name"):
                status, msg = "error", "الاسم مطلوب"
            elif email and (email in existing_emails or email in seen):
                status, msg = "duplicate", f"البريد مكرر: {email}"
            if email:
                seen.add(email)
            summary["valid" if status == "valid" else ("duplicates" if status == "duplicate" else "errors")] += 1
            rows.append({
                "row": int(i) + 2, "status": status, "message": msg,
                "full_name": v.get("full_name", ""), "employee_id": v.get("employee_id", ""),
                "email": v.get("email", ""), "phone": v.get("phone", ""),
            })

    return {"type": type, "summary": summary, "total": len(rows), "rows": rows}


class CommitBody(BaseModel):
    type: str
    rows: List[dict]


@router.post("/commit")
async def commit(body: CommitBody, request: Request, user: dict = Depends(require("students.create", "teachers.create"))):
    created, skipped = 0, 0
    if body.type == "students":
        for r in body.rows:
            if r.get("status") != "valid":
                skipped += 1
                continue
            num = r.get("student_number")
            if num and await db.students.find_one({"student_number": num, "deleted": {"$ne": True}}):
                skipped += 1
                continue
            await db.students.insert_one({
                "id": new_id(), "full_name": r["full_name"], "student_number": num,
                "gender": r.get("gender", "male"), "grade_id": r["grade_id"], "section_id": r["section_id"],
                "academic_year_id": r.get("academic_year_id"), "guardian_name": r.get("guardian_name", ""),
                "guardian_phone": r.get("guardian_phone", ""), "contact_phone": "",
                "email": (r.get("email") or "").lower(), "status": "active", "user_id": None,
                "deleted": False, "created_at": iso(),
            })
            created += 1
    else:
        for r in body.rows:
            if r.get("status") != "valid":
                skipped += 1
                continue
            await db.teachers.insert_one({
                "id": new_id(), "full_name": r["full_name"], "employee_id": r.get("employee_id", ""),
                "email": (r.get("email") or "").lower(), "phone": r.get("phone", ""),
                "subject_ids": [], "assigned_section_ids": [], "status": "active",
                "user_id": None, "deleted": False, "created_at": iso(),
            })
            created += 1
    await log_audit(user, "import", body.type, "bulk", new_value={"created": created, "skipped": skipped}, request=request)
    return {"created": created, "skipped": skipped}
