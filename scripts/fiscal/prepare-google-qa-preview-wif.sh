#!/usr/bin/env bash
# Future PREVIEW-ONLY keyless QA federation bootstrap.
# Never run for production. Does not link billing, make service keys or
# grant QA data access to production. Requires an authorized operator.
set -Eeuo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
stop(){ printf 'LOUREX QA PREVIEW FEDERATION STOPPED: %s\n' "$1" >&2;exit 2; }
command -v gcloud >/dev/null && command -v python3 >/dev/null && command -v sha256sum >/dev/null || stop 'TOOLS_MISSING'
IDENTITY='lourex-invoice'
QA='lourex-fiscal-qa'
POOL='lourex-vercel'
EXISTING_PROVIDER='vercel'
PROVIDER='vercel-qa'
SOURCE_NUMBER='985119320046'
QA_NUMBER='448656707310'
SA='lourex-qa-vercel@lourex-fiscal-qa.iam.gserviceaccount.com'
AUD='https://vercel.com/alidaamishs-projects'
ISSUER='https://oidc.vercel.com/alidaamishs-projects'
SUBJECT='owner:alidaamishs-projects:project:invoice:environment:preview'
PROJECT_ID='prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ'
EXPECTED_CONDITION="assertion.sub == '$SUBJECT' && assertion.project_id == '$PROJECT_ID'"
[[ "$(gcloud projects describe "$IDENTITY" --format='value(projectNumber)' 2>/dev/null)" == "$SOURCE_NUMBER" ]] || stop 'IDENTITY_PROJECT_CHANGED'
[[ "$(gcloud projects describe "$QA" --format='value(projectNumber)' 2>/dev/null)" == "$QA_NUMBER" ]] || stop 'QA_PROJECT_CHANGED'
[[ "$(gcloud projects describe "$QA" --format='value(lifecycleState)')" == ACTIVE ]] || stop 'QA_NOT_ACTIVE'
[[ "$(gcloud billing projects describe "$QA" --format='value(billingEnabled)' 2>/dev/null)" == False ]] || stop 'QA_BILLING_NOT_DISABLED'
gcloud firestore databases describe --project="$QA" --database='(default)' >/dev/null || stop 'QA_FIRESTORE_NOT_READY'
gcloud iam workload-identity-pools describe "$POOL" --project="$IDENTITY" --location=global >/dev/null || stop 'EXISTING_VERCEL_POOL_NOT_FOUND'
TEMP="$(mktemp -d)"
trap 'rm -rf -- "$TEMP"' EXIT
gcloud iam workload-identity-pools providers describe "$EXISTING_PROVIDER" --project="$IDENTITY" --location=global --workload-identity-pool="$POOL" --format=json >"$TEMP/original.json" || stop 'PRODUCTION_VERCEL_PROVIDER_NOT_FOUND'
BEFORE="$(sha256sum "$TEMP/original.json" | cut -d' ' -f1)"
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$IDENTITY" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1; then
 gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project="$IDENTITY" --location=global --workload-identity-pool="$POOL" \
 --issuer-uri="$ISSUER" --allowed-audiences="$AUD" \
 --attribute-mapping='google.subject=assertion.sub' --attribute-condition="$EXPECTED_CONDITION" --quiet || stop 'PREVIEW_PROVIDER_CREATE_FAILED'
fi
gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$IDENTITY" --location=global --workload-identity-pool="$POOL" --format=json >"$TEMP/preview.json" || stop 'PREVIEW_PROVIDER_READ_FAILED'
python3 - "$TEMP/preview.json" "$ISSUER" "$AUD" "$EXPECTED_CONDITION" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]));issuer,aud,condition=sys.argv[2:]
assert p.get('state')=='ACTIVE' and not p.get('disabled',False)
assert p.get('oidc',{}).get('issuerUri')==issuer
assert p['oidc']['allowedAudiences']==[aud]
assert p.get('attributeMapping',{}).get('google.subject')=='assertion.sub'
assert ' '.join(p.get('attributeCondition','').split())==' '.join(condition.split())
PY
if ! gcloud iam service-accounts describe "$SA" --project="$QA" >/dev/null 2>&1; then
 gcloud iam service-accounts create lourex-qa-vercel --project="$QA" --display-name='LOUREX isolated QA Vercel preview commands' --quiet || stop 'QA_PREVIEW_SERVICE_ACCOUNT_FAILED'
fi
# Exactly one preview subject can impersonate this QA-only account.
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$QA" \
 --member="principal://iam.googleapis.com/projects/$SOURCE_NUMBER/locations/global/workloadIdentityPools/$POOL/subject/$SUBJECT" \
 --role=roles/iam.workloadIdentityUser --condition=None --quiet >/dev/null || stop 'QA_WIF_BINDING_FAILED'
# Datastore User is limited to QA; the only other role permits revoked-user
# verification in the QA Firebase Authentication project.
gcloud projects add-iam-policy-binding "$QA" --member="serviceAccount:$SA" \
 --role=roles/datastore.user --condition=None --quiet >/dev/null || stop 'QA_DATA_ROLE_FAILED'
gcloud projects add-iam-policy-binding "$QA" --member="serviceAccount:$SA" \
 --role=roles/firebaseauth.viewer --condition=None --quiet >/dev/null || stop 'QA_AUTH_VIEWER_ROLE_FAILED'
[[ "$(gcloud billing projects describe "$QA" --format='value(billingEnabled)' 2>/dev/null)" == False ]] || stop 'QA_BILLING_CHANGED'
gcloud iam workload-identity-pools providers describe "$EXISTING_PROVIDER" --project="$IDENTITY" --location=global --workload-identity-pool="$POOL" --format=json >"$TEMP/production-after.json" || stop 'PRODUCTION_PROVIDER_READ_FAILED'
[[ "$(sha256sum "$TEMP/production-after.json" | cut -d' ' -f1)" == "$BEFORE" ]] || stop 'PRODUCTION_VERCEL_PROVIDER_CHANGED'
printf '%s\n' 'LOUREX QA PREVIEW FEDERATION READY' 'QA BILLING: DISABLED' 'PRODUCTION VERCEL PROVIDER: UNCHANGED' 'PRODUCTION FIRESTORE IAM: UNCHANGED'
