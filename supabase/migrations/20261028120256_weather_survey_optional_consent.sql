-- Keep optional STR communications consent separate from the weather answers.
-- The old service-role-only implementation remains as a private delegate.
alter function public.weather_action(text, uuid, uuid, jsonb)
  rename to weather_action_impl;

create function public.weather_action(
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
  if not found
    or p_data->>'email_key' is distinct from permit_row.email_key
    or contact_email is null
    or length(contact_email) > 254
    or contact_email <> lower(btrim(contact_email))
    or contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    return '{"error":"INVALID_CONSENT"}'::jsonb;
  end if;

  result := public.weather_action_impl(p_action, p_survey, p_actor, p_data);

  -- Admin-only test runs never alter the real STR communications list.
  if coalesce((result->>'ok')::boolean, false) and not permit_row.is_test then
    insert into survey_private.contacts(email, consent_version)
    values (contact_email, 'str-laboral-v1')
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
-- The delegate is only callable by the wrapper's owner and service_role.
revoke all on function public.weather_action_impl(text, uuid, uuid, jsonb)
  from public, anon, authenticated;
