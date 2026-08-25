#!/usr/bin/env bash
# Tail the plugin host + plugin JS runtime. logcat is the only debugging
# channel: the plugin runtime is not readable from a shell.
#   plugin/scripts/logs.sh            live tail
#   plugin/scripts/logs.sh --capture  dump recent buffer and exit
set -euo pipefail
DEVICE="${SNPLG_DEVICE:-100.86.171.55:5555}"
# Tag filters need -s (silently ignored otherwise on Android 11).
TAGS="-s ReactNativeJS:V PluginApp:V PluginManager:V PluginContainerService:V PluginInstallManager:V PluginSettings:V"
NOISE="verifyParams|PluginContainerService: \[Finger\]|PluginStateTaskQueue"
if [ "${1:-}" = "--capture" ]; then
  adb -s "$DEVICE" logcat -v time -d $TAGS 2>/dev/null | grep -vE "$NOISE" | tail -200
else
  adb -s "$DEVICE" logcat -v time -T 1 $TAGS | grep -vE "$NOISE"
fi
