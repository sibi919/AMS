# Batch 2 verification record

Date: 17 September 2026. Scope: the existing JOAB Academy source, retained in place.

## Corrections implemented

1. Fixed course visibility caused by an incorrectly bound SQL identifier.
2. Restricted academic history to active users with current course/batch/enrollment access; removed historical account-creator access to reassigned student profiles.
3. Restricted private doubts to the current active Student/assigned Staff pair; added a safe participant directory for names without private contact fields.
4. Replaced playback high-water-only credit with unique watched intervals, actual resume baselines, one active student session, server clock bounds, and nonfinite-position rejection. Page open, idle, seek jumps and replay do not earn additional attendance.
5. Protected recording identity/duration after credit and invalidated sessions when an unwatched recording changes.
6. Prevented graded-answer replacement; serialized grade/submission mutations and added explicit teacher return for revision. Deadlines are enforced in the database.
7. Corrected threshold display, local-date editing, chronological ordering, stale selected students, failed-form clearing and asynchronous data races.
8. Completed password recovery, deferred Auth callbacks outside the session lock, and periodically refreshed authorization.
9. Added scoped/paginated reads, paginated audit details, one mounted YouTube player, final playback heartbeat, accessible tab keyboard behavior and responsive recovery styling. Corrected small-label and footer contrast while retaining the navy/gold palette.
10. Bounded account creation request body reads and retained server token verification, provisioning authorization, no plaintext password storage and no frontend server secrets.

## Evidence and limits

The production build and TypeScript check passed. Lint completed without warnings. All 18 frontend tests and all 44 database tests passed. The database suite executes the five migrations in PGlite, with explicit roles and direct unauthorized-call attempts. The dependency audit reported zero known vulnerabilities for both the complete dependency tree and production dependencies at the time checked. A focused credential-pattern scan found no matches; only `.env.example` is present.

All 21 Chromium browser checks passed with zero failures, skips or flaky results across 1440 × 1000, 390 × 844 and 320 × 740 viewports. The suite covers public navigation, role boundaries, profiles/accounts, module navigation, player start/pause wiring, failed-answer preservation, exact attendance display, teacher local-time editing, return/grading, recovery mismatch/change/expired state, and automated WCAG A/AA checks on the public page, login, dashboards and selected portal views. Reduced-motion mode verifies the public photograph gallery. Timeline list semantics and footer/dashboard-label contrast were corrected. These automated checks do not certify complete accessibility or replace real-device and assistive-technology review. Browser tests use clearly labeled Supabase and YouTube fixtures and block remote font requests for reproducibility; they check browser wiring and rendering, not a live provider installation. SQL authorization tests are independent of those fixtures.

The source reviewers identified grade/submit races, replacement-video attendance reuse, course visibility, timeline ordering, stale doubt selection and outdated account-directory messaging. Each finding was addressed. Tests of locking run in PGlite; they are not a multi-connection load or concurrency benchmark.

## Requirement coverage

The public portfolio retains authentic brochure photography and its placement disclaimer. CEO identity/photo remain explicitly unconfirmed. Public login preserves the three-role flow. Admin/authorized Staff provisioning replaces public registration; there is no payment flow. Profiles, courses/batches, timetable, recordings, Live/replay, attendance/history, notes, public class discussion, private doubts, assignments/marks, progress, notifications, reports and administrative audit controls remain in the same application.

## External acceptance still required

- Apply the five migrations to the existing Supabase project and deploy/configure the account Edge Function.
- Supply browser-safe project settings, exact allowed origins, recovery redirects and SMTP. Validate real Auth, recovery delivery, Storage uploads and signed-photo delivery with disposable accounts.
- Verify real YouTube embedding, playback and Live-to-recording publication with JOAB-owned videos.
- Configure the HTTPS deployment host, security headers and SPA deep links; validate the actual hosted application on physical devices.
- Confirm CEO identity and provide the approved original photo before replacing the placeholder.

No hosted credentials or deployment target were available. Production verification and deployment are not claimed. Client playback signals cannot prove human attention. Existing legacy credit totals are preserved conservatively because historic watched intervals cannot be reconstructed. Existing signed photo URLs may remain valid for up to five minutes after deactivation.
