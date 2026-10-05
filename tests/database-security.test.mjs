import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
let db;
const id = Object.fromEntries(['admin','staff','staff2','student','student2','course','course2','batch','batch2','lesson','lesson2','otherLesson','assignment','live'].map((name,i)=>[name,`40000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`]));
async function asUser(user, sql, params=[]) {
  await db.exec('savepoint identity; set local role authenticated;');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
    const result=await db.query(sql,params);
    await db.exec('reset role; release savepoint identity;'); return result;
  } catch(e) {await db.exec('rollback to savepoint identity; reset role; release savepoint identity;');throw e;}
}
const rpc = (user,name,params=[])=>asUser(user,`select public.${name}(${params.map((_,i)=>`$${i+1}`).join(',')}) as value`,params);
async function start(lesson=id.lesson,position=0,user=id.student) {return (await rpc(user,'watch_start',[lesson,position])).rows[0].value;}
async function ping(session,position,{elapsed=10,playing=true,user=id.student}={}) {
  await db.query("update public.watch_sessions set last_ping=clock_timestamp()-($1*interval '1 second') where id=$2",[elapsed,session]);
  return Number((await rpc(user,'watch_ping',[session,position,playing])).rows[0].value);
}
before(async()=>{
  db=new PGlite(); await db.waitReady;
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key, raw_app_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id bigint generated always as identity,bucket_id text,name text);
    alter table storage.objects enable row level security; grant usage on schema storage to authenticated;
    grant select,insert,update on storage.objects to authenticated; grant usage on all sequences in schema storage to authenticated;`);
  for(const file of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort()) await db.exec(await readFile(`supabase/migrations/${file}`,'utf8')).catch(e=>{console.error(file,e.message,e.position,e.internalQuery);throw e;});
  for(const [name,role,staff] of [['admin','admin',null],['staff','staff',null],['staff2','staff',null],['student','student',id.staff],['student2','student',id.staff2]]) {
    await db.query('insert into auth.users values($1,$2)',[id[name],JSON.stringify({academy_role:role,full_name:name,account_code:name.toUpperCase(),created_by:name==='admin'?null:id.admin,assigned_staff_id:staff})]);
  }
  await db.query("insert into public.courses(id,title) values($1,'Course A'),($2,'Course B')",[id.course,id.course2]);
  await db.query("insert into public.batches(id,course_id,title,staff_id) values($1,$2,'Batch A',$3),($4,$5,'Batch B',$6)",[id.batch,id.course,id.staff,id.batch2,id.course2,id.staff2]);
  await db.query('insert into public.enrollments(batch_id,student_id) values($1,$2),($3,$4)',[id.batch,id.student,id.batch2,id.student2]);
  await db.query("insert into public.lessons(id,batch_id,title,youtube_id,duration_seconds,published) values($1,$2,'Lesson A','abcdefghijk',1200,true),($3,$2,'Lesson B','bcdefghijkl',1200,true),($4,$5,'Other lesson','cdefghijklm',1200,true)",[id.lesson,id.batch,id.lesson2,id.otherLesson,id.batch2]);
  await db.query("insert into public.assignments(id,batch_id,title,instructions,due_at,published) values($1,$2,'Assignment A','Explain your work','2099-01-01',true)",[id.assignment,id.batch]);
  await db.query("insert into public.live_sessions(id,batch_id,title,youtube_id,starts_at,published) values($1,$2,'Live A','abcdefghijk','2099-01-01',true)",[id.live,id.batch]);
});
beforeEach(()=>db.exec('begin'));
afterEach(()=>db.exec('rollback'));
after(()=>db.close());

test('student and assigned staff can actually see the course catalog',async()=>{
  for(const user of [id.student,id.staff]) assert.deepEqual((await asUser(user,'select id from public.courses')).rows.map(x=>x.id),[id.course]);
});
// These fixtures live exclusively in new PGlite(), with rollback after each test.
test('course restoration still requires explicit enrollment before lessons become visible',async()=>{
  await rpc(id.admin,'academy_set_active',['course',id.course,false]);
  const visible=async()=> (await asUser(id.student2,'select id from public.lessons')).rows.some(r=>r.id===id.lesson);
  assert.equal(await visible(),false);
  await rpc(id.admin,'academy_set_active',['course',id.course,true]);
  assert.equal(await visible(),false);
  await rpc(id.admin,'academy_enroll',[id.batch,id.student2]);
  assert.equal(await visible(),true);
  await rpc(id.admin,'academy_manage',['lesson',id.lesson,id.batch,'Lesson A','','abcdefghijk',1200,false,null]);
  assert.equal(await visible(),false);
});
test('assigned staff archive historical lessons without removing discussion or watch evidence',async()=>{
 await rpc(id.student,'academy_post',['comment',id.lesson,null,'Test discussion']);await ping(await start(),10);
 for(const user of [id.student,id.staff2])await assert.rejects(rpc(user,'academy_delete_lesson',[id.lesson]),/Teaching/);
 await rpc(id.staff,'academy_delete_lesson',[id.lesson]);
 for(const table of ['watch_credit','watch_sessions','class_comments'])assert.equal((await db.query(`select * from public.${table} where lesson_id=$1`,[id.lesson])).rows.length,1);
 assert.equal((await db.query('select published from public.lessons where id=$1',[id.lesson])).rows[0].published,false);
 assert.equal((await asUser(id.student,'select id from public.lessons where id=$1',[id.lesson])).rows.length,0);
});
test('disabled identity cannot read ANY of its academic history',async()=>{
  await rpc(id.student,'academy_submit',[id.assignment,'Original answer']); const session=await start(); await ping(session,10);
  await db.query('update public.profiles set active=false where id=$1',[id.student]);
  for(const table of ['profiles','courses','batches','enrollments','lessons','assignments','submissions','watch_credit','watch_sessions','notifications','class_schedule']) {
    assert.equal((await asUser(id.student,`select * from public.${table}`)).rows.length,0,table);
  }
  await assert.rejects(rpc(id.student,'watch_ping',[session,20,true]),/Active student/);
});
test('archiving a course revokes learning access while preserving records',async()=>{
  await rpc(id.admin,'academy_set_active',['course',id.course,false]);
  assert.equal((await asUser(id.student,'select * from public.lessons')).rows.length,0);
  assert.equal((await asUser(id.staff,'select * from public.batches')).rows.length,0);
  assert.equal((await db.query('select * from public.lessons where batch_id=$1',[id.batch])).rows.length,2);
  await assert.rejects(start(),/Enrollment required/);
  await assert.rejects(rpc(id.admin,'academy_enroll',[id.batch,id.student]),/Active batch/);
});
test('batch instructor must be an active Staff account',async()=>{
  await assert.rejects(rpc(id.admin,'academy_manage',['batch',id.batch,id.course,'Batch A','',id.student,null,false,null]),/Active staff required/);
});
test('Staff cannot edit another instructors lesson',async()=>{
  await assert.rejects(rpc(id.staff2,'academy_manage',['lesson',id.lesson,id.batch,'Modified','','abcdefghijk',1200,true,null]),/Teaching access required/);
});
test('page open and session start alone create no attendance credit',async()=>{
  await start(); assert.equal((await db.query('select * from public.watch_credit')).rows.length,0);
});
test('valid normal-speed playback credits only the elapsed interval',async()=>{
  const total=await ping(await start(),10); assert.ok(total>=9.9&&total<=10);
});
test('idle and paused heartbeats do not earn credit',async()=>{
  const session=await start(); assert.equal(await ping(session,10,{playing:false}),0);
});
test('seeking ahead gives no credit, and an earlier unwatched section remains recoverable',async()=>{
  const session=await start(); assert.equal(await ping(session,100),0);
  assert.ok(await ping(session,110)>=9.9);
  assert.equal(await ping(session,0,{playing:false}),10);
  assert.ok(await ping(session,10)>=19.9);
});
test('replaying a credited interval cannot increase attendance or session history',async()=>{
  const first=await start(); const total=await ping(first,10);
  const replay=await start(); assert.equal(await ping(replay,10),total);
  assert.equal(Number((await db.query('select credited_seconds from public.watch_sessions where id=$1',[replay])).rows[0].credited_seconds),0);
});
test('starting a second lesson invalidates the first session across tabs/devices',async()=>{
  const first=await start(); await start(id.lesson2);
  await assert.rejects(rpc(id.student,'watch_ping',[first,10,true]),/expired/);
});
test('one pupil cannot spend another pupils session',async()=>{
  const session=await start(); await assert.rejects(rpc(id.student2,'watch_ping',[session,10,true]),/expired/);
});
test('expired sessions and rapid heartbeats cannot claim credit',async()=>{
  const session=await start(); assert.equal(await ping(session,10,{elapsed:0.1}),0);
  await db.query("update public.watch_sessions set expires_at=clock_timestamp()-interval '1 second' where id=$1",[session]);
  await assert.rejects(rpc(id.student,'watch_ping',[session,20,true]),/expired/);
});
test('malformed, nonfinite and out-of-range playheads are rejected',async()=>{
  for(const position of [-1,1201,'NaN','Infinity']) await assert.rejects(start(id.lesson,position),/Invalid position/);
  const session=await start(); await assert.rejects(rpc(id.student,'watch_ping',[session,'NaN',true]),/Invalid position/);
});
test('resuming from an actual position earns only later playback, never the skipped beginning',async()=>{
  const session=await start(id.lesson,60); const total=await ping(session,70); assert.ok(total>=9.9&&total<=10);
});
test('students cannot forge credits, watch sessions, grades, or audit entries directly',async()=>{
  for(const sql of ["insert into public.watch_credit(lesson_id,student_id) values($1,$2)","insert into public.watch_sessions(lesson_id,student_id) values($1,$2)"]) await assert.rejects(asUser(id.student,sql,[id.lesson,id.student]),/permission denied/);
  await assert.rejects(asUser(id.student,"update public.submissions set mark=100"),/permission denied/);
  await assert.rejects(asUser(id.student,"insert into public.audit_logs(action) values('forged')"),/permission denied/);
});
test('a credited recording cannot be replaced; authorized duration correction preserves valid credit',async()=>{
  await ping(await start(),10);
  await assert.rejects(rpc(id.staff,'academy_manage',['lesson',id.lesson,id.batch,'Lesson A','','XXXXXXXXXXX',1200,true,null]),/Attendance exists/);
  await rpc(id.staff,'academy_record_duration',[id.lesson,600]);
  assert.equal(Number((await db.query('select credited_seconds from public.watch_credit where lesson_id=$1',[id.lesson])).rows[0].credited_seconds),10);
  await rpc(id.staff,'academy_manage',['lesson',id.lesson,id.batch,'Renamed lesson','','abcdefghijk',1200,true,null]);
});
test('changing an unwatched recording invalidates its old playback session',async()=>{
  const session=await start(); await rpc(id.staff,'academy_manage',['lesson',id.lesson,id.batch,'Lesson A','','XXXXXXXXXXX',1200,true,null]);
  await assert.rejects(rpc(id.student,'watch_ping',[session,10,true]),/Invalid position/);
});
test('legacy durations require review rather than declaring eligibility',async()=>{
  assert.equal((await asUser(id.student,'select * from public.attendance_summary($1,$2)',[id.batch,id.student])).rows[0].eligibility,'review_required');
});

async function official(seconds=1800){return (await rpc(id.staff,'academy_session_save',[null,id.batch,'Official class',seconds,null,true,true])).rows[0].value;}
async function recording(session,seconds,video='abcdefghijk'){
 return (await rpc(id.staff,'academy_manage_session',['lesson',null,id.batch,'Class video','',video,seconds,true,null,session])).rows[0].value;
}
async function complete(lesson,seconds){const watch=await start(lesson);for(let position=10;position<=seconds;position+=10)await ping(watch,position);}
test('A/B: two minutes of a thirty-minute class is In Progress; thirty verified minutes is Present',async()=>{
 await db.exec('update public.class_sessions set published=false');
 const session=await official(),lesson=await recording(session,1800),watch=await start(lesson);
 for(let pos=10;pos<=30;pos+=10)await ping(watch,pos);
 const early=(await asUser(id.student,'select * from public.session_attendance($1,$2)',[id.batch,id.student])).rows[0];assert.equal(Number(early.verified_seconds),30);assert.equal(early.status,'In Progress');
 for(let pos=40;pos<=120;pos+=10)await ping(watch,pos);
 let activity=(await asUser(id.student,'select * from public.session_attendance($1,$2)',[id.batch,id.student])).rows[0];
 assert.equal(activity.status,'In Progress');assert.equal(Number(activity.verified_seconds),120);
 assert.equal(Number((await asUser(id.student,'select * from public.attendance_summary($1,$2)',[id.batch,id.student])).rows[0].percentage),0);
 for(let pos=130;pos<=1800;pos+=10)await ping(watch,pos);
 activity=(await asUser(id.student,'select * from public.session_attendance($1,$2)',[id.batch,id.student])).rows[0];assert.equal(activity.status,'Present');
});
test('C: ten/eight/twelve minute videos contribute to ONE thirty-minute official class',async()=>{
 await db.exec('update public.class_sessions set published=false');const session=await official();
 for(const [seconds,video] of [[600,'abcdefghijk'],[480,'bcdefghijkl'],[720,'cdefghijklm']])await complete(await recording(session,seconds,video),seconds);
 const summary=(await asUser(id.student,'select * from public.attendance_summary($1,$2)',[id.batch,id.student])).rows[0];
 assert.equal(Number(summary.required),1);assert.equal(Number(summary.credited),1);
});
test('D/E: fifteen of twenty classes is 75%; seventeen of twenty is 85%',async()=>{
 await db.exec('update public.class_sessions set published=false');const lessons=[];
 for(let i=0;i<20;i++)lessons.push(await recording(await official(60),60));
 for(let i=0;i<15;i++)await complete(lessons[i],60);
 let summary=(await asUser(id.student,'select * from public.attendance_summary($1,$2)',[id.batch,id.student])).rows[0];
 assert.equal(Number(summary.percentage),75);assert.equal(summary.eligibility,'academy_eligible_exam_not_eligible');
 await complete(lessons[15],60);await complete(lessons[16],60);
 summary=(await asUser(id.student,'select * from public.attendance_summary($1,$2)',[id.batch,id.student])).rows[0];
 assert.equal(Number(summary.percentage),85);assert.equal(summary.eligibility,'academy_and_exam_eligible');
});
test('same-video duplicate lessons cannot multiply session credit; students cannot edit durations/sessions',async()=>{
 await db.exec('update public.class_sessions set published=false');const session=await official(120);
 await complete(await recording(session,60),60);await complete(await recording(session,60),60);
 const activity=(await asUser(id.student,'select * from public.session_attendance($1,$2)',[id.batch,id.student])).rows[0];
 assert.equal(Number(activity.verified_seconds),60);assert.equal(activity.status,'In Progress');
 await assert.rejects(rpc(id.student,'academy_record_duration',[id.lesson,1800]),/Teaching/);
 await assert.rejects(rpc(id.staff2,'academy_session_save',[session,id.batch,'Forbidden',60,null,true,true]),/Teaching/);
 for(const table of ['class_sessions','live_credit','live_watch_sessions'])await assert.rejects(asUser(id.student,`delete from public.${table}`),/permission denied/);
});
test('removing historical media preserves its lesson and class attendance',async()=>{
 await db.exec('update public.class_sessions set published=false');const session=await official(60),lesson=await recording(session,60);await complete(lesson,60);
 await rpc(id.admin,'academy_delete_lesson',[lesson]);
 assert.equal((await db.query('select published from public.lessons where id=$1',[lesson])).rows[0].published,false);
 assert.equal((await asUser(id.student,'select * from public.session_attendance($1,$2)',[id.batch,id.student])).rows[0].status,'Present');
});
test('live participation is scoped, time bounded and cannot be credited while paused',async()=>{
 const session=await official(1800);
 await rpc(id.staff,'academy_link_session',['live',id.live,session]);
 await assert.rejects(rpc(id.student,'live_watch_start',[id.live,0]),/Outside scheduled/);
 await db.query("update public.live_sessions set starts_at=clock_timestamp()-interval '30 seconds' where id=$1",[id.live]);
 await assert.rejects(rpc(id.student2,'live_watch_start',[id.live,0]),/enrollment/);
 const watch=(await rpc(id.student,'live_watch_start',[id.live,0])).rows[0].value;
 await db.query("update public.live_watch_sessions set last_ping=clock_timestamp()-interval '10 seconds' where id=$1",[watch]);
 assert.equal(Number((await rpc(id.student,'live_watch_ping',[watch,10,false])).rows[0].value),0);
 await db.query("update public.live_watch_sessions set last_ping=clock_timestamp()-interval '10 seconds' where id=$1",[watch]);
 assert.ok(Number((await rpc(id.student,'live_watch_ping',[watch,20,true])).rows[0].value)>=9.9);
 await assert.rejects(rpc(id.student2,'live_watch_ping',[watch,30,true]),/expired/);
 await start();await assert.rejects(rpc(id.student,'live_watch_ping',[watch,30,true]),/Another class/);
});
test('trusted account provisioning atomically enrolls only an authorized batch',async()=>{
 const user='50000000-0000-0000-0000-000000000001';
 await db.query('insert into auth.users values($1,$2)',[user,JSON.stringify({academy_role:'student',full_name:'Provisioned Student',account_code:'ENROLLED001',created_by:id.admin,batch_id:id.batch})]);
 assert.equal((await db.query('select batch_id from public.enrollments where student_id=$1',[user])).rows[0].batch_id,id.batch);
 assert.equal((await db.query('select assigned_staff_id from public.profiles where id=$1',[user])).rows[0].assigned_staff_id,id.staff);
});
test('roster removal revokes historical academic reads and reports',async()=>{
  await rpc(id.student,'academy_submit',[id.assignment,'Answer']);await ping(await start(),10);
  await rpc(id.admin,'academy_unenroll',[id.batch,id.student]);
  for(const table of ['submissions','watch_credit','watch_sessions']) assert.equal((await asUser(id.student,`select * from public.${table}`)).rows.length,0);
  await assert.rejects(asUser(id.staff,'select * from public.attendance_summary($1,$2)',[id.batch,id.student]),/Current enrollment/);
});
test('graded answers cannot be overwritten until a teacher returns them',async()=>{
  const submission=(await rpc(id.student,'academy_submit',[id.assignment,'Original answer'])).rows[0].value;
  await rpc(id.staff,'academy_grade',[submission,87,'Good']);
  await assert.rejects(rpc(id.student,'academy_submit',[id.assignment,'Replacement']),/Graded work/);
  await rpc(id.staff,'academy_return_submission',[submission]);
  await rpc(id.student,'academy_submit',[id.assignment,'Revised answer']);
  assert.equal((await db.query('select body from public.submissions where id=$1',[submission])).rows[0].body,'Revised answer');
});
test('assignment deadlines are enforced even for direct RPC callers',async()=>{
  await db.query("update public.assignments set due_at=clock_timestamp()-interval '1 day' where id=$1",[id.assignment]);
  await assert.rejects(rpc(id.student,'academy_submit',[id.assignment,'Late answer']),/deadline/);
});
test('replays must be published recordings from the same batch',async()=>{
  await assert.rejects(rpc(id.staff,'academy_attach_recording',[id.live,id.otherLesson]),/same batch/);
  await rpc(id.staff,'academy_attach_recording',[id.live,id.lesson]);
  assert.equal((await db.query('select recorded_lesson_id from public.live_sessions where id=$1',[id.live])).rows[0].recorded_lesson_id,id.lesson);
});
test('timetable rejects invalid intervals and unsafe meeting URLs',async()=>{
  await assert.rejects(rpc(id.staff,'academy_schedule',[null,id.batch,'Invalid','https://example.org','2099-01-02','2099-01-01',true]),/Invalid class time/);
  await assert.rejects(rpc(id.staff,'academy_schedule',[null,id.batch,'Unsafe','javascript:alert(1)','2099-01-01','2099-01-02',true]),/valid_class_url/);
});
test('private doubts are visible only to the current active student and assigned Staff',async()=>{
  await rpc(id.student,'academy_post',['doubt',null,id.student,'Private question']);
  assert.equal((await asUser(id.staff,'select * from public.doubt_messages')).rows.length,1);
  for(const user of [id.staff2,id.admin,id.student2]) assert.equal((await asUser(user,'select * from public.doubt_messages')).rows.length,0);
  await db.query('update public.profiles set assigned_staff_id=$1 where id=$2',[id.staff2,id.student]);
  for(const user of [id.staff,id.student]) assert.equal((await asUser(user,'select * from public.doubt_messages')).rows.length,0);
});
test('deactivating the assigned Staff also closes the private conversation',async()=>{
  await rpc(id.student,'academy_post',['doubt',null,id.student,'Private question']);
  await db.query('update public.profiles set active=false where id=$1',[id.staff]);
  assert.equal((await asUser(id.student,'select * from public.doubt_messages')).rows.length,0);
  await assert.rejects(rpc(id.student,'academy_post',['doubt',null,id.student,'More']),/Assigned conversation/);
});
test('former account creator loses personal-profile access after reassignment',async()=>{
  await db.query('update public.profiles set created_by=$1,assigned_staff_id=$2 where id=$3',[id.staff,id.staff2,id.student]);
  assert.equal((await asUser(id.staff,'select * from public.profiles where id=$1',[id.student])).rows.length,0);
});
test('participant directory exposes names without phone, address, or peer account codes',async()=>{
  const people=(await asUser(id.student,'select * from public.academy_directory()')).rows;
  assert.ok(people.some(p=>p.id===id.staff));
  for(const person of people) {assert.ok(!('phone' in person));assert.ok(!('address' in person));assert.equal(person.account_code,'');}
});

test('G: manual corrections require scope and reason, preserve evidence and audit identity',async()=>{
 const session=await official(),lesson=await recording(session,1800);await ping(await start(lesson),30,{elapsed:30});
 for(const user of [id.student,id.staff2])await assert.rejects(rpc(user,'attendance_mark',[session,id.student,'Present','Teacher verified attendance']),/Teaching/);
 await assert.rejects(rpc(id.staff,'attendance_mark',[session,id.student,'Present','']),/reason/);
 await rpc(id.staff,'attendance_mark',[session,id.student,'Present','Network issue verified by teacher']);
 const row=(await asUser(id.student,'select * from public.attendance_evidence($1,$2)',[id.batch,id.student])).rows.find(r=>r.session_id===session);
 assert.equal(row.status,'Present');assert.equal(row.source,'Manual');assert.equal(Number(row.verified_seconds),30);
 const audit=(await asUser(id.staff,'select * from public.attendance_history($1,$2)',[session,id.student])).rows.find(r=>r.action==='attendance.manual');
 assert.equal(audit.actor_id,id.staff);assert.ok(audit.created_at);assert.equal(audit.details.reason,'Network issue verified by teacher');
 await assert.rejects(asUser(id.student,'update public.attendance_corrections set status=\'Present\''),/permission denied/);
});
test('finalization freezes automatic evidence, blocks staff and allows audited admin exceptions',async()=>{
 const session=await official(),lesson=await recording(session,1800),watch=await start(lesson);await ping(watch,30,{elapsed:30});
 await assert.rejects(rpc(id.staff,'attendance_lock',[session,true,'Exam finalization']),/Admin/);
 await rpc(id.admin,'attendance_lock',[session,true,'Exam finalization']);
 await ping(watch,60,{elapsed:30});
 let row=(await asUser(id.student,'select * from public.attendance_evidence($1,$2)',[id.batch,id.student])).rows.find(r=>r.session_id===session);
 assert.equal(Number(row.verified_seconds),30);assert.equal(row.locked,true);
 await assert.rejects(rpc(id.staff,'attendance_mark',[session,id.student,'Present','Teacher correction']),/finalized/);
 await assert.rejects(rpc(id.staff,'academy_session_save',[session,id.batch,'Alter duration',60,null,true,true]),/Unlock/);
 await rpc(id.admin,'attendance_mark',[session,id.student,'Present','Exceptional verified correction']);
 row=(await asUser(id.student,'select * from public.attendance_evidence($1,$2)',[id.batch,id.student])).rows.find(r=>r.session_id===session);
 assert.equal(row.status,'Present');assert.equal(row.source,'Manual');
 await rpc(id.admin,'attendance_lock',[session,false,'Reopen for review']);
 row=(await asUser(id.student,'select * from public.attendance_evidence($1,$2)',[id.batch,id.student])).rows.find(r=>r.session_id===session);
 assert.equal(Number(row.verified_seconds),60);assert.equal(row.locked,false);
});
test('attendance disputes are student-owned and reviewed only within staff batch scope',async()=>{
 const session=await official();
 await rpc(id.student,'attendance_request',[session,'Please review my missing attendance']);
 await assert.rejects(rpc(id.student2,'attendance_request',[session,'Wrong batch request']),/Enrollment/);
 const request=(await asUser(id.staff,'select * from public.attendance_requests')).rows[0];
 assert.equal((await asUser(id.student2,'select * from public.attendance_requests')).rows.length,0);
 await assert.rejects(rpc(id.staff2,'attendance_resolve',[request.id,'Reviewed wrong batch']),/Teaching/);
 await rpc(id.staff,'attendance_resolve',[request.id,'Verified participation and corrected separately']);
 assert.equal((await asUser(id.student,'select * from public.attendance_requests')).rows[0].resolved_by,id.staff);
});
test('catalog deletion is restricted to empty records and historical relinking is rejected',async()=>{
 await assert.rejects(rpc(id.admin,'academy_delete_empty',['course',id.course]),/Archive/);
 await assert.rejects(rpc(id.admin,'academy_delete_empty',['batch',id.batch]),/Archive/);
 await assert.rejects(rpc(id.staff,'academy_delete_empty',['batch',id.batch]),/Admin/);
 await ping(await start(),10);await assert.rejects(rpc(id.staff,'academy_link_session',['lesson',id.lesson,await official()]),/history exists/);
});

test('requested publication: batch enrollment alone grants a new published video, and refresh rechecks visibility',async()=>{
 const session=await official();const count=Number((await db.query('select count(*) from public.class_sessions')).rows[0].count);
 const lesson=(await rpc(id.staff,'academy_manage_session',['lesson',null,id.batch,'Published batch video','','abcdefghijk',1800,false,null,session])).rows[0].value;
 assert.equal(Number((await db.query('select count(*) from public.class_sessions')).rows[0].count),count,'no temporary class session');
 const visible=async user=>(await asUser(user,'select id from public.lessons where id=$1',[lesson])).rows.length;
 assert.equal(await visible(id.student),0);
 await rpc(id.staff,'academy_manage_session',['lesson',lesson,id.batch,'Published batch video','','abcdefghijk',1800,true,null,session]);
 assert.equal(await visible(id.student),1);assert.equal(await visible(id.student2),0);
 assert.equal((await asUser(id.student,'select class_session_id from public.notifications where content_id=$1',[lesson])).rows[0].class_session_id,session);
 await rpc(id.admin,'academy_set_active',['batch',id.batch,false]);assert.equal(await visible(id.student),0);
 await rpc(id.admin,'academy_set_active',['batch',id.batch,true]);assert.equal(await visible(id.student),1);
 await rpc(id.admin,'academy_set_active',['course',id.course,false]);assert.equal(await visible(id.student),0);
 await rpc(id.admin,'academy_set_active',['course',id.course,true]);
 await rpc(id.staff,'academy_manage_session',['lesson',lesson,id.batch,'Published batch video','','abcdefghijk',1800,false,null,session]);assert.equal(await visible(id.student),0);
});

async function deletionFixture(){
 const session=await official(),lesson=await recording(session,1800);
 const live=(await rpc(id.staff,'academy_manage_session',['live',null,id.batch,'Owned live','','bcdefghijkl',null,true,'2099-01-01',session])).rows[0].value;
 const schedule=(await rpc(id.staff,'academy_schedule_session',[null,id.batch,'Owned timetable',null,'2099-01-01','2099-01-02',true,session])).rows[0].value;
 await ping(await start(lesson),10);
 await rpc(id.student,'academy_post',['comment',lesson,null,'Session-only discussion']);
 await rpc(id.student,'attendance_request',[session,'Please check my attendance']);
 await rpc(id.staff,'attendance_mark',[session,id.student,'Present','Verified session participation']);
 await rpc(id.admin,'attendance_lock',[session,true,'Exam report finalization']);
 await db.query('insert into public.live_credit(class_session_id,student_id) values($1,$2)',[session,id.student]);
 await db.query('insert into public.live_watch_sessions(live_id,student_id,last_position) values($1,$2,0)',[live,id.student]);
 await rpc(id.staff,'academy_attach_recording',[id.live,lesson]);
 await rpc(id.student,'academy_post',['doubt',null,id.student,'Unrelated private conversation']);
 return {session,lesson,live,schedule};
}
const sessionTables=['class_sessions','lessons','live_sessions','class_schedule','watch_sessions','watch_credit','retained_session_credit','class_comments','live_watch_sessions','live_credit','attendance_requests','attendance_corrections','attendance_frozen','notifications'];
async function counts(){const result={};for(const t of [...sessionTables,'courses','batches','profiles','enrollments','assignments','notes','doubt_messages'])result[t]=Number((await db.query(`select count(*) from public.${t}`)).rows[0].count);return result;}
test('requested full-session delete removes only owned data, including finalized attendance, and denies staff/student',async()=>{
 const {session,lesson,live,schedule}=await deletionFixture();const before=await counts();
 for(const user of [id.staff,id.student,id.staff2])await assert.rejects(rpc(user,'academy_delete_class_session',[session]),/Admin required/);
 await rpc(id.admin,'academy_delete_class_session',[session]);
 for(const [t,column,value] of [['class_sessions','id',session],['lessons','id',lesson],['live_sessions','id',live],['class_schedule','id',schedule],['watch_sessions','lesson_id',lesson],['watch_credit','lesson_id',lesson],['class_comments','lesson_id',lesson],['live_watch_sessions','live_id',live],['live_credit','class_session_id',session],['retained_session_credit','class_session_id',session],['attendance_requests','session_id',session],['attendance_corrections','session_id',session],['attendance_frozen','session_id',session],['notifications','class_session_id',session]])assert.equal((await db.query(`select * from public.${t} where ${column}=$1`,[value])).rows.length,0,t);
 const after=await counts();for(const t of ['courses','batches','profiles','enrollments','assignments','notes','doubt_messages'])assert.equal(after[t],before[t],t);
 assert.equal(after.class_sessions,before.class_sessions-1);assert.equal(after.lessons,before.lessons-1);assert.equal(after.live_sessions,before.live_sessions-1);
 assert.equal((await db.query('select recorded_lesson_id from public.live_sessions where id=$1',[id.live])).rows[0].recorded_lesson_id,null);
 assert.ok((await asUser(id.student,'select * from public.attendance_evidence($1,$2)',[id.batch,id.student])).rows.every(r=>r.session_id!==session));
 assert.equal((await db.query("select * from public.audit_logs where action='academic.session.delete' and details->>'session'=$1",[session])).rows.length,1);
});
test('full-session deletion rolls every dependent change back on a late failure',async()=>{
 const {session,lesson}=await deletionFixture();const before=await counts();
 await db.exec(`create function public.test_delete_failure() returns trigger language plpgsql as $$ begin raise exception 'Injected deletion failure'; end $$; create trigger test_delete_failure before delete on public.class_sessions for each row execute function public.test_delete_failure();`);
 await assert.rejects(rpc(id.admin,'academy_delete_class_session',[session]),/Injected deletion failure/);
 assert.deepEqual(await counts(),before);
 assert.equal((await db.query('select recorded_lesson_id from public.live_sessions where id=$1',[id.live])).rows[0].recorded_lesson_id,lesson);
 assert.equal((await asUser(id.student,'select * from public.attendance_evidence($1,$2)',[id.batch,id.student])).rows.find(r=>r.session_id===session).status,'Present');
});
