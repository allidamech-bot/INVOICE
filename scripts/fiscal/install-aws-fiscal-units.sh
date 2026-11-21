#!/usr/bin/env bash
# Install reviewed LOUREX ZATCA Simulation units on the EXISTING EC2.
# Installs CODE AND SYSTEMD UNIT FILES ONLY; never enables/starts either service.
set -Eeuo pipefail
export LC_ALL=C
fail(){ printf 'LOUREX FISCAL INSTALL STOPPED: %s\n' "$1" >&2; exit 2; }
[[ $# == 1 && "$1" =~ ^[a-f0-9]{40}$ ]] || fail 'EXACT_COMMIT_REQUIRED'
PIN="$1"
[[ "$(id -un)" == ubuntu ]] || fail 'RUN_AS_UBUNTU_ON_EXISTING_EC2'
[[ "$(uname -m)" == aarch64 ]] || fail 'EXPECTED_ARM64_INSTANCE'
for tool in sudo curl git mktemp install cp find mv;do command -v "$tool" >/dev/null || fail 'REQUIRED_SYSTEM_TOOL_MISSING';done
sudo -n true >/dev/null 2>&1 || fail 'SUDO_NOT_AVAILABLE'
id lourex-staging >/dev/null 2>&1 || fail 'STAGING_USER_MISSING'
# Fail closed if someone attempts to install on another EC2 or off EC2.
METADATA=http://169.254.169.254/latest
TOKEN="$(curl --noproxy '*' -fsS --max-time 5 -X PUT "$METADATA/api/token" -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')" || fail 'EC2_IMDSV2_UNAVAILABLE'
INSTANCE="$(curl --noproxy '*' -fsS --max-time 5 -H "X-aws-ec2-metadata-token: $TOKEN" "$METADATA/meta-data/instance-id")" || fail 'EC2_INSTANCE_ID_UNAVAILABLE'
[[ "$INSTANCE" == i-05530aee6c25c984e ]] || fail 'WRONG_EC2_INSTANCE'
SOURCE='/home/ubuntu/lourex'
[[ -r "$SOURCE/node_modules/firebase-admin/package.json" && -r "$SOURCE/node_modules/typescript/bin/tsc" ]] || fail 'EXISTING_NODE_DEPENDENCIES_MISSING'
NODE="$(command -v node || true)"
[[ -n "$NODE" && "$NODE" == /* && -x "$NODE" ]] || fail 'EXISTING_NODE_BINARY_MISSING'
[[ "$("$NODE" --version)" == v24.* ]] || fail 'NODE24_REQUIRED'
[[ -d /etc/systemd/system ]] || fail 'SYSTEMD_NOT_FOUND'

WORK="$(mktemp -d /tmp/lourex-fiscal-install.XXXXXXXX)" || fail 'TEMP_WORK_DIR_FAILED'
STAGE=''
cleanup(){ if [[ -n "$STAGE" ]];then sudo rm -rf -- "$STAGE";fi; rm -rf -- "$WORK"; }
trap cleanup EXIT
GIT_REPO="$WORK/repo"
git init -q "$GIT_REPO"
git -C "$GIT_REPO" remote add origin https://github.com/allidamech-bot/INVOICE.git
git -C "$GIT_REPO" sparse-checkout init --cone
git -C "$GIT_REPO" sparse-checkout set api/_fiscal api/_accounting scripts/fiscal deploy/fiscal src/lib
git -C "$GIT_REPO" -c advice.detachedHead=false fetch --quiet --depth 1 --filter=blob:none origin refs/heads/feat/fiscal-batch2-remaining-settlements || fail 'REVIEWED_SOURCE_FETCH_FAILED'
[[ "$(git -C "$GIT_REPO" rev-parse FETCH_HEAD)" == "$PIN" ]] || fail 'BRANCH_CHANGED_ABORT'
git -C "$GIT_REPO" checkout -q --detach FETCH_HEAD || fail 'SOURCE_CHECKOUT_FAILED'
[[ -r "$GIT_REPO/api/_fiscal/staging-runtime.js" && -r "$GIT_REPO/api/_fiscal/aws-enrollment-operator.js" && -r "$GIT_REPO/scripts/fiscal/run-aws-staging-enrollment.mjs" ]] || fail 'FISCAL_SOURCE_NOT_FOUND'
[[ -r "$GIT_REPO/src/lib/fiscal-issuance.ts" ]] || fail 'FISCAL_ISSUANCE_SOURCE_MISSING'
# Never overwrite an unrelated or already-running service unit.
for name in lourex-aws-enrollment lourex-aws-staging;do
 UNIT="/etc/systemd/system/$name.service"
 if sudo test -e "$UNIT";then
  sudo cmp -s "$GIT_REPO/deploy/fiscal/$name.service" "$UNIT" || fail 'EXISTING_SYSTEMD_UNIT_DIFFERS'
 fi
 sudo systemctl is-active --quiet "$name.service" && fail 'FISCAL_SERVICE_ALREADY_RUNNING'
done

# Compile only the pure fiscal state machine. Do not build or deploy the website.
"$NODE" "$SOURCE/node_modules/typescript/bin/tsc" \
 --target ES2022 --module ES2022 --moduleResolution Bundler --skipLibCheck \
 --rootDir "$GIT_REPO/src" --outDir "$WORK/compiled/dist/src" \
 "$GIT_REPO/src/lib/fiscal-issuance.ts" || fail 'FISCAL_STATE_MACHINE_COMPILE_FAILED'
[[ -s "$WORK/compiled/dist/src/lib/fiscal-issuance.js" ]] || fail 'FISCAL_STATE_MACHINE_MISSING'
"$NODE" --check "$WORK/compiled/dist/src/lib/fiscal-issuance.js" || fail 'FISCAL_COMPILED_SYNTAX_FAILED'

# Create a private, root-controlled release in the fiscal directory only.
ROOT='/opt/lourex-fiscal'
CURRENT="$ROOT/current"
sudo install -d -o root -g root -m 0755 "$ROOT" "$ROOT/bin" || fail 'FISCAL_ROOT_DIR_FAILED'
NODE_TARGET="$ROOT/bin/node"
if sudo test -e "$NODE_TARGET";then
 [[ "$(sudo "$NODE_TARGET" --version)" == v24.* ]] || fail 'INSTALLED_FISCAL_NODE_NOT_24'
else
 sudo install -o root -g root -m 0755 "$NODE" "$NODE_TARGET" || fail 'FISCAL_NODE_COPY_FAILED'
fi
[[ "$(sudo "$NODE_TARGET" --version)" == v24.* ]] || fail 'FISCAL_NODE_VERIFICATION_FAILED'
if sudo test -e "$CURRENT";then
 sudo test -f "$CURRENT/.lourex-fiscal-commit" || fail 'UNRECOGNIZED_EXISTING_FISCAL_RELEASE'
 EXISTING="$(sudo cat "$CURRENT/.lourex-fiscal-commit")"
 [[ "$EXISTING" == "$PIN" ]] || fail 'EXISTING_FISCAL_RELEASE_DIFFERS'
else
 STAGE="$(sudo mktemp -d "$ROOT/.install.XXXXXXXX")" || fail 'FISCAL_STAGE_FAILED'
 sudo cp -a -- "$GIT_REPO/api" "$STAGE/api" || fail 'FISCAL_API_COPY_FAILED'
 sudo install -d -m 0755 "$STAGE/scripts" || fail 'FISCAL_SCRIPT_DIR_FAILED'
 sudo cp -a -- "$GIT_REPO/scripts/fiscal" "$STAGE/scripts/fiscal" || fail 'FISCAL_SCRIPT_COPY_FAILED'
 sudo cp -a -- "$GIT_REPO/package.json" "$STAGE/package.json" || fail 'FISCAL_PACKAGE_COPY_FAILED'
 sudo cp -a -- "$WORK/compiled/dist" "$STAGE/dist" || fail 'FISCAL_STATE_MACHINE_COPY_FAILED'
 sudo cp -a -- "$SOURCE/node_modules" "$STAGE/node_modules" || fail 'FISCAL_DEPENDENCIES_COPY_FAILED'
 printf '%s\n' "$PIN" | sudo tee "$STAGE/.lourex-fiscal-commit" >/dev/null || fail 'RELEASE_MARKER_WRITE_FAILED'
 sudo chown -R root:root "$STAGE" || fail 'RELEASE_OWNERSHIP_FAILED'
 sudo chmod -R go-w "$STAGE" || fail 'RELEASE_PERMISSIONS_FAILED'
 sudo find "$STAGE" -type f -perm /6000 -exec chmod a-s {} + || fail 'UNSAFE_SETUID_DEPENDENCY'
 sudo chmod 0755 "$STAGE" || fail 'RELEASE_DIR_MODE_FAILED'
 # Do not promote a release that a restricted service identity cannot import.
 sudo -u lourex-staging "$NODE_TARGET" --check "$STAGE/scripts/fiscal/run-aws-staging-enrollment.mjs" || fail 'ENROLLMENT_SYNTAX_FAILED'
 sudo -u lourex-staging "$NODE_TARGET" --check "$STAGE/scripts/fiscal/run-aws-staging-worker.mjs" || fail 'WORKER_SYNTAX_FAILED'
 sudo -u lourex-staging "$NODE_TARGET" --input-type=module -e "await import(process.argv[1])" "$STAGE/api/_fiscal/staging-runtime.js" || fail 'FISCAL_RUNTIME_IMPORT_FAILED'
 sudo mv -T -- "$STAGE" "$CURRENT" || fail 'FISCAL_RELEASE_PROMOTION_FAILED'
 STAGE=''
fi
sudo -u lourex-staging "$NODE_TARGET" --input-type=module -e "await import(process.argv[1])" "$CURRENT/api/_fiscal/staging-runtime.js" || fail 'INSTALLED_RUNTIME_IMPORT_FAILED'
sudo -u lourex-staging test -r "$CURRENT/node_modules/firebase-admin/package.json" || fail 'INSTALLED_FIREBASE_DEPENDENCY_DENIED'

# Install reviewed units, but NEVER enable/start, create secrets, edit Vercel,
# touch production Firestore, or send a request to ZATCA.
for name in lourex-aws-enrollment lourex-aws-staging;do
 sudo install -o root -g root -m 0644 "$GIT_REPO/deploy/fiscal/$name.service" "/etc/systemd/system/$name.service" || fail 'SYSTEMD_INSTALL_FAILED'
done
sudo systemctl daemon-reload || fail 'SYSTEMD_RELOAD_FAILED'
for name in lourex-aws-enrollment lourex-aws-staging;do
 sudo systemctl is-active --quiet "$name.service" && fail 'UNEXPECTED_SERVICE_ACTIVE'
 [[ "$(sudo systemctl show -p LoadState --value "$name.service")" == loaded ]] || fail 'UNIT_NOT_LOADED'
done
printf '%s\n' \
 'LOUREX FISCAL INSTALLATION VERIFIED' \
 'ZATCA ENROLLMENT UNIT: INSTALLED, NOT STARTED' \
 'ZATCA DISPATCH WORKER UNIT: INSTALLED, NOT STARTED' \
 'AWS QA CONFIG/CSID/TRUST: NOT ALTERED' \
 'PRODUCTION/SITE: NOT ALTERED'
