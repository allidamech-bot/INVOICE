import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validateAwsTrustedRuntimeProfile,bindAwsTrustedRuntime} from '../api/_fiscal/aws-trusted-runtime-profile.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const files=new Map();
const file=(path,text)=>{const bytes=Buffer.from(text);files.set(path,bytes);return {path,sha256:hash(bytes)};};
const root=file('/opt/lourex-fiscal/trust/root.der','root'),leaf=file('/opt/lourex-fiscal/trust/egs.der','leaf');
const crl=file('/opt/lourex-fiscal/trust/ca.crl','crl');
const policy=file('/etc/lourex-staging/policy.bin','policy');
const manifest=file('/opt/lourex-fiscal/sdk-manifest.json','manifest');
const scope={environment:'simulation',accountUid:'owner',workspaceId:'business',egsId:'egs'};
const profile={version:'LOUREX_AWS_TRUST_PROFILE_V1',environment:'simulation',projectId:'lourex-fiscal-qa',
 keyStore:{stateDir:'/var/lib/lourex-staging/keys',configPath:'/etc/lourex-staging/softhsm2.conf',pythonExecutable:'/opt/lourex-fiscal/venv/bin/python'},
 sdk:{installationRoot:'/opt/lourex-fiscal/sdk4',pythonExecutable:'/opt/lourex-fiscal/venv/bin/python',manifestPath:manifest.path,manifestSha256:manifest.sha256,javaHome:'/usr/lib/jvm/java-21-openjdk-arm64'},
 classPath:'/opt/lourex-fiscal/java',trust:{environment:'simulation',rootDigest:root.sha256,egsPolicyOid:'1.2.3.4'},
 policy:{identifier:'https://zatca.gov.sa/simulation-policy',document:policy},
 clearance:{trust:{environment:'simulation',rootDigest:root.sha256,authoritySignerDigests:[leaf.sha256],policyOid:'1.2.3.4',curve:'secp256k1'},crls:[crl],qrProfile:'canonical-sha256-der-spki-v1'},
 chains:[{scope,leafDigest:leaf.sha256,certificates:[leaf,root],crls:[crl]}]};
test('pins simulation, tenant + EGS, authority root, SDK and approved evidence',()=>{
 assert.equal(validateAwsTrustedRuntimeProfile(profile,[scope]),profile);
 for(const p of [
  {...profile,projectId:'lourex-invoice'},
  {...profile,environment:'production'},
  {...profile,unknown:true},
  {...profile,keyStore:{...profile.keyStore,stateDir:'/home/ubuntu/keys'}},
  {...profile,keyStore:{...profile.keyStore,stateDir:'/var/lib/lourex-staging/tokens'}},
  {...profile,policy:{...profile.policy,document:{path:'/tmp/evil',sha256:policy.sha256}}},
  {...profile,clearance:{...profile.clearance,qrProfile:'test'}},
  {...profile,chains:[{...profile.chains[0],scope:{...scope,egsId:'other'}}]},
  {...profile,chains:[{...profile.chains[0],leafDigest:root.sha256}]},
  {...profile,chains:[]},
  {...profile,chains:[profile.chains[0],profile.chains[0]]},
 ])assert.throws(()=>validateAwsTrustedRuntimeProfile(p,[scope]),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
});
test('read-only binding supplies original reviewed fiscal runtime, no mock verifier',async()=>{
 let opts;
 const rt=bindAwsTrustedRuntime({profile,scopes:[scope],credentialsDirectory:'/run/credentials/lourex-aws-staging.service',db:{},
  readFile:ref=>Buffer.from(files.get(ref.path)),createStagingFiscalRuntime:args=>{opts=args;return {cycle:async()=>({})};}});
 assert.equal(typeof rt.cycle,'function');
 assert.equal(opts.projectId,'lourex-fiscal-qa');
 assert.equal(opts.secretPath,'/run/credentials/lourex-aws-staging.service/wrapping-key');
 assert.equal(opts.keyStore.pinSecretPath,'/run/credentials/lourex-aws-staging.service/pin-derivation-key');
 assert.deepEqual((await opts.loadCertificateChain({scope,leafDer:files.get(leaf.path)})).chainDer[0],files.get(leaf.path));
 await assert.rejects(opts.loadCertificateChain({scope:{...scope,egsId:'other'},leafDer:files.get(leaf.path)}),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
 await assert.rejects(opts.loadCertificateChain({scope,leafDer:files.get(root.path)}),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
});
test('fails closed when trusted material changes, credentials are missing or no cycle exists',()=>{
 const base={profile,scopes:[scope],credentialsDirectory:'/run/credentials/lourex-aws-staging.service',db:{},
  readFile:ref=>files.get(ref.path),createStagingFiscalRuntime:()=>({cycle(){}})};
 const enrollment=bindAwsTrustedRuntime({...base,
  credentialsDirectory:'/run/credentials/lourex-aws-enrollment.service'});
 assert.equal(typeof enrollment.cycle,'function');
 assert.throws(()=>bindAwsTrustedRuntime({...base,credentialsDirectory:'/run/credentials/lourex-unapproved.service'}),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
 assert.throws(()=>bindAwsTrustedRuntime({...base,credentialsDirectory:'/tmp/secret'}),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
 assert.throws(()=>bindAwsTrustedRuntime({...base,readFile:()=>Buffer.from('evil')}),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
 assert.throws(()=>bindAwsTrustedRuntime({...base,createStagingFiscalRuntime:()=>({})}),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
});

test('every selected EGS requires its own pinned certificate chain',()=>{
 const second={...scope,egsId:'egs2'};
 assert.throws(()=>validateAwsTrustedRuntimeProfile(profile,[scope,second]),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
 const full={...profile,chains:[profile.chains[0],{...profile.chains[0],scope:second}]};
 assert.equal(validateAwsTrustedRuntimeProfile(full,[scope,second]),full);
});

test('first-time EGS enrollment uses pinned CA chain without a predicted ZATCA leaf',async()=>{
 const unissued={...profile,chains:[{
  scope,leafDigest:null,certificates:[root],crls:[crl]
 }]};
 assert.equal(validateAwsTrustedRuntimeProfile(unissued,[scope]),unissued);
 const badNoIssuers={...unissued,chains:[{...unissued.chains[0],certificates:[]}]};
 const badRoot={...unissued,chains:[{...unissued.chains[0],certificates:[leaf]}]};
 const missingCrl={...unissued,chains:[{...unissued.chains[0],crls:[]}]};
 const extraCrl={...unissued,chains:[{...unissued.chains[0],crls:[crl,crl]}]};
 for(const p of [badNoIssuers,badRoot,missingCrl,extraCrl]){
  assert.throws(()=>validateAwsTrustedRuntimeProfile(p,[scope]),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
 }
 const caArgs=['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:secp256k1',
  '-keyout','/dev/null','-out','-','-outform','DER','-nodes','-days','1',
  '-subj','/CN=synthetic QA test only','-addext','basicConstraints=critical,CA:FALSE',
  '-addext','keyUsage=critical,digitalSignature'];
 const leafDer=execFileSync('openssl',caArgs,{stdio:['ignore','pipe','ignore'],timeout:15000});
 let args;
 bindAwsTrustedRuntime({profile:unissued,scopes:[scope],db:{},
  credentialsDirectory:'/run/credentials/lourex-aws-staging.service',
  readFile:ref=>Buffer.from(files.get(ref.path)),
  createStagingFiscalRuntime:o=>{args=o;return {cycle(){}};}});
 const chain=await args.loadCertificateChain({scope,leafDer});
 assert.equal(chain.identityVerified,true); // Only pinned material lookup; PKIX is independent.
 assert.deepEqual(chain.chainDer,[leafDer,files.get(root.path)]);
 assert.deepEqual(chain.crlsDer,[files.get(crl.path)]);
 await assert.rejects(args.loadCertificateChain({scope:{...scope,egsId:'foreign'},leafDer}),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
 await assert.rejects(args.loadCertificateChain({scope,leafDer:Buffer.from('not DER')}),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
 await assert.rejects(args.loadCertificateChain({scope,leafDer:Buffer.alloc(32769)}),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
 const caDer=execFileSync('openssl',caArgs.map(a=>a==='basicConstraints=critical,CA:FALSE'?'basicConstraints=critical,CA:TRUE':a),
  {stdio:['ignore','pipe','ignore'],timeout:15000});
 await assert.rejects(args.loadCertificateChain({scope,leafDer:caDer}),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
 const p256Der=execFileSync('openssl',caArgs.map(a=>a==='ec_paramgen_curve:secp256k1'?'ec_paramgen_curve:prime256v1':a),
  {stdio:['ignore','pipe','ignore'],timeout:15000});
 await assert.rejects(args.loadCertificateChain({scope,leafDer:p256Der}),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
 await assert.rejects(args.loadCertificateChain({scope,leafDer:files.get(root.path)}),/LOUREX_AWS_TRUST_PROFILE_DENIED/);
});
