-- Additive Batch 2 corrections. Existing account and academic records are retained.
-- An archived course closes its batches to learners and staff without deleting history.
create or replace function public.academy_can_teach(batch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select public.current_academy_role() = 'admin' or exists (
  select 1 from public.batches b join public.courses c on c.id=b.course_id
  where b.id=batch and b.staff_id=auth.uid() and b.active and c.active
    and public.current_academy_role()='staff');
$$;
create or replace function public.academy_is_enrolled(batch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.enrollments e
  join public.batches b on b.id=e.batch_id join public.courses c on c.id=b.course_id
  where e.batch_id=batch and e.student_id=auth.uid() and b.active and c.active
    and public.current_academy_role()='student');
$$;

-- Being a former account creator does not confer permanent access to personal data.
drop policy profile_read on public.profiles;
create policy profile_read on public.profiles for select to authenticated using (
 public.current_academy_role() is not null and (id=auth.uid()
  or public.current_academy_role()='admin'
  or public.current_academy_role()='staff' and role='student' and assigned_staff_id=auth.uid()));

drop policy submission_read on public.submissions;
create policy submission_read on public.submissions for select to authenticated using (
 public.current_academy_role() is not null and exists(select 1 from public.assignments a
  where a.id=assignment_id and (public.academy_can_teach(a.batch_id)
   or student_id=auth.uid() and public.academy_is_enrolled(a.batch_id))));
drop policy credit_read on public.watch_credit;
create policy credit_read on public.watch_credit for select to authenticated using (
 public.current_academy_role() is not null and exists(select 1 from public.lessons l
  where l.id=lesson_id and (public.academy_can_teach(l.batch_id)
   or student_id=auth.uid() and public.academy_is_enrolled(l.batch_id))));
drop policy watch_session_history on public.watch_sessions;
create policy watch_session_history on public.watch_sessions for select to authenticated using (
 public.current_academy_role() is not null and exists(select 1 from public.lessons l
  where l.id=lesson_id and (public.academy_can_teach(l.batch_id)
   or student_id=auth.uid() and public.academy_is_enrolled(l.batch_id))));
-- Resolve both current participants without exposing staff profile data to students.
create or replace function public.academy_doubt_allowed(student uuid, staff uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select public.current_academy_role() is not null and auth.uid() in (student,staff)
  and exists(select 1 from public.profiles p join public.profiles st on st.id=p.assigned_staff_id
   where p.id=student and p.assigned_staff_id=staff and p.active and p.role='student'
    and st.active and st.role='staff');
$$;
revoke all on function public.academy_doubt_allowed(uuid,uuid) from public;
grant execute on function public.academy_doubt_allowed(uuid,uuid) to authenticated;
drop policy doubt_read on public.doubt_messages;
create policy doubt_read on public.doubt_messages for select to authenticated
 using (public.academy_doubt_allowed(student_id,staff_id));

create function public.academy_validate_batch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.staff_id is not null and not exists(select 1 from public.profiles
  where id=new.staff_id and role='staff' and active) then raise exception 'Active staff required'; end if;
 return new;
end $$;
revoke all on function public.academy_validate_batch() from public;
create trigger academy_batch_staff before insert or update of staff_id on public.batches
 for each row execute function public.academy_validate_batch();

create or replace function public.academy_enroll(batch uuid, student uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not coalesce(public.academy_can_teach(batch),false) then raise exception 'Teaching access required'; end if;
 if not exists(select 1 from public.batches b join public.courses c on c.id=b.course_id
  where b.id=batch and b.active and c.active) then raise exception 'Active batch and course required'; end if;
 if not exists(select 1 from public.profiles where id=student and role='student' and active
  and (public.current_academy_role()='admin' or assigned_staff_id=auth.uid())) then raise exception 'Active student required'; end if;
 insert into public.enrollments(batch_id,student_id) values(batch,student) on conflict do nothing;
 insert into public.audit_logs(actor_id,subject_id,action,details)
  values(auth.uid(),student,'academic.enroll',jsonb_build_object('batch',batch));
end $$;

-- Already graded work cannot erase its own grade. Deadlines use the database clock.
create or replace function public.academy_submit(assignment uuid, body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; a public.assignments; existing public.submissions;
begin
 select * into a from public.assignments where id=assignment and published for share;
 if a.id is null or not coalesce(public.academy_is_enrolled(a.batch_id),false) then raise exception 'Enrollment required'; end if;
 if a.due_at is not null and clock_timestamp()>a.due_at then raise exception 'Assignment deadline has passed'; end if;
 if body is null or length(trim(body)) not between 1 and 10000 then raise exception 'Answer must contain 1 to 10000 characters'; end if;
 perform pg_advisory_xact_lock(hashtextextended(assignment::text||auth.uid()::text,1));
 select * into existing from public.submissions where assignment_id=assignment and student_id=auth.uid() for update;
 if existing.graded_at is not null then raise exception 'Graded work cannot be replaced; ask your teacher to return it for revision'; end if;
 insert into public.submissions(assignment_id,student_id,body) values(assignment,auth.uid(),trim(body))
 on conflict(assignment_id,student_id) do update set body=excluded.body,submitted_at=clock_timestamp()
 returning id into result;
 insert into public.audit_logs(actor_id,subject_id,action,details)
  values(auth.uid(),auth.uid(),'academic.submit',jsonb_build_object('submission',result));
 return result;
end $$;
create function public.academy_return_submission(submission uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.submissions; b uuid;
begin
 select * into s from public.submissions where id=submission;
 perform pg_advisory_xact_lock(hashtextextended(s.assignment_id::text||s.student_id::text,1));
 select * into s from public.submissions where id=submission for update;
 select batch_id into b from public.assignments where id=s.assignment_id;
 if b is null or not coalesce(public.academy_can_teach(b),false) then raise exception 'Teaching access required'; end if;
 update public.submissions set mark=null,graded_at=null where id=submission;
 insert into public.audit_logs(actor_id,subject_id,action,details) values(auth.uid(),s.student_id,
  'academic.return',jsonb_build_object('submission',submission,'previous_mark',s.mark));
end $$;
revoke all on function public.academy_return_submission(uuid) from public;
grant execute on function public.academy_return_submission(uuid) to authenticated;

-- Do not silently transfer attendance to a replacement video.
alter table public.lessons add column content_version integer not null default 1;
alter table public.watch_sessions add column lesson_version integer not null default 1;
create function public.academy_protect_recording() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.youtube_id is distinct from old.youtube_id or new.duration_seconds is distinct from old.duration_seconds then
  perform pg_advisory_xact_lock(hashtextextended(old.id::text,3));
  if exists(select 1 from public.watch_credit where lesson_id=old.id and credited_seconds>0)
   then raise exception 'Attendance exists for this recording. Create a new lesson for a different video or duration.'; end if;
  new.content_version:=old.content_version+1;
 end if;
 return new;
end $$;
revoke all on function public.academy_protect_recording() from public;
create trigger protect_recorded_attendance before update of youtube_id,duration_seconds on public.lessons
 for each row execute function public.academy_protect_recording();

-- Preserve old totals. Old high-water coverage cannot be reconstructed exactly, so
-- reserve its entire previous span against duplicate credit; new sessions track intervals.
alter table public.watch_credit add column watched_ranges nummultirange not null default '{}';
update public.watch_credit set watched_ranges=nummultirange(numrange(0,high_water,'[)')) where high_water>0;
update public.watch_sessions set expires_at=least(expires_at,clock_timestamp());
drop function public.watch_start(uuid);
create function public.watch_start(lesson uuid, playhead numeric default 0) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; l public.lessons; stamp timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 perform pg_advisory_xact_lock(hashtextextended(lesson::text,3));
 stamp:=clock_timestamp();
 select * into l from public.lessons where id=lesson and published;
 if l.id is null or not coalesce(public.academy_is_enrolled(l.batch_id),false) then raise exception 'Enrollment required'; end if;
 if playhead is null or playhead<0 or playhead>l.duration_seconds or playhead='NaN'::numeric then raise exception 'Invalid position'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 if (select count(*) from public.watch_sessions where student_id=auth.uid() and started_at>stamp-interval '1 minute')>=30
  then raise exception 'Too many playback starts; wait a minute'; end if;
 update public.watch_sessions set expires_at=least(expires_at,stamp) where student_id=auth.uid() and expires_at>stamp;
 insert into public.watch_sessions(lesson_id,student_id,last_position,last_ping,started_at,expires_at,lesson_version)
  values(lesson,auth.uid(),playhead,stamp,stamp,stamp+interval '2 hours',l.content_version) returning id into result;
 return result;
end $$;
revoke all on function public.watch_start(uuid,numeric) from public;
grant execute on function public.watch_start(uuid,numeric) to authenticated;

create or replace function public.watch_ping(watch uuid, playhead numeric, playing boolean) returns numeric
language plpgsql security definer set search_path = '' as $$
declare s public.watch_sessions; duration integer; elapsed numeric; delta numeric; allowance numeric;
 gained numeric:=0; total numeric:=0; stamp timestamptz;
 covered nummultirange; segment nummultirange; fresh nummultirange;
begin
 if public.current_academy_role() is distinct from 'student'::public.academy_role then raise exception 'Active student required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 select * into s from public.watch_sessions where id=watch and student_id=auth.uid() for update;
 perform pg_advisory_xact_lock(hashtextextended(s.lesson_id::text,3));
 stamp:=clock_timestamp();
 if s.id is null or stamp>=s.expires_at then raise exception 'Watch session expired'; end if;
 select l.duration_seconds into duration from public.lessons l where l.id=s.lesson_id and l.published and l.content_version=s.lesson_version and public.academy_is_enrolled(l.batch_id);
 if duration is null or playhead is null or playhead<0 or playhead>duration+2 or playhead='NaN'::numeric then raise exception 'Invalid position'; end if;
 playhead:=least(playhead,duration);
 elapsed:=extract(epoch from stamp-s.last_ping); delta:=playhead-s.last_position;
 allowance:=case when playing and elapsed>=1 and elapsed<=45 and delta>=elapsed*0.65 and delta<=elapsed*1.35
  then least(delta,elapsed,30) else 0 end;
 insert into public.watch_credit(lesson_id,student_id) values(s.lesson_id,auth.uid()) on conflict do nothing;
 select watched_ranges,credited_seconds into covered,total from public.watch_credit
  where lesson_id=s.lesson_id and student_id=auth.uid() for update;
 if allowance>0 then
  segment:=nummultirange(numrange(greatest(0,playhead-allowance),playhead,'[)'));
  fresh:=segment-covered;
  select coalesce(sum(upper(r)-lower(r)),0) into gained from unnest(fresh) as r;
  gained:=least(gained,greatest(0,duration-total));
  update public.watch_credit set credited_seconds=credited_seconds+gained,
   high_water=greatest(high_water,playhead),watched_ranges=covered+segment
   where lesson_id=s.lesson_id and student_id=auth.uid();
 end if;
 update public.watch_sessions set last_position=playhead,last_ping=stamp,
  credited_seconds=credited_seconds+gained where id=watch;
 return total+gained;
end $$;

create or replace function public.attendance_summary(batch uuid, student uuid)
returns table(credited numeric, required numeric, percentage numeric, eligibility text)
language plpgsql stable security definer set search_path = '' as $$
declare total numeric; watched numeric; pct numeric;
begin
 if not coalesce((public.academy_can_teach(batch) or student=auth.uid() and public.academy_is_enrolled(batch)),false)
  then raise exception 'Enrollment access required'; end if;
 if not exists(select 1 from public.enrollments where batch_id=batch and student_id=student)
  then raise exception 'Current enrollment required'; end if;
 select coalesce(sum(duration_seconds),0) into total from public.lessons where batch_id=batch and published;
 select coalesce(sum(least(l.duration_seconds,c.credited_seconds)),0) into watched from public.lessons l
  join public.watch_credit c on c.lesson_id=l.id and c.student_id=student where l.batch_id=batch and l.published;
 pct:=case when total=0 then 0 else watched*100/total end;
 return query select watched,total,pct,case when total=0 then 'no_lessons' else public.attendance_eligibility(pct) end;
end $$;

-- Compact participant directory: names/roles for class discussion, never phone/address.
create function public.academy_directory() returns table(id uuid,full_name text,account_code text,
 role public.academy_role,active boolean,assigned_staff_id uuid)
language sql stable security definer set search_path = '' as $$
 select p.id,p.full_name,case when public.current_academy_role()='student' then '' else p.account_code end,
  p.role,p.active,case when public.current_academy_role()='student' and p.id<>auth.uid() then null else p.assigned_staff_id end
 from public.profiles p where public.current_academy_role() is not null and (
  p.id=auth.uid() or public.current_academy_role()='admin'
  or public.current_academy_role()='staff' and (p.assigned_staff_id=auth.uid() or exists(
   select 1 from public.enrollments e where e.student_id=p.id and public.academy_can_teach(e.batch_id)))
  or public.current_academy_role()='student' and p.active and (
   p.id=(select me.assigned_staff_id from public.profiles me where me.id=auth.uid())
   or exists(select 1 from public.batches b where public.academy_is_enrolled(b.id) and
    (b.staff_id=p.id or exists(select 1 from public.enrollments e where e.batch_id=b.id and e.student_id=p.id)))))
 order by p.full_name,p.id;
$$;
revoke all on function public.academy_directory() from public;
grant execute on function public.academy_directory() to authenticated;

-- Index permission lookups and history before operating beyond a small cohort.
create index if not exists enrollment_student_idx on public.enrollments(student_id,batch_id);
create index if not exists batch_staff_idx on public.batches(staff_id,course_id);
create index if not exists lesson_batch_idx on public.lessons(batch_id,published);
create index if not exists schedule_batch_idx on public.class_schedule(batch_id,starts_at);
create index if not exists watch_student_time_idx on public.watch_sessions(student_id,started_at desc);
create index if not exists comment_lesson_idx on public.class_comments(lesson_id,created_at);
create index if not exists doubt_participants_idx on public.doubt_messages(student_id,staff_id,created_at);
create index if not exists notification_recipient_idx on public.notifications(recipient_id,created_at desc);
create index if not exists audit_actor_time_idx on public.audit_logs(actor_id,created_at desc);

-- Explicit outer reference: an unqualified id was resolved against batches.
drop policy course_read on public.courses;
create policy course_read on public.courses for select to authenticated using (
 public.current_academy_role() is not null and (public.current_academy_role()='admin' or exists(
  select 1 from public.batches b where b.course_id=courses.id
   and (public.academy_can_teach(b.id) or public.academy_is_enrolled(b.id)))));

create or replace function public.academy_grade(submission uuid, score numeric, grade_feedback text) returns void
language plpgsql security definer set search_path = '' as $$
declare b uuid; pupil uuid; task uuid;
begin
 select s.assignment_id,s.student_id into task,pupil from public.submissions s where s.id=submission;
 if task is null then raise exception 'Submission not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(task::text||pupil::text,1));
 select a.batch_id into b from public.assignments a where a.id=task;
 if b is null or not coalesce(public.academy_can_teach(b),false) then raise exception 'Teaching access required'; end if;
 if score is null or score<0 or score>100 or score='NaN'::numeric then raise exception 'Invalid mark'; end if;
 if length(coalesce(grade_feedback,''))>4000 then raise exception 'Feedback is too long'; end if;
 update public.submissions set mark=score,feedback=coalesce(grade_feedback,''),graded_at=clock_timestamp() where id=submission;
 insert into public.audit_logs(actor_id,subject_id,action,details) values(auth.uid(),pupil,'academic.grade',jsonb_build_object('submission',submission,'mark',score));
end $$;
