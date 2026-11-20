#!/usr/bin/env bash
# Run a Maestro flow locally against the CURRENT JavaScript, on a simulator,
# without a new native build.
#
#   scripts/e2e-local.sh actions                 # .maestro/actions.yaml
#   scripts/e2e-local.sh actions drafts select   # several, one build
#   scripts/e2e-local.sh all                     # every flow but smoke
#
# How: exports this checkout's JS as a release bundle and drops it into the
# Soundtracks β (preview) RELEASE build already installed on the booted
# simulator, replacing its built-in bundle (that build has updates off, so it
# runs whatever bundle it ships). The native side must match the branch:
# for native/1.4 that's a 1.4 preview simulator build. The export is cached
# by the code it was built from, so a re-run with no code change skips it.
#
# Account: the E2E account on PRODUCTION (e2e@soundtracks.test), reset first
# by scripts/reset-e2e-prod.mjs, which can only touch that account's own rows
# (RLS, anon key). It's reset before EACH flow; a flow that needs moments to
# start with says so with a line `# seed: N` (they're inserted directly,
# much faster than tapping through capture).
#
# Needs E2E_PASSWORD in the environment. Keep it out of the repo and your
# shell history, e.g.:  read -rs E2E_PASSWORD && export E2E_PASSWORD
# (or put E2E_PASSWORD=... in .maestro/.env.e2e.local, which this reads).
# Screenshots and logs land in /tmp/soundtracks-e2e/<run>/<flow>/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BUNDLE_ID="com.joshuaphelps.musicmemory.preview"

FLOWS=("$@")
[ ${#FLOWS[@]} -gt 0 ] || FLOWS=(actions)
if [ "${FLOWS[0]}" = "all" ]; then
  FLOWS=()
  for f in .maestro/*.yaml; do n="$(basename "$f" .yaml)"; [ "$n" = smoke ] || FLOWS+=("$n"); done
fi
for f in "${FLOWS[@]}"; do [ -f ".maestro/${f}.yaml" ] || { echo "No .maestro/${f}.yaml"; exit 1; }; done
RUN="/tmp/soundtracks-e2e/$(IFS=-; echo "${FLOWS[*]}")-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RUN"

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

# The JS export, cached by the code it comes from (HEAD, uncommitted changes
# and new files), so re-running flows without a code change skips it.
CODE_HASH="$( { git rev-parse HEAD; git diff HEAD; git ls-files --others --exclude-standard -z | xargs -0 cat 2>/dev/null; } | shasum | cut -c1-12)"
BUNDLE="/tmp/soundtracks-e2e/bundle-$CODE_HASH"
if [ -f "$BUNDLE/main.jsbundle" ]; then
  echo "── JS unchanged since the last export ($CODE_HASH): reusing it"
else
  echo "── Exporting this checkout's JS ($CODE_HASH)"
  mkdir -p "$BUNDLE.tmp"
  # .env holds staging values for local dev; production's come from EAS.
  ENV_ASIDE=""
  if [ -f .env ]; then mv .env .env.e2e-aside; ENV_ASIDE=1; fi
  restore_env() { [ -n "$ENV_ASIDE" ] && [ -f .env.e2e-aside ] && mv .env.e2e-aside .env; true; }
  trap restore_env EXIT
  npx eas-cli env:exec production \
    "EXPO_PUBLIC_APP_ENV=preview npx expo export:embed --platform ios --dev false --entry-file node_modules/expo-router/entry.js --bundle-output $BUNDLE.tmp/main.jsbundle --assets-dest $BUNDLE.tmp/assets" \
    --non-interactive
  restore_env
  rm -rf "$BUNDLE"; mv "$BUNDLE.tmp" "$BUNDLE"
fi

echo "── Installing it into the simulator app"
xcrun simctl terminate "$DEVICE" "$BUNDLE_ID" 2>/dev/null || true
cp "$BUNDLE/main.jsbundle" "$APP/main.jsbundle"
cp -R "$BUNDLE/assets/." "$APP/"

FAILED=()
for FLOW in "${FLOWS[@]}"; do
  SEED="$(grep -oE '^# seed: [0-9]+' ".maestro/${FLOW}.yaml" | grep -oE '[0-9]+' || true)"
  SEED_ALBUM="$(grep -E '^# seed-album: ' ".maestro/${FLOW}.yaml" | head -1 | sed 's/^# seed-album: //' || true)"
  echo "── Resetting the E2E account (production, as itself)${SEED:+, seeding $SEED moment(s)}${SEED_ALBUM:+ and an album}"
  E2E_SEED="${SEED:-0}" E2E_SEED_ALBUM="$SEED_ALBUM" npx eas-cli env:exec production "node scripts/reset-e2e-prod.mjs" --non-interactive

  # A fresh install reads the clipboard once (deferred invite links); anything
  # the Mac synced into the simulator's clipboard makes iOS ask to paste over
  # the sign-in screen. Start each flow with it empty.
  printf '' | xcrun simctl pbcopy "$DEVICE" 2>/dev/null || true

  echo "── Running .maestro/${FLOW}.yaml"
  mkdir -p "$RUN/$FLOW"
  if maestro --device "$DEVICE" test ".maestro/${FLOW}.yaml" \
      --env E2E_PASSWORD="$E2E_PASSWORD" \
      --test-output-dir "$RUN/$FLOW" | tee "$RUN/$FLOW/maestro.log"; then
    :
  else
    FAILED+=("$FLOW")
  fi
done

echo "── Done. Screenshots and logs: $RUN"
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "── FAILED: ${FAILED[*]}"
  exit 1
fi
echo "── All passed: ${FLOWS[*]}"
