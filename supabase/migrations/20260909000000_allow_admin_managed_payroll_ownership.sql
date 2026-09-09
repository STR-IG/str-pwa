-- Files written by the authenticated admin Edge Function keep the same UUID path.
-- Ownership is therefore enforced by the first path segment, as it already is on INSERT.
alter policy payroll_documents_select_own on storage.objects
  using (
    bucket_id = 'payroll-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy payroll_documents_update_own on storage.objects
  using (
    bucket_id = 'payroll-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'payroll-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] ~ '^[0-9]{4}$'
    and (storage.foldername(name))[3] ~ '^(0[1-9]|1[0-2])$'
    and storage.filename(name) = any (array['timesheet', 'payroll', 'review'])
  );

alter policy payroll_documents_delete_own on storage.objects
  using (
    bucket_id = 'payroll-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
