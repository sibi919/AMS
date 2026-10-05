import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
let db;
const ids = {
  admin: "10000000-0000-0000-0000-000000000001",
  staff: "10000000-0000-0000-0000-000000000002",
  student: "10000000-0000-0000-0000-000000000003",
  other: "10000000-0000-0000-0000-000000000004",
};
async function create(id, role, code, creator, extra = {}) {
  await db.query("insert into auth.users(id,raw_app_meta_data) values($1,$2)", [
    id,
    JSON.stringify({
      academy_role: role,
      account_code: code,
      full_name: code,
      created_by: creator,
      ...extra,
    }),
  ]);
}
async function asUser(id, sql) {
  await db.exec("begin; set local role authenticated;");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    const result = await db.query(sql);
    await db.exec("commit");
    return result;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
before(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create table auth.users(id uuid primary key,raw_app_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id int generated always as identity,bucket_id text,name text);
 alter table storage.objects enable row level security; grant usage on schema storage to authenticated;
 grant select,insert,update on storage.objects to authenticated; grant usage on all sequences in schema storage to authenticated;`);
  await db.exec(
    await readFile("supabase/migrations/202609160001_foundation.sql", "utf8"),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/202609160002_profile_photos.sql",
      "utf8",
    ),
  );
  await db.exec(await readFile("supabase/migrations/202609160003_academy.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202609160004_schedule_roster.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202609160005_batch2_hardening.sql", "utf8"));
  await create(ids.admin, "admin", "ADM001", null);
  await create(ids.staff, "staff", "STA001", ids.admin);
  await create(ids.student, "student", "STU001", ids.admin, {
    assigned_staff_id: ids.staff,
  });
  await create(ids.other, "student", "STU002", ids.admin);
});
after(async () => {
  await db.close();
});
test("signup without trusted provisioning metadata is rejected", async () => {
  await assert.rejects(
    db.query("insert into auth.users(id,raw_app_meta_data) values($1,$2)", [
      "20000000-0000-0000-0000-000000000001",
      "{}",
    ]),
    /provisioning required/,
  );
});
test("bootstrap can only create the initial admin", async () => {
  await assert.rejects(
    create("20000000-0000-0000-0000-000000000002", "admin", "BAD001", null),
    /bootstrap only/,
  );
});
test("student can read only own profile and edit permitted fields", async () => {
  const rows = await asUser(ids.student, "select * from public.profiles");
  assert.equal(rows.rows.length, 1);
  await asUser(
    ids.student,
    "update public.profiles set full_name='Updated Student',address='Test address'",
  );
  await assert.rejects(
    asUser(ids.student, "update public.profiles set role='admin'"),
    /permission denied/,
  );
  await assert.rejects(
    asUser(ids.student, "update public.profiles set account_code='ESCALATE'"),
    /permission denied/,
  );
  await assert.rejects(
    asUser(ids.student, "update public.profiles set can_create_students=true"),
    /permission denied/,
  );
});
test("staff sees only self and associated students", async () => {
  const data = await asUser(ids.staff, "select * from public.profiles");
  assert.equal(data.rows.length, 2);
});
test("unpermitted staff cannot create students or self-authorize", async () => {
  await assert.rejects(
    create(
      "20000000-0000-0000-0000-000000000003",
      "student",
      "BAD002",
      ids.staff,
    ),
    /forbidden/,
  );
  await assert.rejects(
    asUser(
      ids.staff,
      `select public.admin_update_account('${ids.staff}',true,true,null,'')`,
    ),
    /Admin required/,
  );
});
test("admin grants permission; staff creates only students with forced self-assignment", async () => {
  await asUser(
    ids.admin,
    `select public.admin_update_account('${ids.staff}',true,true,null,'')`,
  );
  await create(
    "20000000-0000-0000-0000-000000000004",
    "student",
    "STU003",
    ids.staff,
  );
  const row = await db.query(
    "select assigned_staff_id from public.profiles where account_code='STU003'",
  );
  assert.equal(row.rows[0].assigned_staff_id, ids.staff);
  await assert.rejects(
    create(
      "20000000-0000-0000-0000-000000000005",
      "admin",
      "BAD003",
      ids.staff,
    ),
    /forbidden/,
  );
});
test("duplicate account ID rolls back Auth insertion", async () => {
  const id = "20000000-0000-0000-0000-000000000006";
  await assert.rejects(
    create(id, "student", "STU001", ids.admin),
    /unique constraint/,
  );
  assert.equal(
    (await db.query("select * from auth.users where id=$1", [id])).rows.length,
    0,
  );
});
test("revocation and disabling apply to existing user identity immediately", async () => {
  await asUser(
    ids.admin,
    `select public.admin_update_account('${ids.staff}',true,false,null,'')`,
  );
  await assert.rejects(
    create(
      "20000000-0000-0000-0000-000000000007",
      "student",
      "BAD004",
      ids.staff,
    ),
    /forbidden/,
  );
  await asUser(
    ids.admin,
    `select public.admin_update_account('${ids.other}',false,false,null,'')`,
  );
  assert.equal(
    (await asUser(ids.other, "select * from public.profiles")).rows.length,
    0,
  );
  assert.equal(
    (
      await asUser(
        ids.other,
        "update public.profiles set full_name='Disabled write' returning id",
      )
    ).rows.length,
    0,
  );
});
test("audit records are admin-only and cannot be forged", async () => {
  assert.equal(
    (await asUser(ids.student, "select * from public.audit_logs")).rows.length,
    0,
  );
  assert.ok(
    (await asUser(ids.admin, "select * from public.audit_logs")).rows.length >
      4,
  );
  await assert.rejects(
    asUser(ids.admin, "insert into public.audit_logs(action) values('fake')"),
    /permission denied/,
  );
});
test("private photos enforce owner path and block disabled accounts", async () => {
  await asUser(
    ids.student,
    `insert into storage.objects(bucket_id,name) values('profile-photos','${ids.student}/avatar')`,
  );
  await assert.rejects(
    asUser(
      ids.student,
      `insert into storage.objects(bucket_id,name) values('profile-photos','${ids.other}/avatar')`,
    ),
    /row-level security/,
  );
  assert.equal(
    (await asUser(ids.staff, "select * from storage.objects")).rows.length,
    0,
  );
  await assert.rejects(
    asUser(
      ids.other,
      `insert into storage.objects(bucket_id,name) values('profile-photos','${ids.other}/avatar')`,
    ),
    /row-level security/,
  );
});
test("locked eligibility thresholds use exact unrounded percentages", async () => {
  for (const [p, status] of [
    [0, "academy_not_eligible"],
    [74.999, "academy_not_eligible"],
    [75, "academy_eligible_exam_not_eligible"],
    [84.99, "academy_eligible_exam_not_eligible"],
    [85, "academy_and_exam_eligible"],
    [100, "academy_and_exam_eligible"],
  ]) {
    const r = await db.query(
      "select public.attendance_eligibility($1) as result",
      [p],
    );
    assert.equal(r.rows[0].result, status);
  }
  for (const p of [-1, 101, null, "NaN"])
    await assert.rejects(
      db.query("select public.attendance_eligibility($1)", [p]),
      /Invalid percentage/,
    );
  await assert.rejects(
    asUser(ids.student, "select public.attendance_eligibility(100)"),
    /permission denied/,
  );
});
test("anonymous clients have no account-table access", async () => {
  await db.exec("begin; set local role anon;");
  try {
    await assert.rejects(
      db.query("select * from public.profiles"),
      /permission denied/,
    );
  } finally {
    await db.exec("rollback");
  }
});
test("admin cannot disable their own account", async () => {
  await assert.rejects(
    asUser(
      ids.admin,
      `select public.admin_update_account('${ids.admin}',false,false,null,'')`,
    ),
    /Cannot disable/,
  );
});
test("creation rate limit is enforced by PostgreSQL, not just the UI", async () => {
  const current = await db.query(
    "select count(*)::int as count from public.audit_logs where actor_id=$1 and action='account.created'",
    [ids.admin],
  );
  for (let i = current.rows[0].count; i < 20; i++)
    await create(
      `30000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      "student",
      `RATE${i}`,
      ids.admin,
    );
  await assert.rejects(
    create(
      "40000000-0000-0000-0000-000000000001",
      "student",
      "RATEOVER",
      ids.admin,
    ),
    /limit reached/,
  );
});
test("academic access, publishing, submissions and watch credit", async () => {
  await assert.rejects(asUser(ids.student, "select public.academy_manage('course',null,null,'Unsafe','',null,null,false,null)"), /Admin required/);
  const course = (await asUser(ids.admin, "select public.academy_manage('course',null,null,'Solar training','',null,null,false,null) id")).rows[0].id;
  const batch = (await asUser(ids.admin, `select public.academy_manage('batch',null,'${course}','Morning batch','', '${ids.staff}',null,false,null) id`)).rows[0].id;
  const lesson = (await asUser(ids.staff, `select public.academy_manage('lesson',null,'${batch}','First lesson','', 'abcdefghijk',120,true,null) id`)).rows[0].id;
  assert.equal((await asUser(ids.student, "select * from public.lessons")).rows.length, 0);
  await asUser(ids.staff, `select public.academy_enroll('${batch}','${ids.student}')`);
  assert.equal((await asUser(ids.student, "select * from public.lessons")).rows.length, 1);
  assert.equal((await asUser(ids.other, "select * from public.lessons")).rows.length, 0);
  await assert.rejects(asUser(ids.other, `select public.watch_start('${lesson}')`), /Enrollment required/);
  await asUser(ids.student, `select public.academy_post('comment','${lesson}',null,'Question')`);
  assert.equal((await asUser(ids.other, "select * from public.class_comments")).rows.length, 0);
  await asUser(ids.student, `select public.academy_post('doubt',null,'${ids.student}','Private question')`);
  assert.equal((await asUser(ids.staff, "select * from public.doubt_messages")).rows.length, 1);
  assert.equal((await asUser(ids.admin, "select * from public.doubt_messages")).rows.length, 0);
  const assignment = (await asUser(ids.staff, `select public.academy_manage('assignment',null,'${batch}','Exercise','Explain the answer',null,null,true,null) id`)).rows[0].id;
  const submission = (await asUser(ids.student, `select public.academy_submit('${assignment}','My answer') id`)).rows[0].id;
  await asUser(ids.staff, `select public.academy_grade('${submission}',82,'Good')`);
  assert.equal((await asUser(ids.student,"select mark from public.submissions")).rows[0].mark, "82.00");
  const watch = (await asUser(ids.student, `select public.watch_start('${lesson}') id`)).rows[0].id;
  await db.query("update public.watch_sessions set last_ping=now()-interval '15 seconds' where id=$1",[watch]);
  const credited = await asUser(ids.student, `select public.watch_ping('${watch}',15,true) value`);
  assert.ok(Number(credited.rows[0].value) >= 14);
  const replay = await asUser(ids.student, `select public.watch_ping('${watch}',15,true) value`);
  assert.equal(Number(replay.rows[0].value), Number(credited.rows[0].value));
  const summary = await asUser(ids.student, `select * from public.attendance_summary('${batch}','${ids.student}')`);
  assert.ok(Number(summary.rows[0].percentage) > 0);
  await assert.rejects(asUser(ids.other, `select * from public.attendance_summary('${batch}','${ids.student}')`), /Enrollment access required/);
  await assert.rejects(asUser(ids.staff, `select public.academy_enroll('${batch}','${ids.other}')`), /Active student required/);
  await asUser(ids.staff, `select public.academy_notify('${batch}','Class update','New material available')`);
  assert.equal((await asUser(ids.student, "select * from public.notifications")).rows.length, 1);
  assert.equal((await asUser(ids.other, "select * from public.notifications")).rows.length, 0);
  await asUser(ids.admin, `select public.admin_update_account('${ids.student}',true,false,null,'')`);
  assert.equal((await asUser(ids.staff, "select * from public.doubt_messages")).rows.length, 0);
  await assert.rejects(asUser(ids.student, `select public.academy_post('doubt',null,'${ids.student}','Old conversation')`), /Assigned conversation required/);

});
test("timetable and roster mutations remain server-authorized", async () => {
  const course = (await asUser(ids.admin, "select public.academy_manage('course',null,null,'Timetable course','',null,null,false,null) id")).rows[0].id;
  const batch = (await asUser(ids.admin, `select public.academy_manage('batch',null,'${course}','Scheduled batch','','${ids.staff}',null,false,null) id`)).rows[0].id;
  await assert.rejects(asUser(ids.student, `select public.academy_schedule(null,'${batch}','Unsafe class','',now(),now()+interval '1 hour',true)`), /Teaching access required/);
  const scheduled = (await asUser(ids.staff, `select public.academy_schedule(null,'${batch}','First class','https://example.org/class',now(),now()+interval '1 hour',true) id`)).rows[0].id;
  assert.equal((await asUser(ids.student, "select * from public.class_schedule")).rows.length, 0);
  await asUser(ids.admin, `select public.academy_enroll('${batch}','${ids.student}')`);
  assert.equal((await asUser(ids.student, `select id from public.class_schedule where id='${scheduled}'`)).rows.length, 1);
  await assert.rejects(asUser(ids.student, `select public.academy_unenroll('${batch}','${ids.student}')`), /Teaching access required/);
  await asUser(ids.admin, `select public.academy_unenroll('${batch}','${ids.student}')`);
  assert.equal((await asUser(ids.student, "select * from public.class_schedule")).rows.length, 0);
  await assert.rejects(asUser(ids.staff, `select public.academy_set_active('batch','${batch}',false)`), /Admin required/);
  await asUser(ids.admin, `select public.academy_set_active('batch','${batch}',false)`);
});
