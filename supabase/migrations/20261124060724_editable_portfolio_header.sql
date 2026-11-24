-- Public homepage copy; only the existing protected admin role can edit it.
create table public.portfolio_settings (
 id text primary key check(id='homepage'),
 heading text not null check(length(btrim(heading)) between 1 and 200),
 subheading text not null default '' check(length(subheading)<=500),
 updated_at timestamptz not null default now()
);
alter table public.portfolio_settings enable row level security;
revoke all on public.portfolio_settings from anon,authenticated;
grant select on public.portfolio_settings to anon,authenticated;
grant update(heading,subheading) on public.portfolio_settings to authenticated;
create policy "portfolio settings public read" on public.portfolio_settings for select to anon,authenticated using(true);
create policy "portfolio settings admin update" on public.portfolio_settings for update to authenticated
 using((select auth.jwt()->'app_metadata'->>'role')='admin')
 with check((select auth.jwt()->'app_metadata'->>'role')='admin');
create trigger portfolio_settings_touch before update on public.portfolio_settings for each row execute function public.portfolio_touch_updated();
insert into public.portfolio_settings(id,heading,subheading) values
 ('homepage','Artistic Director. Photographer. Editor.',E'Photography by Nicholas Goodridge.\nBrisbane & wherever the story takes me.');
