import type {LourexDocument, VaultPayload, DocumentItem} from '../types.js';
import type {ConversationKernel} from './ai-conversation-kernel.js';
import {workspaceDocument} from './ai-workspace-model.js';
import {createBlankDocument,alignAiQuotationValidity} from './documents.js';
import {customerSnapshotFrom} from './defaults.js';
import {scopeVault} from './workspaces.js';
import {normalizeAiConversationMode} from './ai-conversation-mode.js';

/** Build an A4 rendering input entirely in memory: NEVER reserve a document
 * number, save a vault record, issue an invoice, or mutate the proposal. */
export function prepareAiPdfPreview(
  kernel:ConversationKernel,vault:VaultPayload,language:'ar'|'en',savedId=''
):LourexDocument{
  if(kernel.scope.scope!=='business'||normalizeAiConversationMode(kernel.mode)!=='controller')throw new Error('Only Controller business documents can be exported.');
  const scoped=scopeVault(vault);
  if(kernel.scope.workspaceId!==scoped.appSettings.activeWorkspaceId||
     kernel.scope.branchId!==scoped.appSettings.activeBranchId)throw new Error('The company or branch changed. Reopen the document.');
  if(savedId){
    const existing=scoped.documents.find(row=>row.id===savedId);
    if(!existing)throw new Error('The saved document no longer exists in the current branch.');
    return structuredClone(existing);
  }
  const proposal=kernel.artifact?.proposal;
  if(!proposal)throw new Error('Prepare a working document before requesting its PDF.');
  const review=workspaceDocument(kernel,scoped,language);
  if(!review||review.status!=='draft')throw new Error('The working document is unavailable.');
  if(review.blockers.length||review.subtotal===null||!review.rows.length)
    throw new Error('Complete all required document fields, quantities and prices before exporting PDF.');
  let document:LourexDocument;
  if(proposal.capability==='document.updateDraft'){
    const saved=scoped.documents.find(row=>row.id===proposal.documentId);
    if(!saved||saved.status!=='draft'||saved.lifecycleStatus==='voided')throw new Error('Only an existing editable draft can be previewed with changes.');
    document=structuredClone(saved);
    document.language=proposal.language||document.language;
    document.terms={...document.terms,...proposal.termsPatch};
    if(proposal.termsPatch.validity!==undefined)alignAiQuotationValidity(document);
    document.notes=proposal.notes??document.notes;
  }else{
    // PREVIEW is deliberately not a numbered invoice or saved customer.
    document=createBlankDocument(proposal.kind,'UNSAVED-PREVIEW',scoped.company);
    document.currency=proposal.currency;
    document.language=proposal.language;
    const customer=scoped.customers.find(row=>row.id===proposal.customerId);
    if(proposal.customerId&&!customer)throw new Error('The selected customer is no longer available.');
    if(customer)document.customerSnapshot=customerSnapshotFrom(customer);
    else if(proposal.customerDraft)document.customerSnapshot=customerSnapshotFrom({id:'',...proposal.customerDraft});
    document.terms={...document.terms,incoterm:proposal.incoterm,paymentTerms:proposal.paymentTerms,
      deliveryTime:proposal.deliveryTime,validity:proposal.validity,remarks:proposal.remarks};
    alignAiQuotationValidity(document);
    document.notes=proposal.notes;
    // The conversation has not authorized taxes, freight or discounts; never
    // silently present company tax defaults as if they were confirmed.
    document.adjustments={...document.adjustments,taxEnabled:false,shippingEnabled:false,
      otherChargesEnabled:false,discountEnabled:false};
  }
  document.items=review.rows.map(row=>{
    const existing=document.items.find(item=>item.id===row.id);
    const stock=scoped.savedItems.find(item=>item.id===row.savedItemId);
    const item:DocumentItem={
      id:row.id,descriptionEn:row.descriptionEn||stock?.descriptionEn||'',
      descriptionAr:row.descriptionAr||stock?.descriptionAr||'',
      quantity:row.quantity,unit:row.unit,unitPrice:row.unitPrice,
      hsCode:existing?.hsCode||stock?.hsCode||'',origin:existing?.origin||stock?.origin||'',
      packing:row.packing!==undefined?row.packing:(existing?.packing||stock?.packing||''),unitCost:existing?.unitCost||''
    };
    return item;
  });
  // A user-reviewed line-specific packing description must be visible in the
  // exact A4 preview; new blank documents otherwise hide this optional column.
  // Do not alter the configured appearance for untouched or saved documents.
  const explicitlyPacked=proposal.capability==='document.createDraft'
    ?proposal.items.some(row=>Boolean(row.packing?.trim()))
    :proposal.addItems.some(row=>Boolean(row.packing?.trim()))||proposal.itemEdits.some(edit=>Boolean(edit.packing?.trim()));
  if(explicitlyPacked)document.appearance={...document.appearance,showPacking:true};
  document.status='draft';
  // Explicit watermark distinguishes non-authoritative output from an issued
  // invoice, including when the working proposal came from an existing invoice.
  document.appearance={...document.appearance,watermark:{...document.appearance.watermark,enabled:true,type:'text',text:'DRAFT',pattern:'single'}};
  return document;
}

/** AI-only actual-file viewer. Reuse the vendored PDF.js that the application
 * already installs; loading is on demand after explicit PDF preview intent.
 * This helper keeps module-relative URLs out of the legacy CJS-tested chat UI. */
export async function loadGeneratedAiPdfRenderer():Promise<any>{
  const url=new URL('../../vendor/pdf.mjs',import.meta.url).href;
  const pdfjs=await import(url);
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('../../vendor/pdf.worker.mjs',import.meta.url).href;
  return pdfjs;
}
