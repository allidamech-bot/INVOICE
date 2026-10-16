import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function portal({getError=false}={}){
  const source=(await readFile(new URL('../dist/src/portal/share-data.js',import.meta.url),'utf8')).replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'');
  const calls=[],data={format:'LOUREX_SECURE_SHARE_V1',version:1,snapshot:{number:'QR-001'},allowDecision:true,decision:''};
  const snap={exists:true,data:()=>data};
  const ref={get:async options=>{calls.push(['get',options]);if(getError)throw new Error('offline');return snap;},update:async patch=>calls.push(['update',patch])};
  const firestore=()=>({collection:name=>{assert.equal(name,'publicShares');return{doc:id=>{calls.push(['doc',id]);return ref;}};},runTransaction:async fn=>fn({get:async()=>snap,update:(_,patch)=>calls.push(['transaction',patch])})});
  firestore.FieldValue={serverTimestamp:()=> 'SERVER_TIMESTAMP'};
  const firebase={apps:[{name:'lourex-public-share'}],firestore};
  Object.defineProperty(firebase,'auth',{get(){throw new Error('auth/admin-restricted-operation');}});
  const context=vm.createContext({firebase,window:{},LOUREX_FIREBASE_CONFIG:{},SECURE_SHARE_FORMAT:data.format,SECURE_SHARE_MAX_COMMENT:1000,SECURE_SHARE_TOKEN_PATTERN:/^[A-Za-z0-9_-]{43}$/});
  vm.runInContext(source+'\nthis.api={loadPortalShare,markPortalViewed,sendPortalComment,sendPortalDecision};',context);
  return{api:context.api,calls};
}
test('actual compiled portal loads and records evidence even when Firebase Auth is forbidden',async()=>{
  const {api,calls}=await portal(),id='P'.repeat(43);
  assert.equal((await api.loadPortalShare(id)).snapshot.number,'QR-001');
  assert.equal(calls.find(c=>c[0]==='get')[1].source,'server','revocation cannot fall back to cached document');
  await api.markPortalViewed(id);await api.sendPortalComment(id,'Received');await api.sendPortalDecision(id,'accepted','');
  assert.equal(calls.filter(c=>c[0]==='update').length,2);
  assert.equal(calls.filter(c=>c[0]==='transaction').length,1);
});
test('invalid tokens fail before database access and failed view evidence does not reject',async()=>{
  const {api,calls}=await portal();
  for(const fn of [()=>api.loadPortalShare('bad'),()=>api.sendPortalComment('bad','Hi'),()=>api.sendPortalDecision('bad','accepted','')])await assert.rejects(fn,/invalid/);
  assert.equal(calls.length,0);
  const offline=await portal({getError:true});
  await assert.rejects(()=>offline.api.loadPortalShare('P'.repeat(43)),/offline/);
  await offline.api.markPortalViewed('P'.repeat(43));
});
