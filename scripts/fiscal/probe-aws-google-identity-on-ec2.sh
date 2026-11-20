#!/usr/bin/env bash
# Existing EC2 only; called after Google policy success.
# Stores a public federated ADC description; no private key or long-lived token.
set -Eeuo pipefail
cd /home/ubuntu/lourex-fiscal
[[ "$(id -un)" == ubuntu ]]
[[ "$(git branch --show-current)" == feat/fiscal-batch2-remaining-settlements ]]
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
provider='ec2'
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
sudo -u lourex-staging env -u AWS_PROFILE -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u GOOGLE_APPLICATION_CREDENTIALS node scripts/fiscal/probe-aws-google-identity.mjs
