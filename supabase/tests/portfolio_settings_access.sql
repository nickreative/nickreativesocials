begin;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$begin
 if (select count(*) from public.portfolio_settings)<>1 then raise exception 'Public header read failed';end if;
 begin update public.portfolio_settings set heading='not allowed' where id='homepage';raise exception 'Anonymous update allowed';exception when insufficient_privilege then null;end;
end$$;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"client"},"user_metadata":{"role":"admin"}}',true);
do $$declare n integer;begin
 update public.portfolio_settings set heading='not allowed' where id='homepage';get diagnostics n=row_count;if n<>0 then raise exception 'Client changed heading';end if;
end$$;
select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$declare old_version timestamptz; n integer;begin
 select updated_at into old_version from public.portfolio_settings where id='homepage';
 update public.portfolio_settings set heading='A verified admin can edit the heading',subheading=E'A new subheading\nwith line breaks' where id='homepage' and updated_at=old_version;
 get diagnostics n=row_count;if n<>1 then raise exception 'Admin update failed';end if;
 update public.portfolio_settings set heading='Stale update' where id='homepage' and updated_at=old_version;
 get diagnostics n=row_count;if n<>0 then raise exception 'Stale update allowed';end if;
 begin update public.portfolio_settings set updated_at=now();raise exception 'Browser may edit server timestamp';exception when insufficient_privilege then null;end;
 begin delete from public.portfolio_settings;raise exception 'Settings deletion allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
