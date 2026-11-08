-- Privacy model v2.0 for the weather survey:
-- fixed marginal counters only, no individual answer rows and no modality cross.

do $guard$
begin
  if exists (
    select 1
    from survey_private.weather_responses
    where not is_test
  ) or exists (
    select 1
    from survey_private.weather_participation
    where not is_test
  ) or exists (
    select 1
    from survey_private.weather_challenges
    where not is_test
  ) or exists (
    select 1
    from survey_private.weather_permits
    where not is_test
  ) then
    raise exception 'WEATHER_COUNTER_MIGRATION_REQUIRES_ZERO_REAL_DATA';
  end if;
end
$guard$;

-- The working-modality question was only useful for crossed analysis, which is
-- deliberately removed in the marginal-counter model.
update survey_private.weather_surveys
set questions = (
  select jsonb_agg(question order by position)
  from jsonb_array_elements(questions) with ordinality as item(question, position)
  where question->>'id' <> 'q1'
)
where id = 'b27b4c14-0196-4000-8000-000000000014'::uuid;

create table survey_private.weather_counters (
  survey_id uuid not null
    references survey_private.weather_surveys(id) on delete cascade,
  question_id text not null,
  option_label text not null,
  is_test boolean not null,
  count bigint not null default 0 check (count >= 0),
  primary key (survey_id, question_id, option_label, is_test)
);

alter table survey_private.weather_counters enable row level security;
revoke all on table survey_private.weather_counters from public, anon, authenticated;
create index if not exists weather_permits_survey_id_idx
  on survey_private.weather_permits(survey_id);

insert into survey_private.weather_counters(
  survey_id, question_id, option_label, is_test, count
)
select
  survey.id,
  question.value->>'id',
  option.label,
  test_mode.is_test,
  0
from survey_private.weather_surveys survey
cross join lateral jsonb_array_elements(survey.questions) question(value)
cross join lateral jsonb_array_elements_text(question.value->'options') option(label)
cross join (values (false), (true)) as test_mode(is_test);

insert into survey_private.weather_counters(
  survey_id, question_id, option_label, is_test, count
)
select id, '__total__', '__submitted__', test_mode.is_test, 0
from survey_private.weather_surveys
cross join (values (false), (true)) as test_mode(is_test);

-- Discard the existing administrator-only test data before removing the old
-- individual-response table.
delete from survey_private.weather_participation where is_test;
delete from survey_private.weather_challenges where is_test;
delete from survey_private.weather_permits where is_test;
delete from survey_private.weather_test_retention;

create or replace function survey_private.weather_schedule_test_purge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create trigger weather_schedule_test_purge
after insert or update on survey_private.weather_participation
for each row execute function survey_private.weather_schedule_test_purge();

create or replace function survey_private.weather_publication_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.state = 'publicada' and old.state <> 'publicada' then
    if old.state <> 'solo_admin' then
      raise exception 'INVALID_PUBLICATION_STATE';
    end if;
    if exists (
      select 1
      from survey_private.weather_counters
      where survey_id = new.id and is_test and count <> 0
    ) or exists (
      select 1 from survey_private.weather_participation
      where survey_id = new.id and is_test
    ) or exists (
      select 1 from survey_private.weather_permits
      where survey_id = new.id and is_test
    ) or exists (
      select 1 from survey_private.weather_challenges
      where survey_id = new.id and is_test
    ) then
      raise exception 'CLEAN_TEST_DATA_FIRST';
    end if;
    if old.opened_at is null and (
      exists (
        select 1
        from survey_private.weather_counters
        where survey_id = new.id and not is_test and count <> 0
      ) or exists (
        select 1 from survey_private.weather_participation
        where survey_id = new.id and not is_test
      ) or exists (
        select 1 from survey_private.weather_permits
        where survey_id = new.id and not is_test
      ) or exists (
        select 1 from survey_private.weather_challenges
        where survey_id = new.id and not is_test
      )
    ) then
      raise exception 'UNEXPECTED_NON_TEST_DATA';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function survey_private.weather_purge_expired()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
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

  delete from survey_private.quotas
  where key <> 'global'
    and last_at <= now() - interval '15 days';

  -- A weather survey can be closed manually before this point, but never
  -- remains open beyond 60 days from first publication.
  update survey_private.weather_surveys
  set closed = true
  where state = 'publicada'
    and not closed
    and opened_at is not null
    and opened_at <= now() - interval '60 days';

  delete from survey_private.weather_permits permit
  using survey_private.weather_surveys survey
  where permit.survey_id = survey.id and survey.closed;

  delete from survey_private.weather_challenges challenge
  using survey_private.weather_surveys survey
  where challenge.survey_id = survey.id and survey.closed;

  delete from survey_private.weather_participation participation
  using survey_private.weather_surveys survey
  where participation.survey_id = survey.id
    and survey.closed_at <= now() - interval '15 days';

  for due_survey in
    select survey_id
    from survey_private.weather_test_retention
    where purge_on <= current_date
    for update skip locked
  loop
    update survey_private.weather_counters
    set count = 0
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
end;
$function$;

create or replace function public.survey_weather_set_closed(
  p_survey uuid,
  p_actor uuid,
  p_closed boolean,
  p_confirm boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  survey survey_private.weather_surveys;
  stamp timestamptz;
begin
  if not survey_private.weather_is_admin(p_actor) then
    return '{"error":"FORBIDDEN"}'::jsonb;
  end if;
  if p_confirm is distinct from true then
    return '{"error":"CONFIRMATION_REQUIRED"}'::jsonb;
  end if;

  perform survey_private.weather_purge_expired();
  select * into survey
  from survey_private.weather_surveys
  where id = p_survey
  for update;

  if not found or survey.state <> 'publicada' then
    return '{"error":"UNAVAILABLE"}'::jsonb;
  end if;

  if p_closed then
    if survey.closed then
      return '{"error":"INVALID_TRANSITION"}'::jsonb;
    end if;
    update survey_private.weather_surveys
    set closed = true
    where id = survey.id
    returning closed_at into stamp;

    delete from survey_private.weather_permits where survey_id = survey.id;
    delete from survey_private.weather_challenges where survey_id = survey.id;
  else
    if not survey.closed then
      return '{"error":"INVALID_TRANSITION"}'::jsonb;
    end if;
    if survey.opened_at is null
      or survey.opened_at <= now() - interval '60 days'
      or survey.closed_at is null
      or survey.closed_at <= now() - interval '15 days' then
      return '{"error":"REOPEN_RETENTION_EXPIRED"}'::jsonb;
    end if;
    update survey_private.weather_surveys
    set closed = false
    where id = survey.id
    returning closed_at into stamp;
  end if;

  return jsonb_build_object(
    'ok', true,
    'closed', p_closed,
    'closed_at',
    case
      when stamp is null then null
      else to_char(
        stamp at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    end
  );
end;
$function$;

create or replace function public.weather_action(
  p_action text,
  p_survey uuid,
  p_actor uuid default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  result jsonb;
begin
  if p_action in ('close', 'reopen') then
    return public.survey_weather_set_closed(
      p_survey,
      p_actor,
      p_action = 'close',
      p_data->>'confirm' = 'true'
    );
  end if;

  if p_action = 'list' then
    perform survey_private.weather_purge_expired();
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
$function$;

create or replace function public.weather_action_impl(
  p_action text,
  p_survey uuid,
  p_actor uuid default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  survey survey_private.weather_surveys;
  challenge survey_private.weather_challenges;
  permit survey_private.weather_permits;
  limit_row survey_private.weather_limits;
  administrator boolean := survey_private.weather_is_admin(p_actor);
  testing boolean;
  key_value text;
  question jsonb;
  values_json jsonb;
  answer text;
  total bigint;
  deleted_test_total bigint;
  deleted_participations bigint;
  safe_counts jsonb := '{}'::jsonb;
  cells jsonb;
  want_test boolean;
  updated_rows integer;
  expected_rows integer;
begin
  if p_action = 'list' then
    perform survey_private.weather_purge_expired();
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
      where administrator or (state = 'publicada' and not closed)
    );
  end if;

  if p_action not in ('publish', 'cleanup') then
    perform survey_private.weather_purge_expired();
  end if;

  select * into survey
  from survey_private.weather_surveys
  where id = p_survey
  for update;

  if not found
    or (
      not administrator
      and (survey.state <> 'publicada' or survey.closed)
    ) then
    return '{"error":"UNAVAILABLE"}'::jsonb;
  end if;

  testing := survey.state <> 'publicada';

  if p_action in ('cleanup', 'publish', 'results', 'purge')
    and not administrator then
    return '{"error":"FORBIDDEN"}'::jsonb;
  end if;

  if p_action = 'get' then
    return jsonb_build_object(
      'id', survey.id,
      'title', survey.title,
      'state', survey.state,
      'closed', survey.closed,
      'questions', survey.questions,
      'counter_model', 'marginal_v2'
    );
  elsif p_action = 'purge' then
    return '{"ok":true}'::jsonb;
  elsif p_action in ('cleanup', 'publish') then
    if p_action = 'publish' and survey.state <> 'solo_admin' then
      return '{"error":"INVALID_PUBLICATION_STATE"}'::jsonb;
    end if;

    if p_action = 'publish' and survey.opened_at is null and (
      exists (
        select 1 from survey_private.weather_counters
        where survey_id = survey.id and not is_test and count <> 0
      ) or exists (
        select 1 from survey_private.weather_participation
        where survey_id = survey.id and not is_test
      ) or exists (
        select 1 from survey_private.weather_challenges
        where survey_id = survey.id and not is_test
      ) or exists (
        select 1 from survey_private.weather_permits
        where survey_id = survey.id and not is_test
      )
    ) then
      return '{"error":"UNEXPECTED_NON_TEST_DATA"}'::jsonb;
    end if;

    select count into deleted_test_total
    from survey_private.weather_counters
    where survey_id = survey.id
      and is_test
      and question_id = '__total__';

    update survey_private.weather_counters
    set count = 0
    where survey_id = survey.id and is_test;

    delete from survey_private.weather_participation
    where survey_id = survey.id and is_test;
    get diagnostics deleted_participations = row_count;

    delete from survey_private.weather_challenges
    where survey_id = survey.id and is_test;
    delete from survey_private.weather_permits
    where survey_id = survey.id and is_test;
    delete from survey_private.weather_test_retention
    where survey_id = survey.id;

    if p_action = 'publish' then
      update survey_private.weather_surveys
      set state = 'publicada', closed = false
      where id = survey.id;
    end if;

    return jsonb_build_object(
      'ok', true,
      'test_responses_deleted', coalesce(deleted_test_total, 0),
      'test_participations_deleted', coalesce(deleted_participations, 0)
    );
  elsif p_action = 'results' then
    want_test := coalesce((p_data->>'test')::boolean, false);

    if not want_test and not survey.closed then
      return '{"error":"RESULTS_WITHHELD"}'::jsonb;
    end if;

    select count into total
    from survey_private.weather_counters
    where survey_id = survey.id
      and is_test = want_test
      and question_id = '__total__'
      and option_label = '__submitted__';

    total := coalesce(total, 0);

    if want_test or total >= 10 then
      for question in
        select value from jsonb_array_elements(survey.questions)
      loop
        select coalesce(
          jsonb_object_agg(option_label, count),
          '{}'::jsonb
        )
        into cells
        from survey_private.weather_counters
        where survey_id = survey.id
          and is_test = want_test
          and question_id = question->>'id';

        if want_test or not exists (
          select 1
          from survey_private.weather_counters
          where survey_id = survey.id
            and not is_test
            and question_id = question->>'id'
            and count between 1 and 4
        ) then
          safe_counts := safe_counts
            || jsonb_build_object(question->>'id', cells);
        end if;
      end loop;
    end if;

    return jsonb_build_object(
      'total', case when want_test or total >= 10 then total else null end,
      'is_test', want_test,
      'counts', safe_counts,
      'groups', '[]'::jsonb,
      'counter_model', 'marginal_v2'
    );
  end if;

  if survey.closed then
    return '{"error":"UNAVAILABLE"}'::jsonb;
  end if;

  if p_action = 'request' then
    foreach key_value in array array[
      'ip:' || (p_data->>'ip_key'),
      'email:' || (p_data->>'email_key')
    ]
    loop
      insert into survey_private.weather_limits
      values (key_value, 0, 'epoch', now() + interval '1 hour')
      on conflict do nothing;

      select * into limit_row
      from survey_private.weather_limits
      where key = key_value
      for update;

      if limit_row.count >= 10
        or (
          key_value like 'email:%'
          and limit_row.last_at > now() - interval '60 seconds'
        ) then
        return '{"error":"RATE_LIMITED"}'::jsonb;
      end if;
    end loop;

    update survey_private.weather_limits
    set count = count + 1, last_at = now()
    where key in (
      'ip:' || (p_data->>'ip_key'),
      'email:' || (p_data->>'email_key')
    );

    insert into survey_private.weather_challenges(
      id, survey_id, email_key, code_hash, is_test
    )
    values (
      (p_data->>'id')::uuid,
      survey.id,
      p_data->>'email_key',
      p_data->>'code_hash',
      testing
    )
    on conflict (survey_id, email_key) do update
    set id = excluded.id,
        code_hash = excluded.code_hash,
        is_test = excluded.is_test,
        expires_at = now() + interval '5 minutes',
        attempts = 0;

    return '{"ok":true}'::jsonb;
  elsif p_action = 'cancel' then
    delete from survey_private.weather_challenges
    where survey_id = survey.id
      and id = (p_data->>'id')::uuid;
    return '{"ok":true}'::jsonb;
  elsif p_action = 'verify' then
    select * into challenge
    from survey_private.weather_challenges
    where survey_id = survey.id
      and id = (p_data->>'id')::uuid
      and email_key = p_data->>'email_key'
    for update;

    if not found
      or challenge.attempts >= 5
      or challenge.is_test <> testing then
      return '{"error":"INVALID_CODE"}'::jsonb;
    end if;

    update survey_private.weather_challenges
    set attempts = attempts + 1
    where id = challenge.id;

    if challenge.code_hash <> p_data->>'code_hash' then
      return '{"error":"INVALID_CODE"}'::jsonb;
    end if;

    delete from survey_private.weather_challenges where id = challenge.id;

    if exists (
      select 1
      from survey_private.weather_participation
      where survey_id = survey.id
        and email_key = challenge.email_key
    ) then
      return '{"error":"ALREADY_VOTED"}'::jsonb;
    end if;

    insert into survey_private.weather_permits(
      token_hash, survey_id, email_key, is_test
    )
    values (
      p_data->>'permit',
      survey.id,
      challenge.email_key,
      testing
    );

    return '{"ok":true}'::jsonb;
  elsif p_action = 'submit' then
    select * into permit
    from survey_private.weather_permits
    where token_hash = p_data->>'permit'
      and survey_id = survey.id
    for update;

    if not found or permit.is_test <> testing then
      return '{"error":"INVALID_PERMIT"}'::jsonb;
    end if;

    if exists (
      select 1
      from survey_private.weather_participation
      where survey_id = survey.id
        and email_key = permit.email_key
    ) then
      delete from survey_private.weather_permits
      where token_hash = permit.token_hash;
      return '{"error":"ALREADY_VOTED"}'::jsonb;
    end if;

    if jsonb_typeof(p_data->'answers') is distinct from 'object' then
      return '{"error":"INVALID_ANSWERS"}'::jsonb;
    end if;

    if (
      select count(*) from jsonb_object_keys(p_data->'answers')
    ) <> jsonb_array_length(survey.questions) then
      return '{"error":"INVALID_ANSWERS"}'::jsonb;
    end if;

    for question in
      select value from jsonb_array_elements(survey.questions)
    loop
      values_json := p_data->'answers'->(question->>'id');

      if jsonb_typeof(values_json) is distinct from 'array' then
        return '{"error":"INVALID_ANSWERS"}'::jsonb;
      end if;

      if jsonb_array_length(values_json) < 1
        or jsonb_array_length(values_json) > (question->>'max')::integer then
        return '{"error":"INVALID_ANSWERS"}'::jsonb;
      end if;

      if (
        select count(distinct value)
        from jsonb_array_elements(values_json)
      ) <> jsonb_array_length(values_json) then
        return '{"error":"INVALID_ANSWERS"}'::jsonb;
      end if;

      if exists (
        select 1
        from jsonb_array_elements(values_json) value
        where jsonb_typeof(value) <> 'string'
      ) then
        return '{"error":"INVALID_ANSWERS"}'::jsonb;
      end if;

      for answer in
        select value from jsonb_array_elements_text(values_json)
      loop
        if not (question->'options' ? answer)
          or (
            question->'exclusive' ? answer
            and jsonb_array_length(values_json) > 1
          ) then
          return '{"error":"INVALID_ANSWERS"}'::jsonb;
        end if;
      end loop;
    end loop;

    insert into survey_private.weather_participation(
      survey_id, email_key, is_test
    )
    values (survey.id, permit.email_key, testing);

    update survey_private.weather_counters counter
    set count = counter.count + case
      when counter.question_id = '__total__' then 1
      when (p_data->'answers'->counter.question_id) ? counter.option_label
        then 1
      else 0
    end
    where counter.survey_id = survey.id
      and counter.is_test = testing;
    get diagnostics updated_rows = row_count;

    select 1 + coalesce(sum(jsonb_array_length(item.value->'options')), 0)
    into expected_rows
    from jsonb_array_elements(survey.questions) as item(value);

    if updated_rows <> expected_rows then
      raise exception 'WEATHER_COUNTERS_NOT_INITIALIZED';
    end if;

    delete from survey_private.weather_permits
    where survey_id = survey.id
      and email_key = permit.email_key;
    delete from survey_private.weather_challenges
    where survey_id = survey.id
      and email_key = permit.email_key;

    return '{"ok":true}'::jsonb;
  end if;

  return '{"error":"INVALID_ACTION"}'::jsonb;
end;
$function$;

drop function if exists survey_private.weather_archive_due();
drop table if exists survey_private.weather_archived_results;
drop table survey_private.weather_responses;

comment on table survey_private.weather_counters is
  'Fixed marginal counters only. Every submission updates every counter row for its survey/test mode in one statement; no individual answer row is stored.';


