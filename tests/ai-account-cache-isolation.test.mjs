import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

async function harness(){
 const rows=new Map();let source=await readFile('dist/src/storage/db.js','utf8');
 const from=source.indexOf('function openDb()'),to=source.indexOf('export async function getRecord',from);
 assert.ok(from>=0&&to>from);source=source.slice(0,from)+'function openDb(){return Promise.resolve(globalThis.__aiCacheDb);}\n'+source.slice(to)+'\nexport function testScope(uid){activeStorageUid=uid;}';
 const db={name:'lourex-invoice-account-one',transaction(){
  const tx={objectStore(){return {get(id){const req={};queueMicrotask(()=>{req.result=rows.get(id);req.onsuccess?.();});return req;},put(record){rows.set(record.id,structuredClone(record));}};},abort(){tx.onabort?.();}};
  setTimeout(()=>tx.oncomplete?.(),0);return tx;
 }};
 globalThis.__aiCacheDb=db;const mod=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+crypto.randomUUID());mod.testScope('one');return{mod,rows,db};
}
test('PIN-free assistant caches preserve historical records and survive a fresh key read',async()=>{
 const {mod,rows}=await harness();rows.set('assistant-state',{id:'assistant-state',version:1,cipher:'HISTORICAL-PIN-CACHE'});
 const key=await mod.getAccountAssistantCacheKey('one');assert.equal(key.extractable,false);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:new Uint8Array(12)},key,new TextEncoder().encode('account one')));
 await mod.putRecord({id:'assistant-state',version:1,cipher:'NEW-CACHE'},key);assert.equal(rows.get('assistant-state').cipher,'HISTORICAL-PIN-CACHE');assert.equal((await mod.getRecord('assistant-state',key)).cipher,'NEW-CACHE');
 const again=await mod.getAccountAssistantCacheKey('one');assert.equal(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(12)},again,encrypted)),'account one');
});
test('a key captured before account switching cannot read or write another account cache',async()=>{
 const {mod,rows,db}=await harness(),key=await mod.getAccountAssistantCacheKey('one');mod.testScope('two');db.name='lourex-invoice-account-two';const before=structuredClone(rows);
 await assert.rejects(mod.getRecord('assistant-state',key),/account changed/);await assert.rejects(mod.putRecord({id:'assistant-state',cipher:'foreign'},key),/account changed/);assert.deepEqual(rows,before);
});
test('a stale database handle is rejected even if the UID has switched back',async()=>{
 const {mod,db}=await harness(),key=await mod.getAccountAssistantCacheKey('one');db.name='lourex-invoice-account-two';await assert.rejects(mod.putRecord({id:'assistant-state',cipher:'foreign'},key),/database scope changed/);
});
