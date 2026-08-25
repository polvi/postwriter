import type { Env } from './env';

export interface UserRow {
  login: string;
  name: string;
  last_seen: string;
}

export interface MessageRow {
  id: string;
  from_login: string;
  to_login: string;
  title: string;
  pages: number;
  bytes: number;
  created_at: string;
  delivered_at: string | null;
}

export async function listUsers(env: Env): Promise<UserRow[]> {
  const r = await env.DB.prepare('SELECT login, name, last_seen FROM users ORDER BY last_seen DESC').all<UserRow>();
  return r.results;
}

export async function userExists(env: Env, login: string): Promise<boolean> {
  const r = await env.DB.prepare('SELECT 1 AS one FROM users WHERE login = ?').bind(login).first<{ one: number }>();
  return r !== null;
}

/**
 * Idempotent on the client-supplied id: a retried send is one message.
 * Body first, row second, in one batch: an inbox row whose body is missing
 * would be an unpullable message. Returns false if the id already existed.
 */
export async function insertMessage(
  env: Env,
  m: Pick<MessageRow, 'id' | 'from_login' | 'to_login' | 'title' | 'pages' | 'bytes'>,
  body: string,
): Promise<boolean> {
  const [, row] = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO note_bodies (id, body) VALUES (?, ?)').bind(m.id, body),
    env.DB.prepare(
      `INSERT OR IGNORE INTO messages (id, from_login, to_login, title, pages, bytes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(m.id, m.from_login, m.to_login, m.title, m.pages, m.bytes),
  ]);
  return (row?.meta.changes ?? 0) > 0;
}

export async function getBody(env: Env, id: string): Promise<string | null> {
  const r = await env.DB.prepare('SELECT body FROM note_bodies WHERE id = ?').bind(id).first<{ body: string }>();
  return r?.body ?? null;
}

export async function inbox(env: Env, login: string): Promise<MessageRow[]> {
  const r = await env.DB.prepare(
    `SELECT * FROM messages WHERE to_login = ? AND delivered_at IS NULL ORDER BY created_at ASC`,
  )
    .bind(login)
    .all<MessageRow>();
  return r.results;
}

export async function sent(env: Env, login: string): Promise<MessageRow[]> {
  const r = await env.DB.prepare(`SELECT * FROM messages WHERE from_login = ? ORDER BY created_at DESC LIMIT 100`)
    .bind(login)
    .all<MessageRow>();
  return r.results;
}

export async function getMessageFor(env: Env, id: string, login: string): Promise<MessageRow | null> {
  return env.DB.prepare('SELECT * FROM messages WHERE id = ? AND to_login = ?').bind(id, login).first<MessageRow>();
}

/**
 * The one state transition. A single conditional UPDATE so two concurrent
 * pulls (or a retry after a lost response) flip delivered_at exactly once;
 * the caller only issues it after the note is safely written on-device.
 */
export async function markDelivered(env: Env, id: string, login: string): Promise<'delivered' | 'already' | 'missing'> {
  const r = await env.DB.prepare(
    `UPDATE messages SET delivered_at = datetime('now') WHERE id = ? AND to_login = ? AND delivered_at IS NULL`,
  )
    .bind(id, login)
    .run();
  if ((r.meta.changes ?? 0) > 0) return 'delivered';
  const row = await getMessageFor(env, id, login);
  return row ? 'already' : 'missing';
}
