// Identity is the tailnet user, full stop. The mf platform's proxy strips
// Tailscale-* headers from anything that did not arrive over tailscale, so
// what env.TAILNET.identity() reports is trustworthy and no client-supplied
// value is ever used as a login.

import type { Context, Next } from 'hono';
import type { AppContext, Env } from './env';

export async function whoami(request: Request, env: Env): Promise<{ login: string; name: string } | null> {
  if (env.DEV_USER_ID) return { login: env.DEV_USER_ID, name: env.DEV_USER_ID.split('@')[0] ?? env.DEV_USER_ID };
  if (!env.TAILNET) return null;
  // A body-consumed Request cannot cross the RPC boundary; send headers only.
  const probe = new Request(request.url, { headers: request.headers });
  const who = await env.TAILNET.identity(probe).catch(() => null);
  if (!who?.login) return null;
  return { login: who.login, name: who.name || who.login };
}

/** Hono middleware: 401 unless the tailnet vouches for the caller; upserts the user row. */
export async function requireUser(c: Context<AppContext>, next: Next): Promise<Response | void> {
  const user = await whoami(c.req.raw, c.env);
  if (!user) {
    return c.json({ error: 'unauthenticated', hint: 'notedrop is reachable only over the tailnet' }, 401);
  }
  await c.env.DB.prepare(
    `INSERT INTO users (login, name) VALUES (?, ?)
     ON CONFLICT(login) DO UPDATE SET name = excluded.name, last_seen = datetime('now')`,
  )
    .bind(user.login, user.name)
    .run();
  c.set('user', user);
  await next();
}
