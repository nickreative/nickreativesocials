begin;
-- No email requests leave this rolled-back transaction.
create or replace function private.dispatch_calendar_notifications() returns void language plpgsql security definer set search_path='' as $$ begin return; end $$;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'role','authenticated','app_metadata',raw_app_meta_data)::text from auth.users where raw_app_meta_data->>'role'='admin' limit 1),true);
set local role authenticated;
insert into public.calendar_ideas(id,client,idea_date,description,notify_clients) values('00000000-0000-0000-0000-000000000001','livencommunities','2026-10-14','Silent studio idea',false);
insert into public.calendar_ideas(id,client,idea_date,description,notify_clients) values('00000000-0000-0000-0000-000000000002','livencommunities','2026-10-15','Notify client idea',true);
reset role;
do $$ begin
 if exists(select 1 from public.calendar_notifications where idea_id='00000000-0000-0000-0000-000000000001') then raise exception 'Silent admin idea created email'; end if;
 if not exists(select 1 from public.calendar_notifications where idea_id='00000000-0000-0000-0000-000000000002' and direction='client') then raise exception 'Opt-in email missing'; end if;
end $$;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'role','authenticated','app_metadata',raw_app_meta_data,'user_metadata',jsonb_build_object('role','admin','client','pocky'))::text from auth.users where raw_app_meta_data->>'role'='client' and raw_app_meta_data->>'client'='livencommunities' order by created_at limit 1),true);
set local role authenticated;
insert into public.calendar_ideas(id,client,idea_date,description,created_by,author_label,author_role,notify_clients) values('00000000-0000-0000-0000-000000000003','livencommunities','2026-10-16','Client idea','00000000-0000-0000-0000-000000000000','Spoofed','admin',true);
do $$ declare n integer; begin
 if exists(select 1 from public.calendar_ideas where client<>'livencommunities') then raise exception 'Cross-client calendar read allowed'; end if;
 if exists(select 1 from public.calendar_ideas where id='00000000-0000-0000-0000-000000000003' and (created_by<>auth.uid() or author_role<>'client' or notify_clients)) then raise exception 'Author spoofing allowed'; end if;
 update public.calendar_ideas set notes='Pending photos' where id='00000000-0000-0000-0000-000000000003';
 update public.calendar_ideas set notes='Not allowed' where id='00000000-0000-0000-0000-000000000001';get diagnostics n=row_count;if n<>0 then raise exception 'Client edited studio idea'; end if;
 begin insert into public.calendar_ideas(client,idea_date,description) values('pocky','2026-10-16','Cross-client');raise exception 'Cross-client insert allowed';exception when insufficient_privilege then null;end;
 begin update public.calendar_ideas set created_by='00000000-0000-0000-0000-000000000000' where id='00000000-0000-0000-0000-000000000003';raise exception 'Attribution change allowed';exception when insufficient_privilege then null;end;
 begin perform id from public.calendar_notifications;raise exception 'Client notification queue access allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin if (select count(*) from public.calendar_notifications where idea_id='00000000-0000-0000-0000-000000000003' and direction='admin')<>2 then raise exception 'Mandatory new/update client emails missing';end if;end $$;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'role','authenticated','app_metadata',raw_app_meta_data)::text from auth.users where raw_app_meta_data->>'role'='client' and raw_app_meta_data->>'client'='livencommunities' order by created_at desc limit 1),true);
set local role authenticated;
do $$ declare n integer;begin update public.calendar_ideas set notes='Other user overwrite' where id='00000000-0000-0000-0000-000000000003';get diagnostics n=row_count;if n<>0 then raise exception 'Client edited colleague idea';end if;end $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin begin perform id from public.calendar_ideas;raise exception 'Anonymous calendar access allowed';exception when insufficient_privilege then null;end;end $$;
reset role;
rollback;
select 'PASS: calendar isolation, credited authors, own edits, studio/colleague protection, mandatory client notifications, optional admin notifications, private notification queue and anonymous denial. All test data rolled back.' as result;
