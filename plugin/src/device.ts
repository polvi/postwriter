/**
 * The only file that touches sn-plugin-lib. Every SDK call returns
 * {success, result, error}; `unwrap` turns that into a value or a thrown
 * Error with the SDK's code and message, which the UI shows verbatim
 * (logcat is the only other debugging channel on the device).
 */

import { PluginCommAPI, PluginFileAPI, PluginManager, PointUtils } from 'sn-plugin-lib';
import type { Element } from 'sn-plugin-lib';

interface ApiResponse<T> {
  success: boolean;
  result: T | null;
  error: { code: number; message: string } | null;
}

function unwrap<T>(resp: unknown, what: string): T {
  const r = resp as ApiResponse<T> | null | undefined;
  if (!r) throw new Error(`${what}: no response`);
  if (!r.success) throw new Error(`${what}: ${r.error?.code ?? '?'} ${r.error?.message ?? 'failed'}`);
  if (r.result === null || r.result === undefined) throw new Error(`${what}: empty result`);
  return r.result;
}

export const PERMISSIONS = {
  read: 'plugin.permission.FILE:READ',
  write: 'plugin.permission.FILE:WRITE',
  internet: 'plugin.permission.INTERNET',
} as const;

/**
 * Ensure the given permissions are granted. The host's dialog defaults to
 * "allow this time", which is revoked when the plugin closes, so the UI
 * tells the user to pick "Always allow". Returns the first permission that
 * was refused, or null when all are granted.
 */
export async function ensurePermissions(perms: string[]): Promise<string | null> {
  for (const p of perms) {
    let has: number;
    try {
      has = await PluginManager.hasPermission(p);
    } catch (error) {
      // Firmware whose PluginHost predates the permission API (seen on
      // Chauvet 3.x, host 1.00.26005190) has no native hasPermission at all;
      // there is nothing to grant there, so carry on.
      console.log(`[postwriter] no permission API on this host (${(error as Error).message}); continuing`);
      return null;
    }
    if (has === 1) continue;
    const r = await PluginManager.requestPermission(p, 'Post Writer needs this to send and receive notes.');
    if (r !== 1 && r !== 2) return p;
  }
  return null;
}

let emrCache: { width: number; height: number } | null = null;

/** Max EMR digitizer coordinates for this device; points normalise against this. */
export async function getEmrSize(): Promise<{ width: number; height: number }> {
  if (emrCache) return emrCache;
  try {
    const machine = await PluginManager.getDeviceType();
    const pageSize =
      machine === PointUtils.MACHINE_TYPE_A6X2
        ? PointUtils.A6X2_PAGE_MAX_SIZE
        : machine === PointUtils.MACHINE_TYPE_A5X2
          ? PointUtils.A5X2_PAGE_SIZE
          : PointUtils.NORMAL_PAGE_SIZE;
    emrCache = { width: PointUtils.getRealMaxX(pageSize), height: PointUtils.getRealMaxY(pageSize) };
  } catch {
    // Nomad (A6X2) geometry, verified on hardware.
    emrCache = { width: 21632, height: 16224 };
  }
  return emrCache;
}

export const device = {
  currentFilePath: async (): Promise<string> => unwrap<string>(await PluginCommAPI.getCurrentFilePath(), 'getCurrentFilePath'),
  totalPages: async (notePath: string): Promise<number> =>
    unwrap<number>(await PluginFileAPI.getNoteTotalPageNum(notePath), 'getNoteTotalPageNum'),
  pageSize: async (notePath: string, page: number): Promise<{ width: number; height: number }> =>
    unwrap(await PluginFileAPI.getPageSize(notePath, page), 'getPageSize'),
  elements: async (notePath: string, page: number): Promise<Element[]> =>
    unwrap<Element[]>(await PluginFileAPI.getElements(page, notePath), `getElements(${page})`),
  createElement: async (type: number): Promise<Element> => unwrap<Element>(await PluginCommAPI.createElement(type), 'createElement'),
  recycle: (uuid: string): void => PluginCommAPI.recycleElement(uuid),
  insertElements: async (notePath: string, page: number, elements: Element[]): Promise<void> => {
    unwrap<unknown>(await PluginFileAPI.insertElements(notePath, page, elements as unknown as object[]), `insertElements(${page})`);
  },
  insertPage: async (notePath: string, page: number, template: string): Promise<void> => {
    unwrap<unknown>(await PluginFileAPI.insertNotePage({ notePath, page, template }), `insertNotePage(${page})`);
  },
  createNote: async (notePath: string, template: string, isPortrait: boolean): Promise<void> => {
    unwrap<unknown>(await PluginFileAPI.createNote({ notePath, template, mode: 0, isPortrait }), 'createNote');
  },
  noteExists: async (notePath: string): Promise<boolean> => {
    try {
      await device.totalPages(notePath);
      return true;
    } catch {
      return false;
    }
  },
  openFile: async (path: string, page: number): Promise<void> => {
    unwrap<unknown>(await PluginFileAPI.openFile(path, page), 'openFile');
  },
  reload: async (): Promise<void> => {
    try {
      await PluginCommAPI.reloadFile();
    } catch {
      /* not fatal */
    }
  },
  /** First system template name, or the one every device has. */
  template: async (): Promise<string> => {
    try {
      const r = (await PluginCommAPI.getNoteSystemTemplates()) as ApiResponse<{ name: string }[]> | null;
      return r?.success && r.result?.[0]?.name ? r.result[0].name : 'style_white';
    } catch {
      return 'style_white';
    }
  },
  close: (): void => {
    void PluginManager.closePluginView();
  },
};
