create extension if not exists pg_cron with schema pg_catalog;
create table public.calendar_ideas (
 id uuid primary key default gen_random_uuid(),
 client text not null check (length(client) between 1 and 100),
 idea_date date not null,
 description text not null check (length(btrim(description)) between 1 and 300),
 notes text not null default '' check (length(notes)<=5000),
 created_by uuid not null references auth.users(id),
 author_label text not null,
 author_role text not null check (author_role in ('admin','client')),
 notify_clients boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz
);
create index calendar_client_date on public.calendar_ideas(client,idea_date) where archived_at is null;
alter table public.calendar_ideas enable row level security;
revoke all on public.calendar_ideas from anon,authenticated;
grant select,insert,update on public.calendar_ideas to authenticated;
grant all on public.calendar_ideas to service_role;
create policy "admin calendar access" on public.calendar_ideas for all to authenticated
using ((select auth.jwt()->'app_metadata'->>'role')='admin')
with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "client calendar read" on public.calendar_ideas for select to authenticated
using ((select auth.jwt()->'app_metadata'->>'role')='client' and client=(select auth.jwt()->'app_metadata'->>'client'));
create policy "client calendar insert" on public.calendar_ideas for insert to authenticated
with check ((select auth.jwt()->'app_metadata'->>'role')='client' and client=(select auth.jwt()->'app_metadata'->>'client') and created_by=(select auth.uid()));
create policy "client own calendar update" on public.calendar_ideas for update to authenticated
using ((select auth.jwt()->'app_metadata'->>'role')='client' and client=(select auth.jwt()->'app_metadata'->>'client') and created_by=(select auth.uid()))
with check ((select auth.jwt()->'app_metadata'->>'role')='client' and client=(select auth.jwt()->'app_metadata'->>'client') and created_by=(select auth.uid()));

create table public.calendar_notifications (
 id uuid primary key default gen_random_uuid(),
 idea_id uuid not null references public.calendar_ideas(id),
 client text not null,
 direction text not null check (direction in ('admin','client')),
 event_type text not null,
 idea_date date not null,
 description text not null,
 notes text not null,
 author_label text not null,
 actor_id uuid not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0,
 created_at timestamptz not null default now(),
 last_attempt_at timestamptz,
 sent_at timestamptz,
 last_error text
);
alter table public.calendar_notifications enable row level security;
revoke all on public.calendar_notifications from anon,authenticated;
grant all on public.calendar_notifications to service_role;
create index calendar_notification_pending on public.calendar_notifications(created_at) where status <> 'sent';

create or replace function private.guard_calendar_idea() returns trigger language plpgsql security definer set search_path='' as $$
declare actor auth.users; actor_role text;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into actor from auth.users where id=auth.uid();
 actor_role := actor.raw_app_meta_data->>'role';
 if coalesce(actor_role,'') not in ('admin','client') then raise exception 'Calendar access denied' using errcode='42501'; end if;
 if actor_role='client' and new.client is distinct from actor.raw_app_meta_data->>'client' then raise exception 'Client access denied' using errcode='42501'; end if;
 if tg_op='INSERT' then
  new.created_by:=actor.id;
  new.author_label:=coalesce(nullif(actor.raw_user_meta_data->>'name',''),actor.email,'Portal user');
  new.author_role:=actor_role;
  new.created_at:=now();
  new.archived_at:=null;
 else
  if (new.client,new.created_by,new.author_label,new.author_role,new.created_at) is distinct from (old.client,old.created_by,old.author_label,old.author_role,old.created_at) then raise exception 'Idea attribution cannot be changed' using errcode='42501'; end if;
  if actor_role='client' and old.created_by <> actor.id then raise exception 'Only your own ideas can be edited' using errcode='42501'; end if;
 end if;
 if actor_role='client' then new.notify_clients:=false; end if;
 new.description:=btrim(new.description);new.updated_at:=now();
 return new;
end $$;
revoke all on function private.guard_calendar_idea() from public,anon,authenticated;
create trigger guard_calendar_idea before insert or update on public.calendar_ideas for each row execute function private.guard_calendar_idea();

-- Reuse the existing notification secret inside Vault without exposing it in migration text.
do $$
declare headers jsonb; secret text;
begin
 if not exists(select 1 from vault.secrets where name='calendar_webhook_secret') then
  select (string_to_array(encode(tgargs,'escape'),E'\\000'))[3]::jsonb into headers from pg_trigger where tgrelid='public.posts'::regclass and tgname='post_review_notifications';
  secret:=headers->>'x-webhook-secret';
  if coalesce(secret,'')='' then raise exception 'Existing email webhook secret is missing'; end if;
  perform vault.create_secret(secret,'calendar_webhook_secret','Calendar notification authentication');
 end if;
end $$;
create or replace function private.dispatch_calendar_notifications() returns void language plpgsql security definer set search_path='' as $$
declare secret text; item record;
begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='calendar_webhook_secret';
 if coalesce(secret,'')='' then raise exception 'Calendar webhook authentication unavailable'; end if;
 for item in select id from public.calendar_notifications where (status in ('pending','failed') and attempts<5 and (last_attempt_at is null or last_attempt_at<now()-interval '5 minutes')) or (status='sending' and attempts<5 and last_attempt_at<now()-interval '10 minutes') order by created_at limit 25 loop
  perform net.http_post(url:='https://tgvtmwdmwnzwqjzqxbkj.supabase.co/functions/v1/calendar-idea-email',headers:=jsonb_build_object('Content-Type','application/json','x-webhook-secret',secret),body:=jsonb_build_object('notification_id',item.id),timeout_milliseconds:=10000);
 end loop;
end $$;
revoke all on function private.dispatch_calendar_notifications() from public,anon,authenticated;
create or replace function private.enqueue_calendar_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare actor_role text; actor_label text; changed boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select raw_app_meta_data->>'role',coalesce(nullif(raw_user_meta_data->>'name',''),email,'Portal user') into actor_role,actor_label from auth.users where id=auth.uid();
 if new.archived_at is not null then return new; end if;
 changed:=tg_op='INSERT';
 if tg_op='UPDATE' then changed := (new.idea_date,new.description,new.notes) is distinct from (old.idea_date,old.description,old.notes) or (actor_role='admin' and new.notify_clients and not old.notify_clients); end if;
 if changed and (actor_role='client' or (actor_role='admin' and new.notify_clients)) then
  insert into public.calendar_notifications(idea_id,client,direction,event_type,idea_date,description,notes,author_label,actor_id)
  values(new.id,new.client,case when actor_role='client' then 'admin' else 'client' end,tg_op,new.idea_date,new.description,new.notes,actor_label,auth.uid());
  perform private.dispatch_calendar_notifications();
 end if;
 return new;
end $$;
revoke all on function private.enqueue_calendar_notification() from public,anon,authenticated;
create trigger calendar_idea_notifications after insert or update on public.calendar_ideas for each row execute function private.enqueue_calendar_notification();
select cron.schedule('calendar-email-retry','*/5 * * * *','select private.dispatch_calendar_notifications()');
