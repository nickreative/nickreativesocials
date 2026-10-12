begin;
alter table public.posts disable trigger post_review_notifications;
select set_config('storage.allow_delete_query','true',true);
select set_config('request.jwt.claims', (select jsonb_build_object('sub',id,'role','authenticated','app_metadata',raw_app_meta_data,'user_metadata',jsonb_build_object('role','admin','client','vicalates'))::text from auth.users where raw_app_meta_data->>'role'='client' and raw_app_meta_data->>'client'='livencommunities' limit 1),true);
set local role authenticated;
do $$
declare p uuid; n integer;
begin
 if exists(select 1 from public.posts where client <> 'livencommunities') then raise exception 'Cross-client read allowed'; end if;
 select id into p from public.posts where client='livencommunities' limit 1;
 if p is null then raise exception 'Own posts not visible'; end if;
 update public.posts set review_status='approved', review_feedback=null, reviewed_by='00000000-0000-0000-0000-000000000000' where id=p;
 if exists(select 1 from public.posts where id=p and reviewed_by <> auth.uid()) then raise exception 'Reviewer spoofing allowed'; end if;
 begin update public.posts set caption='unauthorized' where id=p; raise exception 'Content edit allowed'; exception when insufficient_privilege then null; end;
 begin update public.posts set client='vicalates' where id=p; raise exception 'Reassignment allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.posts(client,slot) values('livencommunities',1); raise exception 'Client insert allowed'; exception when insufficient_privilege then null; end;
 delete from public.posts where id=p; get diagnostics n=row_count;
 if n <> 0 then raise exception 'Client delete allowed'; end if;
 begin insert into storage.objects(bucket_id,name) values('social-media','security-test-client'); raise exception 'Client upload allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'role','authenticated','app_metadata',raw_app_meta_data)::text from auth.users where raw_app_meta_data->>'role'='admin' limit 1),true);
set local role authenticated;
do $$
declare p uuid; n integer;
begin
 select id into p from public.posts limit 1;
 update public.posts set caption=caption where id=p; get diagnostics n=row_count;
 if n <> 1 then raise exception 'Admin update denied'; end if;
 insert into public.posts(client,slot) values('security-test',1);
 delete from public.posts where client='security-test';
 insert into storage.objects(bucket_id,name) values('social-media','security-test-admin');
 delete from storage.objects where bucket_id='social-media' and name='security-test-admin';
 get diagnostics n=row_count;
 if n <> 1 then raise exception 'Admin storage delete denied'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
 begin perform id from public.posts limit 1; raise exception 'Anonymous read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: client isolation, metadata spoofing, review stamping, content/ownership/insert/delete/upload denial, admin content/storage, anonymous denial. All writes rolled back; notification trigger disabled only within rolled-back transaction.' as result;