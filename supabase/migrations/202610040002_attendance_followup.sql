-- Class-type evidence for legacy linked media; no duration/history inference.
update public.class_sessions s set class_type=case when exists(select 1 from public.lessons l where l.class_session_id=s.id) then 'Mixed' else 'Live' end where exists(select 1 from public.live_sessions l where l.class_session_id=s.id);
-- Archived teaching content is hidden; historical reports remain available via the scoped RPC.
drop policy session_read on public.class_sessions;
create policy session_read on public.class_sessions for select to authenticated using(public.academy_can_teach(batch_id) or published and not archived and public.academy_is_enrolled(batch_id));
-- Every new enrollment receives the already-finalized outcome, never live recomputation.
create function public.attendance_enrollment_freeze() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.attendance_frozen(session_id,student_id,status,verified_seconds,source,updated_at)
 select s.id,new.student_id,'Not Started',0,'Auto',clock_timestamp() from public.class_sessions s where s.batch_id=new.batch_id and s.locked_at is not null
 on conflict(session_id,student_id) do nothing;
 return new;
end $$;
create trigger attendance_enrollment_freeze after insert on public.enrollments for each row execute function public.attendance_enrollment_freeze();
revoke all on function public.attendance_enrollment_freeze() from public;
notify pgrst,'reload schema';
-- Save official duration and class type atomically.
create function public.academy_session_save_typed(target uuid,batch uuid,title text,seconds integer,starts timestamptz,publish boolean,is_required boolean,kind text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 result:=public.academy_session_save(target,batch,title,seconds,starts,publish,is_required);
 perform public.academy_session_type(result,kind);
 return result;
end $$;
revoke all on function public.academy_session_save_typed(uuid,uuid,text,integer,timestamptz,boolean,boolean,text) from public;
grant execute on function public.academy_session_save_typed(uuid,uuid,text,integer,timestamptz,boolean,boolean,text) to authenticated;
