# JOAB Academy — running it with Docker

Everything runs in Docker. You do **not** need Node, npm, PostgreSQL, nginx or
the Supabase CLI installed on the computer — only Docker Engine and Docker
Compose.

## Session attendance and verification

Create the official class in Academy → Class sessions, confirm its duration,
and publish it. Select that session when adding recorded content, live classes
or timetable entries. Multiple videos may belong to one official session.
Existing recordings were preserved and mapped to sessions marked for duration
review. Review those sessions before using eligibility decisions.

Attendance = Present required sessions / total required sessions. Watch progress
is separate. Academy eligibility starts at 75%; exam eligibility at 85%.
Teacher playback detects YouTube duration; students cannot change duration.
Network tracking failures do not stop playback or credit unverified gaps.

Run all verification tools through Docker:

```sh
docker compose exec -T frontend npm run typecheck
docker compose exec -T frontend npm test
docker compose exec -T frontend npm run test:db
docker compose exec -T frontend npm run build
docker compose build frontend
docker compose --profile test build tests
docker compose --profile test run --rm tests
docker compose --profile test run --rm tests node tests/live-academy.mjs
docker compose --profile test run --rm tests node tests/live-provisioning.mjs
```

The optional test image builds on the existing frontend image and contains its
own browser. Live tests create labelled QA content; test courses are archived
and QA accounts deactivated afterward. Test messages and QA photos are retained.
No existing password or photo is changed. Browser access to YouTube requires
internet; a passing simulated-player test does not establish YouTube availability.

Apply new migrations without resetting data:

```sh
docker compose run --rm migrate
```

Backups now also include the database configuration volume. Backup directories
are private and contain installation keys; do not commit or share them publicly.
Restore is only for a new installation or an explicitly chosen rollback and
requires typing RESTORE. Never run restore against the live project merely to
test it. On a new machine, preserve the matching backup environment keys.

## 1. Start it

Open a terminal in the project folder and run:

```sh
bash docker/scripts/start.sh
```

The first run downloads several GB of images and takes a while. When it
finishes, open:

**http://localhost:8000**

That one address serves the website, the portal, the database API, sign-in,
file storage and the account-creation function. There is no certificate to
install, no `https://`, and no hosts-file entry.

## 2. Create the first Admin

```sh
bash docker/scripts/create-admin.sh
```

It asks for an email, a password (12 characters or more), a full name and an
Admin ID, then creates the very first Admin account. The database allows this
only while no accounts exist at all.

Sign in at **http://localhost:8000/login** with that email and password.

## 3. Create Staff and Students

Exactly as before, from inside the portal: sign in as Admin → **Accounts** →
create Staff, tick “Allow creating Student accounts” for a Staff member if they
should be able to add Students, then create Students. Passwords must be at least
12 characters. Nothing bypasses the database triggers, row-level security or
role permissions — those still decide everything.

Password-recovery emails are not sent to the internet. They are caught locally
and readable at **http://localhost:8025**.

## Everyday commands

| What you want | Command |
| --- | --- |
| Start everything | `bash docker/scripts/start.sh` |
| Stop everything | `bash docker/scripts/stop.sh` |
| Restart | `bash docker/scripts/restart.sh` |
| See logs | `bash docker/scripts/logs.sh` (add a service name, e.g. `auth`) |
| Check what is broken | `bash docker/scripts/doctor.sh` |
| Back up your data | `bash docker/scripts/backup.sh` |
| Restore a backup | `bash docker/scripts/restore.sh backups/joab-backup-…` |
| Create the first Admin | `bash docker/scripts/create-admin.sh` |
| Serve the built site instead of the dev server | `bash docker/scripts/use-built-site.sh on` |

**Never run `docker compose down -v`.** The `-v` deletes the volumes holding
your database and uploaded files. `bash docker/scripts/stop.sh` is always safe.

## After a reboot

Every container is set to `restart: unless-stopped`, so once Docker starts at
boot the whole stack comes back by itself. Nothing needs to be typed. If Docker
itself is not set to start at boot:

```sh
sudo systemctl enable docker
```

If you stopped the stack yourself with `stop.sh`, it stays stopped until you run
`start.sh` again — that is intentional.

## Your data, and what is in the ZIP

The project ZIP contains **source code only**. It does not contain accounts,
student profiles, attendance, marks, uploaded photos or your local keys — those
live in Docker volumes on the machine that has been running.

| What | Where it lives | In the ZIP? |
| --- | --- | --- |
| Application code, migrations | the project folder | yes |
| Database (accounts, marks, attendance, audit log) | volume `joab-academy_joab_db_data` | no |
| Uploaded profile photos | volume `joab-academy_joab_storage_data` | no |
| Local passwords and keys | `.env` in the project folder | no |

### Moving an installation to another computer

On the current machine:

```sh
bash docker/scripts/backup.sh
```

This pauses the database and storage containers for a few seconds, copies both
volumes plus `.env` into `backups/joab-backup-<date>/`, and starts them again.

Copy the project folder **and** that backup folder to the other computer, then:

```sh
bash docker/scripts/restore.sh backups/joab-backup-<date>
bash docker/scripts/start.sh
```

Keep the backup folder private: it contains the database and the keys.

## If something goes wrong

Run `bash docker/scripts/doctor.sh` first. It checks each service one by one and
tells you which is actually failing, instead of leaving you guessing.

**“Incorrect email or password”** — the login page now distinguishes the cases.
If the service is unreachable or still starting, it says so instead of blaming
the password. If it really says the credentials are wrong, they are wrong: check
the email, or create a new account from an Admin session. Do not reset the
database.

**The page does not update after editing source code** — the development
server's hot reload cannot reach the browser through the gateway. Refresh the
page and the change is there. For a customer installation use
`bash docker/scripts/use-built-site.sh on`, which serves the built site instead.

**Port already in use** — something else on the machine is using port 8000:

```sh
bash docker/scripts/init-env.sh --force --port 8100
bash docker/scripts/start.sh
```

This regenerates the local keys but never touches your data. Open the new port
afterwards.

**A blank white page** — that used to happen when the service address was
malformed. The portal now shows a readable message naming the wrong setting
instead. Check `VITE_SUPABASE_URL` and `APP_PORT` in `.env`: they must agree.

**Another Supabase stack is already running** — this project uses its own
Compose project name (`joab-academy`) and its own container names (`joab-*`), so
it will not collide with an unrelated Supabase installation. It publishes only
two host ports (the app and the mail viewer), and no database port at all.

## What runs inside

| Container | Purpose |
| --- | --- |
| `joab-gateway` | nginx; the single entry point on port 8000 |
| `joab-frontend` | the existing Vite app |
| `joab-db` | PostgreSQL (Supabase build) |
| `joab-auth` | Supabase Auth (GoTrue) — email/password sign-in |
| `joab-rest` | PostgREST — the database API, with row-level security |
| `joab-storage` | Supabase Storage — the private `profile-photos` bucket |
| `joab-functions` | Edge runtime serving `create-account` |
| `joab-migrate` | applies `supabase/migrations/*.sql` once, then exits |
| `joab-mail` | local mail catcher for recovery emails |

Supabase is fully self-hosted here. Nothing is sent to supabase.com. The only
feature that still needs the internet is YouTube playback in lessons and Live
classes, plus a one-time download of the Edge Function's npm dependency the
first time an account is created.

The browser only ever receives the publishable key (`sb_publishable_…`), which
is designed to be public. The gateway exchanges it for the internal anon token;
the service-role key never leaves the server containers and is never given to a
`VITE_` variable.

## Going to a real server later

This setup is deliberately local: `http://localhost` on the loopback interface
only. For a customer-facing deployment you still need HTTPS. Put a real reverse
proxy (Caddy, nginx with Let's Encrypt, or your hosting provider's) in front of
the gateway, set `PUBLIC_URL` and `VITE_SUPABASE_URL` to the `https://…` address
and restart. The application requires HTTPS for any non-loopback address, so a
production deployment cannot accidentally run unencrypted. The rest of
`docs/SETUP.md` — Auth settings review, the live acceptance checks, security
headers — still applies before launch.
