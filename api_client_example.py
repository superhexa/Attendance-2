from __future__ import annotations

import getpass
from datetime import date
from typing import Any

import requests


class AjyalAttendanceClient:
    def __init__(self, api_url: str = "http://127.0.0.1:8000"):
        self.api_url = api_url.rstrip("/")
        self.http = requests.Session()
        self.session_id: str | None = None

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self.http.request(method, f"{self.api_url}{path}", timeout=60, **kwargs)
        if not response.ok:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text
            raise RuntimeError(f"{method} {path} failed ({response.status_code}): {detail}")
        if response.status_code == 204:
            return None
        return response.json()

    def login(self, username: str, password: str, otp_code: str | None = None) -> dict:
        result = self._request("POST", "/auth/login", json={"username": username, "password": password})
        self.session_id = result["session_id"]
        if result.get("requires_otp"):
            if not otp_code:
                otp_code = input("Enter the 6-digit Ajyal OTP: ").strip()
            result = self._request("POST", f"/auth/{self.session_id}/otp", json={"code": otp_code})
        return result

    def logout(self) -> None:
        if self.session_id:
            self._request("DELETE", f"/auth/{self.session_id}")
            self.session_id = None

    def _path(self, suffix: str) -> str:
        if not self.session_id:
            raise RuntimeError("Call login() first")
        return f"/attendance/{self.session_id}{suffix}"

    def options(self) -> dict:
        return self._request("GET", self._path("/options"))

    def choose_class(self, class_id: str) -> dict:
        return self._request("POST", self._path("/class"), params={"class_id": class_id})

    def choose_section(self, class_id: str, section_id: str, specialty_id: str | None = None) -> dict:
        body = {"class_id": class_id, "section_id": section_id}
        if specialty_id is not None:
            body["specialty_id"] = specialty_id
        return self._request("POST", self._path("/selection"), json=body)

    def choose_attendance_type(self, attendance_type_id: str, attendance_date: date) -> dict:
        return self._request(
            "POST",
            self._path("/type"),
            json={"attendance_type_id": attendance_type_id, "attendance_date": attendance_date.isoformat()},
        )

    def choose_filter(self, violation_id: str = "-99") -> dict:
        return self._request("POST", self._path("/filter"), json={"violation_id": violation_id})

    def students(self) -> list[dict]:
        return self._request("GET", self._path("/students"))

    def save(self, records: list[dict], confirm: bool = False) -> dict:
        return self._request(
            "POST",
            self._path("/save"),
            json={"records": records, "confirm": confirm},
        )


def choose_option(options: list[dict], title: str) -> str:
    print(f"\n{title}")
    for number, option in enumerate(options, 1):
        print(f"{number}. {option['label']} [{option['id']}]")
    while True:
        answer = input("Choose a number: ").strip()
        if answer.isdigit() and 1 <= int(answer) <= len(options):
            return options[int(answer) - 1]["id"]
        print("Invalid choice.")


def main() -> int:
    api_url = input("API URL [http://127.0.0.1:8000]: ").strip() or "http://127.0.0.1:8000"
    username = input("Ajyal username: ").strip()
    password = getpass.getpass("Ajyal password: ")
    client = AjyalAttendanceClient(api_url)
    try:
        print(client.login(username, password)["message"])

        available = client.options()
        class_id = choose_option(available["classes"], "Grade/class")
        available = client.choose_class(class_id)

        specialty_id = None
        if available["specialties"]:
            specialty_id = choose_option(available["specialties"], "Specialty")
        section_id = choose_option(available["sections"], "Section")
        available = client.choose_section(class_id, section_id, specialty_id)

        attendance_type_id = choose_option(available["attendance_types"], "Attendance type")
        attendance_date = input(f"Attendance date [{date.today().isoformat()}]: ").strip() or date.today().isoformat()
        available = client.choose_attendance_type(attendance_type_id, date.fromisoformat(attendance_date))

        violation_id = "-99"
        if available["violations"]:
            violation_id = choose_option(available["violations"], "Violation type")
        client.choose_filter(violation_id)

        students = client.students()
        print("\nStudents")
        for student in students:
            print(f"{student['id']}. {student['name']}")

        selection = input("Student IDs to record, comma-separated (0 to cancel): ").strip()
        if selection == "0":
            print("Cancelled.")
            return 0
        student_ids = sorted({int(value.strip()) for value in selection.split(",")})
        student_by_id = {student["id"]: student for student in students}
        if not student_ids or any(student_id not in student_by_id for student_id in student_ids):
            raise RuntimeError("One or more student IDs are invalid")

        records = []
        for student_id in student_ids:
            print(f"\nStudent {student_id}: {student_by_id[student_id]['name']}")
            print("1. present")
            print("2. excused_absence")
            print("3. unexcused_absence")
            choice = input("Status: ").strip()
            status_map = {"1": "present", "2": "excused_absence", "3": "unexcused_absence"}
            if choice not in status_map:
                raise RuntimeError("Invalid attendance status")
            records.append({"student_id": student_id, "status": status_map[choice]})

        print("\nRecords to save:")
        for record in records:
            print(f"Student {record['student_id']}: {record['status']}")
        if input("Save these records? (yes/no): ").strip().lower() not in {"yes", "y"}:
            print("Save cancelled.")
            return 0

        print(client.save(records, confirm=True))
        return 0
    finally:
        client.logout()


if __name__ == "__main__":
    raise SystemExit(main())
