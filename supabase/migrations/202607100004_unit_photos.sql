insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'unit-photos',
  'unit-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy "authenticated users read unit photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'unit-photos'
  and public.current_user_role() in ('admin', 'teknisi')
);

create policy "admins upload unit photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'unit-photos'
  and public.current_user_role() = 'admin'
);

create policy "admins update unit photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'unit-photos'
  and public.current_user_role() = 'admin'
)
with check (
  bucket_id = 'unit-photos'
  and public.current_user_role() = 'admin'
);

create policy "admins delete unit photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'unit-photos'
  and public.current_user_role() = 'admin'
);
