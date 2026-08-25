/**
 * Post Writer plugin entry. PluginHost runs this once per plugin runtime; a
 * side-button press in NOTE opens the plugin view (App.tsx). The sidebar
 * entry only exists because this file registers it, so registration is
 * retried whenever the host tells us the view came up.
 * @format
 */

import { AppRegistry } from 'react-native';
import { PluginManager } from 'sn-plugin-lib';
import App from './App';
import { name as appName } from './app.json';
import { BUILD_STAMP } from './src/buildStamp';
import { ensureSideButton, registerConfigEntry } from './src/buttons';
import { onShown } from './src/lifecycle';

// Top-level so logcat proves which bundle is running.
console.log('[postwriter] bundle ' + BUILD_STAMP.git + ' ' + BUILD_STAMP.builtAt);

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();
void ensureSideButton();
registerConfigEntry();
// Timers do not run in this runtime, so a failed first attempt (native side
// not up yet) is retried on the next lifecycle event instead. A no-op once
// the button is registered.
onShown(() => void ensureSideButton());
