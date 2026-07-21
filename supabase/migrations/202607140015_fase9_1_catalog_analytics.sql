-- Fase 9.1 — Analytics Katalog Anonim
-- Tidak menyimpan IP, user agent, fingerprint, atau identitas customer.

create table public.catalog_events (
  id_event uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('catalog_view', 'detail_view', 'whatsapp_click')),
  session_id uuid not null,
  id_unit text references public.units(id_unit) on update cascade on delete set null,
  is_internal boolean not null,
  occurred_at timestamptz not null default now(),
  event_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  check (
    (event_type = 'catalog_view' and id_unit is null)
    or (event_type in ('detail_view', 'whatsapp_click') and id_unit is not null)
  )
);

create unique index catalog_events_session_event_unit_uidx
  on public.catalog_events (event_date, session_id, event_type, coalesce(id_unit, ''));

create index catalog_events_public_period_idx
  on public.catalog_events (occurred_at desc, event_type)
  where is_internal = false;

alter table public.catalog_events enable row level security;
revoke all on table public.catalog_events from public, anon, authenticated;

create function public.record_catalog_event(
  p_event_type text,
  p_session_id uuid,
  p_id_unit text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_internal boolean;
  v_inserted integer;
begin
  if p_event_type not in ('catalog_view', 'detail_view', 'whatsapp_click') then
    raise exception 'Jenis event katalog tidak valid';
  end if;

  if (p_event_type = 'catalog_view' and p_id_unit is not null)
    or (p_event_type in ('detail_view', 'whatsapp_click') and p_id_unit is null) then
    raise exception 'Target event katalog tidak valid';
  end if;

  if p_id_unit is not null and not exists (
    select 1 from public.units
    where id_unit = p_id_unit and status = 'Listed'
  ) then
    raise exception 'Unit katalog tidak tersedia';
  end if;

  v_is_internal := coalesce(public.current_user_role() in ('owner', 'admin', 'teknisi'), false);

  insert into public.catalog_events (event_type, session_id, id_unit, is_internal)
  values (p_event_type, p_session_id, p_id_unit, v_is_internal)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.record_catalog_event(text, uuid, text) from public;
grant execute on function public.record_catalog_event(text, uuid, text) to anon, authenticated;

create function public.get_catalog_analytics(p_days integer)
returns table (
  unique_visitors integer,
  detail_views integer,
  whatsapp_clicks integer,
  conversion_rate numeric,
  top_units jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() not in ('owner', 'admin') then
    raise exception 'Hanya admin dan owner yang dapat melihat analytics katalog';
  end if;

  if p_days not in (7, 30) then
    raise exception 'Periode analytics harus 7 atau 30 hari';
  end if;

  return query
  with filtered as (
    select ce.event_type, ce.session_id, ce.id_unit
    from public.catalog_events ce
    where ce.is_internal = false
      and ce.occurred_at >= now() - make_interval(days => p_days)
  ),
  summary as (
    select
      count(distinct f.session_id)::integer as unique_visitors,
      count(*) filter (where f.event_type = 'detail_view')::integer as detail_views,
      count(*) filter (where f.event_type = 'whatsapp_click')::integer as whatsapp_clicks
    from filtered f
  ),
  top_rows as (
    select
      f.id_unit,
      u.brand,
      u.model,
      count(*)::integer as detail_views
    from filtered f
    join public.units u on u.id_unit = f.id_unit
    where f.event_type = 'detail_view'
    group by f.id_unit, u.brand, u.model
    order by detail_views desc, f.id_unit
    limit 5
  ),
  top_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id_unit', tr.id_unit,
          'brand', tr.brand,
          'model', tr.model,
          'detail_views', tr.detail_views
        ) order by tr.detail_views desc, tr.id_unit
      ),
      '[]'::jsonb
    ) as units
    from top_rows tr
  )
  select
    s.unique_visitors,
    s.detail_views,
    s.whatsapp_clicks,
    case when s.detail_views = 0 then 0
      else round((s.whatsapp_clicks::numeric / s.detail_views::numeric) * 100, 1)
    end as conversion_rate,
    tj.units as top_units
  from summary s
  cross join top_json tj;
end;
$$;

revoke all on function public.get_catalog_analytics(integer) from public;
grant execute on function public.get_catalog_analytics(integer) to authenticated;
