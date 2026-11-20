import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');

export function openDb(path = resolve(process.env.DATA_DIR ?? 'data', 'opendance.sqlite')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
      public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invites (hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, used_at INTEGER);
    CREATE TABLE IF NOT EXISTS challenges (
      hash TEXT PRIMARY KEY, kind TEXT NOT NULL, value TEXT NOT NULL,
      registration TEXT, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS favorites (
      account_id TEXT NOT NULL REFERENCES accounts(id), move_id TEXT NOT NULL, PRIMARY KEY(account_id, move_id)
    );
    CREATE TABLE IF NOT EXISTS plans (
      account_id TEXT NOT NULL REFERENCES accounts(id), id TEXT NOT NULL,
      data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(account_id, id)
    );
    CREATE TABLE IF NOT EXISTS practice (
      account_id TEXT NOT NULL REFERENCES accounts(id), id TEXT NOT NULL,
      data TEXT NOT NULL, recorded_at INTEGER NOT NULL, PRIMARY KEY(account_id, id)
    );
  `);
  return db;
}

export function makeInvite(db) {
  const code = token();
  db.prepare('INSERT INTO invites (hash, expires_at) VALUES (?, ?)').run(digest(code), Date.now() + 7 * 86400000);
  return code;
}

export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
