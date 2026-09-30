import type { PurchaseRecord, SavedItem, Supplier } from '../types.js';
import { createPurchase, createPurchaseItem, supplierSnapshotFrom } from './operations.js';
import { normalizeSavedItemIdentity, normalizeSavedItemSku } from './saved-items.js';
import type { SupplierImportDraft } from './supplier-document-import.js';

function norm(value:string):string{return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}
function onlyOne<T>(rows:T[]):T|undefined{return rows.length===1?rows[0]:undefined;}
function supplierMatch(suppliers:Supplier[],draft:SupplierImportDraft):Supplier|undefined{
  const name=norm(draft.supplierName),tax=norm(draft.supplierTaxId);
  if(tax){const matches=suppliers.filter(supplier=>[supplier.vatTaxNumber,supplier.commercialRegistration].some(value=>norm(value)===tax));if(matches.length)return onlyOne(matches);}
  if(name){const matches=suppliers.filter(supplier=>[supplier.nameEn,supplier.nameAr].some(value=>norm(value)===name));if(matches.length)return onlyOne(matches);}
  return undefined;
}
function itemMatch(items:SavedItem[],row:SupplierImportDraft['items'][number]):SavedItem|undefined{
  const active=items.filter(item=>!item.archived);const sku=normalizeSavedItemSku(row.sku);
  if(sku){const matches=active.filter(item=>normalizeSavedItemSku(item.sku??'')===sku);if(matches.length)return onlyOne(matches);}
  const en=normalizeSavedItemIdentity(row.descriptionEn),ar=normalizeSavedItemIdentity(row.descriptionAr);const matches=active.filter(item=>(en&&normalizeSavedItemIdentity(item.descriptionEn)===en)||(ar&&normalizeSavedItemIdentity(item.descriptionAr)===ar));return onlyOne(matches);
}

/**
 * Builds an AI-originated purchase DRAFT without inventing missing commercial facts.
 * Missing source date/currency/unit/freight/duty/other costs remain blank for human review.
 * Ambiguous supplier/product master matches remain unlinked for explicit human review.
 * The generated LOUREX purchase number is an internal identifier, not extracted source data.
 */
export function buildAiSupplierPurchaseDraft(draft:SupplierImportDraft,purchases:PurchaseRecord[],suppliers:Supplier[],items:SavedItem[]):PurchaseRecord{
  const matchedSupplier=supplierMatch(suppliers,draft);
  let purchase=createPurchase(purchases,matchedSupplier?[matchedSupplier]:[],draft.currency.trim());
  const now=new Date().toISOString();
  purchase={...purchase,date:draft.date.trim(),currency:draft.currency.trim().toUpperCase(),supplierSnapshot:matchedSupplier?supplierSnapshotFrom(matchedSupplier):draft.supplierName?{sourceSupplierId:'',nameEn:draft.supplierName,nameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:draft.supplierTaxId,commercialRegistration:''}:null,freight:draft.freight.trim(),duty:draft.duty.trim(),otherCosts:draft.otherCosts.trim(),notes:[draft.documentNumber?`Supplier document: ${draft.documentNumber}`:'',draft.paymentTerms?`Payment terms: ${draft.paymentTerms}`:'',draft.notes].filter(Boolean).join('\n'),status:'draft',updatedAt:now};
  purchase.items=draft.items.map(row=>{
    const saved=itemMatch(items,row);const line=createPurchaseItem(saved);
    return{...line,savedItemId:saved?.id??'',sku:row.sku||saved?.sku||'',descriptionEn:row.descriptionEn||saved?.descriptionEn||'',descriptionAr:row.descriptionAr||saved?.descriptionAr||'',quantity:row.quantity,unit:row.unit.trim(),unitCost:row.unitCost,landedUnitCost:'',previousUnitCost:saved?.lastUnitCost??'',previousCostCurrency:saved?.lastCostCurrency??''};
  });
  return purchase;
}
