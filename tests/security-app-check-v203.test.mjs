import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const read=path=>readFile(path,'utf8');

test('v203 production output wires Firebase App Check before Auth and Firestore',async()=>{
  const [build,bootstrap,html,runtime,sw]=await Promise.all([
    read('scripts/build.mjs'),
    read('public/firebase-app-check-bootstrap.js'),
    read('dist/index.html'),
    read('dist/runtime-config.js'),
    read('dist/sw.js')
  ]);

  assert.match(build,/firebase-app-check-compat\.js/);
  assert.match(build,/FIREBASE_APP_CHECK_ENTERPRISE_KEY/);
  assert.match(build,/FIREBASE_APP_CHECK_REQUIRED/);
  assert.match(runtime,/firebaseAppCheckEnterpriseKey/);
  assert.match(runtime,/firebaseAppCheckRequired/);
  assert.match(html,/firebase-app-compat\.js[\s\S]*firebase-app-check-compat\.js[\s\S]*firebase-app-check-bootstrap\.js[\s\S]*firebase-auth-compat\.js[\s\S]*firebase-firestore-compat\.js/);
  assert.ok((await stat('dist/vendor/firebase-app-check-compat.js')).size>5000);
  assert.match(bootstrap,/ReCaptchaEnterpriseProvider/);
  assert.match(bootstrap,/appCheck\(\)\.activate\(provider,true\)/);
  assert.doesNotMatch(bootstrap,/FIREBASE_APPCHECK_DEBUG_TOKEN/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v206'/);
  assert.match(sw,/lourex-invoice-v205: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v204: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v203: preserved as a legacy marker/);
});

test('App Check activates synchronously inside Firebase initialization when configured',async()=>{
  const source=await read('public/firebase-app-check-bootstrap.js');
  const events=[];
  const firebase={apps:[]};
  firebase.initializeApp=function(){events.push('initializeApp');firebase.apps.push({name:'[DEFAULT]'});return firebase.apps[0];};
  firebase.appCheck=function(){return{activate(_provider,autoRefresh){events.push(`appCheck:${String(autoRefresh)}`);}};};
  firebase.appCheck.ReCaptchaEnterpriseProvider=class{constructor(key){this.key=key;events.push(`provider:${key}`);}};
  const window={firebase,__LOUREX_RUNTIME__:{firebaseAppCheckEnterpriseKey:'enterprise-test-key-1234567890',firebaseAppCheckRequired:true}};
  vm.runInNewContext(source,{window,Error,String,Boolean,Array});
  window.firebase.initializeApp({projectId:'lourex-invoice'});
  assert.deepEqual(events,['initializeApp','provider:enterprise-test-key-1234567890','appCheck:true']);
  assert.equal(window.__LOUREX_APP_CHECK__.active,true);
  assert.equal(window.__LOUREX_APP_CHECK__.required,true);
});

test('production build fails closed if App Check enforcement is declared without a key',()=>{
  const result=spawnSync(process.execPath,['scripts/build.mjs'],{
    encoding:'utf8',
    env:{
      ...process.env,
      VERCEL_ENV:'production',
      VERCEL_GIT_REPO_OWNER:'allidamech-bot',
      VERCEL_GIT_REPO_SLUG:'INVOICE',
      VERCEL_PROJECT_ID:'prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ',
      VERCEL_PROJECT_PRODUCTION_URL:'invoice-three-puce.vercel.app',
      FIREBASE_APP_CHECK_REQUIRED:'1',
      FIREBASE_APP_CHECK_ENTERPRISE_KEY:''
    }
  });
  assert.notEqual(result.status,0);
  assert.match(`${result.stderr}\n${result.stdout}`,/FIREBASE_APP_CHECK_REQUIRED=1 but no FIREBASE_APP_CHECK_ENTERPRISE_KEY/);
});
