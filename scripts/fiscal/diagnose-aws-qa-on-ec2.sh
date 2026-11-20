#!/usr/bin/env bash
# One-shot safe diagnostic after the prior EC2 preflight reached DATA_PLANE_ACCEPTANCE_FAILED.
# No IAM, Google/AWS infrastructure, keys, configuration or customer data changes.
set -Eeuo pipefail
fail(){ printf 'LOUREX QA DIAG STOPPED: %s\n' "$1" >&2;exit 2; }
[[ "$(id -un)" == 'ubuntu' ]] || fail 'RUN_AS_EXISTING_UBUNTU_USER'
command -v curl >/dev/null && command -v git >/dev/null && command -v node >/dev/null && command -v sudo >/dev/null || fail 'TOOLS_UNAVAILABLE'
[[ "$(node --version)" == v24.* ]] || fail 'NODE24_UNAVAILABLE'
sudo -n true >/dev/null 2>&1 || fail 'SUDO_UNAVAILABLE'
id lourex-staging >/dev/null 2>&1 || fail 'STAGING_USER_MISSING'
sudo test -f /etc/lourex-staging/aws-adc.json || fail 'EXISTING_QA_ADC_MISSING'
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
chmod 0755 "$TMP"
readonly REF='34633bb180f0aa69cfa0a2a7bd44dcd11e34eb89'
readonly BLOB='1e9173c075b87bdc332c1ba6bff8d4a6c35ef342'
curl -fsSL --max-time 45 "https://raw.githubusercontent.com/allidamech-bot/INVOICE/$REF/scripts/fiscal/probe-aws-qa-data-plane.mjs" -o "$TMP/diagnostic.mjs" || fail 'PINNED_DIAGNOSTIC_DOWNLOAD_FAILED'
[[ "$(git hash-object "$TMP/diagnostic.mjs")" == "$BLOB" ]] || fail 'PINNED_DIAGNOSTIC_HASH_FAILED'
chmod 0644 "$TMP/diagnostic.mjs"
sudo -u lourex-staging env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u AWS_PROFILE -u GOOGLE_APPLICATION_CREDENTIALS -u VERCEL_ENV -u FIRESTORE_EMULATOR_HOST -u FIREBASE_AUTH_EMULATOR_HOST -u LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON LOUREX_AWS_STAGING_ENABLED=true "$(command -v node)" "$TMP/diagnostic.mjs" || fail 'STAGED_PROBE_FAILED'
echo 'LOUREX QA DATA PLANE VERIFIED; NO WORKER ACTIVATED'
