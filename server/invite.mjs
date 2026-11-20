import { makeInvite, openDb } from './db.mjs';

const db = openDb();
const invite = new URL('/account', process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173');
invite.hash = new URLSearchParams({ invite: makeInvite(db) }).toString();
console.log(invite.href);
db.close();
