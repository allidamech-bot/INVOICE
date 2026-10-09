import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('AI product archive, restore and metadata approvals reject another company at mutation time',async()=>{
  const copilot=await read('src/components/AiCopilot.tsx');
  const start=copilot.indexOf('private executeItemProposal=async(');
  const end=copilot.indexOf('private documentLine=',start);
  assert.ok(start>=0&&end>start,'exercise actual production product approval executor');
  const method=copilot.slice(start,end);
  assert.match(method,/const activeWorkspace=vault\.appSettings\.activeWorkspaceId\|\|'default'/);
  assert.match(method,/if\(\(current\.workspaceId\|\|'default'\)!==activeWorkspace\)throw new Error/);
  assert.match(method,/mutateVaultSafely\(vault=>/,'enforce company check inside final atomic mutation');
  const code=ts.transpileModule('export class Harness{\n'+method+'\n}',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const item=(id,workspaceId)=>({id,workspaceId,descriptionEn:id,updatedAt:'2026-10-09T00:00:00.000Z',
    archived:false,tags:[],sku:id,descriptionAr:'',unit:'CTN'});
  let vault={appSettings:{activeWorkspaceId:'company-A'},
    savedItems:[item('product-A','company-A'),item('product-B','company-B')]};
  const context={exports:{},AI_ARCHIVE_TAG:'archived-by-ai',
    t:english=>english,
    mutateVaultSafely:async update=>{const next=await update(vault);vault=next;return next;},
    aiProductArchived:product=>product.archived===true,
    findSavedItemDuplicate:()=>null
  };
  vm.runInNewContext(code,context);
  const executor=new context.exports.Harness();
  const approve=(capability,itemId,patch)=>executor.executeItemProposal({capability,itemId,patch});
  for(const capability of ['item.archive','item.restore','item.updateMetadata']){
    await assert.rejects(approve(capability,'product-B',{sku:'CROSS-BRANCH'}),/Product is unavailable in the active company/);
    assert.equal(vault.savedItems.find(row=>row.id==='product-B').sku,'product-B');
    assert.equal(vault.savedItems.find(row=>row.id==='product-B').archived,false);
  }
  await approve('item.archive','product-A');
  assert.equal(vault.savedItems.find(row=>row.id==='product-A').archived,true);
  assert.equal(vault.savedItems.find(row=>row.id==='product-B').archived,false);
  await approve('item.restore','product-A');
  assert.equal(vault.savedItems.find(row=>row.id==='product-A').archived,false);
  await approve('item.updateMetadata','product-A',{sku:'LOCAL-SKU'});
  assert.equal(vault.savedItems.find(row=>row.id==='product-A').sku,'LOCAL-SKU');
  assert.equal(vault.savedItems.find(row=>row.id==='product-B').sku,'product-B');

  // A previously approved product must become inaccessible after company switch.
  vault={...vault,appSettings:{activeWorkspaceId:'company-B'}};
  await assert.rejects(approve('item.archive','product-A'),/Product is unavailable in the active company/);
  assert.equal(vault.savedItems.find(row=>row.id==='product-A').archived,false);
  await approve('item.archive','product-B');
  assert.equal(vault.savedItems.find(row=>row.id==='product-B').archived,true);
});
