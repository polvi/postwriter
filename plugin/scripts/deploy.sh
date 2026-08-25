#!/usr/bin/env bash
# Build + install notedrop.snplg on the Supernote over adb (Wi-Fi / tailnet).
#
#   plugin/scripts/deploy.sh [--no-build]
#   SNPLG_DEVICE=host:5555 (default: the Nomad on the tailnet)
#
# No root needed: push the .snplg to MyStyle, deep-link Settings → Plugins,
# then drive the install dialog with uiautomator dumps + taps, and wait for
# "PluginInstallManager: Install Success" in logcat. Reinstalling the same
# pluginID is an in-place upgrade.
set -euo pipefail
cd "$(dirname "$0")/.."
DEVICE="${SNPLG_DEVICE:-100.86.171.55:5555}"
MYSTYLE="/storage/emulated/0/MyStyle"
NO_BUILD=0
[ "${1:-}" = "--no-build" ] && NO_BUILD=1

step() { printf '\n==> %s\n' "$*"; }
adb() { command adb -s "$DEVICE" "$@"; }

command adb devices | awk -v d="$DEVICE" '$1==d && $2=="device"' | grep -q . || command adb connect "$DEVICE" >/dev/null
adb get-state >/dev/null

[ "$NO_BUILD" = 1 ] || bash buildPlugin.sh >/dev/null
SNPLG=build/outputs/postwriter.snplg
[ -f "$SNPLG" ] || { echo "no $SNPLG" >&2; exit 1; }
NAME="$(basename "$SNPLG")"

UIXML="${TMPDIR:-/tmp}/notedrop-ui-$$.xml"
trap 'rm -f "$UIXML"; adb shell rm -f /sdcard/_ui.xml >/dev/null 2>&1 || true' EXIT

ui_dump() {
  for _ in 1 2 3 4; do
    adb shell input keyevent 224 >/dev/null
    sleep 0.7
    if adb shell uiautomator dump /sdcard/_ui.xml >/dev/null 2>&1 && adb pull /sdcard/_ui.xml "$UIXML" >/dev/null 2>&1 && [ -s "$UIXML" ]; then
      return 0
    fi
    sleep 1
  done
  echo "uiautomator dump failed (screen asleep or mid-transition?)" >&2
  return 1
}

# Tap the first node whose text equals any of the labels given.
ui_tap_text() {
  local text pt
  for text in "$@"; do
    pt=$(python3 - "$UIXML" "$text" <<'EOF'
import re, sys
xml, target = open(sys.argv[1]).read(), sys.argv[2]
for node in re.findall(r'<node [^>]*?/?>', xml):
    m = re.search(r'text="([^"]*)"', node)
    if not m or m.group(1) != target:
        continue
    b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
    if b:
        x1, y1, x2, y2 = map(int, b.groups())
        print((x1 + x2) // 2, (y1 + y2) // 2)
        sys.exit(0)
sys.exit(1)
EOF
    ) || continue
    set -- $pt
    adb shell input tap "$1" "$2"
    sleep 2.5
    return 0
  done
  echo "UI node not found: $*" >&2
  return 1
}

step "pushing $NAME to $MYSTYLE"
adb push "$SNPLG" "$MYSTYLE/$NAME" >/dev/null

step "opening Settings → Plugins"
adb logcat -c 2>/dev/null || true
adb shell am start -n com.ratta.settings/.SettingsActivity -a com.ratta.settings.application.PluginManagerFragment >/dev/null
sleep 3

step "tap: Add Plugin"
ui_dump; ui_tap_text "Add Plugin" "Choose Installation Package"
step "tap: $NAME"
ui_dump; ui_tap_text "$NAME"
step "tap: Install"
ui_dump; ui_tap_text "Install"

step "waiting for install result"
for _ in $(seq 1 30); do
  LOG="$(adb logcat -d 2>/dev/null | grep -E 'PluginInstallManager|startInstallTask' | tail -20)"
  if echo "$LOG" | grep -q "Install Success"; then
    adb shell input keyevent 3 >/dev/null
    step "INSTALL OK"
    exit 0
  fi
  if echo "$LOG" | grep -qiE "fail|exception|error"; then
    echo "install FAILED:" >&2; echo "$LOG" >&2; exit 1
  fi
  sleep 1
done
echo "timed out waiting for install result; check scripts/logs.sh --capture" >&2
exit 1
