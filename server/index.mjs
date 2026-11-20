import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { digest, openDb, token, transaction } from './db.mjs';

const catalogue = JSON.parse(readFileSync(new URL('../catalogue/moves.json', import.meta.url), 'utf8'));
const styles = [...new Set(catalogue.map(move => move.style))];
const lookup = new Map(catalogue.map(move => [move.id, {
  ...move,
  media: move.media && {
    ...move.media,
    video: `/media/${move.id}.mp4${move.media.revision ? "?v=" + move.media.revision : ""}`,
    poster: `/media/${move.id}.webp${move.media.revision ? "?v=" + move.media.revision : ""}`,
  },
}]));
const clean = value => typeof value === 'string' ? value.trim() : '';
const validId = value => typeof value === 'string' && /^[\w-]{1,80}$/.test(value);
const isToken = value => typeof value === 'string' && /^[\w-]{43}$/.test(value);
const cookieValue = (req, name) => {
  const pair = req.headers.cookie?.split(';').map(cookie => cookie.trim()).find(cookie => cookie.startsWith(name + '='));
  return pair?.slice(name.length + 1);
};
const bad = (res, status, error) => res.status(status).json({ error });
const normalize = value => clean(value).toLowerCase().replace(/[-\s]+/g, '');
const bounded = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export function createApp({ db = openDb(), origin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173' } = {}) {
  const site = new URL(origin);
  const rpID = site.hostname;
  const secure = site.protocol === 'https:';
  if (site.origin !== origin || (!secure && rpID !== 'localhost')) {
    throw new Error('PUBLIC_ORIGIN must be an HTTPS origin, or http://localhost with a local port.');
  }

  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'DENY');
    next();
  });
  app.use('/api', express.json({ limit: '48kb' }), (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && req.get('origin') !== origin) {
      return bad(res, 403, '请求来源无效。');
    }
    next();
  });

  function setCookie(res, name, value, maxAge) {
    res.cookie(secure ? '__Host-' + name : name, value, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge });
  }

  function readCookie(req, name) {
    return cookieValue(req, secure ? '__Host-' + name : name);
  }

  function saveChallenge(res, kind, value, registration = null) {
    const key = token();
    const now = Date.now();
    db.prepare('DELETE FROM challenges WHERE expires_at <= ?').run(now);
    db.prepare('INSERT INTO challenges VALUES (?, ?, ?, ?, ?)').run(
      digest(key), kind, value, registration && JSON.stringify(registration), now + 300000,
    );
    setCookie(res, 'od_flow', key, 300000);
  }

  function takeChallenge(req, res, kind) {
    const key = readCookie(req, 'od_flow');
    setCookie(res, 'od_flow', '', 0);
    if (!isToken(key)) return undefined;
    return db.prepare('DELETE FROM challenges WHERE hash = ? AND kind = ? AND expires_at > ? RETURNING *')
      .get(digest(key), kind, Date.now());
  }

  function issueSession(req, res, account) {
    const previous = readCookie(req, 'od_session');
    const key = token();
    const now = Date.now();
    const ttl = 30 * 86400000;
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    if (isToken(previous)) db.prepare('DELETE FROM sessions WHERE hash = ?').run(digest(previous));
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(key), account.id, now + ttl);
    setCookie(res, 'od_session', key, ttl);
    return res.json({ account });
  }

  app.use('/api', (req, _res, next) => {
    const key = readCookie(req, 'od_session');
    if (isToken(key)) {
      req.account = db.prepare(`SELECT accounts.* FROM sessions JOIN accounts ON accounts.id = sessions.account_id
        WHERE sessions.hash = ? AND sessions.expires_at > ?`).get(digest(key), Date.now());
    }
    next();
  });

  function requireAccount(req, res, next) {
    if (!req.account) return bad(res, 401, '请先登录。');
    next();
  }

  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  });
  app.get('/api/moves', (req, res) => {
    const { q, style, level } = req.query;
    const term = normalize(q);
    const moves = [...lookup.values()].filter(move =>
      (!style || move.style === style) && (!level || move.level === level) &&
      (!term || [move.name, move.zh, move.focus, move.style].some(field => normalize(field).includes(term))),
    );
    res.json({ moves, styles });
  });
  app.get('/api/moves/:id', (req, res) => {
    const move = lookup.get(req.params.id);
    return move ? res.json(move) : bad(res, 404, '找不到该动作。');
  });
  app.get('/api/auth/me', (req, res) => res.json({ account: req.account ?? null }));

  app.post('/api/auth/register/options', async (req, res) => {
    const { code, name } = req.body ?? {};
    const displayName = clean(name);
    if (!displayName || displayName.length > 40 || !isToken(code)) return bad(res, 400, '请填写昵称并使用有效邀请。');
    const inviteHash = digest(code);
    const invite = db.prepare('SELECT 1 FROM invites WHERE hash = ? AND used_at IS NULL AND expires_at > ?')
      .get(inviteHash, Date.now());
    if (!invite) return bad(res, 409, '邀请已使用或已过期。');
    const id = randomUUID();
    const options = await generateRegistrationOptions({
      rpName: 'OpenDance', rpID, userName: displayName, userDisplayName: displayName,
      userID: Buffer.from(id), attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    saveChallenge(res, 'register', options.challenge, { id, displayName, inviteHash });
    res.json(options);
  });

  app.post('/api/auth/register/verify', async (req, res) => {
    const pending = takeChallenge(req, res, 'register');
    if (!pending) return bad(res, 400, '注册请求已失效，请重试。');
    const { id, displayName, inviteHash } = JSON.parse(pending.registration);
    let credential;
    try {
      const result = await verifyRegistrationResponse({
        response: req.body, expectedChallenge: pending.value, expectedOrigin: origin, expectedRPID: rpID,
        requireUserVerification: true,
      });
      credential = result.verified && result.registrationInfo?.credential;
    } catch {
      return bad(res, 400, '无法验证 Passkey 注册，请重试。');
    }
    if (!credential) return bad(res, 400, '无法验证 Passkey 注册，请重试。');
    const account = { id, name: displayName };
    const created = transaction(db, () => {
      const now = Date.now();
      const updated = db.prepare('UPDATE invites SET used_at = ? WHERE hash = ? AND used_at IS NULL AND expires_at > ?')
        .run(now, inviteHash, now);
      if (!updated.changes) return false;
      db.prepare('INSERT INTO accounts VALUES (?, ?)').run(id, displayName);
      db.prepare('INSERT INTO credentials VALUES (?, ?, ?, ?, ?)')
        .run(credential.id, id, credential.publicKey, credential.counter, JSON.stringify(credential.transports ?? []));
      return true;
    });
    if (!created) return bad(res, 409, '邀请已使用或已过期。');
    return issueSession(req, res, account);
  });

  app.post('/api/auth/login/options', async (_req, res) => {
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
    saveChallenge(res, 'login', options.challenge);
    res.json(options);
  });
  app.post('/api/auth/login/verify', async (req, res) => {
    const pending = takeChallenge(req, res, 'login');
    if (!pending) return bad(res, 400, '登录请求已失效，请重试。');
    const response = req.body;
    const row = typeof response?.id === 'string' && db.prepare('SELECT * FROM credentials WHERE id = ?').get(response.id);
    if (!row || (response.response?.userHandle && response.response.userHandle !== Buffer.from(row.account_id).toString('base64url'))) {
      return bad(res, 401, '找不到可用的 Passkey。');
    }
    let newCounter;
    try {
      const result = await verifyAuthenticationResponse({
        response, expectedChallenge: pending.value, expectedOrigin: origin, expectedRPID: rpID,
        requireUserVerification: true, credential: {
          id: row.id, publicKey: row.public_key, counter: row.counter, transports: JSON.parse(row.transports),
        },
      });
      if (!result.verified) return bad(res, 401, '无法验证 Passkey。');
      newCounter = result.authenticationInfo.newCounter;
    } catch {
      return bad(res, 401, '无法验证 Passkey。');
    }
    const update = db.prepare('UPDATE credentials SET counter = ? WHERE id = ? AND counter = ?')
      .run(newCounter, row.id, row.counter);
    if (!update.changes) return bad(res, 409, '登录状态已更新，请重试。');
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(row.account_id);
    return issueSession(req, res, account);
  });
  app.post('/api/auth/logout', (req, res) => {
    const key = readCookie(req, 'od_session');
    if (isToken(key)) db.prepare('DELETE FROM sessions WHERE hash = ?').run(digest(key));
    setCookie(res, 'od_session', '', 0);
    res.json({ ok: true });
  });

  app.get('/api/me/state', requireAccount, (req, res) => {
    const id = req.account.id;
    res.json({
      favorites: db.prepare('SELECT move_id FROM favorites WHERE account_id = ? ORDER BY move_id').all(id).map(row => row.move_id),
      plans: db.prepare('SELECT data FROM plans WHERE account_id = ? ORDER BY updated_at DESC, id').all(id).map(row => JSON.parse(row.data)),
      history: db.prepare('SELECT data FROM practice WHERE account_id = ? ORDER BY recorded_at DESC, id').all(id).map(row => JSON.parse(row.data)),
    });
  });

  app.put('/api/me/favorites/:id', requireAccount, (req, res) => {
    if (!lookup.has(req.params.id)) return bad(res, 404, '找不到该动作。');
    if (typeof req.body?.saved !== 'boolean') return bad(res, 400, '请选择收藏状态。');
    const sql = req.body.saved ? 'INSERT OR IGNORE INTO favorites VALUES (?, ?)' : 'DELETE FROM favorites WHERE account_id = ? AND move_id = ?';
    db.prepare(sql).run(req.account.id, req.params.id);
    res.json({ ok: true });
  });

  app.put('/api/me/plans/:id', requireAccount, (req, res) => {
    const id = req.params.id;
    const name = clean(req.body?.name);
    const moveIds = req.body?.moveIds;
    if (!validId(id) || !name || name.length > 60 || !Array.isArray(moveIds) || moveIds.length > 60 || !moveIds.every(move => lookup.has(move))) {
      return bad(res, 400, '计划名称或动作列表无效。');
    }
    const plan = { id, name, moveIds };
    db.prepare(`INSERT INTO plans VALUES (?, ?, ?, ?) ON CONFLICT(account_id, id)
      DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .run(req.account.id, id, JSON.stringify(plan), Date.now());
    res.json(plan);
  });
  app.delete('/api/me/plans/:id', requireAccount, (req, res) => {
    db.prepare('DELETE FROM plans WHERE account_id = ? AND id = ?').run(req.account.id, req.params.id);
    res.json({ ok: true });
  });

  app.put('/api/me/practice/:id', requireAccount, (req, res) => {
    const id = req.params.id;
    const { name, moveIds, mode, bpm, amount, elapsedSeconds } = req.body ?? {};
    const title = clean(name);
    const validMode = (mode === 'beats' && bounded(amount, 1, 128)) || (mode === 'time' && bounded(amount, 5, 600));
    if (!validId(id) || !title || title.length > 60 || !Array.isArray(moveIds) || !moveIds.length || moveIds.length > 60 ||
        !moveIds.every(move => lookup.has(move)) || !validMode || !bounded(bpm, 40, 200) || !bounded(elapsedSeconds, 1, 86400)) {
      return bad(res, 400, '练习记录无效。');
    }
    const now = Date.now();
    const record = { id, name: title, moveIds, mode, bpm, amount, elapsedSeconds, completedAt: new Date(now).toISOString() };
    db.prepare('INSERT OR IGNORE INTO practice VALUES (?, ?, ?, ?)').run(req.account.id, id, JSON.stringify(record), now);
    res.json(JSON.parse(db.prepare('SELECT data FROM practice WHERE account_id = ? AND id = ?').get(req.account.id, id).data));
  });

  app.use('/api', (_req, res) => bad(res, 404, '接口不存在。'));
  const dist = resolve('dist');
  const publicDir = existsSync(dist) ? dist : resolve('public');
  app.use('/media', express.static(resolve(publicDir, 'media'), { fallthrough: false }));
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false }));
    app.get(/.*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    if (error.status >= 400 && error.status < 500) return bad(res, error.status, '请求无效或资源不存在。');
    console.error(error);
    return bad(res, 500, '服务暂时无法完成请求。');
  });
  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const port = Number(process.env.PORT ?? 5173);
  const host = process.env.HOST ?? '127.0.0.1';
  createApp().listen(port, host, () => console.log(`OpenDance listening on ${host}:${port}`));
}
