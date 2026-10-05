-- Academic records are scoped through enrollment and the current staff assignment.
create table public.courses (
 id uuid primary key default gen_random_uuid(), title text not null check (length(title) between 2 and 160),
 description text not null default '', active boolean not null default true, created_at timestamptz not null default now()
);
create table public.batches (
 id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id),
 title text not null check (length(title) between 2 and 160), staff_id uuid references public.profiles(id),
 active boolean not null default true, created_at timestamptz not null default now()
);
create table public.enrollments (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.batches(id),
 student_id uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 unique(batch_id,student_id)
);
create table public.lessons (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.batches(id),
 title text not null check (length(title) between 2 and 180), youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
 duration_seconds integer not null check (duration_seconds between 60 and 21600),
 published boolean not null default false, created_at timestamptz not null default now()
);
create table public.live_sessions (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.batches(id),
 title text not null check (length(title) between 2 and 180), youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
 starts_at timestamptz not null, published boolean not null default false, created_at timestamptz not null default now()
);
create table public.class_comments (
 id uuid primary key default gen_random_uuid(), lesson_id uuid not null references public.lessons(id) on delete cascade,
 author_id uuid not null references public.profiles(id), body text not null check (length(body) between 1 and 2000),
 created_at timestamptz not null default now()
);
create table public.doubt_messages (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id),
 staff_id uuid not null references public.profiles(id), sender_id uuid not null references public.profiles(id),
 body text not null check (length(body) between 1 and 4000), created_at timestamptz not null default now()
);
create table public.assignments (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.batches(id),
 title text not null check (length(title) between 2 and 180), instructions text not null default '',
 due_at timestamptz, published boolean not null default false, created_at timestamptz not null default now()
);
create table public.submissions (
 id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.assignments(id),
 student_id uuid not null references public.profiles(id), body text not null check (length(body) between 1 and 10000),
 mark numeric(5,2) check (mark between 0 and 100), feedback text not null default '',
 submitted_at timestamptz not null default now(), graded_at timestamptz,
 unique(assignment_id,student_id)
);
create table public.notes (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.batches(id),
 title text not null check (length(title) between 2 and 180), body text not null check (length(body) between 1 and 20000),
 published boolean not null default false, created_at timestamptz not null default now()
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id),
 title text not null, body text not null, created_at timestamptz not null default now(), read_at timestamptz
);
create table public.watch_sessions (
 id uuid primary key default gen_random_uuid(), lesson_id uuid not null references public.lessons(id),
 student_id uuid not null references public.profiles(id), last_position numeric(10,2) not null default 0,
 last_ping timestamptz not null default now(), credited_seconds numeric(10,2) not null default 0,
 started_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '2 hours'
);
create table public.watch_credit (
 lesson_id uuid not null references public.lessons(id), student_id uuid not null references public.profiles(id),
 credited_seconds numeric(10,2) not null default 0, high_water numeric(10,2) not null default 0, primary key(lesson_id,student_id)
);

create function public.academy_can_teach(batch uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select public.current_academy_role() = 'admin' or exists (
 select 1 from public.batches b where b.id = batch and b.staff_id = auth.uid() and b.active and public.current_academy_role() = 'staff');
$$;
create function public.academy_is_enrolled(batch uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.enrollments e join public.batches b on b.id=e.batch_id
 where e.batch_id=batch and e.student_id=auth.uid() and b.active and public.current_academy_role()='student');
$$;
revoke all on function public.academy_can_teach(uuid), public.academy_is_enrolled(uuid) from public;
grant execute on function public.academy_can_teach(uuid), public.academy_is_enrolled(uuid) to authenticated;

alter table public.courses enable row level security;
alter table public.batches enable row level security;
alter table public.enrollments enable row level security;
alter table public.lessons enable row level security;
alter table public.live_sessions enable row level security;
alter table public.class_comments enable row level security;
alter table public.doubt_messages enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.notes enable row level security;
alter table public.notifications enable row level security;
alter table public.watch_sessions enable row level security;
alter table public.watch_credit enable row level security;
revoke all on public.courses,public.batches,public.enrollments,public.lessons,public.live_sessions,public.class_comments,public.doubt_messages,public.assignments,public.submissions,public.notes,public.notifications,public.watch_sessions,public.watch_credit from anon,authenticated;
grant select on public.courses,public.batches,public.enrollments,public.lessons,public.live_sessions,public.class_comments,public.doubt_messages,public.assignments,public.submissions,public.notes,public.notifications,public.watch_credit to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy course_read on public.courses for select to authenticated using (public.current_academy_role() is not null and (public.current_academy_role()='admin' or exists(select 1 from public.batches b where b.course_id=id and (public.academy_can_teach(b.id) or public.academy_is_enrolled(b.id)))));
create policy batch_read on public.batches for select to authenticated using (public.academy_can_teach(id) or public.academy_is_enrolled(id));
create policy enrollment_read on public.enrollments for select to authenticated using (public.academy_can_teach(batch_id) or student_id=auth.uid() and public.academy_is_enrolled(batch_id));
create policy lesson_read on public.lessons for select to authenticated using (public.academy_can_teach(batch_id) or published and public.academy_is_enrolled(batch_id));
create policy live_read on public.live_sessions for select to authenticated using (public.academy_can_teach(batch_id) or published and public.academy_is_enrolled(batch_id));
create policy comment_read on public.class_comments for select to authenticated using (exists(select 1 from public.lessons l where l.id=lesson_id and (public.academy_can_teach(l.batch_id) or l.published and public.academy_is_enrolled(l.batch_id))));
create policy doubt_read on public.doubt_messages for select to authenticated using ((student_id=auth.uid() or staff_id=auth.uid()) and exists(select 1 from public.profiles p where p.id=student_id and p.assigned_staff_id=staff_id and p.active) and public.current_academy_role() is not null);
create policy assignment_read on public.assignments for select to authenticated using (public.academy_can_teach(batch_id) or published and public.academy_is_enrolled(batch_id));
create policy submission_read on public.submissions for select to authenticated using (student_id=auth.uid() or exists(select 1 from public.assignments a where a.id=assignment_id and public.academy_can_teach(a.batch_id)));
create policy note_read on public.notes for select to authenticated using (public.academy_can_teach(batch_id) or published and public.academy_is_enrolled(batch_id));
create policy notification_read on public.notifications for select to authenticated using (recipient_id=auth.uid() and public.current_academy_role() is not null);
create policy notification_update on public.notifications for update to authenticated using (recipient_id=auth.uid() and public.current_academy_role() is not null) with check (recipient_id=auth.uid());
create policy credit_read on public.watch_credit for select to authenticated using (student_id=auth.uid() or exists(select 1 from public.lessons l where l.id=lesson_id and public.academy_can_teach(l.batch_id)));

-- All writes are server functions. No client may directly write credit, grading, or roster rows.
create function public.academy_manage(kind text, target uuid, batch uuid, title text, body text, video_id text, seconds integer, publish boolean, starts timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; existing_batch uuid;
begin
 if kind='course' then
  if public.current_academy_role() is distinct from 'admin'::public.academy_role then raise exception 'Admin required'; end if;
  if target is null then insert into public.courses(title,description) values(title,coalesce(body,'')) returning id into result;
  else update public.courses set title=academy_manage.title,description=coalesce(body,'') where id=target returning id into result; end if;
 elsif kind='batch' then
  if public.current_academy_role() is distinct from 'admin'::public.academy_role then raise exception 'Admin required'; end if;
  if target is null then insert into public.batches(course_id,title,staff_id) values(batch,title,video_id::uuid) returning id into result;
  else update public.batches set course_id=batch,title=academy_manage.title,staff_id=video_id::uuid where id=target returning id into result; end if;
 elsif kind in ('lesson','live','assignment','note') then
  if target is not null then
   if kind='lesson' then select batch_id into existing_batch from public.lessons where id=target;
   elsif kind='live' then select batch_id into existing_batch from public.live_sessions where id=target;
   elsif kind='assignment' then select batch_id into existing_batch from public.assignments where id=target;
   else select batch_id into existing_batch from public.notes where id=target; end if;
   if existing_batch is distinct from batch then raise exception 'Batch cannot change'; end if;
  end if;
  if not coalesce(public.academy_can_teach(batch),false) then raise exception 'Teaching access required'; end if;
  if kind='lesson' then
   if target is null then insert into public.lessons(batch_id,title,youtube_id,duration_seconds,published) values(batch,title,video_id,seconds,coalesce(publish,false)) returning id into result;
   else update public.lessons set title=academy_manage.title,youtube_id=video_id,duration_seconds=seconds,published=coalesce(publish,false) where id=target returning id into result; end if;
  elsif kind='live' then
   if target is null then insert into public.live_sessions(batch_id,title,youtube_id,starts_at,published) values(batch,title,video_id,starts,coalesce(publish,false)) returning id into result;
   else update public.live_sessions set title=academy_manage.title,youtube_id=video_id,starts_at=starts,published=coalesce(publish,false) where id=target returning id into result; end if;
  elsif kind='assignment' then
   if target is null then insert into public.assignments(batch_id,title,instructions,due_at,published) values(batch,title,coalesce(body,''),starts,coalesce(publish,false)) returning id into result;
   else update public.assignments set title=academy_manage.title,instructions=coalesce(body,''),due_at=starts,published=coalesce(publish,false) where id=target returning id into result; end if;
  else
   if target is null then insert into public.notes(batch_id,title,body,published) values(batch,title,body,coalesce(publish,false)) returning id into result;
   else update public.notes set title=academy_manage.title,body=academy_manage.body,published=coalesce(publish,false) where id=target returning id into result; end if;
  end if;
 else raise exception 'Unknown record kind'; end if;
 if result is null then raise exception 'Record not found'; end if;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.'||kind,jsonb_build_object('id',result,'published',publish));
 return result;
end $$;
revoke all on function public.academy_manage(text,uuid,uuid,text,text,text,integer,boolean,timestamptz) from public;
grant execute on function public.academy_manage(text,uuid,uuid,text,text,text,integer,boolean,timestamptz) to authenticated;

create function public.academy_enroll(batch uuid, student uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 if public.current_academy_role() is distinct from 'admin'::public.academy_role and not coalesce(public.academy_can_teach(batch),false) then raise exception 'Teaching access required'; end if;
 if not exists(select 1 from public.profiles where id=student and role='student' and active and (public.current_academy_role()='admin' or assigned_staff_id=auth.uid())) then raise exception 'Active student required'; end if;
 insert into public.enrollments(batch_id,student_id) values(batch,student) on conflict do nothing;
 insert into public.audit_logs(actor_id,subject_id,action,details) values(auth.uid(),student,'academic.enroll',jsonb_build_object('batch',batch));
end $$;
revoke all on function public.academy_enroll(uuid,uuid) from public;
grant execute on function public.academy_enroll(uuid,uuid) to authenticated;

create function public.academy_post(kind text, target uuid, student uuid, body text) returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid; b uuid; assigned uuid;
begin
 if kind='comment' then
  select batch_id into b from public.lessons where id=target and published;
  if b is null or not coalesce((public.academy_can_teach(b) or public.academy_is_enrolled(b)),false) then raise exception 'Lesson access required'; end if;
  insert into public.class_comments(lesson_id,author_id,body) values(target,auth.uid(),trim(body)) returning id into result;
 elsif kind='doubt' then
  select p.assigned_staff_id into assigned from public.profiles p join public.profiles st on st.id=p.assigned_staff_id and st.role='staff' and st.active where p.id=student and p.role='student' and p.active;
  if assigned is null or auth.uid() not in (student,assigned) or public.current_academy_role() is null then raise exception 'Assigned conversation required'; end if;
  insert into public.doubt_messages(student_id,staff_id,sender_id,body) values(student,assigned,auth.uid(),trim(body)) returning id into result;
 else raise exception 'Unknown message kind'; end if;
 return result;
end $$;
revoke all on function public.academy_post(text,uuid,uuid,text) from public;
grant execute on function public.academy_post(text,uuid,uuid,text) to authenticated;

create function public.academy_submit(assignment uuid, body text) returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid; b uuid;
begin
 select batch_id into b from public.assignments where id=assignment and published;
 if b is null or not coalesce(public.academy_is_enrolled(b),false) then raise exception 'Enrollment required'; end if;
 insert into public.submissions(assignment_id,student_id,body) values(assignment,auth.uid(),trim(body))
 on conflict(assignment_id,student_id) do update set body=excluded.body,submitted_at=now(),mark=null,feedback='',graded_at=null
 returning id into result;
 return result;
end $$;
create function public.academy_grade(submission uuid, score numeric, grade_feedback text) returns void language plpgsql security definer set search_path = '' as $$
declare b uuid; pupil uuid;
begin
 select a.batch_id,s.student_id into b,pupil from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=submission;
 if b is null or not coalesce(public.academy_can_teach(b),false) then raise exception 'Teaching access required'; end if;
 if score is null or score<0 or score>100 then raise exception 'Invalid mark'; end if;
 update public.submissions set mark=score,feedback=coalesce(grade_feedback,''),graded_at=now() where id=submission;
 insert into public.audit_logs(actor_id,subject_id,action,details) values(auth.uid(),pupil,'academic.grade',jsonb_build_object('submission',submission,'mark',score));
end $$;
revoke all on function public.academy_submit(uuid,text),public.academy_grade(uuid,numeric,text) from public;
grant execute on function public.academy_submit(uuid,text),public.academy_grade(uuid,numeric,text) to authenticated;

-- A heartbeat can credit at most real elapsed server time and plausible forward playback.
-- It limits automation but cannot prove that a human watched a YouTube player.
create function public.watch_start(lesson uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid; b uuid;
begin
 select batch_id into b from public.lessons where id=lesson and published;
 if b is null or not coalesce(public.academy_is_enrolled(b),false) then raise exception 'Enrollment required'; end if;
 insert into public.watch_sessions(lesson_id,student_id) values(lesson,auth.uid()) returning id into result;
 return result;
end $$;
create function public.watch_ping(watch uuid, playhead numeric, playing boolean) returns numeric language plpgsql security definer set search_path = '' as $$
declare s public.watch_sessions; duration integer; elapsed numeric; delta numeric; credit numeric;
begin
 select * into s from public.watch_sessions where id=watch and student_id=auth.uid() for update;
 if s.id is null or now()>s.expires_at then raise exception 'Watch session expired'; end if;
 select l.duration_seconds into duration from public.lessons l where l.id=s.lesson_id and l.published and public.academy_is_enrolled(l.batch_id);
 if duration is null or playhead is null or playhead<0 or playhead>duration+2 then raise exception 'Invalid position'; end if;
 elapsed := extract(epoch from now()-s.last_ping);
 delta := playhead-s.last_position;
 credit := case when playing and elapsed>=8 and elapsed<=45 and delta>=elapsed*0.65 and delta<=elapsed*1.35 then least(delta,elapsed,30) else 0 end;
 update public.watch_sessions set last_position=playhead,last_ping=now(),credited_seconds=credited_seconds+credit where id=watch;
 if credit>0 then
  insert into public.watch_credit(lesson_id,student_id,credited_seconds,high_water) values(s.lesson_id,auth.uid(),credit,playhead)
  on conflict(lesson_id,student_id) do update set
   credited_seconds=least(duration,public.watch_credit.credited_seconds+least(excluded.credited_seconds,greatest(0,excluded.high_water-public.watch_credit.high_water))),
   high_water=greatest(public.watch_credit.high_water,excluded.high_water);
 end if;
 select credited_seconds into credit from public.watch_credit where lesson_id=s.lesson_id and student_id=auth.uid();
 return coalesce(credit,0);
end $$;
create function public.attendance_summary(batch uuid, student uuid) returns table(credited numeric, required numeric, percentage numeric, eligibility text)
language plpgsql stable security definer set search_path = '' as $$
declare total numeric; watched numeric; pct numeric;
begin
 if not coalesce((public.academy_can_teach(batch) or student=auth.uid() and public.academy_is_enrolled(batch)),false) then raise exception 'Enrollment access required'; end if;
 select coalesce(sum(duration_seconds),0) into total from public.lessons where batch_id=batch and published;
 select coalesce(sum(least(l.duration_seconds,c.credited_seconds)),0) into watched from public.lessons l join public.watch_credit c on c.lesson_id=l.id and c.student_id=student where l.batch_id=batch and l.published;
 pct := case when total=0 then 0 else watched*100/total end;
 return query select watched,total,pct,case when total=0 then 'no_lessons' else public.attendance_eligibility(pct) end;
end $$;
revoke all on function public.watch_start(uuid),public.watch_ping(uuid,numeric,boolean),public.attendance_summary(uuid,uuid) from public;
grant execute on function public.watch_start(uuid),public.watch_ping(uuid,numeric,boolean),public.attendance_summary(uuid,uuid) to authenticated;

create function public.academy_notify(batch uuid, title text, body text) returns integer language plpgsql security definer set search_path = '' as $$
declare sent integer;
begin
 if not coalesce(public.academy_can_teach(batch),false) then raise exception 'Teaching access required'; end if;
 if length(trim(title)) not between 2 and 160 or length(trim(body)) not between 1 and 2000 then raise exception 'Invalid notification'; end if;
 insert into public.notifications(recipient_id,title,body)
 select e.student_id,trim(title),trim(body) from public.enrollments e where e.batch_id=batch;
 get diagnostics sent = row_count;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.notify',jsonb_build_object('batch',batch,'recipients',sent));
 return sent;
end $$;
revoke all on function public.academy_notify(uuid,text,text) from public;
grant execute on function public.academy_notify(uuid,text,text) to authenticated;
