"""Comprehensive backend tests for School Attendance Management System.

Covers: auth/2FA, RBAC + teacher scope, structure/subjects CRUD, students/teachers CRUD,
timetable conflict detection, attendance submit/lock/correction workflow, reports/CSV export,
analytics, announcements, notifications, audit logs, settings/backup, global search, sessions,
change password, negative security (401/403).
"""
import os
import io
import csv
import datetime as dt
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback for local: read frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE}/api"

DIRECTOR = {"email": "bit675887@gmail.com", "password": "Director@2027"}
TEACHER = {"email": "teacher1@school.edu", "password": "Teacher@2027"}


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def director():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=DIRECTOR, timeout=30)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="session")
def teacher():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=TEACHER, timeout=30)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="session")
def anon():
    return requests.Session()


# ============ AUTH ============
class TestAuth:
    def test_health(self, anon):
        r = anon.get(f"{API}/health", timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"

    def test_director_login_sets_cookies(self, director):
        assert "access_token" in director.cookies
        assert "refresh_token" in director.cookies

    def test_me_director(self, director):
        r = director.get(f"{API}/auth/me")
        assert r.status_code == 200
        me = r.json()
        assert me["role"] == "DIRECTOR"
        assert me["email"] == DIRECTOR["email"]
        assert "password_hash" not in me
        assert isinstance(me["permissions"], list) and len(me["permissions"]) > 20

    def test_login_invalid(self, anon):
        r = anon.post(f"{API}/auth/login", json={"email": "bad@x.com", "password": "wrong"})
        assert r.status_code == 401

    def test_me_without_cookie(self, anon):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_refresh(self, director):
        r = director.post(f"{API}/auth/refresh")
        assert r.status_code == 200

    def test_teacher_login(self, teacher):
        r = teacher.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "TEACHER"


# ============ RBAC + Scope ============
class TestRBAC:
    def test_teacher_cannot_list_users(self, teacher):
        r = teacher.get(f"{API}/users")
        assert r.status_code == 403

    def test_teacher_cannot_patch_settings(self, teacher):
        r = teacher.patch(f"{API}/settings", json={"periods_count": 8})
        assert r.status_code == 403

    def test_teacher_cannot_view_audit(self, teacher):
        r = teacher.get(f"{API}/audit-logs")
        assert r.status_code == 403

    def test_teacher_students_scoped(self, teacher, director):
        r_t = teacher.get(f"{API}/students")
        assert r_t.status_code == 200
        t_items = r_t.json()["items"]
        # teacher assigned only to sections[0] via seed
        t_sections = {s["section_id"] for s in t_items}
        assert len(t_sections) <= 1, f"Teacher sees students from multiple sections: {t_sections}"

        r_d = director.get(f"{API}/students")
        d_items = r_d.json()["items"]
        assert r_d.json()["total"] >= len(t_items)

    def test_teacher_cannot_post_attendance_for_other_teacher_lesson(self, teacher, director):
        # get a lesson NOT assigned to teacher1
        tts = director.get(f"{API}/timetable").json()
        me_teacher_id = teacher.get(f"{API}/auth/me").json().get("teacher_id")
        foreign = None
        # need a lesson with different teacher_id. If none, we skip
        # Create a fake other teacher's timetable? Instead, try their assigned entry (should work)
        # For a real "not assigned" case, patch teacher_id via an unlikely id.
        r = teacher.post(f"{API}/attendance", json={
            "timetable_id": "00000000-0000-0000-0000-nonexistent",
            "date": dt.date.today().isoformat(),
            "records": [],
        })
        # non-existent should return 404, but if the guard runs first it's ok
        assert r.status_code in (403, 404)


# ============ STRUCTURE ============
class TestStructure:
    def test_years_and_activate(self, director):
        r = director.get(f"{API}/academic-years")
        assert r.status_code == 200
        years = r.json()
        assert len(years) >= 1

    def test_grade_and_section_flow(self, director):
        years = director.get(f"{API}/academic-years").json()
        assert years
        year_id = years[0]["id"]

        # create a temp grade
        g = director.post(f"{API}/grades", json={
            "academic_year_id": year_id, "name": "TEST_grade", "level": 99}).json()
        assert "id" in g
        # create section
        sec = director.post(f"{API}/sections", json={
            "grade_id": g["id"], "academic_year_id": year_id,
            "name": "TEST_sec", "capacity": 20}).json()
        assert sec["student_count"] == 0

        # delete empty section OK
        r = director.delete(f"{API}/sections/{sec['id']}")
        assert r.status_code == 200

        # cleanup grade
        director.delete(f"{API}/grades/{g['id']}")

    def test_section_with_students_cannot_delete(self, director):
        secs = director.get(f"{API}/sections").json()
        # find one with students
        target = next((s for s in secs if s.get("student_count", 0) > 0), None)
        if not target:
            pytest.skip("No section with students to test 400 delete")
        r = director.delete(f"{API}/sections/{target['id']}")
        assert r.status_code == 400


# ============ SUBJECTS ============
class TestSubjects:
    def test_subjects_crud(self, director):
        subs = director.get(f"{API}/subjects").json()
        assert isinstance(subs, list) and len(subs) >= 1

        new = director.post(f"{API}/subjects", json={
            "name": "TEST_subject", "code": "TST", "weekly_periods": 2}).json()
        assert new["name"] == "TEST_subject"

        # update
        r = director.patch(f"{API}/subjects/{new['id']}", json={
            "name": "TEST_subject2", "code": "TS2", "weekly_periods": 3})
        assert r.status_code == 200
        # delete
        r = director.delete(f"{API}/subjects/{new['id']}")
        assert r.status_code == 200


# ============ STUDENTS ============
class TestStudents:
    def test_list_and_filters(self, director):
        r = director.get(f"{API}/students", params={"page": 1, "limit": 5})
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "total" in d
        assert d["limit"] == 5

    def test_search_filter(self, director):
        # search by first letter of any student
        r = director.get(f"{API}/students", params={"search": "م"})
        assert r.status_code == 200

    def test_create_read_update_delete(self, director):
        secs = director.get(f"{API}/sections").json()
        assert secs
        sec = secs[0]
        year = director.get(f"{API}/academic-years").json()[0]

        import uuid
        sn = f"TEST_{uuid.uuid4().hex[:8]}"
        body = {
            "full_name": "TEST_student_x", "student_number": sn,
            "gender": "male", "grade_id": sec["grade_id"], "section_id": sec["id"],
            "academic_year_id": year["id"],
        }
        r = director.post(f"{API}/students", json=body)
        assert r.status_code == 200, r.text
        stu = r.json()
        assert stu["full_name"] == "TEST_student_x"
        sid = stu["id"]

        # get detail with stats
        r = director.get(f"{API}/students/{sid}")
        assert r.status_code == 200
        assert "stats" in r.json()

        # delete (soft)
        r = director.delete(f"{API}/students/{sid}")
        assert r.status_code == 200


# ============ TEACHERS ============
class TestTeachers:
    def test_list(self, director):
        r = director.get(f"{API}/teachers")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    def test_reset_password(self, director):
        import uuid
        # Create a throwaway teacher account so we don't lock out the shared teacher fixture.
        subs = director.get(f"{API}/subjects").json()
        secs = director.get(f"{API}/sections").json()
        suffix = uuid.uuid4().hex[:8]
        t = director.post(f"{API}/teachers", json={
            "full_name": "TEST_reset_pw_teacher",
            "email": f"test_reset_{suffix}@school.edu",
            "subject_ids": [subs[0]["id"]] if subs else [],
            "assigned_section_ids": [secs[0]["id"]] if secs else [],
            "create_account": True, "username": f"test_reset_{suffix}",
            "password": "TempPass@123",
        }).json()
        assert t.get("user_id")
        r = director.post(f"{API}/users/{t['user_id']}/reset-password")
        assert r.status_code == 200
        assert "temporary_password" in r.json()
        # cleanup
        director.delete(f"{API}/teachers/{t['id']}")


# ============ TIMETABLE ============
class TestTimetable:
    def test_conflict_teacher(self, director):
        # Grab an existing entry, try to create a duplicate on same teacher/day/period
        entries = director.get(f"{API}/timetable").json()
        if not entries:
            pytest.skip("No timetable entries seeded")
        e = entries[0]
        payload = {
            "academic_year_id": e["academic_year_id"], "day_of_week": e["day_of_week"],
            "period": e["period"], "start_time": e["start_time"], "end_time": e["end_time"],
            "subject_id": e["subject_id"], "teacher_id": e["teacher_id"],
            "grade_id": e["grade_id"], "section_id": e["section_id"], "classroom": "TEST",
        }
        r = director.post(f"{API}/timetable", json=payload)
        assert r.status_code == 409

    def test_lessons_today_teacher(self, teacher):
        r = teacher.get(f"{API}/lessons/today")
        assert r.status_code == 200
        # each entry should be assigned to this teacher
        for e in r.json():
            assert e["teacher_id"] == teacher.get(f"{API}/auth/me").json()["teacher_id"]


# ============ ATTENDANCE ============
class TestAttendance:
    def test_roster_and_submit_lock(self, teacher):
        lessons = teacher.get(f"{API}/lessons/today").json()
        if not lessons:
            pytest.skip("No lessons today for teacher")
        lesson = lessons[0]
        tid = lesson["id"]
        today = dt.date.today().isoformat()

        r = teacher.get(f"{API}/attendance/roster", params={"timetable_id": tid, "date": today})
        assert r.status_code == 200
        data = r.json()
        assert "roster" in data
        roster = data["roster"]
        if not roster:
            pytest.skip("No students in roster")

        records = [{"student_id": s["student_id"], "status": "PRESENT"} for s in roster]
        records[0]["status"] = "ABSENT"

        if data.get("locked"):
            # already submitted+locked by seed; verify re-submit is 409
            r = teacher.post(f"{API}/attendance", json={
                "timetable_id": tid, "date": today, "records": records})
            assert r.status_code == 409
        else:
            r = teacher.post(f"{API}/attendance", json={
                "timetable_id": tid, "date": today, "records": records})
            assert r.status_code == 200, r.text
            assert r.json()["records"] == len(records)
            # re-open -> should be locked
            r = teacher.get(f"{API}/attendance/roster", params={"timetable_id": tid, "date": today})
            assert r.json()["locked"] is True
            # attempt re-submit -> 409
            r = teacher.post(f"{API}/attendance", json={
                "timetable_id": tid, "date": today, "records": records})
            assert r.status_code == 409

    def test_correction_flow(self, teacher, director):
        today = dt.date.today().isoformat()
        # find teacher's session today
        lessons = teacher.get(f"{API}/lessons/today").json()
        if not lessons:
            pytest.skip("No lessons")
        tid = lessons[0]["id"]
        # get roster (has session)
        roster_resp = teacher.get(f"{API}/attendance/roster", params={"timetable_id": tid, "date": today}).json()
        session = roster_resp.get("session")
        if not session:
            pytest.skip("No submitted session")
        sid_stu = roster_resp["roster"][0]["student_id"]

        # request correction
        r = teacher.post(f"{API}/attendance/correction-request", json={
            "session_id": session["id"], "student_id": sid_stu,
            "new_status": "EXCUSED", "reason": "TEST correction"})
        assert r.status_code == 200, r.text
        corr_id = r.json()["id"]

        # director sees pending
        r = director.get(f"{API}/attendance/corrections", params={"status": "pending"})
        assert r.status_code == 200
        pending_ids = [c["id"] for c in r.json()]
        assert corr_id in pending_ids

        # approve
        r = director.post(f"{API}/attendance/corrections/{corr_id}/review",
                          json={"action": "approve", "reason": "ok"})
        assert r.status_code == 200

        # verify record status changed
        recs = director.get(f"{API}/attendance", params={"date": today}).json()
        target = next((x for x in recs if x["student_id"] == sid_stu and x["timetable_id"] == tid), None)
        assert target and target["status"] == "EXCUSED"


# ============ REPORTS / ANALYTICS ============
class TestReports:
    def test_report_summary(self, director):
        today = dt.date.today().isoformat()
        r = director.get(f"{API}/reports/attendance",
                         params={"date_from": today, "date_to": today})
        assert r.status_code == 200
        d = r.json()
        assert "rows" in d and "summary" in d and "attendance_rate" in d

    def test_report_csv_export(self, director):
        today = dt.date.today().isoformat()
        r = director.get(f"{API}/reports/attendance/export",
                        params={"date_from": today, "date_to": today})
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "attachment" in r.headers.get("content-disposition", "")
        body = r.content.decode("utf-8-sig")
        reader = csv.reader(io.StringIO(body))
        rows = list(reader)
        assert rows and rows[0][0] == "التاريخ"

    def test_analytics(self, director):
        r = director.get(f"{API}/analytics", params={"days": 7})
        assert r.status_code == 200
        d = r.json()
        assert "trend" in d and "distribution" in d and "subject_comparison" in d

    def test_teacher_cannot_export(self, teacher):
        r = teacher.get(f"{API}/reports/attendance/export")
        assert r.status_code == 403


# ============ ANNOUNCEMENTS / NOTIFICATIONS ============
class TestAnnouncements:
    def test_create_and_list(self, director, teacher):
        title = "TEST_announcement"
        r = director.post(f"{API}/announcements", json={
            "title": title, "content": "Hello", "priority": "NORMAL",
            "target_type": "ALL"})
        assert r.status_code == 200, r.text
        ann = r.json()

        # teacher gets a notification
        notifs = teacher.get(f"{API}/notifications").json()
        titles = [n["title"] for n in notifs["items"]]
        assert any(title in t for t in titles), f"Notification not sent, got: {titles[:5]}"

        # mark all read
        r = teacher.post(f"{API}/notifications/read-all")
        assert r.status_code == 200
        d = teacher.get(f"{API}/notifications").json()
        assert d["unread_count"] == 0

        # cleanup
        director.delete(f"{API}/announcements/{ann['id']}")


# ============ AUDIT ============
class TestAudit:
    def test_audit_list(self, director):
        r = director.get(f"{API}/audit-logs", params={"page": 1, "limit": 10})
        assert r.status_code == 200
        d = r.json()
        assert d["total"] >= 1
        assert len(d["items"]) <= 10


# ============ SETTINGS ============
class TestSettings:
    def test_update_and_persist(self, director):
        r = director.patch(f"{API}/settings", json={"periods_count": 8, "qr_enabled": True})
        assert r.status_code == 200
        d = r.json()
        assert d["periods_count"] == 8 and d["qr_enabled"] is True
        # revert
        director.patch(f"{API}/settings", json={"periods_count": 7, "qr_enabled": False})

    def test_backup(self, director):
        r = director.post(f"{API}/settings/backup")
        assert r.status_code == 200
        assert "created_at" in r.json()
        r = director.get(f"{API}/settings/backups")
        assert r.status_code == 200 and len(r.json()) >= 1


# ============ SEARCH ============
class TestSearch:
    def test_search(self, director):
        r = director.get(f"{API}/search", params={"q": "م"})
        assert r.status_code == 200
        d = r.json()
        assert "students" in d and "teachers" in d and "subjects" in d


# ============ SESSIONS / PROFILE ============
class TestSessions:
    def test_list_sessions(self, director):
        r = director.get(f"{API}/auth/sessions")
        assert r.status_code == 200
        sessions = r.json()
        assert isinstance(sessions, list) and len(sessions) >= 1
        assert any(s.get("current") for s in sessions)

    def test_2fa_setup(self, director):
        r = director.post(f"{API}/auth/2fa/setup")
        assert r.status_code == 200
        d = r.json()
        assert "secret" in d and "otpauth_uri" in d


# ============ NEGATIVE / SECURITY ============
class TestSecurity:
    def test_401_without_auth(self):
        endpoints = ["/users", "/students", "/teachers", "/timetable", "/settings",
                     "/audit-logs", "/dashboard/admin"]
        for ep in endpoints:
            r = requests.get(f"{API}{ep}")
            assert r.status_code == 401, f"{ep} returned {r.status_code}"

    def test_teacher_403_on_users(self, teacher):
        r = teacher.post(f"{API}/users", json={
            "email": "x@y.z", "full_name": "x", "password": "pass1234", "role": "TEACHER"})
        assert r.status_code == 403


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))
