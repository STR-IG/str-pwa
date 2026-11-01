create table survey_private.weather_archived_results (
  survey_id uuid primary key references survey_private.weather_surveys(id),
  closed_at timestamptz not null,
  archived_at timestamptz not null default now(),
  review_policy text not null,
  payload jsonb not null
);
alter table survey_private.weather_archived_results enable row level security;
revoke all on survey_private.weather_archived_results from public,anon,authenticated;

create or replace function survey_private.weather_archive_due()
returns void language plpgsql security definer set search_path='' as $$
declare s survey_private.weather_surveys; n bigint; safe_counts jsonb; q jsonb; cells jsonb;
begin
  for s in select * from survey_private.weather_surveys
    where state='publicada' and closed and closed_at<=now()-interval '30 days'
      and not exists(select 1 from survey_private.weather_archived_results a where a.survey_id=weather_surveys.id)
    for update skip locked
  loop
    select count(*) into n from survey_private.weather_responses where survey_id=s.id and not is_test;
    safe_counts:='{}'::jsonb;
    if n>=10 then
      for q in select value from jsonb_array_elements(s.questions) loop
        -- Keep only marginal counts. Withhold the whole question if any cell is 1..4.
        select coalesce(jsonb_object_agg(label,cnt),'{}'::jsonb) into cells from (
          select label,count(*) cnt from survey_private.weather_responses r,
          lateral jsonb_array_elements_text(r.answers->(q->>'id')) v(label)
          where r.survey_id=s.id and not r.is_test group by label
        ) a;
        if not exists(select 1 from jsonb_each(cells) e where (e.value::text)::bigint between 1 and 4) then
          safe_counts:=safe_counts||jsonb_build_object(q->>'id',cells);
        end if;
      end loop;
    end if;
    insert into survey_private.weather_archived_results(survey_id,closed_at,review_policy,payload)
    values(s.id,s.closed_at,'minimum10_no_cells_under5_no_crosses_v1',
      jsonb_build_object('total',case when n>=10 then n else null end,'counts',safe_counts,'groups','[]'::jsonb,'is_test',false,'archived',true));
    -- Same transaction: a failed insert/review never discards the original rows.
    delete from survey_private.weather_responses where survey_id=s.id;
  end loop;
end $$;
revoke all on function survey_private.weather_archive_due() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION survey_private.weather_purge_expired()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  delete from survey_private.challenges where expires_at <= now();
  delete from survey_private.weather_challenges where expires_at <= now();
  delete from survey_private.weather_permits where expires_at <= now();
  delete from survey_private.weather_limits where expires_at <= now();
  delete from survey_private.participation p using survey_private.surveys s
    where p.survey_id = s.id and s.closed_at <= now() - interval '15 days';
  delete from survey_private.weather_participation p using survey_private.weather_surveys s
    where p.survey_id = s.id and s.closed_at <= now() - interval '15 days';
  delete from survey_private.quotas where key <> 'global' and last_at <= now() - interval '15 days';
  perform survey_private.weather_archive_due();
end;
$function$
;

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
  if p_action='results' and not coalesce((p_data->>'test')::boolean,false) then
    if not survey_private.weather_is_admin(p_actor) then return '{"error":"FORBIDDEN"}'::jsonb; end if;
    select a.payload into result from survey_private.weather_archived_results a
      join survey_private.weather_surveys s on s.id=a.survey_id
      where a.survey_id=p_survey and s.closed and s.closed_at=a.closed_at;
    if found then return result; end if;
  end if;
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
