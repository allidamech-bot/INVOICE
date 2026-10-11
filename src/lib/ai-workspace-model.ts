import type { AiContextEnvelope, AiDocumentDraftProposal, AiDocumentUpdateProposal } from '../components/AiCopilot.js';
import type { ConversationKernel, WorkingArtifact } from './ai-conversation-kernel.js';
import type { VaultPayload } from '../types.js';
import { scopeVault } from './workspaces.js';
import { aiProductArchived } from './ai-business.js';
import { normalizeDecimalInput, lineTotal, decimalToScaled } from './money.js';
import { reviewAiDocumentProposal } from './ai-document-review.js';

export type WorkspaceDraft = AiDocumentDraftProposal | AiDocumentUpdateProposal;
export interface WorkspaceLine { id:string; descriptionEn:string; descriptionAr:string; quantity:string; unit:string; unitPrice:string; savedItemId:string; }
export interface WorkspaceDiff { field:string; before:string; after:string; }
export interface WorkspaceDocument { id:string; revision:number; status:'draft'|'saved'; title:string; currency:string; customer:string; rows:WorkspaceLine[]; subtotal:string|null; terms:{label:string;value:string}[]; blockers:string[]; diff:WorkspaceDiff[]; }
export interface PickerRow { id:string; label:string; detail:string; }
export type WorkspaceCommand =
  | { kind:'focus'; focus:ConversationKernel['focus'] }
  | { kind:'cell'; artifactId:string; revision:number; lineId:string; field:'descriptionEn'|'descriptionAr'|'quantity'|'unit'|'unitPrice'; value:string }
  | { kind:'customer'|'product'; artifactId:string; revision:number; entityId:string }
  | { kind:'undo'|'redo'; artifactId:string; revision:number };

/** Only scoped facts enter presentation. Unlike model context, read-only preview never slices rows. */
export function workspaceDrafting(vault:VaultPayload,documentId=''):AiContextEnvelope['drafting'] {
  const scoped=scopeVault(vault),doc=scoped.documents.find(row=>row.id===documentId&&row.kind!=='draft');
  return {
    customers:scoped.customers.map(row=>({id:row.id,name:row.companyNameEn||row.companyNameAr||row.contactPerson,preferredCurrency:row.preferredCurrency,paymentTerms:row.paymentTerms})),
    items:scoped.savedItems.filter(row=>!aiProductArchived(row)).map(row=>({id:row.id,name:row.descriptionEn||row.descriptionAr||row.sku||'',sku:row.sku||'',descriptionEn:row.descriptionEn,descriptionAr:row.descriptionAr,unit:row.unit,lastUnitPrice:row.lastUnitPrice,lastCurrency:row.lastCurrency})),
    defaults:{currency:scoped.company.defaultCurrency,language:scoped.company.defaultLanguage,incoterm:scoped.company.defaultIncoterm,paymentTerms:scoped.company.defaultPaymentTerms,deliveryTime:scoped.company.defaultDeliveryTime,validity:String(scoped.company.defaultValidityDays)},
    activeDocument:doc?{id:doc.id,number:doc.number,kind:doc.kind as 'proforma',status:doc.status,currency:doc.currency,language:doc.language,customerName:doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr||'',supplierName:doc.supplierSnapshot?.nameEn||doc.supplierSnapshot?.nameAr||'',items:doc.items,terms:doc.terms,notes:doc.notes}:null
  };
}
const clean=(value:unknown)=>typeof value==='string'?value:'';
function draftRows(artifact:WorkingArtifact,drafting:AiContextEnvelope['drafting']):WorkspaceLine[] {
  const p=artifact.proposal;
  const resolve=(row:any,currency:string)=>{const ref=drafting.items.find(item=>item.id===row.savedItemId);return {...row,descriptionEn:row.descriptionEn||ref?.descriptionEn||'',descriptionAr:row.descriptionAr||ref?.descriptionAr||'',unit:row.unit||ref?.unit||'',unitPrice:row.unitPrice||(ref?.lastCurrency===currency?ref.lastUnitPrice:'')};};
  if(p.capability==='document.createDraft')return p.items.map((row,i)=>({...resolve(row,p.currency),id:artifact.lineIds[i]!}));
  const active=drafting.activeDocument;
  if(!active||active.id!==p.documentId)throw new Error('Draft is no longer available in this company or branch.');
  const ids=artifact.lineIds.slice(0,active.items.length).every((id,i)=>id===active.items[i]?.id)?artifact.lineIds.slice(active.items.length):artifact.lineIds;
  return [...active.items.map(row=>({...row,...p.itemEdits.find(edit=>edit.itemId===row.id),id:row.id,savedItemId:''})),...p.addItems.map((row,i)=>({...resolve(row,active.currency),id:ids[i]!}))];
}
function differences(before:WorkspaceLine[],after:WorkspaceLine[]):WorkspaceDiff[] {
  const fields=['descriptionEn','descriptionAr','quantity','unit','unitPrice'] as const;
  return after.flatMap((row,i)=>{
    const old=before.find(item=>item.id===row.id);
    if(!old)return [{field:String(i+1),before:'',after:row.descriptionEn||row.descriptionAr}];
    return fields.filter(field=>old[field]!==row[field]).map(field=>({field:`${i+1} · ${field}`,before:old[field],after:row[field]}));
  });
}
export function workspaceDocument(kernel:ConversationKernel,vault:VaultPayload,language:'ar'|'en',savedId=''):WorkspaceDocument|null {
  const scoped=scopeVault(vault),artifact=kernel.artifact;
  if(kernel.scope.scope==='personal'||kernel.scope.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||kernel.scope.branchId!==(vault.appSettings.activeBranchId||'main'))return null;
  if(savedId){
    const doc=scoped.documents.find(row=>row.id===savedId);if(!doc)return null;
    return summarize({id:doc.id,revision:doc.revision,status:'saved',title:doc.number,currency:doc.currency,customer:doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr||doc.supplierSnapshot?.nameEn||doc.supplierSnapshot?.nameAr||'',rows:doc.items.map(row=>({...row,savedItemId:''})),terms:Object.entries(doc.terms).filter(([,v])=>v).map(([label,value])=>({label,value})),blockers:[],diff:[]});
  }
  if(!artifact)return null;
  const p=artifact.proposal,drafting=workspaceDrafting(vault,p.capability==='document.updateDraft'?p.documentId:''),rows=draftRows(artifact,drafting);
  const old=artifact.undo.at(-1);
  const before=old?draftRows({...artifact,proposal:old,lineIds:artifact.undoLineIds?.at(-1)||artifact.lineIds},drafting):p.capability==='document.updateDraft'?drafting.activeDocument!.items.map(row=>({...row,savedItemId:''})):[];
  const diff=differences(before,rows);
  if(old?.capability==='document.createDraft'&&p.capability==='document.createDraft'&&old.customerId!==p.customerId)diff.push({field:'customer',before:drafting.customers.find(row=>row.id===old.customerId)?.name||'',after:drafting.customers.find(row=>row.id===p.customerId)?.name||''});
  const review=reviewAiDocumentProposal(p,drafting,language);
  const terms=p.capability==='document.createDraft'?{incoterm:p.incoterm,paymentTerms:p.paymentTerms,deliveryTime:p.deliveryTime,validity:p.validity,remarks:p.remarks,notes:p.notes}:{...drafting.activeDocument?.terms,...p.termsPatch,notes:p.notes??drafting.activeDocument?.notes};
  return summarize({id:artifact.id,revision:artifact.revision,status:'draft',title:p.label,currency:p.capability==='document.createDraft'?p.currency:drafting.activeDocument!.currency,customer:p.capability==='document.createDraft'?drafting.customers.find(row=>row.id===p.customerId)?.name||p.customerDraft?.companyNameEn||p.customerDraft?.companyNameAr||'':drafting.activeDocument!.customerName,rows,terms:Object.entries(terms).filter(([,v])=>v).map(([label,value])=>({label,value:clean(value)})),blockers:review.blockers,diff});
}
function summarize(value:Omit<WorkspaceDocument,'subtotal'>):WorkspaceDocument {
  let total=0n,complete=true;
  for(const row of value.rows){if(!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(row.quantity)||! /^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(row.unitPrice)||decimalToScaled(row.quantity,6)<=0n){complete=false;continue;}total+=decimalToScaled(lineTotal(row.quantity,row.unitPrice),2);}
  return {...value,subtotal:complete?String(total/100n)+'.'+String(total%100n).padStart(2,'0'):null};
}
/** Explicit UI choices alter the working proposal only; never the vault or saved document. */
export function applyWorkspaceCommand(kernel:ConversationKernel,vault:VaultPayload,command:WorkspaceCommand):void {
  if(command.kind==='focus'){if(!['auto','operator','advisor','financial'].includes(command.focus))throw new Error('Unknown focus.');kernel.focus=command.focus;return;}
  if(kernel.scope.scope==='personal')throw new Error('Business editing is unavailable in Personal.');
  if(kernel.scope.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||kernel.scope.branchId!==(vault.appSettings.activeBranchId||'main'))throw new Error('Company or branch changed.');
  const a=kernel.artifact;if(!a||a.id!==command.artifactId||a.revision!==command.revision)throw new Error('The draft changed. Review its latest revision.');
  const p=structuredClone(a.proposal),drafting=workspaceDrafting(vault,p.capability==='document.updateDraft'?p.documentId:'');
  if(command.kind==='undo'||command.kind==='redo'){
    const from=command.kind==='undo'?a.undo:a.redo,fromIds=command.kind==='undo'?(a.undoLineIds||[]):(a.redoLineIds||[]);
    const to=command.kind==='undo'?a.redo:a.undo,toIds=command.kind==='undo'?(a.redoLineIds||=[]):(a.undoLineIds||=[]);
    const next=from.pop();if(!next)throw new Error('No revision available.');to.push(p);toIds.push([...a.lineIds]);a.proposal=next;a.lineIds=fromIds.pop()||a.lineIds;a.revision++;a.lastEdit=undefined;return;
  }
  if(command.kind==='customer'){
    if(p.capability!=='document.createDraft')throw new Error('Customer reassignment is only available in an unsaved new draft.');
    const row=drafting.customers.find(row=>row.id===command.entityId);if(!row)throw new Error('Customer is no longer available.');p.customerId=row.id;p.customerDraft=null;
  }else if(command.kind==='product'){
    const row=drafting.items.find(row=>row.id===command.entityId);if(!row)throw new Error('Product is no longer available.');
    const list=p.capability==='document.createDraft'?p.items:p.addItems;if(list.length>=20)throw new Error('The existing approval limit is 20 added lines. No line was dropped.');
    const currency=p.capability==='document.createDraft'?p.currency:drafting.activeDocument!.currency;
    list.push({savedItemId:row.id,descriptionEn:row.descriptionEn,descriptionAr:row.descriptionAr,quantity:'1',unit:row.unit,unitPrice:row.lastCurrency===currency?row.lastUnitPrice:''});
  }else if(command.kind==='cell'){
    if(!['descriptionEn','descriptionAr','quantity','unit','unitPrice'].includes(command.field)||typeof command.value!=='string')throw new Error('Unsupported grid field.');
    const rows=draftRows(a,drafting),row=rows.find(row=>row.id===command.lineId);if(!row)throw new Error('Line identity is no longer available.');
    const numeric=command.field==='quantity'||command.field==='unitPrice',value=numeric?normalizeDecimalInput(command.value):command.value.trim();
    if(numeric&&(!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(value)||(command.field==='quantity'&&decimalToScaled(value,6)<=0n)))throw new Error('Enter a valid decimal; quantity must be positive.');
    if(!numeric&&(!value||value.length>(command.field==='unit'?40:160)||/[\u0000-\u001f]/.test(value)))throw new Error('Enter a nonempty description or unit within its limit.');
    if(row[command.field]===value)return;
    if(p.capability==='document.createDraft'){const i=a.lineIds.indexOf(command.lineId);if(!p.items[i])throw new Error('Line identity mismatch.');p.items[i]![command.field]=value;}
    else {const existing=drafting.activeDocument!.items.find(item=>item.id===command.lineId);if(existing){let edit=p.itemEdits.find(edit=>edit.itemId===existing.id);if(!edit){if(p.itemEdits.length>=30)throw new Error('The existing limit is 30 edited lines.');edit={itemId:existing.id};p.itemEdits.push(edit);}edit[command.field]=value;}else {const index=rows.findIndex(row=>row.id===command.lineId)-drafting.activeDocument!.items.length;if(!p.addItems[index])throw new Error('Line identity mismatch.');p.addItems[index]![command.field]=value;}}
  }else throw new Error('Unsupported workspace command.');
  const previous=structuredClone(a.proposal);
  a.undo=[...a.undo,previous].slice(-50);a.undoLineIds=[...(a.undoLineIds||[]),[...a.lineIds]].slice(-50);a.redo=[];a.redoLineIds=[];a.proposal=p;a.revision++;a.lastEdit=undefined;
  if(p.capability==='document.updateDraft'){
    const base=drafting.activeDocument!.items.map(row=>row.id),isFull=base.every((id,i)=>a.lineIds[i]===id);a.lineIds=[...base,...(isFull?a.lineIds.slice(base.length):a.lineIds)];
  }
  if(command.kind==='product')a.lineIds.push(crypto.randomUUID());
  if(command.kind==='customer'||command.kind==='product'){
    const row=command.kind==='customer'?drafting.customers.find(row=>row.id===command.entityId):drafting.items.find(row=>row.id===command.entityId);
    kernel.entity={entityType:command.kind,entityId:command.entityId,label:row?.name||command.entityId};
    if(kernel.selection?.items.some(row=>row.entityId===command.entityId))kernel.selection.selectedId=command.entityId;
  }
  if(command.kind==='cell'&&(command.field==='quantity'||command.field==='unitPrice')){a.selectedLineId=command.lineId;a.lastEdit={lineId:command.lineId,field:command.field,value:normalizeDecimalInput(command.value),before:previous};}
}

export const WORKSPACE_COMPONENTS=Object.freeze(['CustomerPicker','ProductPicker','EditablePricingGrid','QuotePreview','QuoteDiff','AttachmentGallery','EvidencePopover','ApprovalDiff'] as const);
export type WorkspaceComponent=typeof WORKSPACE_COMPONENTS[number];
export interface WorkspaceCard { component:WorkspaceComponent; rows:{id:string;label:string;detail:string}[]; }
/** An untrusted descriptor cannot choose code, handlers, styles, URLs or HTML. */
export function validateWorkspaceCard(value:unknown):WorkspaceCard|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(key=>!['component','rows'].includes(key))||!WORKSPACE_COMPONENTS.includes(v.component as WorkspaceComponent)||!Array.isArray(v.rows)||v.rows.length>1000)return null;
  const ids=new Set<string>();
  for(const row of v.rows){if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['id','label','detail'].includes(key)))return null;for(const key of ['id','label','detail'])if(typeof row[key]!=='string'||row[key].length>4000)return null;if(!row.id||ids.has(row.id))return null;ids.add(row.id);}
  return {component:v.component as WorkspaceComponent,rows:v.rows.map(row=>({id:row.id,label:row.label,detail:row.detail}))};
}
