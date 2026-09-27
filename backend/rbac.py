"""Role-Based Access Control definitions: permissions, roles, and role->permission mapping."""

# ---- Permission catalog ----
PERMISSIONS = [
    "attendance.view", "attendance.create", "attendance.edit", "attendance.delete",
    "attendance.approve", "attendance.export",
    "students.view", "students.create", "students.edit", "students.delete",
    "teachers.view", "teachers.create", "teachers.edit", "teachers.delete",
    "structure.view", "structure.create", "structure.edit", "structure.delete",
    "subjects.view", "subjects.create", "subjects.edit", "subjects.delete",
    "timetable.view", "timetable.create", "timetable.edit", "timetable.delete",
    "reports.view", "reports.export",
    "users.view", "users.create", "users.edit", "users.disable",
    "signups.view", "signups.approve",
    "substitutions.manage",
    "announcements.view", "announcements.create", "announcements.edit", "announcements.delete",
    "notifications.view",
    "settings.manage",
    "audit_logs.view",
    "dashboard.admin", "dashboard.teacher", "dashboard.student",
]

PERMISSION_GROUPS = {
    "attendance": ["attendance.view", "attendance.create", "attendance.edit", "attendance.delete", "attendance.approve", "attendance.export"],
    "students": ["students.view", "students.create", "students.edit", "students.delete"],
    "teachers": ["teachers.view", "teachers.create", "teachers.edit", "teachers.delete"],
    "structure": ["structure.view", "structure.create", "structure.edit", "structure.delete"],
    "subjects": ["subjects.view", "subjects.create", "subjects.edit", "subjects.delete"],
    "timetable": ["timetable.view", "timetable.create", "timetable.edit", "timetable.delete"],
    "reports": ["reports.view", "reports.export"],
    "users": ["users.view", "users.create", "users.edit", "users.disable"],
    "signups": ["signups.view", "signups.approve"],
    "substitutions": ["substitutions.manage"],
    "announcements": ["announcements.view", "announcements.create", "announcements.edit", "announcements.delete"],
    "system": ["settings.manage", "audit_logs.view"],
}

ROLES = [
    "SUPER_ADMIN", "DIRECTOR", "VICE_DIRECTOR", "TEACHER", "STUDENT",
    "CLASS_SUPERVISOR", "ATTENDANCE_OFFICER", "READ_ONLY_ADMIN",
]

ROLE_LABELS = {
    "SUPER_ADMIN": {"ar": "مدير النظام", "en": "Super Admin"},
    "DIRECTOR": {"ar": "مدير المدرسة", "en": "Director"},
    "VICE_DIRECTOR": {"ar": "نائب المدير", "en": "Vice Director"},
    "TEACHER": {"ar": "معلم", "en": "Teacher"},
    "STUDENT": {"ar": "طالب", "en": "Student"},
    "CLASS_SUPERVISOR": {"ar": "مشرف الصف", "en": "Class Supervisor"},
    "ATTENDANCE_OFFICER": {"ar": "مسؤول الحضور", "en": "Attendance Officer"},
    "READ_ONLY_ADMIN": {"ar": "مشرف اطلاع فقط", "en": "Read-Only Admin"},
}

_ALL = set(PERMISSIONS)

# View-only subset (every *.view permission)
_VIEW_ONLY = {p for p in PERMISSIONS if p.endswith(".view")} | {"reports.view", "notifications.view", "audit_logs.view"}

ROLE_PERMISSIONS = {
    "SUPER_ADMIN": set(_ALL),
    "DIRECTOR": set(_ALL),
    "VICE_DIRECTOR": _ALL - {"settings.manage", "users.disable"},
    "TEACHER": {
        "attendance.view", "attendance.create", "attendance.edit",
        "students.view", "structure.view", "subjects.view", "timetable.view",
        "reports.view", "notifications.view", "announcements.view", "dashboard.teacher",
    },
    "STUDENT": {
        "attendance.view", "timetable.view", "notifications.view",
        "announcements.view", "dashboard.student",
    },
    "CLASS_SUPERVISOR": {
        "attendance.view", "attendance.edit", "attendance.approve", "attendance.export",
        "students.view", "structure.view", "subjects.view", "timetable.view",
        "reports.view", "reports.export", "notifications.view", "announcements.view",
        "dashboard.admin",
    },
    "ATTENDANCE_OFFICER": {
        "attendance.view", "attendance.create", "attendance.edit", "attendance.delete",
        "attendance.approve", "attendance.export",
        "students.view", "teachers.view", "structure.view", "subjects.view", "timetable.view",
        "reports.view", "reports.export", "notifications.view", "announcements.view",
        "dashboard.admin",
    },
    "READ_ONLY_ADMIN": _VIEW_ONLY | {"dashboard.admin"},
}


def effective_permissions(user: dict) -> set:
    """Compute a user's effective permissions from role + per-user overrides."""
    role = user.get("role", "STUDENT")
    perms = set(ROLE_PERMISSIONS.get(role, set()))
    overrides = user.get("permission_overrides") or {}
    for g in overrides.get("grant", []):
        perms.add(g)
    for r in overrides.get("revoke", []):
        perms.discard(r)
    return perms


def has_permission(user: dict, permission: str) -> bool:
    if user.get("role") in ("SUPER_ADMIN", "DIRECTOR"):
        return True
    return permission in effective_permissions(user)
