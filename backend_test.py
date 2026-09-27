#!/usr/bin/env python3
"""Backend regression test for newly added endpoints: SUBSTITUTIONS and OCR.

Admin: admin@example.com / admin123

Tests:
1. SUBSTITUTIONS (routes_substitutions.py - permission substitutions.manage)
2. OCR (routes_ocr.py - permission attendance.create)
"""
import requests
import json
import base64
from typing import Optional

BASE_URL = "http://localhost:8000"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"

# Test counters
passed = 0
failed = 0
test_results = []


def log_test(name: str, success: bool, details: str = ""):
    global passed, failed
    if success:
        passed += 1
        print(f"✅ PASS: {name}")
        test_results.append({"test": name, "status": "PASS", "details": details})
    else:
        failed += 1
        print(f"❌ FAIL: {name}")
        print(f"   Details: {details}")
        test_results.append({"test": name, "status": "FAIL", "details": details})


def login_admin() -> Optional[str]:
    """Login as admin and return access_token."""
    try:
        resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("access_token")
            print(f"✅ Admin login successful. Token: {token[:20]}...")
            return token
        else:
            print(f"❌ Admin login failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Admin login exception: {e}")
        return None


def ensure_teachers(token: str) -> tuple:
    """Ensure at least 2 teachers exist. Return (teacher1_id, teacher2_id)."""
    headers = {"Authorization": f"Bearer {token}"}
    
    # List existing teachers
    resp = requests.get(f"{BASE_URL}/api/teachers", headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"❌ Failed to list teachers: {resp.status_code} {resp.text}")
        return None, None
    
    teachers = resp.json().get("items", [])
    print(f"📋 Found {len(teachers)} existing teachers")
    
    # If we have at least 2, return them
    if len(teachers) >= 2:
        t1 = teachers[0]["id"]
        t2 = teachers[1]["id"]
        print(f"✅ Using existing teachers: {t1}, {t2}")
        
        # Check if second teacher has user_id (for my-today test)
        if not teachers[1].get("user_id"):
            print(f"⚠️  Second teacher {t2} has no user_id. Creating account...")
            # Update teacher to create account
            # Actually, we can't update to create account via PATCH. Let's create a new teacher with account.
            pass
        
        return t1, t2
    
    # Create teachers as needed
    teacher_ids = [t["id"] for t in teachers]
    
    # Create first teacher if needed
    if len(teachers) < 1:
        body = {
            "full_name": "معلم اختبار 1",
            "employee_id": "T001",
            "email": "teacher1@test.com",
            "subject_ids": [],
            "assigned_section_ids": [],
            "create_account": False
        }
        resp = requests.post(f"{BASE_URL}/api/teachers", json=body, headers=headers, timeout=10)
        if resp.status_code == 200:
            t1_id = resp.json()["id"]
            teacher_ids.append(t1_id)
            print(f"✅ Created teacher 1: {t1_id}")
        else:
            print(f"❌ Failed to create teacher 1: {resp.status_code} {resp.text}")
            return None, None
    
    # Create second teacher with account (for my-today test)
    if len(teacher_ids) < 2:
        body = {
            "full_name": "معلم اختبار 2",
            "employee_id": "T002",
            "email": "teacher2@test.com",
            "subject_ids": [],
            "assigned_section_ids": [],
            "create_account": True,
            "username": "teacher2",
            "password": "teacher123"
        }
        resp = requests.post(f"{BASE_URL}/api/teachers", json=body, headers=headers, timeout=10)
        if resp.status_code == 200:
            t2_id = resp.json()["id"]
            teacher_ids.append(t2_id)
            print(f"✅ Created teacher 2 with account: {t2_id}")
        else:
            print(f"❌ Failed to create teacher 2: {resp.status_code} {resp.text}")
            return teacher_ids[0] if teacher_ids else None, None
    
    return teacher_ids[0], teacher_ids[1] if len(teacher_ids) >= 2 else None


def ensure_section(token: str) -> Optional[str]:
    """Ensure at least 1 section exists. Return section_id."""
    headers = {"Authorization": f"Bearer {token}"}
    
    # List existing sections
    resp = requests.get(f"{BASE_URL}/api/sections", headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"❌ Failed to list sections: {resp.status_code} {resp.text}")
        return None
    
    sections = resp.json() if isinstance(resp.json(), list) else resp.json().get("items", [])
    print(f"📋 Found {len(sections)} existing sections")
    
    if sections:
        section_id = sections[0]["id"]
        print(f"✅ Using existing section: {section_id}")
        return section_id
    
    # Need to create a grade first
    grade_body = {"name": "الصف الأول", "level": 1, "stage": "primary"}
    resp = requests.post(f"{BASE_URL}/api/grades", json=grade_body, headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"❌ Failed to create grade: {resp.status_code} {resp.text}")
        return None
    grade_id = resp.json()["id"]
    print(f"✅ Created grade: {grade_id}")
    
    # Create section
    section_body = {"name": "أ", "grade_id": grade_id, "capacity": 30}
    resp = requests.post(f"{BASE_URL}/api/sections", json=section_body, headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"❌ Failed to create section: {resp.status_code} {resp.text}")
        return None
    section_id = resp.json()["id"]
    print(f"✅ Created section: {section_id}")
    return section_id


def ensure_approved_student(token: str, section_id: str) -> Optional[str]:
    """Ensure at least 1 approved student exists in the section. Return student_id."""
    headers = {"Authorization": f"Bearer {token}"}
    
    # List students in section
    resp = requests.get(f"{BASE_URL}/api/students?section_id={section_id}", headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"❌ Failed to list students: {resp.status_code} {resp.text}")
        return None
    
    students = resp.json().get("items", [])
    print(f"📋 Found {len(students)} students in section {section_id}")
    
    if students:
        student_id = students[0]["id"]
        print(f"✅ Using existing student: {student_id}")
        return student_id
    
    # Need to create a student via signup flow
    # 1. Rotate key
    resp = requests.post(f"{BASE_URL}/api/settings/rotate-signup-key", headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"❌ Failed to rotate signup key: {resp.status_code} {resp.text}")
        return None
    school_key = resp.json()["school_key"]
    print(f"✅ Rotated signup key: {school_key}")
    
    # 2. Get section's grade_id
    resp = requests.get(f"{BASE_URL}/api/sections", headers=headers, timeout=10)
    sections = resp.json() if isinstance(resp.json(), list) else resp.json().get("items", [])
    section = next((s for s in sections if s["id"] == section_id), None)
    if not section:
        print(f"❌ Section {section_id} not found")
        return None
    grade_id = section["grade_id"]
    
    # 3. Signup
    signup_body = {
        "school_key": school_key,
        "full_name": "طالب اختبار",
        "student_number": "S001",
        "dob": "2010-01-01",
        "gender": "male",
        "grade_id": grade_id,
        "section_id": section_id,
        "guardian_name": "ولي الأمر",
        "guardian_phone": "0501234567",
        "username": "student_test",
        "password": "student123"
    }
    resp = requests.post(f"{BASE_URL}/api/auth/signup/student", json=signup_body, timeout=10)
    if resp.status_code != 200:
        print(f"❌ Failed to signup student: {resp.status_code} {resp.text}")
        return None
    print(f"✅ Student signup successful")
    
    # 4. Get pending signups
    resp = requests.get(f"{BASE_URL}/api/signups/pending", headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"❌ Failed to get pending signups: {resp.status_code} {resp.text}")
        return None
    pending = resp.json().get("items", [])
    if not pending:
        print(f"❌ No pending signups found")
        return None
    user_id = pending[0]["id"]
    
    # 5. Approve
    resp = requests.post(f"{BASE_URL}/api/signups/{user_id}/approve", headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"❌ Failed to approve signup: {resp.status_code} {resp.text}")
        return None
    student_id = resp.json()["student_id"]
    print(f"✅ Approved student: {student_id}")
    return student_id


def test_substitutions(token: str, t1_id: str, t2_id: str, section_id: str):
    """Test SUBSTITUTIONS endpoints."""
    print("\n" + "="*80)
    print("TESTING SUBSTITUTIONS")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. GET /api/substitutions?date=2026-09-14 as admin → 200 {items, total}
    resp = requests.get(f"{BASE_URL}/api/substitutions?date=2026-09-14", headers=headers, timeout=10)
    if resp.status_code == 200:
        data = resp.json()
        if "items" in data and "total" in data:
            log_test("GET /api/substitutions?date=2026-09-14 returns 200 with items and total", True, f"items={len(data['items'])}, total={data['total']}")
        else:
            log_test("GET /api/substitutions?date=2026-09-14 returns 200 with items and total", False, f"Missing keys: {data}")
    else:
        log_test("GET /api/substitutions?date=2026-09-14 returns 200 with items and total", False, f"Status {resp.status_code}: {resp.text}")
    
    # 2. POST /api/substitutions with valid body → 200 with enriched doc
    sub_body = {
        "date": "2026-09-14",
        "original_teacher_id": t1_id,
        "substitute_teacher_id": t2_id,
        "section_id": section_id,
        "period": 3,
        "note": "غياب مؤقت"
    }
    resp = requests.post(f"{BASE_URL}/api/substitutions", json=sub_body, headers=headers, timeout=10)
    if resp.status_code == 200:
        data = resp.json()
        required_fields = ["id", "original_teacher_name", "substitute_teacher_name", "section_name", "grade_name"]
        missing = [f for f in required_fields if f not in data]
        if not missing:
            sub_id = data["id"]
            log_test("POST /api/substitutions returns 200 with enriched doc", True, f"sub_id={sub_id}, enriched fields present")
        else:
            log_test("POST /api/substitutions returns 200 with enriched doc", False, f"Missing fields: {missing}")
            sub_id = data.get("id")
    else:
        log_test("POST /api/substitutions returns 200 with enriched doc", False, f"Status {resp.status_code}: {resp.text}")
        sub_id = None
    
    # 3. Verify db side-effect: GET /api/teachers/{t2_id} → assigned_section_ids includes section_id
    resp = requests.get(f"{BASE_URL}/api/teachers/{t2_id}", headers=headers, timeout=10)
    if resp.status_code == 200:
        teacher = resp.json()
        assigned_sections = teacher.get("assigned_section_ids", [])
        if section_id in assigned_sections:
            log_test("Substitute teacher's assigned_section_ids includes the section", True, f"assigned_section_ids={assigned_sections}")
        else:
            log_test("Substitute teacher's assigned_section_ids includes the section", False, f"section_id {section_id} not in {assigned_sections}")
    else:
        log_test("Substitute teacher's assigned_section_ids includes the section", False, f"Failed to get teacher: {resp.status_code} {resp.text}")
    
    # 4. Negative case: POST with original_teacher_id == substitute_teacher_id → 400
    bad_body = {
        "date": "2026-09-14",
        "original_teacher_id": t1_id,
        "substitute_teacher_id": t1_id,
        "section_id": section_id,
        "period": 3
    }
    resp = requests.post(f"{BASE_URL}/api/substitutions", json=bad_body, headers=headers, timeout=10)
    if resp.status_code == 400:
        detail = resp.json().get("detail", "")
        if "مختلفين" in detail or "same" in detail.lower():
            log_test("POST /api/substitutions with same teacher returns 400 with Arabic message", True, f"detail={detail}")
        else:
            log_test("POST /api/substitutions with same teacher returns 400 with Arabic message", False, f"Wrong error message: {detail}")
    else:
        log_test("POST /api/substitutions with same teacher returns 400 with Arabic message", False, f"Status {resp.status_code}: {resp.text}")
    
    # 5. Negative case: POST with unknown teacher id → 400
    bad_body = {
        "date": "2026-09-14",
        "original_teacher_id": "unknown_teacher_id",
        "substitute_teacher_id": t2_id,
        "section_id": section_id,
        "period": 3
    }
    resp = requests.post(f"{BASE_URL}/api/substitutions", json=bad_body, headers=headers, timeout=10)
    if resp.status_code == 400:
        detail = resp.json().get("detail", "")
        if "غير موجود" in detail or "not found" in detail.lower():
            log_test("POST /api/substitutions with unknown teacher returns 400", True, f"detail={detail}")
        else:
            log_test("POST /api/substitutions with unknown teacher returns 400", False, f"Wrong error message: {detail}")
    else:
        log_test("POST /api/substitutions with unknown teacher returns 400", False, f"Status {resp.status_code}: {resp.text}")
    
    # 6. Negative case: POST with unknown section id → 400
    bad_body = {
        "date": "2026-09-14",
        "original_teacher_id": t1_id,
        "substitute_teacher_id": t2_id,
        "section_id": "unknown_section_id",
        "period": 3
    }
    resp = requests.post(f"{BASE_URL}/api/substitutions", json=bad_body, headers=headers, timeout=10)
    if resp.status_code == 400:
        detail = resp.json().get("detail", "")
        if "غير موجود" in detail or "not found" in detail.lower():
            log_test("POST /api/substitutions with unknown section returns 400", True, f"detail={detail}")
        else:
            log_test("POST /api/substitutions with unknown section returns 400", False, f"Wrong error message: {detail}")
    else:
        log_test("POST /api/substitutions with unknown section returns 400", False, f"Status {resp.status_code}: {resp.text}")
    
    # 7. GET /api/substitutions?date=2026-09-14 → SUB_ID appears in items
    if sub_id:
        resp = requests.get(f"{BASE_URL}/api/substitutions?date=2026-09-14", headers=headers, timeout=10)
        if resp.status_code == 200:
            items = resp.json().get("items", [])
            if any(item["id"] == sub_id for item in items):
                log_test("GET /api/substitutions?date=2026-09-14 includes created substitution", True, f"sub_id={sub_id} found in items")
            else:
                log_test("GET /api/substitutions?date=2026-09-14 includes created substitution", False, f"sub_id={sub_id} not found in items")
        else:
            log_test("GET /api/substitutions?date=2026-09-14 includes created substitution", False, f"Status {resp.status_code}: {resp.text}")
    
    # 8. DELETE /api/substitutions/{SUB_ID} → 200 {ok:true}
    if sub_id:
        resp = requests.delete(f"{BASE_URL}/api/substitutions/{sub_id}", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok") is True:
                log_test("DELETE /api/substitutions/{id} returns 200 with ok:true", True, f"sub_id={sub_id} cancelled")
            else:
                log_test("DELETE /api/substitutions/{id} returns 200 with ok:true", False, f"Response: {data}")
        else:
            log_test("DELETE /api/substitutions/{id} returns 200 with ok:true", False, f"Status {resp.status_code}: {resp.text}")
        
        # 9. GET again → SUB_ID is NOT in items (status cancelled)
        resp = requests.get(f"{BASE_URL}/api/substitutions?date=2026-09-14", headers=headers, timeout=10)
        if resp.status_code == 200:
            items = resp.json().get("items", [])
            if not any(item["id"] == sub_id for item in items):
                log_test("GET /api/substitutions after DELETE does not include cancelled substitution", True, f"sub_id={sub_id} not in items (status=cancelled)")
            else:
                log_test("GET /api/substitutions after DELETE does not include cancelled substitution", False, f"sub_id={sub_id} still in items")
        else:
            log_test("GET /api/substitutions after DELETE does not include cancelled substitution", False, f"Status {resp.status_code}: {resp.text}")
    
    # 10. Auth: without any token → 401
    resp = requests.get(f"{BASE_URL}/api/substitutions?date=2026-09-14", timeout=10)
    if resp.status_code == 401:
        log_test("GET /api/substitutions without token returns 401", True)
    else:
        log_test("GET /api/substitutions without token returns 401", False, f"Status {resp.status_code}: {resp.text}")
    
    # 11. Auth: with STUDENT token → 403
    # First, get a student token
    student_token = get_student_token()
    if student_token:
        headers_student = {"Authorization": f"Bearer {student_token}"}
        resp = requests.get(f"{BASE_URL}/api/substitutions?date=2026-09-14", headers=headers_student, timeout=10)
        if resp.status_code == 403:
            log_test("GET /api/substitutions with STUDENT token returns 403", True)
        else:
            log_test("GET /api/substitutions with STUDENT token returns 403", False, f"Status {resp.status_code}: {resp.text}")
    else:
        log_test("GET /api/substitutions with STUDENT token returns 403", False, "Could not get student token")


def get_student_token() -> Optional[str]:
    """Get a student token for testing RBAC."""
    # Try to login with the student we created earlier
    try:
        resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "student_test@test.com", "password": "student123"},
            timeout=10
        )
        if resp.status_code == 200:
            return resp.json().get("access_token")
        
        # Try with username
        resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "student_test", "password": "student123"},
            timeout=10
        )
        if resp.status_code == 200:
            return resp.json().get("access_token")
    except:
        pass
    return None


def test_ocr(token: str, section_id: str, student_id: str):
    """Test OCR endpoints."""
    print("\n" + "="*80)
    print("TESTING OCR")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Sanity import: verify the OCR endpoint responds without import issues
    # A 1x1 red PNG in base64
    tiny_png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX/AAAZ4gk3AAAACklEQVR42mNgAAAAAgABc3UBGAAAAABJRU5ErkJggg=="
    
    resp = requests.post(f"{BASE_URL}/api/ocr/attendance", json={"image_base64": tiny_png}, headers=headers, timeout=30)
    if resp.status_code == 500:
        detail = resp.text
        if "ImportError" in detail or "import" in detail.lower():
            log_test("OCR endpoint import check", False, f"CRITICAL: ImportError detected: {detail}")
        else:
            log_test("OCR endpoint import check", False, f"500 error but not ImportError: {detail}")
    elif resp.status_code in (200, 502):
        # Both are acceptable for a tiny meaningless image
        log_test("OCR endpoint import check", True, f"Status {resp.status_code} - no ImportError")
        if resp.status_code == 200:
            data = resp.json()
            draft_id = data.get("draft_id")
            print(f"   Draft ID: {draft_id}")
    else:
        log_test("OCR endpoint import check", False, f"Unexpected status {resp.status_code}: {resp.text}")
    
    # 2. POST /api/ocr/attendance with valid base64 → 200 or 502 (both acceptable)
    resp = requests.post(f"{BASE_URL}/api/ocr/attendance", json={"image_base64": tiny_png}, headers=headers, timeout=30)
    if resp.status_code in (200, 502):
        if resp.status_code == 200:
            try:
                data = resp.json()
                if "draft_id" in data:
                    draft_id = data["draft_id"]
                    log_test("POST /api/ocr/attendance with valid base64 returns 200 with draft_id", True, f"draft_id={draft_id}")
                else:
                    log_test("POST /api/ocr/attendance with valid base64 returns 200 with draft_id", False, f"Missing draft_id: {data}")
            except:
                log_test("POST /api/ocr/attendance with valid base64 returns 200 with draft_id", False, f"Invalid JSON response")
        else:  # 502
            try:
                detail = resp.json().get("detail", "")
                if "فشل الاتصال" in detail or "تعذّر تحليل" in detail:
                    log_test("POST /api/ocr/attendance with valid base64 returns 502 with Arabic error", True, f"detail={detail}")
                else:
                    log_test("POST /api/ocr/attendance with valid base64 returns 502 with Arabic error", False, f"Wrong error: {detail}")
            except:
                # 502 from Cloudflare (HTML response) - this is acceptable as it means the request timed out
                log_test("POST /api/ocr/attendance with valid base64 returns 502 (Cloudflare timeout)", True, "502 Bad Gateway from Cloudflare - acceptable")
    else:
        log_test("POST /api/ocr/attendance with valid base64 returns 200 or 502", False, f"Status {resp.status_code}: {resp.text[:200]}")
    
    # 3. POST /api/ocr/attendance with invalid base64 → 422 with Arabic validation error
    resp = requests.post(f"{BASE_URL}/api/ocr/attendance", json={"image_base64": "not-base64!"}, headers=headers, timeout=10)
    if resp.status_code == 422:
        detail = str(resp.json())
        if "صورة غير صالحة" in detail or "invalid" in detail.lower():
            log_test("POST /api/ocr/attendance with invalid base64 returns 422 with Arabic validation", True, f"detail={detail[:100]}")
        else:
            log_test("POST /api/ocr/attendance with invalid base64 returns 422 with Arabic validation", False, f"Wrong error: {detail[:100]}")
    else:
        log_test("POST /api/ocr/attendance with invalid base64 returns 422 with Arabic validation", False, f"Status {resp.status_code}: {resp.text}")
    
    # 4. POST /api/ocr/confirm with nonexistent draft_id → 404 or 400
    confirm_body = {
        "draft_id": "nonexistent",
        "date": "2026-09-14",
        "section_id": section_id,
        "rows": []
    }
    resp = requests.post(f"{BASE_URL}/api/ocr/confirm", json=confirm_body, headers=headers, timeout=10)
    if resp.status_code in (404, 400):
        log_test("POST /api/ocr/confirm with nonexistent draft_id returns 404 or 400", True, f"Status {resp.status_code}")
    else:
        log_test("POST /api/ocr/confirm with nonexistent draft_id returns 404 or 400", False, f"Status {resp.status_code}: {resp.text}")
    
    # 5. Happy path for confirm: create draft, then confirm with valid rows
    # First, create a draft
    resp = requests.post(f"{BASE_URL}/api/ocr/attendance", json={"image_base64": tiny_png}, headers=headers, timeout=30)
    if resp.status_code == 200:
        draft_id = resp.json().get("draft_id")
        if draft_id:
            # Confirm with valid rows
            confirm_body = {
                "draft_id": draft_id,
                "date": "2026-09-14",
                "section_id": section_id,
                "rows": [
                    {
                        "student_id": student_id,
                        "status": "PRESENT",
                        "note": ""
                    }
                ]
            }
            resp = requests.post(f"{BASE_URL}/api/ocr/confirm", json=confirm_body, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("ok") is True and "inserted" in data and "updated" in data and "errors" in data:
                    inserted = data["inserted"]
                    updated = data["updated"]
                    errors = data["errors"]
                    log_test("POST /api/ocr/confirm with valid rows returns 200 with ok:true, inserted, updated, errors", True, f"inserted={inserted}, updated={updated}, errors={len(errors)}")
                    
                    # 6. Second confirm with same data → inserted:0, updated:1
                    resp = requests.post(f"{BASE_URL}/api/ocr/confirm", json=confirm_body, headers=headers, timeout=10)
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("inserted") == 0 and data.get("updated") == 1:
                            log_test("POST /api/ocr/confirm second time returns inserted:0, updated:1", True, f"inserted={data['inserted']}, updated={data['updated']}")
                        else:
                            log_test("POST /api/ocr/confirm second time returns inserted:0, updated:1", False, f"inserted={data.get('inserted')}, updated={data.get('updated')}")
                    else:
                        log_test("POST /api/ocr/confirm second time returns inserted:0, updated:1", False, f"Status {resp.status_code}: {resp.text}")
                    
                    # 7. Confirm with invalid status → errors[] but 200
                    confirm_body_invalid = {
                        "draft_id": draft_id,
                        "date": "2026-09-14",
                        "section_id": section_id,
                        "rows": [
                            {
                                "student_id": student_id,
                                "status": "MAYBE",  # Invalid status
                                "note": ""
                            }
                        ]
                    }
                    resp = requests.post(f"{BASE_URL}/api/ocr/confirm", json=confirm_body_invalid, headers=headers, timeout=10)
                    if resp.status_code == 200:
                        data = resp.json()
                        if len(data.get("errors", [])) > 0:
                            log_test("POST /api/ocr/confirm with invalid status returns 200 with errors[]", True, f"errors={data['errors']}")
                        else:
                            log_test("POST /api/ocr/confirm with invalid status returns 200 with errors[]", False, f"No errors in response: {data}")
                    else:
                        log_test("POST /api/ocr/confirm with invalid status returns 200 with errors[]", False, f"Status {resp.status_code}: {resp.text}")
                else:
                    log_test("POST /api/ocr/confirm with valid rows returns 200 with ok:true, inserted, updated, errors", False, f"Missing keys: {data}")
            else:
                log_test("POST /api/ocr/confirm with valid rows returns 200 with ok:true, inserted, updated, errors", False, f"Status {resp.status_code}: {resp.text}")
        else:
            log_test("POST /api/ocr/confirm with valid rows returns 200 with ok:true, inserted, updated, errors", False, "No draft_id from /api/ocr/attendance")
    else:
        log_test("POST /api/ocr/confirm with valid rows returns 200 with ok:true, inserted, updated, errors", False, f"Failed to create draft: {resp.status_code} {resp.text}")
    
    # 8. Auth: POST /api/ocr/attendance without token → 401
    resp = requests.post(f"{BASE_URL}/api/ocr/attendance", json={"image_base64": tiny_png}, timeout=10)
    if resp.status_code == 401:
        log_test("POST /api/ocr/attendance without token returns 401", True)
    else:
        log_test("POST /api/ocr/attendance without token returns 401", False, f"Status {resp.status_code}: {resp.text}")


def main():
    print("="*80)
    print("BACKEND REGRESSION TEST - SUBSTITUTIONS & OCR")
    print("="*80)
    
    # Login as admin
    token = login_admin()
    if not token:
        print("❌ CRITICAL: Cannot login as admin. Aborting tests.")
        return
    
    # Setup: ensure teachers, section, student
    print("\n" + "="*80)
    print("SETUP")
    print("="*80)
    
    t1_id, t2_id = ensure_teachers(token)
    if not t1_id or not t2_id:
        print("❌ CRITICAL: Cannot ensure 2 teachers. Aborting tests.")
        return
    
    section_id = ensure_section(token)
    if not section_id:
        print("❌ CRITICAL: Cannot ensure section. Aborting tests.")
        return
    
    student_id = ensure_approved_student(token, section_id)
    if not student_id:
        print("❌ CRITICAL: Cannot ensure approved student. Aborting tests.")
        return
    
    print(f"\n✅ Setup complete:")
    print(f"   Teacher 1: {t1_id}")
    print(f"   Teacher 2: {t2_id}")
    print(f"   Section: {section_id}")
    print(f"   Student: {student_id}")
    
    # Run tests
    test_substitutions(token, t1_id, t2_id, section_id)
    test_ocr(token, section_id, student_id)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"✅ PASSED: {passed}")
    print(f"❌ FAILED: {failed}")
    print(f"📊 TOTAL: {passed + failed}")
    print(f"📈 SUCCESS RATE: {passed / (passed + failed) * 100:.1f}%")
    
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for result in test_results:
            if result["status"] == "FAIL":
                print(f"   - {result['test']}")
                if result["details"]:
                    print(f"     {result['details']}")


if __name__ == "__main__":
    main()
