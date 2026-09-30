import type { PurchaseRecord } from '../types.js';
import { t } from '../lib/i18n.js';
import { readSpreadsheetFile, spreadsheetSheetsAsText } from '../lib/spreadsheet-reader.js';
import { resumeVaultSession } from '../storage/vault.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { buildProcurementDraftContext, type ProcurementDraftComparison } from '../lib/procurement-ai.js';
import { buildAiSupplierPurchaseDraft } from '../lib/ai-supplier-purchase-draft.js';
import type { SupplierImportDraft } from '../lib/supplier-document-import.js';
import { Button, Icon, Modal } from './UI.js';

const MAX_FILES=8;
const MAX_BINARY_BYTES=2_600_000;
const MAX_SPREADSHEET_BYTES=12_000_000;
const MAX_TEXT_CHARS=120_000;
type Stage='pick'|'analyzing'|'review'|'saving'|'done'|'error';
type AiPayload={kind:'text'|'file';mimeType:string;text?:string;data?:string};
interface OfferProposal{fileName:string;draft:SupplierImportDraft;model:string;}
interface Props{launcher?:boolean;}
interface State{open:boolean;stage:Stage;files:File[];offers:OfferProposal[];comparisons:ProcurementDraftComparison[];selectedOfferIndex:number;error:string;savedLabel:string;}

function bytesToBase64(buffer:ArrayBuffer):string{const bytes=new Uint8Array(buffer);let binary='';const chunk=0x8000;for(let offset=0;offset<bytes.length;offset+=chunk)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+chunk,bytes.length)));return btoa(binary);}
async function payloadFor(file:File):Promise<AiPayload>{
  const name=file.name.toLowerCase();
  if(name.endsWith('.xlsx')||name.endsWith('.xls')||name.endsWith('.csv')){if(file.size>MAX_SPREADSHEET_BYTES)throw new Error(t(`${file.name} is larger than 12 MB.`,`الملف ${file.name} أكبر من 12 MB.`));const sheets=await readSpreadsheetFile(file);const text=spreadsheetSheetsAsText(sheets,MAX_TEXT_CHARS);if(!text.trim())throw new Error(t(`${file.name} has no readable supplier-offer data.`,`الملف ${file.name} لا يحتوي بيانات عرض مورد قابلة للقراءة.`));return{kind:'text',mimeType:'text/csv',text};}
  if(name.endsWith('.txt')){const text=(await file.text()).slice(0,MAX_TEXT_CHARS);if(!text.trim())throw new Error(t(`${file.name} is empty.`,`الملف ${file.name} فارغ.`));return{kind:'text',mimeType:'text/plain',text};}
  const mime=file.type||(name.endsWith('.pdf')?'application/pdf':name.endsWith('.png')?'image/png':/\.jpe?g$/.test(name)?'image/jpeg':name.endsWith('.webp')?'image/webp':'');if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime))throw new Error(t(`Unsupported offer file: ${file.name}.`,`نوع ملف العرض غير مدعوم: ${file.name}.`));if(file.size>MAX_BINARY_BYTES)throw new Error(t(`${file.name} is too large for safe AI analysis.`,`الملف ${file.name} كبير للتحليل الآمن.`));return{kind:'file',mimeType:mime,data:bytesToBase64(await file.arrayBuffer())};
}
async function extractOffer(file:File,signal:AbortSignal):Promise<OfferProposal>{const payload=await payloadFor(file);const response=await fetch('/api/supplier-document-ai',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice'},body:JSON.stringify({fileName:file.name,...payload}),signal});let body:any={};try{body=await response.json();}catch{}if(!response.ok||!body?.draft?.items?.length)throw new Error(String(body?.message||t(`No reliable supplier offer lines in ${file.name}.`,`لا توجد بنود عرض مورد موثوقة في ${file.name}.`)));return{fileName:file.name,draft:body.draft as SupplierImportDraft,model:String(body.model||'LOUREX AI')};}
function supplierName(draft:SupplierImportDraft):string{return draft.supplierName||t('Unidentified supplier','مورد غير محدد');}
function noteValue(notes:string,label:string):string{const row=notes.split(/\r?\n/).find(line=>line.toLowerCase().startsWith(`${label.toLowerCase()}:`));return row?row.slice(row.indexOf(':')+1).trim():'';}
function missingOfferFacts(draft:SupplierImportDraft):string[]{const missing:string[]=[];if(!draft.currency.trim())missing.push(t('currency','العملة'));if(draft.items.some(item=>!item.unit.trim()))missing.push(t('item unit','وحدة الصنف'));if(!draft.freight.trim())missing.push(t('freight','الشحن'));if(!draft.duty.trim())missing.push(t('duty','الجمارك'));if(!draft.otherCosts.trim())missing.push(t('other landed costs','تكاليف الوصول الأخرى'));return Array.from(new Set(missing));}

export class ProcurementAiCompare extends React.Component<Props,State>{
  private input:HTMLInputElement|null=null;private abort:AbortController|null=null;
  state:State={open:false,stage:'pick',files:[],offers:[],comparisons:[],selectedOfferIndex:-1,error:'',savedLabel:''};
  componentDidMount():void{window.addEventListener('lourex-ai-open-procurement',this.openFromEvent);}
  componentWillUnmount():void{this.abort?.abort();window.removeEventListener('lourex-ai-open-procurement',this.openFromEvent);}
  private openFromEvent=()=>this.open();
  private open=()=>this.setState({open:true,stage:'pick',files:[],offers:[],comparisons:[],selectedOfferIndex:-1,error:'',savedLabel:''});
  private close=()=>{if(this.state.stage==='analyzing'||this.state.stage==='saving')return;this.abort?.abort();this.setState({open:false});};
  private choose=(files:FileList|null)=>{const next=Array.from(files??[]).slice(0,MAX_FILES);this.setState({files:next,offers:[],comparisons:[],selectedOfferIndex:-1,error:'',stage:'pick'});if(this.input)this.input.value='';};
  private analyze=async()=>{
    if(this.state.files.length<2)return;this.abort?.abort();const controller=new AbortController();this.abort=controller;this.setState({stage:'analyzing',offers:[],comparisons:[],error:''});
    try{
      const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before comparing supplier offers.','افتح قفل LOUREX قبل مقارنة عروض الموردين.'));
      const offers:OfferProposal[]=[];const failures:string[]=[];for(const file of this.state.files){try{offers.push(await extractOffer(file,controller.signal));}catch(error){if(controller.signal.aborted)return;failures.push(`${file.name}: ${error instanceof Error?error.message:String(error)}`);}}
      if(offers.length<2)throw new Error(failures[0]||t('At least two readable supplier offers are required.','يلزم عرضان موردان قابلان للقراءة على الأقل.'));
      const ephemeral:PurchaseRecord[]=[];
      for(const [index,offer] of offers.entries()){
        const purchase=buildAiSupplierPurchaseDraft(offer.draft,[...resumed.vault.purchases,...ephemeral],resumed.vault.suppliers,resumed.vault.savedItems);
        ephemeral.push({...purchase,id:`ai-offer-${index}`,number:`AI-OFFER-${index+1}`});
      }
      const context=buildProcurementDraftContext({...resumed.vault,purchases:[...resumed.vault.purchases.filter(p=>p.status!=='draft'),...ephemeral]});
      this.setState({stage:'review',offers,comparisons:context.comparisons,selectedOfferIndex:-1,error:failures.length?failures.join('\n'):''});
    }catch(error){this.setState({stage:'error',error:error instanceof Error?error.message:String(error)});}finally{this.abort=null;}
  };
  private saveSelected=async()=>{
    const offer=this.state.offers[this.state.selectedOfferIndex];if(!offer||this.state.stage==='saving')return;this.setState({stage:'saving',error:''});
    try{const next=await mutateVaultSafely(vault=>{const purchase=buildAiSupplierPurchaseDraft(offer.draft,vault.purchases,vault.suppliers,vault.savedItems);return{...vault,purchases:[...vault.purchases,purchase]};});const saved=next.purchases.at(-1);this.setState({stage:'done',savedLabel:saved?t(`Purchase draft ${saved.number} saved for review`,`تم حفظ مسودة الشراء ${saved.number} للمراجعة`):t('Purchase draft saved','تم حفظ مسودة الشراء')});}
    catch(error){this.setState({stage:'review',error:error instanceof Error?error.message:String(error)});}
  };
  render():any{return <>
    {this.props.launcher===false?null:<Button icon="items" onClick={this.open}>{t('Compare Supplier Offers','مقارنة عروض الموردين')}</Button>}
    <Modal open={this.state.open} title={t('Procurement AI — Supplier Offer Comparison','ذكاء المشتريات — مقارنة عروض الموردين')} size="xl" onClose={this.close}>
      <div className="supplier-import-shell">
        <input ref={(node:any)=>{this.input=node;}} hidden multiple type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.txt,application/pdf,image/png,image/jpeg,image/webp,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(event:any)=>this.choose(event.target.files)}/>
        {this.state.stage==='pick'?<><p>{t('Select 2–8 supplier quotes. LOUREX extracts facts, compares only same-currency products and never assumes missing landed-cost components. Nothing is saved until you choose one offer.','اختر من 2 إلى 8 عروض موردين. يستخرج LOUREX الحقائق ويقارن المنتجات ضمن نفس العملة فقط ولا يفترض تكاليف وصول مفقودة. لا يتم حفظ شيء حتى تختار عرضًا.')}</p><div className="ta-customer-modal-actions"><Button icon="upload" onClick={()=>this.input?.click()}>{t('Choose Offers','اختر العروض')}</Button><Button variant="primary" disabled={this.state.files.length<2} onClick={()=>void this.analyze()}>{t('Analyze & Compare','تحليل ومقارنة')}</Button></div>{this.state.files.length?<ul>{this.state.files.map(file=><li key={`${file.name}-${file.size}`}>{file.name}</li>)}</ul>:null}</>:null}
        {this.state.stage==='analyzing'?<div className="supplier-import-progress" role="status"><span className="supplier-import-icon"><Icon name="bot"/></span><div><h3>{t('Reading supplier offers…','جارٍ قراءة عروض الموردين…')}</h3><p>{t('AI extracts facts; LOUREX performs product/currency comparisons locally. Landed cost is ranked only when its components are explicit.','الذكاء الاصطناعي يستخرج الحقائق؛ LOUREX ينفذ مقارنة المنتجات والعملات محليًا. لا يتم ترتيب تكلفة الوصول إلا عندما تكون مكوناتها صريحة.')}</p></div></div>:null}
        {this.state.stage==='review'?<><div className="product-import-mapping-note"><Icon name="lock"/><span>{t('Lowest cost is an observation, not a supplier recommendation. Review missing facts, payment terms, MOQ, lead time and product-match confidence before selecting an offer.','أقل تكلفة هي ملاحظة وليست توصية بمورد. راجع البيانات المفقودة وشروط الدفع والحد الأدنى والمهلة وثقة المطابقة قبل اختيار العرض.')}</span></div>
          <div className="product-import-table-wrap"><table className="product-import-table"><thead><tr><th></th><th>{t('Supplier / file','المورد / الملف')}</th><th>{t('Currency','العملة')}</th><th>{t('Items','الأصناف')}</th><th>{t('Terms / completeness','الشروط / اكتمال البيانات')}</th></tr></thead><tbody>{this.state.offers.map((offer,index)=>{const missing=missingOfferFacts(offer.draft);return <tr key={`${offer.fileName}-${index}`}><td><input type="radio" name="supplier-offer" checked={this.state.selectedOfferIndex===index} onChange={()=>this.setState({selectedOfferIndex:index})}/></td><td><strong>{supplierName(offer.draft)}</strong><small style={{display:'block'}}>{offer.fileName}</small></td><td>{offer.draft.currency||t('Missing','مفقودة')}</td><td>{offer.draft.items.length}</td><td><small>{offer.draft.paymentTerms||t('Payment terms not stated','شروط الدفع غير مذكورة')}{noteValue(offer.draft.notes,'MOQ')?<span style={{display:'block'}}>MOQ: {noteValue(offer.draft.notes,'MOQ')}</span>:null}{noteValue(offer.draft.notes,'Lead time')?<span style={{display:'block'}}>{t('Lead','مهلة')}: {noteValue(offer.draft.notes,'Lead time')}</span>:null}{missing.length?<span style={{display:'block'}}>{t('Needs review','تحتاج مراجعة')}: {missing.join(' · ')}</span>:null}</small></td></tr>;})}</tbody></table></div>
          <h3>{t('Comparable products','المنتجات القابلة للمقارنة')}</h3>{this.state.comparisons.length?<div className="product-import-table-wrap"><table className="product-import-table"><thead><tr><th>{t('Product','الصنف')}</th><th>{t('Currency','العملة')}</th><th>{t('Offer','العرض')}</th><th>{t('Unit Cost','تكلفة الوحدة')}</th><th>{t('Landed Cost','تكلفة الوصول')}</th><th>{t('Freight / Duty / Other','الشحن / الرسوم / أخرى')}</th><th>{t('Match','المطابقة')}</th></tr></thead><tbody>{this.state.comparisons.flatMap(comparison=>comparison.offers.map((offer,index)=><tr key={`${comparison.key}-${offer.purchaseId}`}><td>{index===0?<><strong>{comparison.itemName}</strong>{comparison.warning?<small style={{display:'block'}}>{comparison.warning}</small>:null}</>:''}</td><td>{comparison.currency}</td><td>{offer.supplierName}</td><td><bdi dir="ltr">{offer.unitCost}</bdi>{offer.purchaseId===comparison.lowestUnitCostPurchaseId?<small style={{display:'block'}}>{t('Lowest observed','الأقل المرصود')}</small>:null}</td><td>{offer.landedCostComplete?<><bdi dir="ltr">{offer.landedUnitCost}</bdi>{offer.purchaseId===comparison.lowestLandedCostPurchaseId?<small style={{display:'block'}}>{t('Lowest landed','أقل وصول')}</small>:null}</>:<small>{t('Not ranked — landed costs incomplete','غير مرتبة — تكاليف الوصول غير مكتملة')}</small>}</td><td><small>{offer.freight||'—'} / {offer.duty||'—'} / {offer.otherCosts||'—'}</small></td><td>{Math.round(offer.matchConfidence*100)}%{offer.matchBasis==='likely-description'?<small style={{display:'block'}}>{t('Likely name match','مطابقة اسم محتملة')}</small>:null}</td></tr>))}</tbody></table></div>:<p>{t('No same-product, same-currency comparison pair was found. The offers are still available for manual review.','لم يتم العثور على زوج قابل للمقارنة لنفس المنتج ونفس العملة. تبقى العروض متاحة للمراجعة اليدوية.')}</p>}
          <div className="ta-customer-modal-actions"><Button onClick={this.close}>{t('Cancel','إلغاء')}</Button><Button variant="primary" disabled={this.state.selectedOfferIndex<0} onClick={()=>void this.saveSelected()}>{t('Confirm Selected → Purchase Draft','تأكيد المختار ← مسودة شراء')}</Button></div></>:null}
        {this.state.stage==='saving'?<div className="supplier-import-progress" role="status"><span className="supplier-import-icon"><Icon name="upload"/></span><div><h3>{t('Saving selected Purchase Draft…','حفظ مسودة الشراء المختارة…')}</h3><p>{t('Missing facts remain blank for Operations review. No posting, inventory movement or accounting entry is created.','تبقى البيانات المفقودة فارغة لمراجعتها في العمليات. لا يتم إنشاء ترحيل أو حركة مخزون أو قيد محاسبي.')}</p></div></div>:null}
        {this.state.stage==='done'?<div className="product-import-complete"><Icon name="check" size={30}/><h3>{this.state.savedLabel}</h3><Button variant="primary" onClick={this.close}>{t('Done','تم')}</Button></div>:null}
        {this.state.stage==='error'?<div><div className="inline-error" role="alert">{this.state.error}</div><Button onClick={this.close}>{t('Close','إغلاق')}</Button></div>:this.state.error?<div className="inline-error" role="alert">{this.state.error}</div>:null}
      </div>
    </Modal>
  </>;}
}
