import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {applyWorkspaceCommand,workspaceDocument,workspaceDrafting,validateWorkspaceCard,WORKSPACE_COMPONENTS} from '../dist/src/lib/ai-workspace-model.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {assertAiDocumentCreateApproval} from '../dist/src/lib/ai-document-approval-guard.js';
const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'thread'};
function fixture(){const v=emptyVault();v.customers=[{id:'c1',workspaceId:'default',companyNameEn:'Same',companyNameAr:'نفس الاسم',preferredCurrency:'USD',paymentTerms:'',email:''},{id:'c2',workspaceId:'default',companyNameEn:'Same',companyNameAr:'نفس الاسم',preferredCurrency:'USD',paymentTerms:'',email:''},{id:'foreign',workspaceId:'secret',companyNameEn:'SECRET',email:''}];v.savedItems=[{id:'product',workspaceId:'default',descriptionEn:'Tea',descriptionAr:'شاي',sku:'SKU1',unit:'CTN',lastUnitPrice:'5.25',lastCurrency:'EUR',tags:[]}];const p={capability:'document.createDraft',kind:'proforma',customerId:'c1',customerDraft:null,currency:'USD',language:'bilingual',label:'Quote',rationale:'User request',items:Array.from({length:3},(_,i)=>({savedItemId:'',descriptionEn:'Item '+(i+1),descriptionAr:'صنف '+(i+1),quantity:'10',unit:'CTN',unitPrice:'25.01'})),incoterm:'EXW',paymentTerms:'Cash',deliveryTime:'',validity:'',remarks:'',notes:''};const k=newConversationKernel(scope);stageKernelArtifact(k,p);return{v,p,k};}
const cmd=(k,rest)=>({artifactId:k.artifact.id,revision:k.artifact.revision,...rest});
test('every registered descriptor rejects executable/extra props and unknown components',()=>{
 for(const component of WORKSPACE_COMPONENTS)assert.ok(validateWorkspaceCard({component,rows:[{id:'r',label:'<script>alert(1)</script>',detail:'DATA'}]}));
 for(const value of [{component:'eval',rows:[]},{component:'QuotePreview',rows:[],onClick:'code'},{component:'QuotePreview',rows:[{id:'1',label:'x',detail:'x',href:'javascript:x'}]},{component:'QuotePreview',rows:[{id:'1',label:'x',detail:'x'},{id:'1',label:'y',detail:'y'}]}])assert.equal(validateWorkspaceCard(value),null);
});
test('grid edits canonical Arabic decimals on stable line IDs without changing the vault',()=>{
 const {k,v,p}=fixture(),before=structuredClone(v),line=k.artifact.lineIds[2];applyWorkspaceCommand(k,v,cmd(k,{kind:'cell',lineId:line,field:'unitPrice',value:'٢٦٫٥'}));
 assert.equal(k.artifact.proposal.items[2].unitPrice,'26.5');assert.equal(k.artifact.lineIds[2],line);assert.equal(p.items[2].unitPrice,'25.01');assert.deepEqual(v,before);
 const doc=workspaceDocument(k,v,'ar');assert.equal(doc.subtotal,'765.20');assert.deepEqual(doc.diff.map(row=>row.after),['26.5']);
});
test('stale grid revision or wrong line IDs cannot modify the artifact',()=>{
 const {k,v}=fixture(),first=cmd(k,{kind:'cell',lineId:k.artifact.lineIds[0],field:'quantity',value:'11'});applyWorkspaceCommand(k,v,first);assert.throws(()=>applyWorkspaceCommand(k,v,first),/changed/);
 assert.throws(()=>applyWorkspaceCommand(k,v,cmd(k,{kind:'cell',lineId:'unknown',field:'unitPrice',value:'50'})),/identity/);
});
test('invalid negative, exponent, empty quantity and HTML field commands fail closed',()=>{
 const {k,v}=fixture();for(const value of ['-1','1e5','','0'])assert.throws(()=>applyWorkspaceCommand(k,v,cmd(k,{kind:'cell',lineId:k.artifact.lineIds[0],field:'quantity',value})),/decimal/);
 assert.throws(()=>applyWorkspaceCommand(k,v,cmd(k,{kind:'cell',lineId:k.artifact.lineIds[0],field:'innerHTML',value:'script'})),/Unsupported/);
 assert.equal(k.artifact.revision,1);
});
test('undo/redo restores only the working revision and its stable line IDs',()=>{
 const {k,v}=fixture(),line=k.artifact.lineIds[1];applyWorkspaceCommand(k,v,cmd(k,{kind:'cell',lineId:line,field:'unitPrice',value:'27'}));applyWorkspaceCommand(k,v,cmd(k,{kind:'undo'}));assert.equal(k.artifact.proposal.items[1].unitPrice,'25.01');applyWorkspaceCommand(k,v,cmd(k,{kind:'redo'}));assert.equal(k.artifact.proposal.items[1].unitPrice,'27');assert.equal(k.artifact.lineIds[1],line);
});
test('picker chooses exact duplicate customer ID and rejects cross-company records',()=>{
 const {k,v}=fixture();applyWorkspaceCommand(k,v,cmd(k,{kind:'customer',entityId:'c2'}));assert.equal(k.artifact.proposal.customerId,'c2');assert.equal(k.artifact.proposal.customerDraft,null);
 assert.throws(()=>applyWorkspaceCommand(k,v,cmd(k,{kind:'customer',entityId:'foreign'})),/available/);assert.ok(!JSON.stringify(workspaceDrafting(v)).includes('SECRET'));
});
test('product picker never converts a price with an incompatible currency',()=>{
 const {k,v}=fixture();applyWorkspaceCommand(k,v,cmd(k,{kind:'product',entityId:'product'}));const row=k.artifact.proposal.items.at(-1);assert.equal(row.unitPrice,'');assert.equal(row.savedItemId,'product');assert.ok(workspaceDocument(k,v,'en').blockers.length);assert.throws(()=>assertAiDocumentCreateApproval(v,k.artifact.proposal),/price or currency/);
 v.savedItems[0].lastCurrency='USD';const another=fixture().k;applyWorkspaceCommand(another,v,cmd(another,{kind:'product',entityId:'product'}));assert.equal(another.artifact.proposal.items.at(-1).unitPrice,'5.25');
});
test('product add cap rejects rather than silently losing rows',()=>{
 const {k,v}=fixture();for(let i=3;i<20;i++)applyWorkspaceCommand(k,v,cmd(k,{kind:'product',entityId:'product'}));assert.throws(()=>applyWorkspaceCommand(k,v,cmd(k,{kind:'product',entityId:'product'})),/20/);assert.equal(k.artifact.proposal.items.length,20);
});
test('saved preview preserves 30 bilingual rows and enforces branch isolation',()=>{
 const {k,v}=fixture();const d=createBlankDocument('proforma','PI-LONG',v.company);d.items=Array.from({length:30},(_,i)=>({id:'line'+i,descriptionEn:'Long '+i,descriptionAr:'وصف طويل '+i,quantity:'2',unit:'CTN',unitPrice:'0.10'}));d.number='PI-TEST';v.documents.push(d);
 const doc=workspaceDocument(k,v,'ar',d.id);assert.equal(doc.status,'saved');assert.equal(doc.rows.length,30);assert.equal(doc.subtotal,'6.00');v.documents[0].branchId='foreign';assert.equal(workspaceDocument(k,v,'ar',d.id),null);
});
test('known missing prices remain unknown, never zero subtotal',()=>{
 const {k,v}=fixture();k.artifact.proposal.items[0].unitPrice='';assert.equal(workspaceDocument(k,v,'en').subtotal,null);assert.ok(workspaceDocument(k,v,'en').blockers.length);
});
test('focus changes preserve artifacts and confer no business permission',()=>{
 const {k,v}=fixture(),before=structuredClone(k.artifact);applyWorkspaceCommand(k,v,{kind:'focus',focus:'financial'});assert.deepEqual(k.artifact,before);assert.equal(k.focus,'financial');k.scope.scope='personal';assert.equal(workspaceDocument(k,v,'en'),null);assert.throws(()=>applyWorkspaceCommand(k,v,cmd(k,{kind:'customer',entityId:'c1'})),/Personal/);
});
test('runtime final build owns typed workspace after foundation and before voice hash',async()=>{
 const built=await readFile('dist/src/components/AiCopilot.js','utf8'),pkg=JSON.parse(await readFile('package.json','utf8'));
 assert.ok(built.includes('renderConversationWorkspace(this,__lourexWorkspaceRender.call(this))'));
 assert.ok(built.includes('installConversationWorkspace(this)'));assert.ok(pkg.scripts.build.indexOf('ai-intelligence-foundation')<pkg.scripts.build.indexOf('ai-conversation-workspace'));assert.ok(pkg.scripts.build.indexOf('ai-conversation-workspace')<pkg.scripts.build.indexOf('ai-voice-final-runtime-hash'));
});
test('draft update preserves existing and added IDs through edits, append and undo',()=>{
 const {k,v}=fixture(),d=createBlankDocument('proforma','PI',v.company);d.items=[{id:'base',descriptionEn:'Original',descriptionAr:'',quantity:'1',unit:'CTN',unitPrice:'2'}];v.documents=[d];
 k.artifact=undefined;stageKernelArtifact(k,{capability:'document.updateDraft',documentId:d.id,addItems:[{savedItemId:'',descriptionEn:'Added',descriptionAr:'',quantity:'1',unit:'CTN',unitPrice:'3'}],itemEdits:[],termsPatch:{},label:'Update',rationale:'User'});
 const added=k.artifact.lineIds[0];applyWorkspaceCommand(k,v,cmd(k,{kind:'cell',lineId:added,field:'unitPrice',value:'4'}));assert.equal(k.artifact.proposal.addItems[0].unitPrice,'4');
 applyWorkspaceCommand(k,v,cmd(k,{kind:'product',entityId:'product'}));assert.equal(k.artifact.lineIds[1],added);assert.equal(new Set(workspaceDocument(k,v,'en').rows.map(row=>row.id)).size,3);
 applyWorkspaceCommand(k,v,cmd(k,{kind:'undo'}));assert.equal(workspaceDocument(k,v,'en').rows[1].id,added);assert.equal(v.documents[0].items[0].unitPrice,'2');
});
test('registered price fallback in preview equals commit validation and never invents FX',()=>{
 const {k,v}=fixture();v.savedItems[0].lastCurrency='USD';k.artifact.proposal.items=[{savedItemId:'product',descriptionEn:'',descriptionAr:'',quantity:'2',unit:'',unitPrice:''}];k.artifact.lineIds=['product-line'];
 const doc=workspaceDocument(k,v,'en');assert.equal(doc.rows[0].unitPrice,'5.25');assert.equal(doc.rows[0].descriptionEn,'Tea');assert.equal(doc.subtotal,'10.50');assert.doesNotThrow(()=>assertAiDocumentCreateApproval(v,k.artifact.proposal));
});
test('actual workspace runtime stages, encrypts, restamps and rejects stale or unauthorized commands',async()=>{
 const model=await import('../dist/src/lib/ai-workspace-model.js'),kernel=await import('../dist/src/lib/ai-conversation-kernel.js'),approval=await import('../dist/src/lib/ai-foundation-approval.js'),foundation=await import('../dist/src/lib/ai-assistant-foundation.js'),workspaces=await import('../dist/src/lib/workspaces.js'),review=await import('../dist/src/lib/ai-document-review.js');
 const records=new Map();globalThis.__workspaceDb={getRecord:async id=>records.get(id)||null,putRecord:async record=>records.set(record.id,structuredClone(record))};
 const storeSource=(await readFile('dist/src/storage/assistant-store.js','utf8')).replace(/import .* from '.*';/g,line=>line.includes("'./db.js'")?'const {getRecord,putRecord}=globalThis.__workspaceDb;':line.replace("'../lib/ai-conversation-kernel.js'",JSON.stringify(new URL('../dist/src/lib/ai-conversation-kernel.js',import.meta.url).href)));
 const store=await import('data:text/javascript;base64,'+Buffer.from(storeSource).toString('base64')+'#'+crypto.randomUUID());
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']),{v,p}=fixture(),session={key,vault:v};
 globalThis.__workspaceRuntimeModules={...model,...kernel,...approval,...foundation,...workspaces,...review,...store,activeAccountStorageUid:()=>null,resumeVaultSession:async()=>session,orchestrateAiToolRequest:async()=>null};
 const source=(await readFile('dist/src/lib/ai-intelligence-runtime.js','utf8')).replace(/import \{([\s\S]*?)\} from '[^']+';/g,(_all,names)=>`const {${names}}=globalThis.__workspaceRuntimeModules;`);
 const runtime=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+crypto.randomUUID());
 const h={props:{screen:'home',language:'ar'},state:{assistantScope:'business',messages:[],proposal:null,busy:false,error:''},__lourexAssistantThreadId:'thread',__lourexAssistantWorkspaceKey:'default|main',setState(update,done){Object.assign(this.state,typeof update==='function'?update(this.state):update);done?.();}};
 await runtime.refreshIntelligenceWorkspace(h);stageKernelArtifact(h.__intelligenceKernel,p);h.state.proposal=p;
 await runtime.updateIntelligenceWorkspace(h,cmd(h.__intelligenceKernel,{kind:'cell',lineId:h.__intelligenceKernel.artifact.lineIds[2],field:'unitPrice',value:'26'}));assert.ok(h.state.proposal.foundationApproval);assert.equal(h.state.proposal.items[2].unitPrice,'26');assert.equal(h.state.review.blockers.length,0);
 assert.ok(records.get('assistant-state').cipher);assert.ok(!JSON.stringify(records.get('assistant-state')).includes('Item 3'));assert.equal((await store.loadAssistantState(key)).threads[0].kernel.artifact.proposal.items[2].unitPrice,'26');
 const before=structuredClone(h.__intelligenceKernel),stale=cmd(h.__intelligenceKernel,{kind:'customer',entityId:'c2'});session.vault=structuredClone(v);session.vault.teamMembers[0].role='viewer';await runtime.updateIntelligenceWorkspace(h,stale);assert.deepEqual(h.__intelligenceKernel,before);assert.match(h.state.error,/role|changed/i);
 session.vault=v;await runtime.dismissIntelligenceWorkspace(h);assert.equal(h.__intelligenceKernel.artifact,undefined);assert.equal((await store.loadAssistantState(key)).threads[0].kernel.artifact,undefined);assert.equal(v.documents.length,0);
});
test('final render adapter moves exact approval into workspace and hides stale/private facts',async()=>{
 globalThis.React={createElement:(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}}),isValidElement:value=>value&&typeof value==='object'&&'type'in value,cloneElement:(node,props,...children)=>({type:node.type,props:{...node.props,...props,...(children.length?{children:children.length===1?children[0]:children}:{})}}),Children:{toArray:value=>value===undefined||value===null?[]:Array.isArray(value)?value:[value]}};
 const {renderConversationWorkspace,RegisteredWorkspaceCard}=await import('../dist/src/components/AiConversationWorkspace.js');const {k,v}=fixture();k.scope.accountId='';const props={language:'ar'};
 const h={props,__workspaceObservedProps:props,__intelligenceKernel:k,__foundationVault:v,__lourexAssistantThreadId:'thread',state:{assistantScope:'business',proposal:k.artifact.proposal,__workspaceOpen:true,messages:[]}};
 const e=React.createElement,approval=e('section',{className:'lourex-ai-proposal'},'EXACT APPROVAL'),tree=e('aside',{id:'lourex-ai-panel'},e('header',{className:'lourex-ai-head'}),e('div',{className:'lourex-ai-context'}),e('div',{className:'lourex-ai-messages'}),approval,e('footer',{className:'lourex-ai-compose'}));
 const result=renderConversationWorkspace(h,tree);assert.equal(result.props['data-workspace-ready'],'true');const body=result.props.children.at(-1),workspace=body.props.children[1];assert.equal(workspace.props.approval.props.children,'EXACT APPROVAL');assert.equal(body.props.children[0].props.children.includes(approval),false);
 h.props={language:'en'};assert.equal(renderConversationWorkspace(h,tree).props['data-workspace-ready'],'false');h.__workspaceObservedProps=h.props;k.scope.scope='personal';h.state.assistantScope='personal';assert.equal(renderConversationWorkspace(h,tree).props['data-workspace-ready'],'false');
 assert.equal(RegisteredWorkspaceCard({descriptor:{component:'javascript',rows:[]}}),null);
});
