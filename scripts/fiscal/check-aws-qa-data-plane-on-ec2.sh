#!/usr/bin/env bash
# One-pass read-only QA data-plane acceptance on the EXISTING AWS EC2.
# Does NOT alter EC2 IAM, Google IAM, systemd, production, SDK, keys or billing.
set -Eeuo pipefail
export LC_ALL=C
die(){ printf 'LOUREX AWS QA STOPPED: %s\n' "$1" >&2;exit 2; }
[[ $(id -u) -ne 0 ]] || die 'RUN_AS_EXISTING_UBUNTU_USER'
command -v sudo >/dev/null && sudo -n true >/dev/null 2>&1 || die 'SUDO_REQUIRED'
command -v curl >/dev/null && command -v git >/dev/null && command -v python3 >/dev/null || die 'REQUIRED_LOCAL_TOOL_MISSING'
readonly NODE="$(command -v node)"
[[ "$NODE" == /* ]] || die 'NODE_NOT_FOUND'
[[ "$("$NODE" --version)" == v24.* ]] || die 'EXISTING_NODE24_REQUIRED'
id lourex-staging >/dev/null || die 'RESTRICTED_STAGING_USER_MISSING'
[[ -f /home/ubuntu/lourex/package.json && -f /home/ubuntu/lourex/node_modules/firebase-admin/package.json ]] || die 'EXISTING_LOUREX_NODE_DEPENDENCIES_MISSING'
[[ $(python3 -c "import json;print(json.load(open('/home/ubuntu/lourex/package.json')).get('name',''))") == 'lourex-invoice' ]] || die 'LOUREX_REPOSITORY_MISMATCH'
sudo test -d /etc/lourex-staging || die 'EXISTING_STAGING_CONFIG_DIRECTORY_MISSING'
# Read IMDSv2 for identity only. Never print session credentials.
TOKEN="$(curl --silent --show-error --fail --max-time 4 -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token)" || die 'EC2_IMDSV2_UNAVAILABLE'
iid="$(curl --silent --show-error --fail --max-time 4 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)" || die 'EC2_INSTANCE_UNVERIFIED'
role="$(curl --silent --show-error --fail --max-time 4 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/security-credentials/)" || die 'EC2_ROLE_UNVERIFIED'
unset TOKEN
[[ "$iid" == i-05530aee6c25c984e && "$role" == lourex-zatca-staging-wif ]] || die 'UNEXPECTED_EC2_IDENTITY'
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
readonly REF='60cc45c4f4ec4eb8fc3484521f7ed9f3035ef002'
curl -fsSL --max-time 45 "https://raw.githubusercontent.com/allidamech-bot/INVOICE/$REF/scripts/fiscal/probe-aws-qa-data-plane.mjs" -o "$TMP/probe.mjs" || die 'PINNED_PROBE_DOWNLOAD_FAILED'
[[ $(git hash-object "$TMP/probe.mjs") == '3c5cdf4124bc00d9efaf495b4f47ec822352413b' ]] || die 'PINNED_PROBE_DIGEST_MISMATCH'
python3 - "$TMP/qa-adc.json" <<'PY'
import json,sys
a='//iam.googleapis.com/projects/985119320046/locations/global/workloadIdentityPools/lourex-aws-staging/providers/ec2-staging'
s='lourex-aws-worker@lourex-fiscal-qa.iam.gserviceaccount.com'
base='http://169.254.169.254/latest/'
c={'type':'external_account',
   'audience':a,
   'subject_token_type':'urn:ietf:params:aws:token-type:aws4_request',
   'token_url':'https://sts.googleapis.com/v1/token',
   'service_account_impersonation_url':'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+s+':generateAccessToken',
   'credential_source':{
    'environment_id':'aws1',
    'region_url':base+'meta-data/placement/availability-zone',
    'url':base+'meta-data/iam/security-credentials',
    'imdsv2_session_token_url':base+'api/token',
    'regional_cred_verification_url':'https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15'}}
with open(sys.argv[1],'x',encoding='utf8') as f:json.dump(c,f,sort_keys=True)
PY
readonly DEST='/etc/lourex-staging/aws-adc.json'
if sudo test -e "$DEST"; then
 sudo cmp -s "$TMP/qa-adc.json" "$DEST" || die 'EXISTING_QA_ADC_DIFFERS_NO_OVERWRITE'
else
 sudo install -o root -g root -m 0644 "$TMP/qa-adc.json" "$DEST" || die 'QA_ADC_INSTALL_FAILED'
fi
sudo -u lourex-staging test -r "$DEST" || die 'STAGING_CANNOT_READ_QA_ADC'
# No private-key material is created. ADC contains only the signed AWS request recipe.
rm -f -- "$TMP/qa-adc.json"
chmod 0755 "$TMP"
chmod 0644 "$TMP/probe.mjs"
sudo -u lourex-staging env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u AWS_PROFILE -u GOOGLE_APPLICATION_CREDENTIALS -u VERCEL_ENV -u FIRESTORE_EMULATOR_HOST -u FIREBASE_AUTH_EMULATOR_HOST -u LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON LOUREX_AWS_STAGING_ENABLED=true "$NODE" "$TMP/probe.mjs" || die 'DATA_PLANE_ACCEPTANCE_FAILED'
echo 'LOUREX QA WIF AND FIRESTORE ISOLATION VERIFIED'
echo 'AWS WORKER: NOT STARTED'
echo 'ZATCA SUBMISSION: NOT REQUESTED'
