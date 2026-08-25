#!/usr/bin/env bash
# Swap the JS bundle on the device without reinstalling (PluginHost's debug
# receiver). Use after the first real install via deploy.sh.
#   plugin/scripts/hotreload.sh [--build]
set -euo pipefail
cd "$(dirname "$0")/.."
DEVICE="${SNPLG_DEVICE:-100.86.171.55:5555}"
PLUGIN_ID="notedrop00000001"
BUNDLE="build/generated/postwriter.bundle"
DEST="/storage/emulated/0/MyStyle/postwriter.bundle"

[ "${1:-}" = "--build" ] && bash buildPlugin.sh >/dev/null
[ -f "$BUNDLE" ] || { echo "missing $BUNDLE; run buildPlugin.sh" >&2; exit 1; }

echo "==> pushing bundle to $DEST"
adb -s "$DEVICE" push "$BUNDLE" "$DEST" >/dev/null
echo "==> hot-reloading pluginID=$PLUGIN_ID"
adb -s "$DEVICE" shell am broadcast \
  -n com.ratta.supernote.pluginhost/.receiver.PluginReceiver \
  -a com.ratta.supernote.plugin.action.DEBUG -f 0x01000000 \
  --es bundle_path "$DEST" --es plugin_id "$PLUGIN_ID" >/dev/null
echo "OK. Tail logs with scripts/logs.sh"
