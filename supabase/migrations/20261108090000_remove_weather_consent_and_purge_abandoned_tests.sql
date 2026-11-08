create table if not exists survey_private.weather_test_retention (
  survey_id uuid primary key references survey_private.weather_surveys(id) on delete cascade,
  purge_on date not null
);

alter table survey_private.weather_test_retention enable row level security;
revoke all on table survey_private.weather_test_retention from public, anon, authenticated;

create or replace function survey_private.weather_schedule_test_purge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_test then
    insert into survey_private.weather_test_retention(survey_id, purge_on)
    values (new.survey_id, current_date + 30)
    on conflict (survey_id) do update
      set purge_on = greatest(
        survey_private.weather_test_retention.purge_on,
        excluded.purge_on
      );
  end if;
  return new;
end;
$$;

revoke all on function survey_private.weather_schedule_test_purge() from public, anon, authenticated;

drop trigger if exists weather_schedule_test_purge on survey_private.weather_responses;
create trigger weather_schedule_test_purge
after insert or update of is_test on survey_private.weather_responses
for each row execute function survey_private.weather_schedule_test_purge();

insert into survey_private.weather_test_retention(survey_id, purge_on)
select distinct survey_id, current_date + 30
from survey_private.weather_responses
where is_test
on conflict (survey_id) do update
  set purge_on = greatest(
    survey_private.weather_test_retention.purge_on,
    excluded.purge_on
  );

create or replace function survey_private.weather_purge_expired()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_survey uuid;
begin
  delete from survey_private.challenges where expires_at <= now();
  delete from survey_private.weather_challenges where expires_at <= now();
  delete from survey_private.weather_permits where expires_at <= now();
  delete from survey_private.weather_limits where expires_at <= now();

  delete from survey_private.participation p
  using survey_private.surveys s
  where p.survey_id = s.id
    and s.closed_at <= now() - interval '15 days';

  delete from survey_private.weather_participation p
  using survey_private.weather_surveys s
  where p.survey_id = s.id
    and s.closed_at <= now() - interval '15 days';

  delete from survey_private.quotas
  where key <> 'global'
    and last_at <= now() - interval '15 days';

  for due_survey in
    select survey_id
    from survey_private.weather_test_retention
    where purge_on <= current_date
    for update skip locked
  loop
    delete from survey_private.weather_responses
    where survey_id = due_survey and is_test;

    delete from survey_private.weather_participation
    where survey_id = due_survey and is_test;

    delete from survey_private.weather_challenges
    where survey_id = due_survey and is_test;

    delete from survey_private.weather_permits
    where survey_id = due_survey and is_test;

    delete from survey_private.weather_test_retention
    where survey_id = due_survey;
  end loop;

  perform survey_private.weather_archive_due();
end;
$$;

create or replace function public.weather_action(
  p_action text,
  p_survey uuid,
  p_actor uuid default null::uuid,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_action = 'results'
     and not coalesce((p_data->>'test')::boolean, false) then
    if not survey_private.weather_is_admin(p_actor) then
      return '{"error":"FORBIDDEN"}'::jsonb;
    end if;

    select a.payload into result
    from survey_private.weather_archived_results a
    join survey_private.weather_surveys s on s.id = a.survey_id
    where a.survey_id = p_survey
      and s.closed
      and s.closed_at = a.closed_at;

    if found then
      return result;
    end if;
  end if;

  if p_action in ('close', 'reopen') then
    return public.survey_weather_set_closed(
      p_survey,
      p_actor,
      p_action = 'close',
      p_data->>'confirm' = 'true'
    );
  end if;

  if p_action = 'list' then
    return (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'title', title,
            'state', state,
            'kind', 'weather',
            'closed', closed,
            'closed_at', closed_at,
            'opened_at', opened_at
          )
        ),
        '[]'::jsonb
      )
      from survey_private.weather_surveys
      where survey_private.weather_is_admin(p_actor)
         or (state = 'publicada' and not closed)
    );
  end if;

  if p_action = 'get' then
    result := public.weather_action_impl(p_action, p_survey, p_actor, p_data);
    if result ? 'error' then
      return result;
    end if;

    return result || (
      select jsonb_build_object(
        'closed_at', closed_at,
        'opened_at', opened_at
      )
      from survey_private.weather_surveys
      where id = p_survey
    );
  end if;

  return public.weather_action_impl(p_action, p_survey, p_actor, p_data);
end;
$$;

revoke all on function public.weather_action(text, uuid, uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.weather_action(text, uuid, uuid, jsonb)
to service_role;
