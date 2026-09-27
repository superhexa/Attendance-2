"""Student promotion & graduation (end-of-year batch)."""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import List, Optional

from core import db, iso, require, log_audit, notify

router = APIRouter(prefix="/api/promotion", tags=["promotion"])


@router.get("/preview")
async def preview(user: dict = Depends(require("students.edit", "students.view"))):
    year = await db.academic_years.find_one({"is_active": True}, {"_id": 0})
    grades = await db.grades.find({"deleted": {"$ne": True}}, {"_id": 0}).sort("level", 1).to_list(200)
    out = []
    for g in grades:
        cnt = await db.students.count_documents({"grade_id": g["id"], "deleted": {"$ne": True}})
        out.append({"grade_id": g["id"], "grade_name": g["name"], "level": g.get("level", 0), "student_count": cnt})
    return {"active_year": year["name"] if year else None, "grades": out}


class Mapping(BaseModel):
    from_grade_id: str
    action: str  # "promote" | "graduate"
    to_grade_id: Optional[str] = None
    to_section_id: Optional[str] = None


class ApplyBody(BaseModel):
    mappings: List[Mapping]


@router.post("/apply")
async def apply(body: ApplyBody, request: Request, user: dict = Depends(require("students.edit"))):
    promoted, graduated = 0, 0
    for m in body.mappings:
        students = await db.students.find({"grade_id": m.from_grade_id, "deleted": {"$ne": True}}, {"_id": 0, "id": 1, "user_id": 1}).to_list(5000)
        if not students:
            continue
        ids = [s["id"] for s in students]
        if m.action == "graduate":
            await db.students.update_many({"id": {"$in": ids}}, {"$set": {"deleted": True, "status": "graduated", "student_number": None}})
            for s in students:
                if s.get("user_id"):
                    await db.users.update_one({"id": s["user_id"]}, {"$set": {"status": "disabled"}})
            graduated += len(ids)
        elif m.action == "promote" and m.to_grade_id:
            upd = {"grade_id": m.to_grade_id, "section_id": m.to_section_id or ""}
            await db.students.update_many({"id": {"$in": ids}}, {"$set": upd})
            promoted += len(ids)
    await log_audit(user, "promotion", "students", "batch",
                    new_value={"promoted": promoted, "graduated": graduated}, request=request)
    return {"promoted": promoted, "graduated": graduated}
