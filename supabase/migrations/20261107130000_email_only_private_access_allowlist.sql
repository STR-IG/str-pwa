-- Keep the private access allowlist limited to email and access metadata.
-- Remove the legacy function that accepted personal details before dropping its columns.
DROP FUNCTION IF EXISTS public.committee_upsert_affiliate(text, text, text, text);

ALTER TABLE public.private_access_allowlist
  DROP COLUMN IF EXISTS display_name,
  DROP COLUMN IF EXISTS employee_number,
  DROP COLUMN IF EXISTS phone;
