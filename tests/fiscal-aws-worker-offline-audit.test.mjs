import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const file=new URL('../scripts/fiscal/audit-aws-worker-local.mjs',import.meta.url);
const source=readFileSync(file,'utf8');
test('offline fiscal audit is read-only, does not use authority or cloud APIs',()=>{
 execFileSync(process.execPath,['--check',file.pathname]);
 assert.match(source,/validateAwsFiscalWorkerConfig/);
 assert.match(source,/validateAwsTrustedRuntimeProfile/);
 assert.match(source,/readVerifiedAwsTrustFile/);
 assert.match(source,/config\.profileSha256/);
 assert.match(source,/SYSTEMD_NODE24_NOT_FOUND/);
 assert.match(source,/UNEXPECTED_DISPATCH_AUTHORIZATION/);
 assert.match(source,/processUser===0/);
 assert.match(source,/node_modules\/firebase-admin\/package\.json/);
 assert.doesNotMatch(source,/fetch\(|https?:\/\/|initializeAwsStagingFirebase|createStagingFiscalRuntime|child_process.*spawn|execSync\(|writeFile|mkdirSync|chmodSync|chownSync|rmSync|\.set\(|\.update\(|\.create\(|LOUREX_AWS_DISPATCH_APPROVED=true/);
});
test('audit output never includes account or credential contents',()=>{
 assert.match(source,/LOUREX FISCAL OFFLINE PREFLIGHT NOT READY/);
 assert.doesNotMatch(source,/console\.(?:log|error)\([^)]*(?:token|privateKey|secretPath|accountUid|vatNumber)/i);
});
