#!/usr/bin/env bash
# Dev helper: drive the Nomad's screen over adb.
#   scripts/drive.sh open        open the plugin view from an open note (plugins icon → notedrop)
#   scripts/drive.sh send        tap the first "Send ›" row
#   scripts/drive.sh inbox       switch to the Inbox tab
#   scripts/drive.sh pull        tap the first inbox row
#   scripts/drive.sh tap X Y     raw tap (1920x2560 coordinates)
#   scripts/drive.sh shot        screenshot to $OUT (default build/screen.png)
# Coordinates are for the Nomad (A6X2) portrait layout; they are a dev
# convenience, not part of the product.
set -euo pipefail
cd "$(dirname "$0")/.."
export ADB_LIBUSB="${ADB_LIBUSB:-0}"
DEVICE="${SNPLG_DEVICE:-100.86.171.55:5555}"
OUT="${OUT:-build/screen.png}"
d() { adb -s "$DEVICE" "$@"; }
case "${1:-}" in
  open)
    d shell input tap 56 1907; sleep 2
    d shell uiautomator dump /sdcard/_ui.xml >/dev/null 2>&1
    pt=$(d shell cat /sdcard/_ui.xml | python3 -c '
import re,sys
xml=sys.stdin.read()
for n in re.findall(r"<node [^>]*?/?>", xml):
    if re.search(r"text=\"notedrop\"", n):
        b=re.search(r"bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"", n)
        if b:
            x1,y1,x2,y2=map(int,b.groups()); print((x1+x2)//2,(y1+y2)//2); break
')
    [ -n "$pt" ] || { echo "notedrop menu entry not found" >&2; exit 1; }
    d shell input tap $pt; sleep 4 ;;
  send) d shell input tap 1780 672; sleep "${2:-6}" ;;
  inbox) d shell input tap 1440 180; sleep 3 ;;
  pull) d shell input tap 1780 440; sleep "${2:-8}" ;;
  tap) d shell input tap "$2" "$3"; sleep 2 ;;
  shot) mkdir -p "$(dirname "$OUT")"; d exec-out screencap -p > "$OUT"; echo "$OUT" ;;
  *) echo "usage: $0 open|send|inbox|pull|tap X Y|shot" >&2; exit 2 ;;
esac
