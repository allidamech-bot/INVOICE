import type { LourexDocument, PurchaseRecord, SavedItem, Supplier } from '../types.js';
import { calculateTotals, decimalToScaled, isNonNegativeDecimalInput, lineTotal } from './money.js';
import { calculateProfitability } from './profitability.js';
import { findSavedItemMatch } from './saved-items.js';
import { isIsoDate } from './id.js';

export type ProfitabilityDimension='invoice'|'product'|'supplier'|'category';
export interface ProfitabilityDimensionRow {
  id:string;label:string;currency:string;netSales:string;totalCost:string;grossProfit:string;marginPercent:string;
  profitComplete:boolean;missingCostItems:number;documents:number;note:string;
}
interface Bucket{netSales:bigint;totalCost:bigint;grossProfit:bigint;complete:boolean;missing:number;documents:Set<string>;note:string;}

function cents(value:string):bigint{return decimalToScaled(value||'0',2);}
function centsString(value:bigint):string{const sign=value<0n?'-':'';const abs=value<0n?-value:value;return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;}
function marginString(profit:bigint,revenue:bigint):string{if(revenue===0n)return'0.00';const basis=profit*1_000_000n/revenue,sign=basis<0n?'-':'',abs=basis<0n?-basis:basis;return `${sign}${abs/10_000n}.${((abs%10_000n)/100n).toString().padStart(2,'0')}`;}
function roundDivide(value:bigint,divisor:bigint):bigint{if(divisor===0n)return 0n;const sign=(value<0n)!==(divisor<0n)?-1n:1n,a=value<0n?-value:value,b=divisor<0n?-divisor:divisor;return ((a+b/2n)/b)*sign;}
function eligible(doc:LourexDocument):boolean{return doc.kind==='invoice'&&doc.status==='final'&&doc.lifecycleStatus!=='voided';}
// Financial attribution requires positive evidence that two records share a
// workspace AND branch. Missing legacy scope is only compatible with other
// unscoped legacy records; it must not silently authorize cross-branch links.
function sameEvidenceScope(a:{workspaceId?:string;branchId?:string},b:{workspaceId?:string;branchId?:string}):boolean{
  return (a.workspaceId||'')===(b.workspaceId||'')&&(a.branchId||'')===(b.branchId||'');
}
function rowKey(id:string,currency:string):string{return `${id}\u0000${currency}`;}
function add(map:Map<string,{id:string;label:string;currency:string;bucket:Bucket}>,id:string,label:string,currency:string,docId:string,revenue:bigint,cost:bigint|null,missing:number,note=''):void{
  const key=rowKey(id,currency),existing=map.get(key)??{id,label,currency,bucket:{netSales:0n,totalCost:0n,grossProfit:0n,complete:true,missing:0,documents:new Set<string>(),note}};
  existing.bucket.netSales+=revenue;existing.bucket.documents.add(docId);existing.bucket.missing+=missing;if(note&&!existing.bucket.note)existing.bucket.note=note;
  if(cost===null)existing.bucket.complete=false;else{existing.bucket.totalCost+=cost;existing.bucket.grossProfit+=revenue-cost;}
  map.set(key,existing);
}
function output(map:Map<string,{id:string;label:string;currency:string;bucket:Bucket}>):ProfitabilityDimensionRow[]{return [...map.values()].map(({id,label,currency,bucket})=>({id,label,currency,netSales:centsString(bucket.netSales),totalCost:bucket.complete?centsString(bucket.totalCost):'',grossProfit:bucket.complete?centsString(bucket.grossProfit):'',marginPercent:bucket.complete?marginString(bucket.grossProfit,bucket.netSales):'',profitComplete:bucket.complete,missingCostItems:bucket.missing,documents:bucket.documents.size,note:bucket.note})).sort((a,b)=>{const c=a.currency.localeCompare(b.currency);if(c)return c;const av=cents(a.netSales),bv=cents(b.netSales);return av===bv?a.label.localeCompare(b.label):bv>av?1:-1;});}

export function invoiceProfitabilityRows(documents:LourexDocument[]):ProfitabilityDimensionRow[]{
  return documents.filter(eligible).map(doc=>{const p=calculateProfitability(doc);return{id:doc.id,label:doc.number,currency:doc.currency,netSales:p.netRevenue,totalCost:p.complete?p.totalCost:'',grossProfit:p.complete?p.grossProfit:'',marginPercent:p.marginPercent,profitComplete:p.complete,missingCostItems:p.missingCostItems,documents:1,note:''};}).sort((a,b)=>b.label.localeCompare(a.label));
}

interface LineAllocation {doc:LourexDocument;item:LourexDocument['items'][number];saved:SavedItem|undefined;revenue:bigint;cost:bigint|null;missing:number;}
function lineAllocations(documents:LourexDocument[],items:SavedItem[]):LineAllocation[]{
  const rows:LineAllocation[]=[];
  for(const doc of documents.filter(eligible)){
    const totals=calculateTotals(doc.items,doc.adjustments),profit=calculateProfitability(doc),netRevenue=cents(profit.netRevenue),sign=doc.role==='credit-note'?-1n:1n;
    const raw=doc.items.map(item=>cents(lineTotal(item.quantity,item.unitPrice))),rawTotal=raw.reduce((sum,value)=>sum+value,0n);
    const scopedItems=items.filter(saved=>sameEvidenceScope(saved,doc));
    let allocatedRevenue=0n,allocatedOverhead=0n;const overhead=cents(profit.shippingCost)+cents(profit.otherCost);
    doc.items.forEach((item,index)=>{
      const last=index===doc.items.length-1;
      const revenue=last?netRevenue-allocatedRevenue:roundDivide(netRevenue*(raw[index]??0n),rawTotal||1n);allocatedRevenue+=revenue;
      // Allocate overhead to every line, including unknown-cost lines, before
      // deciding whether its own profit is reportable. Otherwise a later costed
      // product can inherit the missing-cost product's overhead.
      const share=last?overhead-allocatedOverhead:roundDivide(overhead*(raw[index]??0n),rawTotal||1n);
      allocatedOverhead+=share;
      const unitCost=item.unitCost?.trim();let itemCost:bigint|null=null,missing=0;
      const validLineCost=Boolean(unitCost&&isNonNegativeDecimalInput(unitCost));
      if(validLineCost&&profit.invalidInternalCostFields===0){
        const q=decimalToScaled(item.quantity,4),u=decimalToScaled(unitCost!,12);itemCost=roundDivide(q*u,100_000_000_000_000n)*sign+share;
      }else if(!validLineCost)missing=1;
      rows.push({doc,item,saved:findSavedItemMatch(scopedItems,item),revenue,cost:itemCost,missing});
    });
    void totals;
  }
  return rows;
}

export function productProfitabilityRows(documents:LourexDocument[],items:SavedItem[]):ProfitabilityDimensionRow[]{
  const map=new Map<string,{id:string;label:string;currency:string;bucket:Bucket}>();
  for(const row of lineAllocations(documents,items)){const id=row.saved?.id||`unmatched:${row.item.descriptionEn||row.item.descriptionAr}`,label=row.saved?(row.saved.descriptionEn||row.saved.descriptionAr||row.saved.sku||'Product'):(row.item.descriptionEn||row.item.descriptionAr||'Unmatched product');add(map,id,label,row.doc.currency,row.doc.id,row.revenue,row.cost,row.missing,row.saved?'':'No saved-product match; attribution is limited to the invoice line.');}
  return output(map);
}
export function categoryProfitabilityRows(documents:LourexDocument[],items:SavedItem[]):ProfitabilityDimensionRow[]{
  const map=new Map<string,{id:string;label:string;currency:string;bucket:Bucket}>();
  for(const row of lineAllocations(documents,items)){const category=(row.saved?.category||'').trim()||'Uncategorized';add(map,category.toLowerCase(),category,row.doc.currency,row.doc.id,row.revenue,row.cost,row.missing,row.saved?'':'Unmatched lines are kept as Uncategorized.');}
  return output(map);
}
function supplierForLine(row:LineAllocation,purchases:PurchaseRecord[],suppliers:Supplier[]):{id:string;label:string}|null{
  if(!row.saved)return null;
  const purchase=[...purchases].filter(p=>p.status==='posted'&&isIsoDate(p.date)&&p.date<=row.doc.issueDate
    &&sameEvidenceScope(p,row.doc)&&sameEvidenceScope(p,row.saved!)
    &&Boolean(p.supplierSnapshot?.sourceSupplierId?.trim())&&p.items.some(line=>line.savedItemId===row.saved!.id))
    .sort((a,b)=>b.date.localeCompare(a.date)||b.postedAt.localeCompare(a.postedAt))[0];
  const id=purchase?.supplierSnapshot?.sourceSupplierId;if(!id)return null;const live=suppliers.find(s=>s.id===id&&sameEvidenceScope(s,purchase)),label=live?.nameEn||live?.nameAr||purchase?.supplierSnapshot?.nameEn||purchase?.supplierSnapshot?.nameAr||'Supplier';return{id,label};
}
export function supplierProfitabilityRows(documents:LourexDocument[],items:SavedItem[],purchases:PurchaseRecord[],suppliers:Supplier[]):ProfitabilityDimensionRow[]{
  const map=new Map<string,{id:string;label:string;currency:string;bucket:Bucket}>();
  for(const row of lineAllocations(documents,items)){const supplier=supplierForLine(row,purchases,suppliers);add(map,supplier?.id||'unattributed',supplier?.label||'Unattributed',row.doc.currency,row.doc.id,row.revenue,row.cost,row.missing,supplier?'Attributed from the latest posted purchase for the matched product on or before the invoice date.':'No qualifying posted purchase evidence; supplier is intentionally left unattributed.');}
  return output(map);
}
