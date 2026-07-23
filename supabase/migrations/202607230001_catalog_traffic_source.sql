-- Catalog traffic source tracking (classified, not raw URL).
-- privacy: store only short labels e.g. direct, google, instagram, utm:ads

alter table public.catalog_events
  add column if not exists traffic_source text;

alter table public.catalog_events
  drop constraint if exists catalog_events_traffic_source_check;

alter table public.catalog_events
  add constraint catalog_events_traffic_source_check
  check (
    traffic_source is null
    or (
      char_length(traffic_source) between 1 and 48
      and traffic_source ~ '^[a-z0-9][a-z0-9._:-]{0,47}$'
    )
  );

create index if not exists catalog_events_public_source_idx
  on public.catalog_events (traffic_source, occurred_at desc)
  where is_internal = false and traffic_source is not null;

create or replace function public.record_catalog_event(
  p_event_type text,
  p_session_id uuid,
  p_id_unit text,
  p_traffic_source text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_internal boolean;
  v_inserted integer;
  v_source text;
begin
  if p_event_type not in ('catalog_view', 'detail_view', 'whatsapp_click', 'share_click') then
    raise exception 'Jenis event katalog tidak valid';
  end if;

  if (p_event_type = 'catalog_view' and p_id_unit is not null)
    or (p_event_type in ('detail_view', 'whatsapp_click', 'share_click') and p_id_unit is null) then
    raise exception 'Target event katalog tidak valid';
  end if;

  if p_id_unit is not null and not exists (
    select 1 from public.units
    where id_unit = p_id_unit and status = 'Listed'
  ) then
    raise exception 'Unit katalog tidak tersedia';
  end if;

  v_source := nullif(lower(btrim(coalesce(p_traffic_source, ''))), '');
  if v_source is not null then
    v_source := left(regexp_replace(v_source, '[^a-z0-9._:-]', '', 'g'), 48);
    if v_source = '' or v_source !~ '^[a-z0-9]' then
      v_source := null;
    end if;
  end if;

  v_is_internal := coalesce(public.current_user_role() in ('owner', 'admin', 'teknisi'), false);

  insert into public.catalog_events (event_type, session_id, id_unit, is_internal, traffic_source)
  values (p_event_type, p_session_id, p_id_unit, v_is_internal, v_source)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.record_catalog_event(text, uuid, text, text) from public;
grant execute on function public.record_catalog_event(text, uuid, text, text) to anon, authenticated;

drop function if exists public.get_catalog_analytics(integer);

create function public.get_catalog_analytics(p_days integer)
returns table (
  unique_visitors integer,
  detail_views integer,
  whatsapp_clicks integer,
  share_clicks integer,
  conversion_rate numeric,
  top_units jsonb,
  top_sources jsonb
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
    select
      ce.event_type,
      ce.session_id,
      ce.id_unit,
      coalesce(nullif(ce.traffic_source, ''), 'unknown') as traffic_source
    from public.catalog_events ce
    where ce.is_internal = false
      and ce.occurred_at >= now() - make_interval(days => p_days)
  ),
  summary as (
    select
      count(distinct f.session_id)::integer as unique_visitors,
      count(*) filter (where f.event_type = 'detail_view')::integer as detail_views,
      count(*) filter (where f.event_type = 'whatsapp_click')::integer as whatsapp_clicks,
      count(*) filter (where f.event_type = 'share_click')::integer as share_clicks
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
  ),
  source_rows as (
    select
      f.traffic_source as source,
      count(distinct f.session_id)::integer as visitors,
      count(*) filter (where f.event_type = 'detail_view')::integer as detail_views,
      count(*) filter (where f.event_type = 'whatsapp_click')::integer as whatsapp_clicks
    from filtered f
    group by f.traffic_source
    order by visitors desc, f.traffic_source
    limit 10
  ),
  source_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'source', sr.source,
          'visitors', sr.visitors,
          'detail_views', sr.detail_views,
          'whatsapp_clicks', sr.whatsapp_clicks
        ) order by sr.visitors desc, sr.source
      ),
      '[]'::jsonb
    ) as sources
    from source_rows sr
  )
  select
    s.unique_visitors,
    s.detail_views,
    s.whatsapp_clicks,
    s.share_clicks,
    case when s.detail_views = 0 then 0
      else round((s.whatsapp_clicks::numeric / s.detail_views::numeric) * 100, 1)
    end as conversion_rate,
    tj.units as top_units,
    sj.sources as top_sources
  from summary s
  cross join top_json tj
  cross join source_json sj;
end;
$$;

revoke all on function public.get_catalog_analytics(integer) from public;
grant execute on function public.get_catalog_analytics(integer) to authenticated;
