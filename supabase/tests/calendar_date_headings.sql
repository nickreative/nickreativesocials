begin;
create or replace function private.dispatch_calendar_notifications() returns void language plpgsql security definer set search_path='' as $$ begin return; end $$;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'role','authenticated','app_metadata',raw_app_meta_data)::text from auth.users where raw_app_meta_data->>'role'='client' and raw_app_meta_data->>'client'='livencommunities' limit 1),true);
set local role authenticated;
insert into public.calendar_ideas(id,client,idea_date,description,notes) values('00000000-0000-0000-0000-000000000021','livencommunities','2026-12-23','Drag test idea','Preserve these notes');
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'role','authenticated','app_metadata',raw_app_meta_data)::text from auth.users where raw_app_meta_data->>'role'='admin' limit 1),true);
set local role authenticated;
insert into public.calendar_date_headers(client,heading_date,heading) values('livencommunities','2099-12-25','Christmas test heading'),('pocky','2099-12-25','Other client heading');
update public.calendar_ideas set idea_date='2026-12-24',notify_clients=false where id='00000000-0000-0000-0000-000000000021';
reset role;
do $$ begin
 if not exists(select 1 from public.calendar_ideas where id='00000000-0000-0000-0000-000000000021' and idea_date='2026-12-24' and notes='Preserve these notes' and author_role='client') then raise exception 'Drag changed content or attribution';end if;
 if exists(select 1 from public.calendar_notifications where idea_id='00000000-0000-0000-0000-000000000021' and direction='client') then raise exception 'Drag sent client notification';end if;
end $$;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'role','authenticated','app_metadata',raw_app_meta_data,'user_metadata',jsonb_build_object('role','admin'))::text from auth.users where raw_app_meta_data->>'role'='client' and raw_app_meta_data->>'client'='livencommunities' limit 1),true);
set local role authenticated;
do $$ declare n integer;begin
 if not exists(select 1 from public.calendar_date_headers where client='livencommunities' and heading_date='2099-12-25') then raise exception 'Client cannot read own headings';end if;
 if exists(select 1 from public.calendar_date_headers where client='pocky') then raise exception 'Cross-client heading read allowed';end if;
 update public.calendar_date_headers set heading='Not allowed' where heading_date='2099-12-25';get diagnostics n=row_count;if n<>0 then raise exception 'Client heading edit allowed';end if;
 begin insert into public.calendar_date_headers(client,heading_date,heading) values('livencommunities','2099-12-24','Not allowed');raise exception 'Client heading insert allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: admin rescheduling preserves notes/author and sends no client email; only admins can write date headings; client-scoped heading reads and spoofed user metadata denial. No live data or emails persisted.' as result;
