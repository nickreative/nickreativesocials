create table public.story_highlights (
  id uuid primary key default gen_random_uuid(),
  client text not null,
  slug text not null,
  title text not null check (char_length(btrim(title)) between 1 and 15),
  cover_url text not null,
  position integer not null default 0,
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 100),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  unique(client, slug)
);
create index story_highlights_client_position on public.story_highlights(client, position);
alter table public.story_highlights enable row level security;
revoke all on public.story_highlights from anon;
grant select, insert, update, delete on public.story_highlights to authenticated;
create policy "admins manage highlights" on public.story_highlights for all to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'admin')
with check ((select auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "clients read assigned highlights" on public.story_highlights for select to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'client' and client = (select auth.jwt()->'app_metadata'->>'client'));
create or replace function private.guard_highlight_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.revision <> old.revision + 1 then
    raise exception 'Reload the highlight before saving changes' using errcode = '40001';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.guard_highlight_revision() from public, anon, authenticated;
create trigger guard_highlight_revision before update on public.story_highlights for each row execute function private.guard_highlight_revision();
insert into public.story_highlights(client, slug, title, cover_url, position) values
('livencommunities','beach-road','Beach Road','/assets/images/highlights/beach-road.png',0),
('livencommunities','carabella','Carabella','/assets/images/highlights/carabella.png',1),
('livencommunities','coastline','Coastline','/assets/images/highlights/coastline.png',2),
('livencommunities','willow-rise','Willow Rise','/assets/images/highlights/willow-rise.png',3);
