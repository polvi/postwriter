import type { InboxMessage, NoteDoc, UserInfo } from './noteFormat';

/**
 * notedrop runs on mf, tailnet-only. The device is on the tailnet, so the
 * platform identifies this user from the connection: no token, no login.
 * PluginHost blocks cleartext HTTP; the ts.net hostname carries a real cert.
 */
export const BASE_URL = 'https://notedrop.tailb55c1.ts.net';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, init);
  } catch (error) {
    throw new ApiError(`network: ${(error as Error).message} (is Tailscale connected?)`, 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = (body as { error?: string; hint?: string } | null)?.error ?? res.statusText;
    const hint = (body as { hint?: string } | null)?.hint;
    throw new ApiError(hint ? `${msg} (${hint})` : msg, res.status);
  }
  return body as T;
}

const json = (data: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

export const api = {
  me: () => call<UserInfo>('/me'),
  users: () => call<UserInfo[]>('/users'),
  inbox: () => call<InboxMessage[]>('/inbox'),
  sent: () => call<InboxMessage[]>('/sent'),
  note: (id: string) => call<NoteDoc>(`/inbox/${encodeURIComponent(id)}`),
  send: (id: string, to: string, note: NoteDoc) =>
    call<{ id: string; created: boolean; elements: number }>('/send', json({ id, to, note })),
  delivered: (id: string) => call<{ status: 'delivered' | 'already' }>(`/inbox/${encodeURIComponent(id)}/delivered`, { method: 'POST' }),
};

/** Good enough for an idempotency key; the plugin runtime has no crypto.randomUUID. */
export function newId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = `${Date.now().toString(36)}-`;
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
