#!/usr/bin/env bash
# Existing LOUREX GCP project only. IAM identity federation, NO Firestore data role.
# Run under the owner in Google Cloud Shell. Safe to rerun after a partial failure.
set -Eeuo pipefail
PROJECT=lourex-invoice
PROJECT_NUMBER=985119320046
AWS_ACCOUNT=466671147159
AWS_ROLE=lourex-zatca-staging-wif
AWS_INSTANCE=i-05530aee6c25c984e
POOL=lourex-aws-staging
PROVIDER=ec2
SA="lourex-aws-staging@${PROJECT}.iam.gserviceaccount.com"
ACTUAL="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
if [[ "$ACTUAL" != "$PROJECT_NUMBER" ]]; then
  echo "LOUREX GOOGLE PROJECT MISMATCH: STOP";exit 2
fi
for service in iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com; do
  if [[ "$(gcloud services list --project="$PROJECT" --enabled --filter="config.name=$service" --format='value(config.name)')" != "$service" ]]; then
    echo "REQUIRED GOOGLE API NOT ENABLED: $service";exit 2
  fi
done
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
# The STS principal is scoped to one specific IAM role on one EC2 instance.
ARN="arn:aws:sts::${AWS_ACCOUNT}:assumed-role/${AWS_ROLE}/${AWS_INSTANCE}"
COND="assertion.account == '${AWS_ACCOUNT}' && assertion.arn == '${ARN}'"
if ! gcloud iam workload-identity-pools describe "$POOL" --location=global --project="$PROJECT" --format=json >"$tmp/pool" 2>"$tmp/error"; then
  grep -Eqi 'NOT_FOUND|not found|does not exist' "$tmp/error" || { echo "GOOGLE POOL LOOKUP FAILED";exit 1; }
  gcloud iam workload-identity-pools create "$POOL" --location=global --project="$PROJECT" --display-name='LOUREX AWS staging identity' >/dev/null
  gcloud iam workload-identity-pools describe "$POOL" --location=global --project="$PROJECT" --format=json >"$tmp/pool"
fi
python3 - "$tmp/pool" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
assert p.get("state")=="ACTIVE" and not p.get("disabled",False), "GOOGLE POOL IS NOT ACTIVE"
PY
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --project="$PROJECT" --workload-identity-pool="$POOL" --format=json >"$tmp/provider" 2>"$tmp/error"; then
  grep -Eqi 'NOT_FOUND|not found|does not exist' "$tmp/error" || { echo "GOOGLE PROVIDER LOOKUP FAILED";exit 1; }
  gcloud iam workload-identity-pools providers create-aws "$PROVIDER" --location=global --project="$PROJECT" --workload-identity-pool="$POOL" --account-id="$AWS_ACCOUNT" --attribute-mapping='google.subject=assertion.arn' --attribute-condition="$COND" --display-name='LOUREX AWS EC2 identity' >/dev/null
  gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --project="$PROJECT" --workload-identity-pool="$POOL" --format=json >"$tmp/provider"
fi
python3 - "$tmp/provider" "$AWS_ACCOUNT" "$COND" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
assert p["aws"]["accountId"]==sys.argv[2] and p["attributeCondition"]==sys.argv[3], "GOOGLE PROVIDER SCOPE CHANGED"
assert p["attributeMapping"].get("google.subject")=="assertion.arn", "GOOGLE PROVIDER MAPPING CHANGED"
assert p.get("state")=="ACTIVE" and not p.get("disabled",False), "GOOGLE PROVIDER NOT ACTIVE"
PY
if ! gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format=json >"$tmp/sa" 2>"$tmp/error"; then
  grep -Eqi 'NOT_FOUND|not found|does not exist' "$tmp/error" || { echo "GOOGLE SERVICE ACCOUNT LOOKUP FAILED";exit 1; }
  gcloud iam service-accounts create lourex-aws-staging --project="$PROJECT" --display-name='LOUREX EC2 WIF identity only' >/dev/null
  gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format=json >"$tmp/sa"
fi
python3 - "$tmp/sa" "$SA" <<'PY'
import json,sys
a=json.load(open(sys.argv[1]))
assert a.get("email")==sys.argv[2] and not a.get("disabled",False), "INVALID STAGING SERVICE ACCOUNT"
PY
# An existing dedicated account must not have acquired broader project roles.
gcloud projects get-iam-policy "$PROJECT" --format=json > "$tmp/project-policy"
python3 - "$tmp/project-policy" "$SA" <<'PY'
import json,sys
policy=json.load(open(sys.argv[1]))
member='serviceAccount:'+sys.argv[2]
assert not any(member in b.get('members',[]) for b in policy.get('bindings',[])), "STAGING IDENTITY ALREADY HAS PROJECT ACCESS"
PY
if [[ -n "$(gcloud iam service-accounts keys list --iam-account="$SA" --project="$PROJECT" --managed-by=user --format='value(name)')" ]]; then
  echo "STAGING IDENTITY HAS STATIC KEYS: STOP";exit 2
fi
# Do NOT grant roles/datastore.user, roles/datastore.viewer or any project-level
# role. The EC2 worker can only exchange short-lived credentials with Google.
MEMBER="principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/subject/${ARN}"
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT" --member="$MEMBER" --role=roles/iam.workloadIdentityUser --condition=None >/dev/null
gcloud iam workload-identity-pools create-cred-config "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}" --service-account="$SA" --aws --enable-imdsv2 --output-file="$tmp/adc.json" >/dev/null
python3 - "$tmp/adc.json" "$SA" "$PROJECT_NUMBER" <<'PY'
import json,sys
c=json.load(open(sys.argv[1]))
a=f"//iam.googleapis.com/projects/{sys.argv[3]}/locations/global/workloadIdentityPools/lourex-aws-staging/providers/ec2"
assert c["type"]=="external_account" and c["audience"]==a
assert c["service_account_impersonation_url"]=="https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/"+sys.argv[2]+":generateAccessToken"
assert c["credential_source"]["imdsv2_session_token_url"]=="http://169.254.169.254/latest/api/token"
PY
echo "LOUREX EXISTING GOOGLE PROJECT: $PROJECT"
echo "LOUREX AWS FEDERATION POLICY READY"
echo "FIRESTORE ACCESS: NOT GRANTED"
