alter table public.posts add column if not exists facebook_mirror_primary boolean not null default false;
