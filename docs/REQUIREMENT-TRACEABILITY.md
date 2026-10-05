# Academy stabilization traceability

Baseline audit: 26 September 2026. Existing React/Vite portal, Supabase Auth,
PostgreSQL/PostgREST, Storage, Edge account provisioning and nginx gateway are retained.
All execution and verification use Docker.

- WORKING: three roles; private account provisioning; course/batch CRUD; explicit
  enrollments; published-content RLS; discussions; assigned private chat; text
  assignments/submission/grading; text notes; audit logs; persistent photo storage.
- PARTIALLY WORKING: timetable lacks session association; live embeds lack tracked
  participation; profile lacks completion and actual enrollment display; notifications
  require manual broadcast; accounts use a descriptive course label, not enrollment.
- BROKEN for new specification: attendance is duration-weighted per lesson rather
  than completed official sessions. Existing computar lesson is stored as 60 seconds.
  Playback is explicitly paused when watch RPC fails.
- MISSING: official class sessions, session-based presence, multi-video aggregation,
  live participation, real dashboard metrics and upcoming items, teacher duration
  verification, course/date attendance filtering.
- POORLY STRUCTURED: AcademyPage combines learning, management and reports. New
  session/progress components should be extracted without replacing working modules.
- NOT IN EXISTING DESIGN: leave requests, separate feedback ticket workflow,
  resource-file attachments and manual attendance overrides. Avoid duplicate or
  speculative systems; private doubts and class discussion remain the support flow.
- PORTABILITY: existing compose/start/migrate/backup/restore workflows present;
  inspect backup failure recovery and validate restart persistence.

Acceptance: real enrollment-based visibility, continuous playback on attendance
failure, preserved watch history, official-session denominators, exact 75/85 overall
eligibility, Docker checks, security regressions and authenticated workflow tests.
Legacy session durations must be explicitly confirmed; player-observed media
duration does not establish the official class duration.
