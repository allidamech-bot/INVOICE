import type {VaultPayload} from '../types.js';
import type {ConversationKernel,WorkingSelection} from './ai-conversation-kernel.js';
import {scopeVault} from './workspaces.js';
import {aiProductArchived} from './ai-business.js';

export type RecordListKind='customer'|'supplier'|'product'|'document';

/** A narrow read-only command; never route "show all customers" to navigation. */
export function requestedRecordList(message:string):RecordListKind|null{
 const text=String(message||'').normalize('NFKC').replace(/[\u064b-\u065f\u0670]/gu,'').trim();
 const command=text.match(/^(?:اعرض|أعرض|اظهر|أظهر|ورجيني|وريني|هات|show|list)\s+(?:(?:لي|me)\s+)?(?:(?:جميع|كل|all|the)\s+)?(.+?)[.!؟\s]*$/iu);
 if(!command)return null;
 const name=command[1]!.trim().toLocaleLowerCase();
 if(/^(?:العملاء|عملاء|customers?|clients?)$/iu.test(name))return'customer';
 if(/^(?:الموردين|موردين|الموردون|المورد|suppliers?|vendors?)$/iu.test(name))return'supplier';
 if(/^(?:المنتجات|الاصناف|الأصناف|المنتج|منتجات|اصناف|أصناف|products?|items?)$/iu.test(name))return'product';
 if(/^(?:المستندات|مستندات|الوثائق|documents?)$/iu.test(name))return'document';
 return null;
}
export function scopedRecordRows(vault:VaultPayload,kind:RecordListKind):WorkingSelection['items']{
 const scoped=scopeVault(vault);
 if(kind==='customer')return scoped.customers.map(row=>({entityType:kind,entityId:row.id,label:row.companyNameAr||row.companyNameEn||row.contactPerson||row.id}));
 if(kind==='supplier')return scoped.suppliers.map(row=>({entityType:kind,entityId:row.id,label:row.nameAr||row.nameEn||row.id}));
 if(kind==='product')return scoped.savedItems.filter(row=>!aiProductArchived(row)).map(row=>({entityType:kind,entityId:row.id,label:row.descriptionAr||row.descriptionEn||row.sku||row.id}));
 return scoped.documents.map(row=>({entityType:kind,entityId:row.id,label:row.number||row.id}));
}
function assertScope(kernel:ConversationKernel,vault:VaultPayload):void{
 if(kernel.scope.scope!=='business'||kernel.scope.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
   kernel.scope.branchId!==(vault.appSettings.activeBranchId||'main'))throw new Error('Company or branch changed. Records were not selected.');
}
function normalizeName(value:string):string{return value.normalize('NFKC').replace(/[\u064b-\u065f\u0670]/gu,'').trim().replace(/\s+/gu,' ').toLocaleLowerCase();}
export function stageScopedRecordList(kernel:ConversationKernel,vault:VaultPayload,kind:RecordListKind):WorkingSelection{
 assertScope(kernel,vault);
 const items=scopedRecordRows(vault,kind);
 if(items.length>2000)throw new Error('Too many records for one review list. Narrow the request; none were omitted or selected.');
 const result:WorkingSelection={id:crypto.randomUUID(),items,selectedIds:[]};
 kernel.selection=result;
 return result;
}
/** The selected IDs remain conversation-only; this function never updates the vault.
 * Every click rechecks current company data, list identity and record existence. */
export function setExactRecordSelection(kernel:ConversationKernel,vault:VaultPayload,selectionId:string,ids:string[]):WorkingSelection{
 assertScope(kernel,vault);
 const selection=kernel.selection;
 if(!selection||selection.id!==selectionId)throw new Error('The record list changed. Display it again.');
 if(!Array.isArray(ids)||ids.length>2000||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)
   throw new Error('Invalid or duplicate record selection.');
 const allowed=new Set(selection.items.map(row=>row.entityId));
 if(ids.some(id=>!allowed.has(id)))throw new Error('A requested record is not in the displayed list.');
 const current=new Set(scopedRecordRows(vault,selection.items[0]?.entityType as RecordListKind||'customer').map(row=>row.entityId));
 if(ids.some(id=>!current.has(id)))throw new Error('A selected record is missing or outside this company. Reopen the list.');
 selection.selectedIds=[...ids];
 return selection;
}
/** Natural names must match one EXACT visible record each; shared names require
 * clicking the specific ID. Never fuzzy-match and never perform the edit itself. */
export function exactNamedRecordSelection(kernel:ConversationKernel,vault:VaultPayload,message:string):WorkingSelection|null{
 const selection=kernel.selection;
 if(!selection)return null;
 const value=String(message||'').normalize('NFKC').trim();
 if(/^(?:حدد|اختار|اختر|select)\s+(?:الكل|الجميع|all)[.!؟\s]*$/iu.test(value))
   return setExactRecordSelection(kernel,vault,selection.id,selection.items.map(row=>row.entityId));
 if(/^(?:الغ|ألغي|إلغاء|الغاء|امسح|clear)\s+(?:التحديد|selection)[.!؟\s]*$/iu.test(value))
   return setExactRecordSelection(kernel,vault,selection.id,[]);
 const match=value.match(/^(?:حدد|اختار|اختر|select)\s+(.+?)[.!؟\s]*$/iu);
 if(!match)return null;
 const names=match[1]!.split(/\s*(?:،|,|\band\b)\s*|\s+و(?=[\p{L}])/iu).map(normalizeName).filter(Boolean);
 if(!names.length||names.length>100)throw new Error('Select up to 100 exact names or use the visible checkboxes.');
 const ids:string[]=[];
 for(const name of names){
  const matches=selection.items.filter(row=>normalizeName(row.label)===name||normalizeName(row.entityId)===name);
  if(matches.length!==1)throw new Error(matches.length?'Duplicate record name; select the exact record ID.':'Record not found in the displayed list: '+name);
  ids.push(matches[0]!.entityId);
 }
 return setExactRecordSelection(kernel,vault,selection.id,[...new Set(ids)]);
}
