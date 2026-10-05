-- Structured timetable and explicit roster removal for the existing academy.
create table public.class_schedule (
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null references public.batches(id),
 title text not null check (length(title) between 2 and 180),
 meeting_url text,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 published boolean not null default false,
 created_at timestamptz not null default now(),
 constraint valid_class_time check (ends_at > starts_at),
 constraint valid_class_url check (meeting_url is null or meeting_url ~ '^https://')
);
alter table public.class_schedule enable row level security;
revoke all on public.class_schedule from anon, authenticated;
grant select on public.class_schedule to authenticated;
create policy class_schedule_read on public.class_schedule for select to authenticated
 using (public.academy_can_teach(batch_id) or published and public.academy_is_enrolled(batch_id));

create function public.academy_schedule(target uuid, batch uuid, title text, meeting_url text, starts timestamptz, ends timestamptz, publish boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid; original_batch uuid;
begin
 if not coalesce(public.academy_can_teach(batch), false) then raise exception 'Teaching access required'; end if;
 if starts is null or ends is null or ends <= starts then raise exception 'Invalid class time'; end if;
 if target is null then
  insert into public.class_schedule(batch_id,title,meeting_url,starts_at,ends_at,published)
   values(batch,trim(title),nullif(trim(meeting_url),''),starts,ends,coalesce(publish,false)) returning id into result;
 else
  select batch_id into original_batch from public.class_schedule where id=target;
  if original_batch is distinct from batch then raise exception 'Batch cannot change'; end if;
  update public.class_schedule set title=trim(academy_schedule.title),meeting_url=nullif(trim(academy_schedule.meeting_url),''),
   starts_at=starts,ends_at=ends,published=coalesce(publish,false) where id=target returning id into result;
 end if;
 if result is null then raise exception 'Class not found'; end if;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.schedule',jsonb_build_object('id',result,'batch',batch));
 return result;
end $$;
revoke all on function public.academy_schedule(uuid,uuid,text,text,timestamptz,timestamptz,boolean) from public;
grant execute on function public.academy_schedule(uuid,uuid,text,text,timestamptz,timestamptz,boolean) to authenticated;

create function public.academy_unenroll(batch uuid, student uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not coalesce(public.academy_can_teach(batch),false) then raise exception 'Teaching access required'; end if;
 if public.current_academy_role() <> 'admin' and not exists
  (select 1 from public.profiles where id=student and assigned_staff_id=auth.uid() and role='student')
  then raise exception 'Assigned student required'; end if;
 delete from public.enrollments where batch_id=batch and student_id=student;
 insert into public.audit_logs(actor_id,subject_id,action,details) values(auth.uid(),student,'academic.unenroll',jsonb_build_object('batch',batch));
end $$;
revoke all on function public.academy_unenroll(uuid,uuid) from public;
grant execute on function public.academy_unenroll(uuid,uuid) to authenticated;

create function public.academy_set_active(kind text, target uuid, enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if public.current_academy_role() is distinct from 'admin'::public.academy_role then raise exception 'Admin required'; end if;
 if kind = 'course' then
  update public.courses set active=enabled where id=target;
 elsif kind = 'batch' then
  update public.batches set active=enabled where id=target;
 else raise exception 'Unknown record kind'; end if;
 if not found then raise exception 'Record not found'; end if;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.active',jsonb_build_object('kind',kind,'id',target,'enabled',enabled));
end $$;
revoke all on function public.academy_set_active(text,uuid,boolean) from public;
grant execute on function public.academy_set_active(text,uuid,boolean) to authenticated;

alter table public.live_sessions add column recorded_lesson_id uuid references public.lessons(id);
create function public.academy_attach_recording(live uuid, lesson uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare live_batch uuid; lesson_batch uuid;
begin
 select batch_id into live_batch from public.live_sessions where id=live;
 select batch_id into lesson_batch from public.lessons where id=lesson and published;
 if live_batch is null or lesson_batch is distinct from live_batch then raise exception 'Published lesson in same batch required'; end if;
 if not coalesce(public.academy_can_teach(live_batch),false) then raise exception 'Teaching access required'; end if;
 update public.live_sessions set recorded_lesson_id=lesson where id=live;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.replay',jsonb_build_object('live',live,'lesson',lesson));
end $$;
revoke all on function public.academy_attach_recording(uuid,uuid) from public;
grant execute on function public.academy_attach_recording(uuid,uuid) to authenticated;

grant select on public.watch_sessions to authenticated;
create policy watch_session_history on public.watch_sessions for select to authenticated
 using (student_id=auth.uid() or exists
  (select 1 from public.lessons l where l.id=lesson_id and public.academy_can_teach(l.batch_id)));
