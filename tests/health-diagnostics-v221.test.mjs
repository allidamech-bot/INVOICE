import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const health=await readFile(new URL('../public/health.html',import.meta.url),'utf8');
const healthScript=await readFile(new URL('../public/health.js',import.meta.url),'utf8');

test('health diagnostics bound every browser probe and always render a final report',()=>{
  assert.match(health,/<script src="\.\/health\.js" defer><\/script>/);
  assert.doesNotMatch(health,/<script>(?!\s*<\/script>)/);
  assert.match(healthScript,/const PROBE_TIMEOUT_MS=1800,HEALTH_DEADLINE_MS=8000/);
  assert.match(healthScript,/const withTimeout=/);
  assert.match(healthScript,/withTimeout\(navigator\.serviceWorker\.getRegistration\(\),'Service worker check'\)/);
  assert.match(healthScript,/withTimeout\(caches\.keys\(\),'Cache storage check'\)/);
  assert.match(healthScript,/withTimeout\(navigator\.storage\.estimate\(\),'Browser storage estimate'\)/);
  assert.match(healthScript,/withTimeout\(indexedDB\.databases\(\),'IndexedDB enumeration'\)/);
  assert.match(healthScript,/finally\{finished=true;render\(\);\}/);
  assert.match(healthScript,/Diagnostic deadline reached/);
});

test('health diagnostics recognize current scoped databases without opening or reading them',()=>{
  assert.match(healthScript,/PUBLIC_DB_NAME='lourex-invoice-public'/);
  assert.match(healthScript,/ACCOUNT_DB_PREFIX='lourex-invoice-account-'/);
  assert.match(healthScript,/names\.filter\(name=>name\.startsWith\(ACCOUNT_DB_PREFIX\)\)/);
  assert.doesNotMatch(healthScript,/indexedDB\.open\(/);
  assert.doesNotMatch(healthScript,/transaction\('records'/);
  assert.doesNotMatch(healthScript,/cloud-account|safety-snapshot/);
});

test('health diagnostics retain privacy-scoped storage without accessing customer or invoice data',()=>{
  assert.match(health,/It does not open or print decrypted business content/i);
  assert.match(health,/لا يتم تسجيل أسماء العملاء أو المستندات أو المبالغ أو كلمات المرور أو PIN أو محتوى المرفقات/);
  assert.match(healthScript,/Encrypted local storage/);
  assert.match(healthScript,/indexedDB\.databases\(\)/);
  assert.match(healthScript,/vault\.fingerprint!==scope\.fingerprint/);
  assert.doesNotMatch(healthScript,/indexedDB\.open\(|transaction\(['"]records['"]\)|getEncryptedVault\(|decryptVault\(/);
  assert.match(healthScript,/el\.querySelector\('\.value'\)\.textContent=row\.value/);
  assert.match(healthScript,/document\.getElementById\('report'\)\.textContent=systemReportText\(\)/);
});

test('health respects strict production CSP and applies light, dark and system preferences',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  const policy=config.headers.find(item=>item.headers?.some(header=>header.key==='Content-Security-Policy'))
    ?.headers.find(header=>header.key==='Content-Security-Policy')?.value||'';
  assert.match(policy,/script-src 'self'/);
  assert.doesNotMatch(policy,/script-src [^;]*'unsafe-inline'/);
  assert.doesNotMatch(health,/<script\s*(?:type=["']text\/javascript["'])?\s*>/i);
  assert.match(health,/<script src="\.\/health\.js" defer><\/script>/);
  assert.match(healthScript,/function applyDiagnosticTheme\(\)/);
  const begin=healthScript.indexOf('function applyDiagnosticTheme()');
  const end=healthScript.indexOf('\n  applyDiagnosticTheme();',begin);
  assert.ok(begin>=0&&end>begin);
  const extracted=healthScript.slice(begin,end);
  const exercise=(saved,dark,throwOnStorage=false)=>{
    const html={dataset:{},style:{}};
    const meta={content:'',setAttribute(key,value){assert.equal(key,'content');this.content=value;}};
    const context={
      localStorage:{getItem(key){assert.equal(key,'lourex-ui-theme');if(throwOnStorage)throw new Error('storage blocked');return saved;}},
      matchMedia:query=>{assert.equal(query,'(prefers-color-scheme: dark)');return{matches:dark};},
      document:{documentElement:html,querySelector:selector=>selector==='meta[name="theme-color"]'?meta:null}
    };
    vm.runInNewContext(extracted+'\napplyDiagnosticTheme();',context);
    return {theme:html.dataset.uiTheme,scheme:html.style.colorScheme,meta:meta.content};
  };
  assert.deepEqual(exercise('dark',false),{theme:'dark',scheme:'dark',meta:'#0D0D0D'});
  assert.deepEqual(exercise('light',true),{theme:'light',scheme:'light',meta:'#f4f7fb'});
  assert.deepEqual(exercise('system',true),{theme:'dark',scheme:'dark',meta:'#0D0D0D'});
  assert.deepEqual(exercise('system',false),{theme:'light',scheme:'light',meta:'#f4f7fb'});
  assert.deepEqual(exercise('',false,true),{theme:'light',scheme:'light',meta:'#f4f7fb'});
});
