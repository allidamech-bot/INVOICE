import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import test from 'node:test';
const root=resolve(dirname(fileURLToPath(import.meta.url))); // local acceptance fixture
const script=resolve(root,'../scripts/fiscal/bootstrap-free-qa-cloud-shell.sh');
const content=readFileSync(script,'utf8');

test('Cloud Shell QA bootstrap is syntactically valid Bash',()=>{
  execFileSync('/bin/bash',['-n',script]);
});
test('Cloud Shell bootstrap is isolated, billing-guarded and keyless',()=>{
  assert.match(content,/readonly QA='lourex-fiscal-qa'/);
  assert.match(content,/readonly QA_PROJECT_NUMBER='448656707310'/);
  assert.match(content,/QA_PROJECT_NUMBER_MISMATCH/);
  assert.match(content,/QA_PROJECT_DISPLAY_NAME_CHANGED/);
  assert.doesNotMatch(content,/gcloud\s+projects\s+create/);
  assert.match(content,/readonly PRODUCTION='lourex-invoice'/);
  assert.match(content,/readonly SOURCE_NUMBER='985119320046'/);
  assert.match(content,/readonly SOURCE_PROVIDER='ec2-staging'/);
  assert.match(content,/readonly SOURCE_POOL='lourex-aws-staging'/);
  assert.match(content,/--database='\(default\)'/);
  assert.match(content,/check_no_billing\n/);
  assert.match(content,/--project="\$QA" --role='roles\/iam.workloadIdentityUser'/);
  assert.match(content,/gcloud projects add-iam-policy-binding "\$QA"/);
  assert.doesNotMatch(content,/(?:gcloud\s+(?:projects\s+add-iam-policy-binding|billing\s+projects\s+link)|--billing-account|private_key|create-key)\s+"?\$PRODUCTION/);
  assert.doesNotMatch(content,/\bgcloud\s+billing\s+projects\s+link\b|--billing-account|gcloud\s+iam\s+service-accounts\s+keys\s+create/);
});
