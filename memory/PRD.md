# PRD — School Attendance Management System

## Original Problem Statement
Production-ready, full-stack School Attendance Management System for **مدرسة الملك حسين بن طلال الثانوية الشاملة للبنين**. Arabic-first RTL, optional English. Users: Director/Admins, Teachers, Students. Granular RBAC, dashboards, school structure, teacher/student management, subjects, timetable, a fast attendance core, correction workflow, anti-cheating + QR, absence alerts, notifications, announcements, reports+export, analytics, global search, audit log, sessions, optional 2FA, settings, security.

## User Choices
- Auth: JWT custom auth (httpOnly cookies) with roles + granular permissions + per-user overrides.
- Seed: only the Director account; everything else created in-app by the Director.
- Notifications: in-app internal only.
- Language default: Arabic RTL with English toggle.
- Theme: **Light only** (dark mode removed per user request).

## Architecture
- Frontend: React 19 (CRA/craco), TailwindCSS, shadcn/ui, react-router 7, @tanstack/react-query, recharts, sonner, lucide-react. Fonts: Cairo (AR) / Outfit (EN).
- Backend: FastAPI (modular routers) + MongoDB (motor). JWT (PyJWT) access(30m)+refresh(7d) httpOnly cookies, bcrypt, brute-force lockout, sessions, pyotp 2FA.
- Files: backend `core.py` (db/security/deps/audit/notify/settings), `rbac.py` (permissions+roles), `routes_auth.py`, `routes_structure.py`, `routes_users.py` (users/teachers/students), `routes_timetable.py`, `routes_attendance.py`, `routes_dashboard.py`. Frontend `pages/*`, `components/Layout.jsx`, `lib/{api,auth,i18n,nav,lookups}`.

## Personas
- DIRECTOR/SUPER_ADMIN: full access + school overview. VICE_DIRECTOR: near-full. ATTENDANCE_OFFICER: attendance ops. CLASS_SUPERVISOR: section analytics. TEACHER: own lessons/attendance (section-scoped). STUDENT: own attendance/schedule. READ_ONLY_ADMIN: view-only.

## Implemented (2026-06)
- JWT auth (login/refresh/logout/me, change/forgot/reset password), brute-force lockout, sessions list/revoke, 2FA setup/enable/disable.
- RBAC: 8 roles, permission catalog + groups, role→permission map, per-user grant/revoke overrides, scope-based teacher access.
- Structure: academic years (activate), grades, sections (student counts, delete guard).
- Subjects CRUD; Teachers CRUD (+ optional login account, subject/section assignment, password reset); Students CRUD (+ optional account, filters, pagination, detail with stats + risk indicator, move).
- Timetable weekly grid with teacher/section conflict detection (409); today's lessons per role.
- Core fast attendance: roster default-PRESENT, mark-all-present, 5 statuses, submit → lock, IP/UA + audit; correction request → director approve/reject workflow with audit + notifications; admin direct edit; QR generate/scan mode (toggleable).
- Dashboards: director (KPIs, weekly trend, class comparison, most-absent, pending teachers), teacher (today lessons + stats), student (rate, calendar-style today, stats).
- Absence alert thresholds (warning/alert/critical) → in-app notifications to student + admins.
- Announcements (priority + targeting) → notifications; Notification center (unread/mark read/mark all).
- Reports (filters + summary + CSV export with Arabic BOM); Analytics (trend, distribution pie, subject comparison); Teacher submission report.
- Audit log (append-only, searchable, paginated); Global search (students/teachers/subjects); Settings (school info, attendance rules, thresholds, QR, periods, maintenance, 2FA policy) + backup trigger/history.
- Modern light-only UI: RTL, professional emerald/gold palette, sidebar+header, breadcrumbs, cards, tables, modals, drawers, toasts, confirm dialogs, empty/loading/error states, mobile-first attendance.
- **Public modern landing page** at `/` (hero, floating attendance cards, features, roles, how-it-works, CTA, footer).

## Testing
- Backend: 38/38 pytest pass (auth, RBAC, scope, structure, subjects, students, teachers, timetable conflict, attendance submit/lock/correction, reports+CSV, analytics, announcements, notifications, audit, settings/backup, search, sessions, 2FA, negative 401/403). Frontend flows verified (login director+teacher, dashboards, nav guards, attendance lock/correction, search). Smoke script `/app/scripts/smoke.py` seeds+validates full chain.
- Fixes applied: student soft-delete duplicate → 400 friendly error; LoginBody `otp` field.

## Backlog / Remaining (P1/P2)
- P1: CSV/Excel bulk import (students/teachers) with validation preview; PDF report rendering; email notifications (Resend) if desired.
- P1: student promotion / archive-graduating batch actions; custom report builder presets.
- P2: real camera QR scanner (currently code entry); attendance risk score tuning; announcement expire-date filtering in list; global DuplicateKeyError→409 handler.

## Next Tasks
- On request: bulk import, PDF export, student promotion workflow, custom report builder.

## Demo Credentials
- Director: bit675887@gmail.com / Director@2027
- Teacher: teacher1@school.edu / Teacher@2027
(See /app/memory/test_credentials.md)
