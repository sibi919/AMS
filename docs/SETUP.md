# Supabase setup and deployment

## 1. Create a dedicated Supabase project

Use the JOAB Academy Supabase project already associated with this codebase. The provisioning trigger rejects users lacking trusted academy metadata; if that project already contains Auth users, plan a backfill before applying the foundation migration.

In Supabase Authentication settings:

- Disable **Allow new users to sign up** (including email signup).
- Enable email/password sign-in. Leave anonymous and unused OAuth/phone providers disabled.
- Set the minimum password length to at least 12 characters.
- Set Site URL to the exact deployed HTTPS portal origin. Configure the allowed recovery redirect to the exact deployed `/reset-password` URL.
- Review the project's Auth rate limits for your usage.

`supabase/config.toml` records local Auth settings; deploying an Edge Function or applying SQL does **not** automatically configure these hosted Auth settings. Set them in the Dashboard and verify them explicitly.

## 2. Apply database migrations

Using the Supabase CLI, from the repository root:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Alternatively run all five SQL files, in filename order, through the project's SQL Editor. Do not run both methods against the same already-migrated schema. The migrations create the private `profile-photos` bucket (JPG/PNG/WebP, 2 MB limit).

The first migration creates `profiles`, `audit_logs`, `academy_role`, a provisioning trigger on `auth.users`, RLS policies and restricted functions. Auth creation and profile/audit creation are one database transaction. A failed or duplicate profile leaves no orphan Auth user.

## 3. Set browser-safe configuration

Copy `.env.example` to `.env.local` and replace the two values with your project's URL and **publishable key** from Project Settings → API. This frontend intentionally accepts only `sb_publishable_…` keys.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

These are public frontend values. Never add a service-role/secret key to a `VITE_` variable. Vite includes all used `VITE_` values in browser code. Restart development or rebuild after changing them.

## 4. Deploy the account creation function

```sh
supabase secrets set PORTAL_ORIGIN=https://YOUR_PORTAL_HOST
supabase functions deploy create-account
```

Set `PORTAL_ORIGIN` to the exact scheme + hostname + optional port, without a trailing slash. For local frontend testing against hosted Supabase, temporarily use `http://localhost:5173` and visit that exact origin. Restore the production origin before release.

Hosted Edge Functions receive `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase. These credentials stay inside the server runtime. Do not add them to frontend environment files.

`verify_jwt = false` is intentional: the handler **requires a bearer token and verifies it with `auth.getUser(token)` before any privileged operation**, supporting the project's current signing keys. It does not trust decoded client claims. It then reads the live database role/permission. The provisioning trigger rechecks the actor in the same transaction that creates the Auth user. CORS is limited to `PORTAL_ORIGIN`, but CORS is not used as the authorization mechanism.

## 5. Bootstrap the initial Admin

Run the included script on your own trusted machine. The script requires the six environment variables below. Use prompts so passwords and keys are not literal shell-history entries:

```sh
read -r -p 'Supabase URL: ' SUPABASE_URL
read -r -s -p 'Service-role key: ' SUPABASE_SERVICE_ROLE_KEY; echo
read -r -p 'Admin email: ' ADMIN_EMAIL
read -r -s -p 'Admin password (12+ characters): ' ADMIN_PASSWORD; echo
read -r -p 'Admin full name: ' ADMIN_NAME
read -r -p 'Admin ID (3–32 uppercase letters/numbers/_/-): ' ADMIN_CODE
export SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY ADMIN_EMAIL ADMIN_PASSWORD ADMIN_NAME ADMIN_CODE
npm run bootstrap:admin
unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY ADMIN_EMAIL ADMIN_PASSWORD ADMIN_NAME ADMIN_CODE
```

The database permits this creator-less path only while there are no profiles and only for an Admin. Later Admins must be created by an authenticated Admin through the portal. The script logs no credentials. Never commit a shell script containing filled-in credentials.

## 6. Operate accounts

1. Sign in with the initial Admin's email and password. Account ID/roll number is the academy identifier; **login uses email**, not ID lookup. No synthetic email addresses are generated.
2. Open Accounts and create Staff. Staff cannot create Students by default.
3. Manage the Staff account and explicitly enable “Allow creating Student accounts” when appropriate.
4. Create Students, setting an optional course/batch label and assigned Staff. Authorized Staff-created Students are automatically assigned to that Staff member.
5. Share credentials privately outside the app; this implementation sends no invitations or passwords. Staff/Admin must confirm the supplied email belongs to the account holder: server-created accounts are email-confirmed for immediate access.
6. Ask users to change their initial password in My profile. The Login page can request a Supabase password recovery email after the user enters the academy email. Configure Supabase email delivery and the recovery redirect. A forced first-login reset is not implemented.
7. Student personal fields are editable. Role, ID, course label, account status, Staff assignment and permissions are controlled in PostgreSQL. Direct API tampering does not bypass the restrictions.
8. Deactivation revokes profile/database and private-photo access for that identity immediately. It does not globally terminate the Supabase Auth identity or invalidate already-issued photo URLs (up to five minutes). The UI refreshes authorization on session changes and when the page regains visibility; already-rendered data may remain on screen until refresh.

Admin role changes, deletion and email changes are deliberately not exposed as general portal controls. Create accounts with the intended role. Use a separately reviewed administrative migration for role corrections; update the canonical profile and review assignments rather than trusting Auth metadata. Admins can disable other accounts but cannot disable themselves.

## 7. Deploy the frontend

```sh
npm ci
npm run build
```

Deploy `dist/` to your chosen HTTPS static host. Configure SPA fallback so `/login`, `/reset-password`, and `/portal/*` serve `/index.html` (assets should retain normal 404 behavior). Set the two public Vite variables in the build environment before building. Set the exact matching `PORTAL_ORIGIN` for the Edge Function.

Before production, complete a **live** acceptance check with real disposable users:

- Confirm direct public signup is disabled in Auth, not just hidden by the UI.
- Check sign-in, refresh, sign-out and wrong-role route redirects for all three roles.
- Confirm unauthorized Staff and Students cannot call account creation; then grant/revoke Staff permission and repeat with an existing session.
- Attempt direct profile PATCHes changing `role`, `account_code`, `active`, `course_label` or `can_create_students`; all must fail for ordinary authenticated users.
- Check duplicate email and duplicate account ID behavior; ensure no partial account remains.
- Upload a private photo, verify another user cannot read it, then disable the account and retry access.
- Verify account creation and administrative edits appear in `audit_logs`; inspect the Admin Reports audit section.
- Verify the hosted origin and deep links on mobile and desktop.

No Supabase project credentials were supplied during implementation. SQL/security behavior was tested locally, and browser behavior was tested with explicit fixtures. Hosted Auth, Edge Functions, storage delivery, SMTP and deployment still require this live acceptance step.

## Primary references

- [Supabase user creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [Server token verification](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Managing user data](https://supabase.com/docs/guides/auth/managing-user-data)

## Academic module added in this checkout

Apply `supabase/migrations/202609160003_academy.sql` after the two foundation migrations. This creates courses, batches, enrollments, lessons, Live sessions, class comments, private doubts, assignments/submissions, notes, notifications, watch sessions/credit and their RLS policies. Only the authenticated database functions can write these academic records. It adds no new environment secrets.

In the Admin portal, create a course, a batch assigned to active Staff, and Student accounts assigned to that Staff. Enroll the Students in the batch. Staff can then publish lessons, Live sessions, assignments and notes. Enter an eleven-character YouTube ID or a valid YouTube URL and the actual recording duration in seconds. YouTube content must permit embedding; unavailable, private or embed-disabled videos will not play. Staff must publish a Live replay separately as a recorded lesson if it should count toward recorded watch attendance.

Verify with real accounts in a hosted staging project before launch: enrolled Student can see only published content in their batch; another Student and unassigned Staff cannot; a reassigned Staff member loses the private doubt thread; watch credit advances only during normal playback; seeking, rapid playback and stale sessions do not add credit; 75% and 85% eligibility change at exact thresholds. Also verify profile photos, account deactivation, mobile layouts, failed network states and YouTube playback. The local tests use PGlite and browser API fixtures, not the hosted provider.

## Batch 2 migration and operational notes

Apply `202609160005_batch2_hardening.sql` after the four existing migrations. It fixes course visibility, strengthens current enrollment/Staff checks, adds the safe participant directory, graded submission return flow, unique watch intervals, recording versions, and indexes. Apply this migration before deploying this frontend because playback now sends its starting position. Existing sessions expire when it is applied.

Existing credited totals are preserved. Prior exact watched intervals cannot be recovered from the old high-water data, so its old span is reserved against duplicate credit. This conservative migration may leave skipped portions of an old span unavailable for additional credit; review legacy records before launch. Recordings with attendance cannot have their video/duration replaced: publish a new lesson instead.

Recovery emails must redirect to `/reset-password`; verify SMTP delivery, expired links, password changes, and sign-out on the live project. A successful client-side fixture test is not an SMTP or hosted Auth test.

On the HTTPS host, configure SPA fallback, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and frame protection for the portal. Validate any Content Security Policy against Supabase Auth/storage and YouTube iframe/API origins in staging; no host configuration can be applied without the deployment target.
