create table public.calendar_date_headers(
 client text not null,
 heading_date date not null,
 heading text not null check(length(heading)<=160),
 created_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(client,heading_date)
);
alter table public.calendar_date_headers enable row level security;
revoke all on public.calendar_date_headers from anon,authenticated;
grant select,insert,update on public.calendar_date_headers to authenticated;
grant all on public.calendar_date_headers to service_role;
create policy "admin date headings" on public.calendar_date_headers for all to authenticated
using((select auth.jwt()->'app_metadata'->>'role')='admin') with check((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "client date headings" on public.calendar_date_headers for select to authenticated
using((select auth.jwt()->'app_metadata'->>'role')='client' and client=(select auth.jwt()->'app_metadata'->>'client'));
create or replace function private.guard_calendar_date_header() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'role'='admin') then raise exception 'Only admins can manage date headings' using errcode='42501';end if;
 if tg_op='INSERT' then new.created_by:=auth.uid();
 elsif (new.client,new.heading_date,new.created_by) is distinct from(old.client,old.heading_date,old.created_by) then raise exception 'Date heading ownership cannot change' using errcode='42501';end if;
 new.heading:=btrim(new.heading);new.updated_at:=now();return new;
end $$;
revoke all on function private.guard_calendar_date_header() from public,anon,authenticated;
create trigger guard_calendar_date_header before insert or update on public.calendar_date_headers for each row execute function private.guard_calendar_date_header();
