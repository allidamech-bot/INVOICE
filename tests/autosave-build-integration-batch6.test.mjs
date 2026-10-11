import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('production build installs exactly one PIN-free serialized document autosave owner in active runtime',async()=>{
 const compiled=await readFile('dist/src/app/index.js','utf8');
 const start=compiled.indexOf('class AdaptiveCloudApp extends BaseApp {');
 const end=compiled.indexOf('const App = AdaptiveCloudApp;',start);
 assert.ok(start>=0&&end>start,'the production app instantiates AdaptiveCloudApp');
 const owner=compiled.slice(start,end);
 assert.equal(compiled.split('const __lourexPinlessAutosaveV2=true;').length-1,1,'one V2 autosave owner must be installed');
 assert.ok(owner.includes('const __lourexPinlessAutosaveV2=true;'),'active class installs V2 autosave');
 assert.ok(owner.includes('instance.saveDocument='),'document writes must serialize within one owner');
 assert.ok(owner.includes('pendingDocumentSave'),'queued auto and explicit saves must not race');
 assert.doesNotMatch(owner,/saveDocumentAutosaveCheckpoint\(|instance\.unlock\.bind\(|createEncryptedBackup/);
 assert.doesNotThrow(()=>new Function(owner),'injected production class remains valid JavaScript');
});
