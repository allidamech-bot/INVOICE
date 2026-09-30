import type { Customer } from '../types.js';
import { isArabic, t } from '../lib/i18n.js';
import { readSpreadsheetFile, spreadsheetSheetsAsText } from '../lib/spreadsheet-reader.js';
import { CUSTOMER_AI_FIELDS, customerAiFieldLabel, customerFromAiProposal, findCustomerDuplicateCandidates, mergeCustomerAiProposals, normalizeCustomerAiProposal, type CustomerAiProposal, type CustomerDuplicateCandidate } from '../lib/customer-ai-capture.js';
import { Button, Field, Icon, Modal, Select, Textarea } from './UI.js';

const MAX_BINARY_BYTES=2_600_000;
const MAX_SPREADSHEET_BYTES=12_000_000;
const MAX_TEXT_CHARS=120_000;
const MAX_FILES=6;
const SOURCE_EVENT='lourex-ai-customer-source';

type CaptureStage='idle'|'reading'|'analyzing'|'review'|'error';
type AiPayload={kind:'text'|'file';mimeType:string;text?:string;data?:string};

interface Props{
  customers:Customer[];
  onReview:(customer:Customer,allowKnownDuplicate:boolean)=>void;
}
interface State{
  open:boolean;
  stage:CaptureStage;
  files:File[];
  pastedText:string;
  proposal:CustomerAiProposal|null;
  matches:CustomerDuplicateCandidate[];
  selectedMatchId:string;
  errors:string[];
  error:string;
  model:string;
}

function bytesToBase64(buffer:ArrayBuffer):string{
  const bytes=new Uint8Array(buffer);let binary='';const chunk=0x8000;
  for(let offset=0;offset<bytes.length;offset+=chunk)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+chunk,bytes.length)));
  return btoa(binary);
}

async function payloadForFile(file:File):Promise<AiPayload>{
  const name=file.name.toLowerCase();
  if(name.endsWith('.xlsx')||name.endsWith('.xls')||name.endsWith('.csv')){
    if(file.size>MAX_SPREADSHEET_BYTES)throw new Error(t(`${file.name} is larger than 12 MB.`,`الملف ${file.name} أكبر من 12 MB.`));
    const sheets=await readSpreadsheetFile(file);const text=spreadsheetSheetsAsText(sheets,MAX_TEXT_CHARS);
    if(!text.trim())throw new Error(t(`${file.name} has no readable company data.`,`الملف ${file.name} لا يحتوي بيانات شركة قابلة للقراءة.`));
    return {kind:'text',mimeType:'text/csv',text};
  }
  if(name.endsWith('.txt')){
    if(file.size>1_000_000)throw new Error(t(`${file.name} is too large.`,`الملف ${file.name} كبير جدًا.`));
    const text=(await file.text()).slice(0,MAX_TEXT_CHARS);if(!text.trim())throw new Error(t(`${file.name} is empty.`,`الملف ${file.name} فارغ.`));
    return {kind:'text',mimeType:'text/plain',text};
  }
  const mime=file.type||(name.endsWith('.pdf')?'application/pdf':name.endsWith('.png')?'image/png':/\.jpe?g$/.test(name)?'image/jpeg':name.endsWith('.webp')?'image/webp':'');
  if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime))throw new Error(t(`Unsupported file: ${file.name}.`,`نوع الملف غير مدعوم: ${file.name}.`));
  if(file.size>MAX_BINARY_BYTES)throw new Error(t(`${file.name} is too large for safe AI analysis. Reduce it below 2.6 MB.`,`الملف ${file.name} كبير للتحليل الآمن. خفّضه لأقل من 2.6 MB.`));
  return {kind:'file',mimeType:mime,data:bytesToBase64(await file.arrayBuffer())};
}

function customerDisplayName(customer:Customer):string{return (isArabic()?(customer.companyNameAr||customer.companyNameEn):(customer.companyNameEn||customer.companyNameAr)).trim()||t('Unnamed customer','عميل بدون اسم');}
function confidenceText(value:number):string{return `${Math.round(Math.max(0,Math.min(1,value))*100)}%`;}
function matchReasonLabel(reason:CustomerDuplicateCandidate['reasons'][number]):string{
  const labels={commercialRegistration:t('Commercial registration','السجل التجاري'),vatTaxNumber:t('VAT / Tax number','الرقم الضريبي'),email:t('Email','البريد الإلكتروني'),phone:t('Phone','الهاتف'),companyNameEn:t('English name','الاسم الإنجليزي'),companyNameAr:t('Arabic name','الاسم العربي')};return labels[reason];
}

export class CustomerAiCapture extends React.Component<Props,State>{
  private input:HTMLInputElement|null=null;
  private abort:AbortController|null=null;
  private generation=0;

  state:State={open:false,stage:'idle',files:[],pastedText:'',proposal:null,matches:[],selectedMatchId:'',errors:[],error:'',model:''};
  componentDidMount():void{window.addEventListener(SOURCE_EVENT,this.handleSourceEvent as EventListener);}
  componentWillUnmount():void{window.removeEventListener(SOURCE_EVENT,this.handleSourceEvent as EventListener);this.cancel();}

  private handleSourceEvent=(event:Event)=>{
    const file=(event as CustomEvent<{file?:File}>).detail?.file;if(!(file instanceof File))return;
    this.cancel();this.setState({open:true,stage:'idle',files:[file],pastedText:'',proposal:null,matches:[],selectedMatchId:'',errors:[],error:'',model:''},()=>void this.analyze());
  };
  private cancel=()=>{this.generation+=1;this.abort?.abort();this.abort=null;};
  private open=()=>{this.cancel();this.setState({open:true,stage:'idle',files:[],pastedText:'',proposal:null,matches:[],selectedMatchId:'',errors:[],error:'',model:''});};
  private close=()=>{this.cancel();this.setState({open:false,stage:'idle'});};

  private chooseFiles=(files:FileList|null)=>{
    const next=Array.from(files??[]).slice(0,MAX_FILES);
    this.setState({files:next,proposal:null,matches:[],selectedMatchId:'',errors:[],error:'',stage:'idle'});
    if(this.input)this.input.value='';
  };

  private request=async(fileName:string,payload:AiPayload,generation:number):Promise<{proposal:CustomerAiProposal;model:string}|null>=>{
    const controller=new AbortController();this.abort=controller;
    const timeout=window.setTimeout(()=>controller.abort(),26000);
    try{
      const response=await fetch('/api/customer-capture-ai',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice'},body:JSON.stringify({fileName,...payload}),signal:controller.signal});
      let body:any={};try{body=await response.json();}catch{}
      if(!response.ok)throw new Error(String(body?.message||t('Unable to analyze this customer source.','تعذر تحليل مصدر بيانات العميل.')));
      if(generation!==this.generation||controller.signal.aborted)return null;
      return {proposal:normalizeCustomerAiProposal(body.proposal),model:String(body.model||'LOUREX AI')};
    }finally{window.clearTimeout(timeout);if(this.abort===controller)this.abort=null;}
  };

  private analyze=async()=>{
    if(this.state.stage==='reading'||this.state.stage==='analyzing')return;
    const files=this.state.files.slice(0,MAX_FILES),pasted=this.state.pastedText.trim();
    if(!files.length&&!pasted){this.setState({error:t('Choose at least one company file or paste company text.','اختر ملف شركة واحدًا على الأقل أو الصق نص بيانات الشركة.')});return;}
    const generation=++this.generation;const proposals:CustomerAiProposal[]=[];const errors:string[]=[];let model='';
    this.setState({stage:'reading',proposal:null,matches:[],errors:[],error:'',model:''});
    for(const file of files){
      if(generation!==this.generation)return;
      try{
        const payload=await payloadForFile(file);if(generation!==this.generation)return;
        this.setState({stage:'analyzing'});
        const result=await this.request(file.name,payload,generation);if(result){proposals.push(result.proposal);model=result.model||model;}
      }catch(error){if(generation!==this.generation)return;errors.push(`${file.name}: ${error instanceof Error?error.message:String(error)}`);}
    }
    if(pasted&&generation===this.generation){
      try{this.setState({stage:'analyzing'});const result=await this.request(t('Pasted text','النص الملصق'),{kind:'text',mimeType:'text/plain',text:pasted.slice(0,MAX_TEXT_CHARS)},generation);if(result){proposals.push(result.proposal);model=result.model||model;}}
      catch(error){if(generation!==this.generation)return;errors.push(error instanceof Error?error.message:String(error));}
    }
    if(generation!==this.generation)return;
    if(!proposals.length){this.setState({stage:'error',errors,error:errors[0]||t('No reliable customer identity data was found. Nothing was saved.','لم يتم العثور على بيانات هوية عميل موثوقة. لم يتم حفظ أي شيء.')});return;}
    const proposal=mergeCustomerAiProposals(proposals);const draft=customerFromAiProposal(proposal);const matches=findCustomerDuplicateCandidates(this.props.customers,draft);
    this.setState({stage:'review',proposal,matches,selectedMatchId:matches[0]?.customer.id||'',errors,error:'',model});
  };

  private reviewNew=()=>{
    const proposal=this.state.proposal;if(!proposal)return;
    this.props.onReview(customerFromAiProposal(proposal),false);this.setState({open:false});
  };

  private reviewUpdate=()=>{
    const proposal=this.state.proposal,existing=this.props.customers.find(customer=>customer.id===this.state.selectedMatchId);if(!proposal||!existing)return;
    this.props.onReview(customerFromAiProposal(proposal,existing),false);this.setState({open:false});
  };

  render():any{
    const busy=this.state.stage==='reading'||this.state.stage==='analyzing';const proposal=this.state.proposal;const arabic=isArabic();
    const footer=this.state.stage==='review'&&proposal?<div className="ta-customer-modal-actions"><Button onClick={this.close}>{t('Cancel','إلغاء')}</Button>{this.state.matches.length?<Button disabled={!this.state.selectedMatchId} onClick={this.reviewUpdate}>{t('Review Update','مراجعة تحديث الموجود')}</Button>:null}<Button variant="primary" onClick={this.reviewNew}>{this.state.matches.length?t('Review as New Customer (duplicate guard stays on)','مراجعة كعميل جديد (حماية التكرار تبقى مفعّلة)'):t('Review Customer','مراجعة العميل')}</Button></div>:undefined;
    return <>
      <Button icon="upload" onClick={this.open}>{t('Add with AI','إضافة بالذكاء الاصطناعي')}</Button>
      <Modal open={this.state.open} title={t('AI Customer Capture','إضافة عميل بالذكاء الاصطناعي')} size="lg" onClose={this.close} footer={footer}>
        <div aria-busy={busy}>
          {this.state.stage!=='review'?<>
            <p>{t('Upload a commercial registration or other company source. LOUREX extracts a proposal only; nothing is saved until you review and save it.','ارفع سجلًا تجاريًا أو أي مصدر بيانات للشركة. يستخرج LOUREX مقترحًا فقط؛ لا يتم حفظ أي شيء قبل المراجعة والحفظ.')}</p>
            <input ref={(node:any)=>{this.input=node;}} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.txt,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain" onChange={(event:any)=>this.chooseFiles(event.target.files)}/>
            <div className="ta-customer-modal-actions"><Button icon="upload" disabled={busy} onClick={()=>this.input?.click()}>{t('Choose Files','اختر الملفات')}</Button><Button variant="primary" disabled={busy} onClick={()=>void this.analyze()}>{busy?t('Analyzing…','جارٍ التحليل…'):t('Extract Customer Data','استخراج بيانات العميل')}</Button></div>
            {this.state.files.length?<div><strong>{t('Selected sources','المصادر المحددة')}</strong><ul>{this.state.files.map(file=><li key={`${file.name}:${file.size}`}>{file.name} · {Math.max(1,Math.round(file.size/1024))} KB</li>)}</ul></div>:null}
            <Field label={t('Or paste company text','أو الصق نص بيانات الشركة')}><Textarea rows="5" value={this.state.pastedText} disabled={busy} onChange={(event:any)=>this.setState({pastedText:event.target.value})}/></Field>
          </>:null}

          {busy?<div role="status"><Icon name="file"/><strong>{this.state.stage==='reading'?t('Reading sources…','جارٍ قراءة المصادر…'):t('LOUREX AI is extracting customer data…','يقوم LOUREX AI باستخراج بيانات العميل…')}</strong><p>{t('No customer record is being changed during analysis. You can cancel safely.','لا يتم تعديل أي سجل عميل أثناء التحليل. يمكنك إلغاء التحليل بأمان.')}</p><Button onClick={this.close}>{t('Cancel analysis','إلغاء التحليل')}</Button></div>:null}

          {this.state.stage==='review'&&proposal?<>
            <div><strong>{t('Sources reviewed','المصادر التي تمت مراجعتها')}</strong><ul>{this.state.files.map(file=><li key={`${file.name}:${file.size}`}>{file.name}</li>)}{this.state.pastedText.trim()?<li>{t('Pasted text','النص الملصق')}</li>:null}</ul></div>
            {this.state.errors.length?<div role="alert"><strong>{t('Some sources could not be read','تعذر تحليل بعض المصادر')}</strong><ul>{this.state.errors.map((error,index)=><li key={index}>{error}</li>)}</ul></div>:null}
            <div role="table" aria-label={t('Extracted customer fields','حقول العميل المستخرجة')}>
              {CUSTOMER_AI_FIELDS.map(key=>{const row=proposal.fields[key];return <div role="row" key={key}><strong>{customerAiFieldLabel(key,arabic)}</strong><span>{row.value||'—'}</span><small>{row.value?`${t('Confidence','الثقة')}: ${confidenceText(row.confidence)}${row.sourceFile?` · ${row.sourceFile}`:''}${row.sourcePage?` · ${t('Page','صفحة')} ${row.sourcePage}`:''}`:t('Not found — left blank','غير موجود — تُرك فارغًا')}</small>{row.sourceExcerpt?<small>“{row.sourceExcerpt}”</small>:null}</div>;})}
            </div>
            {proposal.conflicts.length?<div role="alert"><strong>{t('Conflicting values need review','قيم متعارضة تحتاج مراجعة')}</strong><ul>{proposal.conflicts.map(conflict=><li key={conflict.field}>{customerAiFieldLabel(conflict.field,arabic)}: {conflict.values.map(value=>value.value).join(' / ')}</li>)}</ul></div>:null}
            {this.state.matches.length?<div><strong>{t('Possible existing customer found','تم العثور على عميل موجود محتمل')}</strong><p>{t('LOUREX will not merge automatically. Updating an existing record stays available; creating a separate record remains subject to the existing duplicate guard.','لن يقوم LOUREX بالدمج تلقائيًا. يبقى تحديث السجل الموجود متاحًا؛ أما إنشاء سجل منفصل فيبقى خاضعًا لحماية التكرار الحالية.')}</p><Select value={this.state.selectedMatchId} onChange={(event:any)=>this.setState({selectedMatchId:event.target.value})}>{this.state.matches.map(match=><option key={match.customer.id} value={match.customer.id}>{customerDisplayName(match.customer)} — {match.reasons.map(matchReasonLabel).join(', ')}</option>)}</Select></div>:<p>{t('No likely duplicate was found using registration, VAT, phone, email and normalized names.','لم يتم العثور على تكرار محتمل باستخدام السجل والضريبة والهاتف والبريد والأسماء المطبعة.')}</p>}
            <p><small>{this.state.model?t(`Extraction: ${this.state.model}`,`الاستخراج: ${this.state.model}`):''}</small></p>
          </>:null}

          {this.state.stage==='error'||this.state.error?<div role="alert"><strong>{t('Customer capture stopped','توقف استخراج العميل')}</strong><p>{this.state.error}</p>{this.state.errors.length>1?<ul>{this.state.errors.slice(1).map((error,index)=><li key={index}>{error}</li>)}</ul>:null}</div>:null}
        </div>
      </Modal>
    </>;
  }
}