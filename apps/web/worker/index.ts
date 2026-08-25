import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser } from './auth';
import * as db from './db';
import type { AppContext } from './env';
import { llmsTxt } from './llms';
import { MAX_NOTE_BYTES, elementCount, noteSchema } from './note-format';

const ID_RE = /^[0-9a-zA-Z_-]{8,64}$/;

const sendSchema = z.object({
  id: z.string().regex(ID_RE, 'id must be 8-64 url-safe chars (a uuid is fine)'),
  to: z.string().min(1).max(200),
  note: noteSchema,
});

const app = new Hono<AppContext>();

app.get('/llms.txt', (c) => c.text(llmsTxt));

const api = new Hono<AppContext>();
api.use('*', requireUser);

api.get('/me', (c) => c.json(c.get('user')));

api.get('/users', async (c) => {
  const me = c.get('user').login;
  const users = (await db.listUsers(c.env)).filter((u) => u.login !== me);
  return c.json(users);
});

api.post('/send', async (c) => {
  const me = c.get('user').login;
  const raw = await c.req.text();
  if (raw.length > MAX_NOTE_BYTES) return c.json({ error: 'note too large' }, 413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const parsed = sendSchema.safeParse(json);
  if (!parsed.success) return c.json({ error: 'invalid send', issues: parsed.error.issues.slice(0, 5) }, 400);
  const { id, to, note } = parsed.data;
  // Sending to yourself is allowed on purpose: it is how a one-device setup
  // tests the round trip, and it doubles as "move this note to INBOX".
  if (to !== me && !(await db.userExists(c.env, to))) {
    return c.json({ error: 'unknown recipient', hint: 'they need to open the notedrop plugin once' }, 404);
  }
  const body = JSON.stringify(note);
  const created = await db.insertMessage(
    c.env,
    { id, from_login: me, to_login: to, title: note.title, pages: note.pages.length, bytes: body.length },
    body,
  );
  return c.json({ id, created, elements: elementCount(note) }, created ? 201 : 200);
});

api.get('/inbox', async (c) => {
  const rows = await db.inbox(c.env, c.get('user').login);
  return c.json(rows.map(publicMessage));
});

api.get('/sent', async (c) => {
  const rows = await db.sent(c.env, c.get('user').login);
  return c.json(rows.map(publicMessage));
});

api.get('/inbox/:id', async (c) => {
  const row = await db.getMessageFor(c.env, c.req.param('id'), c.get('user').login);
  if (!row) return c.json({ error: 'not found' }, 404);
  const body = await db.getBody(c.env, row.id);
  if (body === null) return c.json({ error: 'note body missing' }, 410);
  return new Response(body, {
    headers: { 'content-type': 'application/json', 'x-notedrop-from': row.from_login, 'x-notedrop-title': encodeURIComponent(row.title) },
  });
});

api.post('/inbox/:id/delivered', async (c) => {
  const status = await db.markDelivered(c.env, c.req.param('id'), c.get('user').login);
  if (status === 'missing') return c.json({ error: 'not found' }, 404);
  return c.json({ status });
});

app.route('/api', api);

// The status page (inbox / sent / people) lives at /inbox; the landing page is /.
app.get('/inbox', (c) => c.env.ASSETS.fetch(new Request(new URL('/inbox.html', c.req.url), c.req.raw)));

app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'not found' }, 404) : c.env.ASSETS.fetch(c.req.raw)));

function publicMessage(m: db.MessageRow) {
  return {
    id: m.id,
    from: m.from_login,
    to: m.to_login,
    title: m.title,
    pages: m.pages,
    bytes: m.bytes,
    created_at: m.created_at,
    delivered_at: m.delivered_at,
  };
}

export default app;
