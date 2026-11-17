#!/usr/bin/env bash
# Run by .github/workflows/dugout-screen.yml on an emulator: installs a Dugout build numbered 1 (signed with the Dugout
# key, like the published builds), lets it find the newest published release, taps Update in Dugout and Update in
# Android's installer, and checks that the newer version is installed afterwards.
set -euo pipefail
OLD="$1"
PKG=com.steele.dugout
ver() { adb shell dumpsys package $PKG | sed -n 's/.*versionCode=\([0-9]*\).*/\1/p' | head -1; }
shot() { adb exec-out screencap -p > /tmp/u.png; echo "SCREENSHOT BEGIN $1"; base64 -w 0 /tmp/u.png; echo; echo "SCREENSHOT END"; }
tap() { # tap the first button whose text is $1 (any case), waiting up to $2 seconds for it
  for _ in $(seq 1 "$2"); do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
    adb shell cat /sdcard/ui.xml > /tmp/ui.xml 2>/dev/null || true
    xy=$(python3 -I - "$1" /tmp/ui.xml <<'PY'
import re, sys, xml.etree.ElementTree as ET
want = sys.argv[1].lower()
try: root = ET.parse(sys.argv[2]).getroot()
except Exception: sys.exit(0)
# The API 35 emulator sometimes shows "Pixel Launcher isn't responding" over everything. Answer Wait so the
# test sees the app underneath instead of failing on the emulator's own pop-up.
if any("isn't responding" in n.get("text", "") for n in root.iter("node")):
    want = "wait"
for n in root.iter("node"):
    if n.get("text", "").strip().lower() == want and n.get("enabled") == "true":
        a, b, c, d = map(int, re.findall(r"\d+", n.get("bounds")))
        print((a + c) // 2, (b + d) // 2); break
PY
)
    if [ -n "$xy" ] && grep -q "isn't responding" /tmp/ui.xml; then
      echo "emulator pop-up: tapping Wait at $xy"; adb shell input tap $xy; sleep 1; continue
    fi
    if [ -n "$xy" ]; then echo "tap '$1' at $xy"; adb shell input tap $xy; return 0; fi
    sleep 1
  done
  echo "no '$1' button after $2 s"; shot "missing-$1"; return 1
}
adb uninstall $PKG >/dev/null 2>&1 || true
adb install "$OLD"
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS
adb shell appops set $PKG REQUEST_INSTALL_PACKAGES allow
echo "installed version $(ver)"
adb shell am start -W -n $PKG/.MainActivity
tap "Update" 60         # Dugout's "Update Dugout?" pop-up
sleep 3
tap "Update" 120        # Android's "Do you want to update this app?"
for _ in $(seq 1 90); do v=$(ver); [ "${v:-1}" != 1 ] && break; sleep 1; done
v=$(ver); echo "installed version after the update: $v"
shot after
[ "${v:-1}" -gt 1 ]
