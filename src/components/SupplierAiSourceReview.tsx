import type { Supplier } from '../types.js';
import { isArabic, t } from '../lib/i18n.js';
import { readSpreadsheetFile, spreadsheetSheetsAsText } from '../lib/spreadsheet-reader.js';
import { resumeVaultSession } from '../storage/vault.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { SUPPLIER_AI_FIELDS, findSupplierDuplicateCandidates, normalizeSupplierAiProposal, supplierAiFieldLabel, supplierFromAiProposal, type SupplierAiProposal, type SupplierDuplicateCandidate } from '../lib/supplier-ai-capture.js';
import { Button, Icon, Modal, Select } from './UI.js';

const MAX_BINARY_BYTES=2_600_000;
const MAX_SPREADSHEET_BYTES=12_000_000;
const MAX_TEXT_CHARS=120_000;
type Stage='reading'|'analyzing'|'review'|'saving'|'done'|'error';
type AiPayload={kind:'text'|'file';mimeType:string;text?:string;data?:string};
interface Props{file:File;onDone:()=>void;}
interface State{stage:Stage;proposal:SupplierAiProposal|null;matches:SupplierDuplicateCandidate[];selectedMatchId:string;model:string;error:string;savedLabel:string;}

function bytesToBase64(buffer:ArrayBuffer):string{const bytes=new Uint8Array(buffer);let binary='';const chunk=0x8000;for(let offset=0;offset<bytes.length;offset+=chunk)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+chunk,bytes.length)));return btoa(binary);}
async function payloadForFile(file:File):Promise<AiPayload>{
  const name=file.name.toLowerCase();
  if(name.endsWith('.xlsx')||name.endsWith('.xls')||name.endsWith('.csv')){if(file.size>MAX_SPREADSHEET_BYTES)throw new Error(t('This spreadsheet is larger than 12 MB.','حجم الجدول أكبر من 12 MB.'));const sheets=await readSpreadsheetFile(file);const text=spreadsheetSheetsAsText(sheets,MAX_TEXT_CHARS);if(!text.trim())throw new Error(t('The spreadsheet has no readable supplier data.','الجدول لا يحتوي بيانات مورد قابلة للقراءة.'));return{kind:'text',mimeType:'text/csv',text};}
  if(name.endsWith('.txt')){if(file.size>1_000_000)throw new Error(t('This text source is too large.','مصدر النص كبير جدًا.'));const text=(await file.text()).slice(0,MAX_TEXT_CHARS);if(!text.trim())throw new Error(t('The text source is empty.','مصدر النص فارغ.'));return{kind:'text',mimeType:'text/plain',text};}
  const mime=file.type||(name.endsWith('.pdf')?'application/pdf':name.endsWith('.png')?'image/png':/\.jpe?g$/.test(name)?'image/jpeg':name.endsWith('.webp')?'image/webp':'');if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime))throw new Error(t('Use PDF, image, Excel, CSV or text.','استخدم PDF أو صورة أو Excel أو CSV أو نص.'));if(file.size>MAX_BINARY_BYTES)throw new Error(t('Reduce this PDF/image below 2.6 MB for safe AI analysis.','خفّض PDF/الصورة لأقل من 2.6 MB للتحليل الآمن.'));return{kind:'file',mimeType:mime,data:bytesToBase64(await file.arrayBuffer())};
}
function supplierName(supplier:Supplier):string{return(supplier.nameEn||supplier.nameAr||supplier.contactPerson||t('Unnamed supplier','مورد بلا اسم')).trim();}
function reasonLabel(reason:SupplierDuplicateCandidate['reasons'][number]):string{const labels={commercialRegistration:t('Commercial registration','السجل التجاري'),vatTaxNumber:t('VAT / Tax number','الرقم الضريبي'),email:t('Email','البريد الإلكتروني'),phone:t('Phone','الهاتف'),nameEn:t('English name','الاسم الإنجليزي'),nameAr:t('Arabic name','الاسم العربي')};return labels[reason];}

export class SupplierAiSourceReview extends React.Component<Props,State>{
  private abort:AbortController|null=null;
  state:State={stage:'reading',proposal:null,matches:[],selectedMatchId:'',model:'',error:'',savedLabel:''};
  componentDidMount():void{void this.analyze();}
  componentWillUnmount():void{this.abort?.abort();}
  private analyze=async()=>{
    try{const payload=await payloadForFile(this.props.file);this.setState({stage:'analyzing',error:''});const controller=new AbortController();this.abort=controller;const response=await fetch('/api/supplier-capture-ai',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice'},body:JSON.stringify({fileName:this.props.file.name,...payload}),signal:controller.signal});let body:any={};try{body=await response.json();}catch{}if(!response.ok)throw new Error(String(body?.message||t('LOUREX could not analyze this supplier source.','تعذر على LOUREX تحليل مصدر المورد.')));const proposal=normalizeSupplierAiProposal(body.proposal);const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before reviewing supplier matches.','افتح قفل LOUREX قبل مراجعة مطابقة الموردين.'));const candidate=supplierFromAiProposal(proposal);const matches=findSupplierDuplicateCandidates(resumed.vault.suppliers,candidate);this.setState({stage:'review',proposal,matches,selectedMatchId:matches[0]?.supplier.id||'',model:String(body.model||'LOUREX AI'),error:''});}
    catch(error){if(this.abort?.signal.aborted)return;this.setState({stage:'error',error:error instanceof Error?error.message:String(error)});}finally{this.abort=null;}
  };
  private save=async(updateExisting:boolean)=>{
    const proposal=this.state.proposal;if(!proposal||this.state.stage==='saving')return;this.setState({stage:'saving',error:''});
    try{const next=await mutateVaultSafely(vault=>{const existing=updateExisting?vault.suppliers.find(item=>item.id===this.state.selectedMatchId):undefined;const supplier=supplierFromAiProposal(proposal,existing);if(!supplier.nameEn.trim()&&!supplier.nameAr.trim())throw new Error(t('A supplier name is required before saving.','يلزم اسم مورد قبل الحفظ.'));const suppliers=existing?vault.suppliers.map(item=>item.id===existing.id?supplier:item):[...vault.suppliers,supplier];return{...vault,suppliers};});const supplier=updateExisting?next.suppliers.find(item=>item.id===this.state.selectedMatchId):next.suppliers.at(-1);this.setState({stage:'done',savedLabel:supplier?t(`${supplierName(supplier)} saved`,`تم حفظ ${supplierName(supplier)}`):t('Supplier saved','تم حفظ المورد')});}
    catch(error){this.setState({stage:'review',error:error instanceof Error?error.message:String(error)});}
  };
  private close=()=>{if(this.state.stage==='reading'||this.state.stage==='analyzing'||this.state.stage==='saving')return;this.props.onDone();};
  render():any{
    const proposal=this.state.proposal,arabic=isArabic();
    return <Modal open title={t('AI Supplier Capture','إضافة مورد بالذكاء الاصطناعي')} size="lg" onClose={this.close}>
      <div className="supplier-import-shell">
        {(this.state.stage==='reading'||this.state.stage==='analyzing')?<div className="supplier-import-progress" role="status"><span className="supplier-import-icon"><Icon name="bot"/></span><div><p className="eyebrow">{t('Supplier proposal','مقترح مورد')}</p><h3><bdi dir="auto">{this.props.file.name}</bdi></h3><p>{t('Extracting explicit supplier facts only. Nothing is being saved.','يتم استخراج بيانات المورد الصريحة فقط. لا يتم حفظ أي شيء.')}</p></div></div>:null}
        {this.state.stage==='review'&&proposal?<>
          <div className="product-import-mapping-note"><Icon name="lock"/><span>{t('Review every field before saving. LOUREX never merges a possible duplicate automatically.','راجع كل حقل قبل الحفظ. لا يقوم LOUREX بدمج مورد مكرر محتمل تلقائيًا.')}</span></div>
          <div role="table" aria-label={t('Extracted supplier fields','حقول المورد المستخرجة')}>{SUPPLIER_AI_FIELDS.map(key=>{const row=proposal.fields[key];return <div role="row" key={key} style={{padding:'8px 0'}}><strong>{supplierAiFieldLabel(key,arabic)}</strong><span style={{display:'block'}}><bdi dir="auto">{row.value||'—'}</bdi></span><small>{row.value?`${t('Confidence','الثقة')}: ${Math.round(row.confidence*100)}%${row.sourceFile?` · ${row.sourceFile}`:''}${row.sourcePage?` · ${t('Page','صفحة')} ${row.sourcePage}`:''}`:t('Not found — left unchanged/blank','غير موجود — يبقى كما هو/فارغ')}</small>{row.sourceExcerpt?<small style={{display:'block'}}>“{row.sourceExcerpt}”</small>:null}</div>;})}</div>
          {proposal.conflicts.length?<div role="alert"><strong>{t('Conflicting values need review','قيم متعارضة تحتاج مراجعة')}</strong><ul>{proposal.conflicts.map(conflict=><li key={conflict.field}>{supplierAiFieldLabel(conflict.field,arabic)}: {conflict.values.map(value=>value.value).join(' / ')}</li>)}</ul></div>:null}
          {this.state.matches.length?<div><strong>{t('Possible existing supplier found','تم العثور على مورد موجود محتمل')}</strong><p>{t('Choose update or create new. No automatic merge will happen.','اختر تحديث الموجود أو إنشاء جديد. لن يحدث دمج تلقائي.')}</p><Select value={this.state.selectedMatchId} onChange={(event:any)=>this.setState({selectedMatchId:event.target.value})}>{this.state.matches.map(match=><option key={match.supplier.id} value={match.supplier.id}>{supplierName(match.supplier)} — {match.reasons.map(reasonLabel).join(', ')}</option>)}</Select></div>:<p>{t('No likely duplicate found from CR, VAT, phone, email or normalized names.','لم يتم العثور على تكرار محتمل عبر السجل أو الضريبة أو الهاتف أو البريد أو الأسماء.')}</p>}
          <div className="ta-customer-modal-actions"><Button onClick={this.close}>{t('Cancel','إلغاء')}</Button>{this.state.matches.length?<Button disabled={!this.state.selectedMatchId} onClick={()=>void this.save(true)}>{t('Confirm Update Existing','تأكيد تحديث الموجود')}</Button>:null}<Button variant="primary" onClick={()=>void this.save(false)}>{t('Confirm Create Supplier','تأكيد إنشاء المورد')}</Button></div>
        </>:null}
        {this.state.stage==='saving'?<div className="supplier-import-progress" role="status"><span className="supplier-import-icon"><Icon name="upload"/></span><div><h3>{t('Saving confirmed supplier…','حفظ المورد المؤكد…')}</h3><p>{t('Only the reviewed supplier master record is being changed.','يتم تغيير سجل المورد الذي تمت مراجعته فقط.')}</p></div></div>:null}
        {this.state.stage==='done'?<div className="product-import-complete"><div><Icon name="check" size={30}/></div><h3>{this.state.savedLabel}</h3><Button variant="primary" onClick={this.close}>{t('Done','تم')}</Button></div>:null}
        {this.state.stage==='error'?<div><div className="inline-error" role="alert">{this.state.error}</div><Button onClick={this.close}>{t('Close','إغلاق')}</Button></div>:null}
        {this.state.error&&this.state.stage!=='error'?<div className="inline-error" role="alert">{this.state.error}</div>:null}
      </div>
    </Modal>;
  }
}
