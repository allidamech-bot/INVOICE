import type { LourexDocument, VaultPayload } from '../types.js';
import { buildAiBusinessContext } from './ai-business.js';
import { buildCollectionTasks } from './collections-workflow.js';
import { todayIso } from './id.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';
import { buildProductPricingContext } from './product-pricing-intelligence.js';

export type DailyCommandPriority='critical'|'high'|'medium';
export type DailyCommandKind='collection'|'quote-expiry'|'purchase-draft'|'pricing'|'cost-change'|'product-data';
export interface DailyCommandAlert{
  key:string;
  kind:DailyCommandKind;
  priority:DailyCommandPriority;
  title:string;
  detail:string;
  actionLabel:string;
  searchQuery:string;
}

const WEIGHT:Record<DailyCommandPriority,number>={critical:3,high:2,medium:1};
function shiftIso(date:string,days:number):string{const [y,m,d]=date.split('-').map(Number);const next=new Date(Date.UTC(y||0,(m||1)-1,(d||1)+days));return `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-${String(next.getUTCDate()).padStart(2,'0')}`;}
function quoteExpiry(doc:LourexDocument):string{
  const raw=doc.terms.validity.trim();if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  const days=raw.match(/^(\d{1,4})\s*(?:days?|يوم|أيام|ايام)$/iu)?.[1];if(!days)return'';const n=Number(days);return Number.isFinite(n)&&n>=0?shiftIso(doc.issueDate,n):'';
}
function positiveMoney(value:string):boolean{try{return isNonNegativeDecimalInput(value)&&decimalToScaled(value,2)>0n;}catch{return false;}}
function overdueByCurrency(rows:Array<{currency:string;overdue:string}>):string{const parts=rows.filter(row=>positiveMoney(row.overdue)).map(row=>`${row.overdue} ${row.currency}`);return parts.length?parts.join(' · '):'none recorded';}
function unique(alerts:DailyCommandAlert[]):DailyCommandAlert[]{const seen=new Set<string>();return alerts.filter(alert=>{if(seen.has(alert.key))return false;seen.add(alert.key);return true;});}

export function whatMattersToday(vault:VaultPayload,limit=5,asOf=todayIso()):DailyCommandAlert[]{
  const alerts:DailyCommandAlert[]=[];const tomorrow=shiftIso(asOf,1);
  const collection=buildCollectionTasks(vault,asOf)[0];if(collection&&collection.priority!=='normal'){const overdue=overdueByCurrency(collection.currencies);alerts.push({key:`collection:${collection.customerId}`,kind:'collection',priority:collection.priority==='high'?'critical':'high',title:`Collection follow-up — ${collection.customerName}`,detail:`${collection.openInvoices.length} open invoice(s); recorded overdue by currency: ${overdue}. Currencies remain separate.`,actionLabel:'Open customer / collections',searchQuery:collection.customerName});}
  for(const doc of vault.documents){if(!['proforma','proforma-invoice'].includes(doc.kind)||doc.status!=='final'||doc.lifecycleStatus==='voided')continue;const expiry=quoteExpiry(doc);if(expiry===tomorrow)alerts.push({key:`quote-expiry:${doc.id}`,kind:'quote-expiry',priority:'high',title:`Quotation expires tomorrow — ${doc.number}`,detail:`Customer ${(doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr||'not identified').trim()}; expiry ${expiry}.`,actionLabel:'Review quotation',searchQuery:doc.number});else if(expiry===asOf)alerts.push({key:`quote-expiry:${doc.id}`,kind:'quote-expiry',priority:'critical',title:`Quotation expires today — ${doc.number}`,detail:`Customer ${(doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr||'not identified').trim()}; expiry ${expiry}.`,actionLabel:'Review quotation',searchQuery:doc.number});}
  const drafts=vault.purchases.filter(purchase=>purchase.status==='draft').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,2);for(const purchase of drafts)alerts.push({key:`purchase-draft:${purchase.id}`,kind:'purchase-draft',priority:'medium',title:`Purchase draft needs review — ${purchase.number}`,detail:`${purchase.supplierSnapshot?.nameEn||purchase.supplierSnapshot?.nameAr||'Supplier not selected'} · ${purchase.currency} · ${purchase.items.length} line(s).`,actionLabel:'Review purchase draft',searchQuery:purchase.number});
  const pricing=buildProductPricingContext(vault,'',asOf);for(const row of pricing.rows){if(row.pricingHealth==='below-cost')alerts.push({key:`pricing:${row.id}:below-cost`,kind:'pricing',priority:'critical',title:`Selling price below cost — ${row.name}`,detail:`Recorded sale ${row.salePrice} ${row.currency}; cost ${row.cost} ${row.currency}.`,actionLabel:'Review product',searchQuery:row.name});else if(row.pricingHealth==='below-policy')alerts.push({key:`pricing:${row.id}:below-policy`,kind:'pricing',priority:'high',title:`Price below company policy — ${row.name}`,detail:`Recorded sale ${row.salePrice} ${row.currency}; policy suggestion ${row.suggestedPrice} ${row.currency}.`,actionLabel:'Review product',searchQuery:row.name});if(row.missing.length>=3)alerts.push({key:`product-data:${row.id}`,kind:'product-data',priority:'medium',title:`Product data incomplete — ${row.name}`,detail:`Missing: ${row.missing.join(', ')}.`,actionLabel:'Review product',searchQuery:row.name});}
  const business=buildAiBusinessContext(vault,asOf);for(const alert of business.suppliers.costAlerts.slice(0,3)){const magnitude=Math.abs(Number(alert.changePercent||0));alerts.push({key:`cost-change:${alert.itemId}:${alert.currency}`,kind:'cost-change',priority:magnitude>=20?'high':'medium',title:`Cost ${alert.direction} — ${alert.itemName}`,detail:`${alert.previousUnitCost} → ${alert.currentUnitCost} ${alert.currency} (${alert.changePercent}%) · ${alert.supplierName}.`,actionLabel:'Compare supplier context',searchQuery:alert.itemName});}
  return unique(alerts).sort((a,b)=>WEIGHT[b.priority]-WEIGHT[a.priority]||a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title)).slice(0,Math.max(1,Math.min(8,limit)));
}
