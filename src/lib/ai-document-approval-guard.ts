import type {VaultPayload} from '../types.js';
import {aiProductArchived} from './ai-business.js';

interface LineInput{savedItemId?:string;descriptionEn?:string;descriptionAr?:string;quantity?:string;unitPrice?:string;}
interface DraftApproval{customerId?:string;customerDraft?:{companyNameEn?:string;companyNameAr?:string;email?:string}|null;currency:string;items:LineInput[];}
interface UpdateApproval{documentId:string;addItems:LineInput[];itemEdits:Array<{itemId:string;quantity?:string;unitPrice?:string}>;}
function scoped(row:{workspaceId?:string},active:string):boolean{return (row.workspaceId||'default')===active;}
function validDecimal(value:unknown,positive:boolean):boolean{
  const raw=String(value??'').trim();
  if(!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(raw))return false;
  const num=Number(raw);
  return Number.isFinite(num)&&(!positive||num>0);
}
function validateLine(vault:VaultPayload,line:LineInput,currency:string,scope:string):void{
  if(!line||typeof line!=='object'||Array.isArray(line))throw new Error('Invalid commercial document line.');
  if(!validDecimal(line.quantity,true))throw new Error('Every document line requires a valid positive quantity.');
  const id=String(line.savedItemId||'').trim();
  if(id){
    const product=vault.savedItems.find(item=>item.id===id);
    if(!product||!scoped(product,scope)||aiProductArchived(product))throw new Error('Referenced product is unavailable in the active company.');
    const price=String(line.unitPrice||'').trim();
    if(price){
      if(!validDecimal(price,false))throw new Error('Document line contains an invalid selling price.');
    }else if(product.lastCurrency!==currency||!validDecimal(product.lastUnitPrice,false)){
      throw new Error('Product price or currency changed. Specify an exact selling price and review again.');
    }
  }else{
    if(!String(line.descriptionEn||line.descriptionAr||'').trim())throw new Error('Uncatalogued document line needs an explicit description.');
    if(!validDecimal(line.unitPrice,false))throw new Error('Uncatalogued document line needs an explicit selling price.');
  }
}
/** Run *inside* the one vault mutation, against the freshest company/products. */
export function assertAiDocumentCreateApproval(vault:VaultPayload,proposal:DraftApproval):void{
  const active=vault.appSettings.activeWorkspaceId||'default';
  if(!proposal||!/^[A-Z]{3}$/.test(String(proposal.currency||''))||!Array.isArray(proposal.items)||!proposal.items.length||proposal.items.length>20)
    throw new Error('Invalid reviewed document currency or item count.');
  if(proposal.customerId){
    const customer=vault.customers.find(row=>row.id===proposal.customerId);
    if(!customer||!scoped(customer,active))throw new Error('Selected document customer does not belong to the active company.');
  }
  if(proposal.customerDraft){
    const draft=proposal.customerDraft;
    if(!String(draft.companyNameEn||draft.companyNameAr||'').trim())throw new Error('New customer identity is missing.');
    const names=[draft.companyNameEn,draft.companyNameAr].filter(Boolean).map(n=>String(n).trim().toLowerCase());
    const email=String(draft.email||'').trim().toLowerCase();
    if(vault.customers.some(row=>scoped(row,active)&&(names.includes(row.companyNameEn.toLowerCase())||names.includes(row.companyNameAr.toLowerCase())||(email&&row.email.toLowerCase()===email))))
      throw new Error('Customer already exists. Link the exact registered customer rather than duplicating it.');
  }
  for(const line of proposal.items)validateLine(vault,line,proposal.currency,active);
}
/** Prevent silent cross-company, missing-item or invalid money edits. */
export function assertAiDocumentUpdateApproval(vault:VaultPayload,proposal:UpdateApproval):void{
  const active=vault.appSettings.activeWorkspaceId||'default';
  if(!proposal||!proposal.documentId)throw new Error('Missing target document.');
  const document=vault.documents.find(row=>row.id===proposal.documentId);
  if(!document||!scoped(document,active))throw new Error('Document is unavailable in the current company.');
  if(document.status!=='draft'||document.lifecycleStatus==='voided')throw new Error('Only active drafts can be changed by AI.');
  if(!Array.isArray(proposal.addItems)||!Array.isArray(proposal.itemEdits)||proposal.addItems.length>20||proposal.itemEdits.length>30)
    throw new Error('Document update contains too many line modifications.');
  for(const line of proposal.addItems)validateLine(vault,line,document.currency,active);
  const items=new Set(document.items.map(item=>item.id)),edited=new Set<string>();
  for(const edit of proposal.itemEdits){
    if(!edit||!items.has(edit.itemId)||edited.has(edit.itemId))throw new Error('Missing or duplicated document line identity.');
    edited.add(edit.itemId);
    if(edit.quantity!==undefined&&!validDecimal(edit.quantity,true))throw new Error('Document quantity must be positive.');
    if(edit.unitPrice!==undefined&&!validDecimal(edit.unitPrice,false))throw new Error('Document selling price cannot be negative or invalid.');
  }
}
