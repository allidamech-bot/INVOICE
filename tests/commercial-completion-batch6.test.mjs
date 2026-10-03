import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument,convertToInvoice,validateDocument} from '../dist/src/lib/documents.js';
import {createLinkedDeliveryDraft,linkedDeliveries,deliverySource} from '../dist/src/lib/delivery-flow.js';
import {calculateTotals} from '../dist/src/lib/money.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {createSupplierPayment,normalizeSupplierPayment,purchasePayableSummary} from '../dist/src/lib/payables.js';
import {scopeVault,applyWorkspaceScope,overlayWorkspaceScope,createWorkspace,activateWorkspace} from '../dist/src/lib/workspaces.js';
import {encryptVault,decryptVault} from '../dist/src/crypto/crypto.js';
function sourceVault(){const vault=emptyVault(),quote=createBlankDocument('proforma','QUO-TEST',vault.company);quote.status='final';quote.customerSnapshot={sourceCustomerId:'c1',companyNameEn:'Northstar',companyNameAr:'نورث',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};quote.items=[{...quote.items[0],descriptionEn:'Valve',descriptionAr:'صمام',quantity:'3',unitPrice:'12.50',unitCost:'8'}];quote.terms.finalDestination='Dubai';vault.documents=[quote];return vault;}

test('issued quotation → reviewed non-financial delivery → invoice → collection preserves source money',()=>{
 const vault=sourceVault(),original=structuredClone(vault.documents[0]);const result=createLinkedDeliveryDraft(vault,original.id),delivery=result.document;
 assert.equal(delivery.kind,'delivery-note');assert.equal(delivery.status,'draft');assert.equal(delivery.convertedFromId,'');assert.equal(delivery.items[0].quantity,'3');assert.equal(delivery.items[0].unitPrice,'');assert.equal(delivery.items[0].unitCost,'');assert.equal(delivery.terms.finalDestination,'Dubai');assert.deepEqual(validateDocument(delivery),{});
 assert.equal(delivery.appearance.showBank,false);assert.equal(delivery.adjustments.taxEnabled,false);assert.equal(deliverySource(delivery,result.vault.documents,result.vault.documentEvents).id,original.id);
 assert.deepEqual(vault.documents[0],original);for(const key of ['payments','inventoryMovements','purchases','supplierPayments'])assert.deepEqual(result.vault[key],vault[key]);
 const invoice={...convertToInvoice(original,'INV-TEST'),status:'final'};const documents=[...result.vault.documents,invoice];const payment=normalizePaymentRecord(invoice,[],{id:'p1',amount:'37.50',date:invoice.issueDate,method:'bank-transfer',reference:'',notes:''},documents);
 assert.equal(calculateTotals(invoice.items,invoice.adjustments).grandTotal,'37.50');assert.equal(invoicePaymentSummary(invoice,[payment],undefined,documents).remaining,'0.00');assert.equal(linkedDeliveries(invoice,documents,result.vault.documentEvents)[0].id,delivery.id);
 const again=createLinkedDeliveryDraft({...result.vault,documents},invoice.id);assert.equal(again.created,false);assert.equal(again.document.id,delivery.id);
});

test('duplicate request/encrypted reload reopens one linked draft; explicit void permits replacement',async()=>{
 const vault=sourceVault(),source=vault.documents[0],first=createLinkedDeliveryDraft(vault,source.id);
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const restored=await decryptVault(key,await encryptVault(key,first.vault));
 const second=createLinkedDeliveryDraft(restored,source.id);assert.equal(second.created,false);assert.equal(second.document.id,first.document.id);assert.equal(second.vault.documents.length,2);
 second.document.status='final';second.document.lifecycleStatus='voided';second.document.voidReason='Incorrect delivery';
 const replacement=createLinkedDeliveryDraft(second.vault,source.id);assert.equal(replacement.created,true);assert.notEqual(replacement.document.number,first.document.number);assert.equal(replacement.vault.documents.length,3);assert.equal(replacement.vault.documentEvents.filter(event=>event.type==='created').length,2);
});

test('missing, draft, void, credit and invalid sources never create an executable delivery',()=>{
 for(const change of [{status:'draft'},{lifecycleStatus:'voided'},{role:'credit-note'},{kind:'purchase-order'},{items:[]}]){const vault=sourceVault();Object.assign(vault.documents[0],change);assert.throws(()=>createLinkedDeliveryDraft(vault,vault.documents[0].id));assert.equal(vault.documents.length,1);assert.equal(vault.documentEvents.length,0);}
 assert.throws(()=>createLinkedDeliveryDraft(sourceVault(),'missing'));
});

test('scoped delivery mutation preserves another workspace and cannot use its hidden source',()=>{
 let full=sourceVault();const original=structuredClone(full.documents[0]);full=createWorkspace(full,'Other company');full=activateWorkspace(full,full.workspaces.at(-1).id);
 const other=scopeVault(full);assert.throws(()=>createLinkedDeliveryDraft(other,original.id));
 full.appSettings.activeWorkspaceId='default';full.appSettings.activeBranchId='main';const scoped=scopeVault(full),result=createLinkedDeliveryDraft(scoped,original.id);
 const saved=overlayWorkspaceScope(full,applyWorkspaceScope(scoped,result.vault));assert.equal(saved.workspaces.length,2);assert.deepEqual(saved.documents.find(doc=>doc.id===original.id),{...original,workspaceId:'default',branchId:'main'});assert.equal(saved.documents.find(doc=>doc.id===result.document.id).workspaceId,'default');
});

test('existing purchase → landed inventory movement → supplier payment remains deterministic and currency safe',()=>{
 const supplier={...createSupplier(),nameEn:'Source Co'},item={id:'p1',sku:'V-1',descriptionEn:'Valve',descriptionAr:'صمام',unit:'PCS',lastUnitCost:'8',lastCostCurrency:'USD'};
 const purchase=createPurchase([],[supplier],'USD');purchase.items=[{...createPurchaseItem(item),quantity:'3',unitCost:'8'}];purchase.freight='6';
 const posted=postPurchase(purchase,[item]);assert.equal(posted.purchase.status,'posted');assert.equal(posted.savedItems[0].lastUnitCost,'10.0000');assert.equal(posted.movements[0].sourceId,purchase.id);assert.equal(posted.movements[0].quantity,'3');
 assert.throws(()=>postPurchase(purchase,[item],posted.movements),/already/);
 const payment=normalizeSupplierPayment(posted.purchase,supplier,[],createSupplierPayment(posted.purchase,supplier,[]));assert.equal(payment.amount,'30.00');assert.equal(purchasePayableSummary(posted.purchase,[payment]).remaining,'0.00');assert.throws(()=>normalizeSupplierPayment(posted.purchase,supplier,[],{...payment,currency:'EUR'}),/currency/);
});

test('actual App action serializes a quotation/invoice race and refuses a queued workspace switch',async()=>{
 globalThis.React={createElement:()=>({}),Component:class{setState(patch){this.state={...this.state,...patch};}}};
 const {App}=await import('../dist/src/app/App.js');
 const app=new App({}),vault=sourceVault(),quote=vault.documents[0],invoice={...convertToInvoice(quote,'INV-RACE'),status:'final'};vault.documents.push(invoice);
 app.state={...app.state,unlocked:true,key:{},vault};app.showToast=()=>{};
 let tail=Promise.resolve(vault);app.persistFullMutation=mutation=>{tail=tail.then(latest=>{const next=mutation(latest);app.state.vault=next;return next;});return tail;};
 await Promise.all([app.createDelivery(quote),app.createDelivery(invoice)]);assert.equal(app.state.vault.documents.filter(doc=>doc.kind==='delivery-note').length,1);assert.equal(app.state.editorDoc.kind,'delivery-note');
 const switched=createWorkspace(vault,'Another company');const other=activateWorkspace(switched,switched.workspaces.at(-1).id);app.state.vault=vault;let message='';app.showToast=value=>message=value;app.persistFullMutation=async mutation=>{mutation(other);};
 await app.createDelivery(quote);assert.match(message,/Workspace changed/);assert.equal(other.documents.filter(doc=>doc.kind==='delivery-note').length,0);
});
