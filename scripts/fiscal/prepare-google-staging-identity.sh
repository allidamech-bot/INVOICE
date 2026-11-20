#!/usr/bin/env bash
# Reuse existing identity-only AWS WIF provider across GCP projects.
# QA must ALREADY exist; this never creates a project, database, WIF or billing.
set -Eeuo pipefail
if [[ $# != 1 || ! "$1" =~ ^[a-z][a-z0-9-]{0,18}-fiscal-qa$ ]]; then
 echo 'USAGE: prepare-google-staging-identity.sh EXISTING-QA-PROJECT-ID'
 exit 2
fi
QA=$1
IDENTITY=lourex-invoice
POOL=lourex-aws-staging
PROVIDER=ec2-staging
IDENTITY_NUMBER=985119320046
ACCOUNT=466671147159
ROLE=lourex-zatca-staging-wif
INSTANCE=i-05530aee6c25c984e
SA=lourex-aws-worker@$QA.iam.gserviceaccount.com
ARN=arn:aws:sts::$ACCOUNT:assumed-role/$ROLE/$INSTANCE
# All checks precede any IAM mutation. Do not change Vercel federation.
[[ "$(gcloud projects describe "$IDENTITY" --format='value(projectNumber)')" == "$IDENTITY_NUMBER" ]]
[[ "$(gcloud projects describe "$QA" --format='value(projectId)')" == "$QA" ]]
[[ "$(gcloud projects describe "$QA" --format='value(lifecycleState)')" == ACTIVE ]]
gcloud firestore databases describe --project="$QA" --database='(default)' --format='value(name)' > /dev/null
for api in iam.googleapis.com iamcredentials.googleapis.com firestore.googleapis.com; do
 [[ "$(gcloud services list --project="$QA" --enabled --filter="config.name=$api" --format='value(config.name)')" == "$api" ]] || { echo "QA API NOT READY: $api";exit 2; }
done
TMP=$(mktemp)
trap 'rm -f -- "$TMP"' EXIT
gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$IDENTITY" --location=global --workload-identity-pool="$POOL" --format=json > "$TMP"
python3 - "$TMP" "$ACCOUNT" "$ARN" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
assert p["aws"]["accountId"]==sys.argv[2]
assert p.get("state")=="ACTIVE" and not p.get("disabled",False)
assert p["attributeMapping"]["google.subject"]=="assertion.arn"
condition=p.get("attributeCondition","")
assert sys.argv[3] in condition and sys.argv[2] in condition
PY
if ! gcloud iam service-accounts describe "$SA" --project="$QA" >/dev/null 2>&1; then
 gcloud iam service-accounts create lourex-aws-worker --project="$QA" --display-name='LOUREX isolated fiscal QA AWS worker'
fi
# This service account has NO roles on the production-associated project.
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$QA" \
 --role=roles/iam.workloadIdentityUser \
 --member="principal://iam.googleapis.com/projects/$IDENTITY_NUMBER/locations/global/workloadIdentityPools/$POOL/subject/$ARN" \
 --condition=None >/dev/null
# Its Firestore data role applies to QA ONLY.
gcloud projects add-iam-policy-binding "$QA" \
 --member="serviceAccount:$SA" --role=roles/datastore.user --condition=None >/dev/null
echo 'LOUREX EXISTING WIF REUSED FOR ISOLATED QA'
echo 'FIRESTORE ACCESS: QA PROJECT ONLY'
echo 'PRODUCTION FIRESTORE: UNCHANGED'
