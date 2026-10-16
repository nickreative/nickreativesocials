begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81ccec1a-2ce3-43c1-abfe-abf51a756bc7","role":"authenticated","app_metadata":{"role":"admin"}}',true);
insert into public.portfolio_images(id,storage_path,thumbnail_path,width,height,alt_text,published) values
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001/full.webp','00000000-0000-4000-8000-000000000001/preview.webp',100,200,'RLS test photograph',true),
('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002/full.webp','00000000-0000-4000-8000-000000000002/preview.webp',200,100,'Hidden RLS test',false);
do $$begin if (select count(*) from public.portfolio_images where id::text like '00000000-%')<>2 then raise exception 'Admin cannot read drafts';end if;end$$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$begin
 if (select count(*) from public.portfolio_images where id::text like '00000000-%')<>1 then raise exception 'Anonymous draft exposure';end if;
 if (select count(*) from public.portfolio_categories)<4 then raise exception 'Categories inaccessible';end if;
 begin insert into public.portfolio_categories(name) values('UNAUTHORIZED');raise exception 'Anonymous insert allowed';exception when insufficient_privilege then null;end;
 begin perform public.reorder_portfolio(array[]::uuid[]);raise exception 'Anonymous reorder allowed';exception when insufficient_privilege then null;end;
end$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b60903be-23db-43fb-ac86-e74d062bc0be","role":"authenticated","app_metadata":{"role":"client","client":"livencommunities"},"user_metadata":{"role":"admin"}}',true);
do $$declare n integer;begin
 if (select count(*) from public.portfolio_images where id::text like '00000000-%')<>1 then raise exception 'Client draft exposure';end if;
 begin insert into public.portfolio_categories(name) values('UNAUTHORIZED');raise exception 'Client insert allowed';exception when insufficient_privilege then null;end;
 update public.portfolio_images set published=true where id='00000000-0000-4000-8000-000000000002';get diagnostics n=row_count;if n<>0 then raise exception 'Client publishing allowed';end if;
 begin perform public.reorder_portfolio(array[]::uuid[]);raise exception 'Client reorder allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
