import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('v592 preview-only document requests cannot be promoted into saved drafts',async()=>{
  const [client,api]=await Promise.all([read('src/lib/ai-tool-client.ts'),read('api/ai-core.js')]);
  assert.match(client,/function previewOnlyDocumentIntent/);
  assert.match(client,/call\.tool!=='document\.createDraft'/);
  assert.match(client,/argKind==='invoice'\?'invoice\.prepare':'quotation\.prepare'/);
  assert.match(client,/Prepare a review-only document preview without saving/);
  assert.match(api,/function previewOnlyDocumentRequested/);
  assert.match(api,/previewOnlyDocumentRequested\(cleaned\.message\)&&result\.proposal\?\.capability==='document\.createDraft'/);
  assert.match(api,/Never turn a no-save request into document\.createDraft/);
});

test('v592 saved draft updates resolve an explicit document number to the real draft id',async()=>{
  const [{emptyVault},{createBlankDocument},{createAiToolRuntime,executeAiToolPlan}]=await Promise.all([
    import('../dist/src/lib/defaults.js'),
    import('../dist/src/lib/documents.js'),
    import('../dist/src/lib/ai-tool-orchestrator.js')
  ]);
  const vault=emptyVault();
  vault.company.defaultCurrency='USD';
  const doc=createBlankDocument('proforma','QUO-2026-0001',vault.company);
  doc.status='draft';
  vault.documents=[doc];
  const runtime=createAiToolRuntime(vault,{assistantRuntime:{scope:'business',workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId}});
  const plan={version:1,goal:'Update QUO-2026-0001',calls:[{id:'u1',tool:'document.updateDraft',reason:'requested',args:{
    documentId:'QUO-2026-0001',
    addItems:[{descriptionEn:'USB Cable',descriptionAr:'',savedItemId:'',quantity:'20',unit:'CTN',unitPrice:'5.00'}],
    itemEdits:[],
    termsPatch:{}
  }}]};
  const result=executeAiToolPlan(runtime,plan);
  assert.equal(result.results[0].ok,true);
  assert.equal(result.proposal.capability,'document.updateDraft');
  assert.equal(result.proposal.documentId,doc.id);
  assert.equal(result.proposal.addItems.length,1);
});

test('v592 draft context can target a saved document explicitly named in chat and update completion is tangible',async()=>{
  const copilot=await read('src/components/AiCopilot.tsx');
  assert.match(copilot,/const inWorkspace=\(row:\{workspaceId\?:string\}\)=>\(row\.workspaceId\|\|'default'\)===activeWorkspace/,'only same-workspace records may be exposed as AI references');
  assert.match(copilot,/const inBranch=\(row:\{workspaceId\?:string;branchId\?:string\}\)=>inWorkspace\(row\)&&\(row\.branchId\|\|'main'\)===activeBranch/,'company-level master data may be reused, but documents must be restricted to the active branch');
  assert.match(copilot,/referencedDocument=!activeDocument\?vault\.documents\.find\(document=>inBranch\(document\)&&document\.kind!=='draft'&&messageContainsText\(message,document\.number\)\)/);
  assert.match(copilot,/vault\.customers\]\.filter\(inWorkspace\)/,'customer master records remain company-scoped');
  assert.match(copilot,/vault\.savedItems\.filter\(item=>inWorkspace\(item\)/,'products remain company-scoped');
  assert.match(copilot,/const targetDocument=activeDocument&&inBranch\(activeDocument\)\?activeDocument:referencedDocument/);
  assert.match(copilot,/const active=targetDocument&&targetDocument\.kind!=='draft'\?/,'never attach an unrelated free-form Draft to an AI document update');
  assert.match(copilot,/mutateVaultSafely\(vault=>\{assertAiDocumentUpdateApproval\(vault,proposal\)/,'AI document updates remain approval-gated and encrypted');
  assert.match(copilot,/current\.status!=='draft'\|\|current\.lifecycleStatus==='voided'/,'AI must not modify issued or voided documents');
  assert.match(copilot,/executeDocumentUpdateProposal=async\(proposal:AiDocumentUpdateProposal\):Promise<LourexDocument>/);
  assert.match(copilot,/Quotation draft updated and saved/);
  assert.match(copilot,/const artifact:AiDocumentArtifact=\{document,customerCreated:false\}/);
});

test('AI drafting context excludes another branch invoice even when its exact number is requested',async()=>{
  const ts=await import('typescript');
  const vm=await import('node:vm');
  const copilot=await read('src/components/AiCopilot.tsx');
  const source=copilot.slice(copilot.indexOf('function draftReference('),copilot.indexOf('export function buildAiContext('));
  assert.ok(source.startsWith('function draftReference('));
  const compiled=ts.default.transpileModule(source+'\nexports.draftReference=draftReference;',{
    compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2022}
  }).outputText;
  const context={exports:{},
    normalized:value=>String(value).toLowerCase().trim().replace(/\s+/g,' '),
    messageContainsText:(message,value)=>Boolean(value&&message.toLowerCase().includes(String(value).toLowerCase())),
    aiProductArchived:()=>false,
    isSupplierDocumentKind:()=>false,
    AI_ARCHIVE_TAG:'archived-by-ai'
  };
  vm.runInNewContext(compiled,context);
  const reference=context.exports.draftReference;
  const doc=(id,branchId,number)=>({
    id,workspaceId:'company-A',branchId,number,kind:'proforma',role:'standard',
    status:'draft',currency:'USD',language:'en',items:[],notes:'',
    terms:{incoterm:'',paymentTerms:'',packing:'',deliveryTime:'',portOfLoading:'',finalDestination:'',countryOfOrigin:'',validity:'',remarks:''}
  });
  const alpha=doc('alpha','branch-A','Q-ALPHA');
  const beta=doc('beta','branch-B','Q-BETA');
  const vault={
    appSettings:{activeWorkspaceId:'company-A',activeBranchId:'branch-A',smartDefaults:{}},
    company:{defaultCurrency:'USD',defaultLanguage:'en',defaultIncoterm:'',defaultPaymentTerms:'',defaultDeliveryTime:'',defaultValidityDays:14},
    documents:[beta,alpha],
    customers:[{id:'customer-company',workspaceId:'company-A',branchId:'branch-B',companyNameEn:'Company Customer',companyNameAr:'',contactPerson:'',email:'',phone:'',updatedAt:'2026-10-09'}],
    savedItems:[]
  };
  assert.equal(reference(vault,'Update Q-BETA').activeDocument,null,'explicit references cannot reveal a different branch');
  assert.equal(reference(vault,'Update Q-BETA',beta).activeDocument,null,'injected active document must not bypass branch boundary');
  assert.equal(reference(vault,'Update Q-ALPHA').activeDocument.id,'alpha','same-branch document remains available');
  assert.equal(reference(vault,'Update Q-ALPHA').customers[0].id,'customer-company','company-scoped master data remains usable');
  assert.equal(reference({...vault,appSettings:{...vault.appSettings,activeBranchId:'branch-B'}},'Update Q-BETA').activeDocument.id,'beta');
});

test('v592 keeps high-impact finance tools protected',async()=>{
  const source=await read('src/lib/ai-tool-orchestrator.ts');
  assert.match(source,/\['document\.finalize','high-impact'/);
  assert.match(source,/\['payment\.record','high-impact'/);
  assert.match(source,/\['inventory\.adjust','high-impact'/);
  assert.match(source,/\['financial\.delete','high-impact'/);
  assert.match(source,/\['accounting\.post','high-impact'/);
  assert.match(source,/if\(HIGH_IMPACT\.has\(call\.tool\)\)return/);
});
