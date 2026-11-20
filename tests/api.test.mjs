import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../server/index.mjs';
import { digest, makeInvite, openDb, token } from '../server/db.mjs';

const origin = 'http://localhost:5173';

async function serve(t, db) {
  const server = createApp({ db, origin }).listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  return (path, method = 'GET', body, cookie, requestOrigin = origin) => fetch(
    `http://127.0.0.1:${server.address().port}/api${path}`,
    { method, headers: { origin: requestOrigin, ...(cookie && { cookie }), ...(body && { 'content-type': 'application/json' }) },
      body: body && JSON.stringify(body) },
  );
}

test('public catalogue search and invitation challenge', async t => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const request = await serve(t, db);
  const listing = await (await request('/moves')).json();
  assert.ok(listing.moves.length >= 24);
  assert.equal(listing.styles.length, 5);
  assert.equal((await (await request('/moves?q=RunNiNg-Man&style=Hip+Hop')).json()).moves[0].id, 'running-man');
  assert.equal((await request('/moves/not-found')).status, 404);
  assert.equal((await request('/me/state')).status, 401);

  const code = makeInvite(db);
  const register = await request('/auth/register/options', 'POST', { code, name: 'Dance tester' });
  assert.equal(register.status, 200);
  assert.match(register.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await register.json()).rp.id, 'localhost');
  assert.equal((await request('/auth/register/verify', 'POST', {})).status, 400);
  assert.equal((await request('/auth/login/options', 'POST', undefined, undefined, 'https://example.org')).status, 403);
});

test('records are idempotent, isolated by account, and persist after reopening', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'opendance-test-'));
  const path = join(directory, 'test.sqlite');
  const db = openDb(path);
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  const request = await serve(t, db);

  function account(id) {
    const key = token();
    db.prepare('INSERT INTO accounts VALUES (?, ?)').run(id, id);
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(key), id, Date.now() + 60000);
    return 'od_session=' + key;
  }

  const alice = account('alice');
  const bob = account('bob');
  const plan = { name: 'Basics', moveIds: ['running-man', 'dougie'] };
  assert.equal((await request('/me/plans/basics', 'PUT', plan, alice)).status, 200);
  assert.equal((await request('/me/favorites/running-man', 'PUT', { saved: true }, alice)).status, 200);
  const practice = { ...plan, mode: 'beats', bpm: 90, amount: 8, elapsedSeconds: 11 };
  const write = async () => (await request('/me/practice/session-1', 'PUT', practice, alice)).json();
  assert.deepEqual(await write(), await write());
  assert.deepEqual(await (await request('/me/state', 'GET', undefined, bob)).json(), { favorites: [], plans: [], history: [] });
  assert.equal((await request('/me/practice/session-2', 'PUT', { ...practice, bpm: 999 }, alice)).status, 400);
  const reopened = openDb(path);
  assert.equal(reopened.prepare('SELECT count(*) as n FROM practice').get().n, 1);
  assert.equal(reopened.prepare('SELECT count(*) as n FROM plans').get().n, 1);
  reopened.close();
});
