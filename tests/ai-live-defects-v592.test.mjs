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
  assert.match(copilot,/referencedDocument=!activeDocument\?vault\.documents\.find\(document=>inWorkspace\(document\)&&document\.kind!=='draft'&&messageContainsText\(message,document\.number\)\)/);
  assert.match(copilot,/const targetDocument=activeDocument&&inWorkspace\(activeDocument\)\?activeDocument:referencedDocument/);
  assert.match(copilot,/const active=targetDocument&&targetDocument\.kind!=='draft'\?/,'never attach an unrelated free-form Draft to an AI document update');
  assert.match(copilot,/mutateVaultSafely\(vault=>\{assertAiDocumentUpdateApproval\(vault,proposal\)/,'AI document updates remain approval-gated and encrypted');
  assert.match(copilot,/current\.status!=='draft'\|\|current\.lifecycleStatus==='voided'/,'AI must not modify issued or voided documents');
  assert.match(copilot,/executeDocumentUpdateProposal=async\(proposal:AiDocumentUpdateProposal\):Promise<LourexDocument>/);
  assert.match(copilot,/Quotation draft updated and saved/);
  assert.match(copilot,/const artifact:AiDocumentArtifact=\{document,customerCreated:false\}/);
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
