// Run against an isolated PostgreSQL-compatible PGlite instance. Dependency
// location is explicit to keep production frontend free of development packages.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
await db.exec(
  "create role anon; create role authenticated; create role service_role;",
);
const migration = new URL(
  "../supabase/migrations/20261020105925_anonymous_surveys.sql",
  import.meta.url,
);
await db.exec(await readFile(migration, "utf8"));
const rpc = async (name, ...args) => {
  const { rows } = await db.query(
    `select public.${name}(${
      args.map((_, i) => "$" + (i + 1)).join(",")
    }) as value`,
    args,
  );
  return rows[0].value;
};
const publicList = await rpc("survey_list", false);
assert.equal(publicList.length, 0);
const [seed] = await rpc("survey_list", true);
assert.equal(seed.admin_only, true);
const id = "11111111-1111-4111-8111-111111111111";
assert.equal(
  (await rpc("survey_challenge", seed.id, "email", id, "hash", false)).error,
  "UNAVAILABLE",
);
const { id: survey } = await rpc(
  "survey_create",
  "Pregunta",
  "",
  ["Sí", "No"],
  false,
);
await rpc("survey_admin_action", survey, "activate");
const [listed] = await rpc("survey_list", false);
assert.equal(listed.id, survey);
const option = listed.options[0].id;
await rpc("survey_challenge", survey, "email", id, "hash", false);
assert.equal(
  (await rpc("survey_challenge", survey, "email", id, "hash", false)).error,
  "RATE_LIMITED",
);
for (let i = 0; i < 5; i++) {
  assert.equal(
    (await rpc(
      "survey_vote",
      survey,
      "email",
      id,
      "wrong",
      option,
      false,
      null,
      "v1",
    )).error,
    "INVALID_CODE",
  );
}
assert.equal(
  (await rpc(
    "survey_vote",
    survey,
    "email",
    id,
    "hash",
    option,
    false,
    null,
    "v1",
  )).error,
  "INVALID_CODE",
);
await db.exec("update survey_private.quotas set last_at='epoch';");
await rpc("survey_challenge", survey, "email", id, "hash", false);
assert.equal(
  (await rpc(
    "survey_vote",
    survey,
    "email",
    id,
    "hash",
    seed.options[0].id,
    false,
    null,
    "v1",
  )).error,
  "INVALID_OPTION",
);
assert.equal(
  (await rpc(
    "survey_vote",
    survey,
    "other-email",
    id,
    "hash",
    option,
    false,
    null,
    "v1",
  )).error,
  "INVALID_CODE",
);
assert.equal(
  (await rpc(
    "survey_vote",
    survey,
    "email",
    id,
    "hash",
    option,
    false,
    null,
    "v1",
  )).ok,
  true,
);
assert.equal(
  (await rpc(
    "survey_vote",
    survey,
    "email",
    id,
    "hash",
    option,
    false,
    null,
    "v1",
  )).error,
  "INVALID_CODE",
);
assert.equal(
  (await db.query("select count(*)::int n from survey_private.contacts"))
    .rows[0].n,
  0,
);
await db.exec("update survey_private.quotas set last_at='epoch';");
await rpc("survey_challenge", survey, "email", id, "hash", false);
assert.equal(
  (await rpc(
    "survey_vote",
    survey,
    "email",
    id,
    "wrong",
    option,
    false,
    null,
    "v1",
  )).error,
  "INVALID_CODE",
);
assert.equal(
  (await rpc(
    "survey_vote",
    survey,
    "email",
    id,
    "hash",
    option,
    false,
    null,
    "v1",
  )).error,
  "ALREADY_VOTED",
);
assert.equal(
  (await db.query("select votes::int from survey_private.options where id=$1", [
    option,
  ])).rows[0].votes,
  1,
);
await rpc("survey_challenge", survey, "expired", id, "hash", false);
await db.exec(
  "update survey_private.challenges set expires_at=now()-interval '1 minute';",
);
assert.equal(
  (await rpc(
    "survey_vote",
    survey,
    "expired",
    id,
    "hash",
    option,
    false,
    null,
    "v1",
  )).error,
  "INVALID_CODE",
);
assert.equal(
  (await rpc("survey_admin_action", survey, "results")).error,
  "RESULTS_WITHHELD",
);
for (let i = 0; i < 4; i++) {
  await rpc("survey_challenge", survey, "voter" + i, id, "hash", false);
  const result = await rpc(
    "survey_vote",
    survey,
    "voter" + i,
    id,
    "hash",
    option,
    false,
    i === 0 ? "yes@example.com" : null,
    "v1",
  );
  assert.equal(result.ok, true);
}
assert.equal(
  (await db.query("select count(*)::int n from survey_private.contacts"))
    .rows[0].n,
  1,
);
await rpc("survey_admin_action", survey, "close");
assert.equal((await rpc("survey_admin_action", survey, "results")).total, 5);
assert.equal(
  (await rpc("survey_admin_action", survey, "activate")).error,
  "INVALID_TRANSITION",
);
assert.equal(
  (await rpc("survey_challenge", survey, "late", id, "hash", false)).error,
  "UNAVAILABLE",
);
await rpc("survey_challenge", seed.id, "admin", id, "hash", true);
assert.equal(
  (await rpc(
    "survey_vote",
    seed.id,
    "admin",
    id,
    "hash",
    seed.options[0].id,
    false,
    null,
    "v1",
  )).error,
  "UNAVAILABLE",
);
assert.equal(
  (await rpc(
    "survey_vote",
    seed.id,
    "admin",
    id,
    "hash",
    seed.options[0].id,
    true,
    null,
    "v1",
  )).ok,
  true,
);
assert.equal((await rpc("survey_admin_action", seed.id, "results")).total, 1);
// Daily quotas apply beyond the one-minute cooldown and across surveys.
await db.exec(
  "update survey_private.quotas set last_at='epoch',count=10 where key='admin'",
);
assert.equal(
  (await rpc("survey_challenge", seed.id, "admin", id, "hash", true)).error,
  "RATE_LIMITED",
);
await db.exec("update survey_private.quotas set count=1000 where key='global'");
assert.equal(
  (await rpc("survey_challenge", seed.id, "new-email", id, "hash", true)).error,
  "RATE_LIMITED",
);
// Browser roles cannot call even the list with a spoofed administrator flag.
for (const role of ["anon", "authenticated"]) {
  await db.exec("set role " + role);
  await assert.rejects(() => rpc("survey_list", true), /permission denied/);
  await assert.rejects(
    () => db.query("select * from survey_private.participation"),
    /permission denied/,
  );
  await db.exec("reset role");
}
const rls = await db.query(
  "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='survey_private' and c.relkind='r'",
);
assert.equal(rls.rows.length, 6);
assert.ok(rls.rows.every((r) => r.relrowsecurity));
await db.exec("set role service_role");
assert.ok((await rpc("survey_list", true)).length);
await db.exec("reset role");
await db.close();
console.log(
  "PASS: migration, RLS/grants, private seed, codes, quotas, duplicates, consent, aggregates, transitions",
);
