import type { SavedItem } from '../types.js';
import { normalizeSavedItemIdentity, normalizeSavedItemSku } from './saved-items.js';

export type ProductAiClassification='existing-match'|'likely-match'|'new-product'|'duplicate-candidate'|'needs-review';
export interface ProductAiDraftItem {
  sku:string;descriptionEn:string;descriptionAr:string;brand:string;hsCode:string;origin:string;packing:string;cartonQuantity:string;unit:string;
  salePrice:string;saleCurrency:string;unitCost:string;costCurrency:string;category:string;notes:string;
}
export interface ProductAiDiff {field:string;oldValue:string;newValue:string;}
export interface ProductAiRowReview {classification:ProductAiClassification;matchId:string;matchLabel:string;matchConfidence:number;diff:ProductAiDiff[];defaultSelected:boolean;reason:string;}
function norm(value:string):string{return normalizeSavedItemIdentity(value||'');}
function tokens(value:string):Set<string>{return new Set(norm(value).split(' ').filter(token=>token.length>=2));}
function similarity(left:string,right:string):number{const a=tokens(left),b=tokens(right);if(!a.size||!b.size)return 0;let common=0;for(const token of a)if(b.has(token))common+=1;return common/(a.size+b.size-common);}
function label(item:SavedItem):string{return(item.descriptionEn||item.descriptionAr||item.sku||'Product').trim();}
function exactCandidates(items:SavedItem[],row:ProductAiDraftItem):SavedItem[]{const sku=normalizeSavedItemSku(row.sku||''),en=norm(row.descriptionEn),ar=norm(row.descriptionAr);const found=new Map<string,SavedItem>();for(const item of items){if(sku&&normalizeSavedItemSku(item.sku??'')===sku)found.set(item.id,item);if(en&&norm(item.descriptionEn)===en)found.set(item.id,item);if(ar&&norm(item.descriptionAr)===ar)found.set(item.id,item);}return[...found.values()];}
function likelyCandidate(items:SavedItem[],row:ProductAiDraftItem):{item:SavedItem|null;confidence:number}{let best:SavedItem|null=null,bestScore=0;for(const item of items){const score=Math.max(similarity(row.descriptionEn,item.descriptionEn),similarity(row.descriptionAr,item.descriptionAr),similarity(row.descriptionEn,item.descriptionAr),similarity(row.descriptionAr,item.descriptionEn));if(score>bestScore){best=item;bestScore=score;}}return best&&bestScore>=.72?{item:best,confidence:Math.min(.88,.58+bestScore*.4)}:{item:null,confidence:0};}
function resolvedSaleCurrency(row:ProductAiDraftItem,sourceCurrency:string):string{return(row.saleCurrency||sourceCurrency).trim().toUpperCase();}
function resolvedCostCurrency(row:ProductAiDraftItem,sourceCurrency:string):string{return(row.costCurrency||sourceCurrency).trim().toUpperCase();}
function financialCurrencyMissing(row:ProductAiDraftItem,sourceCurrency:string):boolean{return Boolean((row.salePrice&&!resolvedSaleCurrency(row,sourceCurrency))||(row.unitCost&&!resolvedCostCurrency(row,sourceCurrency)));}
function incomingValue(row:ProductAiDraftItem,field:string,sourceCurrency:string):string{
  const saleCurrency=resolvedSaleCurrency(row,sourceCurrency),costCurrency=resolvedCostCurrency(row,sourceCurrency);
  if(field==='lastUnitPrice')return row.salePrice&&saleCurrency?row.salePrice:'';
  if(field==='lastCurrency')return row.salePrice&&saleCurrency?saleCurrency:'';
  if(field==='lastUnitCost')return row.unitCost&&costCurrency?row.unitCost:'';
  if(field==='lastCostCurrency')return row.unitCost&&costCurrency?costCurrency:'';
  return String((row as any)[field]??'').trim();
}
function buildDiff(item:SavedItem,row:ProductAiDraftItem,sourceCurrency:string):ProductAiDiff[]{const fields:Array<[string,string]>=[['sku','SKU'],['descriptionEn','Description EN'],['descriptionAr','Description AR'],['hsCode','HS Code'],['origin','Origin'],['packing','Packing'],['unit','Unit'],['category','Category'],['lastUnitPrice','Sale price'],['lastCurrency','Sale currency'],['lastUnitCost','Unit cost'],['lastCostCurrency','Cost currency']];const result:ProductAiDiff[]=[];for(const [field,labelText] of fields){const next=incomingValue(row,field,sourceCurrency);if(!next)continue;const old=String((item as any)[field]??'').trim();if(old!==next)result.push({field:labelText,oldValue:old,newValue:next});}return result;}
export function reviewProductAiRow(items:SavedItem[],row:ProductAiDraftItem,sourceCurrency:string):ProductAiRowReview{
  const active=items.filter(item=>!item.archived);const exact=exactCandidates(active,row);
  if(exact.length>1)return{classification:'duplicate-candidate',matchId:'',matchLabel:exact.slice(0,3).map(label).join(' / '),matchConfidence:1,diff:[],defaultSelected:false,reason:'multiple-existing-records-match-explicit-identifiers'};
  if(exact.length===1){const match=exact[0]!;return{classification:'existing-match',matchId:match.id,matchLabel:label(match),matchConfidence:1,diff:buildDiff(match,row,sourceCurrency),defaultSelected:false,reason:financialCurrencyMissing(row,sourceCurrency)?'exact-match-financial-value-missing-currency':'exact-sku-or-normalized-name-match'};}
  const likely=likelyCandidate(active,row);if(likely.item)return{classification:'likely-match',matchId:likely.item.id,matchLabel:label(likely.item),matchConfidence:likely.confidence,diff:buildDiff(likely.item,row,sourceCurrency),defaultSelected:false,reason:financialCurrencyMissing(row,sourceCurrency)?'likely-match-financial-value-missing-currency':'similar-normalized-description'};
  if(!row.sku.trim()&&!row.descriptionEn.trim()&&!row.descriptionAr.trim())return{classification:'needs-review',matchId:'',matchLabel:'',matchConfidence:0,diff:[],defaultSelected:false,reason:'missing-product-identity'};
  if(!row.unit.trim())return{classification:'needs-review',matchId:'',matchLabel:'',matchConfidence:0,diff:[],defaultSelected:false,reason:'new-product-missing-required-unit'};
  if(financialCurrencyMissing(row,sourceCurrency))return{classification:'needs-review',matchId:'',matchLabel:'',matchConfidence:0,diff:[],defaultSelected:false,reason:'new-product-financial-value-missing-currency'};
  return{classification:'new-product',matchId:'',matchLabel:'',matchConfidence:1,diff:[],defaultSelected:true,reason:'no-existing-match'};
}
export function reviewProductAiRows(items:SavedItem[],rows:ProductAiDraftItem[],sourceCurrency:string):ProductAiRowReview[]{return rows.map(row=>reviewProductAiRow(items,row,sourceCurrency));}
