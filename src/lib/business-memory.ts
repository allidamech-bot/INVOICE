import type { LourexDocument, VaultPayload } from '../types.js';
import { buildAiBusinessContext } from './ai-business.js';

export type BusinessMemoryKind='customer-pattern'|'product-pattern'|'supplier-pattern'|'commercial-pattern';
export interface BusinessMemoryEntry{
  kind:BusinessMemoryKind;
  key:string;
  title:string;
  detail:string;
  evidenceCount:number;
  confidence:'high'|'medium';
}
export interface BusinessMemorySnapshot{
  basis:'derived-current-records';
  generatedAt:string;
  entries:BusinessMemoryEntry[];
  limitations:string[];
}

function topCounts(values:string[],limit=3):Array<{value:string;count:number}>{
  const counts=new Map<string,number>();for(const raw of values){const value=raw.trim();if(!value)continue;counts.set(value,(counts.get(value)??0)+1);}
  return [...counts.entries()].map(([value,count])=>({value,count})).sort((a,b)=>b.count-a.count||a.value.localeCompare(b.value)).slice(0,limit);
}
function finalCommercialDocuments(documents:LourexDocument[]):LourexDocument[]{return documents.filter(doc=>doc.status==='final'&&doc.lifecycleStatus!=='voided'&&['proforma','proforma-invoice','invoice'].includes(doc.kind));}

export function buildBusinessMemory(vault:VaultPayload):BusinessMemorySnapshot{
  const business=buildAiBusinessContext(vault);const entries:BusinessMemoryEntry[]=[];
  for(const customer of business.customers.rows.slice(0,12)){
    if(customer.paidInvoiceSamples>=2&&(customer.averageDaysToPay!==null||customer.averageDaysLate!==null))entries.push({kind:'customer-pattern',key:`customer:${customer.customerId}:payment`,title:`${customer.customerName} payment pattern`,detail:[customer.averageDaysToPay===null?'':`average time to pay ${customer.averageDaysToPay} days`,customer.averageDaysLate===null?'':`average lateness ${customer.averageDaysLate} days`,customer.followUpPriority!=='normal'?`follow-up priority ${customer.followUpPriority}`:''].filter(Boolean).join('; '),evidenceCount:customer.paidInvoiceSamples,confidence:customer.paidInvoiceSamples>=4?'high':'medium'});
    if(customer.topProducts.length)entries.push({kind:'customer-pattern',key:`customer:${customer.customerId}:products`,title:`${customer.customerName} recurring products`,detail:customer.topProducts.slice(0,3).map(row=>`${row.name} (${row.invoiceLines} invoice lines)`).join(' · '),evidenceCount:customer.topProducts.reduce((sum,row)=>sum+row.invoiceLines,0),confidence:customer.topProducts.reduce((sum,row)=>sum+row.invoiceLines,0)>=4?'high':'medium'});
  }
  const usedProducts=[...vault.savedItems].filter(item=>!item.archived&&item.usageCount>0).sort((a,b)=>b.usageCount-a.usageCount||b.lastUsedAt.localeCompare(a.lastUsedAt)).slice(0,8);
  for(const item of usedProducts)entries.push({kind:'product-pattern',key:`product:${item.id}:usage`,title:(item.descriptionEn||item.descriptionAr||item.sku||'Product').trim(),detail:`used ${item.usageCount} time${item.usageCount===1?'':'s'}; last used ${item.lastUsedAt.slice(0,10)||'unknown'}`,evidenceCount:item.usageCount,confidence:item.usageCount>=4?'high':'medium'});
  for(const alert of business.suppliers.costAlerts.slice(0,8))entries.push({kind:'supplier-pattern',key:`supplier-cost:${alert.itemId}:${alert.currency}`,title:`${alert.itemName} cost ${alert.direction}`,detail:`${alert.supplierName}: ${alert.previousUnitCost} → ${alert.currentUnitCost} ${alert.currency} (${alert.changePercent}%)`,evidenceCount:2,confidence:'medium'});
  const docs=finalCommercialDocuments(vault.documents);const incoterms=topCounts(docs.map(doc=>doc.terms.incoterm),3),payments=topCounts(docs.map(doc=>doc.terms.paymentTerms),3),currencies=topCounts(docs.map(doc=>doc.currency),3);
  if(incoterms.length)entries.push({kind:'commercial-pattern',key:'commercial:incoterms',title:'Common Incoterms',detail:incoterms.map(row=>`${row.value} (${row.count})`).join(' · '),evidenceCount:incoterms.reduce((sum,row)=>sum+row.count,0),confidence:docs.length>=5?'high':'medium'});
  if(payments.length)entries.push({kind:'commercial-pattern',key:'commercial:payment-terms',title:'Common payment terms',detail:payments.map(row=>`${row.value} (${row.count})`).join(' · '),evidenceCount:payments.reduce((sum,row)=>sum+row.count,0),confidence:docs.length>=5?'high':'medium'});
  if(currencies.length)entries.push({kind:'commercial-pattern',key:'commercial:currencies',title:'Common document currencies',detail:currencies.map(row=>`${row.value} (${row.count})`).join(' · '),evidenceCount:currencies.reduce((sum,row)=>sum+row.count,0),confidence:docs.length>=5?'high':'medium'});
  return{basis:'derived-current-records',generatedAt:new Date().toISOString(),entries:entries.sort((a,b)=>Number(b.confidence==='high')-Number(a.confidence==='high')||b.evidenceCount-a.evidenceCount).slice(0,30),limitations:['derived-from-current-lourex-records','not-a-separate-persistent-memory-store','patterns-change-when-business-records-change','no-cross-currency-inference']};
}

export function businessMemoryContextText(vault:VaultPayload,limit=8):string{
  const memory=buildBusinessMemory(vault).entries.slice(0,Math.max(1,Math.min(12,limit)));
  return memory.length?memory.map(entry=>`${entry.title}: ${entry.detail} [${entry.confidence}; evidence ${entry.evidenceCount}]`).join('\n'):'No durable business patterns have enough recorded evidence yet.';
}
