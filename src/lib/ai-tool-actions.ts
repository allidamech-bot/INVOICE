import { assertFoundationApproval, type FoundationApproval } from './ai-foundation-approval.js';
import {applyOperationalPoDraftApproval,type AiOperationalPoReview} from './ai-operational-po-draft.js';
import {applyAiGoodsReceiptApproval,type AiGoodsReceiptReview} from './ai-operational-goods-receipt.js';
import {applyOperationalDeliveryDraftApproval,type AiOperationalDeliveryDraftReview} from './ai-operational-dn-draft.js';
import {applyAiDeliveryConfirmation,type AiDeliveryConfirmationReview} from './ai-operational-delivery-confirmation.js';
import {applyAiSupplierInvoiceMatchApproval,type AiSupplierInvoiceMatchReview} from './ai-operational-supplier-invoice-match.js';
import {applyAiConfirmedDeliveryInvoiceApproval,type AiConfirmedDeliveryInvoiceReview} from './ai-operational-delivery-invoice-draft.js';
import {applyAiStoredQuotationInvoiceApproval,type AiStoredQuotationInvoiceReview} from './ai-stored-quotation-invoice.js';
import {applyAiCustomerCollection,type AiCustomerCollectionReview} from './ai-operational-customer-collection.js';
import {applyAiSupplierSettlement,type AiSupplierSettlementReview} from './ai-operational-supplier-settlement.js';
import {applyAiSupplierPosting,type AiSupplierPostingReview} from './ai-operational-supplier-posting.js';
import {assertMatchedSupplierInvoicePostingIntegrity} from './supplier-invoice-posting.js';
import {linkedDeliveryInvoice} from './sales-delivery-invoice.js';
import {matchedSupplierInvoices} from './supplier-invoice-flow.js';
import {confirmedSalesDeliveries} from './sales-delivery-flow.js';
import {confirmedGoodsReceipts} from './goods-receipt-flow.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { applyAiBulkProductUpdate, type AiBulkProductBatch } from './ai-product-bulk-update.js';
import {applySelectedPartyHighlight,type AiPartyHighlightBatch} from './ai-party-highlights.js';
import {applyAiProductSourceImport,type AiProductSourceImportBatch} from './ai-product-source-import.js';
import {applyAiPartyMaster,type AiPartyMasterBatch} from './ai-party-master.js';
import {applyApprovedPartyPatch,type ApprovedPartyPatch} from './ai-approved-party-patch.js';
import { resumeVaultSession } from '../storage/vault.js';
import { loadAssistantTasks, createAssistantTask, updateAssistantTask, completeAssistantTask, deleteAssistantTask } from '../storage/assistant-task-store.js';
import { loadAssistantMemory, createAssistantMemory, updateAssistantMemory, deleteAssistantMemory, setPersonalMemoryEnabled } from '../storage/assistant-memory-store.js';

export interface GenericToolExecutionProposal{foundationApproval?:FoundationApproval;capability:'tool.execute';tool:'customer.update'|'supplier.update'|'customer.bulkHighlight'|'supplier.bulkHighlight'|'customer.master'|'supplier.master'|'product.bulkUpdate'|'product.importSource'|'procurement.createPoFromRfq'|'procurement.recordGoodsReceipt'|'sales.createDeliveryDraft'|'sales.confirmPhysicalDelivery'|'sales.issueConfirmedStock'|'procurement.matchSupplierBill'|'procurement.postMatchedSupplierBill'|'sales.createConfirmedInvoiceDraft'|'document.createDraft'|'sales.recordCustomerCollection'|'procurement.recordSupplierPayment'|'task.create'|'task.update'|'task.complete'|'task.delete'|'memory.create'|'memory.update'|'memory.delete'|'memory.setEnabled';args:Record<string,unknown>;label:string;rationale:string;}

function clean(value:unknown,max=160):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
async function assertAssistantRecordScope(key:CryptoKey,proposal:GenericToolExecutionProposal):Promise<void>{
  const approval=proposal.foundationApproval;if(!approval)return;
  const id=String(proposal.args.taskId||proposal.args.memoryId||'');if(!id)return;
  const state=proposal.tool.startsWith('task.')?await loadAssistantTasks(key):await loadAssistantMemory(key);
  const rows='tasks'in state?state.tasks:state.records;
  const row=rows.find((r:any)=>r.id===id);
  const scope=approval.scope.scope==='personal'?'personal':'business';
  if(!row||row.scope!==scope||(scope==='business'&&(row.workspaceId!==approval.scope.workspaceId||row.branchId!==approval.scope.branchId)))throw new Error('Task or memory is unavailable in this conversation scope.');
}
export async function applyApprovedToolExecution(proposal:GenericToolExecutionProposal):Promise<{summary:string;id:string;document?:import('../types.js').LourexDocument}>{
  if(proposal.tool==='document.createDraft'){
    if(!proposal.foundationApproval)
      throw new Error('An explicit signed approval is required to convert a saved quotation.');
    const review=proposal.args as unknown as AiStoredQuotationInvoiceReview;
    const saved=await mutateVaultSafely(vault=>{
      assertFoundationApproval(vault,proposal);
      return applyAiStoredQuotationInvoiceApproval(vault,review).vault;
    });
    const invoices=saved.documents.filter(row=>row.kind==='invoice'&&row.status==='draft'&&
      row.convertedFromId===review.sourceId&&row.number===review.expectedInvoiceNumber&&
      row.customerSnapshot?.sourceCustomerId===review.customerId&&
      row.items.length===review.lineCount);
    if(invoices.length!==1)
      throw new Error('The approved linked invoice draft could not be verified after saving.');
    return{summary:'Invoice DRAFT '+invoices[0]!.number+' saved from issued quotation '+
      review.sourceNumber+' with the exact source rows and terms. Not issued. No stock, payment or posting.',
      id:invoices[0]!.id,document:invoices[0]!};
  }

  if(proposal.tool==='procurement.recordSupplierPayment'){
    if(!proposal.foundationApproval)
      throw new Error('A separately signed finance approval is required before recording supplier payment.');
    const review=proposal.args as unknown as AiSupplierSettlementReview;
    const saved=await mutateVaultSafely(vault=>{
      assertFoundationApproval(vault,proposal);
      return applyAiSupplierSettlement(vault,review).vault;
    });
    const exact=saved.supplierPayments.filter(p=>p.purchaseId===review.purchaseId&&
      p.supplierId===review.supplierId&&p.reference.toUpperCase()===review.reference&&
      p.amount===review.amount&&p.currency===review.currency&&p.date===review.date&&
      p.method===review.method&&!p.voidedAt);
    if(exact.length!==1)throw new Error('The exact approved supplier payment could not be verified.');
    return{summary:'Supplier payment '+exact[0]!.amount+' '+review.currency+
      ' recorded on posted purchase '+review.purchaseNumber+
      ' after signed financial approval. Remaining payable: '+review.afterRemaining+
      '. No inventory or supplier invoice changed.',id:exact[0]!.id};
  }
  if(proposal.tool==='sales.recordCustomerCollection'){
    if(!proposal.foundationApproval)throw new Error('An independent signed customer collection approval is required.');
    const review=proposal.args as unknown as AiCustomerCollectionReview;
    const saved=await mutateVaultSafely(vault=>{
      assertFoundationApproval(vault,proposal);
      return applyAiCustomerCollection(vault,review).vault;
    });
    const payments=saved.payments.filter(p=>p.invoiceId===review.invoiceId&&
      p.reference.toUpperCase()===review.reference&&p.amount===review.amount&&
      p.currency===review.currency&&p.date===review.date&&p.method===review.method);
    if(payments.length!==1)throw new Error('The exact approved collection could not be verified.');
    return{summary:'Customer payment '+payments[0]!.amount+' '+review.currency+
      ' recorded on issued invoice '+review.invoiceNumber+' after signed approval. Remaining: '+
      review.afterRemaining+'. No delivery or inventory change.',id:payments[0]!.id};
  }
  if(proposal.tool==='sales.createConfirmedInvoiceDraft'){
    if(!proposal.foundationApproval)throw new Error('A signed invoice DRAFT approval is required before saving.');
    const review=proposal.args as unknown as AiConfirmedDeliveryInvoiceReview;
    const saved=await mutateVaultSafely(vault=>{
      assertFoundationApproval(vault,proposal);
      return applyAiConfirmedDeliveryInvoiceApproval(vault,review).vault;
    });
    const invoice=linkedDeliveryInvoice(review.deliveryNoteId,saved.documents,saved.documentEvents);
    if(!invoice||invoice.kind!=='invoice'||invoice.status!=='draft'||
       invoice.number!==review.expectedInvoiceNumber||
       invoice.items.length!==review.lineCount||
       invoice.customerSnapshot?.sourceCustomerId!==review.customerId)
      throw new Error('Approved draft invoice cannot be verified in the saved ledger.');
    return{summary:'Invoice DRAFT '+invoice.number+' saved from confirmed delivery '+
      review.deliveryNoteNumber+' after explicit approval. Not issued. No stock or collection posted.',id:invoice.id};
  }
  if(proposal.tool==='procurement.matchSupplierBill'){
    if(!proposal.foundationApproval)throw new Error('A signed vendor bill three-way matching approval is required.');
    const review=proposal.args as unknown as AiSupplierInvoiceMatchReview;
    const saved=await mutateVaultSafely(vault=>{
      assertFoundationApproval(vault,proposal);
      return applyAiSupplierInvoiceMatchApproval(vault,review).vault;
    });
    const recorded=matchedSupplierInvoices(review.purchaseOrderId,saved.documentEvents)
      .filter(x=>x.purchaseOrderNumber===review.purchaseOrderNumber&&
        x.invoiceReference===review.invoiceReference&&x.supplierId===review.supplierId);
    if(recorded.length!==1)throw new Error('Matched supplier invoice cannot be verified.');
    return{summary:'Vendor bill '+review.invoiceReference+' matched to confirmed receiving after signed approval. No payable, stock or payment posted.',
      id:review.purchaseOrderId};
  }
  if(proposal.tool==='procurement.postMatchedSupplierBill'){
    if(!proposal.foundationApproval)
      throw new Error('Independent signed owner/admin approval is required before posting vendor bill stock and payable.');
    const review=proposal.args as unknown as AiSupplierPostingReview;
    const saved=await mutateVaultSafely(vault=>{
      assertFoundationApproval(vault,proposal);
      return applyAiSupplierPosting(vault,review).vault;
    });
    assertMatchedSupplierInvoicePostingIntegrity(saved);
    const purchases=saved.purchases.filter(p=>p.sourceSupplierInvoiceEventId===review.matchEventId&&
      p.sourcePurchaseOrderId===review.purchaseOrderId&&p.status==='posted'&&
      p.currency===review.currency&&p.items.length===review.lineCount);
    if(purchases.length===1){
      const purchase=purchases[0]!;
      if(saved.inventoryMovements.filter(m=>m.type==='purchase'&&m.sourceId===purchase.id).length!==review.lineCount)
        throw new Error('Purchase posted without full inventory movements. Stop and reconcile ledger.');
      return{summary:'Matched vendor bill '+review.invoiceReference+' POSTED once as purchase '+
        purchase.number+'. Accounts payable +'+review.total+' '+review.currency+
        ', primary warehouse inventory +'+review.lineCount+' movements. No supplier payment made.',
        id:purchase.id};
    }
    if(purchases.length>1)throw new Error('Duplicate supplier bill postings found. Stop and reconcile.');
    const pending=saved.approvalRequests.filter(a=>a.action==='post-purchase'&&
      a.entityId==='purchase-from-'+review.matchEventId&&a.status==='pending');
    if(pending.length!==1)throw new Error('Neither a verified vendor bill posting nor one pending legacy approval was found.');
    return{summary:'Supplier bill '+review.invoiceReference+
      ' is NOT POSTED. Existing purchase approval policy requires an additional approval. No stock, payable or cash was posted.',
      id:pending[0]!.id};
  }
  if(proposal.tool==='sales.issueConfirmedStock'){
    // Reject even previously prepared approvals so older AI sessions cannot debit from a DN.
    throw new Error('Separate Delivery Note stock deduction is retired. Issue a final sales invoice or use an evidenced manual stock movement.');
  }
  if(proposal.tool==='sales.confirmPhysicalDelivery'){
    if(!proposal.foundationApproval)throw new Error('Signed approval of exact physical delivery proof is required.');
    const review=proposal.args as unknown as AiDeliveryConfirmationReview;
    const saved=await mutateVaultSafely(vault=>{
      assertFoundationApproval(vault,proposal);
      return applyAiDeliveryConfirmation(vault,review).vault;
    });
    const confirmations=confirmedSalesDeliveries(review.deliveryNoteId,saved.documentEvents);
    if(confirmations.length!==1||confirmations[0]!.reference!==review.reference)
      throw new Error('Approved delivery confirmation proof was not verified.');
    return{summary:'Physical delivery '+review.reference+' confirmed after explicit approval. No stock was deducted or invoice issued.',
      id:review.deliveryNoteId};
  }
  if(proposal.tool==='sales.createDeliveryDraft'){
    if(!proposal.foundationApproval)throw new Error('Signed delivery-draft approval is required.');
    const review=proposal.args as unknown as AiOperationalDeliveryDraftReview;
    const saved=await mutateVaultSafely(vault=>{
      assertFoundationApproval(vault,proposal);
      return applyOperationalDeliveryDraftApproval(vault,review).vault;
    });
    const note=saved.documents.find(d=>d.kind==='delivery-note'&&d.lifecycleStatus!=='voided'&&d.status==='draft'&&
      saved.documentEvents.some(e=>e.type==='created'&&e.documentId===d.id&&e.relatedDocumentId===review.quotationId));
    if(!note)throw new Error('Approved delivery draft could not be verified.');
    return{summary:'Delivery Note draft '+note.number+' saved after explicit approval. No delivery confirmation or stock issue was recorded.',
       id:note.id};
  }
  if(proposal.tool==='procurement.recordGoodsReceipt'){
    if(!proposal.foundationApproval)throw new Error('A signed physical goods receipt approval is required.');
    const review=proposal.args as unknown as AiGoodsReceiptReview;
    const saved=await mutateVaultSafely(vault=>{
      assertFoundationApproval(vault,proposal);
      return applyAiGoodsReceiptApproval(vault,review).vault;
    });
    const recorded=confirmedGoodsReceipts(review.purchaseOrderId,saved.documentEvents)
      .some(row=>row.purchaseOrderNumber===review.purchaseOrderNumber&&
        row.purchaseOrderUpdatedAt===review.expectedPurchaseOrderUpdatedAt&&
        row.reference===review.reference&&row.receivedDate===review.receivedDate&&
        row.supplierId===review.supplierId);
    if(!recorded)throw new Error('Approved receipt record was not verified. Check the purchase-order receipt register.');
    return{summary:'Goods receipt '+review.reference+' recorded after explicit approval. No inventory was posted or supplier payable created.',
      id:review.purchaseOrderId};
  }
  if(proposal.tool==='procurement.createPoFromRfq'){
    if(!proposal.foundationApproval)throw new Error('An explicit signed purchase-order approval is required before saving any draft.');
    const review=proposal.args as unknown as AiOperationalPoReview;
    const saved=await mutateVaultSafely(vault=>{
      assertFoundationApproval(vault,proposal);
      return applyOperationalPoDraftApproval(vault,review).vault;
    });
    const order=saved.documents.find(row=>row.kind==='purchase-order'&&row.lifecycleStatus!=='voided'&&
      saved.documentEvents.some(event=>event.type==='created'&&event.documentId===row.id&&event.relatedDocumentId===review.sourceId));
    if(!order)throw new Error('Approved PO draft save could not be verified.');
    return{summary:'Linked PO draft '+order.number+' saved after explicit approval. Goods have NOT been received; no stock or supplier payable was posted.',id:order.id};
  }
  if(proposal.tool==='customer.master'||proposal.tool==='supplier.master'){
    const batch=proposal.args as unknown as AiPartyMasterBatch;
    if(!batch||batch.party!==(proposal.tool==='customer.master'?'customer':'supplier'))throw new Error('Approved party action type mismatch.');
    const next=await mutateVaultSafely(vault=>{assertFoundationApproval(vault,proposal);return applyAiPartyMaster(vault,batch);});
    const saved=(batch.party==='customer'?next.customers:next.suppliers).find(record=>record.id===batch.recordId);
    if(!saved)throw new Error('Approved party save could not be verified.');
    return{summary:batch.party+' '+(batch.mode==='create'?'created':'updated')+' after explicit approval.',id:batch.recordId};
  }
  if(proposal.tool==='product.importSource'){
    const batch=proposal.args as unknown as AiProductSourceImportBatch;
    const next=await mutateVaultSafely(vault=>{assertFoundationApproval(vault,proposal);return applyAiProductSourceImport(vault,batch);});
    if(batch.rows.some(row=>!next.savedItems.some(item=>item.id===row.item.id)))throw new Error('Approved imported products could not be verified. Review the catalog.');
    return{summary:String(batch.rows.length)+' extracted products registered after explicit approval.',id:'imported-products-'+batch.rows.length};
  }
  if(proposal.tool==='product.bulkUpdate'){
    const batch=proposal.args as unknown as AiBulkProductBatch;
    const next=await mutateVaultSafely(vault=>{assertFoundationApproval(vault,proposal);return applyAiBulkProductUpdate(vault,batch);});
    if(batch.rows.some(row=>!next.savedItems.some(item=>item.id===row.itemId&&item.updatedAt!==row.beforeUpdatedAt)))throw new Error('Bulk product save could not be verified. Review your catalog before retrying.');
    return{summary:String(batch.rows.length)+' product records updated after explicit approval.',id:'bulk-products-'+batch.rows.length};
  }
  if(proposal.tool==='customer.bulkHighlight'||proposal.tool==='supplier.bulkHighlight'){
    if(!proposal.foundationApproval)throw new Error('Exact signed review required before marking records.');
    const batch=proposal.args as unknown as AiPartyHighlightBatch;
    if(!batch||batch.party!==(proposal.tool==='customer.bulkHighlight'?'customer':'supplier'))
      throw new Error('Approved customer/supplier mark type changed.');
    const next=await mutateVaultSafely(vault=>{
      assertFoundationApproval(vault,proposal);
      return applySelectedPartyHighlight(vault,batch);
    });
    const records=batch.party==='customer'?next.customers:next.suppliers;
    if(batch.rows.some(row=>!records.some(record=>record.id===row.id&&
      record.highlightColor==='red'&&record.updatedAt!==row.updatedAt)))
      throw new Error('Approved marks could not be confirmed in saved master data.');
    return{summary:String(batch.rows.length)+' exact '+batch.party+' records marked red after explicit approval.',
      id:'marked-'+batch.party+'-'+batch.rows.length};
  }
  if(proposal.tool==='customer.update'||proposal.tool==='supplier.update'){
    const batch=proposal.args as unknown as ApprovedPartyPatch;
    const expectedParty=proposal.tool==='customer.update'?'customer':'supplier';
    if(!batch||batch.party!==expectedParty)throw new Error('Approved customer/supplier action type mismatch.');
    const next=await mutateVaultSafely(vault=>{assertFoundationApproval(vault,proposal);return applyApprovedPartyPatch(vault,batch);});
    const rows=expectedParty==='customer'?next.customers:next.suppliers;
    if(!rows.some(row=>row.id===batch.recordId))throw new Error('Approved customer/supplier save could not be verified.');
    return{summary:(expectedParty==='customer'?'Customer':'Supplier')+' updated after explicit approval.',id:batch.recordId};
  }
  if(proposal.tool==='task.create'){
    const resumed=await resumeVaultSession();if(!resumed)throw new Error('Unlock LOUREX before creating an assistant task.');assertFoundationApproval(resumed.vault,proposal);await assertAssistantRecordScope(resumed.key,proposal);
    const scope=proposal.args.scope==='personal'?'personal':'business';const title=clean(proposal.args.title,180);if(!title)throw new Error('Task title is required.');
    const task=await createAssistantTask(resumed.key,{scope,workspaceId:scope==='business'?resumed.vault.appSettings.activeWorkspaceId:'',branchId:scope==='business'?resumed.vault.appSettings.activeBranchId:'',title,notes:clean(proposal.args.notes,1000),dueAt:clean(proposal.args.dueAt,48),recurrence:['daily','weekly','monthly'].includes(String(proposal.args.recurrence))?proposal.args.recurrence as any:'none',conditionType:['document-not-converted','customer-unpaid','stock-below'].includes(String(proposal.args.conditionType))?proposal.args.conditionType as any:'none',conditionValue:clean(proposal.args.conditionValue,160),timezone:clean(proposal.args.timezone,80),relatedEntityType:scope==='business'?clean(proposal.args.relatedEntityType,40):'',relatedEntityId:scope==='business'?clean(proposal.args.relatedEntityId,120):'',sourceThreadId:clean(proposal.args.sourceThreadId,120),sourceMessageId:clean(proposal.args.sourceMessageId,120)});return{summary:'Assistant task created after approval.',id:task.id};
  }
  if(['task.update','task.complete','task.delete'].includes(proposal.tool)){
    const resumed=await resumeVaultSession();if(!resumed)throw new Error('Unlock LOUREX before changing an assistant task.');assertFoundationApproval(resumed.vault,proposal);await assertAssistantRecordScope(resumed.key,proposal);const taskId=clean(proposal.args.taskId,120);if(!taskId)throw new Error('Task ID is required.');
    if(proposal.tool==='task.complete'){const row=await completeAssistantTask(resumed.key,taskId);return{summary:row.status==='done'?'Assistant task completed after approval.':'Recurring assistant task advanced to its next due date after approval.',id:row.id};}
    if(proposal.tool==='task.delete'){await deleteAssistantTask(resumed.key,taskId);return{summary:'Assistant task deleted after approval.',id:taskId};}
    const row=await updateAssistantTask(resumed.key,taskId,{title:'title'in proposal.args?clean(proposal.args.title,180):undefined,notes:'notes'in proposal.args?clean(proposal.args.notes,1000):undefined,dueAt:'dueAt'in proposal.args?clean(proposal.args.dueAt,48):undefined,recurrence:'recurrence'in proposal.args&&['none','daily','weekly','monthly'].includes(String(proposal.args.recurrence))?proposal.args.recurrence as any:undefined,conditionType:'conditionType'in proposal.args&&['none','document-not-converted','customer-unpaid','stock-below'].includes(String(proposal.args.conditionType))?proposal.args.conditionType as any:undefined,conditionValue:'conditionValue'in proposal.args?clean(proposal.args.conditionValue,160):undefined,timezone:'timezone'in proposal.args?clean(proposal.args.timezone,80):undefined});return{summary:'Assistant task updated after approval.',id:row.id};
  }
  if(['memory.create','memory.update','memory.delete','memory.setEnabled'].includes(proposal.tool)){
    const resumed=await resumeVaultSession();if(!resumed)throw new Error('Unlock LOUREX before changing assistant memory.');assertFoundationApproval(resumed.vault,proposal);await assertAssistantRecordScope(resumed.key,proposal);
    if(proposal.tool==='memory.setEnabled'){const enabled=proposal.args.enabled===true;await setPersonalMemoryEnabled(resumed.key,enabled);return{summary:enabled?'Personal assistant memory enabled after approval.':'Personal assistant memory disabled after approval.',id:'personal-memory-setting'};}
    if(proposal.tool==='memory.delete'){const memoryId=clean(proposal.args.memoryId,120);if(!memoryId)throw new Error('Memory ID is required.');await deleteAssistantMemory(resumed.key,memoryId);return{summary:'Assistant memory deleted after approval.',id:memoryId};}
    if(proposal.tool==='memory.update'){const memoryId=clean(proposal.args.memoryId,120);if(!memoryId)throw new Error('Memory ID is required.');const row=await updateAssistantMemory(resumed.key,memoryId,{content:'content'in proposal.args?clean(proposal.args.content,700):undefined,kind:['preference','fact','note','goal'].includes(String(proposal.args.kind))?proposal.args.kind as any:undefined,expiresAt:'expiresAt'in proposal.args?clean(proposal.args.expiresAt,48):undefined,active:'active'in proposal.args?proposal.args.active!==false:undefined,confirm:proposal.args.confirm===true});return{summary:'Assistant memory updated after approval.',id:row.id};}
    const scope=proposal.args.scope==='business'?'business':'personal';const content=clean(proposal.args.content,700);if(!content)throw new Error('Memory content is required.');const row=await createAssistantMemory(resumed.key,{scope,workspaceId:scope==='business'?resumed.vault.appSettings.activeWorkspaceId:'',branchId:scope==='business'?resumed.vault.appSettings.activeBranchId:'',kind:['preference','fact','note','goal'].includes(String(proposal.args.kind))?proposal.args.kind as any:'note',content,source:'user-approved',sourceThreadId:clean(proposal.args.sourceThreadId,120),expiresAt:clean(proposal.args.expiresAt,48)});return{summary:'Assistant memory stored after approval.',id:row.id};
  }
  throw new Error('Unsupported approved tool action.');
}
