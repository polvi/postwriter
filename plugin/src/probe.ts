/**
 * Diagnostics: exercise the SDK surface Post Writer depends on and report
 * what this host actually implements. Results go to the status line and
 * logcat. Used to find the page-index base and the permission model per
 * firmware. Expected failures are labelled so they do not read as bugs.
 */

import { PluginFileAPI, PluginManager } from 'sn-plugin-lib';
import { PERMISSIONS, device } from './device';

async function attempt(label: string, fn: () => Promise<unknown>, expectError = false): Promise<string> {
  try {
    const r = await fn();
    const s = typeof r === 'object' ? JSON.stringify(r).slice(0, 80) : String(r);
    return `${label}: ${expectError ? 'UNEXPECTED ok' : 'ok'} ${s}`;
  } catch (error) {
    const msg = (error as Error).message.slice(0, 70);
    return `${label}: ${expectError ? 'expected error' : 'ERR'} ${msg}`;
  }
}

export async function runProbe(notePath: string | null): Promise<string[]> {
  const lines: string[] = [];
  const machine = await attempt('deviceType', () => PluginManager.getDeviceType());
  lines.push(`${machine} (0 A5, 1 A6, 2 A6X, 3 A5X, 4 A6X2 Nomad, 5 A5X2 Manta)`);
  for (const p of [PERMISSIONS.internet, PERMISSIONS.read, PERMISSIONS.write]) {
    lines.push(await attempt(`permission ${p.split('.').pop()}`, async () => ((await PluginManager.hasPermission(p)) === 1 ? 'granted' : 'NOT granted')));
  }
  if (notePath) {
    lines.push(`note: ${notePath}`);
    let total = 0;
    try {
      total = await device.totalPages(notePath);
      lines.push(`totalPages: ok ${total}`);
    } catch (error) {
      lines.push(`totalPages: ERR ${(error as Error).message.slice(0, 70)}`);
    }
    for (let page = 0; page < Math.min(total, 3); page++) {
      lines.push(await attempt(`pageSize(${page})`, () => device.pageSize(notePath, page)));
      lines.push(
        await attempt(`elements(${page})`, async () => {
          const els = await device.elements(notePath, page);
          const out = {
            n: els.length,
            pageNum: els[0]?.pageNum,
            numInPage: els[0]?.numInPage,
            recycle: typeof els[0]?.recycle,
            points: typeof els[0]?.stroke?.points?.getRange,
          };
          for (const el of els) {
            if (typeof el.recycle === 'function') await el.recycle().catch(() => undefined);
            else if (el.uuid) device.recycle(el.uuid);
          }
          return out;
        }),
      );
    }
    // One past the end tells us the index base: 0-based hosts reject
    // page == total, a 1-based host would accept it.
    lines.push(await attempt(`pageSize(${total}) past end`, () => device.pageSize(notePath, total), true));
  } else {
    lines.push('no note open: page probes skipped');
  }
  lines.push(await attempt('openFile available', async () => typeof PluginFileAPI.openFile === 'function'));
  lines.push(await attempt('lifecycle API available', async () => typeof PluginManager.registerPluginLifeListener === 'function'));
  for (const l of lines) console.log(`[postwriter] probe ${l}`);
  return lines;
}
