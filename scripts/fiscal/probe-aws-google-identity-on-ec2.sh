#!/usr/bin/env bash
# Existing EC2 only; called after Google policy success.
# Stores a public federated ADC description; no private key or long-lived token.
set -Eeuo pipefail
cd /home/ubuntu/lourex-fiscal
[[ "$(id -un)" == ubuntu ]]
[[ "$(git branch --show-current)" == feat/fiscal-batch2-remaining-settlements ]]
[[ $# == 0 || ($# == 1 && ( "$1" == --sts-only || "$1" == --iam-only ) ) ]] || { echo 'STAGING_PROBE_ARGUMENT_INVALID'; exit 2; }
TOKEN="$(curl -fsS --max-time 5 -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token)"
ROLE="$(curl -fsS --max-time 5 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/security-credentials/)"
[[ "$ROLE" == lourex-zatca-staging-wif ]] || { echo 'AWS IAM ROLE NOT VERIFIED';exit 2; }
TMP="$(mktemp)"
trap 'rm -f -- "$TMP"' EXIT
python3 - "$TMP" <<'PY'
import json,sys
n='985119320046'
project='lourex-invoice'
pool='lourex-aws-staging'
provider='ec2-staging'
sa='lourex-aws-staging@'+project+'.iam.gserviceaccount.com'
metadata='http://169.254.169.254/latest/'
config={
 'type':'external_account',
 'audience':f'//iam.googleapis.com/projects/{n}/locations/global/workloadIdentityPools/{pool}/providers/{provider}',
 'subject_token_type':'urn:ietf:params:aws:token-type:aws4_request',
 'token_url':'https://sts.googleapis.com/v1/token',
 'service_account_impersonation_url':f'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/{sa}:generateAccessToken',
 'credential_source':{
   'environment_id':'aws1',
   'region_url':metadata+'meta-data/placement/availability-zone',
   'url':metadata+'meta-data/iam/security-credentials',
   'regional_cred_verification_url':'https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15',
   'imdsv2_session_token_url':metadata+'api/token',
 }
}
with open(sys.argv[1],'w') as f:json.dump(config,f,separators=(',',':'))
PY
sudo install -d -o root -g root -m 755 /etc/lourex-staging
sudo install -o root -g root -m 644 "$TMP" /etc/lourex-staging/aws-identity-adc.json
# The service identity must not need access to /home/ubuntu or the owner's
# checkout. Run a copied, isolated, synthetic read-only probe from /tmp.
PROBE_DIR="$(mktemp -d /tmp/lourex-google-id-qa.XXXXXX)"
trap 'rm -f -- "$TMP"; rm -rf -- "$PROBE_DIR"' EXIT
chmod 755 "$PROBE_DIR"
git archive HEAD api/_fiscal/aws-google-identity.js scripts/fiscal/probe-aws-google-identity.mjs scripts/fiscal/probe-aws-sts-only.mjs scripts/fiscal/probe-aws-iam-only.mjs api/_fiscal/aws-google-iam-result.js package.json | tar -x -C "$PROBE_DIR"
cp -a -- node_modules "$PROBE_DIR/node_modules"
install -m 755 "$(command -v node)" "$PROBE_DIR/node"
(
  cd "$PROBE_DIR"
  sudo -u lourex-staging env -i HOME=/var/lib/lourex-staging PATH=/usr/bin:/bin LANG=C.UTF-8 \
   "$PROBE_DIR/node" "scripts/fiscal/$(case "${1:-}" in --sts-only) echo probe-aws-sts-only.mjs;; --iam-only) echo probe-aws-iam-only.mjs;; *) echo probe-aws-google-identity.mjs;; esac)"
)
case "${1:-}" in
  --sts-only) echo 'LOUREX AWS STS-ONLY DIAGNOSTIC FINISHED';;
  --iam-only) echo 'LOUREX AWS IAM-ONLY DIAGNOSTIC FINISHED';;
  *) echo 'LOUREX AWS GOOGLE FEDERATION READY';;
esac
