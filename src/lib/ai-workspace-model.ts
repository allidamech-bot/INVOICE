import { buildBusinessMemoryGraph, prepareBusinessHandoff } from './ai-business-memory-graph.js';
import { simulateCash, reliabilityReview, type CashAssumption } from './ai-reliability-intelligence.js';
import type { AiContextEnvelope, AiDocumentDraftProposal, AiDocumentUpdateProposal } from '../components/AiCopilot.js';
import type { ConversationKernel, WorkingArtifact } from './ai-conversation-kernel.js';
import type { VaultPayload } from '../types.js';
import { scopeVault } from './workspaces.js';
import { aiProductArchived } from './ai-business.js';
import { normalizeDecimalInput, lineTotal, decimalToScaled } from './money.js';
import { commercialScenario, convertPack, convertNestedPack, externalQuote, compareSuppliers, compareIncoterms, decimal, moneyString, type ScenarioInput, type ExternalQuote } from './ai-commercial-intelligence.js';
import { cancelMission } from './ai-mission-runner.js';
import { stageKernelArtifact } from './ai-conversation-kernel.js';
import { reviewAiDocumentProposal } from './ai-document-review.js';
import {resolveAiCommercialLine} from './ai-commercial-line.js';
import {AI_WORKING_QUOTE_MAX_LINES,aiDraftUndoDepth} from './ai-document-limits.js';
import {setExactRecordSelection} from './ai-record-selection.js';

export type WorkspaceDraft = AiDocumentDraftProposal | AiDocumentUpdateProposal;
export interface WorkspaceLine { id:string; descriptionEn:string; descriptionAr:string; quantity:string; unit:string; unitPrice:string; savedItemId:string; packing?:string; }
export interface WorkspaceDiff { field:string; before:string; after:string; }
export interface WorkspaceDocument { id:string; revision:number; status:'draft'|'saved'; title:string; currency:string; customer:string; rows:WorkspaceLine[]; subtotal:string|null; terms:{label:string;value:string}[]; blockers:string[]; diff:WorkspaceDiff[]; }
export interface PickerRow { id:string; label:string; detail:string; }
export type WorkspaceCommand =
  | { kind:'selection-set'; selectionId:string; entityIds:string[] }
  | { kind:'graph-select'; nodeId:string }
  | { kind:'handoff-preview'; nodeId:string; recipientId:string }
  | { kind:'review-date'; asOf:string }
  | { kind:'cash-simulation'; asOf:string; until:string; flows:CashAssumption[] }
  | { kind:'clear-diagnostics' }
  | { kind:'scenario'; input:ScenarioInput }
  | { kind:'pack'; cartons:string; unitsPerCarton:string; boxesPerCarton?:string; unitsPerBox?:string }
  | { kind:'external-source'; source:Omit<ExternalQuote,'id'|'capturedAt'|'reliability'> }
  | { kind:'suppliers'; productId:string }
  | { kind:'cancel-mission'; missionId:string }
  | { kind:'composer'; documentKind:'proforma'|'invoice'; currency:string }
  | { kind:'add-line'; artifactId:string; revision:number; descriptionEn:string; descriptionAr:string; quantity:string; unit:string; unitPrice:string }
  | { kind:'reprice'; artifactId:string; revision:number; currency:string; reduction:string; lastReduction:string }
  | { kind:'terms'; artifactId:string; revision:number; incoterm:string; paymentTerms:string; deliveryTime:string }
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
  const resolve=(row:any,currency:string)=>resolveAiCommercialLine(row,drafting.items.find(item=>item.id===row.savedItemId),currency);
  if(p.capability==='document.createDraft')return p.items.map((row,i)=>({...resolve(row,p.currency),packing:row.packing,id:artifact.lineIds[i]!}));
  const active=drafting.activeDocument;
  if(!active||active.id!==p.documentId)throw new Error('Draft is no longer available in this company or branch.');
  const ids=artifact.lineIds.slice(0,active.items.length).every((id,i)=>id===active.items[i]?.id)?artifact.lineIds.slice(active.items.length):artifact.lineIds;
  return [...active.items.map(row=>({...row,...p.itemEdits.find(edit=>edit.itemId===row.id),id:row.id,savedItemId:''})),...p.addItems.map((row,i)=>({...resolve(row,active.currency),packing:row.packing,id:ids[i]!}))];
}
function differences(before:WorkspaceLine[],after:WorkspaceLine[]):WorkspaceDiff[] {
  const fields=['descriptionEn','descriptionAr','quantity','unit','unitPrice','packing'] as const;
  return after.flatMap((row,i)=>{
    const old=before.find(item=>item.id===row.id);
    if(!old)return [{field:String(i+1),before:'',after:row.descriptionEn||row.descriptionAr}];
    return fields.filter(field=>old[field]!==row[field]).map(field=>({field:`${i+1} · ${field}`,before:old[field]||'',after:row[field]||''}));
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
  const knowledge=()=>kernel.knowledge||(kernel.knowledge={});
  if(command.kind==='selection-set'){setExactRecordSelection(kernel,vault,command.selectionId,command.entityIds);return;}
  if(command.kind==='graph-select'){const node=buildBusinessMemoryGraph(vault,kernel.scope).nodes.find(n=>n.id===command.nodeId);if(!node)throw new Error('Exact graph record is no longer available.');knowledge().selectedNodeId=node.id;knowledge().handoff=undefined;if(['customer','supplier','product','document','purchase'].includes(node.kind))kernel.entity={entityType:node.kind as any,entityId:node.recordId,label:node.label};return;}
  if(command.kind==='handoff-preview'){const result=prepareBusinessHandoff(vault,buildBusinessMemoryGraph(vault,kernel.scope),command.nodeId,command.recipientId);knowledge().handoff=result;return;}
  if(command.kind==='review-date'){reliabilityReview(vault,kernel.scope,command.asOf);knowledge().reviewDate=command.asOf;return;}
  if(command.kind==='cash-simulation'){const result=simulateCash(vault,kernel.scope,command.asOf,command.until,command.flows);knowledge().cash=result;return;}
  if(command.kind==='clear-diagnostics'){kernel.diagnostics=[];return;}
  const commercial=()=>kernel.commercial|| (kernel.commercial={sources:[]});
  if(command.kind==='scenario'){commercial().scenario=commercialScenario(vault,command.input);return;}
  if(command.kind==='pack'){
    const nested=Boolean(command.boxesPerCarton?.trim()||command.unitsPerBox?.trim());
    // Keep direct-carton and nested-box fields mutually exclusive. This
    // calculation is a preview, not a change to a document or its pricing.
    if(nested&&command.unitsPerCarton.trim())
      throw new Error('Choose direct units per carton OR inner boxes per carton, not both.');
    commercial().pack=nested
      ?convertNestedPack(command.cartons,command.boxesPerCarton||'',command.unitsPerBox||'')
      :convertPack(command.cartons,command.unitsPerCarton);
    return;
  }
  if(command.kind==='external-source'){if(commercial().sources.length>=50)throw new Error('Evidence limit reached; no source was dropped.');commercial().sources.push(externalQuote(vault,command.source));return;}
  if(command.kind==='suppliers'){compareSuppliers(vault,command.productId,commercial().sources);commercial().supplierProductId=command.productId;return;}
  if(command.kind==='cancel-mission'){const mission=kernel.missions?.find(m=>m.id===command.missionId);if(!mission)throw new Error('Mission not found.');cancelMission(mission);return;}
  if(command.kind==='composer'){
    if(kernel.artifact)throw new Error('Finish or dismiss the current draft before starting another.');
    if(!['proforma','invoice'].includes(command.documentKind)||! /^[A-Z]{3}$/.test(command.currency))throw new Error('Invalid document type or currency.');
    const defaults=workspaceDrafting(vault).defaults;
    stageKernelArtifact(kernel,{capability:'document.createDraft',kind:command.documentKind,currency:command.currency,language:defaults.language,customerId:'',customerDraft:null,items:[],incoterm:defaults.incoterm,paymentTerms:defaults.paymentTerms,deliveryTime:defaults.deliveryTime,validity:defaults.validity,remarks:'',notes:'',label:'Business document draft',rationale:'Prepared by user in the conversation workspace.'});return;
  }
  const a=kernel.artifact;if(!a||a.id!==command.artifactId||a.revision!==command.revision)throw new Error('The draft changed. Review its latest revision.');
  const p=structuredClone(a.proposal),drafting=workspaceDrafting(vault,p.capability==='document.updateDraft'?p.documentId:'');
  if(command.kind==='undo'||command.kind==='redo'){
    const from=command.kind==='undo'?a.undo:a.redo,fromIds=command.kind==='undo'?(a.undoLineIds||[]):(a.redoLineIds||[]);
    const to=command.kind==='undo'?a.redo:a.undo,toIds=command.kind==='undo'?(a.redoLineIds||=[]):(a.undoLineIds||=[]);
    const next=from.at(-1);if(!next)throw new Error('No revision available.');
    const term=(proposal:WorkspaceDraft)=>proposal.capability==='document.createDraft'?proposal.incoterm:proposal.termsPatch.incoterm??drafting.activeDocument?.terms.incoterm??'';
    const beforeTerm=term(p),restoredTerm=term(next);
    if(beforeTerm!==restoredTerm){
      const obligations=/^(EXW|FCA|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)(?:\s|$)/i.test(restoredTerm.trim())?compareIncoterms(beforeTerm,restoredTerm):undefined;
      commercial().obligations=obligations;
    }
    from.pop();to.push(p);toIds.push([...a.lineIds]);a.proposal=next;a.lineIds=fromIds.pop()||a.lineIds;a.revision++;a.lastEdit=undefined;return;
  }
  if(command.kind==='reprice'){
    const doc=workspaceDocument(kernel,vault,'en')!;if(doc.currency!==command.currency)throw new Error('Repricing currency must match the draft.');
    if(!doc.rows.length)throw new Error('Add at least one line before repricing.');
    const amount=decimal(command.reduction),last=decimal(command.lastReduction);
    // Validate the whole draft first. No partial edits, one undo revision.
    const edits=doc.rows.map((row,i)=>({row,value:decimalToScaled(decimal(row.unitPrice),4)-decimalToScaled(i===doc.rows.length-1?last:amount,4)}));
    if(edits.some(e=>e.value<0n))throw new Error('Reduction would make a price negative.');
    for(const {row,value} of edits){const price=String(value/10000n)+'.'+String(value%10000n).padStart(4,'0');
      if(p.capability==='document.createDraft')p.items[a.lineIds.indexOf(row.id)]!.unitPrice=price;
      else{const i=drafting.activeDocument!.items.findIndex(item=>item.id===row.id);if(i>=0){let edit=p.itemEdits.find(e=>e.itemId===row.id);if(!edit){if(p.itemEdits.length>=30)throw new Error('Existing limit is 30 edited lines.');edit={itemId:row.id};p.itemEdits.push(edit);}edit.unitPrice=price;}else p.addItems[doc.rows.indexOf(row)-drafting.activeDocument!.items.length]!.unitPrice=price;}
    }
  }else if(command.kind==='terms'){
    if([command.incoterm,command.paymentTerms,command.deliveryTime].some(v=>typeof v!=='string'||v.length>160||/[\u0000-\u001f]/.test(v)))throw new Error('Invalid commercial terms.');
    const from=p.capability==='document.createDraft'?p.incoterm:p.termsPatch.incoterm||drafting.activeDocument!.terms.incoterm;
    commercial().obligations=compareIncoterms(from,command.incoterm);
    if(p.capability==='document.createDraft'){p.incoterm=command.incoterm;p.paymentTerms=command.paymentTerms;p.deliveryTime=command.deliveryTime;}else p.termsPatch={...p.termsPatch,incoterm:command.incoterm,paymentTerms:command.paymentTerms,deliveryTime:command.deliveryTime};
  }else if(command.kind==='customer'){
    if(p.capability!=='document.createDraft')throw new Error('Customer reassignment is only available in an unsaved new draft.');
    const row=drafting.customers.find(row=>row.id===command.entityId);if(!row)throw new Error('Customer is no longer available.');p.customerId=row.id;p.customerDraft=null;
  }else if(command.kind==='product'){
    const row=drafting.items.find(row=>row.id===command.entityId);if(!row)throw new Error('Product is no longer available.');
    const list=p.capability==='document.createDraft'?p.items:p.addItems;if(list.length>=(p.capability==='document.createDraft'?AI_WORKING_QUOTE_MAX_LINES:20))throw new Error('The working document line limit was reached. No line was dropped.');
    const currency=p.capability==='document.createDraft'?p.currency:drafting.activeDocument!.currency;
    list.push({savedItemId:row.id,descriptionEn:row.descriptionEn,descriptionAr:row.descriptionAr,quantity:'1',unit:row.unit,unitPrice:row.lastCurrency===currency?row.lastUnitPrice:''});
  }else if(command.kind==='add-line'){
    const list=p.capability==='document.createDraft'?p.items:p.addItems;
    if(list.length>=(p.capability==='document.createDraft'?AI_WORKING_QUOTE_MAX_LINES:20))throw new Error('The working document line limit was reached. No line was dropped.');
    const descriptionEn=command.descriptionEn.trim(),descriptionAr=command.descriptionAr.trim(),unit=command.unit.trim();
    if((!descriptionEn&&!descriptionAr)||descriptionEn.length>160||descriptionAr.length>160||!unit||unit.length>40||/[\u0000-\u001f]/.test(descriptionEn+descriptionAr+unit))throw new Error('Enter a description and unit within their limits.');
    const quantity=normalizeDecimalInput(command.quantity),unitPrice=normalizeDecimalInput(command.unitPrice);
    if(!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(quantity)||decimalToScaled(quantity,6)<=0n||! /^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(unitPrice))throw new Error('Enter valid decimals; quantity must be positive and price cannot be negative.');
    list.push({savedItemId:'',descriptionEn,descriptionAr,quantity,unit,unitPrice});
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
  const undoLimit=aiDraftUndoDepth(p.capability==='document.createDraft'?p.items.length:p.addItems.length);
  a.undo=[...a.undo,previous].slice(-undoLimit);a.undoLineIds=[...(a.undoLineIds||[]),[...a.lineIds]].slice(-undoLimit);a.redo=[];a.redoLineIds=[];a.proposal=p;a.revision++;a.lastEdit=undefined;
  if(p.capability==='document.updateDraft'){
    const base=drafting.activeDocument!.items.map(row=>row.id),isFull=base.every((id,i)=>a.lineIds[i]===id);a.lineIds=[...base,...(isFull?a.lineIds.slice(base.length):a.lineIds)];
  }
  if(command.kind==='product'||command.kind==='add-line')a.lineIds.push(crypto.randomUUID());
  if(command.kind==='customer'||command.kind==='product'){
    const row=command.kind==='customer'?drafting.customers.find(row=>row.id===command.entityId):drafting.items.find(row=>row.id===command.entityId);
    kernel.entity={entityType:command.kind,entityId:command.entityId,label:row?.name||command.entityId};
    if(kernel.selection?.items.some(row=>row.entityId===command.entityId))kernel.selection.selectedId=command.entityId;
  }
  if(command.kind==='cell'&&(command.field==='quantity'||command.field==='unitPrice')){a.selectedLineId=command.lineId;a.lastEdit={lineId:command.lineId,field:command.field,value:normalizeDecimalInput(command.value),before:previous};}
}

export const WORKSPACE_COMPONENTS=Object.freeze(['CustomerPicker','ProductPicker','EditablePricingGrid','QuotePreview','QuoteDiff','AttachmentGallery','EvidencePopover','ApprovalDiff','WorkflowProgress','FinanceScenario','SourceCompare'] as const);
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
