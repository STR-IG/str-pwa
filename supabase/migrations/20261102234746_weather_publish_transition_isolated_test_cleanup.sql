CREATE OR REPLACE FUNCTION public.weather_action_impl(p_action text, p_survey uuid, p_actor uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s survey_private.weather_surveys; c survey_private.weather_challenges;
  t survey_private.weather_permits; lim survey_private.weather_limits;
  adm boolean:=survey_private.weather_is_admin(p_actor); testing boolean;
  k text; question jsonb; vals jsonb; answer text; total bigint; nr bigint; np bigint;
  grouped jsonb; counts jsonb; want_test boolean;
begin
  if p_action='list' then
    return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'state',state,'kind','weather','closed',closed)),'[]')
      from survey_private.weather_surveys where adm or (state='publicada' and not closed));
  end if;
  select * into s from survey_private.weather_surveys where id=p_survey for update;
  if not found or (s.state<>'publicada' and not adm) then return '{"error":"UNAVAILABLE"}'; end if;
  testing:=s.state<>'publicada';
  if p_action in ('cleanup','publish','results','purge','close') and not adm then return '{"error":"FORBIDDEN"}'; end if;
  -- Publish/cleanup must be isolated to this survey; do not run global purges here.
  if p_action not in ('publish','cleanup') then
    perform survey_private.weather_purge_expired();
  end if;
  if p_action='get' then
    return jsonb_build_object('id',s.id,'title',s.title,'state',s.state,'closed',s.closed,'questions',s.questions);
  elsif p_action='purge' then return '{"ok":true}';
  elsif p_action='close' then
    update survey_private.weather_surveys set closed=true where id=s.id;
    delete from survey_private.weather_permits where survey_id=s.id;
    delete from survey_private.weather_challenges where survey_id=s.id;
    return '{"ok":true}';
  elsif p_action in ('cleanup','publish') then
    if p_action='publish' and s.state<>'solo_admin' then
      return '{"error":"INVALID_PUBLICATION_STATE"}';
    end if;
    -- On first publication, unexpected non-test rows are an integrity anomaly:
    -- stop without deleting or republishing them. Re-publication preserves real rows.
    if p_action='publish' and s.opened_at is null and (
      exists(select 1 from survey_private.weather_responses where survey_id=s.id and not is_test)
      or exists(select 1 from survey_private.weather_participation where survey_id=s.id and not is_test)
      or exists(select 1 from survey_private.weather_challenges where survey_id=s.id and not is_test)
      or exists(select 1 from survey_private.weather_permits where survey_id=s.id and not is_test)
    ) then
      return '{"error":"UNEXPECTED_NON_TEST_DATA"}';
    end if;
    delete from survey_private.weather_responses where survey_id=s.id and is_test; get diagnostics nr=row_count;
    delete from survey_private.weather_participation where survey_id=s.id and is_test; get diagnostics np=row_count;
    delete from survey_private.weather_challenges where survey_id=s.id and is_test;
    delete from survey_private.weather_permits where survey_id=s.id and is_test;
    if p_action='publish' then update survey_private.weather_surveys set state='publicada', closed=false where id=s.id; end if;
    return jsonb_build_object('ok',true,'test_responses_deleted',nr,'test_participations_deleted',np);
  elsif p_action='results' then
    want_test:=coalesce((p_data->>'test')::boolean,false);
    select count(*) into total from survey_private.weather_responses where survey_id=s.id and is_test=want_test;
    if not want_test and not s.closed then return '{"error":"RESULTS_WITHHELD"}'; end if;
    select coalesce(jsonb_object_agg(qid,opts),'{}') into counts from (
      select qid,jsonb_object_agg(label,n) opts from (
        select e.key qid,v.label,count(*) n from survey_private.weather_responses r,
          lateral jsonb_each(r.answers) e, lateral jsonb_array_elements_text(e.value) v(label)
        where r.survey_id=s.id and r.is_test=want_test group by e.key,v.label
      ) a group by qid
    ) b;
    -- Never expose exact small-group counts or their crossed answers.
    select coalesce(jsonb_agg(jsonb_build_object('modality',modality,'total',n,'counts',breakdown)),'[]') into grouped from (
      select eligible.modality,eligible.n,
        (select coalesce(jsonb_object_agg(qid,opts),'{}') from (
          select qid,jsonb_object_agg(label,num) opts from (
            select e.key qid,v.label,count(*) num from survey_private.weather_responses r2,
              lateral jsonb_each(r2.answers) e,lateral jsonb_array_elements_text(e.value) v(label)
            where r2.survey_id=s.id and r2.is_test=want_test and r2.answers->'q1'->>0=eligible.modality
            group by e.key,v.label
          ) x group by qid
        ) y) breakdown
      from (select answers->'q1'->>0 modality,count(*) n from survey_private.weather_responses
        where survey_id=s.id and is_test=want_test group by answers->'q1'->>0 having count(*)>=10) eligible
    ) g;
    return jsonb_build_object('total',total,'is_test',want_test,'counts',counts,'groups',grouped);
  end if;
  if s.closed then return '{"error":"UNAVAILABLE"}'; end if;
  if p_action='request' then
    -- Fixed one-hour buckets, no raw IP; purged after at most one hour + scheduler interval.
    foreach k in array array['ip:'||(p_data->>'ip_key'),'email:'||(p_data->>'email_key')] loop
      insert into survey_private.weather_limits values(k,0,'epoch',now()+interval '1 hour') on conflict do nothing;
      select * into lim from survey_private.weather_limits where key=k for update;
      if lim.count>=10 or (k like 'email:%' and lim.last_at>now()-interval '60 seconds') then return '{"error":"RATE_LIMITED"}'; end if;
    end loop;
    update survey_private.weather_limits set count=count+1,last_at=now()
      where key in ('ip:'||(p_data->>'ip_key'),'email:'||(p_data->>'email_key'));
    insert into survey_private.weather_challenges(id,survey_id,email_key,code_hash,is_test)
      values((p_data->>'id')::uuid,s.id,p_data->>'email_key',p_data->>'code_hash',testing)
      on conflict(survey_id,email_key) do update set id=excluded.id,code_hash=excluded.code_hash,
        is_test=excluded.is_test,expires_at=now()+interval '5 minutes',attempts=0;
    return '{"ok":true}';
  elsif p_action='cancel' then
    delete from survey_private.weather_challenges where survey_id=s.id and id=(p_data->>'id')::uuid;
    return '{"ok":true}';
  elsif p_action='verify' then
    select * into c from survey_private.weather_challenges where survey_id=s.id and id=(p_data->>'id')::uuid
      and email_key=p_data->>'email_key' for update;
    if not found or c.attempts>=5 or c.is_test<>testing then return '{"error":"INVALID_CODE"}'; end if;
    update survey_private.weather_challenges set attempts=attempts+1 where id=c.id;
    if c.code_hash<>p_data->>'code_hash' then return '{"error":"INVALID_CODE"}'; end if;
    delete from survey_private.weather_challenges where id=c.id;
    if exists(select 1 from survey_private.weather_participation where survey_id=s.id and email_key=c.email_key) then
      return '{"error":"ALREADY_VOTED"}';
    end if;
    insert into survey_private.weather_permits(token_hash,survey_id,email_key,is_test)
      values(p_data->>'permit',s.id,c.email_key,testing);
    return '{"ok":true}';
  elsif p_action='submit' then
    select * into t from survey_private.weather_permits where token_hash=p_data->>'permit' and survey_id=s.id for update;
    if not found or t.is_test<>testing then return '{"error":"INVALID_PERMIT"}'; end if;
    if exists(select 1 from survey_private.weather_participation where survey_id=s.id and email_key=t.email_key) then
      delete from survey_private.weather_permits where token_hash=t.token_hash;
      return '{"error":"ALREADY_VOTED"}';
    end if;
    if jsonb_typeof(p_data->'answers') is distinct from 'object' then return '{"error":"INVALID_ANSWERS"}'; end if;
    if (select count(*) from jsonb_object_keys(p_data->'answers'))<>jsonb_array_length(s.questions) then return '{"error":"INVALID_ANSWERS"}'; end if;
    for question in select value from jsonb_array_elements(s.questions) loop
      vals:=p_data->'answers'->(question->>'id');
      if jsonb_typeof(vals) is distinct from 'array' then return '{"error":"INVALID_ANSWERS"}'; end if;
      if jsonb_array_length(vals)<1 or jsonb_array_length(vals)>(question->>'max')::integer then return '{"error":"INVALID_ANSWERS"}'; end if;
      if (select count(distinct value) from jsonb_array_elements(vals))<>jsonb_array_length(vals) then return '{"error":"INVALID_ANSWERS"}'; end if;
      if exists(select 1 from jsonb_array_elements(vals) v where jsonb_typeof(v)<>'string') then return '{"error":"INVALID_ANSWERS"}'; end if;
      for answer in select value from jsonb_array_elements_text(vals) loop
        if not (question->'options' ? answer) or
          ((question->'exclusive' ? answer) and jsonb_array_length(vals)>1) then return '{"error":"INVALID_ANSWERS"}'; end if;
      end loop;
    end loop;
    insert into survey_private.weather_participation values(s.id,t.email_key,testing);
    insert into survey_private.weather_responses(survey_id,answers,is_test) values(s.id,p_data->'answers',testing);
    -- Remove every remaining permit for this email, not just the consumed one.
    delete from survey_private.weather_permits where survey_id=s.id and email_key=t.email_key;
    delete from survey_private.weather_challenges where survey_id=s.id and email_key=t.email_key;
    return '{"ok":true}';
  end if;
  return '{"error":"INVALID_ACTION"}';
end $function$;

CREATE OR REPLACE FUNCTION survey_private.weather_publication_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.state='publicada' and old.state<>'publicada' then
    if old.state<>'solo_admin' then raise exception 'INVALID_PUBLICATION_STATE'; end if;
    if exists(select 1 from survey_private.weather_responses where survey_id=new.id and is_test)
      or exists(select 1 from survey_private.weather_participation where survey_id=new.id and is_test)
      or exists(select 1 from survey_private.weather_permits where survey_id=new.id and is_test)
      or exists(select 1 from survey_private.weather_challenges where survey_id=new.id and is_test) then
      raise exception 'CLEAN_TEST_DATA_FIRST';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION survey_private.weather_record_opened_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.state='publicada' and old.state='solo_admin' and old.opened_at is null then
    new.opened_at := clock_timestamp();
  else
    new.opened_at := old.opened_at;
  end if;
  return new;
end $function$
;