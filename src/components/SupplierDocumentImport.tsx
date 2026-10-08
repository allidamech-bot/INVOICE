import { requestAiJson } from '../lib/ai-request.js';
import { readablePdfText } from '../lib/pdf-source.js';
import type { PurchaseRecord, SavedItem, Supplier, UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';
import { buildAiSupplierPurchaseDraft } from '../lib/ai-supplier-purchase-draft.js';
import { combineSupplierImportDrafts, extractSupplierDraftFromSheets, type SupplierImportDraft } from '../lib/supplier-document-import.js';
import { readSpreadsheetFile, spreadsheetSheetsAsText } from '../lib/spreadsheet-reader.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { Button, Icon, Modal } from './UI.js';

const MAX_BINARY_BYTES=2_600_000;
const MAX_SPREADSHEET_BYTES=12_000_000;
const MAX_TEXT_CHARS=120_000;
const MAX_IMPORT_FILES=4;
const MAX_BATCH_BYTES=24_000_000;

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
  if(mime==='application/pdf'){if(file.size>MAX_SPREADSHEET_BYTES)throw new Error(t('PDF exceeds 12 MB.','ملف PDF يتجاوز 12 MB.'));const text=await readablePdfText(file,MAX_TEXT_CHARS);if(text.trim())return{kind:'text',mimeType:'text/plain',text};}
  if(file.size>MAX_BINARY_BYTES)throw new Error(t('This PDF/image is too large for safe AI import. Reduce it below 2.6 MB.','ملف PDF/الصورة كبير للاستيراد الآمن. خفّضه لأقل من 2.6 MB.'));
  return {kind:'file',mimeType:mime,data:bytesToBase64(await file.arrayBuffer())};
}

/** Compatibility wrapper: all supplier-import UI paths now use the same review-first AI draft builder. */
export function buildSupplierPurchaseDraft(draft:SupplierImportDraft,purchases:PurchaseRecord[],suppliers:Supplier[],items:SavedItem[],_fallbackCurrency=''):PurchaseRecord{
  return buildAiSupplierPurchaseDraft(draft,purchases,suppliers,items);
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
  private pendingFiles:File[]=[];
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
    this.pendingFiles=[];
    this.setState({open:true,stage:'idle',error:'',fileName:'',draft:null,model:''},()=>this.input?.click());
  };

  private close=()=>{
    if(this.saveInFlight)return;
    this.cancelRequest();
    this.setState({open:false,stage:'idle',error:'',draft:null,fileName:'',model:''});
  };

  private requestAi=async(file:File,payload:AiPayload,generation:number):Promise<SupplierImportDraft|null>=>{
    const controller=new AbortController();this.requestAbort=controller;
    this.setState({stage:'ai'});
    try{
      const body=await requestAiJson('/api/supplier-document-ai',{fileName:file.name,...payload},controller.signal);
      if(generation!==this.requestGeneration||controller.signal.aborted)return null;
      if(!body?.draft?.items?.length)throw new Error(t('No reliable purchase lines were found.','لم يتم العثور على بنود شراء موثوقة.'));
      return body.draft as SupplierImportDraft;
    }finally{
      if(this.requestAbort===controller)this.requestAbort=null;
    }
  };

  private chooseFiles=async(files:File[])=>{
    if(!files.length||this.requestInFlight||this.saveInFlight)return;
    if(files.length>MAX_IMPORT_FILES){
      this.setState({stage:'error',error:t('Choose at most four related supplier files at a time. Nothing was saved.','اختر أربعة ملفات مورد مترابطة كحد أقصى. لم يُحفظ شيء.'),draft:null});
      return;
    }
    if(files.reduce((total,file)=>total+file.size,0)>MAX_BATCH_BYTES){
      this.setState({stage:'error',error:t('The selected files exceed the 24 MB safe batch limit. Split the import.','الملفات تتجاوز حد الدفعة الآمن 24 MB. قسّم الاستيراد.'),draft:null});
      return;
    }
    this.pendingFiles=files;
    const generation=++this.requestGeneration;
    this.requestInFlight=true;
    this.setState({stage:'reading',error:'',draft:null,fileName:files.map(file=>file.name).join(' · '),model:''});
    const parsed:Array<{name:string;draft:SupplierImportDraft}>=[];
    let usedAi=false;
    try{
      for(let index=0;index<files.length;index+=1){
        const file=files[index]!;
        if(generation!==this.requestGeneration)return;
        this.setState({stage:'reading',fileName:`${index+1}/${files.length} — ${file.name}`});
        const name=file.name.toLowerCase();
        let extracted:SupplierImportDraft|null=null;
        if(name.endsWith('.csv')||name.endsWith('.txt')||name.endsWith('.xlsx')||name.endsWith('.xls')){
          if(file.size>MAX_SPREADSHEET_BYTES)throw new Error(t(`${file.name} exceeds the 12 MB spreadsheet limit.`,`يتجاوز الملف ${file.name} حد Excel البالغ 12 MB.`));
          const sheets=await readSpreadsheetFile(file);
          if(generation!==this.requestGeneration)return;
          await new Promise<void>(resolve=>this.setState({stage:'extracting'},resolve));
          extracted=extractSupplierDraftFromSheets(sheets);
          if(!extracted){
            const text=spreadsheetSheetsAsText(sheets,MAX_TEXT_CHARS+1);
            if(!text.trim())throw new Error(t('The workbook has no readable purchase lines.','ملف Excel لا يحتوي بنود شراء قابلة للقراءة.'));
            if(text.length>MAX_TEXT_CHARS)throw new Error(t('The workbook exceeds the safe AI extraction limit. Use a structured Excel table or split the file.','ملف Excel يتجاوز الحد الآمن لتحليل AI. استخدم جدولًا منظمًا أو قسّم الملف.'));
            extracted=await this.requestAi(file,{kind:'text',mimeType:'text/csv',text},generation);
            usedAi=true;
          }
        }else{
          const payload=await binaryPayload(file);
          if(generation!==this.requestGeneration)return;
          extracted=await this.requestAi(file,payload,generation);
          usedAi=true;
        }
        if(generation!==this.requestGeneration)return;
        if(!extracted)throw new Error(t('The file could not be fully extracted. Nothing was saved.','تعذر استخراج الملف بالكامل. لم يُحفظ شيء.'));
        parsed.push({name:file.name,draft:extracted});
      }
      const draft=combineSupplierImportDrafts(parsed);
      if(generation!==this.requestGeneration)return;
      this.setState({draft,model:usedAi?t('Local + LOUREX AI review','مراجعة محلية وAI'):t('Local spreadsheet parser','محلل الجدول المحلي'),stage:'ready',error:'',fileName:files.map(file=>file.name).join(' · ')});
    }catch(error){
      if(generation===this.requestGeneration)this.setState({stage:'error',error:error instanceof Error?error.message:String(error),draft:null});
    }finally{
      if(generation===this.requestGeneration)this.requestInFlight=false;
      if(this.input)this.input.value='';
    }
  };

  private retry=()=>{if(this.pendingFiles.length&&!this.requestInFlight)void this.chooseFiles(this.pendingFiles);};

  private saveDraft=async()=>{
    const extracted=this.state.draft;
    if(!extracted||this.saveInFlight)return;
    this.saveInFlight=true;this.setState({stage:'saving',error:''});
    try{
      await mutateVaultSafely(vault=>{
        const purchase=buildAiSupplierPurchaseDraft(extracted,vault.purchases,vault.suppliers,vault.savedItems);
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
      <Modal portal open={this.state.open} title={t('Supplier Document → Purchase Draft','مستند مورد ← مسودة شراء')} size="lg" onClose={this.close} footer={footer}>
        <div className={`supplier-import-shell stage-${this.state.stage}`} data-supplier-import-stage={this.state.stage} aria-busy={this.busy()}>
          <input ref={(node:any)=>{this.input=node;}} className="supplier-import-file-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" multiple onChange={(event:any)=>void this.chooseFiles(Array.from(event.target.files??[]) as File[])}/>
          {this.state.stage==='idle'?<div className="supplier-import-start"><span className="supplier-import-icon"><Icon name="upload"/></span><div><p className="eyebrow">{t('Review-first purchasing','مشتريات تبدأ بالمراجعة')}</p><h3>{t('Create a purchase draft from related supplier files','أنشئ مسودة شراء من ملفات المورد المترابطة')}</h3><p>{t('Select up to four files for the same supplier document. Every worksheet and file is checked; conflicting currencies or incomplete lines block the draft. No inventory or accounting is posted.','اختر حتى أربعة ملفات لنفس مستند المورد. يتم فحص كل ورقة وكل ملف؛ اختلاف العملات أو نقص البنود يمنع إنشاء المسودة. لا يُرحّل أي مخزون أو حسابات.')}</p></div><Button icon="upload" onClick={()=>this.input?.click()}>{t('Choose files (up to 4)','اختر ملفات (حتى 4)')}</Button></div>:null}
          {this.busy()?<div className="supplier-import-progress" role="status"><span className="supplier-import-icon"><Icon name={this.state.stage==='ai'?'items':'file'}/></span><div><p className="eyebrow">{progress.title}</p><h3><bdi dir="auto">{this.state.fileName}</bdi></h3><p>{progress.detail}</p><div className="supplier-import-steps" aria-label={t('Import progress','تقدم الاستيراد')}><span className={['reading','extracting','ai','saving'].includes(this.state.stage)?'complete':''}>{t('File selected','تم اختيار الملف')}</span><span className={['extracting','ai','saving'].includes(this.state.stage)?'complete':''}>{t('Local extraction','استخراج محلي')}</span><span className={this.state.stage==='ai'?'active':this.state.stage==='saving'?'complete':''}>{t('AI if needed','AI عند الحاجة')}</span><span className={this.state.stage==='saving'?'active':''}>{t('Draft review','مراجعة المسودة')}</span></div></div></div>:null}
          {this.state.stage==='error'?<div className="supplier-import-error-state"><span className="supplier-import-icon is-error"><Icon name="x"/></span><div><p className="eyebrow">{t('Import stopped safely','توقف الاستيراد بأمان')}</p><h3>{t('No purchase draft was saved','لم يتم حفظ مسودة شراء')}</h3><p className="inline-error" role="alert">{this.state.error}</p></div><div className="supplier-import-retry-actions"><Button onClick={()=>this.input?.click()}>{t('Choose another file','اختر ملفًا آخر')}</Button><Button variant="primary" icon="refresh" disabled={!this.pendingFiles.length} onClick={this.retry}>{t('Retry','إعادة المحاولة')}</Button></div></div>:null}
          {draft&&this.state.stage==='ready'?<div className="supplier-import-review">
            <div className="supplier-import-review-head"><div><p className="eyebrow">{t('Draft ready for review','المسودة جاهزة للمراجعة')}</p><h3><bdi dir="auto">{draft.supplierName||t('Supplier not identified','لم يتم تحديد المورد')}</bdi></h3><small><bdi dir="auto">{[draft.documentNumber,draft.date,draft.currency].filter(Boolean).join(' · ')||t('Complete missing header details in Operations','أكمل بيانات الرأس الناقصة في العمليات')}</bdi></small></div><span>{this.state.model}</span></div>
            {draft.sourceSheets?.length?<p className="supplier-import-sources" role="status">{t(`${draft.items.length} verified rows from ${draft.sourceSheets.length} source section(s).`,`${draft.items.length} بندًا تم التحقق منها من ${draft.sourceSheets.length} قسم مصدر.`)} <bdi dir="auto">{draft.sourceSheets.map(source=>`${source.name} (${source.itemCount})`).join(' · ')}</bdi></p>:null}
            {draft.skippedSheets?.length?<p className="supplier-import-sources">{t('Non-table worksheets skipped (review the source):','أوراق غير جدولية لم تُستورد (راجع المصدر):')} <bdi dir="auto">{draft.skippedSheets.join(' · ')}</bdi></p>:null}
            <div className="supplier-import-items">{draft.items.slice(0,40).map((item,index)=><div key={`${item.sku}-${index}`} className="supplier-import-item"><span><strong><bdi dir="auto">{item.descriptionEn||item.descriptionAr||item.sku}</bdi></strong><small><bdi dir="auto">{[item.sku,item.quantity,item.unit].filter(Boolean).join(' · ')}</bdi></small></span><bdi dir="ltr">{item.unitCost} {draft.currency}</bdi></div>)}</div>
            {draft.items.length>40?<small className="supplier-import-more">{t(`${draft.items.length-40} more lines will be included in the draft.`,`سيتم تضمين ${draft.items.length-40} بندًا إضافيًا في المسودة.`)}</small>:null}
            <div className="supplier-import-costs"><strong>{t('Extra costs','التكاليف الإضافية')}</strong><span>{t('Freight','الشحن')}: <bdi dir="ltr">{draft.freight||'—'}</bdi></span><span>{t('Duty','الجمارك')}: <bdi dir="ltr">{draft.duty||'—'}</bdi></span><span>{t('Other','أخرى')}: <bdi dir="ltr">{draft.otherCosts||'—'}</bdi></span></div>
            <div className="supplier-import-safety"><Icon name="lock"/><span>{t('Confirming creates a draft only. Review and edit it in Operations before the separate Post Purchase action can affect inventory.','التأكيد ينشئ مسودة فقط. راجعها وعدّلها في العمليات قبل أن يتمكن إجراء ترحيل الشراء المنفصل من التأثير على المخزون.')}</span></div>
            {this.state.error?<div className="inline-error" role="alert">{this.state.error}</div>:null}
          </div>:null}
          {this.state.stage==='saved'?<div className="supplier-import-saved"><span className="supplier-import-icon"><Icon name="check"/></span><h3>{t('Purchase draft saved','تم حفظ مسودة الشراء')}</h3><p>{t('Open Operations → Purchases to review, edit and post it when ready. No inventory or accounting entry was posted automatically.','افتح العمليات ← المشتريات لمراجعتها وتعديلها وترحيلها عند الجاهزية. لم يتم ترحيل أي مخزون أو قيد محاسبي تلقائيًا.')}</p></div>:null}
        </div>
      </Modal>
    </>;
  }
}
