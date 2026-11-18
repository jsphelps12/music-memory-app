#!/usr/bin/env bash
# Run a Maestro flow locally against the CURRENT JavaScript, on a simulator,
# without a new native build.
#
#   scripts/e2e-local.sh actions          # .maestro/actions.yaml
#   scripts/e2e-local.sh smoke            # .maestro/smoke.yaml
#
# How: exports this checkout's JS as a release bundle and drops it into the
# Soundtracks β (preview) RELEASE build already installed on the booted
# simulator, replacing its built-in bundle (that build has updates off, so it
# runs whatever bundle it ships). The native side must match the branch:
# for native/1.4 that's a 1.4 preview simulator build.
#
# Account: the E2E account on PRODUCTION (e2e@soundtracks.test), reset to
# empty first by scripts/reset-e2e-prod.mjs, which can only touch that
# account's own rows (RLS, anon key).
#
# Needs E2E_PASSWORD in the environment. Keep it out of the repo and your
# shell history, e.g.:  read -rs E2E_PASSWORD && export E2E_PASSWORD
# (or put E2E_PASSWORD=... in .maestro/.env.e2e.local, which this reads).
# Screenshots and logs land in /tmp/soundtracks-e2e/<flow>-<time>/.
set -euo pipefail

FLOW="${1:-actions}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BUNDLE_ID="com.joshuaphelps.musicmemory.preview"
OUT="/tmp/soundtracks-e2e/${FLOW}-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT/bundle"

[ -f ".maestro/${FLOW}.yaml" ] || { echo "No .maestro/${FLOW}.yaml"; exit 1; }
if [ -z "${E2E_PASSWORD:-}" ] && [ -f .maestro/.env.e2e.local ]; then
  E2E_PASSWORD="$(grep -E '^E2E_PASSWORD=' .maestro/.env.e2e.local | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
fi
[ -n "${E2E_PASSWORD:-}" ] || { echo "Set E2E_PASSWORD first (see the top of this script)."; exit 1; }
export E2E_PASSWORD

# The first booted simulator whose Soundtracks β is a release build of the
# version in app.config.ts (an older install would run new JS on old native).
WANT_VERSION="$(grep -oE 'version: "[0-9.]+"' app.config.ts | head -1 | grep -oE '[0-9.]+')"
DEVICE=""; APP=""
for d in $(xcrun simctl list devices booted | grep -oE '[0-9A-F-]{36}'); do
  a="$(xcrun simctl get_app_container "$d" "$BUNDLE_ID" 2>/dev/null)" || continue
  [ -f "$a/main.jsbundle" ] || continue
  v="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$a/Info.plist" 2>/dev/null || true)"
  [ "$v" = "$WANT_VERSION" ] || continue
  DEVICE="$d"; APP="$a"; break
done
[ -n "$DEVICE" ] || { echo "No booted simulator has a Soundtracks β $WANT_VERSION release build installed."; exit 1; }
echo "── Simulator $DEVICE"

echo "── Resetting the E2E account (production, as itself)"
npx eas-cli env:exec production "node scripts/reset-e2e-prod.mjs" --non-interactive

echo "── Exporting this checkout's JS"
# .env holds staging values for local dev; production's come from EAS.
ENV_ASIDE=""
if [ -f .env ]; then mv .env .env.e2e-aside; ENV_ASIDE=1; fi
restore_env() { [ -n "$ENV_ASIDE" ] && [ -f .env.e2e-aside ] && mv .env.e2e-aside .env; true; }
trap restore_env EXIT
npx eas-cli env:exec production \
  "EXPO_PUBLIC_APP_ENV=preview npx expo export:embed --platform ios --dev false --entry-file node_modules/expo-router/entry.js --bundle-output $OUT/bundle/main.jsbundle --assets-dest $OUT/bundle/assets" \
  --non-interactive
restore_env

echo "── Installing it into the simulator app"
xcrun simctl terminate "$DEVICE" "$BUNDLE_ID" 2>/dev/null || true
cp "$OUT/bundle/main.jsbundle" "$APP/main.jsbundle"
cp -R "$OUT/bundle/assets/." "$APP/"

echo "── Running .maestro/${FLOW}.yaml"
maestro --device "$DEVICE" test ".maestro/${FLOW}.yaml" \
  --env E2E_PASSWORD="$E2E_PASSWORD" \
  --test-output-dir "$OUT" | tee "$OUT/maestro.log"
echo "── Done. Screenshots and logs: $OUT"
