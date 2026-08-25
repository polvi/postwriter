/**
 * notedrop plugin entry. PluginHost runs this once per plugin runtime; a
 * side-button press in NOTE opens the plugin view (App.tsx).
 * @format
 */

import { AppRegistry } from 'react-native';
import { PluginManager } from 'sn-plugin-lib';
import App from './App';
import { name as appName } from './app.json';
import { BUILD_STAMP } from './src/buildStamp';
import { registerSideButton } from './src/buttons';

// Top-level so logcat proves which bundle is running.
console.log('[notedrop] bundle ' + BUILD_STAMP.git + ' ' + BUILD_STAMP.builtAt);

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();
void registerSideButton();
