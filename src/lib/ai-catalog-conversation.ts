import type {SavedItem,VaultPayload} from '../types.js';
import {aiProductArchived} from './ai-business.js';

const normalized=(s:string):string=>String(s||'').normalize('NFKC')
 .replace(/[\u064b-\u065f\u0670\u0640]/gu,'').replace(/[إأٱآ]/gu,'ا')
 .replace(/ى/gu,'ي').replace(/ؤ/gu,'و').replace(/ئ/gu,'ي')
 .toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const safe=(s:unknown):string=>String(s||'').normalize('NFKC')
 .replace(/[\u0000-\u001f\u007f]/g,' ').replace(/[*_\x60\[\]<>]/g,' ')
 .replace(/\s+/g,' ').trim().slice(0,125);
const title=(row:SavedItem):string=>safe(row.descriptionAr||row.descriptionEn||row.sku||row.id);
const itemTokens=(row:SavedItem):string[]=>[row.descriptionAr,row.descriptionEn,row.sku,row.category,...(row.tags||[])]
 .flatMap(v=>normalized(v||'').split(' ').filter(Boolean));
function smallDistance(a:string,b:string):number {
 if(Math.abs(a.length-b.length)>2)return 3;
 let last=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const next=[i];
  for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]!+1,last[j]!+1,last[j-1]!+(a[i-1]===b[j-1]?0:1));
  last=next;
 }
 return last[b.length]!;
}
/** Call only with the already scoped VaultPayload. Suggestions do not choose
 * an SKU, authorize saving, invent a price or mutate accounting records. */
export function catalogProductCandidates(vault:VaultPayload,query:string){
 const items=vault.savedItems.filter(row=>!aiProductArchived(row));
 const wanted=normalized(query),exact:SavedItem[]=[],similar:SavedItem[]=[];
 if(wanted.length>=2)for(const item of items){
  const tokens=itemTokens(item),joined=' '+tokens.join(' ')+' ';
  if(joined.includes(' '+wanted+' ')){exact.push(item);continue;}
  if(wanted.length>=4&&tokens.some(word=>word.length>=4&&smallDistance(word,wanted)<=Math.min(2,Math.floor(wanted.length/4))))similar.push(item);
 }
 return{exact,similar,examples:items.slice(0,8),total:items.length};
}
/** Route incomplete product-family quote requests through a real catalog
 * conversation; complete/quantity-bearing requests retain their normal tools. */
export function requestedCatalogQuoteFamily(message:string):string|null{
 const s=String(message||'').normalize('NFKC').replace(/\s+/g,' ').trim();
 if(!s||s.length>400||/[\d\u0660-\u0669\u06f0-\u06f9]/u.test(s))return null;
 if(/(?:لا|بدون)\s+(?:ت?\S+\s+){0,2}عرض\s*سعر/iu.test(s))return null;
 const match=s.match(/(?:عرض\s*سعر|quotation|price\s*quote|proforma)\s*(?:ل|عن|من|for\s+|of\s+)?\s*(?:ال)?(?:منتجات|أصناف|اصناف|منتج|صنف|products?|items?)\s+(.+)$/iu);
 if(!match)return null;
 const group=match[1]!.replace(/[.!؟،,]+$/u,'').trim();
 if(group.length<2||group.length>75||/(?:\b(?:with|and|including)\b|\s(?:مع|والعميل|بسعر|بكمية|بكميه|لكل)\s)/iu.test(group))return null;
 return group;
}
function lines(items:SavedItem[],max=10):string{
 return items.slice(0,max).map(item=>'- '+title(item)+(item.sku?' (SKU: '+safe(item.sku)+')':'')).join('\n');
}
export function naturalCatalogQuoteReply(vault:VaultPayload,query:string,language:'ar'|'en'):string{
 const {exact,similar,examples,total}=catalogProductCandidates(vault,query);
 const ar=language==='ar',name=safe(query);
 if(!total)return ar?'أكيد، بقدر أجهز لك عرض سعر، لكن ما ظهرت عندي أصناف محفوظة في الشركة الحالية. تأكد من الشركة المختارة؛ ما رح أخترع منتجات أو أسعار.':
 'I can prepare a quotation, but no saved products are visible in the current company. Check the selected workspace; I will not invent products or prices.';
 if(exact.length)return(ar?'لقيت '+exact.length+' صنفًا في الكتالوج يحمل اسم «'+name+'»:\n':
 'I found '+exact.length+' saved products matching "'+name+'":\n')+lines(exact)+
 (exact.length>10?(ar?'\nوفي أصناف أخرى بنفس الاسم.':'\nMore matches are available.'): '')+
 (ar?'\n\nكم كرتون بدك من كل نوع؟ بعدها نجهز مسودة العرض للمعاينة والتحرير قبل الموافقة.':
 '\n\nHow many cartons of each variant? Then we can prepare an editable quotation for your review.');
 if(similar.length)return(ar?'اسم «'+name+'» ما طابق منتجًا بشكل مؤكد، لكن لقيت أسماء قريبة في الكتالوج:\n':
 'No confirmed exact match for "'+name+'", but these catalog names look similar:\n')+
 lines(similar)+(ar?'\n\nهل تقصد هذه الأصناف؟ ما رح أضيفها للعرض بدون تأكيدك.':
 '\n\nDid you mean these products? I will not add them without your confirmation.');
 return(ar?'ما لقيت تطابقًا واضحًا لاسم «'+name+'». لكن في '+total+' صنفًا محفوظًا بالشركة الحالية، منها:\n':
 'No clear match for "'+name+'". The current catalog has '+total+' saved products, including:\n')+
 lines(examples,8)+(total>8?(ar?'\nوفي أصناف إضافية.':'\nMore products are available.'): '')+
 (ar?'\n\nأي صنف أو مجموعة تقصد؟ أقدر أعرض لك البقية ونكمل العرض، بدون ما أفترض أن هذه بدائل عن المطلوب.':
 '\n\nWhich product or family did you mean? I can show the rest and continue the quote without assuming these are substitutes.');
}
