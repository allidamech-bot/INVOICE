import type {VaultPayload} from '../types.js';
import type {ConversationKernel} from './ai-conversation-kernel.js';
import {setExactRecordSelection} from './ai-record-selection.js';

export type AiPartyHighlightKind='customer'|'supplier';
export interface AiPartyHighlightRow {
  id:string; updatedAt:string; name:string; before:''|'red'; after:'red';
}
export interface AiPartyHighlightBatch{
  party:AiPartyHighlightKind; workspaceId:string; rows:AiPartyHighlightRow[];
  preview:Array<{id:string;name:string;before:string;after:string}>;
}
const LIMIT=100;
export function requestedPartyHighlight(message:string):'red'|null{
 const normalized=String(message||'').normalize('NFKC').replace(/[\u064b-\u065f\u0670]/gu,'').trim();
 if(/^(?:حط|حط\s+لهم|ضع|اعط|اعطي|اضف|أضف|خلي|اجعل)\s+(?:لهم\s+|لها\s+|عليهم\s+)?(?:علامة|اشارة|إشارة|تمييز|وسم)\s+حمراء[.!؟\s]*$/iu.test(normalized)||
   /^(?:mark|highlight|tag)\s+(?:them|selected\s+(?:customers|suppliers)|these\s+(?:customers|suppliers))\s+red[.!?\s]*$/iu.test(normalized))
   return'red';
 return null;
}
function scope(vault:VaultPayload):string{return vault.appSettings.activeWorkspaceId||'default';}
/** A complete, bounded read-only preview. No master-data write occurs here. */
export function prepareSelectedPartyHighlight(kernel:ConversationKernel,vault:VaultPayload):AiPartyHighlightBatch{
 const selected=kernel.selection,ids=selected?.selectedIds||[];
 if(!selected||!ids.length||ids.length>LIMIT)throw new Error('Select 1–100 exact customers or suppliers before preparing a visual mark.');
 if(kernel.scope.scope!=='business'||kernel.scope.workspaceId!==scope(vault)||
   kernel.scope.branchId!==(vault.appSettings.activeBranchId||'main'))
   throw new Error('Company or branch changed; no records were changed.');
 const types=[...new Set(selected.items.map(r=>r.entityType))];
 if(types.length!==1||!['customer','supplier'].includes(types[0]||''))throw new Error('Select customer or supplier records only, not mixed record types.');
 const party=types[0] as AiPartyHighlightKind;
 setExactRecordSelection(kernel,vault,selected.id,ids);
 const rows:AiPartyHighlightRow[]=ids.map(id=>{
   const record=party==='customer'?vault.customers.find(r=>r.id===id&&(r.workspaceId||'default')===scope(vault)):
      vault.suppliers.find(r=>r.id===id&&(r.workspaceId||'default')===scope(vault));
   if(!record||!record.updatedAt)throw new Error('A selected record changed or disappeared. Reload the exact selection.');
   const name=party==='customer'
     ?((record as typeof vault.customers[number]).companyNameAr||(record as typeof vault.customers[number]).companyNameEn)
     :((record as typeof vault.suppliers[number]).nameAr||(record as typeof vault.suppliers[number]).nameEn);
   if(record.highlightColor==='red')throw new Error('One selected record is already red. Review the selection; nothing was changed.');
   return{id,updatedAt:record.updatedAt,name:name||id,before:'',after:'red'};
 });
 return{party,workspaceId:scope(vault),rows,preview:rows.map(r=>({id:r.id,name:r.name,before:r.before||'No mark',after:'Red mark'}))};
}
/** One atomic master-data mutation. Verify every row and its exact revision
 * BEFORE changing any row: no partial tagging, duplicates, or cross-company edits. */
export function applySelectedPartyHighlight(vault:VaultPayload,batch:AiPartyHighlightBatch,now=new Date().toISOString()):VaultPayload{
 if(!batch||!['customer','supplier'].includes(batch.party)||!Array.isArray(batch.rows)||
   !batch.rows.length||batch.rows.length>LIMIT||scope(vault)!==batch.workspaceId)
   throw new Error('Invalid or stale approved highlight batch.');
 const targets=batch.party==='customer'?vault.customers:vault.suppliers;
 const ids=new Set<string>();
 for(const row of batch.rows){
   if(!row||ids.has(row.id)||row.after!=='red'||row.before!==''||typeof row.updatedAt!=='string')
      throw new Error('Invalid or duplicate approved record.');
   ids.add(row.id);
   const current=targets.find(r=>r.id===row.id&&(r.workspaceId||'default')===batch.workspaceId);
   if(!current||current.updatedAt!==row.updatedAt||current.highlightColor)
      throw new Error('A selected master record changed after review. No marks were saved.');
 }
 if(batch.party==='customer')return{...vault,customers:vault.customers.map(r=>ids.has(r.id)&&
   (r.workspaceId||'default')===batch.workspaceId?{...r,highlightColor:'red' as const,updatedAt:now}:r)};
 return{...vault,suppliers:vault.suppliers.map(r=>ids.has(r.id)&&
   (r.workspaceId||'default')===batch.workspaceId?{...r,highlightColor:'red' as const,updatedAt:now}:r)};
}
