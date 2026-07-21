-- Fase 9b: RPC get_store_setting + warranty display fix

-- 5. RPC: get_store_setting — read any app_setting by key (public, read-only)
create or replace function public.get_store_setting(p_key text)
returns text
language sql
security definer
stable
as $$
  select value from public.app_settings where key = p_key;
$$;

grant execute on function public.get_store_setting(text) to anon, authenticated;
