import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument,duplicateDocument,nextDocumentNumber} from '../dist/src/lib/documents.js';
import {createWorkspace,activateWorkspace,scopeVault,applyWorkspaceScope,overlayWorkspaceScope,COMPANY_SCOPED_KEYS,BRANCH_SCOPED_KEYS} from '../dist/src/lib/workspaces.js';
import {applyPaymentTermPreset,applyCustomerCommercialDefaults,paymentTermPresetByLabel} from '../dist/src/lib/commercial-controls.js';

async function harness(){
 const source=await readFile(new URL('../src/app/App.tsx',import.meta.url),'utf8');
 const creation=source.slice(source.indexOf('  private reserveDocument='),source.indexOf('  private saveDocument='));
 const duplicate=source.slice(source.indexOf('  private duplicate='),source.indexOf('\n',source.indexOf('  private duplicate=')));
 const js=ts.transpileModule(`class Harness {${creation}\n${duplicate}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const context={nextDocumentNumber,createBlankDocument,duplicateDocument,overlayWorkspaceScope,paymentTermPresetByLabel,applyPaymentTermPreset,applyCustomerCommercialDefaults,customerSnapshotFrom,confirmWorkspaceDeparture:()=>true,isDeliveryLinkedInvoice:()=>false,document:{documentElement:{setAttribute(){},removeAttribute(){}}},t:en=>en};
 vm.runInNewContext(js+';this.Harness=Harness;',context);
 const h=new context.Harness();
 let full=emptyVault();
 const hiddenWorkspace=full.appSettings.activeWorkspaceId,hiddenBranch=full.appSettings.activeBranchId;
 // Foreign rows stand for every company/branch-scoped collection, including
 // historical movements which need not meet today's new-entry requirements.
 for(const key of [...COMPANY_SCOPED_KEYS,...BRANCH_SCOPED_KEYS]) full[key]=[{id:`foreign-${key}`,workspaceId:hiddenWorkspace,branchId:hiddenBranch,number:`FOREIGN-${key}`,reason:''}];
 full=createWorkspace(full,'Synthetic isolated acceptance');
 full=activateWorkspace(full,full.workspaces.at(-1).id);
 const before=structuredClone(full),writes=[];
 h.state={vault:full,screen:'documents'};
 h.requireVault=()=>scopeVault(h.state.vault);
 h.persist=async intended=>{
  writes.push(structuredClone(intended));
  const scoped=applyWorkspaceScope(scopeVault(h.state.vault),intended);
  full=overlayWorkspaceScope(h.state.vault,scoped);h.state.vault=full;
 };
 h.setState=(patch,callback)=>{Object.assign(h.state,patch);callback?.();};
 h.showToast=message=>{if(!/Duplicate created/.test(message))throw new Error(message);};
 return{h,before,writes,hiddenWorkspace,getFull:()=>full};
}

function assertIsolation(run){
 const {before,hiddenWorkspace,getFull,writes}=run;
 for(const key of [...COMPANY_SCOPED_KEYS,...BRANCH_SCOPED_KEYS]){
  assert.deepEqual(getFull()[key].filter(row=>row.workspaceId===hiddenWorkspace),before[key],`preserve hidden ${key}`);
  for(const write of writes)assert.equal(write[key].some(row=>row.id===`foreign-${key}`),false,`never submit foreign ${key} as active workspace intent`);
 }
 assert.equal(scopeVault(getFull()).documents.length,1);
 assert.equal(run.h.state.screen,'editor');
}

test('real reservation and new-document methods never re-stamp hidden company/branch records',async()=>{
 const run=await harness();await run.h.newDocument('proforma');assertIsolation(run);
});
test('customer-specific creation preserves hidden workspace records',async()=>{
 const run=await harness();const customer={id:'qa-customer',companyNameEn:'Synthetic buyer',preferredCurrency:'USD',paymentTerms:'',paymentDueDays:''};
 await run.h.newDocumentForCustomer('invoice',customer);assertIsolation(run);
});
test('duplicate uses the scoped reservation without importing foreign records',async()=>{
 const run=await harness();const doc=createBlankDocument('invoice','INV-QA-SOURCE',scopeVault(run.getFull()).company);
 await run.h.duplicate(doc);assertIsolation(run);
});
