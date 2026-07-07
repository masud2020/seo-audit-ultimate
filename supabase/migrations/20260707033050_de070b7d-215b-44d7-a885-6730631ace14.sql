
-- Auto-grant admin role to whitelisted emails on signup (and on email verification)
create or replace function public.grant_admin_for_whitelisted_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null
     and lower(new.email) in ('timnub@gmail.com','masud2mkt@gmail.com') then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin'::app_role)
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_grant_admin on auth.users;
create trigger on_auth_user_created_grant_admin
after insert on auth.users
for each row execute function public.grant_admin_for_whitelisted_email();

drop trigger if exists on_auth_user_updated_grant_admin on auth.users;
create trigger on_auth_user_updated_grant_admin
after update of email, email_confirmed_at on auth.users
for each row execute function public.grant_admin_for_whitelisted_email();
