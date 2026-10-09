import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('first-run onboarding requires business identity, separate PIN, and an explicitly saved recovery key',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  const setup=auth.slice(auth.indexOf('export class SetupScreen'),auth.indexOf('interface UnlockProps'));
  assert.match(setup,/Company Name English/);
  assert.match(setup,/Company Name Arabic/);
  assert.match(setup,/Company Logo · Optional/);
  assert.match(setup,/Create PIN · 4–12 digits/);
  assert.match(setup,/Confirm PIN/);
  assert.match(setup,/Save your PIN recovery key/);
  assert.match(setup,/Use this key if you forget your PIN/);
  assert.match(setup,/checked=\{this\.state\.recoverySaved\}/);
  assert.match(setup,/private finish=async\(\):Promise<void>/);
  assert.match(setup,/if\(!PIN_PATTERN\.test\(this\.state\.pin\)\)/);
  assert.match(setup,/if\(!this\.state\.recoverySaved\)/);
  assert.match(setup,/const user=currentCloudUser\(\);if\(!user\)/);
  assert.doesNotMatch(setup,/getOrCreateAccountVaultSecret/);
});

test('account plus PIN setup executes rejection gates and passes recovery key to protected creation',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  const ts=await import('typescript');
  const vm=await import('node:vm');
  const start=auth.indexOf('private finish=async():Promise<void>=>');
  const end=auth.indexOf('private copyRecoveryKey=',start);
  const fn=auth.slice(start,end);
  assert.ok(fn.startsWith('private finish=async():Promise<void>=>'));
  assert.match(fn,/await this\.props\.onFinish\(this\.state\.pin,this\.state\.company,this\.state\.recoveryCode\)/);
  const compiled=ts.default.transpileModule('export class SetupHarness {'+fn+'}',{compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2022}}).outputText;
  let user={uid:'uid-A'};
  const ctx={exports:{},PIN_PATTERN:/^\d{4,12}$/,currentCloudUser:()=>user,t:(en)=>en};
  vm.runInNewContext(compiled,ctx);
  const screen=new ctx.exports.SetupHarness();
  const created=[];
  screen.state={company:{nameEn:'Test Company',nameAr:''},pin:'1234',confirmPin:'1234',recoveryCode:'private-recovery',recoverySaved:false,logoBusy:false,busy:false,error:''};
  screen.props={onFinish:async(...args)=>{created.push(args);}};
  screen.setState=update=>Object.assign(screen.state,update);
  await screen.finish();
  assert.equal(created.length,0,'creation blocked until user confirms recovery key saved');
  screen.state.recoverySaved=true;
  screen.state.pin='123';
  await screen.finish();
  assert.equal(created.length,0,'invalid short PIN rejected');
  screen.state.pin='1234';
  screen.state.confirmPin='9999';
  await screen.finish();
  assert.equal(created.length,0,'mismatched PIN rejected');
  screen.state.confirmPin='1234';
  user=null;
  await screen.finish();
  assert.equal(created.length,0,'account sign-out forbids setup');
  user={uid:'uid-A'};
  await screen.finish();
  assert.equal(created.length,1,'valid account and recovery consent create exactly one workspace');
  assert.deepEqual(Array.from(created[0]),['1234',screen.state.company,'private-recovery']);
  await screen.finish();
  assert.equal(created.length,1,'busy state prevents duplicate submission');
});

test('v115 still defers advanced company details to Settings instead of blocking first use',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  const setup=auth.slice(auth.indexOf('export class SetupScreen'),auth.indexOf('interface UnlockProps'));
  assert.doesNotMatch(setup,/Address English/);
  assert.doesNotMatch(setup,/Commercial Registration/);
  assert.doesNotMatch(setup,/Bank Name/);
  assert.doesNotMatch(setup,/Signature/);
  assert.doesNotMatch(setup,/Stamp/);
  assert.match(setup,/Address, tax, bank details, signature, stamp and document defaults remain available in Settings/i);
});

test('v302 onboarding presentation stays compact and touch safe with account-plus-PIN polish',async()=>{
  const [legacyCss,unifiedCss,v302Css]=await Promise.all([
    read('src/styles/onboarding-simplification-v115.css'),
    read('src/styles/unified-account-v189.css'),
    read('src/styles/security-documents-closeout-v302.css')
  ]);
  assert.match(legacyCss,/\.setup-card-v115/);
  assert.match(legacyCss,/\.setup-company-essential-grid/);
  assert.match(legacyCss,/@media\(max-width:720px\)/);
  assert.match(legacyCss,/@media\(pointer:coarse\)/);
  assert.match(unifiedCss,/\.account-managed-security-note/);
  assert.match(v302Css,/\.setup-pin-grid/);
  assert.match(v302Css,/\.pin-lock-badge/);
});

test('current PWA bundles the secured onboarding and preserves historical cache paths only for migration',async()=>{
  const [html,sw,build]=await Promise.all([read('index.html'),read('public/sw.js'),read('scripts/build.mjs')]);
  assert.match(html,/href="\.\/styles\/tailadmin-shell-v320\.css/);
  assert.match(html,/matte-black-dark-v360\.css/);
  assert.match(sw,/onboarding-simplification-v115\.css/,'installed legacy users retain old asset path during migration');
  assert.match(sw,/security-documents-closeout-v302\.css/);
  assert.match(sw,/lourex-invoice-v188: preserved as a legacy marker/);
  assert.match(build,/await writeFile\('dist\/styles\/app\.bundle\.css',appBundleCss\)/);
  assert.match(build,/Production HTML did not replace the local stylesheet stack with app\.bundle\.css/);
  assert.match(build,/retiredVisualLayers/);
  assert.match(build,/standaloneRuntimeStyles/);
  const versions=[...sw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  assert.ok(Number(versions.at(-1)?.[1])>=302,'PWA must stay on a PIN-protected generation');
});

