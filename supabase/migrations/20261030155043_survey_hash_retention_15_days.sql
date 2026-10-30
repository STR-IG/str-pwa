-- Retain pseudonymous participation keys until 15 days after a survey closes.
-- Aggregate vote totals and weather response rows remain available for results.
alter table survey_private.surveys
  add column if not exists closed_at timestamptz;

alter table survey_private.weather_surveys
  add column if not exists closed_at timestamptz;

-- Existing closed surveys start their retention window when this migration runs.
update survey_private.surveys
  set closed_at = now()
  where state = 'closed' and closed_at is null;

update survey_private.weather_surveys
  set closed_at = now()
  where closed and closed_at is null;

create or replace function survey_private.set_simple_survey_closed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state = 'closed' then
    new.closed_at := coalesce(old.closed_at, now());
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;

create or replace function survey_private.set_weather_survey_closed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.closed then
    new.closed_at := coalesce(old.closed_at, now());
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_simple_survey_closed_at on survey_private.surveys;
create trigger set_simple_survey_closed_at
before update of state on survey_private.surveys
for each row execute function survey_private.set_simple_survey_closed_at();

drop trigger if exists set_weather_survey_closed_at on survey_private.weather_surveys;
create trigger set_weather_survey_closed_at
before update of closed on survey_private.weather_surveys
for each row execute function survey_private.set_weather_survey_closed_at();

comment on column survey_private.surveys.closed_at is
  'Timestamp used to purge pseudonymous participation keys 15 days after closure.';
comment on column survey_private.weather_surveys.closed_at is
  'Timestamp used to purge pseudonymous participation keys 15 days after closure.';

create or replace function survey_private.weather_purge_expired()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from survey_private.challenges where expires_at <= now();
  delete from survey_private.weather_challenges where expires_at <= now();
  delete from survey_private.weather_permits where expires_at <= now();
  delete from survey_private.weather_limits where expires_at <= now();

  -- These tables only prevent repeat participation; keep aggregate results.
  delete from survey_private.participation p
  using survey_private.surveys s
  where p.survey_id = s.id
    and s.closed_at <= now() - interval '15 days';

  delete from survey_private.weather_participation p
  using survey_private.weather_surveys s
  where p.survey_id = s.id
    and s.closed_at <= now() - interval '15 days';

  -- Email-keyed rate limits are no longer needed after 15 days of inactivity.
  delete from survey_private.quotas
  where key <> 'global'
    and last_at <= now() - interval '15 days';
end;
$$;

revoke all on function survey_private.set_simple_survey_closed_at()
  from public, anon, authenticated;
revoke all on function survey_private.set_weather_survey_closed_at()
  from public, anon, authenticated;
revoke all on function survey_private.weather_purge_expired()
  from public, anon, authenticated;
