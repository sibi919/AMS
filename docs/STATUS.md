# JOAB Academy — Batch 2 status

The existing project has been extended in place. The brochure-grounded public portfolio, six real JOAB photographs, placement disclaimer, safe CEO placeholder, and Portfolio → Login → role selection → authorized portal flow remain intact. There are exactly three roles and no public registration or online payment.

## Implemented product scope

Accounts and permitted profiles/photos; Admin Staff permissions and student provisioning; courses, batches, enrollment and timetable; recorded YouTube lessons; manual Live scheduling and replay attachment; watch attendance/history with exact 75% and 85% eligibility; notes, class discussion, private assigned-Staff doubts; assignments, submissions, grading and return for revision; progress, in-app notifications, reports and paginated Admin audit details.

## Batch 2 corrections

- Current role, active course/batch, enrollment and Staff assignment govern academic reads/writes. Historical account creators no longer retain student personal data after reassignment. A limited directory supplies participant names without private profile fields.
- Playback starts at the actual player position. Server time and unique watched intervals prevent page-open, seeking, duplicate replay and concurrent-session credit. Old sessions expire and recording versions prevent stale-video credit. Videos with attendance cannot be replaced or resized.
- Graded submissions cannot be overwritten. Teachers may explicitly return them; deadlines remain server-enforced. Submission and grading mutations share database locks.
- Fixed course visibility, chronological conversations/timetable, stale student selection, exact percentage display, local-time editing, request races and failed-form preservation.
- Added recovery completion page, Auth callback deferral, periodic permission refresh, keyboard tab navigation, a single mounted video player, scoped paginated reads and audit pagination/details.
- Account-service request bodies are bounded while streaming, without logging passwords or secrets.

## Verification

Local verification passed: production build/type checking, lint, 18 frontend tests, 44 database tests, and 21 Chromium browser checks across three viewport sizes. See BATCH2_REPORT.md for coverage and limits. Automated SQL tests use PostgreSQL through PGlite; browser tests use explicit service fixtures. Hosted Supabase, SMTP, storage delivery and real YouTube playback are not represented as verified.

## External launch dependencies

Provide the existing hosted Supabase project and deployment environment. Apply all five migrations in order, configure Auth (public signup disabled), deploy the account Edge Function, set the two public browser values and the server origin, configure recovery SMTP and `/reset-password`, and perform live acceptance with disposable accounts. No credentials were supplied in this workspace. Confirm CEO identity and original photo before replacing the labeled placeholder.

YouTube signals can be automated and cannot prove human attention; videos are not DRM protected. Live viewing does not count toward recorded attendance. Legacy high-water data cannot reconstruct exact watched intervals; migration preserves totals and conservatively reserves the former span. Already-issued private photo URLs may remain valid for up to five minutes. Notifications are in-app. Forced first-login password change and bulk operations were not requested and are not included.
