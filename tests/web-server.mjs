import { createApp } from '../server/index.mjs';
import { makeInvite, openDb } from '../server/db.mjs';

const db = openDb(':memory:');
const origin = 'http://localhost:5327';
const app = createApp({ db, origin });
app.post('/test/invite', (_req, res) => res.json({ code: makeInvite(db) }));
app.listen(5327);
