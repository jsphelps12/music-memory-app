#!/usr/bin/env bash
# Publish an OTA by hand, then upload the sourcemaps for exactly that bundle.
#
#   scripts/publish-ota.sh "Fix the calendar crash"              # production
#   scripts/publish-ota.sh "Try the new header" preview          # preview
#   SKIP_GATE=1 scripts/publish-ota.sh "..."                     # skip the reachability gate (emergency only)
#
# The gate knows EAS's builds and the ones made on the Mac: record each Mac
# build you send to TestFlight with
#   node scripts/record-local-build.mjs path/to/Soundtracks.ipa
# and commit scripts/local-builds.json. Then a local build needs no SKIP_GATE.
#
# CI normally publishes (ota-update.yml for preview, promote-to-production.yml
# for production) and uploads sourcemaps itself. This is for the times an OTA
# goes out from a laptop: without the upload step, every error from that
# bundle lands in Sentry minified.
#
# Sourcemaps match by debug id, not by release name: Sentry's Metro serializer
# (metro.config.js, getSentryExpoConfig) stamps a debug id into the bundle and
# its .map, and sentry-expo-upload-sourcemaps uploads them keyed on it. So the
# upload has to come from the very dist/ that `eas update` exported and
# published, which is what this does.
#
# Requires a logged-in eas-cli. SENTRY_AUTH_TOKEN comes from the EAS
# environment through `eas env:exec`; it is never read, printed or written here.

set -euo pipefail

MESSAGE="${1:-}"
BRANCH="${2:-production}"
# Same pin as the workflows and scripts/lib/fingerprint.mjs.
EAS_CLI="${EAS_CLI:-eas-cli@25.2.0}"

if [ -z "$MESSAGE" ]; then
  echo "usage: scripts/publish-ota.sh \"<message>\" [branch]   (branch defaults to production)" >&2
  exit 2
fi

case "$BRANCH" in
  production) APP_ENV=production ;;
  preview) APP_ENV=preview ;;
  *)
    echo "Unknown branch \"$BRANCH\": expected production or preview." >&2
    exit 2
    ;;
esac

cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing to publish: the working tree has uncommitted or untracked changes." >&2
  echo "An OTA must be a commit you can point at. Commit or stash first." >&2
  echo "Untracked work that isn't yours to commit? Publish from a clean worktree:" >&2
  echo "  git worktree add /tmp/ota <commit> && ln -s \"\$PWD/node_modules\" /tmp/ota/node_modules" >&2
  echo "  cp .env /tmp/ota/ && cd /tmp/ota && scripts/publish-ota.sh \"...\"" >&2
  git status --short >&2
  exit 1
fi

# .env points at staging with the beta identity (docs/DEPLOY.md, Local
# Development). Move it aside so nothing in it leaks into the bundle, and put
# it back however this script exits.
ENV_BACKUP=""
restore_env() {
  if [ -n "$ENV_BACKUP" ] && [ -f "$ENV_BACKUP" ]; then
    mv "$ENV_BACKUP" .env
    echo "Restored .env"
  fi
}
trap restore_env EXIT
trap 'exit 130' INT TERM
if [ -f .env ]; then
  ENV_BACKUP=".env.publish-ota-backup.$$"
  mv .env "$ENV_BACKUP"
  echo "Moved .env aside"
fi

export EXPO_PUBLIC_APP_ENV="$APP_ENV"

echo ""
echo "Commit:   $(git rev-parse HEAD) ($(git log -1 --format=%s))"
echo "Branch:   $BRANCH (environment $APP_ENV)"
echo "Message:  $MESSAGE"
if [ "${SKIP_GATE:-}" = "1" ]; then
  # Emergency only: publishes even if no installed build would receive it.
  RUNTIME=$(npx expo-updates fingerprint:generate --platform ios | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).hash))')
  echo "Runtime:  $RUNTIME (SKIP_GATE=1: reachability not checked)"
else
  # Prints the runtime version, and refuses (exits non-zero) when no finished
  # build serves it, since that publish would reach nobody.
  node scripts/fingerprint-gate.mjs --profile "$APP_ENV"
fi
echo ""

# eas update exports into dist/ (expo export --source-maps) before publishing.
# Start from an empty one so the upload below sees only this bundle.
rm -rf dist

npx "$EAS_CLI" update --branch "$BRANCH" --environment "$APP_ENV" --platform ios \
  --message "$MESSAGE" --non-interactive

echo ""
echo "Published. Uploading sourcemaps for the bundle in dist/ ..."
# Expected and harmless: Sentry's uploader prints "Failed to load environment
# variables using @expo/env" (Cannot find module '@expo/env'). It only uses
# that to read .env files, which this script moved aside on purpose; the
# token comes from the EAS environment. Adding the package would touch
# package.json, a fingerprint input.
echo "(A warning that @expo/env can't be found is expected; see the comment in this script.)"

# Non-fatal: the update is already live. Loud, because a skipped upload means
# minified stack traces for everything this update throws.
if ! SENTRY_ORG=soundtracks SENTRY_PROJECT=react-native \
  npx "$EAS_CLI" env:exec "$APP_ENV" "npx sentry-expo-upload-sourcemaps dist" --non-interactive; then
  echo "" >&2
  echo "########################################################################" >&2
  echo "  SOURCEMAP UPLOAD FAILED. The update IS published, but its errors will" >&2
  echo "  arrive in Sentry minified. Retry from this same commit and dist/:" >&2
  echo "    SENTRY_ORG=soundtracks SENTRY_PROJECT=react-native \\" >&2
  echo "      npx $EAS_CLI env:exec $APP_ENV \"npx sentry-expo-upload-sourcemaps dist\" --non-interactive" >&2
  echo "  (do not run eas update or expo export again first; dist/ is the bundle)" >&2
  echo "########################################################################" >&2
  exit 0
fi

echo "Sourcemaps uploaded."
