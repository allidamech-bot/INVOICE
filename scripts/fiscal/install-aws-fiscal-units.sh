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
git -C "$GIT_REPO" sparse-checkout set api/_fiscal api/_accounting scripts/fiscal deploy/fiscal src
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

# Transpile the fiscal dependency graph without editing source or unrelated app.
# The existing accounting source has unrelated TS diagnostics; syntax and
# runtime imports remain hard gates. Typechecking is not claimed as passing.
cat > "$WORK/transpile-fiscal.cjs" <<'NODE'
const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const ts=createRequire('/home/ubuntu/lourex/package.json')('typescript');
const [src,out]=process.argv.slice(2);
function walk(dir){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory()){walk(file);continue;}
  if(!entry.isFile()||!entry.name.endsWith('.ts')||entry.name.endsWith('.d.ts'))continue;
  const rel=path.relative(src,file),dest=path.join(out,rel.replace(/\.ts$/,'.js'));
  const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{
   fileName:file,reportDiagnostics:true,
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}
  });
  const errors=(result.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
  if(errors.length)throw Error('TRANSPILE_DIAGNOSTICS: '+rel);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,result.outputText,{mode:0o644});
 }
}
walk(src);
NODE
"$NODE" "$WORK/transpile-fiscal.cjs" "$GIT_REPO/src/lib" "$WORK/compiled/dist/src/lib" || fail 'FISCAL_TRANSPILE_FAILED'
"$NODE" "$WORK/transpile-fiscal.cjs" "$GIT_REPO/src/crypto" "$WORK/compiled/dist/src/crypto" || fail 'FISCAL_CRYPTO_TRANSPILE_FAILED'
[[ -s "$WORK/compiled/dist/src/crypto/crypto.js" ]] || fail 'FISCAL_CRYPTO_MODULE_MISSING'
"$NODE" --check "$WORK/compiled/dist/src/crypto/crypto.js" || fail 'FISCAL_CRYPTO_MODULE_SYNTAX_FAILED'
for financial in fiscal-issuance fiscal-issuer fiscal-routing fiscal-tax money defaults backup id period-close operations invoice-stock governance commercial-controls document-lifecycle payments sales-returns inventory-evidence fiscal-advance-commercial inventory-cost-cutover-audit inventory-valuation-evidence finance-source-bound-stock-gl-preview;do
 [[ -s "$WORK/compiled/dist/src/lib/$financial.js" ]] || fail 'FISCAL_FINANCIAL_MODULE_MISSING'
 "$NODE" --check "$WORK/compiled/dist/src/lib/$financial.js" || fail 'FISCAL_FINANCIAL_MODULE_SYNTAX_FAILED'
done
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
 sudo -u lourex-staging env LOUREX_FISCAL_STAGE="$STAGE" LOUREX_FISCAL_NODE="$NODE_TARGET" bash -c 'cd "$LOUREX_FISCAL_STAGE" && exec "$LOUREX_FISCAL_NODE" --input-type=module -e "await import(process.argv[1])" "$LOUREX_FISCAL_STAGE/api/_fiscal/staging-runtime.js"' || fail 'FISCAL_RUNTIME_IMPORT_FAILED'
 sudo mv -T -- "$STAGE" "$CURRENT" || fail 'FISCAL_RELEASE_PROMOTION_FAILED'
 STAGE=''
fi
sudo -u lourex-staging env LOUREX_FISCAL_STAGE="$CURRENT" LOUREX_FISCAL_NODE="$NODE_TARGET" bash -c 'cd "$LOUREX_FISCAL_STAGE" && exec "$LOUREX_FISCAL_NODE" --input-type=module -e "await import(process.argv[1])" "$LOUREX_FISCAL_STAGE/api/_fiscal/staging-runtime.js"' || fail 'INSTALLED_RUNTIME_IMPORT_FAILED'
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
