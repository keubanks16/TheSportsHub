#!/usr/bin/env bash
# Builds the iPhone project in ios/ from this repo (run on a Mac, or by the GitHub Actions workflow).
#   GOOGLE_SERVICE_INFO_PLIST_B64  base64 of the Firebase iOS app's GoogleService-Info.plist
#                                  (or put the file at native/ios/GoogleService-Info.plist; it's git-ignored)
#   APPLE_TEAM_ID                  optional; your Apple Developer Team ID for signing
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="$(node -p "require('./capacitor.config.json').appName")"

npm install --no-audit --no-fund
node scripts/build-www.mjs

if [ ! -d ios/App ]; then
  npx cap add ios --packagemanager SPM
fi

# Firebase (phone notifications)
if [ -n "${GOOGLE_SERVICE_INFO_PLIST_B64:-}" ]; then
  echo "$GOOGLE_SERVICE_INFO_PLIST_B64" | base64 --decode > ios/App/App/GoogleService-Info.plist
elif [ -f native/ios/GoogleService-Info.plist ]; then
  cp native/ios/GoogleService-Info.plist ios/App/App/GoogleService-Info.plist
else
  echo "Missing GoogleService-Info.plist: set GOOGLE_SERVICE_INFO_PLIST_B64 or add native/ios/GoogleService-Info.plist" >&2
  exit 1
fi

# Native files, icon and launch screen
cp native/ios/AppDelegate.swift ios/App/App/AppDelegate.swift
cp native/ios/App.entitlements ios/App/App/App.entitlements
ICONSET=ios/App/App/Assets.xcassets/AppIcon.appiconset
for f in "$ICONSET"/*.png; do [ -e "$f" ] && cp native/ios/assets/AppIcon-1024.png "$f"; done
SPLASH=ios/App/App/Assets.xcassets/Splash.imageset
for f in "$SPLASH"/*.png; do [ -e "$f" ] && cp native/ios/assets/splash-2732.png "$f"; done

# Info.plist
PL=ios/App/App/Info.plist
setk() { /usr/libexec/PlistBuddy -c "Delete :$1" "$PL" >/dev/null 2>&1 || true; /usr/libexec/PlistBuddy -c "Add :$1 $2 $3" "$PL"; }
setk CFBundleDisplayName string "$APP_NAME"
setk ITSAppUsesNonExemptEncryption bool false
setk NSCameraUsageDescription string "The camera records swings for Swing AI, streams games live for your team, and scans roster photos."
setk NSMicrophoneUsageDescription string "The microphone records sound with game live streams and swing videos."
setk NSPhotoLibraryUsageDescription string "Choose photos and videos to share in team chat, use as a team logo, or analyze with Swing AI."
setk NSPhotoLibraryAddUsageDescription string "Save team photos and swing videos to your library."
/usr/libexec/PlistBuddy -c "Delete :UIBackgroundModes" "$PL" >/dev/null 2>&1 || true
/usr/libexec/PlistBuddy -c "Add :UIBackgroundModes array" "$PL"
/usr/libexec/PlistBuddy -c "Add :UIBackgroundModes:0 string remote-notification" "$PL"

# Xcode project: Firebase file in the app bundle, push entitlement, iPhone only, signing team
gem list -i xcodeproj >/dev/null 2>&1 || gem install --user-install xcodeproj
ruby scripts/ios-project.rb

npx cap sync ios
echo "iOS project ready in ios/App"
