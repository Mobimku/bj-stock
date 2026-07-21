-- ============================================================
-- Fix Resale Constraint — Partial Unique Index for Sales
-- Root cause: UNIQUE constraint on sales.id_unit prevents
-- re-selling a unit that was previously cancelled/returned.
-- Fix: Replace with partial unique index that only enforces
-- uniqueness for non-cancelled sales.
-- ============================================================

-- 1. Drop the UNIQUE constraint on sales.id_unit
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.sales'::regclass
      and conname = 'sales_id_unit_key'
  ) then
    alter table public.sales drop constraint sales_id_unit_key;
  end if;
end;
$$;

-- 2. Create partial unique index — only active sales
create unique index if not exists sales_id_unit_active_unique
  on public.sales (id_unit)
  where status is distinct from 'Dibatalkan';
