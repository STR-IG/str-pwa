-- No fixed closing date and no automatic closure.
alter table survey_private.weather_surveys add column if not exists opened_at timestamptz;
create or replace function survey_private.weather_record_opened_at()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.state='publicada' and old.state<>'publicada' then
    new.opened_at := coalesce(old.opened_at,now());
  end if;
  return new;
end $$;
revoke all on function survey_private.weather_record_opened_at() from public,anon,authenticated;
create trigger weather_record_opened_at before update of state on survey_private.weather_surveys
for each row execute function survey_private.weather_record_opened_at();

create or replace function public.survey_weather_set_closed(p_survey uuid,p_actor uuid,p_closed boolean,p_confirm boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s survey_private.weather_surveys; stamp timestamptz;
begin
  if not survey_private.weather_is_admin(p_actor) then return '{"error":"FORBIDDEN"}'::jsonb; end if;
  if p_confirm is distinct from true then return '{"error":"CONFIRMATION_REQUIRED"}'::jsonb; end if;
  select * into s from survey_private.weather_surveys where id=p_survey for update;
  if not found or s.state<>'publicada' then return '{"error":"UNAVAILABLE"}'::jsonb; end if;
  if p_closed then
    update survey_private.weather_surveys set closed=true where id=s.id returning closed_at into stamp;
    delete from survey_private.weather_permits where survey_id=s.id;
    delete from survey_private.weather_challenges where survey_id=s.id;
  else
    if not s.closed then return '{"error":"INVALID_TRANSITION"}'::jsonb; end if;
    if s.closed_at is null or s.closed_at<=now()-interval '15 days' then
      return '{"error":"REOPEN_RETENTION_EXPIRED"}'::jsonb;
    end if;
    update survey_private.weather_surveys set closed=false where id=s.id returning closed_at into stamp;
  end if;
  return jsonb_build_object('ok',true,'closed',p_closed,'closed_at',case when stamp is null then null else to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end);
end $$;
revoke all on function public.survey_weather_set_closed(uuid,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.survey_weather_set_closed(uuid,uuid,boolean,boolean) to service_role;

CREATE OR REPLACE FUNCTION public.weather_action(p_action text, p_survey uuid, p_actor uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  permit_row survey_private.weather_permits;
  result jsonb;
  contact_email text;
  consent_version_value text;
begin
  if p_action in ('close','reopen') then
    return public.survey_weather_set_closed(p_survey,p_actor,p_action='close',p_data->>'confirm'='true');
  end if;
  if p_action='list' then
    return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'state',state,'kind','weather','closed',closed,'closed_at',closed_at,'opened_at',opened_at)),'[]'::jsonb)
      from survey_private.weather_surveys where survey_private.weather_is_admin(p_actor) or (state='publicada' and not closed));
  end if;
  if p_action='get' then
    result := public.weather_action_impl(p_action,p_survey,p_actor,p_data);
    if result ? 'error' then return result; end if;
    return result || (select jsonb_build_object('closed_at',closed_at,'opened_at',opened_at) from survey_private.weather_surveys where id=p_survey);
  end if;
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
$function$
;
