-- Keep optional UUID form fields safe at the RPC boundary. Older clients can
-- still send an empty string for an unassigned batch staff member.
create or replace function public.academy_manage(kind text, target uuid, batch uuid, title text, body text, video_id text, seconds integer, publish boolean, starts timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; existing_batch uuid; staff uuid;
begin
 if kind='course' then
  if public.current_academy_role() is distinct from 'admin'::public.academy_role then raise exception 'Admin required'; end if;
  if target is null then insert into public.courses(title,description) values(trim(title),coalesce(body,'')) returning id into result;
  else update public.courses set title=trim(academy_manage.title),description=coalesce(body,'') where id=target returning id into result; end if;
 elsif kind='batch' then
  if public.current_academy_role() is distinct from 'admin'::public.academy_role then raise exception 'Admin required'; end if;
  staff := nullif(trim(video_id),'')::uuid;
  if target is null then insert into public.batches(course_id,title,staff_id) values(batch,trim(title),staff) returning id into result;
  else update public.batches set course_id=batch,title=trim(academy_manage.title),staff_id=staff where id=target returning id into result; end if;
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
   if target is null then insert into public.lessons(batch_id,title,youtube_id,duration_seconds,published) values(batch,trim(title),trim(video_id),seconds,coalesce(publish,false)) returning id into result;
   else update public.lessons set title=trim(academy_manage.title),youtube_id=trim(video_id),duration_seconds=seconds,published=coalesce(publish,false) where id=target returning id into result; end if;
  elsif kind='live' then
   if target is null then insert into public.live_sessions(batch_id,title,youtube_id,starts_at,published) values(batch,trim(title),trim(video_id),starts,coalesce(publish,false)) returning id into result;
   else update public.live_sessions set title=trim(academy_manage.title),youtube_id=trim(video_id),starts_at=starts,published=coalesce(publish,false) where id=target returning id into result; end if;
  elsif kind='assignment' then
   if target is null then insert into public.assignments(batch_id,title,instructions,due_at,published) values(batch,trim(title),coalesce(body,''),starts,coalesce(publish,false)) returning id into result;
   else update public.assignments set title=trim(academy_manage.title),instructions=coalesce(body,''),due_at=starts,published=coalesce(publish,false) where id=target returning id into result; end if;
  else
   if target is null then insert into public.notes(batch_id,title,body,published) values(batch,trim(title),body,coalesce(publish,false)) returning id into result;
   else update public.notes set title=trim(academy_manage.title),body=academy_manage.body,published=coalesce(publish,false) where id=target returning id into result; end if;
  end if;
 else raise exception 'Unknown record kind'; end if;
 if result is null then raise exception 'Record not found'; end if;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.'||kind,jsonb_build_object('id',result,'published',publish));
 return result;
end $$;

revoke all on function public.academy_manage(text,uuid,uuid,text,text,text,integer,boolean,timestamptz) from public;
grant execute on function public.academy_manage(text,uuid,uuid,text,text,text,integer,boolean,timestamptz) to authenticated;
