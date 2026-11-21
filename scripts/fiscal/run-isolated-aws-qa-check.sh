#!/usr/bin/env bash
# LOUREX isolated read-only QA data plane check; no permission changes to /home.
# Reuses the existing Node dependencies in a temporary root-owned runtime copy.
set -Eeuo pipefail
export LC_ALL=C
fail(){ printf 'LOUREX QA STAGING CHECK STOPPED: %s\n' "$1" >&2;exit 2; }
[[ "$(id -un)" == ubuntu ]] || fail 'RUN_AS_UBUNTU_ON_EXISTING_EC2'
[[ -n "$(command -v sudo)" && -n "$(command -v git)" && -n "$(command -v curl)" ]] || fail 'EXISTING_UTILITIES_MISSING'
sudo -n true >/dev/null 2>&1 || fail 'SUDO_NOT_AVAILABLE'
id lourex-staging >/dev/null 2>&1 || fail 'STAGING_SERVICE_USER_NOT_AVAILABLE'
NODE="$(command -v node)"
[[ "$NODE" == /* && "$("$NODE" --version)" == v24.* ]] || fail 'EXISTING_NODE24_NOT_AVAILABLE'
SOURCE='/home/ubuntu/lourex'
[[ -r "$SOURCE/package.json" && -r "$SOURCE/node_modules/firebase-admin/package.json" ]] || fail 'EXISTING_DEPENDENCIES_NOT_FOUND'
sudo test -r /etc/lourex-staging/aws-adc.json || fail 'PREVIOUS_QA_ADC_NOT_FOUND'
TMP="$(mktemp -d /tmp/lourex-qa-isolated.XXXXXXXX)" || fail 'TEMP_DIR_UNAVAILABLE'
[[ "$TMP" == /tmp/lourex-qa-isolated.* ]] || fail 'INVALID_TEMP_DIR'
trap 'sudo rm -rf -- "$TMP"' EXIT
REF='37660c9d1fde80a6f21e74a6325301d674c520d7'
BLOB='eb1fed02ce596487d5b85c8e113c7de5020f820f'
curl -fsSL --max-time 45 "https://raw.githubusercontent.com/allidamech-bot/INVOICE/$REF/scripts/fiscal/probe-aws-qa-data-plane.mjs" -o "$TMP/pinned.mjs" || fail 'PINNED_PROBE_DOWNLOAD_FAILED'
[[ "$(git hash-object "$TMP/pinned.mjs")" == "$BLOB" ]] || fail 'PINNED_PROBE_HASH_MISMATCH'
sudo cp -a -- "$SOURCE/node_modules" "$TMP/node_modules" || fail 'ISOLATED_DEPENDENCY_COPY_FAILED'
sudo chown -R root:lourex-staging "$TMP/node_modules" || fail 'ISOLATED_DEPENDENCY_OWNER_FAILED'
sudo chmod -R u=rwX,g=rX,o= "$TMP/node_modules" || fail 'ISOLATED_DEPENDENCY_MODE_FAILED'
sudo chmod -R u-s,g-s "$TMP/node_modules" || fail 'ISOLATED_DEPENDENCY_SUID_DENIED'
sudo install -o root -g lourex-staging -m 0640 "$SOURCE/package.json" "$TMP/package.json" || fail 'ISOLATED_PACKAGE_FAILED'
sudo install -o root -g lourex-staging -m 0640 "$TMP/pinned.mjs" "$TMP/probe.mjs" || fail 'ISOLATED_PROBE_FAILED'
rm -f -- "$TMP/pinned.mjs"
sudo chown root:lourex-staging "$TMP"
sudo chmod 0750 "$TMP"
sudo -u lourex-staging test -r "$TMP/package.json" || fail 'ISOLATED_PACKAGE_INACCESSIBLE'
sudo -u lourex-staging test -r "$TMP/node_modules/firebase-admin/package.json" || fail 'ISOLATED_DEPENDENCIES_INACCESSIBLE'
sudo -u lourex-staging env -i HOME=/var/lib/lourex-staging PATH=/usr/bin:/bin LANG=C.UTF-8 LOUREX_AWS_STAGING_ENABLED=true "$NODE" "$TMP/probe.mjs" || fail 'QA_DATA_PLANE_NOT_YET_VERIFIED'
printf '%s\n' 'LOUREX AWS QA AND PRODUCTION ISOLATION PASSED' 'NO SYSTEMD/PRODUCTION/ZATCA CHANGES'
