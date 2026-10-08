#!/usr/bin/env bash
# Builds the iPhone project in ios/ from this repo (run on a Mac, or by the GitHub Actions workflow).
#   native/ios/GoogleService-Info.plist  the Firebase iOS app's config file (not secret; it's committed)
#   GOOGLE_SERVICE_INFO_PLIST  or the same file's text (or base64) as a GitHub secret
#   APPLE_TEAM_ID                  optional; your Apple Developer Team ID for signing
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="$(node -p "require('./capacitor.config.json').appName")"

npm install --no-audit --no-fund
node scripts/build-www.mjs

if [ ! -d ios/App ]; then
  npx cap add ios --packagemanager SPM
fi

# Firebase (phone notifications). The file in the repo wins; otherwise the GitHub secret (text or base64).
PLIST_OUT=ios/App/App/GoogleService-Info.plist
if [ -f native/ios/GoogleService-Info.plist ]; then
  cp native/ios/GoogleService-Info.plist "$PLIST_OUT"
elif [ -n "${GOOGLE_SERVICE_INFO_PLIST:-}" ]; then
  if printf '%s' "$GOOGLE_SERVICE_INFO_PLIST" | grep -q -e '<plist' -e '<dict>' -e 'GOOGLE_APP_ID'; then
    printf '%s\n' "$GOOGLE_SERVICE_INFO_PLIST" > "$PLIST_OUT"
  elif ! printf '%s' "$GOOGLE_SERVICE_INFO_PLIST" | base64 --decode > "$PLIST_OUT" 2>/dev/null; then
    echo "::error::GOOGLE_SERVICE_INFO_PLIST isn't the GoogleService-Info.plist text (it should start with <?xml). Re-paste it, or add the file at native/ios/GoogleService-Info.plist." >&2
    exit 1
  fi
else
  echo "::error::Missing GoogleService-Info.plist: add native/ios/GoogleService-Info.plist or the GOOGLE_SERVICE_INFO_PLIST secret" >&2
  exit 1
fi
if ! grep -q 'GOOGLE_APP_ID' "$PLIST_OUT"; then
  echo "::error::GoogleService-Info.plist doesn't look like the Firebase iOS file (no GOOGLE_APP_ID inside)." >&2
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
