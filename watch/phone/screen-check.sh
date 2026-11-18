#!/usr/bin/env bash
# Run by .github/workflows/dugout-screen.yml on an emulator: installs Dugout, prints a screenshot, runs the on-device tests.
set -euo pipefail
cd "$(dirname "$0")"
APK=build/outputs/apk/debug/phone-debug.apk
TEST=build/outputs/apk/androidTest/debug/phone-debug-androidTest.apk
adb install -r -g "$APK"
adb install -r -g "$TEST"
adb shell am start -W -n com.steele.dugout/.MainActivity
sleep 12
adb exec-out screencap -p > /tmp/shot.png
echo "SCREENSHOT BEGIN"; base64 -w 0 /tmp/shot.png; echo; echo "SCREENSHOT END"
adb shell am force-stop com.steele.dugout
# WatchInstallTest talks to this emulator's own adb over TCP, the way Dugout talks to the watch's Debug over Wi-Fi.
# Make sure adb listens on TCP 5555 inside the emulator, and give the app the key this computer's adb already uses,
# so the emulator doesn't stop to ask "Allow debugging?".
if ! adb shell "cat /proc/net/tcp /proc/net/tcp6 2>/dev/null" | grep -qiE ':15B3 [0-9A-F:]+ 0A'; then
  echo "adb isn't on TCP 5555 inside the emulator; turning it on"
  adb tcpip 5555 || true
  sleep 5
  adb wait-for-device
fi
adb shell "cat /proc/net/tcp /proc/net/tcp6 2>/dev/null" | grep -iE ':15B3 [0-9A-F:]+ 0A' || echo "still no listener on 5555"
cat ~/.android/adbkey | adb shell "run-as com.steele.dugout sh -c 'mkdir -p files/adb && cat > files/adb/adbkey'"
adb pubkey ~/.android/adbkey | adb shell "run-as com.steele.dugout sh -c 'cat > files/adb/adbkey.pub'"
adb logcat -c
set +e
adb shell am instrument -w -r com.steele.dugout.test/androidx.test.runner.AndroidJUnitRunner | tee /tmp/instr.txt
set -e
adb logcat -d -s TopBarTest:I WatchInstallTest:I
grep -qE "^OK \(" /tmp/instr.txt
