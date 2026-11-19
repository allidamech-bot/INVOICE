import type {PurchaseRecord,PurchaseTaxDetails} from '../types.js';
import {decimalToScaled} from './money.js';
import {isIsoDate} from './id.js';
export function purchaseTaxDraft(mode:PurchaseTaxDetails['mode']):PurchaseTaxDetails{
 return {mode,invoiceReference:'',vat:mode==='tax'?'':'0.00',deductibleVat:'0.00'};
}
function amountValid(v:unknown):v is string{return typeof v==='string'&&/^\d{1,18}(?:\.\d{1,2})?$/.test(v);}
export function purchaseTaxValid(p:Pick<PurchaseRecord,'purchaseTax'>):boolean{
 const t=p.purchaseTax;if(t===undefined)return true;
 if(!t||typeof t!=='object'||!['ordinary','tax'].includes(t.mode)||typeof t.invoiceReference!=='string'||t.invoiceReference.length>200||!amountValid(t.vat)||!amountValid(t.deductibleVat))return false;
 const v=decimalToScaled(t.vat,2),d=decimalToScaled(t.deductibleVat,2);
 if(t.mode==='ordinary')return v===0n&&d===0n&&t.invoiceReference==='';
 return t.invoiceReference.trim().length>0&&d<=v;
}
export function assertPurchaseTax(p:Pick<PurchaseRecord,'purchaseTax'>):void{if(!purchaseTaxValid(p))throw new Error('Invalid purchase tax amounts or missing supplier tax invoice reference.');}
export function purchaseTaxAmounts(p:Pick<PurchaseRecord,'purchaseTax'>):{vat:bigint;deductible:bigint;nonDeductible:bigint}{
 const t=p.purchaseTax;
 // Safe draft preview. Invalid values cannot be saved, posted, restored or
 // included in reports. Do not temporarily subtract more than recorded VAT.
 const vat=t?.mode==='tax'&&amountValid(t.vat)?decimalToScaled(t.vat,2):0n;
 const raw=t?.mode==='tax'&&amountValid(t.deductibleVat)?decimalToScaled(t.deductibleVat,2):0n;
 const deductible=raw<=vat?raw:0n;
 return {vat,deductible,nonDeductible:vat-deductible};
}
export function assertUniquePurchaseTaxReference(p:PurchaseRecord,purchases:readonly PurchaseRecord[]):void{
 if(p.purchaseTax?.mode!=='tax')return;
 const ref=p.purchaseTax.invoiceReference.trim().toLocaleLowerCase(),supplier=p.supplierSnapshot?.sourceSupplierId;
 if(purchases.some(x=>x.id!==p.id&&x.status!=='reversed'&&x.purchaseTax?.mode==='tax'&&(x.workspaceId||'default')===(p.workspaceId||'default')&&x.supplierSnapshot?.sourceSupplierId===supplier&&x.purchaseTax.invoiceReference.trim().toLocaleLowerCase()===ref))
  throw new Error('This supplier tax invoice reference is already recorded.');
}
const money=(n:bigint)=>{const a=n<0n?-n:n;return (n<0n?'-':'')+String(a/100n)+'.'+String(a%100n).padStart(2,'0');};
export function recordedPurchaseTaxRows(purchases:readonly PurchaseRecord[],from:string,to:string){
 const rows:{id:string;date:string;number:string;reference:string;supplier:string;currency:string;kind:'purchase'|'reversal';vat:string;deductibleVat:string;nonDeductibleVat:string}[]=[];
 if(!isIsoDate(to)||from&&(!isIsoDate(from)||from>to))return rows;
 const seen=new Set<string>();
 for(const p of purchases){
  if(p.purchaseTax?.mode!=='tax'||!purchaseTaxValid(p)||!isIsoDate(p.date)||p.status!=='posted'&&p.status!=='reversed'||!p.currency.trim())continue;
  const key=JSON.stringify([p.workspaceId||'default',p.branchId||'main',p.id]);
  if(seen.has(key))throw new Error('Duplicate source in recorded purchase VAT register.');seen.add(key);
  const posted=p.postedAt?.slice(0,10)||p.date,reversed=p.reversedAt?.slice(0,10)||'';
  if(!isIsoDate(posted)||p.status==='reversed'&&(!isIsoDate(reversed)||reversed<posted))throw new Error('Invalid purchase VAT chronology.');
  if(posted>to)continue;
  const values=purchaseTaxAmounts(p),currency=p.currency.trim().toUpperCase();
  const add=(date:string,kind:'purchase'|'reversal',sign:bigint)=>{
   if(date>to||from&&date<from)return;
   rows.push({id:p.id+':'+kind,date,kind,number:p.number,reference:p.purchaseTax!.invoiceReference,supplier:p.supplierSnapshot?.nameAr||p.supplierSnapshot?.nameEn||'',currency,vat:money(sign*values.vat),deductibleVat:money(sign*values.deductible),nonDeductibleVat:money(sign*values.nonDeductible)});
  };
  add(p.date,'purchase',1n);
  if(p.status==='reversed')add(reversed,'reversal',-1n);
 }
 return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function recordedPurchaseTaxReport(purchases:readonly PurchaseRecord[],from:string,to:string){
 const sums=new Map<string,{vat:bigint;deductible:bigint;nonDeductible:bigint;count:number}>();
 for(const p of recordedPurchaseTaxRows(purchases,from,to)){
  const row=sums.get(p.currency)??{vat:0n,deductible:0n,nonDeductible:0n,count:0};
  row.vat+=decimalToScaled(p.vat,2);row.deductible+=decimalToScaled(p.deductibleVat,2);row.nonDeductible+=decimalToScaled(p.nonDeductibleVat,2);row.count++;sums.set(p.currency,row);
 }
 return [...sums].sort(([a],[b])=>a.localeCompare(b)).map(([currency,row])=>({currency,vat:money(row.vat),deductibleVat:money(row.deductible),nonDeductibleVat:money(row.nonDeductible),count:row.count}));
}
