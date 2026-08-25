import { describe, expect, test } from 'bun:test';
import type { Env } from '../worker/env';
import app from '../worker/index';

/** The asset server as mf serves it: a zip media type on a .snplg name. */
function envWith(response: Response): Env {
  return { ASSETS: { fetch: async () => response } } as unknown as Env;
}

const pkg = (): Response =>
  new Response('PK pretend plugin package', { headers: { 'content-type': 'application/zip', etag: '"v4"' } });

describe('plugin download', () => {
  test('is served as an attachment named .snplg, not a zip', async () => {
    const res = await app.request('http://x/postwriter.snplg', {}, envWith(pkg()));
    expect(res.status).toBe(200);
    // Safari renames a download to match the media type it was given; an
    // octet-stream keeps the .snplg name the Supernote installer expects.
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="postwriter.snplg"');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toContain('pretend plugin package');
  });

  test('a missing package passes the asset server response through', async () => {
    const res = await app.request('http://x/postwriter.snplg', {}, envWith(new Response('not found', { status: 404 })));
    expect(res.status).toBe(404);
    expect(res.headers.get('content-disposition')).toBe(null);
  });
});
