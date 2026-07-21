create function public.current_user_role()
returns text
language sql
stable
set search_path = ''
as $$
  select auth.jwt() -> 'app_metadata' ->> 'role'
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

alter table public.units enable row level security;
alter table public.bank_stock enable row level security;
alter table public.upgrade_log enable row level security;
alter table public.customers enable row level security;

grant select on public.units, public.bank_stock, public.upgrade_log, public.customers
to authenticated;
grant insert, update, delete on public.units, public.bank_stock, public.customers
to authenticated;
grant insert, update, delete on public.upgrade_log to authenticated;

create policy "authenticated users read units"
on public.units for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi'));

create policy "admins manage units"
on public.units for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "authenticated users read bank stock"
on public.bank_stock for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi'));

create policy "admins manage bank stock"
on public.bank_stock for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "authenticated users read customers"
on public.customers for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi'));

create policy "admins manage customers"
on public.customers for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "authenticated users read upgrade logs"
on public.upgrade_log for select to authenticated
using (public.current_user_role() in ('admin', 'teknisi'));

create policy "authenticated users manage upgrade logs"
on public.upgrade_log for all to authenticated
using (public.current_user_role() in ('admin', 'teknisi'))
with check (public.current_user_role() in ('admin', 'teknisi'));
