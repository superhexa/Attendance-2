# Auth Testing Playbook

Admin: bit675887@gmail.com / Director@2027 (role DIRECTOR)

## API test
```
API=<REACT_APP_BACKEND_URL>
curl -c cookies.txt -X POST $API/api/auth/login -H "Content-Type: application/json" -d '{"email":"bit675887@gmail.com","password":"Director@2027"}'
curl -b cookies.txt $API/api/auth/me
```
Login returns { user, access_token } and sets access_token + refresh_token cookies.
/me returns the user with computed `permissions` list.

## Notes
- bcrypt hashes start with $2b$
- Brute force: 5 failed attempts on {ip}:{email} => 15 min lock (429)
- RBAC: DIRECTOR/SUPER_ADMIN bypass all permission checks; others gated by rbac.effective_permissions
- Teacher scope: teachers only see students in their assigned_section_ids; can only submit attendance for their own timetable lessons
