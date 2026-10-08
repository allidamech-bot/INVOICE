import type {VaultPayload,SavedItem} from '../types.js';
import {isNonNegativeDecimalInput,normalizeDecimalInput} from './money.js';
import {normalizeSavedItemIdentity,normalizeSavedItemSku,findSavedItemDuplicate} from './saved-items.js';
import {parseAiProductGroupPriceIntent} from './ai-product-group-price.js';
import {requestedAiProductSkuGeneration,applyAiProductSourceImport,type AiProductSourceImportBatch,type AiProductSourceImportRow} from './ai-product-source-import.js';

type Target={kind:'all'}|{kind:'nameWeight';name:string;grams:string}|{kind:'sku';sku:string};
type DraftChange={kind:'category'|'price'|'skuGeneration';target:Target;value?:string;currency?:string};
const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
function digits(text:string):string{return[...text.normalize('NFKC')].map(c=>ar.includes(c)?String(ar.indexOf(c)):fa.includes(c)?String(fa.indexOf(c)):c).join('');}
function clean(text:unknown,max=160):string{
  if(typeof text!=='string'||text.length>max*2)throw new Error('Invalid staged product edit.');
  return text.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
}
function categoryCommand(text:string):DraftChange|null{
  const s=digits(text).trim();
  // Require an explicit ALL selector. A SKU or named-group update is handled
  // separately so that unsupported broad language cannot touch the wrong rows.
  const match=s.match(/^(?:اجعل|خلي|خلّي|غيّر|غير|عدّل|عدل|حط|اضف|أضف)\s+(?:تصنيف|فئة|المجموعة|مجموعة)\s+(?:كل|جميع|كافة)\s+(?:الأصناف|الاصناف|المنتجات|السلع)\s+(?:إلى|الى|=|هو|يكون)?\s*(.{2,90})$/iu)
    ||s.match(/^(?:set|change|update)\s+(?:the\s+)?categor(?:y|ies)\s+(?:of|for)\s+all\s+(?:products|items)\s+(?:to|as|=)\s+(.{2,90})$/iu);
  if(!match)return null;
  const value=clean(match[1]??'',80);
  if(!value||/[\n\r%{}<>]/.test(value))throw new Error('Specify a single valid category name.');
  return{kind:'category',target:{kind:'all'},value};
}
function skuPriceCommand(text:string):DraftChange|null{
  const s=digits(text).trim();
  const m=s.match(/^(?:set|change|update)\s+(?:the\s+)?(?:price\s+(?:of|for)\s+)?sku\s+([a-z0-9._/-]{2,80})\s+(?:price\s+)?(?:to|at|=)\s+(\d+(?:[.,]\d{1,2})?)\s*(usd|sar|eur|try)?$/iu)
    ||s.match(/^(?:غير|غيّر|خلي|خلّي|عدل|عدّل|اجعل)\s+(?:سعر\s+)?(?:sku|كود)\s+([a-z0-9._/-]{2,80})\s+(?:السعر\s+|إلى\s+|الى\s+|بسعر\s+|=)?(\d+(?:[.,]\d{1,2})?)\s*(usd|sar|eur|try)?$/iu);
  if(!m)return null;
  return{kind:'price',target:{kind:'sku',sku:m[1]!},value:m[2]!.replace(',','.'),currency:m[3]?.toUpperCase()};
}
function matchName(item:SavedItem,name:string):boolean{
  const needle=normalizeSavedItemIdentity(name).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  if(needle.length<2)return false;
  return [item.descriptionEn,item.descriptionAr].some(title=>{
    const hay=normalizeSavedItemIdentity(title||'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    return (' '+hay+' ').includes(' '+needle+' ');
  });
}
function matchGrams(item:SavedItem,grams:string):boolean{
  const number=Number(grams);
  if(!Number.isInteger(number)||number<1||number>5000)return false;
  const matcher=new RegExp('(?:^|[^0-9])0*'+number+'\\s*(?:g|gr|grams?|غرام|جرام)(?=$|[^\\p{L}\\p{N}])','iu');
  return[item.descriptionEn,item.descriptionAr,item.packing].some(value=>matcher.test(value||''));
}
function predicate(item:SavedItem,target:Target):boolean{
  if(target.kind==='all')return true;
  if(target.kind==='sku')return normalizeSavedItemSku(item.sku||'')===normalizeSavedItemSku(target.sku);
  return matchName(item,target.name)&&matchGrams(item,target.grams);
}
/** Only exact, explicit local user instructions can alter the unsaved draft. */
export function parseAiProductDraftCommand(message:string):DraftChange|null{
  const s=digits(String(message||'')).trim();
  if(!s||s.length>400||/(?:do not|don't|never|preview only|only preview|لا\s*(?:تغير|تغيّر|تعدل|تعدّل|تضف|تولد|تسجل)|بدون\s*(?:تعديل|تغيير)|فقط\s*اعرض|معاينة\s*فقط)/iu.test(s))return null;
  if(requestedAiProductSkuGeneration(s))return{kind:'skuGeneration',target:{kind:'all'}};
  const category=categoryCommand(s);if(category)return category;
  const bySku=skuPriceCommand(s);if(bySku)return bySku;
  const group=parseAiProductGroupPriceIntent(s);
  if(group)return{kind:'price',target:{kind:'nameWeight',name:group.nameContains,grams:group.sizeGrams},value:group.unitPrice,currency:group.currency};
  return null;
}
function stagePreview(row:AiProductSourceImportRow):AiProductSourceImportRow{
  const item={...row.item};
  return{fileName:row.fileName,item,preview:{
    itemId:item.id,name:item.descriptionEn||item.descriptionAr,sku:item.sku||'',before:{},
    after:{sku:item.sku||'',descriptionEn:item.descriptionEn,descriptionAr:item.descriptionAr,
      category:item.category||'',lastUnitPrice:item.lastUnitPrice,lastCurrency:item.lastCurrency,
      lastUnitCost:item.lastUnitCost||'',lastCostCurrency:item.lastCostCurrency||'',
      packing:item.packing,unit:item.unit,origin:item.origin,hsCode:item.hsCode}
  }};
}
/** Copy-on-write draft. All 1–120 rows are preserved, reviewed and revalidated.
 * No persistence occurs until the final, explicit tool.execute approval. */
export function reviseAiProductImportDraft(vault:VaultPayload,batch:AiProductSourceImportBatch,message:string):AiProductSourceImportBatch{
  if(!batch||!Array.isArray(batch.rows)||!batch.rows.length||batch.rows.length>120)
    throw new Error('No safe pending product catalog to edit.');
  if((vault.appSettings.activeWorkspaceId||'default')!==batch.workspaceId)
    throw new Error('The active company changed. Reattach your catalog before editing.');
  // Reject stale duplicates and tampered approval previews before editing.
  applyAiProductSourceImport(vault,batch);
  const cmd=parseAiProductDraftCommand(message);
  if(!cmd)throw new Error('Specify an exact draft edit: all-products category, product name and grams with a price, exact SKU price, or missing SKU generation.');
  const rows=batch.rows.map(stagePreview);
  const matches=rows.filter(row=>predicate(row.item,cmd.target));
  if(!matches.length)throw new Error('No staged product matches the requested name, pack weight or SKU. Nothing changed.');
  if(cmd.target.kind==='sku'&&matches.length!==1)throw new Error('Ambiguous staged SKU; no changes prepared.');
  if(cmd.kind==='category'){
    const value=clean(cmd.value,80);
    if(!value||value.length>80||rows.every(row=>row.item.category===value))throw new Error('Category is invalid or unchanged.');
    for(const row of matches){row.item.category=value;row.preview=stagePreview(row).preview;}
  }else if(cmd.kind==='price'){
    const price=clean(cmd.value,32);
    if(!isNonNegativeDecimalInput(price)||!/^\d+(?:\.\d{1,2})?$/.test(price))throw new Error('Specify a valid non-negative sale price, up to two decimals.');
    const fixed=normalizeDecimalInput(price);
    const currency=cmd.currency?clean(cmd.currency,4).toUpperCase():'';
    if(currency&&!/^[A-Z]{3}$/.test(currency))throw new Error('Invalid sale currency.');
    if(!currency&&matches.some(row=>!/^[A-Z]{3}$/.test(row.item.lastCurrency||'')))
      throw new Error('One or more staged prices lack a currency. Supply an explicit currency.');
    const currencies=new Set(matches.map(row=>row.item.lastCurrency));
    if(!currency&&currencies.size!==1)throw new Error('Staged product currencies differ. Specify one currency explicitly.');
    const nextCurrency=currency||matches[0]!.item.lastCurrency;
    if(matches.some(row=>row.item.lastUnitPrice===fixed&&row.item.lastCurrency===nextCurrency))
      throw new Error('One or more matched products already have that price. Review the group.');
    for(const row of matches){row.item.lastUnitPrice=fixed;row.item.lastCurrency=nextCurrency;row.preview=stagePreview(row).preview;}
  }else{
    const occupied=new Set([...vault.savedItems.filter(item=>(item.workspaceId||'default')===batch.workspaceId),...rows.map(row=>row.item)]
      .map(item=>normalizeSavedItemSku(item.sku||'')).filter(Boolean));
    let index=1,changed=0;
    for(const row of rows){
      if(normalizeSavedItemSku(row.item.sku||''))continue;
      let sku='';
      do{
        if(index>999999)throw new Error('Draft SKU sequence exhausted.');
        sku='SKU-'+String(index++).padStart(4,'0');
      }while(occupied.has(normalizeSavedItemSku(sku)));
      occupied.add(normalizeSavedItemSku(sku));row.item.sku=sku;row.preview=stagePreview(row).preview;changed++;
    }
    if(!changed)throw new Error('All staged products already have SKU values.');
  }
  const updated={workspaceId:batch.workspaceId,rows};
  applyAiProductSourceImport(vault,updated);
  return updated;
}
