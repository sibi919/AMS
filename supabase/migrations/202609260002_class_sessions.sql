-- Add official attendance units without removing legacy lessons or watch history.
create table public.class_sessions (
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null references public.batches(id),
 title text not null check(length(trim(title)) between 2 and 180),
 official_seconds integer not null check(official_seconds between 60 and 43200),
 starts_at timestamptz, published boolean not null default false,
 required boolean not null default true,
 review_required boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.class_sessions enable row level security;
revoke all on public.class_sessions from anon,authenticated;
grant select on public.class_sessions to authenticated;
create policy session_read on public.class_sessions for select to authenticated using
 (public.academy_can_teach(batch_id) or published and public.academy_is_enrolled(batch_id));
insert into public.class_sessions(id,batch_id,title,official_seconds,published)
 select id,batch_id,title,duration_seconds,published from public.lessons;
insert into public.class_sessions(id,batch_id,title,official_seconds,starts_at,published)
 select id,batch_id,title,3600,starts_at,published from public.live_sessions;
alter table public.lessons add column class_session_id uuid references public.class_sessions(id);
alter table public.lessons add column duration_verified boolean not null default false;
alter table public.live_sessions add column class_session_id uuid references public.class_sessions(id);
alter table public.class_schedule add column class_session_id uuid references public.class_sessions(id);
update public.lessons set class_session_id=id;
update public.live_sessions set class_session_id=id;
create function public.academy_content_session() returns trigger
language plpgsql security definer set search_path='' as $$
declare seconds integer;
begin
 if new.class_session_id is null then
  seconds:=case when tg_table_name='lessons' then (to_jsonb(new)->>'duration_seconds')::integer else 3600 end;
  insert into public.class_sessions(batch_id,title,official_seconds,published,review_required)
   values(new.batch_id,new.title,seconds,new.published,true) returning id into new.class_session_id;
 elsif not exists(select 1 from public.class_sessions s where s.id=new.class_session_id and s.batch_id=new.batch_id) then
  raise exception 'Class session must belong to the same batch';
 end if;
 return new;
end $$;
create trigger lesson_class_session before insert or update of class_session_id,batch_id on public.lessons for each row execute function public.academy_content_session();
create trigger live_class_session before insert or update of class_session_id,batch_id on public.live_sessions for each row execute function public.academy_content_session();
alter table public.lessons alter column class_session_id set not null;
alter table public.live_sessions alter column class_session_id set not null;

create function public.academy_session_save(target uuid,batch uuid,title text,seconds integer,starts timestamptz,publish boolean,is_required boolean default true) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not coalesce(public.academy_can_teach(batch),false) then raise exception 'Teaching access required'; end if;
 if target is null then
  insert into public.class_sessions(batch_id,title,official_seconds,starts_at,published,required,review_required)
   values(batch,trim(title),seconds,starts,coalesce(publish,false),coalesce(is_required,true),false) returning id into result;
 else
  update public.class_sessions s set title=trim(academy_session_save.title),official_seconds=seconds,starts_at=starts,
   published=coalesce(publish,false),required=coalesce(is_required,true),review_required=false
   where s.id=target and s.batch_id=batch returning id into result;
 end if;
 if result is null then raise exception 'Session not found'; end if;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.session',jsonb_build_object('id',result,'official_seconds',seconds,'published',publish));
 return result;
end $$;

create function public.academy_link_session(kind text,target uuid,session uuid) returns void
language plpgsql security definer set search_path='' as $$
declare b uuid; original uuid; previous uuid;
begin
 select batch_id into b from public.class_sessions where id=session;
 if b is null or not coalesce(public.academy_can_teach(b),false) then raise exception 'Teaching access required'; end if;
 if kind='lesson' then select batch_id into original from public.lessons where id=target;
 elsif kind='live' then select batch_id into original from public.live_sessions where id=target;
 elsif kind='schedule' then select batch_id into original from public.class_schedule where id=target;
 else raise exception 'Unknown content'; end if;
 if b is distinct from original then raise exception 'Same batch required'; end if;
 if kind='lesson' then select class_session_id into previous from public.lessons where id=target;
 elsif kind='live' then select class_session_id into previous from public.live_sessions where id=target; end if;
 if kind='lesson' then update public.lessons set class_session_id=session where id=target;
 elsif kind='live' then update public.live_sessions set class_session_id=session where id=target;
 else update public.class_schedule set class_session_id=session where id=target; end if;
 update public.class_sessions s set published=false,required=false where s.id=previous and s.id<>session and s.review_required
  and not exists(select 1 from public.lessons l where l.class_session_id=s.id)
  and not exists(select 1 from public.live_sessions l where l.class_session_id=s.id);
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.session.link',jsonb_build_object('kind',kind,'id',target,'session',session));
end $$;

-- Recordings cannot be replaced after credit exists. Duration corrections retain
-- coverage, only clipping impossible out-of-bounds portions of the affected lesson.
create or replace function public.academy_protect_recording() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(old.id::text,3));
 if new.youtube_id is distinct from old.youtube_id then
  if exists(select 1 from public.watch_credit where lesson_id=old.id and credited_seconds>0) then raise exception 'Attendance exists for this recording. Create a new lesson for a different video.'; end if;
  new.content_version:=old.content_version+1; new.duration_verified:=false;
 end if;
 if new.duration_seconds is distinct from old.duration_seconds then
  update public.watch_credit set
   watched_ranges=watched_ranges * nummultirange(numrange(0,new.duration_seconds,'[)')),
   credited_seconds=least(credited_seconds,coalesce((select sum(upper(r)-lower(r)) from unnest(watched_ranges * nummultirange(numrange(0,new.duration_seconds,'[)'))) r),0)),
   high_water=least(high_water,new.duration_seconds) where lesson_id=old.id;
 end if;
 return new;
end $$;
create function public.academy_record_duration(lesson uuid,seconds integer) returns void
language plpgsql security definer set search_path='' as $$
declare old_seconds integer; b uuid;
begin
 select batch_id,duration_seconds into b,old_seconds from public.lessons where id=lesson;
 if b is null or not coalesce(public.academy_can_teach(b),false) then raise exception 'Teaching access required'; end if;
 if seconds is null or seconds not between 60 and 21600 then raise exception 'Video duration must be between 1 minute and 6 hours'; end if;
 update public.lessons set duration_seconds=seconds,duration_verified=true where id=lesson;
 if old_seconds<>seconds then insert into public.audit_logs(actor_id,action,details)
  values(auth.uid(),'academic.duration.corrected',jsonb_build_object('lesson',lesson,'previous_seconds',old_seconds,'seconds',seconds)); end if;
end $$;

create table public.live_watch_sessions (
 id uuid primary key default gen_random_uuid(),live_id uuid not null references public.live_sessions(id),student_id uuid not null references public.profiles(id),
 last_ping timestamptz not null default clock_timestamp(),last_position numeric not null,
 expires_at timestamptz not null default clock_timestamp()+interval '12 hours'
);
create table public.live_credit (
 class_session_id uuid not null references public.class_sessions(id),student_id uuid not null references public.profiles(id),
 watched_ranges nummultirange not null default '{}', primary key(class_session_id,student_id)
);
alter table public.live_watch_sessions enable row level security;
alter table public.live_credit enable row level security;
revoke all on public.live_watch_sessions,public.live_credit from anon,authenticated;
grant select on public.live_credit to authenticated;
create policy live_credit_read on public.live_credit for select to authenticated using(exists(select 1 from public.class_sessions s where s.id=class_session_id and (public.academy_can_teach(s.batch_id) or student_id=auth.uid() and public.academy_is_enrolled(s.batch_id))));
create function public.live_watch_start(live uuid,playhead numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare l public.live_sessions; s public.class_sessions; result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 select * into l from public.live_sessions where id=live and published;
 select * into s from public.class_sessions where id=l.class_session_id and published and not review_required;
 if s.id is null or not coalesce(public.academy_is_enrolled(l.batch_id),false) then raise exception 'Active published session enrollment required'; end if;
 if clock_timestamp()<l.starts_at or clock_timestamp()>l.starts_at+s.official_seconds*interval '1 second' then raise exception 'Outside scheduled live class'; end if;
 if playhead is null or playhead<0 or playhead in ('NaN'::numeric,'Infinity'::numeric) then raise exception 'Invalid position'; end if;
 update public.live_watch_sessions set expires_at=least(expires_at,clock_timestamp()) where student_id=auth.uid();
 update public.watch_sessions set expires_at=least(expires_at,clock_timestamp()) where student_id=auth.uid();
 insert into public.live_watch_sessions(live_id,student_id,last_position) values(live,auth.uid(),playhead) returning id into result;
 return result;
end $$;
create function public.live_watch_ping(watch uuid,playhead numeric,playing boolean) returns numeric
language plpgsql security definer set search_path='' as $$
declare w public.live_watch_sessions; s public.class_sessions; l public.live_sessions; stamp timestamptz:=clock_timestamp(); elapsed numeric; delta numeric; span numeric; result numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 select * into w from public.live_watch_sessions where id=watch and student_id=auth.uid() for update;
 select * into l from public.live_sessions where id=w.live_id and published;
 select * into s from public.class_sessions where id=l.class_session_id and published and not review_required;
 if w.id is null or stamp>=w.expires_at or s.id is null or not coalesce(public.academy_is_enrolled(s.batch_id),false) then raise exception 'Live attendance access expired'; end if;
 if exists(select 1 from public.watch_sessions where student_id=auth.uid() and started_at>w.last_ping and expires_at>stamp) then raise exception 'Another class is active'; end if;
 if playhead is null or playhead<0 or playhead in ('NaN'::numeric,'Infinity'::numeric) then raise exception 'Invalid position'; end if;
 elapsed:=extract(epoch from stamp-w.last_ping); delta:=playhead-w.last_position;
 if playing and elapsed between 1 and 45 and delta between elapsed*0.65 and elapsed*1.35 and stamp>=l.starts_at and stamp<=l.starts_at+s.official_seconds*interval '1 second' then
  span:=least(elapsed,delta,30);
  insert into public.live_credit(class_session_id,student_id,watched_ranges)
   values(s.id,auth.uid(),nummultirange(numrange(extract(epoch from stamp)-span,extract(epoch from stamp),'[)')))
   on conflict(class_session_id,student_id) do update set watched_ranges=public.live_credit.watched_ranges+excluded.watched_ranges;
 end if;
 update public.live_watch_sessions set last_ping=stamp,last_position=playhead where id=watch;
 select coalesce(sum(upper(r)-lower(r)),0) into result from public.live_credit c cross join lateral unnest(c.watched_ranges) r where c.class_session_id=s.id and c.student_id=auth.uid();
 return coalesce(result,0);
end $$;

-- Attendance belongs to the official class even if its media is later removed.
create table public.retained_session_credit (
 class_session_id uuid not null references public.class_sessions(id),student_id uuid not null references public.profiles(id),
 youtube_id text not null,credited_seconds numeric not null,watched_ranges nummultirange not null,
 primary key(class_session_id,student_id,youtube_id)
);
alter table public.retained_session_credit enable row level security;
revoke all on public.retained_session_credit from anon,authenticated;
create function public.academy_retain_lesson_attendance() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.retained_session_credit(class_session_id,student_id,youtube_id,credited_seconds,watched_ranges)
 select old.class_session_id,c.student_id,old.youtube_id,c.credited_seconds,c.watched_ranges from public.watch_credit c where c.lesson_id=old.id
 on conflict(class_session_id,student_id,youtube_id) do update set
  credited_seconds=public.retained_session_credit.credited_seconds+excluded.credited_seconds,
  watched_ranges=public.retained_session_credit.watched_ranges+excluded.watched_ranges;
 return old;
end $$;
revoke all on function public.academy_retain_lesson_attendance() from public;
-- The existing delete RPC removes credit before deleting the lesson, so snapshot
-- from the credit row at its deletion while its lesson relation still exists.
create function public.academy_retain_credit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.retained_session_credit(class_session_id,student_id,youtube_id,credited_seconds,watched_ranges)
 select l.class_session_id,old.student_id,l.youtube_id,old.credited_seconds,old.watched_ranges from public.lessons l where l.id=old.lesson_id
 on conflict(class_session_id,student_id,youtube_id) do update set
  credited_seconds=public.retained_session_credit.credited_seconds+excluded.credited_seconds,
  watched_ranges=public.retained_session_credit.watched_ranges+excluded.watched_ranges;
 return old;
end $$;
create trigger retain_class_credit before delete on public.watch_credit for each row execute function public.academy_retain_credit();
revoke all on function public.academy_retain_credit() from public;

create function public.session_attendance(batch uuid,student uuid) returns table(session_id uuid,title text,official_seconds integer,verified_seconds numeric,status text,starts_at timestamptz,review_required boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(public.academy_can_teach(batch) or student=auth.uid() and public.academy_is_enrolled(batch),false) then raise exception 'Enrollment access required'; end if;
 if not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.batch_id=batch and e.student_id=student and p.active and p.role='student') then raise exception 'Current enrollment required'; end if;
 return query
 select s.id,s.title,s.official_seconds,least(s.official_seconds,coalesce(v.seconds,0)),
  case when s.review_required then 'Needs review' when coalesce(v.seconds,0)>=s.official_seconds then 'Present' when coalesce(v.seconds,0)>0 then 'In Progress' else 'Not Started' end,s.starts_at,s.review_required
 from public.class_sessions s
 cross join lateral (
  select greatest(
   coalesce((select sum(least(g.credited,coalesce((select sum(upper(r)-lower(r)) from unnest(g.coverage) r),0))) from (
    select c.youtube_id,sum(c.credited_seconds) credited,range_agg(c.watched_ranges) coverage from (
      select l.youtube_id,c.credited_seconds,c.watched_ranges from public.lessons l join public.watch_credit c on c.lesson_id=l.id and c.student_id=student where l.class_session_id=s.id
      union all select c.youtube_id,c.credited_seconds,c.watched_ranges from public.retained_session_credit c where c.class_session_id=s.id and c.student_id=student
    ) c group by c.youtube_id
   ) g),0),
   coalesce((select sum(upper(r)-lower(r)) from public.live_credit c cross join lateral unnest(c.watched_ranges) r where c.class_session_id=s.id and c.student_id=student),0)
  ) seconds
 ) v
 where s.batch_id=batch and s.published and s.required
 order by s.starts_at nulls last,s.id;
end $$;

-- Retain the RPC shape for older callers; credited/required now mean SESSION COUNTS.
create or replace function public.attendance_summary(batch uuid,student uuid) returns table(credited numeric,required numeric,percentage numeric,eligibility text)
language plpgsql stable security definer set search_path='' as $$
declare total numeric; present_count numeric; pending integer; pct numeric;
begin
 select count(*),count(*) filter(where a.status='Present'),count(*) filter(where a.review_required)
 into total,present_count,pending from public.session_attendance(batch,student) a;
 pct:=case when total=0 then 0 else present_count*100/total end;
 return query select present_count,total,pct,case when total=0 then 'no_sessions' when pending>0 then 'review_required' else public.attendance_eligibility(pct) end;
end $$;

create function public.academy_schedule_delete(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare b uuid;
begin
 select batch_id into b from public.class_schedule where id=target;
 if b is null or not coalesce(public.academy_can_teach(b),false) then raise exception 'Teaching access required'; end if;
 delete from public.class_schedule where id=target;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.schedule.delete',jsonb_build_object('id',target));
end $$;

revoke all on function public.academy_content_session(),public.academy_session_save(uuid,uuid,text,integer,timestamptz,boolean,boolean),public.academy_link_session(text,uuid,uuid),public.academy_record_duration(uuid,integer),public.live_watch_start(uuid,numeric),public.live_watch_ping(uuid,numeric,boolean),public.session_attendance(uuid,uuid),public.academy_schedule_delete(uuid) from public;
grant execute on function public.academy_session_save(uuid,uuid,text,integer,timestamptz,boolean,boolean),public.academy_link_session(text,uuid,uuid),public.academy_record_duration(uuid,integer),public.live_watch_start(uuid,numeric),public.live_watch_ping(uuid,numeric,boolean),public.session_attendance(uuid,uuid),public.academy_schedule_delete(uuid) to authenticated;
create index session_batch_idx on public.class_sessions(batch_id,starts_at);
create index lesson_session_idx on public.lessons(class_session_id);
create function public.academy_manage_session(kind text,target uuid,batch uuid,title text,body text,video_id text,seconds integer,publish boolean,starts timestamptz,class_session uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if class_session is null then raise exception 'Choose a class session'; end if;
 result:=public.academy_manage(kind,target,batch,title,body,video_id,seconds,publish,starts);
 perform public.academy_link_session(kind,result,class_session);
 return result;
end $$;
revoke all on function public.academy_manage_session(text,uuid,uuid,text,text,text,integer,boolean,timestamptz,uuid) from public;
grant execute on function public.academy_manage_session(text,uuid,uuid,text,text,text,integer,boolean,timestamptz,uuid) to authenticated;
notify pgrst,'reload schema';
create function public.academy_schedule_session(target uuid,batch uuid,title text,meeting_url text,starts timestamptz,ends timestamptz,publish boolean,class_session uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if class_session is null then raise exception 'Choose a class session'; end if;
 result:=public.academy_schedule(target,batch,title,meeting_url,starts,ends,publish);
 perform public.academy_link_session('schedule',result,class_session);
 return result;
end $$;
revoke all on function public.academy_schedule_session(uuid,uuid,text,text,timestamptz,timestamptz,boolean,uuid) from public;
grant execute on function public.academy_schedule_session(uuid,uuid,text,text,timestamptz,timestamptz,boolean,uuid) to authenticated;

-- Trusted provisioning metadata assigns the actual roster, not just its label.
create function public.academy_provision_enrollment() returns trigger
language plpgsql security definer set search_path='' as $$
declare batch uuid; actor public.profiles; b public.batches;
begin
 batch:=nullif(new.raw_app_meta_data->>'batch_id','')::uuid;
 if batch is null then return new; end if;
 if not exists(select 1 from public.profiles where id=new.id and role='student') then raise exception 'Student profile required'; end if;
 select * into actor from public.profiles where id=nullif(new.raw_app_meta_data->>'created_by','')::uuid;
 select * into b from public.batches where id=batch and active;
 if b.id is null or not exists(select 1 from public.courses where id=b.course_id and active)
  or actor.id is null or not actor.active or not(actor.role='admin' or actor.role='staff' and actor.can_create_students and b.staff_id=actor.id) then raise exception 'Authorized active batch required'; end if;
 insert into public.enrollments(batch_id,student_id) values(batch,new.id) on conflict do nothing;
 update public.profiles set assigned_staff_id=coalesce(assigned_staff_id,b.staff_id) where id=new.id;
 insert into public.audit_logs(actor_id,subject_id,action,details) values(actor.id,new.id,'academic.enroll',jsonb_build_object('batch',batch,'source','provisioning'));
 return new;
end $$;
create trigger z_academy_enrollment_created after insert on auth.users for each row when(new.raw_app_meta_data ? 'academy_role') execute function public.academy_provision_enrollment();
create trigger z_academy_enrollment_metadata after update of raw_app_meta_data on auth.users for each row when(new.raw_app_meta_data ? 'academy_role' and not(coalesce(old.raw_app_meta_data,'{}'::jsonb) ? 'academy_role')) execute function public.academy_provision_enrollment();
revoke all on function public.academy_provision_enrollment() from public;

create function public.academy_content_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.published and (tg_op='INSERT' or not old.published or new.title is distinct from old.title) then
  insert into public.notifications(recipient_id,title,body)
  select e.student_id,'Academy update: '||new.title,'New or updated '||replace(tg_table_name,'_',' ')||' is available in your Academy portal.'
  from public.enrollments e join public.profiles p on p.id=e.student_id and p.active where e.batch_id=new.batch_id;
 end if;
 return new;
end $$;
create trigger lesson_notification after insert or update on public.lessons for each row execute function public.academy_content_notification();
create trigger live_notification after insert or update on public.live_sessions for each row execute function public.academy_content_notification();
create trigger assignment_notification after insert or update on public.assignments for each row execute function public.academy_content_notification();
create trigger note_notification after insert or update on public.notes for each row execute function public.academy_content_notification();
create trigger schedule_notification after insert or update on public.class_schedule for each row execute function public.academy_content_notification();
revoke all on function public.academy_content_notification() from public;
