import type { PurchaseRecord, SavedItem, VaultPayload } from '../types.js';
import { isIsoDate, todayIso } from './id.js';
import { decimalToScaled } from './money.js';
import { purchaseAccountingIsValid } from './operations.js';
import { searchBusinessRecords, type AiBusinessSearchResult } from './ai-workflows.js';
import { normalizeSavedItemIdentity } from './saved-items.js';

export type BusinessSearchIntent='last-purchase-price'|'product-suppliers'|'customer-documents'|'top-products-country'|'record-search';
export interface BusinessSearchAnswer{
  intent:BusinessSearchIntent;
  summary:string;
  results:AiBusinessSearchResult[];
  facts:Array<{label:string;value:string;detail:string}>;
  limitations:string[];
}

function norm(value:string):string{return value.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670]/g,'').replace(/[^\p{L}\p{N}@.+-]+/gu,' ').replace(/\s+/g,' ').trim();}
function monthsFromQuery(query:string):number|null{const q=query.replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));const match=q.match(/(?:last|اخر|آخر)\s*(\d{1,2})\s*(?:months?|شهر|اشهر|أشهر)/iu);if(!match)return null;const value=Number(match[1]);return Number.isFinite(value)&&value>0&&value<=36?value:null;}
function monthsBack(asOf:string,months:number):string{const [year,month,day]=asOf.split('-').map(Number);const monthIndex=year*12+(month-1)-months;const targetYear=Math.floor(monthIndex/12);const targetMonth=monthIndex-targetYear*12;const maxDay=new Date(Date.UTC(targetYear,targetMonth+1,0)).getUTCDate();return `${targetYear}-${String(targetMonth+1).padStart(2,'0')}-${String(Math.min(day,maxDay)).padStart(2,'0')}`;}
function activeFinal(doc:any):boolean{return doc.status==='final'&&doc.lifecycleStatus!=='voided';}
function productLabel(item:SavedItem):string{return(item.descriptionEn||item.descriptionAr||item.sku||'Product').trim();}
function bestProduct(vault:VaultPayload,query:string):SavedItem|null{
  const direct=searchBusinessRecords(vault,query,12).filter(row=>row.kind==='product');if(direct[0])return vault.savedItems.find(item=>item.id===direct[0]!.id)??null;
  const q=norm(query);let best:SavedItem|null=null,bestScore=0;for(const item of vault.savedItems.filter(row=>!row.archived)){const text=norm([item.sku||'',item.descriptionEn,item.descriptionAr].join(' '));const tokens=q.split(' ').filter(token=>token.length>=2);const score=tokens.reduce((sum,token)=>sum+(text.includes(token)?1:0),0);if(score>bestScore){best=item;bestScore=score;}}return bestScore?best:null;
}
function postedLines(vault:VaultPayload,item:SavedItem,asOf:string):Array<{purchase:PurchaseRecord;line:PurchaseRecord['items'][number]}> {const rows:Array<{purchase:PurchaseRecord;line:PurchaseRecord['items'][number]}>=[];for(const purchase of vault.purchases.filter(row=>row.status==='posted'&&row.date<=asOf&&purchaseAccountingIsValid(row)))for(const line of purchase.items)if(line.savedItemId===item.id)rows.push({purchase,line});return rows.sort((a,b)=>b.purchase.date.localeCompare(a.purchase.date)||b.purchase.updatedAt.localeCompare(a.purchase.updatedAt));}
function supplierLabel(purchase:PurchaseRecord):string{return(purchase.supplierSnapshot?.nameEn||purchase.supplierSnapshot?.nameAr||'Supplier').trim();}
function customerCandidate(vault:VaultPayload,query:string):string{
  const results=searchBusinessRecords(vault,query,12).filter(row=>row.kind==='customer');return results[0]?.id||'';
}
function documentResults(vault:VaultPayload,customerId:string,months:number|null,asOf:string):AiBusinessSearchResult[]{
  const from=months?monthsBack(asOf,months):'';return vault.documents.filter(doc=>activeFinal(doc)&&doc.customerSnapshot?.sourceCustomerId===customerId&&doc.issueDate<=asOf&&(!from||doc.issueDate>=from)&&['proforma','proforma-invoice','invoice'].includes(doc.kind)).sort((a,b)=>b.issueDate.localeCompare(a.issueDate)||b.updatedAt.localeCompare(a.updatedAt)).slice(0,24).map(doc=>({kind:'document',id:doc.id,label:doc.number,detail:`${doc.kind} · ${doc.issueDate} · ${doc.currency}`,score:100}));
}
function countryFromQuery(vault:VaultPayload,query:string):string{
  const q=norm(query);const countries=new Map<string,string>();for(const customer of vault.customers){const country=customer.country.trim();if(country)countries.set(norm(country),country);}for(const [key,value] of countries)if(key&&q.includes(key))return value;return'';
}
function amountString(value:bigint):string{const sign=value<0n?'-':'',abs=value<0n?-value:value;return `${sign}${abs/10_000n}.${(abs%10_000n).toString().padStart(4,'0')}`.replace(/0+$/,'').replace(/\.$/,'');}
function topProductsForCountry(vault:VaultPayload,country:string,asOf:string):Array<{label:string;quantity:string;unit:string;documents:number}>{
  const groups=new Map<string,{label:string;unit:string;quantity:bigint;docs:Set<string>}>();for(const doc of vault.documents.filter(doc=>activeFinal(doc)&&doc.kind==='invoice'&&doc.role!=='credit-note'&&doc.issueDate<=asOf&&norm(doc.customerSnapshot?.country||'')===norm(country))){for(const line of doc.items){if(!line.quantity.trim())continue;let qty=0n;try{qty=decimalToScaled(line.quantity,4);}catch{continue;}const label=(line.descriptionEn||line.descriptionAr||'Product').trim(),unit=line.unit.trim()||'Unit',key=`${normalizeSavedItemIdentity(label)}|${unit.toUpperCase()}`;const current=groups.get(key)??{label,unit,quantity:0n,docs:new Set<string>()};current.quantity+=qty;current.docs.add(doc.id);groups.set(key,current);}}
  return[...groups.values()].sort((a,b)=>a.quantity===b.quantity?b.docs.size-a.docs.size:a.quantity>b.quantity?-1:1).slice(0,10).map(row=>({label:row.label,quantity:amountString(row.quantity),unit:row.unit,documents:row.docs.size}));
}

export function askBusinessRecords(vault:VaultPayload,query:string,asOf=todayIso()):BusinessSearchAnswer{
  const effectiveAsOf=isIsoDate(asOf)?asOf:todayIso();const raw=query.trim(),q=norm(raw);if(!q)return{intent:'record-search',summary:'Enter a business question.',results:[],facts:[],limitations:[]};
  if(/(?:last purchase price|latest purchase price|آخر سعر شراء|اخر سعر شراء|آخر تكلفة شراء|اخر تكلفة شراء)/iu.test(raw)){
    const product=bestProduct(vault,raw);if(!product)return{intent:'last-purchase-price',summary:'No matching saved product was found.',results:[],facts:[],limitations:['No product identity was guessed.']};const rows=postedLines(vault,product,effectiveAsOf),latest=rows[0];if(!latest)return{intent:'last-purchase-price',summary:`No posted purchase history was found for ${productLabel(product)}.`,results:[{kind:'product',id:product.id,label:productLabel(product),detail:product.sku||'',score:100}],facts:[],limitations:['Draft, invalid and future-dated purchases are excluded.']};return{intent:'last-purchase-price',summary:`Latest posted purchase observation for ${productLabel(product)}.`,results:[{kind:'product',id:product.id,label:productLabel(product),detail:product.sku||'',score:100},{kind:'purchase',id:latest.purchase.id,label:latest.purchase.number,detail:`${supplierLabel(latest.purchase)} · ${latest.purchase.date}`,score:99}],facts:[{label:'Unit cost',value:`${latest.line.unitCost} ${latest.purchase.currency}`,detail:`${supplierLabel(latest.purchase)} · ${latest.purchase.date}`},{label:'Landed unit cost',value:latest.line.landedUnitCost?`${latest.line.landedUnitCost} ${latest.purchase.currency}`:'—',detail:'Recorded landed cost on the posted purchase'}],limitations:['Only posted, accounting-valid purchases on or before the reference date are considered.','Currencies are not converted.']};
  }
  if(/(?:suppliers? for|which suppliers?|مين الموردين|من الموردين|موردين.*(?:هذا|هال|لل)|موردي)/iu.test(raw)){
    const product=bestProduct(vault,raw);if(!product)return{intent:'product-suppliers',summary:'No matching saved product was found.',results:[],facts:[],limitations:['No product identity was guessed.']};const rows=postedLines(vault,product,effectiveAsOf);const supplierMap=new Map<string,{name:string;lastDate:string;currency:string;unitCost:string;purchaseId:string;purchaseNumber:string}>();for(const row of rows){const id=row.purchase.supplierSnapshot?.sourceSupplierId||supplierLabel(row.purchase);if(!supplierMap.has(id))supplierMap.set(id,{name:supplierLabel(row.purchase),lastDate:row.purchase.date,currency:row.purchase.currency,unitCost:row.line.unitCost,purchaseId:row.purchase.id,purchaseNumber:row.purchase.number});}const suppliers=[...supplierMap.values()];return{intent:'product-suppliers',summary:`${suppliers.length} supplier(s) have posted purchase history for ${productLabel(product)}.`,results:[{kind:'product',id:product.id,label:productLabel(product),detail:product.sku||'',score:100},...suppliers.map((row,index)=>({kind:'purchase' as const,id:row.purchaseId,label:row.purchaseNumber,detail:`${row.name} · ${row.lastDate} · ${row.unitCost} ${row.currency}`,score:90-index}))],facts:suppliers.map(row=>({label:row.name,value:`${row.unitCost} ${row.currency}`,detail:`Last posted observation ${row.lastDate}`})),limitations:['Only posted, accounting-valid purchase history on or before the reference date is used.','Same product identity is required; currencies are not converted.']};
  }
  if(/(?:quotes?|quotations?|offers?|عروض|عرض سعر)/iu.test(raw)&&/(?:last|اخر|آخر|months?|شهر|اشهر|أشهر)/iu.test(raw)){
    const customerId=customerCandidate(vault,raw),months=monthsFromQuery(raw);if(customerId){const customer=vault.customers.find(row=>row.id===customerId)!;const results=documentResults(vault,customerId,months,effectiveAsOf).filter(row=>{const doc=vault.documents.find(item=>item.id===row.id);return doc?.kind==='proforma'||doc?.kind==='proforma-invoice';});return{intent:'customer-documents',summary:`${results.length} quotation document(s) found for ${customer.companyNameEn||customer.companyNameAr}${months?` in the last ${months} month(s)`:''}.`,results,facts:[],limitations:['Only finalized, non-voided quotation documents on or before the reference date are included.']};}
  }
  if(/(?:top products|most sold|best selling|اكثر المنتجات|أكثر المنتجات|الأكثر مبيعا|الاكثر مبيعا|بعناها)/iu.test(raw)){
    const country=countryFromQuery(vault,raw);if(country){const rows=topProductsForCountry(vault,country,effectiveAsOf);return{intent:'top-products-country',summary:`Top invoiced product quantities for customers recorded in ${country}.`,results:[],facts:rows.map(row=>({label:row.label,value:`${row.quantity} ${row.unit}`,detail:`Across ${row.documents} final invoice(s)`})),limitations:['Only final, non-voided invoices on or before the reference date are included.','Quantities with different units are never combined.','Country is taken from the customer snapshot on the invoice; no geographic inference is made.']};}
  }
  const results=searchBusinessRecords(vault,raw,24);return{intent:'record-search',summary:results.length?`${results.length} matching LOUREX record(s).`:'No matching LOUREX records.',results,facts:[],limitations:['Results are deterministic local record matches.']};
}
