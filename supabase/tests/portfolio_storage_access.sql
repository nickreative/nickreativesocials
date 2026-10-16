-- Run after at least two photographs have been imported. All changes roll back.
begin;
select set_config('portfolio.test_path',(select storage_path from public.portfolio_images order by sort_order limit 1),true);
update public.portfolio_images set published=false where storage_path=current_setting('portfolio.test_path');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$begin
 if exists(select 1 from storage.objects where bucket_id='portfolio' and name=current_setting('portfolio.test_path')) then raise exception 'Hidden file exposed';end if;
 if not exists(select 1 from storage.objects where bucket_id='portfolio' and name<>current_setting('portfolio.test_path')) then raise exception 'Published files inaccessible';end if;
end$$;
reset role;
rollback;
