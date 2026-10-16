-- Additive phase-one portfolio schema. Existing portal objects remain untouched.
create table public.portfolio_categories (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (length(btrim(name)) between 1 and 80),
 sort_order double precision not null default 0,
 created_at timestamptz not null default now()
);
create table public.portfolio_images (
 id uuid primary key default gen_random_uuid(),
 category_id uuid references public.portfolio_categories(id) on delete set null,
 storage_path text not null unique,
 thumbnail_path text not null unique,
 title text not null default '' check(length(title)<=200),
 alt_text text not null default '' check(length(alt_text)<=1000),
 width integer not null check(width>0), height integer not null check(height>0),
 sort_order double precision not null default 0,
 published boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint published_alt_text check(not published or length(btrim(alt_text))>0),
 constraint portfolio_full_path check(storage_path = id::text || '/full.webp'),
 constraint portfolio_thumbnail_path check(thumbnail_path = id::text || '/preview.webp')
);
create index portfolio_public_order on public.portfolio_images(sort_order,id) where published;
create index portfolio_category_order on public.portfolio_images(category_id,sort_order,id);
alter table public.portfolio_categories enable row level security;
alter table public.portfolio_images enable row level security;
grant select on public.portfolio_categories,public.portfolio_images to anon,authenticated;
grant insert,update,delete on public.portfolio_categories,public.portfolio_images to authenticated;
create policy "portfolio categories read" on public.portfolio_categories for select to anon,authenticated using(true);
create policy "portfolio categories admin" on public.portfolio_categories for all to authenticated using ((select auth.jwt()->'app_metadata'->>'role')='admin') with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "portfolio published read" on public.portfolio_images for select to anon,authenticated using(published);
create policy "portfolio images admin" on public.portfolio_images for all to authenticated using ((select auth.jwt()->'app_metadata'->>'role')='admin') with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
create function public.portfolio_touch_updated() returns trigger language plpgsql security invoker set search_path='' as $$begin new.updated_at=clock_timestamp();return new;end$$;
create trigger portfolio_touch before update on public.portfolio_images for each row execute function public.portfolio_touch_updated();
create function public.reorder_portfolio(ordered_ids uuid[]) returns void language plpgsql security invoker set search_path='' as $$
begin
 if (select auth.jwt()->'app_metadata'->>'role') is distinct from 'admin' then raise exception 'Admin access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(75843019);
 if cardinality(ordered_ids)<>(select count(*) from public.portfolio_images) or cardinality(ordered_ids)<>(select count(distinct x) from unnest(ordered_ids) x) or exists(select 1 from unnest(ordered_ids) x where not exists(select 1 from public.portfolio_images i where i.id=x)) then raise exception 'Portfolio changed. Refresh and reorder again.';end if;
 update public.portfolio_images i set sort_order=ordering.position from unnest(ordered_ids) with ordinality ordering(id,position) where i.id=ordering.id;
end$$;
revoke all on function public.reorder_portfolio(uuid[]) from public,anon;
grant execute on function public.reorder_portfolio(uuid[]) to authenticated;
insert into public.portfolio_categories(name,sort_order) values ('Commercial',0),('Fashion',1),('Hotels',2),('Food',3);
insert into storage.buckets(id,name,public,allowed_mime_types) values ('portfolio','portfolio',false,array['image/webp']);
create policy "portfolio storage read" on storage.objects for select to anon,authenticated using (bucket_id='portfolio' and exists(select 1 from public.portfolio_images i where (i.storage_path=name or i.thumbnail_path=name) and i.published));
create policy "portfolio storage admin" on storage.objects for all to authenticated using(bucket_id='portfolio' and (select auth.jwt()->'app_metadata'->>'role')='admin') with check(bucket_id='portfolio' and (select auth.jwt()->'app_metadata'->>'role')='admin');
