-- Safe recorded-lesson lifecycle. Explicit admin deletion removes dependent
-- attendance/comments in one transaction and leaves no orphaned records.
create or replace function public.academy_delete_lesson(lesson uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_academy_role() is distinct from 'admin'::public.academy_role then
    raise exception 'Admin required';
  end if;
  if not exists (select 1 from public.lessons where id = lesson) then
    raise exception 'Lesson not found';
  end if;
  update public.live_sessions set recorded_lesson_id = null where recorded_lesson_id = lesson;
  delete from public.watch_sessions where lesson_id = lesson;
  delete from public.watch_credit where lesson_id = lesson;
  delete from public.class_comments where lesson_id = lesson;
  delete from public.lessons where id = lesson;
  insert into public.audit_logs(actor_id, action, details)
  values (auth.uid(), 'academic.lesson.delete', jsonb_build_object('id', lesson));
end;
$$;
revoke all on function public.academy_delete_lesson(uuid) from public;
grant execute on function public.academy_delete_lesson(uuid) to authenticated;
