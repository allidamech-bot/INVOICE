#!/usr/bin/env bash
# LOUREX: one-pass, no-billing, isolated Firebase QA bootstrap.
# Intended for an already authenticated GOOGLE CLOUD SHELL, not EC2.
set -Eeuo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
readonly QA='lourex-fiscal-qa'
readonly PRODUCTION='lourex-invoice'
readonly SOURCE_NUMBER='985119320046'
readonly SOURCE_POOL='lourex-aws-staging'
readonly SOURCE_PROVIDER='ec2-staging'
readonly AWS_ACCOUNT='466671147159'
readonly AWS_ROLE='lourex-zatca-staging-wif'
readonly AWS_INSTANCE='i-05530aee6c25c984e'
readonly SA='lourex-aws-worker@lourex-fiscal-qa.iam.gserviceaccount.com'
readonly EXPECTED_NAME='lourex-fiscal-qa'
readonly QA_PROJECT_NUMBER='448656707310'
die(){ printf 'LOUREX QA STOPPED: %s\n' "$1" >&2;exit 2; }
command -v gcloud >/dev/null || die 'GCLOUD_REQUIRED'
command -v python3 >/dev/null || die 'PYTHON_REQUIRED'
[[ $(gcloud projects describe "$PRODUCTION" --format='value(projectNumber)' 2>/dev/null) == "$SOURCE_NUMBER" ]] || die 'SOURCE_IDENTITY_PROJECT_MISMATCH'
[[ -n $(gcloud auth list --filter='status:ACTIVE' --format='value(account)' 2>/dev/null) ]] || die 'GOOGLE_CLOUD_SHELL_LOGIN_REQUIRED'
# Reuse only the exact already verified QA project. NEVER create another.
[[ $(gcloud projects describe "$QA" --format='value(projectId)' 2>/dev/null) == "$QA" ]] || die 'CONFIRMED_QA_PROJECT_NOT_FOUND'
[[ $(gcloud projects describe "$QA" --format='value(projectNumber)' 2>/dev/null) == "$QA_PROJECT_NUMBER" ]] || die 'QA_PROJECT_NUMBER_MISMATCH'
[[ $(gcloud projects describe "$QA" --format='value(name)' 2>/dev/null) == "$EXPECTED_NAME" ]] || die 'QA_PROJECT_DISPLAY_NAME_CHANGED'
[[ $(gcloud projects describe "$QA" --format='value(lifecycleState)') == 'ACTIVE' ]] || die 'QA_PROJECT_NOT_ACTIVE'
check_no_billing(){
  local state
  state=$(gcloud billing projects describe "$QA" --format='value(billingEnabled)' 2>/dev/null) || die 'CANNOT_PROVE_BILLING_DISABLED'
  case "$state" in False|false) ;; *) die 'QA_BILLING_NOT_VERIFIABLY_DISABLED';; esac
}
check_no_billing
gcloud services enable firebase.googleapis.com firestore.googleapis.com iam.googleapis.com iamcredentials.googleapis.com --project="$QA" --quiet || die 'QA_APIS_NOT_ENABLED'
python3 - "$QA" <<'PY'
import sys,subprocess,urllib.request,urllib.error,json,time,re
qa=sys.argv[1]
token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'}
def request(method,url,data=None):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,method=method,headers=headers,data=data),timeout=30) as r:
            return json.load(r),r.status
    except urllib.error.HTTPError as e:
        if e.code==404: return None,404
        raise RuntimeError('FIREBASE_API_HTTP_'+str(e.code)) from None
base='https://firebase.googleapis.com/v1beta1/'
value,status=request('GET',base+'projects/'+qa)
if status==404:
    op,status=request('POST',base+'projects/'+qa+':addFirebase',b'')
    name=op.get('name') if isinstance(op,dict) else None
    if not isinstance(name,str) or not name.startswith('operations/') or not re.fullmatch(r'operations/[A-Za-z0-9._/\-]+',name):
        raise RuntimeError('FIREBASE_OPERATION_INVALID')
    for attempt in range(24):
        result,_=request('GET',base+name)
        if result.get('done') is True:
            if result.get('error') or result.get('response',{}).get('projectId')!=qa:
                raise RuntimeError('FIREBASE_ADD_FAILED')
            break
        time.sleep(5)
    else: raise RuntimeError('FIREBASE_OPERATION_NOT_COMPLETE')
elif status!=200 or value.get('projectId')!=qa:
    raise RuntimeError('FIREBASE_QA_PROJECT_MISMATCH')
print('LOUREX QA FIREBASE PROJECT READY')
PY
check_no_billing
if ! gcloud firestore databases describe --project="$QA" --database='(default)' --format='value(name)' >/dev/null 2>&1; then
  gcloud firestore databases create --project="$QA" --database='(default)' --location='europe-north2' --type='firestore-native' --edition='standard' --quiet || die 'FIRESTORE_DEFAULT_CREATE_FAILED'
fi
[[ $(gcloud firestore databases describe --project="$QA" --database='(default)' --format='value(type)' 2>/dev/null) == 'FIRESTORE_NATIVE' ]] || die 'QA_FIRESTORE_TYPE_INVALID'
check_no_billing
TMP=$(mktemp);trap 'rm -f -- "$TMP"' EXIT
gcloud iam workload-identity-pools providers describe "$SOURCE_PROVIDER" --project="$PRODUCTION" --location=global --workload-identity-pool="$SOURCE_POOL" --format=json >"$TMP" || die 'EXISTING_WIF_NOT_FOUND'
python3 - "$TMP" "$AWS_ACCOUNT" "$AWS_ROLE" "$AWS_INSTANCE" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]));a,role,inst=sys.argv[2:]
arn=f'arn:aws:sts::{a}:assumed-role/{role}/{inst}'
assert p['aws']['accountId']==a and p['attributeMapping']['google.subject']=='assertion.arn'
assert p.get('state')=='ACTIVE' and not p.get('disabled',False)
condition=p.get('attributeCondition','')
assert arn in condition and a in condition
PY
if ! gcloud iam service-accounts describe "$SA" --project="$QA" >/dev/null 2>&1; then
  gcloud iam service-accounts create lourex-aws-worker --project="$QA" --display-name='LOUREX fiscal QA AWS worker' --quiet || die 'QA_SERVICE_ACCOUNT_CREATE_FAILED'
fi
# Federation binding on the isolated QA service account ONLY.
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$QA" --role='roles/iam.workloadIdentityUser' --member="principal://iam.googleapis.com/projects/$SOURCE_NUMBER/locations/global/workloadIdentityPools/$SOURCE_POOL/subject/arn:aws:sts::$AWS_ACCOUNT:assumed-role/$AWS_ROLE/$AWS_INSTANCE" --condition=None --quiet >/dev/null || die 'QA_WIF_BINDING_FAILED'
# Scope the database role to the dedicated QA project, NEVER lourex-invoice.
gcloud projects add-iam-policy-binding "$QA" --member="serviceAccount:$SA" --role='roles/datastore.user' --condition=None --quiet >/dev/null || die 'QA_FIRESTORE_ROLE_FAILED'
check_no_billing
[[ $(gcloud projects describe "$PRODUCTION" --format='value(projectNumber)') == "$SOURCE_NUMBER" ]] || die 'SOURCE_IDENTITY_CHANGED'
printf '\nLOUREX ISOLATED QA READY\nQA PROJECT: %s\nQA FIRESTORE: DEFAULT / NATIVE\nQA BILLING: DISABLED\nAWS FEDERATION: REUSED\nPRODUCTION DATA AND IAM: UNCHANGED BY THIS SCRIPT\n' "$QA"
