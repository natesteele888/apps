#!/usr/bin/env bash
# Run by .github/workflows/dugout-screen.yml on an emulator: installs Dugout, prints a screenshot, runs TopBarTest.
set -euo pipefail
cd "$(dirname "$0")"
APK=build/outputs/apk/debug/phone-debug.apk
TEST=build/outputs/apk/androidTest/debug/phone-debug-androidTest.apk
adb install -r -g "$APK"
adb install -r -g "$TEST"
adb shell am start -W -n com.steele.dugout/.MainActivity
sleep 12
adb exec-out screencap -p > /tmp/shot.png
convert /tmp/shot.png -resize 360x -quality 70 /tmp/shot.jpg
echo "SCREENSHOT BEGIN"; base64 -w 0 /tmp/shot.jpg; echo; echo "SCREENSHOT END"
adb shell am force-stop com.steele.dugout
adb logcat -c
set +e
adb shell am instrument -w -r com.steele.dugout.test/androidx.test.runner.AndroidJUnitRunner | tee /tmp/instr.txt
set -e
adb logcat -d -s TopBarTest:I
grep -q "OK (1 test)" /tmp/instr.txt
