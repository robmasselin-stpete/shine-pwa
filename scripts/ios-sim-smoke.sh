#!/bin/bash
# iOS launch smoke test — build the app for the NEWEST installed iOS simulator,
# launch it, and fail if it dies within a few seconds.
#
# Why: build 158 (the first Xcode 27 build) crashed on launch because the new SDK
# made the UIScene lifecycle mandatory. Nothing about the web code changed — only
# the toolchain. Run this after every Xcode update, before mq_build.sh / TestFlight.
#
#   bash scripts/ios-sim-smoke.sh            # build + launch + check
#   SMOKE_WAIT=15 bash scripts/ios-sim-smoke.sh
#
# Needs the matching simulator runtime (Xcode > Settings > Components, or
# `xcodebuild -downloadPlatform iOS`). Screenshot lands in /tmp/mq-smoke.png.
set -e
cd "$(dirname "$0")/.."

BUNDLE=com.muralquest.stpete
WAIT=${SMOKE_WAIT:-8}
DD=/tmp/mq-smoke-dd
DEVICE_NAME="MQ Smoke"

# Newest iOS runtime installed
RUNTIME=$(xcrun simctl list runtimes -j | /usr/bin/python3 -c '
import json,sys
rs=[r for r in json.load(sys.stdin)["runtimes"] if r["platform"]=="iOS" and r["isAvailable"]]
rs.sort(key=lambda r: [int(x) for x in r["version"].split(".")])
print(rs[-1]["identifier"] if rs else "")')
[ -z "$RUNTIME" ] && { echo "✗ no iOS simulator runtime installed"; exit 1; }
SDK_VER=$(xcrun --sdk iphoneos --show-sdk-version)
echo "→ runtime: $RUNTIME   (Xcode iOS SDK: $SDK_VER)"
case "$RUNTIME" in
  *iOS-${SDK_VER%%.*}-*) ;;
  *) echo "⚠️  newest simulator runtime is OLDER than the SDK — this test may miss new-SDK launch rules."
     echo "   Install it: xcodebuild -downloadPlatform iOS" ;;
esac

# Dedicated device on that runtime (created once, reused)
UDID=$(xcrun simctl list devices -j | /usr/bin/python3 -c '
import json,sys
d=json.load(sys.stdin)["devices"].get(sys.argv[1],[])
m=[x["udid"] for x in d if x["name"]==sys.argv[2]]
print(m[0] if m else "")' "$RUNTIME" "$DEVICE_NAME")
if [ -z "$UDID" ]; then
  UDID=$(xcrun simctl create "$DEVICE_NAME" "iPhone 17 Pro" "$RUNTIME")
  echo "→ created simulator $DEVICE_NAME ($UDID)"
fi

echo "→ building for simulator…"
xcodebuild build -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination "id=$UDID" -derivedDataPath "$DD" -quiet
APP=$(find "$DD/Build/Products" -maxdepth 2 -name App.app | head -1)

xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
xcrun simctl install "$UDID" "$APP"

echo "→ launching, watching for ${WAIT}s…"
PID=$(xcrun simctl launch "$UDID" "$BUNDLE" | awk '{print $NF}')
sleep "$WAIT"
xcrun simctl io "$UDID" screenshot /tmp/mq-smoke.png >/dev/null 2>&1 || true

if [ -n "$PID" ] && ps -p "$PID" >/dev/null 2>&1; then
  echo "✓ PASS — app still running after ${WAIT}s (pid $PID). Screenshot: /tmp/mq-smoke.png"
  xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
  exit 0
fi
echo "✗ FAIL — app is not running ${WAIT}s after launch (crashed or exited)."
echo "  Crash reports: ls -t ~/Library/Logs/DiagnosticReports/App-*.ips | head"
exit 1
