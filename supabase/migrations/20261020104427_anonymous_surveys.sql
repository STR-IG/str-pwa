-- All access goes through a service-role Edge Function. No browser grants.
create schema if not exists survey_private;
revoke all on schema survey_private from public, anon, authenticated;
create table survey_private.surveys (
  id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 180),
  description text not null default '' check(length(description)<=1500),
  state text not null default 'draft' check(state in ('draft','active','closed')),
  admin_only boolean not null default true
);
create table survey_private.options (
  id uuid primary key default gen_random_uuid(), survey_id uuid not null references survey_private.surveys(id),
  label text not null check(length(label) between 1 and 180), position integer not null,
  votes bigint not null default 0 check(votes>=0), unique(survey_id,position)
);
-- No email, option, answer ID, or timestamp in the participation ledger.
create table survey_private.participation (
  survey_id uuid not null references survey_private.surveys(id), email_key text not null,
  primary key(survey_id,email_key)
);
create table survey_private.challenges (
  id uuid primary key, survey_id uuid not null references survey_private.surveys(id), email_key text not null,
  code_hash text not null, expires_at timestamptz not null, attempts integer not null default 0,
  unique(survey_id,email_key)
);
create table survey_private.quotas (
  key text primary key, day date not null, count integer not null, last_at timestamptz not null
);
-- Global contact list: deliberately no survey or answer reference.
create table survey_private.contacts (
  email text primary key, consent_version text not null, consent_at timestamptz not null default now()
);
alter table survey_private.surveys enable row level security;
alter table survey_private.options enable row level security;
alter table survey_private.participation enable row level security;
alter table survey_private.challenges enable row level security;
alter table survey_private.quotas enable row level security;
alter table survey_private.contacts enable row level security;
revoke all on all tables in schema survey_private from public,anon,authenticated;

-- SECURITY DEFINER is confined to service-role-only RPCs because this schema
-- is intentionally outside the Data API. Each function has an empty search path.
create function public.survey_list(p_admin boolean) returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'description',s.description,
    'state',s.state,'admin_only',s.admin_only,'options',(
      select jsonb_agg(jsonb_build_object('id',o.id,'label',o.label) order by o.position)
      from survey_private.options o where o.survey_id=s.id))), '[]'::jsonb)
  from survey_private.surveys s where p_admin or (s.state='active' and not s.admin_only)
$$;
create function public.survey_create(p_title text,p_description text,p_options text[],p_admin_only boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if cardinality(p_options) not between 2 and 10 then raise exception 'INVALID_OPTIONS'; end if;
  insert into survey_private.surveys(title,description,admin_only) values(p_title,p_description,p_admin_only) returning id into sid;
  insert into survey_private.options(survey_id,label,position) select sid,label,ord from unnest(p_options) with ordinality as x(label,ord);
  return jsonb_build_object('id',sid);
end $$;
create function public.survey_admin_action(p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s survey_private.surveys; total bigint;
begin
  select * into s from survey_private.surveys where id=p_id for update;
  if not found then return '{"error":"NOT_FOUND"}'::jsonb; end if;
  if p_action='activate' and s.state='draft' then
    update survey_private.surveys set state='active' where id=p_id;
  elsif p_action='close' and s.state='active' then
    update survey_private.surveys set state='closed' where id=p_id;
  elsif p_action='results' then
    select sum(votes) into total from survey_private.options where survey_id=p_id;
    -- No live results for public surveys; suppress small groups.
    if not s.admin_only and (s.state<>'closed' or total<5) then
      return '{"error":"RESULTS_WITHHELD"}'::jsonb;
    end if;
    return jsonb_build_object('total',total,'options',(
      select jsonb_agg(jsonb_build_object('label',label,'votes',votes) order by position)
      from survey_private.options where survey_id=p_id));
  else return '{"error":"INVALID_TRANSITION"}'::jsonb;
  end if;
  return '{"ok":true}'::jsonb;
end $$;
create function public.survey_challenge(p_survey uuid,p_email_key text,p_id uuid,p_code_hash text,p_admin boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s survey_private.surveys; q survey_private.quotas;
begin
  select * into s from survey_private.surveys where id=p_survey for update;
  if not found or s.state<>'active' or (s.admin_only and not p_admin) then return '{"error":"UNAVAILABLE"}'::jsonb; end if;
  -- Always lock global before email quota. Limits survive multiple function instances.
  insert into survey_private.quotas values('global',current_date,0,'epoch') on conflict do nothing;
  select * into q from survey_private.quotas where key='global' for update;
  if q.day=current_date and q.count>=1000 then return '{"error":"RATE_LIMITED"}'::jsonb; end if;
  insert into survey_private.quotas values(p_email_key,current_date,0,'epoch') on conflict do nothing;
  select * into q from survey_private.quotas where key=p_email_key for update;
  if q.last_at>now()-interval '60 seconds' or (q.day=current_date and q.count>=10) then
    return '{"error":"RATE_LIMITED"}'::jsonb;
  end if;
  update survey_private.quotas set day=current_date,count=case when day=current_date then count+1 else 1 end,last_at=now() where key='global';
  update survey_private.quotas set day=current_date,count=case when day=current_date then count+1 else 1 end,last_at=now() where key=p_email_key;
  delete from survey_private.challenges where survey_id=p_survey and expires_at<now();
  insert into survey_private.challenges(id,survey_id,email_key,code_hash,expires_at)
    values(p_id,p_survey,p_email_key,p_code_hash,now()+interval '10 minutes')
    on conflict(survey_id,email_key) do update set id=excluded.id,code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0;
  return '{"ok":true}'::jsonb;
end $$;
create function public.survey_vote(p_survey uuid,p_email_key text,p_challenge uuid,p_code_hash text,p_option uuid,
  p_admin boolean,p_contact text,p_consent_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s survey_private.surveys; c survey_private.challenges;
begin
  -- Serializes vote/close and same-survey concurrent submissions atomically.
  select * into s from survey_private.surveys where id=p_survey for update;
  if not found or s.state<>'active' or (s.admin_only and not p_admin) then return '{"error":"UNAVAILABLE"}'::jsonb; end if;
  select * into c from survey_private.challenges where id=p_challenge and survey_id=p_survey and email_key=p_email_key for update;
  if not found or c.expires_at<=now() or c.attempts>=5 then return '{"error":"INVALID_CODE"}'::jsonb; end if;
  update survey_private.challenges set attempts=attempts+1 where id=p_challenge;
  if c.code_hash<>p_code_hash then return '{"error":"INVALID_CODE"}'::jsonb; end if;
  if exists(select 1 from survey_private.participation where survey_id=p_survey and email_key=p_email_key) then
    delete from survey_private.challenges where id=p_challenge;
    return '{"error":"ALREADY_VOTED"}'::jsonb;
  end if;
  if not exists(select 1 from survey_private.options where id=p_option and survey_id=p_survey) then
    return '{"error":"INVALID_OPTION"}'::jsonb;
  end if;
  insert into survey_private.participation values(p_survey,p_email_key);
  update survey_private.options set votes=votes+1 where id=p_option and survey_id=p_survey;
  delete from survey_private.challenges where id=p_challenge;
  if p_contact is not null then
    insert into survey_private.contacts(email,consent_version) values(p_contact,p_consent_version)
    on conflict(email) do update set consent_version=excluded.consent_version,consent_at=now();
  end if;
  return '{"ok":true}'::jsonb;
end $$;
revoke all on function public.survey_list(boolean) from public,anon,authenticated;
revoke all on function public.survey_create(text,text,text[],boolean) from public,anon,authenticated;
revoke all on function public.survey_admin_action(uuid,text) from public,anon,authenticated;
revoke all on function public.survey_challenge(uuid,text,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.survey_vote(uuid,text,uuid,text,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.survey_list(boolean), public.survey_create(text,text,text[],boolean),
  public.survey_admin_action(uuid,text), public.survey_challenge(uuid,text,uuid,text,boolean),
  public.survey_vote(uuid,text,uuid,text,uuid,boolean,text,text) to service_role;

-- First test: never appears in the public list and rejects public participation.
select public.survey_create('Encuesta de prueba · solo administración','Comprueba el flujo de códigos y los resultados antes de publicar una encuesta.',array['Todo correcto','Necesita revisión'],true);
update survey_private.surveys set state='active' where title='Encuesta de prueba · solo administración';
