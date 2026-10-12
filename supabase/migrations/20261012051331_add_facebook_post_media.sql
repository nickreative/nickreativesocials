alter table public.posts add column if not exists facebook_media_urls text[];
comment on column public.posts.facebook_media_urls is 'Optional ordered Facebook stills. NULL reuses primary media photos; approval remains on the parent post.';
