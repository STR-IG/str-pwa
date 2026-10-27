-- Retire document persistence; keep unrelated Storage buckets intact.
drop policy if exists payroll_documents_insert_own on storage.objects;
drop policy if exists payroll_documents_update_own on storage.objects;
drop policy if exists payroll_documents_select_own on storage.objects;
drop policy if exists payroll_documents_delete_own on storage.objects;
create policy payroll_documents_retired on storage.objects as restrictive for all to public
using (bucket_id <> 'payroll-documents')
with check (bucket_id <> 'payroll-documents');
