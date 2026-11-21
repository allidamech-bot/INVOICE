import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fiscalAudit} from '../scripts/fiscal/aws-readiness-gate.mjs';
import {createHash} from 'node:crypto';
import {
  AWS_FISCAL_QA_PROJECT,AWS_FISCAL_QA_SERVICE_ACCOUNT,AWS_FISCAL_WIF_AUDIENCE,AWS_FISCAL_ADC_PATH,
} from '../api/_fiscal/aws-worker-configuration.js';

test('audit fails closed without reviewed QA files and never reports authority success',()=>{
  const r=fiscalAudit({base:'/absent-qa',releaseRoot:'/absent-release',serviceStopped:()=>true,read:()=>null,readJson:()=>null});
  assert.equal(r.decision,'HOLD');
  assert.equal(r.scope,'SIMULATION_ONLY');
  assert.equal(r.checks.qaOnlyScopes,'BLOCKED');
  assert.equal(r.checks.zatcaSimulationAcceptance,'NOT_PERFORMED');
  assert.equal(r.checks.officialSimulationCaCrlPolicy,'UNVERIFIED');
});
test('running dispatch cannot be treated as acceptable readiness',()=>{
  const r=fiscalAudit({base:'/absent-qa',releaseRoot:'/absent-release',serviceStopped:u=>!u.includes('staging.service'),read:()=>null,readJson:()=>null});
  assert.equal(r.checks.dispatchStopped,'BLOCKED');
});
test('operator output is read-only HOLD with nonzero exit',()=>{
  const script=fileURLToPath(new URL('../scripts/fiscal/aws-readiness-gate.mjs',import.meta.url));
  const p=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000});
  assert.equal(p.status,2);
  const r=JSON.parse(p.stdout);
  assert.equal(r.decision,'HOLD');
  assert.ok(!('secret' in r));
});

test('read-only audit accepts only an explicitly pinned, matching installed release SHA',()=>{
  const sha='b'.repeat(40);
  const options={
    base:'/absent-qa',releaseRoot:'/opt/fiscal-test',serviceStopped:()=>true,
    read:p=>p==='/opt/fiscal-test/.lourex-fiscal-commit'?Buffer.from(sha+'\n'):null,
    readJson:()=>null
  };
  assert.equal(fiscalAudit({...options,expectedReleaseSha:sha}).checks.reviewedReleaseInstalled,'PASS');
  assert.equal(fiscalAudit({...options,expectedReleaseSha:''}).checks.reviewedReleaseInstalled,'BLOCKED');
  assert.equal(fiscalAudit({...options,expectedReleaseSha:'a'.repeat(40)}).checks.reviewedReleaseInstalled,'BLOCKED');
  assert.equal(fiscalAudit({...options,expectedReleaseSha:'invalid'}).checks.reviewedReleaseInstalled,'BLOCKED');
  assert.equal(fiscalAudit({...options,expectedReleaseSha:sha}).decision,'HOLD');
});

const h=b=>createHash('sha256').update(b).digest('hex');
const qaScope={environment:'simulation',accountUid:'synthetic-owner',workspaceId:'synthetic-workspace',egsId:'synthetic-egs'};
function syntheticTrustProfile(){
  const root=h('synthetic CA placeholder: no trust is established');
  const rootRef={path:'/opt/lourex-fiscal/trust/test-root.der',sha256:root};
  const crlRef={path:'/opt/lourex-fiscal/trust/test-ca.crl',sha256:h('synthetic CRL placeholder')};
  return {
    version:'LOUREX_AWS_TRUST_PROFILE_V1',projectId:AWS_FISCAL_QA_PROJECT,environment:'simulation',
    keyStore:{stateDir:'/var/lib/lourex-staging/qa-keys',configPath:'/etc/lourex-staging/softhsm2.conf',pythonExecutable:'/opt/lourex-fiscal/venv/bin/python'},
    sdk:{installationRoot:'/opt/lourex-fiscal/sdk4',pythonExecutable:'/opt/lourex-fiscal/venv/bin/python',
      manifestPath:'/opt/lourex-fiscal/sdk-manifest.json',manifestSha256:h('synthetic manifest'),javaHome:'/usr/lib/jvm/java-21'},
    classPath:'/opt/lourex-fiscal/java',
    trust:{environment:'simulation',rootDigest:root,egsPolicyOid:'1.2.3.4'},
    policy:{identifier:'https://zatca.gov.sa/simulation-policy',document:{path:'/etc/lourex-staging/test-policy',sha256:h('synthetic policy')}},
    clearance:{trust:{environment:'simulation',rootDigest:root,authoritySignerDigests:[h('synthetic signer')],policyOid:'1.2.3.4',curve:'secp256k1'},
      crls:[crlRef],qrProfile:'canonical-sha256-der-spki-v1'},
    chains:[{scope:qaScope,leafDigest:null,certificates:[rootRef],crls:[crlRef]}]
  };
}
function mockedConfigAudit(worker,profile){
  const base='/etc/lourex-staging';
  const files=new Map([[base+'/worker.json',Buffer.from(JSON.stringify(worker))],
    [base+'/trusted-runtime-profile.json',Buffer.from(JSON.stringify(profile))]]);
  return fiscalAudit({base,releaseRoot:'/absent-release',serviceStopped:()=>true,read:p=>files.get(p)??null});
}
test('readiness rejects an extra worker key even when its scope and profile hash appear valid',()=>{
  const profile=syntheticTrustProfile(),bytes=Buffer.from(JSON.stringify(profile));
  const worker={projectId:AWS_FISCAL_QA_PROJECT,serviceAccount:AWS_FISCAL_QA_SERVICE_ACCOUNT,
    audience:AWS_FISCAL_WIF_AUDIENCE,adcPath:AWS_FISCAL_ADC_PATH,scopes:[qaScope],profileSha256:h(bytes)};
  assert.equal(mockedConfigAudit({...worker,unsafeExtra:true},profile).checks.qaOnlyScopes,'BLOCKED');
  assert.equal(mockedConfigAudit({...worker,scopes:[{...qaScope,environment:'production'}]},profile).checks.qaOnlyScopes,'BLOCKED');
});
test('matching hash over a superficial fake profile never passes trusted runtime schema',()=>{
  const superficial={version:'LOUREX_AWS_TRUST_PROFILE_V1',projectId:AWS_FISCAL_QA_PROJECT,environment:'simulation'};
  const worker={projectId:AWS_FISCAL_QA_PROJECT,serviceAccount:AWS_FISCAL_QA_SERVICE_ACCOUNT,
    audience:AWS_FISCAL_WIF_AUDIENCE,adcPath:AWS_FISCAL_ADC_PATH,scopes:[qaScope],
    profileSha256:h(Buffer.from(JSON.stringify(superficial)))};
  const audit=mockedConfigAudit(worker,superficial);
  assert.equal(audit.checks.qaOnlyScopes,'PASS');
  assert.equal(audit.checks.pinnedSimulationProfile,'BLOCKED');
  assert.equal(audit.decision,'HOLD');
});
test('complete synthetic schema pins never claim official Simulation trust or acceptance',()=>{
  const profile=syntheticTrustProfile();
  const worker={projectId:AWS_FISCAL_QA_PROJECT,serviceAccount:AWS_FISCAL_QA_SERVICE_ACCOUNT,
    audience:AWS_FISCAL_WIF_AUDIENCE,adcPath:AWS_FISCAL_ADC_PATH,scopes:[qaScope],
    profileSha256:h(Buffer.from(JSON.stringify(profile)))};
  const audit=mockedConfigAudit(worker,profile);
  assert.equal(audit.checks.qaOnlyScopes,'PASS');
  assert.equal(audit.checks.pinnedSimulationProfile,'PASS');
  assert.equal(audit.checks.officialSimulationCaCrlPolicy,'UNVERIFIED');
  assert.equal(audit.checks.zatcaSimulationAcceptance,'NOT_PERFORMED');
  assert.equal(audit.decision,'HOLD');
});
