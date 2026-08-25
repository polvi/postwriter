import { Image } from 'react-native';
import { PluginManager } from 'sn-plugin-lib';

/** Stable across versions: the host keys button state by id. */
export const SIDE_BUTTON_ID = 110;

/**
 * Register the NOTE sidebar entry. showType 1 means "open the plugin view",
 * so no headless listener is needed: everything happens in App.tsx.
 *
 * The host persists a side-button's label across an in-place upgrade, so the
 * button is unregistered first; otherwise a renamed button keeps its old name.
 */
export async function registerSideButton(): Promise<void> {
  try {
    await PluginManager.unregisterButton(SIDE_BUTTON_ID);
  } catch (error) {
    console.log(`[notedrop] no stale button to remove: ${(error as Error).message}`);
  }
  try {
    await PluginManager.registerButton(1, ['NOTE'], {
      id: SIDE_BUTTON_ID,
      name: 'Post Writer',
      icon: Image.resolveAssetSource(require('../assets/icon.png')).uri,
      showType: 1,
    });
  } catch (error) {
    console.log(`[notedrop] side button registration failed: ${(error as Error).message}`);
  }
}
