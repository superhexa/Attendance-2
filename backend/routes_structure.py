"""Academic structure: academic years, grades, sections, subjects."""
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional, List

from core import db, new_id, iso, get_current_user, require, log_audit

router = APIRouter(prefix="/api", tags=["structure"])


# ---------------- Academic Years ----------------
class YearBody(BaseModel):
    name: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None


@router.get("/academic-years")
async def list_years(user: dict = Depends(require("structure.view", "dashboard.admin"))):
    return await db.academic_years.find({"deleted": {"$ne": True}}, {"_id": 0}).sort("name", -1).to_list(200)


@router.post("/academic-years")
async def create_year(body: YearBody, request: Request, user: dict = Depends(require("structure.create"))):
    doc = {"id": new_id(), "name": body.name, "start_date": body.start_date,
           "end_date": body.end_date, "is_active": False, "created_at": iso()}
    count = await db.academic_years.count_documents({"deleted": {"$ne": True}})
    if count == 0:
        doc["is_active"] = True
    await db.academic_years.insert_one(doc)
    await log_audit(user, "create", "academic_year", doc["id"], new_value=body.dict(), request=request)
    doc.pop("_id", None)
    return doc


@router.post("/academic-years/{year_id}/activate")
async def activate_year(year_id: str, request: Request, user: dict = Depends(require("structure.edit"))):
    await db.academic_years.update_many({}, {"$set": {"is_active": False}})
    await db.academic_years.update_one({"id": year_id}, {"$set": {"is_active": True}})
    await log_audit(user, "activate", "academic_year", year_id, request=request)
    return {"ok": True}


@router.delete("/academic-years/{year_id}")
async def delete_year(year_id: str, request: Request, user: dict = Depends(require("structure.delete"))):
    await db.academic_years.update_one({"id": year_id}, {"$set": {"deleted": True}})
    await log_audit(user, "delete", "academic_year", year_id, request=request)
    return {"ok": True}


# ---------------- Grades ----------------
class GradeBody(BaseModel):
    academic_year_id: str
    name: str
    level: Optional[int] = 0


@router.get("/grades")
async def list_grades(academic_year_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"deleted": {"$ne": True}}
    if academic_year_id:
        q["academic_year_id"] = academic_year_id
    return await db.grades.find(q, {"_id": 0}).sort("level", 1).to_list(200)


@router.post("/grades")
async def create_grade(body: GradeBody, request: Request, user: dict = Depends(require("structure.create"))):
    doc = {"id": new_id(), **body.dict(), "deleted": False, "created_at": iso()}
    await db.grades.insert_one(doc)
    await log_audit(user, "create", "grade", doc["id"], new_value=body.dict(), request=request)
    doc.pop("_id", None)
    return doc


@router.patch("/grades/{grade_id}")
async def update_grade(grade_id: str, body: GradeBody, request: Request, user: dict = Depends(require("structure.edit"))):
    await db.grades.update_one({"id": grade_id}, {"$set": body.dict()})
    await log_audit(user, "update", "grade", grade_id, new_value=body.dict(), request=request)
    return {"ok": True}


@router.delete("/grades/{grade_id}")
async def delete_grade(grade_id: str, request: Request, user: dict = Depends(require("structure.delete"))):
    await db.grades.update_one({"id": grade_id}, {"$set": {"deleted": True}})
    await log_audit(user, "delete", "grade", grade_id, request=request)
    return {"ok": True}


# ---------------- Sections ----------------
class SectionBody(BaseModel):
    grade_id: str
    academic_year_id: str
    name: str
    capacity: Optional[int] = 40


async def _enrich_section(s: dict) -> dict:
    grade = await db.grades.find_one({"id": s.get("grade_id")}, {"_id": 0, "name": 1})
    s["grade_name"] = grade["name"] if grade else ""
    s["student_count"] = await db.students.count_documents({"section_id": s["id"], "deleted": {"$ne": True}})
    return s


@router.get("/sections")
async def list_sections(grade_id: Optional[str] = None, academic_year_id: Optional[str] = None,
                        user: dict = Depends(get_current_user)):
    q = {"deleted": {"$ne": True}}
    if grade_id:
        q["grade_id"] = grade_id
    if academic_year_id:
        q["academic_year_id"] = academic_year_id
    sections = await db.sections.find(q, {"_id": 0}).to_list(500)
    for s in sections:
        await _enrich_section(s)
    return sections


@router.post("/sections")
async def create_section(body: SectionBody, request: Request, user: dict = Depends(require("structure.create"))):
    doc = {"id": new_id(), **body.dict(), "deleted": False, "created_at": iso()}
    await db.sections.insert_one(doc)
    await log_audit(user, "create", "section", doc["id"], new_value=body.dict(), request=request)
    doc.pop("_id", None)
    return await _enrich_section(doc)


@router.patch("/sections/{section_id}")
async def update_section(section_id: str, body: SectionBody, request: Request, user: dict = Depends(require("structure.edit"))):
    await db.sections.update_one({"id": section_id}, {"$set": body.dict()})
    await log_audit(user, "update", "section", section_id, new_value=body.dict(), request=request)
    return {"ok": True}


@router.delete("/sections/{section_id}")
async def delete_section(section_id: str, request: Request, user: dict = Depends(require("structure.delete"))):
    cnt = await db.students.count_documents({"section_id": section_id, "deleted": {"$ne": True}})
    if cnt > 0:
        raise HTTPException(status_code=400, detail="لا يمكن حذف شعبة تحتوي على طلاب")
    await db.sections.update_one({"id": section_id}, {"$set": {"deleted": True}})
    await log_audit(user, "delete", "section", section_id, request=request)
    return {"ok": True}


# ---------------- Subjects ----------------
class SubjectBody(BaseModel):
    name: str
    code: Optional[str] = ""
    weekly_periods: Optional[int] = 0
    grade_ids: Optional[List[str]] = []


@router.get("/subjects")
async def list_subjects(user: dict = Depends(get_current_user)):
    return await db.subjects.find({"deleted": {"$ne": True}}, {"_id": 0}).sort("name", 1).to_list(300)


@router.post("/subjects")
async def create_subject(body: SubjectBody, request: Request, user: dict = Depends(require("subjects.create"))):
    doc = {"id": new_id(), **body.dict(), "deleted": False, "created_at": iso()}
    await db.subjects.insert_one(doc)
    await log_audit(user, "create", "subject", doc["id"], new_value=body.dict(), request=request)
    doc.pop("_id", None)
    return doc


@router.patch("/subjects/{subject_id}")
async def update_subject(subject_id: str, body: SubjectBody, request: Request, user: dict = Depends(require("subjects.edit"))):
    await db.subjects.update_one({"id": subject_id}, {"$set": body.dict()})
    await log_audit(user, "update", "subject", subject_id, new_value=body.dict(), request=request)
    return {"ok": True}


@router.delete("/subjects/{subject_id}")
async def delete_subject(subject_id: str, request: Request, user: dict = Depends(require("subjects.delete"))):
    await db.subjects.update_one({"id": subject_id}, {"$set": {"deleted": True}})
    await log_audit(user, "delete", "subject", subject_id, request=request)
    return {"ok": True}
