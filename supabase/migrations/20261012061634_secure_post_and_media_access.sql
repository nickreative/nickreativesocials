create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
drop policy if exists "Clients can review their own posts" on public.posts;
drop policy if exists "admin can write posts" on public.posts;
drop policy if exists "clients read own posts" on public.posts;
alter table public.posts enable row level security;
revoke all on public.posts from anon;
create policy "admins manage posts" on public.posts for all to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'admin')
with check ((select auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "clients read assigned posts" on public.posts for select to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'client' and client = (select auth.jwt()->'app_metadata'->>'client'));
create policy "clients review assigned posts" on public.posts for update to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'client' and client = (select auth.jwt()->'app_metadata'->>'client'))
with check ((select auth.jwt()->'app_metadata'->>'role') = 'client' and client = (select auth.jwt()->'app_metadata'->>'client'));
create or replace function private.guard_post_review() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('postgres','service_role') or auth.jwt()->'app_metadata'->>'role' = 'admin' then return new; end if;
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'client' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['review_status','review_feedback','reviewed_at','reviewed_by'])
       is distinct from (to_jsonb(old) - array['review_status','review_feedback','reviewed_at','reviewed_by']) then
    raise exception 'Clients may only change review fields' using errcode = '42501';
  end if;
  if new.review_status is null or new.review_status not in ('approved','changes_requested') then
    raise exception 'Invalid review status' using errcode = '23514';
  end if;
  new.reviewed_by := auth.uid();
  new.reviewed_at := now();
  return new;
end $$;
revoke all on function private.guard_post_review() from public, anon, authenticated;
create trigger guard_post_review before update on public.posts for each row execute function private.guard_post_review();
drop policy if exists "allow authenticated updates" on storage.objects;
drop policy if exists "allow authenticated uploads" on storage.objects;
drop policy if exists "public read access" on storage.objects;
create policy "social media read" on storage.objects for select to anon, authenticated using (bucket_id = 'social-media');
create policy "admins upload social media" on storage.objects for insert to authenticated
with check (bucket_id = 'social-media' and (select auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "admins update social media" on storage.objects for update to authenticated
using (bucket_id = 'social-media' and (select auth.jwt()->'app_metadata'->>'role') = 'admin')
with check (bucket_id = 'social-media' and (select auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "admins delete social media" on storage.objects for delete to authenticated
using (bucket_id = 'social-media' and (select auth.jwt()->'app_metadata'->>'role') = 'admin');