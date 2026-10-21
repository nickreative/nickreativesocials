begin;
insert into public.story_highlights(client,slug,title,cover_url) values ('pocky','access-test','Test','/test.png');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"client","client":"livencommunities"}}',true);
do $$ declare n integer; begin
 select count(*) into n from public.story_highlights;
 if n <> 4 then raise exception 'Client should see only four Liven highlights, saw %',n; end if;
 update public.story_highlights set title='Forbidden',revision=revision+1;
 get diagnostics n = row_count;
 if n <> 0 then raise exception 'Client must not edit highlights'; end if;
 begin
   insert into public.story_highlights(client,slug,title,cover_url) values('livencommunities','forbidden','Forbidden','/test.png');
   raise exception 'Client insert unexpectedly allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"client","client":"vicalates"}}',true);
do $$ begin if exists(select 1 from public.story_highlights) then raise exception 'Cross-client access'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ declare n integer; begin
 update public.story_highlights set title='Test save',revision=1,media='[{"id":"test","kind":"image","url":"/test.png"}]' where client='livencommunities' and slug='beach-road' and revision=0;
 get diagnostics n = row_count;
 if n <> 1 then raise exception 'Admin save failed'; end if;
 update public.story_highlights set title='Stale save',revision=1 where client='livencommunities' and slug='beach-road' and revision=0;
 get diagnostics n = row_count;
 if n <> 0 then raise exception 'Stale save allowed'; end if;
end $$;
reset role;
do $$ begin if has_table_privilege('anon','public.story_highlights','select') then raise exception 'Anonymous table access'; end if; end $$;
rollback;
