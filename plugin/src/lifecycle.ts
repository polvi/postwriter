/**
 * Plugin lifecycle → "the view was (re)shown" signal. The view stays
 * mounted between openings, so React effects alone never re-run; the host's
 * lifecycle events (init, mount, start, pause, unmount, destroy) are the only
 * way to know the user came back. Older hosts lack the API; then nothing
 * fires and the manual Refresh buttons remain the way.
 */

import { PluginManager } from 'sn-plugin-lib';

type Listener = () => void;
const listeners = new Set<Listener>();
let registered = false;
let lastFired = 0;

export function onShown(fn: Listener): () => void {
  listeners.add(fn);
  register();
  return () => listeners.delete(fn);
}

function register(): void {
  if (registered) return;
  registered = true;
  try {
    PluginManager.registerPluginLifeListener({
      onMsg: (msg: unknown) => {
        const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
        console.log(`[postwriter] lifecycle ${text}`);
        // The host sends {state: n} with n in the changelog's order:
        // 0 init, 1 mount, 2 start, 3 pause, 4 unmount, 5 destroy (observed:
        // 3 on closing the view, 2 on reopening it). Only mount/start mean
        // "shown"; a burst on one opening collapses into one refresh.
        const state = typeof msg === 'object' && msg !== null ? (msg as { state?: number }).state : undefined;
        if (typeof state === 'number' ? state !== 1 && state !== 2 : /pause|unmount|destroy/i.test(text)) return;
        const now = Date.now();
        if (now - lastFired < 1500) return;
        lastFired = now;
        for (const fn of listeners) fn();
      },
    });
  } catch (error) {
    console.log(`[postwriter] no lifecycle API on this host: ${(error as Error).message}`);
  }
}
