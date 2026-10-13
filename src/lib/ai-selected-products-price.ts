import type {VaultPayload} from '../types.js';
import type {ConversationKernel} from './ai-conversation-kernel.js';
import {decimalToScaled,isNonNegativeDecimalInput,normalizeDecimalInput} from './money.js';
import {AI_BULK_PRODUCT_LIMIT,prepareAiBulkProductUpdate,type AiBulkProductBatch} from './ai-product-bulk-update.js';
import {setExactRecordSelection} from './ai-record-selection.js';

export function requestedSelectedProductRepricing(message:string):string|null{
 const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
 const text=String(message||'').normalize('NFKC').replace(/[٠-٩۰-۹]/gu,c=>String(ar.includes(c)?ar.indexOf(c):fa.indexOf(c)))
  .replace(/[\u064b-\u065f\u0670]/gu,'').trim();
 const match=text.match(/^(خفض|قلل|انقص|نقص|ارفع|زود|زد|increase|raise|reduce|decrease|lower)\s+(?:أسعار|اسعار|أسعارها|اسعارها|سعر|prices?)\s*(?:(?:هذه\s+)?(?:المنتجات|الأصناف|الاصناف|المحددة|المختارة|selected\s+products|these\s+products))?\s*(?:بنسبة\s*|by\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*[%٪][.!؟\s]*$/iu);
 if(!match)return null;
 const percent=normalizeDecimalInput(match[2]!.replace(',','.'));
 if(!isNonNegativeDecimalInput(percent)||decimalToScaled(percent,4)<=0n||decimalToScaled(percent,4)>1000000n)
  throw new Error('A selected price change must be more than zero and no greater than 100%.');
 const increase=/^(?:ارفع|زود|زد|increase|raise)$/iu.test(match[1]!);
 return(increase?'':'-')+percent;
}
/** Source-backed single atomic review for only the explicitly selected product
 * IDs. Price math is exact, retains currency and refuses missing/stale data. */
export function prepareSelectedProductRepricing(kernel:ConversationKernel,vault:VaultPayload,percent:string):AiBulkProductBatch{
 const selection=kernel.selection,ids=selection?.selectedIds||[];
 if(!selection||!ids.length||ids.length>AI_BULK_PRODUCT_LIMIT||
   selection.items.some(row=>row.entityType!=='product'))
   throw new Error('Select 1–120 exact products in the Controller list first.');
 setExactRecordSelection(kernel,vault,selection.id,ids);
 const rate=normalizeDecimalInput(percent);
 const signed=decimalToScaled(rate,4);
 if(!/^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(rate)||
   signed===0n||signed<-1000000n||signed>1000000n)
   throw new Error('Price percentage is outside the safe reviewed range.');
 const multiplier=1000000n+signed;
 const scope=vault.appSettings.activeWorkspaceId||'default';
 const updates=ids.map(id=>{
  const item=vault.savedItems.find(row=>row.id===id&&(row.workspaceId||'default')===scope&&!row.archived);
  if(!item||!/^[A-Z]{3}$/.test(item.lastCurrency||'')||
     !isNonNegativeDecimalInput(item.lastUnitPrice||'')||!item.lastUnitPrice)
    throw new Error('One selected product is missing a valid saved price/currency. No partial changes.');
  const cost=decimalToScaled(item.lastUnitPrice,4);
  const cents=(cost*multiplier+50000000n)/100000000n;
  const value=String(cents/100n)+'.'+String(cents%100n).padStart(2,'0');
  return{itemId:id,patch:{lastUnitPrice:value}};
 });
 return prepareAiBulkProductUpdate(vault,updates);
}
