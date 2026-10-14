create table public.feedback_receipts (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null,
 client text not null,
 slot integer not null,
 platform text,
 caption text,
 thumbnail_url text,
 media_urls text[],
 feedback text not null,
 reviewer_id uuid not null,
 reviewer_name text not null,
 recipient_email text not null,
 submitted_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0,
 created_at timestamptz not null default now(),
 last_attempt_at timestamptz,
 sent_at timestamptz,
 last_error text,
 unique(post_id,reviewer_id,submitted_at)
);
alter table public.feedback_receipts enable row level security;
revoke all on public.feedback_receipts from anon,authenticated;
grant all on public.feedback_receipts to service_role;
create policy "service manages feedback receipts" on public.feedback_receipts for all to service_role using (true) with check(true);
create index feedback_receipts_pending on public.feedback_receipts(created_at) where status<>'sent';
create or replace function private.dispatch_feedback_receipts() returns void language plpgsql security definer set search_path='' as $$
declare secret text; item record;
begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='calendar_webhook_secret';
 if coalesce(secret,'')='' then raise exception 'Receipt webhook authentication unavailable'; end if;
 for item in select id from public.feedback_receipts where (status in ('pending','failed') and attempts<5 and (last_attempt_at is null or last_attempt_at<now()-interval '5 minutes')) or (status='sending' and attempts<5 and last_attempt_at<now()-interval '10 minutes') order by created_at limit 25 loop
  perform net.http_post(url:='https://tgvtmwdmwnzwqjzqxbkj.supabase.co/functions/v1/feedback-receipt-email',headers:=jsonb_build_object('Content-Type','application/json','x-webhook-secret',secret),body:=jsonb_build_object('notification_id',item.id),timeout_milliseconds:=10000);
 end loop;
end $$;
revoke all on function private.dispatch_feedback_receipts() from public,anon,authenticated;
create or replace function private.enqueue_feedback_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare actor auth.users;
begin
 if auth.uid() is null or new.review_status is distinct from 'changes_requested' or coalesce(btrim(new.review_feedback),'')='' or new.reviewed_at is not distinct from old.reviewed_at then return new; end if;
 select * into actor from auth.users where id=auth.uid();
 if actor.raw_app_meta_data->>'role' is distinct from 'client' or actor.raw_app_meta_data->>'client' is distinct from new.client or new.reviewed_by is distinct from actor.id then return new; end if;
 insert into public.feedback_receipts(post_id,client,slot,platform,caption,thumbnail_url,media_urls,feedback,reviewer_id,reviewer_name,recipient_email,submitted_at)
 values(new.id,new.client,new.slot,new.platform,new.caption,new.thumbnail_url,new.media_urls,new.review_feedback,actor.id,coalesce(nullif(actor.raw_user_meta_data->>'name',''),initcap(replace(split_part(actor.email,'@',1),'.',' '))),actor.email,new.reviewed_at)
 on conflict(post_id,reviewer_id,submitted_at) do nothing;
 perform private.dispatch_feedback_receipts();
 return new;
end $$;
revoke all on function private.enqueue_feedback_receipt() from public,anon,authenticated;
create trigger feedback_receipt_notifications after update on public.posts for each row execute function private.enqueue_feedback_receipt();
select cron.schedule('feedback-receipt-retry','*/5 * * * *','select private.dispatch_feedback_receipts()');
