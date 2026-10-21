import type { ProductAiDraftItem } from './product-ai-review.js';

export const MAX_PRODUCT_AI_FILES=4;
export const MAX_PRODUCT_AI_TOTAL_BYTES=16_000_000;
export const MAX_PRODUCT_AI_COMBINED_ROWS=120;

export interface ProductAiSourceDraft {
  sourceCurrency:string;
  notes:string;
  items:ProductAiDraftItem[];
}
export interface ProductAiNamedDraft { fileName:string; draft:ProductAiSourceDraft; }
export interface ProductAiCombinedSourceReview {
  draft:ProductAiSourceDraft;
  rowFiles:string[];
  sourceNames:string[];
}
/** No generative merge: this is a lossless, order-preserving, fail-closed
 * concatenation of complete per-file product extraction results. */
export function combineProductAiSourceDrafts(inputs:ProductAiNamedDraft[]):ProductAiCombinedSourceReview {
  if(!Array.isArray(inputs)||!inputs.length||inputs.length>MAX_PRODUCT_AI_FILES)
    throw new Error('Select 1–4 complete product sources for one review.');
  const result:ProductAiDraftItem[]=[],rowFiles:string[]=[],sourceNames:string[]=[];
  for(const input of inputs){
    if(!input||typeof input.fileName!=='string'||!input.fileName.trim()||!input.draft||!Array.isArray(input.draft.items)||!input.draft.items.length)
      throw new Error('SOURCE_INCOMPLETE: Every selected product file must return an explicit nonempty product list.');
    const name=input.fileName.trim();
    if(input.draft.items.length>MAX_PRODUCT_AI_COMBINED_ROWS||result.length+input.draft.items.length>MAX_PRODUCT_AI_COMBINED_ROWS)
      throw new Error('SOURCE_INCOMPLETE: The combined product review exceeds 120 rows. Split the source batch; nothing was saved.');
    const currency=String(input.draft.sourceCurrency||'').trim().toUpperCase();
    if(currency&&!/^[A-Z]{3}$/.test(currency))throw new Error('SOURCE_INCOMPLETE: A source has an invalid currency.');
    for(const raw of input.draft.items){
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('SOURCE_INCOMPLETE: Invalid product row in a source.');
      const row={...raw};
      // In a mixed-currency batch, carry the original source currency only
      // for amounts which actually appear. Never assume a default USD/EUR.
      if(row.salePrice&&!row.saleCurrency)row.saleCurrency=currency;
      if(row.unitCost&&!row.costCurrency)row.costCurrency=currency;
      result.push(row);
      rowFiles.push(name);
    }
    sourceNames.push(name);
  }
  return {draft:{sourceCurrency:'',items:result,notes:inputs.map(({fileName,draft})=>draft.notes?fileName+': '+draft.notes:'').filter(Boolean).join('\n')},rowFiles,sourceNames};
}
