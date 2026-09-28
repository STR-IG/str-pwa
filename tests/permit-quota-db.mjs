// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
await db.exec(await readFile(new URL('../supabase/schema/permit-query-quota.sql', import.meta.url), 'utf8'));
const subject = 'a'.repeat(64);
const call = async (action, id = null, key = subject) => (await db.query(
  'select public.permit_query_quota($1,$2,$3) as quota', [key, action, id])).rows[0].quota;
await db.exec('set role service_role');
assert.equal((await call('status')).remaining, 2);
const first = await call('reserve');
assert.equal(first.remaining, 1);
await call('complete', first.reservation);
const second = await call('reserve');
assert.equal(second.remaining, 0);
assert.equal((await call('reserve')).allowed, false);
await call('release', second.reservation);
assert.equal((await call('status')).remaining, 1);
const retried = await call('reserve'); await call('complete', retried.reservation);
await call('release', retried.reservation);
assert.equal((await call('status')).remaining, 0, 'cannot release a completed response');
assert.equal((await call('status', null, 'b'.repeat(64))).remaining, 2, 'different browser');
await db.exec("update public.permit_query_reservations set month = month - interval '1 month'");
assert.equal((await call('status')).remaining, 2, 'new month');
const abandoned = await call('reserve');
await db.exec("update public.permit_query_reservations set created_at=now()-interval '6 minutes' where not completed");
assert.equal((await call('status')).remaining, 2, 'abandoned requests expire');
await assert.rejects(call('complete', abandoned.reservation));
for (const role of ['anon', 'authenticated']) {
  await db.exec('reset role; set role ' + role);
  await assert.rejects(call('reserve'), /permission denied/);
  await assert.rejects(db.query('select * from public.permit_query_reservations'), /permission denied/);
}
await db.close();
console.log('PostgreSQL: monthly quota, release, expiry and role isolation passed.');
