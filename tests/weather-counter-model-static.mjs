import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20261108110000_weather_marginal_counters_v2.sql",
    import.meta.url,
  ),
  "utf8",
);

assert.match(migration, /create table survey_private\.weather_counters/i);
assert.match(migration, /drop table survey_private\.weather_responses/i);
assert.match(migration, /question_id = '__total__'/i);
assert.match(
  migration,
  /update survey_private\.weather_counters counter[\s\S]+where counter\.survey_id = survey\.id[\s\S]+and counter\.is_test = testing/i,
);
assert.match(migration, /counter\.count \+ case[\s\S]+then 1[\s\S]+else 0/i);
assert.doesNotMatch(
  migration,
  /create table[\s\S]{0,80}weather_(responses|answers)/i,
);
assert.match(migration, /opened_at <= now\(\) - interval '60 days'/i);
assert.match(migration, /weather_test_retention/i);
assert.match(migration, /revoke all on table survey_private\.weather_counters from public, anon, authenticated/i);

console.log("PASS: counter-only weather migration has no individual response table");

