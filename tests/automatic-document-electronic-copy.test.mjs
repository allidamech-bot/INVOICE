import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as domain from '../dist/src/lib/secure-share.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {defaultCompany,emptyVault} from '../dist/src/lib/defaults.js';
const read=p=>readFile(p,'utf8');

function document(kind='proforma'){
 const d=createBlankDocument(kind,'QUO-AUTO-001',defaultCompany());d.status='final';
 d.customerSnapshot={sourceCustomerId:'buyer',companyNameEn:'Buyer',companyNameAr:'عميل',email:'buyer@example.test'};
 d.items=[{...d.items[0],id:'line',descriptionEn:'Chips',quantity:'10',unit:'CTN',unitPrice:'5.00',unitCost:'2.00'}];return d;
}
async function transport(){
 const data=new Map();let uid='owner',tail=Promise.resolve(),writes=0;
 const ref=path=>({path,collection:name=>ref(path+'/'+name),doc:name=>ref(path+'/'+name),get:async()=>({exists:data.has(path),data:()=>data.get(path)})});
 const db={collection:name=>ref(name),runTransaction:async fn=>{
   let release;const previous=tail;tail=new Promise(r=>release=r);await previous;
   try{const pending=[];const result=await fn({get:r=>r.get(),set:(r,value)=>pending.push([r.path,value])});for(const [path,value] of pending){data.set(path,value);writes++;}return result;}finally{release();}
 }};
 const firebase={firestore:Object.assign(()=>db,{Timestamp:{fromDate:date=>date},FieldValue:{serverTimestamp:()=>new Date()}})};
 const source=(await read('dist/src/cloud/secure-share-owner.js')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const names=['t','SECURE_SHARE_FORMAT','SECURE_SHARE_TOKEN_PATTERN','newSecureShareToken','sanitizeDocumentForSecureShare','secureShareAllowsDecision','secureShareExpiry','secureShareIsActive','automaticElectronicDocument','electronicDocumentFingerprint'];
 const api=new Function('currentCloudUser','firebase',...names,source+';return {ensureDocumentElectronicCopy};')(()=>({uid}),firebase,...names.map(name=>name==='t'?(en=>en):domain[name]));
 return {api,data,get writes(){return writes;},switchOwner:value=>{uid=value;}};
}

test('normal document QR has stable content identity and excludes internal accounting changes',async()=>{
 const d=document(),id=await domain.electronicDocumentFingerprint(d);
 assert.equal(id.length,64);
 const internal=structuredClone(d);internal.updatedAt=new Date().toISOString();internal.items[0].unitCost='99';internal.internalCosts.shippingCost='500';
 assert.equal(await domain.electronicDocumentFingerprint(internal),id);
 const quantity=structuredClone(d);quantity.items[0].quantity='50';assert.notEqual(await domain.electronicDocumentFingerprint(quantity),id);
 const revision=structuredClone(d);revision.revision=2;assert.notEqual(await domain.electronicDocumentFingerprint(revision),id);
 assert.equal(domain.automaticElectronicDocument(d),true);assert.equal(domain.automaticElectronicDocument(document('invoice')),true);
 assert.equal(domain.automaticElectronicDocument({...d,status:'draft'}),false);
});

test('ordinary issue/export reuses one electronic document and preserves older revisions',async()=>{
 const f=await transport(),d=document(),before=structuredClone(d);
 const [a,b]=await Promise.all([f.api.ensureDocumentElectronicCopy(d),f.api.ensureDocumentElectronicCopy(d)]);
 assert.equal(a.id,b.id);assert.equal(f.writes,2,'one public snapshot and one private reference');assert.deepEqual(d,before);
 assert.equal(a.snapshot.items[0].unitCost,'');assert.equal(a.allowDecision,false,'automatic publication cannot introduce customer approval or conversion');
 assert.ok(new Date(a.expiresAt).getUTCFullYear()>=new Date().getUTCFullYear()+9,'QR does not silently expire after seven days');
 const revision=structuredClone(d);revision.revision=2;revision.items[0].quantity='15';
 const newer=await f.api.ensureDocumentElectronicCopy(revision);assert.notEqual(newer.id,a.id);
 assert.equal(f.data.get('publicShares/'+a.id).snapshot.items[0].quantity,'10');
 assert.equal(newer.snapshot.items[0].quantity,'15');
});

test('automatic output respects QR revocation until an explicit reactivation',async()=>{
 const f=await transport(),d=document(),a=await f.api.ensureDocumentElectronicCopy(d);
 f.data.get('publicShares/'+a.id).revokedAt=new Date();const writes=f.writes;
 await assert.rejects(f.api.ensureDocumentElectronicCopy(d),/disabled or expired/);assert.equal(f.writes,writes);
 const disabled=await f.api.ensureDocumentElectronicCopy(d,{allowInactive:true});assert.equal(disabled.id,a.id);
 const renewed=await f.api.ensureDocumentElectronicCopy(d,{renew:true});assert.notEqual(renewed.id,a.id);
 assert.ok(f.data.get('publicShares/'+a.id).revokedAt,'old revoked QR must remain revoked');
});

test('cancelled scope and account identity cannot publish a stale document',async()=>{
 const f=await transport(),d=document();await assert.rejects(f.api.ensureDocumentElectronicCopy(d,{isCurrent:()=>false}),/changed/);assert.equal(f.writes,0);
 const owner=await f.api.ensureDocumentElectronicCopy(d);f.switchOwner('second-owner');const second=await f.api.ensureDocumentElectronicCopy(d);
 assert.notEqual(second.id,owner.id);assert.equal(second.ownerUid,'second-owner');
});

test('normal PDF/print/share actions automatically attach QR without a share-dialog action',async()=>{
 const source=await read('src/app/App.tsx');
 const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let initializer;function visit(n){if(ts.isPropertyDeclaration(n)&&n.name.getText(ast)==='requestPrint')initializer=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(initializer);
 const code=ts.transpileModule('globalThis.run='+initializer,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const mode of ['pdf','print','share']){
  const d=document();let ensured=0,printed=0;
  const ctx={navigator:{userAgent:'test',platform:'test'},window:{__LOUREX_PREPARE_PDF__:()=>{}},document:{title:'',body:{classList:{add:()=>{}}}},structuredClone,validateDocument:()=>({}),automaticElectronicDocument:domain.automaticElectronicDocument,
   ensureDocumentElectronicCopy:async(target,options)=>{assert.equal(target.id,d.id);assert.equal(options.isCurrent(),true);ensured++;return {id:'x'.repeat(43)};},assertFinancialOutputParity:(a,b)=>assert.equal(a.items[0].quantity,b.items[0].quantity),safeFilename:s=>s,t:en=>en,
   accountEpoch:1,state:{unlocked:true,vault:{documents:[d]}},requireVault:()=>({documents:[d]}),setState:(patch,cb)=>{Object.assign(ctx.state,patch);cb?.();},launchPrint:async()=>{printed++;},showToast:()=>{}};
  vm.runInNewContext(code,ctx);await ctx.run(d,mode);
  assert.equal(ensured,1);assert.equal(printed,1);assert.equal(ctx.state.printShareId,'x'.repeat(43));assert.equal(ctx.state.printDoc.id,d.id);
 }
});

test('issuance connects QR only after protected accounting save and never bypasses approval',async()=>{
 const source=await read('src/app/App.tsx'),ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let initializer;function visit(n){if(ts.isPropertyDeclaration(n)&&n.name.getText(ast)==='saveDocument')initializer=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(initializer);
 const code=ts.transpileModule('globalThis.run='+initializer,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const allowed of [true,false]){
  const d=document(),vault=emptyVault();vault.documents=[{...d,status:'draft'}];let persisted=0,connected=0,gated=0;
  const ctx={Date,automaticElectronicDocument:domain.automaticElectronicDocument,ensureDocumentElectronicCopy:async(doc,options)=>{assert.equal(persisted,1,'QR publication follows accounting save');assert.equal(options.isCurrent(),true);connected++;return {};},salesOrderForQuotation:()=>null,isDeliveryLinkedInvoice:()=>false,
   approvalGate:()=>{gated++;return {allowed,created:false};},assertCustomerCreditLimit:()=>{},assertInvoicePaymentInvariant:()=>{},assertDocumentLifecycleInvariant:()=>{},assertDeliveryInvoiceIntegrity:()=>{},createDocumentEvent:(doc,type)=>({documentId:doc.id,type}),documentUsesCommercialDefaults:()=>true,t:en=>en,
   accountEpoch:1,state:{unlocked:true,vault},requireVault:()=>ctx.state.vault,persist:async next=>{ctx.state.vault=next;persisted++;},setState:patch=>Object.assign(ctx.state,patch),showToast:()=>{}};
  vm.runInNewContext(code,ctx);
  if(allowed){await ctx.run(d);assert.equal(persisted,1);assert.equal(connected,1);assert.equal(ctx.state.vault.documents[0].status,'final');assert.equal(ctx.state.vault.documents[0].items[0].unitPrice,'5.00');}
  else{await assert.rejects(ctx.run(d),/Approval is required/);assert.equal(persisted,0);assert.equal(connected,0);}
  assert.equal(gated,1);
 }
});
