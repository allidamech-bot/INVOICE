#!/usr/bin/env bash
# Run only in authenticated Google Cloud Shell. Existing isolated project only.
set -Eeuo pipefail
[[ $# == 1 && "$1" =~ ^[0-9]{12}$ ]]
ACCOUNT=$1
PROJECT=lourex-fiscal-qa
POOL=lourex-aws-qa
PROVIDER=ec2
ROLE=lourex-zatca-staging-wif
INSTANCE=i-05530aee6c25c984e
SA=lourex-aws-worker@$PROJECT.iam.gserviceaccount.com
NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
[[ "$NUMBER" =~ ^[0-9]+$ ]]
# Do not create a new project, database or billing account. Do not enable billing.
# Fail if required APIs are unavailable; the owner retains account control.
for api in iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com firestore.googleapis.com; do
 [[ "$(gcloud services list --project="$PROJECT" --enabled --filter="config.name=$api" --format='value(config.name)')" == "$api" ]] || { echo "REQUIRED API NOT ENABLED: $api";exit 2; }
done
D=$(mktemp -d); trap 'rm -rf -- "$D"' EXIT
ARN=arn:aws:sts::$ACCOUNT:assumed-role/$ROLE/$INSTANCE
COND="assertion.account == '$ACCOUNT' && assertion.arn == '$ARN'"
if ! gcloud iam workload-identity-pools describe "$POOL" --project="$PROJECT" --location=global --format=json > "$D/pool" 2>"$D/error"; then
 grep -Eqi 'NOT_FOUND|not found|does not exist' "$D/error" || { echo 'POOL LOOKUP FAILED';exit 1; }
 gcloud iam workload-identity-pools create "$POOL" --project="$PROJECT" --location=global --display-name='LOUREX AWS staging only'
fi
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$PROJECT" --location=global --workload-identity-pool="$POOL" --format=json > "$D/provider" 2>"$D/error"; then
 grep -Eqi 'NOT_FOUND|not found|does not exist' "$D/error" || { echo 'PROVIDER LOOKUP FAILED';exit 1; }
 gcloud iam workload-identity-pools providers create-aws "$PROVIDER" --project="$PROJECT" --location=global --workload-identity-pool="$POOL" --account-id="$ACCOUNT" --attribute-mapping='google.subject=assertion.arn' --attribute-condition="$COND" --display-name='LOUREX single EC2 staging instance'
 gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$PROJECT" --location=global --workload-identity-pool="$POOL" --format=json > "$D/provider"
fi
python3 - "$D/provider" "$ACCOUNT" "$COND" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
assert p["aws"]["accountId"]==sys.argv[2] and p["attributeCondition"]==sys.argv[3]
assert p["attributeMapping"]=={"google.subject":"assertion.arn"}
assert p.get("state")=="ACTIVE" and not p.get("disabled",False)
PY
if ! gcloud iam service-accounts describe "$SA" --project="$PROJECT" >/dev/null 2>"$D/error"; then
 grep -Eqi 'NOT_FOUND|not found|does not exist' "$D/error" || { echo 'SERVICE ACCOUNT LOOKUP FAILED';exit 1; }
 gcloud iam service-accounts create lourex-aws-worker --project="$PROJECT" --display-name='LOUREX EC2 staging worker'
fi
# This is a dedicated service account, never a project admin.
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role=roles/datastore.user --condition=None >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT" --role=roles/iam.workloadIdentityUser --member="principal://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/subject/$ARN" --condition=None >/dev/null
gcloud iam workload-identity-pools create-cred-config "projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER" --service-account="$SA" --aws --enable-imdsv2 --output-file="$D/adc.json" >/dev/null
# The ADC configuration is public identity metadata, NOT a private key.
# Print only project number; generate the exact ADC again locally on EC2.
printf 'GOOGLE QA PROJECT: %s\nGOOGLE QA PROJECT NUMBER: %s\nLOUREX GOOGLE FEDERATION CONFIGURED\n' "$PROJECT" "$NUMBER"
