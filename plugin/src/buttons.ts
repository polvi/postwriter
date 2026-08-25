/**
 * The sidebar entry. On this host the row in a note's puzzle menu *is* a
 * registered side button, so a plugin that fails to register one installs
 * fine and then has no way in at all - which is exactly what a first-time
 * installer sees. Registration is therefore treated as a real operation
 * rather than fire-and-forget: it is retried with each icon form the host
 * might accept, a `false` result counts as a refusal (registerButton
 * resolves false when the host declines), and the outcome is kept for Diag.
 */

import { Image } from 'react-native';
import { PluginManager } from 'sn-plugin-lib';

/** Stable across versions: the host keys button state by id. */
export const SIDE_BUTTON_ID = 110;
const BUTTON_NAME = 'Post Writer';

let status = 'not attempted';
let registered = false;

/** What the last registration attempt did, for the Diag report. */
export function sideButtonStatus(): string {
  return status;
}

/**
 * Icon strings to try, most likely first. The packaged icon is the same file
 * PluginConfig.json points at (`/icon.png` in the package, copied there by
 * buildPlugin.sh), so the host can already load it for its own menus. The
 * bundler's asset uri is last: in a release bundle it is an Android drawable
 * name, which resolves against an apk the plugin does not have.
 */
async function iconCandidates(): Promise<string[]> {
  const out: string[] = [];
  try {
    const dir = await PluginManager.getPluginDirPath();
    if (dir) out.push(`${dir.replace(/\/+$/, '')}/icon.png`);
  } catch (error) {
    console.log(`[postwriter] no plugin dir path: ${(error as Error).message}`);
  }
  out.push('/icon.png');
  try {
    const uri = Image.resolveAssetSource(require('../assets/icon.png') as number)?.uri;
    if (uri) out.push(uri);
  } catch (error) {
    console.log(`[postwriter] no bundled asset uri: ${(error as Error).message}`);
  }
  // An entry with no icon still gets the user in; a missing entry does not.
  out.push('');
  return out;
}

/**
 * Register the NOTE sidebar entry, unless this runtime already did.
 * showType 1 means "open the plugin view", so no headless listener is
 * needed: everything happens in App.tsx.
 */
export async function ensureSideButton(): Promise<string> {
  if (registered) return status;
  // The host persists a side button's label across an in-place upgrade, so
  // the stale button is removed first; otherwise a renamed button keeps its
  // old name.
  try {
    await PluginManager.unregisterButton(SIDE_BUTTON_ID);
  } catch (error) {
    console.log(`[postwriter] no stale button to remove: ${(error as Error).message}`);
  }
  const tried: string[] = [];
  for (const icon of await iconCandidates()) {
    const label = icon === '' ? 'no icon' : icon;
    try {
      const ok = await PluginManager.registerButton(1, ['NOTE'], {
        id: SIDE_BUTTON_ID,
        name: BUTTON_NAME,
        desc: 'Send this note to someone on the tailnet.',
        icon,
        // The SDK's button bean defaults enable to false, and a button
        // registered disabled is not an entry anyone can tap.
        enable: true,
        // 0: a plain sidebar entry, not an extension of pen/eraser/layer.
        expandButton: 0,
        showType: 1,
      });
      if (ok !== false) {
        registered = true;
        status = `registered, icon ${label}`;
        console.log(`[postwriter] side button ${status}`);
        return status;
      }
      tried.push(`${label}: refused`);
    } catch (error) {
      tried.push(`${label}: ${(error as Error).message}`);
    }
  }
  status = `NOT registered (${tried.join('; ')})`;
  console.log(`[postwriter] side button ${status}`);
  return status;
}

/**
 * A second way in, for a host where the sidebar entry never appears: the
 * plugin's row in Settings gets a config button, and pressing it shows the
 * plugin view. Best effort - older hosts have neither call.
 */
export function registerConfigEntry(): void {
  try {
    PluginManager.registerConfigButtonListener({
      onClick: () => {
        void PluginManager.showPluginView();
      },
    });
    void Promise.resolve(PluginManager.registerConfigButton()).catch((error: Error) =>
      console.log(`[postwriter] config button refused: ${error.message}`),
    );
  } catch (error) {
    console.log(`[postwriter] no config button API on this host: ${(error as Error).message}`);
  }
}
