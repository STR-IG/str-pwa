create or replace function survey_private.weather_archive_due()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  s survey_private.weather_surveys;
  n bigint;
  safe_counts jsonb;
  q jsonb;
  cells jsonb;
begin
  for s in
    select *
    from survey_private.weather_surveys
    where state = 'publicada'
      and closed
      and closed_at <= now() - interval '30 days'
      and not exists (
        select 1
        from survey_private.weather_archived_results a
        where a.survey_id = weather_surveys.id
      )
    for update skip locked
  loop
    select count(*) into n
    from survey_private.weather_responses
    where survey_id = s.id and not is_test;

    safe_counts := '{}'::jsonb;
    if n >= 10 then
      for q in select value from jsonb_array_elements(s.questions) loop
        -- Keep only marginal counts. Withhold the whole question if any cell is 1..4.
        select coalesce(jsonb_object_agg(label, cnt), '{}'::jsonb) into cells
        from (
          select label, count(*) cnt
          from survey_private.weather_responses r,
               lateral jsonb_array_elements_text(r.answers->(q->>'id')) v(label)
          where r.survey_id = s.id and not r.is_test
          group by label
        ) a;

        if not exists (
          select 1
          from jsonb_each(cells) e
          where (e.value::text)::bigint between 1 and 4
        ) then
          safe_counts := safe_counts || jsonb_build_object(q->>'id', cells);
        end if;
      end loop;
    end if;

    insert into survey_private.weather_archived_results
      (survey_id, closed_at, review_policy, payload)
    values (
      s.id,
      s.closed_at,
      'minimum10_no_cells_under5_no_crosses_v1',
      jsonb_build_object(
        'total', case when n >= 10 then n else null end,
        'counts', safe_counts,
        'groups', '[]'::jsonb,
        'is_test', false,
        'archived', true
      )
    );

    -- Same transaction: a failed insert/review never discards the original rows.
    delete from survey_private.weather_responses
    where survey_id = s.id;
  end loop;
end;
$$;

revoke all on function survey_private.weather_archive_due() from public, anon, authenticated;
