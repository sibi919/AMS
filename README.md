# JOAB Academy

The existing JOAB Academy React/Vite project contains the brochure-based public site and a private Student, Staff and Admin portal. There is no public registration or payment gateway. Login uses an account holder's email and password; Admin or explicitly authorized Staff provision Student accounts.

## Local run

Use Node 24.15+ and a dedicated Supabase project. Apply all migrations in `supabase/migrations` in order, deploy the `create-account` Edge Function, bootstrap the first Admin, and configure the browser's publishable credentials. Follow [setup](docs/SETUP.md). Without credentials, the public site works and sign-in stays disabled.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

## Features

- Preserved responsive JOAB portfolio, grounded in the supplied brochure and client-provided contact details.
- Email/password role login, protected routes, private profile photos, password changes, account provisioning, Staff permissions and Admin account controls.
- Courses, batches and enrollment; draft/published recorded lessons and YouTube Live classes; embedded YouTube players in Student dashboards.
- Server-calculated watch attendance and exact 75% academy / 85% exam eligibility, with the limitations in [status](docs/STATUS.md).
- Class comments, private Student-to-assigned-Staff doubts, assignments/submissions/marks, notes, in-app notifications, reports and Admin audit visibility.
- PostgreSQL row-level security and server functions for academic writes. No service key is bundled into the frontend.

## Verify

```sh
npm run typecheck
npm test
npm run test:db
npm run lint
npm run build
npx playwright install chromium
npm run test:browser
```

The database tests run PostgreSQL semantics in PGlite. Authenticated browser tests use explicit Supabase API fixtures. Hosted service setup and launch require the staging acceptance steps in [setup](docs/SETUP.md). Actual verification and remaining limits are recorded in [status](docs/STATUS.md).

## Batch 2 continuation

The public portfolio uses real photographs extracted from the academy brochure. The role portal contains Admin, Staff / Teacher and Student workflows for accounts, batches, timetable, recorded and Live classes, attendance history, discussions, doubts, assignments, marks, notes, notifications and reports. The CEO photo and identity are intentionally unassigned until JOAB confirms them.

Apply all five Supabase migrations in order. See `docs/SETUP.md` for the hosted service settings and `docs/STATUS.md` for current development status. The source archive excludes credentials and installed dependencies; run `npm ci` in the project directory to install dependencies.
