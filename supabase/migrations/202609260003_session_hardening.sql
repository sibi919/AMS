-- Require a published official class before publishing new session-linked media.
create or replace function public.academy_manage_session(kind text,target uuid,batch uuid,title text,body text,video_id text,seconds integer,publish boolean,starts timestamptz,class_session uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if class_session is null then raise exception 'Choose a class session'; end if;
 if publish and not exists(select 1 from public.class_sessions s where s.id=class_session and s.batch_id=batch and s.published) then raise exception 'Publish the class session first'; end if;
 result:=public.academy_manage(kind,target,batch,title,body,video_id,seconds,publish,starts);
 perform public.academy_link_session(kind,result,class_session);
 return result;
end $$;
drop function if exists public.academy_retain_lesson_attendance();
notify pgrst,'reload schema';
