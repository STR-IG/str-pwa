CREATE OR REPLACE FUNCTION public.survey_vote(p_survey uuid, p_email_key text, p_challenge uuid, p_code_hash text, p_option uuid, p_admin boolean, p_contact text, p_consent_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;
