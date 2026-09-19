import type { PurchaseRecord, SavedItem, Supplier, UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';
import { createPurchase, createPurchaseItem, supplierSnapshotFrom } from '../lib/operations.js';
import { normalizeSavedItemIdentity, normalizeSavedItemSku } from '../lib/saved-items.js';
import { extractSupplierDraftFromSheets, type SupplierImportDraft } from '../lib/supplier-document-import.js';
import { readSpreadsheetFile, spreadsheetSheetsAsText } from '../lib/spreadsheet-reader.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { Button, Icon, Modal } from './UI.js';

const MAX_BINARY_BYTES=2_600_000;
const MAX_SPREADSHEET_BYTES=12_000_000;
const MAX_TEXT_CHARS=120_000;

type ImportStage='idle'|'reading'|'extracting'|'ai'|'ready'|'saving'|'saved'|'error';
type AiPayload={kind:'text'|'file';mimeType:string;text?:string;data?:string};

interface Props{language:UiLanguage;}
interface State{open:boolean;stage:ImportStage;error:string;fileName:string;draft:SupplierImportDraft|null;model:string;}

function bytesToBase64(buffer:ArrayBuffer):string{
  const bytes=new Uint8Array(buffer);let binary='';const chunk=0x8000;
  for(let offset=0;offset<bytes.length;offset+=chunk)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+chunk,bytes.length)));
  return btoa(binary);
}

async function binaryPayload(file:File):Promise<AiPayload>{
  const name=file.name.toLowerCase();
  const mime=file.type||(name.endsWith('.pdf')?'application/pdf':'');
  if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime))throw new Error(t('Use PDF, image, Excel or CSV.','استخدم PDF أو صورة أو Excel أو CSV.'));
  if(file.size>MAX_BINARY_BYTES)throw new Error(t('This PDF/image is too large for safe AI import. Reduce it below 2.6 MB.','ملف PDF/الصورة كبير للاستيراد الآمن. خفّضه لأقل من 2.6 MB.'));
  return {kind:'file',mimeType:mime,data:bytesToBase64(await file.arrayBuffer())};
}

function normalize(value:string):string{return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}

function supplierMatch(suppliers:Supplier[],draft:SupplierImportDraft):Supplier|undefined{
  const name=normalize(draft.supplierName);const tax=normalize(draft.supplierTaxId);
  return suppliers.find(supplier=>(tax&&[supplier.vatTaxNumber,supplier.commercialRegistration].some(value=>normalize(value)===tax))||(name&&[supplier.nameEn,supplier.nameAr].some(value=>normalize(value)===name)));
}

function itemMatch(items:SavedItem[],row:SupplierImportDraft['items'][number]):SavedItem|undefined{
  const sku=normalizeSavedItemSku(row.sku);
  if(sku){const exact=items.find(item=>normalizeSavedItemSku(item.sku??'')===sku);if(exact)return exact;}
  const en=normalizeSavedItemIdentity(row.descriptionEn),ar=normalizeSavedItemIdentity(row.descriptionAr);
  return items.find(item=>(en&&normalizeSavedItemIdentity(item.descriptionEn)===en)||(ar&&normalizeSavedItemIdentity(item.descriptionAr)===ar));
}

export function buildSupplierPurchaseDraft(draft:SupplierImportDraft,purchases:PurchaseRecord[],suppliers:Supplier[],items:SavedItem[],fallbackCurrency:string):PurchaseRecord{
  const matchedSupplier=supplierMatch(suppliers,draft);
  let purchase=createPurchase(purchases,matchedSupplier?[matchedSupplier]:[],draft.currency||matchedSupplier?.defaultCurrency||fallbackCurrency||'USD');
  const now=new Date().toISOString();
  purchase={...purchase,date:draft.date||purchase.date,currency:(draft.currency||purchase.currency).toUpperCase(),supplierSnapshot:matchedSupplier?supplierSnapshotFrom(matchedSupplier):draft.supplierName?{sourceSupplierId:'',nameEn:draft.supplierName,nameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:draft.supplierTaxId,commercialRegistration:''}:null,freight:draft.freight||'0.00',duty:draft.duty||'0.00',otherCosts:draft.otherCosts||'0.00',notes:[draft.documentNumber?`Supplier document: ${draft.documentNumber}`:'',draft.paymentTerms?`Payment terms: ${draft.paymentTerms}`:'',draft.notes].filter(Boolean).join('\n'),status:'draft',updatedAt:now};
  purchase.items=draft.items.map(row=>{
    const saved=itemMatch(items,row);const line=createPurchaseItem(saved);
    return {...line,savedItemId:saved?.id??'',sku:row.sku||saved?.sku||'',descriptionEn:row.descriptionEn||saved?.descriptionEn||'',descriptionAr:row.descriptionAr||saved?.descriptionAr||'',quantity:row.quantity,unit:row.unit||saved?.unit||'PCS',unitCost:row.unitCost,landedUnitCost:'',previousUnitCost:saved?.lastUnitCost??'',previousCostCurrency:saved?.lastCostCurrency??''};
  });
  return purchase;
}

function stageCopy(stage:ImportStage):{title:string;detail:string}{
  if(stage==='reading')return {title:t('Reading file','قراءة الملف'),detail:t('Checking the selected file on this device.','يتم فحص الملف المحدد على هذا الجهاز.')};
  if(stage==='extracting')return {title:t('Extracting local data','استخراج البيانات محليًا'),detail:t('Looking for structured supplier, item, quantity and cost fields.','البحث عن حقول المورد والصنف والكمية والتكلفة.')};
  if(stage==='ai')return {title:t('AI analysis required','يلزم تحليل AI'),detail:t('The file is not a deterministic table. LOUREX AI is preparing a review-only draft.','الملف ليس جدولًا حتميًا. يقوم LOUREX AI بإعداد مسودة للمراجعة فقط.')};
  if(stage==='saving')return {title:t('Saving purchase draft','حفظ مسودة الشراء'),detail:t('No inventory or accounting entries are being posted.','لا يتم ترحيل أي مخزون أو قيود محاسبية.')};
  return {title:'',detail:''};
}

export class SupplierDocumentImport extends React.Component<Props,State>{
  private input:HTMLInputElement|null=null;
  private pendingFile:File|null=null;
  private requestGeneration=0;
  private requestAbort:AbortController|null=null;
  private requestInFlight=false;
  private saveInFlight=false;

  state:State={open:false,stage:'idle',error:'',fileName:'',draft:null,model:''};

  componentWillUnmount():void{this.cancelRequest();}

  private busy=()=>['reading','extracting','ai','saving'].includes(this.state.stage);

  private cancelRequest=()=>{
    this.requestGeneration+=1;
    this.requestAbort?.abort();
    this.requestAbort=null;
    this.requestInFlight=false;
  };

  private openPicker=()=>{
    this.cancelRequest();
    this.pendingFile=null;
    this.setState({open:true,stage:'idle',error:'',fileName:'',draft:null,model:''},()=>this.input?.click());
  };

  private close=()=>{
    if(this.saveInFlight)return;
    this.cancelRequest();
    this.setState({open:false,stage:'idle',error:'',draft:null,fileName:'',model:''});
  };

  private requestAi=async(file:File,payload:AiPayload,generation:number)=>{
    const controller=new AbortController();this.requestAbort=controller;
    const timeout=window.setTimeout(()=>controller.abort(),26000);
    this.setState({stage:'ai'});
    try{
      const response=await fetch('/api/supplier-document-ai',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice'},body:JSON.stringify({fileName:file.name,...payload}),signal:controller.signal});
      let body:any={};try{body=await response.json();}catch{}
      if(!response.ok)throw new Error(String(body?.message||t('Unable to analyze this supplier document.','تعذر تحليل مستند المورد.')));
      if(!body?.draft?.items?.length)throw new Error(t('No reliable purchase lines were found.','لم يتم العثور على بنود شراء موثوقة.'));
      if(generation!==this.requestGeneration||controller.signal.aborted)return;
      this.setState({draft:body.draft as SupplierImportDraft,model:String(body.model||'LOUREX AI'),stage:'ready',error:''});
    }catch(error){
      if(generation!==this.requestGeneration)return;
      const timedOut=controller.signal.aborted;
      this.setState({stage:'error',error:timedOut?t('Analysis took too long. Check the connection and retry; nothing was saved.','استغرق التحليل وقتًا طويلًا. تحقق من الاتصال وأعد المحاولة؛ لم يتم حفظ شيء.'):error instanceof Error?error.message:String(error),draft:null});
    }finally{
      window.clearTimeout(timeout);
      if(this.requestAbort===controller)this.requestAbort=null;
    }
  };

  private choose=async(file:File|null)=>{
    if(!file||this.requestInFlight||this.saveInFlight)return;
    this.pendingFile=file;
    const generation=++this.requestGeneration;
    this.requestInFlight=true;
    this.setState({stage:'reading',error:'',draft:null,fileName:file.name,model:''});
    try{
      const name=file.name.toLowerCase();
      if(name.endsWith('.csv')||name.endsWith('.txt')||name.endsWith('.xlsx')||name.endsWith('.xls')){
        if(file.size>MAX_SPREADSHEET_BYTES)throw new Error(t('This spreadsheet is too large for reliable mobile import. Reduce it below 12 MB.','حجم الجدول كبير للاستيراد الموثوق على الهاتف. خفّضه لأقل من 12 MB.'));
        const sheets=await readSpreadsheetFile(file);
        if(generation!==this.requestGeneration)return;
        await new Promise<void>(resolve=>this.setState({stage:'extracting'},resolve));
        const localDraft=extractSupplierDraftFromSheets(sheets);
        if(localDraft){this.setState({draft:localDraft,model:t('Local spreadsheet parser','محلل الجدول المحلي'),stage:'ready',error:''});return;}
        const text=spreadsheetSheetsAsText(sheets,MAX_TEXT_CHARS);
        if(!text.trim())throw new Error(t('The workbook does not contain readable purchase data.','ملف Excel لا يحتوي بيانات شراء قابلة للقراءة.'));
        await this.requestAi(file,{kind:'text',mimeType:'text/csv',text},generation);
      }else{
        const payload=await binaryPayload(file);
        if(generation!==this.requestGeneration)return;
        await this.requestAi(file,payload,generation);
      }
    }catch(error){
      if(generation===this.requestGeneration)this.setState({stage:'error',error:error instanceof Error?error.message:String(error),draft:null});
    }finally{
      if(generation===this.requestGeneration)this.requestInFlight=false;
      if(this.input)this.input.value='';
    }
  };

  private retry=()=>{if(this.pendingFile&&!this.requestInFlight)void this.choose(this.pendingFile);};

  private saveDraft=async()=>{
    const extracted=this.state.draft;
    if(!extracted||this.saveInFlight)return;
    this.saveInFlight=true;this.setState({stage:'saving',error:''});
    try{
      await mutateVaultSafely(vault=>{
        const purchase=buildSupplierPurchaseDraft(extracted,vault.purchases,vault.suppliers,vault.savedItems,vault.appSettings.smartDefaults.currency||vault.company.defaultCurrency);
        return {...vault,purchases:[...vault.purchases,purchase]};
      });
      this.setState({stage:'saved',draft:null,error:''});
    }catch(error){this.setState({stage:'ready',error:error instanceof Error?error.message:String(error)});}
    finally{this.saveInFlight=false;}
  };

  render():any{
    const draft=this.state.draft;
    const progress=stageCopy(this.state.stage);
    const footer=draft&&this.state.stage==='ready'?<div className="supplier-import-footer"><Button onClick={this.close}>{t('Cancel','إلغاء')}</Button><Button variant="primary" disabled={this.saveInFlight} onClick={()=>void this.saveDraft()}>{t('Confirm & Save Draft','تأكيد وحفظ المسودة')}</Button></div>:this.state.stage==='saved'?<div className="supplier-import-footer"><span/><Button variant="primary" icon="check" onClick={this.close}>{t('Done','تم')}</Button></div>:undefined;
    return <>
      <Button icon="upload" onClick={this.openPicker}>{t('Import Supplier Document','استيراد مستند مورد')}</Button>
      <Modal open={this.state.open} title={t('Supplier Document → Purchase Draft','مستند مورد ← مسودة شراء')} size="lg" onClose={this.close} footer={footer}>
        <div className={`supplier-import-shell stage-${this.state.stage}`} data-supplier-import-stage={this.state.stage} aria-busy={this.busy()}>
          <input ref={(node:any)=>{this.input=node;}} className="supplier-import-file-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onChange={(event:any)=>void this.choose(event.target.files?.[0]??null)}/>
          {this.state.stage==='idle'?<div className="supplier-import-start"><span className="supplier-import-icon"><Icon name="upload"/></span><div><p className="eyebrow">{t('Review-first purchasing','مشتريات تبدأ بالمراجعة')}</p><h3>{t('Create a purchase draft from a supplier file','أنشئ مسودة شراء من ملف المورد')}</h3><p>{t('Excel and CSV are parsed locally first. PDF and images use LOUREX AI. Nothing reaches inventory or accounting until the draft is reviewed and posted from Operations.','يتم تحليل Excel وCSV محليًا أولًا. تستخدم ملفات PDF والصور ذكاء LOUREX. لا يصل شيء إلى المخزون أو المحاسبة حتى تُراجع المسودة وتُرحّل من العمليات.')}</p></div><Button icon="upload" onClick={()=>this.input?.click()}>{t('Choose File','اختر ملفًا')}</Button></div>:null}
          {this.busy()?<div className="supplier-import-progress" role="status"><span className="supplier-import-icon"><Icon name={this.state.stage==='ai'?'items':'file'}/></span><div><p className="eyebrow">{progress.title}</p><h3><bdi dir="auto">{this.state.fileName}</bdi></h3><p>{progress.detail}</p><div className="supplier-import-steps" aria-label={t('Import progress','تقدم الاستيراد')}><span className={['reading','extracting','ai','saving'].includes(this.state.stage)?'complete':''}>{t('File selected','تم اختيار الملف')}</span><span className={['extracting','ai','saving'].includes(this.state.stage)?'complete':''}>{t('Local extraction','استخراج محلي')}</span><span className={this.state.stage==='ai'?'active':this.state.stage==='saving'?'complete':''}>{t('AI if needed','AI عند الحاجة')}</span><span className={this.state.stage==='saving'?'active':''}>{t('Draft review','مراجعة المسودة')}</span></div></div></div>:null}
          {this.state.stage==='error'?<div className="supplier-import-error-state"><span className="supplier-import-icon is-error"><Icon name="x"/></span><div><p className="eyebrow">{t('Import stopped safely','توقف الاستيراد بأمان')}</p><h3>{t('No purchase draft was saved','لم يتم حفظ مسودة شراء')}</h3><p className="inline-error" role="alert">{this.state.error}</p></div><div className="supplier-import-retry-actions"><Button onClick={()=>this.input?.click()}>{t('Choose another file','اختر ملفًا آخر')}</Button><Button variant="primary" icon="refresh" disabled={!this.pendingFile} onClick={this.retry}>{t('Retry','إعادة المحاولة')}</Button></div></div>:null}
          {draft&&this.state.stage==='ready'?<div className="supplier-import-review">
            <div className="supplier-import-review-head"><div><p className="eyebrow">{t('Draft ready for review','المسودة جاهزة للمراجعة')}</p><h3><bdi dir="auto">{draft.supplierName||t('Supplier not identified','لم يتم تحديد المورد')}</bdi></h3><small><bdi dir="auto">{[draft.documentNumber,draft.date,draft.currency].filter(Boolean).join(' · ')||t('Complete missing header details in Operations','أكمل بيانات الرأس الناقصة في العمليات')}</bdi></small></div><span>{this.state.model}</span></div>
            <div className="supplier-import-items">{draft.items.slice(0,40).map((item,index)=><div key={`${item.sku}-${index}`} className="supplier-import-item"><span><strong><bdi dir="auto">{item.descriptionEn||item.descriptionAr||item.sku}</bdi></strong><small><bdi dir="auto">{[item.sku,item.quantity,item.unit].filter(Boolean).join(' · ')}</bdi></small></span><bdi dir="ltr">{item.unitCost} {draft.currency}</bdi></div>)}</div>
            {draft.items.length>40?<small className="supplier-import-more">{t(`${draft.items.length-40} more lines will be included in the draft.`,`سيتم تضمين ${draft.items.length-40} بندًا إضافيًا في المسودة.`)}</small>:null}
            <div className="supplier-import-costs"><strong>{t('Extra costs','التكاليف الإضافية')}</strong><span>{t('Freight','الشحن')}: <bdi dir="ltr">{draft.freight}</bdi></span><span>{t('Duty','الجمارك')}: <bdi dir="ltr">{draft.duty}</bdi></span><span>{t('Other','أخرى')}: <bdi dir="ltr">{draft.otherCosts}</bdi></span></div>
            <div className="supplier-import-safety"><Icon name="lock"/><span>{t('Confirming creates a draft only. Review and edit it in Operations before the separate Post Purchase action can affect inventory.','التأكيد ينشئ مسودة فقط. راجعها وعدّلها في العمليات قبل أن يتمكن إجراء ترحيل الشراء المنفصل من التأثير على المخزون.')}</span></div>
            {this.state.error?<div className="inline-error" role="alert">{this.state.error}</div>:null}
          </div>:null}
          {this.state.stage==='saved'?<div className="supplier-import-saved"><span className="supplier-import-icon"><Icon name="check"/></span><h3>{t('Purchase draft saved','تم حفظ مسودة الشراء')}</h3><p>{t('Open Operations → Purchases to review, edit and post it when ready. No inventory or accounting entry was posted automatically.','افتح العمليات ← المشتريات لمراجعتها وتعديلها وترحيلها عند الجاهزية. لم يتم ترحيل أي مخزون أو قيد محاسبي تلقائيًا.')}</p></div>:null}
        </div>
      </Modal>
    </>;
  }
}
