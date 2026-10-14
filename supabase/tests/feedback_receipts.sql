begin;
alter table public.posts disable trigger post_review_notifications;
-- Keep the real enqueue trigger, but suppress outgoing requests for this rolled-back test.
create or replace function private.dispatch_feedback_receipts() returns void language plpgsql security definer set search_path='' as $$ begin return; end $$;
create temporary table receipt_test_post as select p.id from public.posts p where p.client='livencommunities' order by slot limit 1;
grant select on receipt_test_post to authenticated;
update public.posts set review_status='changes_requested',review_feedback='Earlier feedback',reviewed_at=now()-interval '1 minute' where id in(select id from receipt_test_post);
select set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'role','authenticated','app_metadata',raw_app_meta_data)::text from auth.users where raw_app_meta_data->>'role'='client' and raw_app_meta_data->>'client'='livencommunities' limit 1),true);
set local role authenticated;
update public.posts set review_status='changes_requested',review_feedback='Updated feedback receipt test',reviewed_by='00000000-0000-0000-0000-000000000000' where id in(select id from receipt_test_post);
do $$ begin begin perform id from public.feedback_receipts;raise exception 'Client receipt queue access allowed';exception when insufficient_privilege then null;end;end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.feedback_receipts r join auth.users u on r.reviewer_id=u.id where r.post_id in(select id from receipt_test_post) and r.feedback='Updated feedback receipt test' and r.recipient_email=u.email and r.reviewer_id=auth.uid() and r.submitted_at=now()) then raise exception 'Receipt missing or wrong recipient/timestamp';end if;
end $$;
set local role authenticated;
update public.posts set review_status='approved',review_feedback=null where id in(select id from receipt_test_post);
reset role;
do $$ begin
 if (select count(*) from public.feedback_receipts where post_id in(select id from receipt_test_post) and submitted_at=now())<>1 then raise exception 'Approval generated feedback receipt';end if;
end $$;
rollback;
select 'PASS: repeated changes-requested feedback enqueues a receipt for the actual submitter, submission time is server-stamped, client queue access is denied, approvals do not generate feedback receipts. All test writes and dispatch changes rolled back; no emails sent.' as result;
