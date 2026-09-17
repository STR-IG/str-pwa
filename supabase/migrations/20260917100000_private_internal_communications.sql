insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comunicados-internos',
  'comunicados-internos',
  false,
  5242880,
  array['image/png']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "internal_communications_select_authorized" on storage.objects;

create policy "internal_communications_select_authorized"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'comunicados-internos'
  and name = '2026/09/comunicado-datos-afiliacion.png'
  and (select public.is_current_user_private_access_allowed())
);
