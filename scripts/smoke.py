"""End-to-end smoke test + minimal demo data creation via the public API."""
import requests, sys, random

BASE = "http://localhost:8000/api"
s = requests.Session()

def ok(r, label):
    if r.status_code >= 400:
        print(f"FAIL {label}: {r.status_code} {r.text[:200]}")
        sys.exit(1)
    return r.json() if r.text else {}

# login
r = s.post(f"{BASE}/auth/login", json={"email": "bit675887@gmail.com", "password": "Director@2027"})
data = ok(r, "login")
print("LOGIN ok, role:", data["user"]["role"], "perms:", len(data["user"]["permissions"]))

me = ok(s.get(f"{BASE}/auth/me"), "me")
print("ME ok:", me["email"])

# academic year
years = ok(s.get(f"{BASE}/academic-years"), "years")
if not years:
    y = ok(s.post(f"{BASE}/academic-years", json={"name": "2026/2027"}), "create year")
    years = [y]
year = years[0]
print("YEAR:", year["name"], "active:", year["is_active"])

# grades
grades = ok(s.get(f"{BASE}/grades", params={"academic_year_id": year["id"]}), "grades")
if not grades:
    for i, nm in enumerate(["الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي"], 1):
        grades.append(ok(s.post(f"{BASE}/grades", json={"academic_year_id": year["id"], "name": nm, "level": i}), "create grade"))
print("GRADES:", len(grades))

# sections
sections = ok(s.get(f"{BASE}/sections"), "sections")
if not sections:
    for g in grades[:2]:
        for nm in ["شعبة أ", "شعبة ب"]:
            sections.append(ok(s.post(f"{BASE}/sections", json={"grade_id": g["id"], "academic_year_id": year["id"], "name": nm, "capacity": 40}), "create section"))
print("SECTIONS:", len(sections))

# subjects
subjects = ok(s.get(f"{BASE}/subjects"), "subjects")
if not subjects:
    for nm, code in [("الرياضيات", "MATH"), ("الفيزياء", "PHY"), ("اللغة العربية", "AR"), ("اللغة الإنجليزية", "EN")]:
        subjects.append(ok(s.post(f"{BASE}/subjects", json={"name": nm, "code": code, "weekly_periods": 5, "grade_ids": [g["id"] for g in grades]}), "create subject"))
print("SUBJECTS:", len(subjects))

# teacher (with account)
teachers = ok(s.get(f"{BASE}/teachers"), "teachers")["items"]
if not teachers:
    t = ok(s.post(f"{BASE}/teachers", json={
        "full_name": "أ. طارق الشوابكة", "employee_id": "T-1001", "email": "teacher1@school.edu",
        "phone": "0790000000", "subject_ids": [subjects[0]["id"]],
        "assigned_section_ids": [sections[0]["id"]], "create_account": True,
        "username": "teacher1", "password": "Teacher@2027"}), "create teacher")
    teachers = [t]
teacher = teachers[0]
print("TEACHER:", teacher["full_name"], "account:", bool(teacher.get("user_id")))

# students
studs = ok(s.get(f"{BASE}/students", params={"section_id": sections[0]["id"]}), "students")
if studs["total"] < 5:
    names = ["عمر خليل", "حمزة فيصل", "يوسف أحمد", "محمد علي", "خالد سعيد", "عبدالله ناصر"]
    for i, nm in enumerate(names):
        ok(s.post(f"{BASE}/students", json={
            "full_name": nm, "student_number": f"S{1000+i}", "gender": "male",
            "grade_id": sections[0]["grade_id"], "section_id": sections[0]["id"],
            "academic_year_id": year["id"], "guardian_name": "ولي الأمر", "guardian_phone": "079111"}), "create student")
studs = ok(s.get(f"{BASE}/students", params={"section_id": sections[0]["id"]}), "students2")
print("STUDENTS in section:", studs["total"])

# timetable entry (today's weekday)
import datetime
dow = (datetime.datetime.utcnow().weekday() + 1) % 7  # sunday=0
tt = ok(s.get(f"{BASE}/timetable", params={"section_id": sections[0]["id"]}), "timetable")
entry = None
for e in tt:
    if e["day_of_week"] == dow:
        entry = e; break
if not entry:
    try:
        entry = ok(s.post(f"{BASE}/timetable", json={
            "academic_year_id": year["id"], "day_of_week": dow, "period": 1,
            "start_time": "08:00", "end_time": "08:45", "subject_id": subjects[0]["id"],
            "teacher_id": teacher["id"], "grade_id": sections[0]["grade_id"],
            "section_id": sections[0]["id"], "classroom": "A1"}), "create timetable")
    except SystemExit:
        # maybe conflict, refetch
        tt = ok(s.get(f"{BASE}/timetable", params={"section_id": sections[0]["id"]}), "tt2")
        entry = next((e for e in tt if e["day_of_week"] == dow), tt[0] if tt else None)
print("TIMETABLE entry today:", entry["subject_name"] if entry else None)

# take attendance
today = datetime.date.today().isoformat()
roster = ok(s.get(f"{BASE}/attendance/roster", params={"timetable_id": entry["id"], "date": today}), "roster")
records = []
for i, st in enumerate(roster["roster"]):
    status = "ABSENT" if i % 4 == 0 else "PRESENT"
    records.append({"student_id": st["student_id"], "status": status, "note": ""})
res = ok(s.post(f"{BASE}/attendance", json={"timetable_id": entry["id"], "date": today, "records": records}), "submit attendance")
print("ATTENDANCE submitted:", res["records"], "records")

# dashboard
dash = ok(s.get(f"{BASE}/dashboard/admin"), "dashboard")
print("DASHBOARD kpis:", dash["kpis"])

# audit
audit = ok(s.get(f"{BASE}/audit-logs"), "audit")
print("AUDIT total:", audit["total"])

print("\nALL SMOKE TESTS PASSED ✅")
