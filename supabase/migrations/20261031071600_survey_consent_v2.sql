-- Bind newly collected communication consents to the exact public wording.
create or replace function public.weather_action(
  p_action text,
  p_survey uuid,
  p_actor uuid default null,
  p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  permit_row survey_private.weather_permits;
  result jsonb;
  contact_email text;
  consent_version_value text;
begin
  if p_action <> 'submit' or p_data->>'consent' is distinct from 'true' then
    return public.weather_action_impl(p_action, p_survey, p_actor, p_data);
  end if;

  select * into permit_row
  from survey_private.weather_permits
  where token_hash = p_data->>'permit'
    and survey_id = p_survey
  for update;

  contact_email := p_data->>'contact';
  consent_version_value := p_data->>'consent_version';
  if not found
    or p_data->>'email_key' is distinct from permit_row.email_key
    or consent_version_value is distinct from 'str-laboral-v2-2026-10-30'
    or contact_email is null
    or length(contact_email) > 254
    or contact_email <> lower(btrim(contact_email))
    or contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    return '{"error":"INVALID_CONSENT"}'::jsonb;
  end if;

  result := public.weather_action_impl(p_action, p_survey, p_actor, p_data);

  -- Admin-only test runs never alter the real communications list.
  if coalesce((result->>'ok')::boolean, false) and not permit_row.is_test then
    insert into survey_private.contacts(email, consent_version)
    values (contact_email, consent_version_value)
    on conflict (email) do update
      set consent_version = excluded.consent_version,
          consent_at = now();
  end if;

  return result;
end;
$$;

revoke all on function public.weather_action(text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.weather_action(text, uuid, uuid, jsonb)
  to service_role;

-- Give the section a practical way to honour withdrawal requests received by email.
create or replace function public.survey_contact_withdraw(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(p_email));
  deleted_rows integer;
begin
  if normalized_email is null
    or length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    return '{"error":"INVALID_EMAIL"}'::jsonb;
  end if;

  delete from survey_private.contacts
  where email = normalized_email;
  get diagnostics deleted_rows = row_count;

  return jsonb_build_object('ok', true, 'deleted', deleted_rows > 0);
end;
$$;

revoke all on function public.survey_contact_withdraw(text)
  from public, anon, authenticated;
grant execute on function public.survey_contact_withdraw(text)
  to service_role;
