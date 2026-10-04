import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('production build installs exactly one document checkpoint owner inside the instantiated adaptive runtime',async()=>{
 const compiled=await readFile('dist/src/app/index.js','utf8');
 const start=compiled.indexOf('class AdaptiveCloudApp extends BaseApp {');
 const end=compiled.indexOf('const App = AdaptiveCloudApp;',start);
 assert.ok(start>=0&&end>start,'the production app instantiates AdaptiveCloudApp');
 const owner=compiled.slice(start,end);
 assert.equal(compiled.split('const __lourexDocumentAutosaveV486=true;').length-1,1,'checkpoint hooks are installed exactly once');
 assert.ok(owner.includes('const __lourexDocumentAutosaveV486=true;'),'checkpoint hooks live inside the instantiated class');
 for(const hook of ['instance.persist=','instance.saveDocument=','instance.initialize=','instance.unlock=','instance.closeEditor='])assert.ok(owner.includes(hook),`${hook} is installed in the same runtime`);
 assert.ok(owner.indexOf('saveDocumentAutosaveCheckpoint(')<owner.lastIndexOf('return true;'),'durability hooks execute before the initializer closes');
 assert.ok(owner.includes('recoverDocumentAutosaveCheckpoint(key,vault)'),'process recovery uses the checkpoint owner');
 assert.doesNotThrow(()=>new Function(owner),'injected production class remains valid JavaScript');
});
