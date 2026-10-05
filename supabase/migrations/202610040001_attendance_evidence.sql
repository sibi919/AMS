-- Additive attendance evidence, corrections, review and finalization. No history reset.
alter table public.class_sessions add column class_type text not null default 'Recorded' check(class_type in ('Recorded','Live','Offline','Mixed'));
alter table public.class_sessions add column locked_at timestamptz;
alter table public.class_sessions add column archived boolean not null default false;
alter table public.watch_credit add column updated_at timestamptz not null default now();
alter table public.live_credit add column updated_at timestamptz not null default now();
create function public.attendance_touch() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at:=clock_timestamp(); return new; end $$;
create trigger watch_credit_touch before update on public.watch_credit for each row execute function public.attendance_touch();
create trigger live_credit_touch before update on public.live_credit for each row execute function public.attendance_touch();
create table public.attendance_corrections (
 session_id uuid not null references public.class_sessions(id), student_id uuid not null references public.profiles(id),
 status text not null check(status in ('Present','Absent','Excused')), reason text not null check(length(trim(reason)) between 5 and 2000),
 actor_id uuid not null references public.profiles(id), updated_at timestamptz not null default now(), primary key(session_id,student_id)
);
create table public.attendance_frozen (
 session_id uuid not null references public.class_sessions(id), student_id uuid not null references public.profiles(id),
 status text not null, verified_seconds numeric not null, source text not null, updated_at timestamptz not null, primary key(session_id,student_id)
);
create table public.attendance_requests (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.class_sessions(id), student_id uuid not null references public.profiles(id),
 body text not null check(length(trim(body)) between 5 and 2000), created_at timestamptz not null default now(),
 response text, resolved_by uuid references public.profiles(id), resolved_at timestamptz
);
create unique index attendance_one_open_request on public.attendance_requests(session_id,student_id) where resolved_at is null;
alter table public.attendance_corrections enable row level security;
alter table public.attendance_frozen enable row level security;
alter table public.attendance_requests enable row level security;
revoke all on public.attendance_corrections,public.attendance_frozen,public.attendance_requests from anon,authenticated;
grant select on public.attendance_corrections,public.attendance_requests to authenticated;
create policy correction_read on public.attendance_corrections for select to authenticated using(exists(select 1 from public.class_sessions s where s.id=session_id and (public.academy_can_teach(s.batch_id) or student_id=auth.uid() and public.academy_is_enrolled(s.batch_id))));
create policy request_read on public.attendance_requests for select to authenticated using(exists(select 1 from public.class_sessions s where s.id=session_id and (public.academy_can_teach(s.batch_id) or student_id=auth.uid() and public.academy_is_enrolled(s.batch_id))));
-- Keep the original coverage calculation and authorization unchanged.
alter function public.session_attendance(uuid,uuid) rename to session_attendance_auto;
revoke all on function public.session_attendance_auto(uuid,uuid) from authenticated,public;
create function public.attendance_evidence(batch uuid,student uuid) returns table(session_id uuid,title text,official_seconds integer,verified_seconds numeric,status text,starts_at timestamptz,review_required boolean,class_type text,source text,updated_at timestamptz,locked boolean,reason text)
language sql stable security definer set search_path='' as $$
 select a.session_id,a.title,a.official_seconds,coalesce(f.verified_seconds,a.verified_seconds),coalesce(f.status,c.status,a.status),a.starts_at,a.review_required,
 s.class_type,coalesce(f.source,case when c.session_id is not null then 'Manual' else 'Auto' end),
 coalesce(f.updated_at,c.updated_at,(select max(w.updated_at) from public.watch_credit w join public.lessons l on l.id=w.lesson_id where l.class_session_id=s.id and w.student_id=student),(select lc.updated_at from public.live_credit lc where lc.class_session_id=s.id and lc.student_id=student),s.created_at),
 s.locked_at is not null,c.reason
 from public.session_attendance_auto(batch,student) a join public.class_sessions s on s.id=a.session_id
 left join public.attendance_corrections c on c.session_id=s.id and c.student_id=student
 left join public.attendance_frozen f on f.session_id=s.id and f.student_id=student and s.locked_at is not null;
$$;
create function public.session_attendance(batch uuid,student uuid) returns table(session_id uuid,title text,official_seconds integer,verified_seconds numeric,status text,starts_at timestamptz,review_required boolean)
language sql stable security definer set search_path='' as $$ select a.session_id,a.title,a.official_seconds,a.verified_seconds,a.status,a.starts_at,a.review_required from public.attendance_evidence(batch,student) a $$;
create function public.attendance_mark(session uuid,student uuid,status text,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.class_sessions; previous jsonb;
begin
 select * into s from public.class_sessions where id=session for update;
 if s.id is null or not coalesce(public.academy_can_teach(s.batch_id),false) then raise exception 'Teaching access required'; end if;
 if s.locked_at is not null and public.current_academy_role()<>'admin' then raise exception 'Attendance finalized; Admin correction required'; end if;
 if status is null or status not in ('Present','Absent','Excused') or reason is null or length(trim(reason)) not between 5 and 2000 then raise exception 'Status and a reason of 5–2000 characters required'; end if;
 if not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.batch_id=s.batch_id and e.student_id=student and p.role='student' and p.active) then raise exception 'Current enrollment required'; end if;
 select to_jsonb(a) into previous from public.attendance_evidence(s.batch_id,student) a where a.session_id=session;
 insert into public.attendance_corrections values(session,student,status,trim(reason),auth.uid(),clock_timestamp())
 on conflict(session_id,student_id) do update set status=excluded.status,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=excluded.updated_at;
 update public.attendance_frozen f set status=attendance_mark.status,source='Manual',updated_at=clock_timestamp() where f.session_id=session and f.student_id=student;
 insert into public.audit_logs(actor_id,subject_id,action,details) values(auth.uid(),student,case when s.locked_at is null then 'attendance.manual' else 'attendance.exceptional_correction' end,jsonb_build_object('session',session,'status',status,'reason',trim(reason),'previous',previous));
end $$;
create function public.attendance_lock(session uuid,finalize boolean,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.class_sessions; e record;
begin
 if public.current_academy_role() is distinct from 'admin'::public.academy_role then raise exception 'Admin required'; end if;
 if reason is null or length(trim(reason)) not between 5 and 2000 then raise exception 'Reason required (5–2000 characters)'; end if;
 select * into s from public.class_sessions where id=session for update;
 if s.id is null then raise exception 'Session not found'; end if;
 if finalize is null then raise exception 'Lock state required'; end if;
 if finalize and s.review_required then raise exception 'Confirm official duration before finalization'; end if;
 if finalize and s.locked_at is null then
  delete from public.attendance_frozen where session_id=session;
  for e in select en.student_id from public.enrollments en join public.profiles p on p.id=en.student_id where en.batch_id=s.batch_id and p.active and p.role='student' loop
   insert into public.attendance_frozen select a.session_id,e.student_id,a.status,a.verified_seconds,a.source,clock_timestamp() from public.attendance_evidence(s.batch_id,e.student_id) a where a.session_id=session;
  end loop;
 end if;
 update public.class_sessions set locked_at=case when finalize then coalesce(locked_at,clock_timestamp()) else null end where id=session;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),case when finalize then 'attendance.lock' else 'attendance.unlock' end,jsonb_build_object('session',session,'reason',trim(reason)));
end $$;
create function public.attendance_request(session uuid,body text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.class_sessions s where s.id=session and s.published and public.academy_is_enrolled(s.batch_id)) then raise exception 'Enrollment required'; end if;
 insert into public.attendance_requests(session_id,student_id,body) values(session,auth.uid(),trim(body));
end $$;
create function public.attendance_resolve(request uuid,response text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.attendance_requests; b uuid;
begin
 select * into r from public.attendance_requests where id=request for update;
 select batch_id into b from public.class_sessions where id=r.session_id;
 if b is null or not coalesce(public.academy_can_teach(b),false) then raise exception 'Teaching access required'; end if;
 if response is null or length(trim(response)) not between 5 and 2000 then raise exception 'Review response required'; end if;
 update public.attendance_requests set response=trim(attendance_resolve.response),resolved_by=auth.uid(),resolved_at=clock_timestamp() where id=request;
 insert into public.audit_logs(actor_id,subject_id,action,details) values(auth.uid(),r.student_id,'attendance.review',jsonb_build_object('session',r.session_id,'request',request,'response',trim(response)));
end $$;
create function public.attendance_history(session uuid,student uuid) returns table(id bigint,actor_id uuid,action text,details jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare b uuid;
begin
 select batch_id into b from public.class_sessions where class_sessions.id=session;
 if b is null or not coalesce(public.academy_can_teach(b) or student=auth.uid() and public.academy_is_enrolled(b),false) then raise exception 'Attendance access required'; end if;
 return query select a.id,a.actor_id,a.action,a.details,a.created_at from public.audit_logs a where a.details->>'session'=session::text and (a.subject_id=student or a.subject_id is null) order by a.created_at desc;
end $$;
-- Finalized session definitions cannot change behind the frozen report.
create function public.attendance_session_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.locked_at is not null and (new.official_seconds,new.required,new.published,new.batch_id,new.starts_at) is distinct from (old.official_seconds,old.required,old.published,old.batch_id,old.starts_at) then raise exception 'Unlock finalized attendance before changing session requirements'; end if;
 return new;
end $$;
create trigger attendance_session_guard before update on public.class_sessions for each row execute function public.attendance_session_guard();
-- Historical lessons are unpublished, never stripped of progress or discussion.
create or replace function public.academy_delete_lesson(lesson uuid) returns void language plpgsql security definer set search_path='' as $$
declare l public.lessons; historical boolean;
begin
 select * into l from public.lessons where id=lesson for update;
 if l.id is null or not coalesce(public.academy_can_teach(l.batch_id),false) then raise exception 'Teaching access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(lesson::text,3));
 historical:=exists(select 1 from public.watch_sessions where lesson_id=lesson) or exists(select 1 from public.watch_credit where lesson_id=lesson) or exists(select 1 from public.class_comments where lesson_id=lesson) or exists(select 1 from public.attendance_corrections where session_id=l.class_session_id) or exists(select 1 from public.class_sessions where id=l.class_session_id and locked_at is not null);
 if historical then update public.lessons set published=false where id=lesson;
 else update public.live_sessions set recorded_lesson_id=null where recorded_lesson_id=lesson; delete from public.lessons where id=lesson; end if;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),case when historical then 'academic.lesson.archive' else 'academic.lesson.delete' end,jsonb_build_object('id',lesson,'session',l.class_session_id));
end $$;
create function public.academy_session_type(session uuid,kind text) returns void language plpgsql security definer set search_path='' as $$
declare b uuid;
begin
 select batch_id into b from public.class_sessions where id=session;
 if b is null or not coalesce(public.academy_can_teach(b),false) then raise exception 'Teaching access required'; end if;
 update public.class_sessions set class_type=kind where id=session;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.session.type',jsonb_build_object('session',session,'type',kind));
end $$;
revoke all on function public.attendance_touch(),public.attendance_session_guard(),public.attendance_evidence(uuid,uuid),public.session_attendance(uuid,uuid),public.attendance_mark(uuid,uuid,text,text),public.attendance_lock(uuid,boolean,text),public.attendance_request(uuid,text),public.attendance_resolve(uuid,text),public.attendance_history(uuid,uuid),public.academy_session_type(uuid,text) from public;
grant execute on function public.attendance_evidence(uuid,uuid),public.session_attendance(uuid,uuid),public.attendance_mark(uuid,uuid,text,text),public.attendance_lock(uuid,boolean,text),public.attendance_request(uuid,text),public.attendance_resolve(uuid,text),public.attendance_history(uuid,uuid),public.academy_session_type(uuid,text) to authenticated;
notify pgrst,'reload schema';

-- No cascade for course/batch deletion: PostgreSQL foreign keys protect every dependent record.
create function public.academy_delete_empty(kind text,target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.current_academy_role() is distinct from 'admin'::public.academy_role then raise exception 'Admin required'; end if;
 if kind='course' then delete from public.courses where id=target;
 elsif kind='batch' then delete from public.batches where id=target;
 else raise exception 'Unknown catalog item'; end if;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.'||kind||'.delete',jsonb_build_object('id',target));
 exception when foreign_key_violation then raise exception 'Historical or enrolled records exist. Archive this item instead.';
end $$;
create function public.academy_archive_session(session uuid) returns void language plpgsql security definer set search_path='' as $$
declare b uuid;
begin
 select batch_id into b from public.class_sessions where id=session for update;
 if b is null or not coalesce(public.academy_can_teach(b),false) then raise exception 'Teaching access required'; end if;
 update public.class_sessions set archived=true where id=session;
 update public.lessons set published=false where class_session_id=session;
 update public.live_sessions set published=false where class_session_id=session;
 update public.class_schedule set published=false where class_session_id=session;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.session.archive',jsonb_build_object('session',session));
end $$;
create function public.academy_remove_live(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare b uuid;
begin
 select batch_id into b from public.live_sessions where id=target for update;
 if b is null or not coalesce(public.academy_can_teach(b),false) then raise exception 'Teaching access required'; end if;
 update public.live_sessions set published=false where id=target;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.live.archive',jsonb_build_object('id',target));
end $$;
create function public.academy_media_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.published and exists(select 1 from public.class_sessions where id=new.class_session_id and archived) then raise exception 'Session archived; create a new session for new teaching'; end if;
 if tg_op='UPDATE' and new.class_session_id is distinct from old.class_session_id then
  if exists(select 1 from public.class_sessions where id=old.class_session_id and locked_at is not null)
   or exists(select 1 from public.attendance_corrections where session_id=old.class_session_id)
   or tg_table_name='lessons' and exists(select 1 from public.watch_credit where lesson_id=old.id and credited_seconds>0)
   or tg_table_name='live_sessions' and exists(select 1 from public.live_credit where class_session_id=old.class_session_id)
  then raise exception 'Attendance history exists; media cannot move to another session'; end if;
 end if;
 return new;
end $$;
create trigger media_guard before insert or update on public.lessons for each row execute function public.academy_media_guard();
create trigger media_guard before insert or update on public.live_sessions for each row execute function public.academy_media_guard();
revoke all on function public.academy_delete_empty(text,uuid),public.academy_archive_session(uuid),public.academy_remove_live(uuid),public.academy_media_guard() from public;
grant execute on function public.academy_delete_empty(text,uuid),public.academy_archive_session(uuid),public.academy_remove_live(uuid) to authenticated;
