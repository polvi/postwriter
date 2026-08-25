/**
 * Diagnostics: exercise the SDK surface notedrop depends on and report what
 * this host actually implements. Results go to the status line and logcat.
 * Used to find the page-index base and the permission model per firmware.
 */

import { PluginFileAPI, PluginManager } from 'sn-plugin-lib';
import { PERMISSIONS, device } from './device';

async function attempt(label: string, fn: () => Promise<unknown>): Promise<string> {
  try {
    const r = await fn();
    const s = typeof r === 'object' ? JSON.stringify(r).slice(0, 80) : String(r);
    return `${label}: ok ${s}`;
  } catch (error) {
    return `${label}: ERR ${(error as Error).message.slice(0, 80)}`;
  }
}

export async function runProbe(notePath: string | null): Promise<string[]> {
  const lines: string[] = [];
  lines.push(await attempt('deviceType', () => PluginManager.getDeviceType()));
  for (const p of [PERMISSIONS.read, PERMISSIONS.write, PERMISSIONS.internet, 'plugin.permission.FILE:DELETE']) {
    lines.push(await attempt(`has ${p.split('.').pop()}`, () => PluginManager.hasPermission(p)));
  }
  if (notePath) {
    lines.push(await attempt('totalPages', () => device.totalPages(notePath)));
    for (const page of [0, 1, 2]) {
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
  } else {
    lines.push('no note open: page probes skipped');
  }
  lines.push(await attempt('openFile typeof', async () => typeof PluginFileAPI.openFile));
  for (const l of lines) console.log(`[notedrop] probe ${l}`);
  return lines;
}
