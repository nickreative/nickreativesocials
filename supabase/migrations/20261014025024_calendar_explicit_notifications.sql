create or replace function private.enqueue_calendar_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare actor_role text; actor_label text; changed boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select raw_app_meta_data->>'role',coalesce(nullif(raw_user_meta_data->>'name',''),email,'Portal user') into actor_role,actor_label from auth.users where id=auth.uid();
 if new.archived_at is not null then return new; end if;
 changed:=tg_op='INSERT';
 if tg_op='UPDATE' then changed := (new.idea_date,new.description,new.notes) is distinct from (old.idea_date,old.description,old.notes) or (actor_role='admin' and new.notify_clients ); end if;
 if changed and (actor_role='client' or (actor_role='admin' and new.notify_clients)) then
  insert into public.calendar_notifications(idea_id,client,direction,event_type,idea_date,description,notes,author_label,actor_id)
  values(new.id,new.client,case when actor_role='client' then 'admin' else 'client' end,tg_op,new.idea_date,new.description,new.notes,actor_label,auth.uid());
  perform private.dispatch_calendar_notifications();
 end if;
 return new;
end $$;
