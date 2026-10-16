import type {VaultPayload,SavedItem} from '../types.js';
import {scopeVault} from './workspaces.js';
import {aiProductArchived} from './ai-business.js';

/** A bounded, read-only excerpt of actual scoped catalog products for dialogue.
 * The count makes any incomplete excerpt explicit. Product facts cannot grant
 * tool execution or approval; they are only evidence for an answer. */
const normalize=(s:string)=>String(s||'').normalize('NFKC')
  .replace(/[\u064b-\u065f\u0670\u0640]/gu,'').replace(/[إأٱآ]/gu,'ا')
  .replace(/ى/gu,'ي').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLocaleLowerCase();
const STOP=new Set(['شو','ايش','ما','ماذا','هي','هو','هل','كم','بدي','عندي','عنا','عندنا','في','من','على','عن','ال','هذه','هذا','بدنا','سعر','اسعار','أسعار','البيع','بيع','المنتج','منتج','المنتجات','منتجات','الاصناف','اصناف','الأصناف','صنف','قائمة','عرض','سعر','كل','جميع','الكل','الموجودة','الموجود','المتاح','المتاحة','ابحث','دور','اظهر','اعرض','اريد','price','prices','show','find','list','all','items','products','product','the','for','with','what','our','are','available','catalog']);
const t=(s:unknown,max:number)=>String(s||'').normalize('NFKC')
  .replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const terms=(query:string)=>normalize(query).split(' ').filter(x=>x.length>=3&&!STOP.has(x)).slice(0,7);
function score(item:SavedItem,words:string[]):number{
  if(!words.length)return 0;
  const fields=normalize([item.descriptionAr,item.descriptionEn,item.sku,item.category,...(item.tags||[])].join(' '));
  const haystack=' '+fields+' ';
  return words.reduce((sum,w)=>sum+(haystack.includes(' '+w+' ')?8:fields.includes(w)?3:0),0);
}
export interface DialogueCatalogRecord{
 id:string;sku:string;name:string;nameAr:string;unit:string;price:string;currency:string;category:string;
}
export interface DialogueCatalog{
 total:number;matching:number;shown:number;incomplete:boolean;rows:DialogueCatalogRecord[];
}
export function scopedDialogueCatalog(vault:VaultPayload,query:string,focusId='',max=80):DialogueCatalog{
  const items=scopeVault(vault).savedItems.filter(x=>!aiProductArchived(x));
  const words=terms(query);
  const ranked=items.map((item,index)=>({item,index,score:score(item,words)}))
    .sort((a,b)=>(b.item.id===focusId?1:0)-(a.item.id===focusId?1:0)||b.score-a.score||a.index-b.index);
  const matches=ranked.filter(x=>x.score>0);
  // When matches exist, they take precedence. Otherwise show examples without
  // falsely claiming an absent matching brand is present in the catalog.
  const selected=(matches.length?matches:ranked).slice(0,Math.max(1,Math.min(80,max)));
  const rows=selected.map(({item}):DialogueCatalogRecord=>({
    id:t(item.id,120),sku:t(item.sku,80),
    name:t(item.descriptionEn||item.descriptionAr||item.sku||item.id,130),
    nameAr:t(item.descriptionAr,130),unit:t(item.unit,30),
    price:t(item.lastUnitPrice,30),currency:t(item.lastCurrency,4),
    category:t(item.category,70)
  }));
  return{total:items.length,matching:matches.length,shown:rows.length,
    incomplete:(matches.length?matches.length:items.length)>rows.length,rows};
}
