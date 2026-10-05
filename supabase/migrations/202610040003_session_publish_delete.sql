-- Batch enrollment is the only student-to-lesson assignment. Published media
-- must also belong to an available session in the same active batch.
drop policy lesson_read on public.lessons;
create policy lesson_read on public.lessons for select to authenticated using (
 public.academy_can_teach(batch_id) or published and public.academy_is_enrolled(batch_id)
 and exists(select 1 from public.class_sessions s where s.id=class_session_id and s.batch_id=lessons.batch_id and s.published and not s.archived)
);

-- Insert directly into the chosen session: no intermediate/orphan session,
-- and publication/notification ownership commit together.
create or replace function public.academy_manage_session(kind text,target uuid,batch uuid,title text,body text,video_id text,seconds integer,publish boolean,starts timestamptz,class_session uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; s public.class_sessions;
begin
 if not coalesce(public.academy_can_teach(batch),false) then raise exception 'Teaching access required'; end if;
 select * into s from public.class_sessions where id=class_session and batch_id=batch for key share;
 if s.id is null or s.archived then raise exception 'Choose an available class session in this batch'; end if;
 if publish and not s.published then raise exception 'Publish the class session first'; end if;
 if kind='lesson' then
  if target is null then
   insert into public.lessons(batch_id,class_session_id,title,youtube_id,duration_seconds,published)
   values(batch,class_session,title,video_id,seconds,coalesce(publish,false)) returning id into result;
  else
   update public.lessons l set class_session_id=class_session,title=academy_manage_session.title,youtube_id=video_id,duration_seconds=seconds,published=coalesce(publish,false)
   where l.id=target and l.batch_id=batch returning l.id into result;
  end if;
 elsif kind='live' then
  if target is null then
   insert into public.live_sessions(batch_id,class_session_id,title,youtube_id,starts_at,published)
   values(batch,class_session,title,video_id,starts,coalesce(publish,false)) returning id into result;
  else
   update public.live_sessions l set class_session_id=class_session,title=academy_manage_session.title,youtube_id=video_id,starts_at=starts,published=coalesce(publish,false)
   where l.id=target and l.batch_id=batch returning l.id into result;
  end if;
 else raise exception 'Expected recorded lesson or live class'; end if;
 if result is null then raise exception 'Record not found in selected batch'; end if;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.'||kind,jsonb_build_object('id',result,'session',class_session,'published',publish));
 return result;
end $$;

-- Explicit ownership prevents deleting notifications based merely on a title.
alter table public.notifications add column class_session_id uuid references public.class_sessions(id);
alter table public.notifications add column content_table text;
alter table public.notifications add column content_id uuid;
create index notification_session_idx on public.notifications(class_session_id);
create or replace function public.academy_content_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare session uuid:=nullif(to_jsonb(new)->>'class_session_id','')::uuid;
begin
 if tg_op='UPDATE' then
  update public.notifications n set class_session_id=session where n.content_table=tg_table_name and n.content_id=new.id and n.class_session_id is distinct from session;
 end if;
 if new.published and (tg_op='INSERT' or not old.published or new.title is distinct from old.title) then
  insert into public.notifications(recipient_id,title,body,class_session_id,content_table,content_id)
  select e.student_id,'Academy update: '||new.title,'New or updated '||replace(tg_table_name,'_',' ')||' is available in your Academy portal.',session,tg_table_name,new.id
  from public.enrollments e join public.profiles p on p.id=e.student_id and p.active where e.batch_id=new.batch_id;
 end if;
 return new;
end $$;
-- Attribute legacy notifications only when an exact creation timestamp or
-- same-transaction audit entry identifies a single source. Ambiguous rows stay.
with media as (
 select id,class_session_id,title,created_at,'lessons'::text kind,'academic.lesson'::text action from public.lessons
 union all select id,class_session_id,title,created_at,'live_sessions','academic.live' from public.live_sessions
 union all select id,class_session_id,title,created_at,'class_schedule','academic.schedule' from public.class_schedule
), candidates as (
 select distinct n.id notification,m.id content,m.class_session_id,m.kind from public.notifications n join media m
 on n.body='New or updated '||replace(m.kind,'_',' ')||' is available in your Academy portal.'
 and ((n.created_at=m.created_at and n.title='Academy update: '||m.title)
 or exists(select 1 from public.audit_logs a where a.created_at=n.created_at and a.action=m.action and a.details->>'id'=m.id::text))
 where m.class_session_id is not null
), unique_sources as (select notification from candidates group by notification having count(*)=1)
update public.notifications n set class_session_id=c.class_session_id,content_id=c.content,content_table=c.kind
from candidates c join unique_sources u on u.notification=c.notification where n.id=c.notification;

-- Explicit ADMIN-only exception to archive-first lifecycle. All statements run
-- in the caller's transaction: failures restore every dependent record.
create function public.academy_delete_class_session(session uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.class_sessions; lesson_ids uuid[]; live_ids uuid[];
begin
 if public.current_academy_role() is distinct from 'admin'::public.academy_role then raise exception 'Admin required for permanent class session deletion'; end if;
 select * into s from public.class_sessions where id=session for update;
 if s.id is null then raise exception 'Class session not found'; end if;
 perform 1 from public.lessons where class_session_id=session order by id for update;
 perform 1 from public.live_sessions where class_session_id=session order by id for update;
 select coalesce(array_agg(id),'{}'::uuid[]) into lesson_ids from public.lessons where class_session_id=session;
 select coalesce(array_agg(id),'{}'::uuid[]) into live_ids from public.live_sessions where class_session_id=session;
 -- Keep another session's live class; only detach its optional replay pointer.
 update public.live_sessions set recorded_lesson_id=null where recorded_lesson_id=any(lesson_ids);
 delete from public.notifications where class_session_id=session;
 delete from public.attendance_requests where session_id=session;
 delete from public.attendance_corrections where session_id=session;
 delete from public.attendance_frozen where session_id=session;
 delete from public.watch_sessions where lesson_id=any(lesson_ids);
 delete from public.watch_credit where lesson_id=any(lesson_ids);
 -- The existing watch-credit retention trigger fires above. Remove only this
 -- session's resulting snapshots as part of the explicitly authorized deletion.
 delete from public.retained_session_credit where class_session_id=session;
 delete from public.live_watch_sessions where live_id=any(live_ids);
 delete from public.live_credit where class_session_id=session;
 delete from public.class_comments where lesson_id=any(lesson_ids);
 delete from public.live_sessions where id=any(live_ids);
 delete from public.lessons where id=any(lesson_ids);
 delete from public.class_schedule where class_session_id=session;
 delete from public.class_sessions where id=session;
 insert into public.audit_logs(actor_id,action,details) values(auth.uid(),'academic.session.delete',jsonb_build_object('session',session,'title',s.title,'batch',s.batch_id,'lesson_ids',lesson_ids,'live_ids',live_ids));
end $$;
revoke all on function public.academy_delete_class_session(uuid) from public;
grant execute on function public.academy_delete_class_session(uuid) to authenticated;
notify pgrst,'reload schema';
