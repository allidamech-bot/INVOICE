import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const path=new URL('../scripts/fiscal/check-aws-qa-data-plane-on-ec2.sh',import.meta.url);
const source=readFileSync(path,'utf8');
test('EC2 only: safe Bash acceptance script parses',()=>{
 execFileSync('bash',['-n',path.pathname]);
});
test('exact pinned instance/role, source blob and no billing/production IAM operations',()=>{
 for(const marker of ['i-05530aee6c25c984e','lourex-zatca-staging-wif','lourex-staging','/etc/lourex-staging/aws-adc.json','3c5cdf4124bc00d9efaf495b4f47ec822352413b']){
  assert(source.includes(marker));
 }
 assert.match(source,/git hash-object/);
 assert.match(source,/sudo cmp -s/);
 assert.match(source,/sudo -u lourex-staging/);
 assert.doesNotMatch(source,/gcloud\s|aws\s+(ec2|iam)|systemctl\s|--billing-account|firebase\s+deploy|npm\s+install|apt\s+install|gcloud\s+projects/);
});
