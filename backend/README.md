# EduBase Backend

## Setup
1. `cp .env.example .env` and fill in your PostgreSQL credentials.
2. `npm install`
3. `npm run db:init` — creates schema (src/scripts/schema.sql)
4. `npm run db:seed` — loads demo admin/student/faculty accounts
5. `npm run dev` — API on http://localhost:5000

## Demo accounts (after seeding)
- Admin: see seed output in src/scripts/seedDb.js
- Student / Faculty: register via the UI, then approve as admin
  (Pending Requests → Approve), then log in.
  
## Demo payments
`DEMO_PAYMENTS_ENABLED=true` is set in `.env` for the demo, so payment
endpoints simulate transactions instead of calling a real payment gateway.

## Auth design (be ready to explain)
- Passwords: bcrypt (cost 12, per-user salt) — never plain text.
- Sessions: random 256-bit token; only its SHA-256 hash is stored in
  `login_session`. Logout sets `revoked_at`, so the token genuinely dies.
- Roles: read from the `users` table at login; the client never sends a role.
- Authorization: `auth.requireAdmin/Student/Faculty` middleware on the
  server; ownership checks compare `req.user.student_id` / `faculty_id`
  against request IDs before any data is returned.
