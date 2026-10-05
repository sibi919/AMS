-- Authorization lives in PostgreSQL; client role selections never grant access.
create type public.academy_role as enum ('student', 'staff', 'admin');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role public.academy_role not null,
 account_code text not null unique check (account_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
 full_name text not null check (length(full_name) between 1 and 120),
 phone text not null default '' check (length(phone) <= 30),
 address text not null default '' check (length(address) <= 1000),
 avatar_path text,
 course_label text not null default '' check (length(course_label) <= 160),
 assigned_staff_id uuid references public.profiles(id),
 can_create_students boolean not null default false,
 active boolean not null default true,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 check (role = 'staff' or not can_create_students),
 check (avatar_path is null or avatar_path = id::text || '/avatar')
);
create table public.audit_logs (
 id bigint generated always as identity primary key,
 actor_id uuid,
 subject_id uuid,
 action text not null,
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;
revoke all on public.profiles, public.audit_logs from anon, authenticated;
grant select on public.profiles, public.audit_logs to authenticated;
grant all on public.profiles, public.audit_logs to service_role;
grant usage, select on sequence public.audit_logs_id_seq to service_role;
grant update (full_name, phone, address, avatar_path) on public.profiles to authenticated;

create function public.current_academy_role() returns public.academy_role
language sql stable security definer set search_path = '' as $$
 select role from public.profiles where id = auth.uid() and active;
$$;
revoke all on function public.current_academy_role() from public;
grant execute on function public.current_academy_role() to authenticated;
create policy profile_read on public.profiles for select to authenticated using (
 public.current_academy_role() is not null and (
 id = auth.uid() or public.current_academy_role() = 'admin' or
 (public.current_academy_role() = 'staff' and role = 'student' and (assigned_staff_id = auth.uid() or created_by = auth.uid()))
 ));
create policy profile_self_edit on public.profiles for update to authenticated
 using (id = auth.uid() and active) with check (id = auth.uid() and active);
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.current_academy_role() = 'admin');

-- Executed within Auth's user creation transaction. Failure rolls back the Auth user too.
create function public.provision_academy_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
 m jsonb := new.raw_app_meta_data;
 actor public.profiles;
 target_role public.academy_role;
 creator uuid;
 assigned uuid;
begin
 target_role := (m->>'academy_role')::public.academy_role;
 if target_role is null then raise exception 'Academy provisioning required'; end if;
 creator := (m->>'created_by')::uuid;
 -- Serialize first-admin bootstrap and account creation permission changes.
 perform pg_advisory_xact_lock(9162026);
 if creator is null then
  if target_role <> 'admin' or exists(select 1 from public.profiles) then
   raise exception 'Initial admin bootstrap only';
  end if;
 else
  select * into actor from public.profiles where id = creator for share;
  if actor.id is null or not actor.active or not (
   actor.role = 'admin' or (actor.role = 'staff' and actor.can_create_students and target_role = 'student')
  ) then raise exception 'Account creation forbidden'; end if;
  if (select count(*) from public.audit_logs where actor_id = creator and action = 'account.created' and created_at > now() - interval '1 hour') >= 20 then
   raise exception 'Account creation limit reached';
  end if;
 end if;
 assigned := (m->>'assigned_staff_id')::uuid;
 if actor.role = 'staff' then assigned := actor.id; end if;
 if assigned is not null and not exists(select 1 from public.profiles where id = assigned and role = 'staff' and active) then
  raise exception 'Assigned staff must be active staff';
 end if;
 insert into public.profiles(id, role, account_code, full_name, course_label, assigned_staff_id, created_by)
 values(new.id, target_role, m->>'account_code', m->>'full_name', coalesce(m->>'course_label',''), assigned, creator);
 insert into public.audit_logs(actor_id, subject_id, action, details)
 values(creator, new.id, 'account.created', jsonb_build_object('role', target_role));
 return new;
end $$;
revoke all on function public.provision_academy_profile() from public;
create trigger academy_user_created after insert on auth.users for each row execute function public.provision_academy_profile();

create function public.admin_update_account(target_id uuid, is_active boolean, allow_student_creation boolean, staff_id uuid, course text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.profiles;
begin
 perform pg_advisory_xact_lock(9162026);
 if public.current_academy_role() is distinct from 'admin'::public.academy_role then raise exception 'Admin required'; end if;
 select * into target from public.profiles where id = target_id for update;
 if target.id is null then raise exception 'Account not found'; end if;
 if target.id = auth.uid() and not is_active then raise exception 'Cannot disable your own admin account'; end if;
 if target.role <> 'staff' and allow_student_creation then raise exception 'Staff permission only'; end if;
 if staff_id is not null and (target.role <> 'student' or not exists(select 1 from public.profiles where id = staff_id and role = 'staff' and active)) then raise exception 'Invalid staff assignment'; end if;
 update public.profiles set active = is_active, can_create_students = allow_student_creation,
 assigned_staff_id = staff_id, course_label = course where id = target_id;
 insert into public.audit_logs(actor_id,subject_id,action,details) values(auth.uid(),target_id,'account.updated',
 jsonb_build_object('active',is_active,'can_create_students',allow_student_creation,'assigned_staff_id',staff_id,'course_label',course));
end $$;
revoke all on function public.admin_update_account(uuid,boolean,boolean,uuid,text) from public;
grant execute on function public.admin_update_account(uuid,boolean,boolean,uuid,text) to authenticated;

-- Later attendance computation must invoke this on SERVER-validated progress only.
-- No watch events, attendance tables, or client write permissions are created yet.
create function public.attendance_eligibility(percentage numeric) returns text
language plpgsql immutable set search_path = '' as $$
begin
 if percentage is null or percentage < 0 or percentage > 100 or percentage = 'NaN'::numeric then raise exception 'Invalid percentage'; end if;
 if percentage < 75 then return 'academy_not_eligible'; end if;
 if percentage < 85 then return 'academy_eligible_exam_not_eligible'; end if;
 return 'academy_and_exam_eligible';
end $$;
revoke all on function public.attendance_eligibility(numeric) from public;
grant execute on function public.attendance_eligibility(numeric) to service_role;
