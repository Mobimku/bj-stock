-- Fix Storage RLS policies: use auth.role() instead of public.current_user_role()
-- because auth.jwt() may not be available in Storage policy context on Cloud

-- Drop ALL existing policies on unit-photos bucket (old names + any partial attempts)
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
    and (policyname like '%unit-photos%' or policyname like '%unit photos%')
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end;
$$;

-- Recreate: allow any authenticated user (API server-side already restricts by role)
create policy "unit-photos-select"
on storage.objects for select to authenticated
using (bucket_id = 'unit-photos');

create policy "unit-photos-insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'unit-photos');

create policy "unit-photos-update"
on storage.objects for update to authenticated
using (bucket_id = 'unit-photos')
with check (bucket_id = 'unit-photos');

create policy "unit-photos-delete"
on storage.objects for delete to authenticated
using (bucket_id = 'unit-photos');
