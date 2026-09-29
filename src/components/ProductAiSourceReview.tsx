import type { SavedItem, VaultPayload } from '../types.js';
import { t } from '../lib/i18n.js';
import { makeId } from '../lib/id.js';
import { normalizeSavedItemIdentity, normalizeSavedItemSku } from '../lib/saved-items.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { Button, Icon, Modal } from './UI.js';

const MAX_BINARY_BYTES=2_600_000;
const MAX_TEXT_BYTES=1_000_000;
const MAX_TEXT_CHARS=120_000;

type ProductDraftItem={
  sku:string;descriptionEn:string;descriptionAr:string;hsCode:string;origin:string;packing:string;unit:string;
  salePrice:string;saleCurrency:string;unitCost:string;costCurrency:string;category:string;notes:string;
};
type ProductSourceDraft={sourceCurrency:string;notes:string;items:ProductDraftItem[]};
type Stage='analyzing'|'review'|'saving'|'done'|'error';
interface Props{file:File;onDone:()=>void;}
interface State{stage:Stage;draft:ProductSourceDraft|null;model:string;error:string;selected:boolean[];savedCount:number;}

function bytesToBase64(buffer:ArrayBuffer):string{
  const bytes=new Uint8Array(buffer);let binary='';const chunk=0x8000;
  for(let offset=0;offset<bytes.length;offset+=chunk)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+chunk,bytes.length)));
  return btoa(binary);
}
function mimeFor(file:File):string{
  const name=file.name.toLowerCase();
  return file.type||(name.endsWith('.txt')?'text/plain':name.endsWith('.pdf')?'application/pdf':name.endsWith('.png')?'image/png':/\.jpe?g$/.test(name)?'image/jpeg':name.endsWith('.webp')?'image/webp':'');
}
function matchingItem(items:SavedItem[],row:ProductDraftItem):SavedItem|undefined{
  const sku=normalizeSavedItemSku(row.sku||'');
  if(sku){const bySku=items.find(item=>normalizeSavedItemSku(item.sku??'')===sku);if(bySku)return bySku;}
  const en=normalizeSavedItemIdentity(row.descriptionEn||''),ar=normalizeSavedItemIdentity(row.descriptionAr||'');
  return items.find(item=>(en&&normalizeSavedItemIdentity(item.descriptionEn)===en)||(ar&&normalizeSavedItemIdentity(item.descriptionAr)===ar));
}
function displayName(row:ProductDraftItem):string{return row.descriptionEn||row.descriptionAr||row.sku||t('Unnamed product','صنف بلا اسم');}
function mergeProduct(existing:SavedItem|undefined,row:ProductDraftItem,sourceCurrency:string):SavedItem{
  const now=new Date().toISOString();
  const saleCurrency=(row.saleCurrency||sourceCurrency||existing?.lastCurrency||'').toUpperCase();
  const costCurrency=(row.costCurrency||sourceCurrency||existing?.lastCostCurrency||existing?.lastCurrency||'').toUpperCase();
  const explicitSale=Boolean(row.salePrice&&saleCurrency);
  const explicitCost=Boolean(row.unitCost&&costCurrency);
  return {
    id:existing?.id??makeId('product'),
    createdAt:existing?.createdAt??now,
    updatedAt:now,
    sku:row.sku||existing?.sku||'',
    descriptionEn:row.descriptionEn||existing?.descriptionEn||'',
    descriptionAr:row.descriptionAr||existing?.descriptionAr||'',
    hsCode:row.hsCode||existing?.hsCode||'',
    origin:row.origin||existing?.origin||'',
    packing:row.packing||existing?.packing||'',
    unit:row.unit||existing?.unit||'PCS',
    lastUnitPrice:explicitSale?row.salePrice:(existing?.lastUnitPrice||''),
    lastCurrency:explicitSale?saleCurrency:(existing?.lastCurrency||saleCurrency),
    lastUnitCost:explicitCost?row.unitCost:(existing?.lastUnitCost||''),
    lastCostCurrency:explicitCost?costCurrency:(existing?.lastCostCurrency||''),
    usageCount:existing?.usageCount??0,
    lastUsedAt:existing?.lastUsedAt||now,
    category:row.category||existing?.category||'',
    tags:[...(existing?.tags??[])],
    favorite:Boolean(existing?.favorite),
    archived:Boolean(existing?.archived)
  };
}
function applyDraft(vault:VaultPayload,draft:ProductSourceDraft,selected:boolean[]):VaultPayload{
  const next=[...vault.savedItems];
  draft.items.forEach((row,index)=>{
    if(!selected[index])return;
    const existing=matchingItem(next,row);
    const merged=mergeProduct(existing,row,draft.sourceCurrency);
    if(existing){const at=next.findIndex(item=>item.id===existing.id);if(at>=0)next[at]=merged;}
    else next.push(merged);
  });
  return {...vault,savedItems:next};
}

export class ProductAiSourceReview extends React.Component<Props,State>{
  private abort:AbortController|null=null;
  state:State={stage:'analyzing',draft:null,model:'',error:'',selected:[],savedCount:0};
  componentDidMount():void{void this.analyze();}
  componentWillUnmount():void{this.abort?.abort();}

  private analyze=async()=>{
    const file=this.props.file;const mimeType=mimeFor(file);const isText=mimeType==='text/plain';
    if(!isText&&!['application/pdf','image/png','image/jpeg','image/webp'].includes(mimeType)){this.setState({stage:'error',error:t('This AI review accepts PDF, image or pasted text product sources.','تقبل هذه المراجعة PDF أو الصور أو نص المنتجات الملصق.')});return;}
    if(isText&&file.size>MAX_TEXT_BYTES){this.setState({stage:'error',error:t('This text source is too large for AI review.','مصدر النص كبير جدًا للمراجعة بالذكاء الاصطناعي.')});return;}
    if(!isText&&file.size>MAX_BINARY_BYTES){this.setState({stage:'error',error:t('Reduce this PDF/image below 2.6 MB for safe AI analysis.','خفّض حجم PDF/الصورة لأقل من 2.6 MB للتحليل الآمن.')});return;}
    const controller=new AbortController();this.abort=controller;
    try{
      const payload=isText?{kind:'text',fileName:file.name,mimeType:'text/plain',text:(await file.text()).slice(0,MAX_TEXT_CHARS)}:{kind:'file',fileName:file.name,mimeType,data:bytesToBase64(await file.arrayBuffer())};
      const response=await fetch('/api/product-source-ai',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice'},body:JSON.stringify(payload),signal:controller.signal});
      let body:any={};try{body=await response.json();}catch{}
      if(!response.ok)throw new Error(String(body?.message||t('LOUREX could not read this product source.','تعذر على LOUREX قراءة مصدر المنتجات.')));
      const draft=body.draft as ProductSourceDraft;
      this.setState({stage:'review',draft,model:String(body.model||'LOUREX AI'),selected:draft.items.map(()=>true),error:''});
    }catch(error){if(controller.signal.aborted)return;this.setState({stage:'error',error:error instanceof Error?error.message:String(error)});}finally{if(this.abort===controller)this.abort=null;}
  };
  private toggle=(index:number)=>{const selected=[...this.state.selected];selected[index]=!selected[index];this.setState({selected});};
  private save=async()=>{
    const draft=this.state.draft;if(!draft||this.state.stage==='saving')return;
    const count=this.state.selected.filter(Boolean).length;if(!count)return;
    this.setState({stage:'saving',error:''});
    try{await mutateVaultSafely(vault=>applyDraft(vault,draft,this.state.selected));this.setState({stage:'done',savedCount:count});}
    catch(error){this.setState({stage:'review',error:error instanceof Error?error.message:String(error)});}
  };
  private close=()=>{if(this.state.stage==='saving'||this.state.stage==='analyzing')return;this.props.onDone();};

  render():any{
    const draft=this.state.draft;const selectedCount=this.state.selected.filter(Boolean).length;
    return <Modal open title={t('AI Product Source Review','مراجعة مصدر المنتجات بالذكاء الاصطناعي')} size="xl" onClose={this.close}>
      <div className="product-import-shell">
        {this.state.stage==='analyzing'?<div className="product-import-progress" role="status"><span className="product-import-progress-icon"><Icon name="bot"/></span><div><p className="eyebrow">{t('Reading product source','قراءة مصدر المنتجات')}</p><h3><bdi dir="auto">{this.props.file.name}</bdi></h3><small>{t('Extracting explicit product facts only. Nothing is being saved.','يتم استخراج حقائق المنتجات الصريحة فقط. لا يتم حفظ أي شيء.')}</small></div></div>:null}
        {this.state.stage==='review'&&draft?<>
          <div className="product-import-file-summary"><span className="product-import-file-icon"><Icon name="file"/></span><div><strong><bdi dir="auto">{this.props.file.name}</bdi></strong><small>{draft.items.length} {t('products found','منتجًا تم العثور عليه')} · {this.state.model}</small></div></div>
          <div className="product-import-mapping-note"><Icon name="lock"/><span>{t('Review before saving. This import changes product master data only — never stock, inventory movements, accounting or issued documents.','راجع قبل الحفظ. هذا الاستيراد يغيّر بيانات الأصناف الرئيسية فقط — ولا يغيّر المخزون أو الحركات أو المحاسبة أو المستندات الصادرة.')}</span></div>
          {draft.notes?<p><bdi dir="auto">{draft.notes}</bdi></p>:null}
          <div className="product-import-table-wrap"><table className="product-import-table"><thead><tr><th></th><th>SKU</th><th>{t('Product','الصنف')}</th><th>{t('Unit','الوحدة')}</th><th>{t('Sale price','سعر البيع')}</th><th>{t('Purchase cost','تكلفة الشراء')}</th><th>{t('Details','التفاصيل')}</th></tr></thead><tbody>{draft.items.map((row,index)=><tr key={`${row.sku}-${index}`}><td><input type="checkbox" checked={Boolean(this.state.selected[index])} onChange={()=>this.toggle(index)} aria-label={t(`Import ${displayName(row)}`,`استيراد ${displayName(row)}`)}/></td><td><code><bdi dir="ltr">{row.sku||'—'}</bdi></code></td><td><strong><bdi dir="auto">{displayName(row)}</bdi></strong>{row.descriptionEn&&row.descriptionAr?<small style={{display:'block'}}><bdi dir="auto">{row.descriptionAr}</bdi></small>:null}</td><td>{row.unit||'PCS'}</td><td>{row.salePrice?<bdi dir="ltr">{row.salePrice} {row.saleCurrency||draft.sourceCurrency}</bdi>:'—'}</td><td>{row.unitCost?<bdi dir="ltr">{row.unitCost} {row.costCurrency||draft.sourceCurrency}</bdi>:'—'}</td><td><small><bdi dir="auto">{[row.category,row.packing,row.origin,row.hsCode?`HS ${row.hsCode}`:''].filter(Boolean).join(' · ')||'—'}</bdi></small></td></tr>)}</tbody></table></div>
          <div className="product-import-footer"><Button onClick={this.close}>{t('Cancel','إلغاء')}</Button><Button variant="primary" icon="check" disabled={!selectedCount} onClick={()=>void this.save()}>{t(`Confirm ${selectedCount} products`,`تأكيد ${selectedCount} صنف`)}</Button></div>
        </>:null}
        {this.state.stage==='saving'?<div className="product-import-progress" role="status"><span className="product-import-progress-icon"><Icon name="upload"/></span><div><h3>{t('Saving confirmed product changes…','حفظ تغييرات المنتجات المؤكدة…')}</h3><small>{t('Only the reviewed product master records are being changed.','يتم تغيير سجلات المنتجات الرئيسية التي تمت مراجعتها فقط.')}</small></div></div>:null}
        {this.state.stage==='done'?<div className="product-import-complete"><div><Icon name="check" size={30}/></div><h3>{t(`${this.state.savedCount} products saved`,`تم حفظ ${this.state.savedCount} صنف`)}</h3><Button variant="primary" onClick={this.close}>{t('Done','تم')}</Button></div>:null}
        {this.state.stage==='error'?<div><div className="inline-error product-import-error" role="alert">{this.state.error}</div><div className="product-import-footer"><span/><Button onClick={this.close}>{t('Close','إغلاق')}</Button></div></div>:null}
        {this.state.error&&this.state.stage!=='error'?<div className="inline-error product-import-error" role="alert">{this.state.error}</div>:null}
      </div>
    </Modal>;
  }
}
