import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const modulePath = process.env.PGLITE_MODULE;
if (!modulePath) throw new Error("Set PGLITE_MODULE to @electric-sql/pglite/dist/index.js");
const { PGlite } = await import(modulePath);
const db = new PGlite();

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema survey_private;
  create table survey_private.weather_permits (
    token_hash text primary key,
    survey_id uuid not null,
    email_key text not null,
    is_test boolean not null,
    expires_at timestamptz not null default (now() + interval '30 minutes')
  );
  create table survey_private.contacts (
    email text primary key,
    consent_version text not null,
    consent_at timestamptz not null default now()
  );
  create function public.weather_action(
    p_action text,
    p_survey uuid,
    p_actor uuid default null,
    p_data jsonb default '{}'::jsonb
  ) returns jsonb language plpgsql as $$
  begin
    if p_action = 'submit' then
      delete from survey_private.weather_permits
      where token_hash = p_data->>'permit' and survey_id = p_survey;
      return '{"ok":true}'::jsonb;
    end if;
    return '{"ok":true}'::jsonb;
  end;
  $$;
`);

await db.exec(await readFile(
  new URL("../supabase/migrations/20261028120256_weather_survey_optional_consent.sql", import.meta.url),
  "utf8",
));

const survey = "b27b4c14-0196-4000-8000-000000000014";
const actor = "a0a0a0a0-0000-4000-8000-000000000001";
const addPermit = async (token, emailKey, isTest) => {
  await db.query(
    "insert into survey_private.weather_permits(token_hash,survey_id,email_key,is_test) values($1,$2,$3,$4)",
    [token, survey, emailKey, isTest],
  );
};
const submit = async (data) => {
  const { rows } = await db.query(
    "select public.weather_action('submit',$1::uuid,$2::uuid,$3::jsonb) as result",
    [survey, actor, JSON.stringify(data)],
  );
  return rows[0].result;
};

await addPermit("real-permit", "real-email-hash", false);
assert.deepEqual(await submit({
  permit: "real-permit",
  consent: true,
  email_key: "real-email-hash",
  contact: "worker@example.com",
}), { ok: true });
assert.equal((await db.query("select count(*)::int as count from survey_private.contacts")).rows[0].count, 1);

await addPermit("test-permit", "test-email-hash", true);
assert.deepEqual(await submit({
  permit: "test-permit",
  consent: true,
  email_key: "test-email-hash",
  contact: "admin@example.com",
}), { ok: true });
assert.equal((await db.query("select count(*)::int as count from survey_private.contacts")).rows[0].count, 1);

await addPermit("bad-permit", "expected-hash", false);
assert.deepEqual(await submit({
  permit: "bad-permit",
  consent: true,
  email_key: "different-hash",
  contact: "other@example.com",
}), { error: "INVALID_CONSENT" });
assert.equal((await db.query("select count(*)::int as count from survey_private.weather_permits where token_hash='bad-permit'")).rows[0].count, 1);

await addPermit("no-consent-permit", "no-consent-hash", false);
assert.deepEqual(await submit({
  permit: "no-consent-permit",
  consent: false,
}), { ok: true });
assert.equal((await db.query("select count(*)::int as count from survey_private.contacts")).rows[0].count, 1);

assert.equal((await db.query(
  "select has_function_privilege('anon','public.weather_action(text,uuid,uuid,jsonb)','execute') as allowed",
)).rows[0].allowed, false);
console.log("PASS: weather consent is optional, email-bound, separate, and omitted for admin test responses");
await db.close();
