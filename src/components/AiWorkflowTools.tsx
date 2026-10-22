import { assertAiImportSaveAllowed } from '../lib/ai-import-authorization.js';
import { requestAiJson } from '../lib/ai-request.js';
import { readablePdfText } from '../lib/pdf-source.js';
import type { DocumentItem, VaultPayload } from '../types.js';
import { assistantToolIsArabic as isArabic, assistantToolText as t } from '../lib/ai-tool-presentation.js';
import { resumeVaultSession } from '../storage/vault.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { readSpreadsheetFile, spreadsheetSheetsAsText } from '../lib/spreadsheet-reader.js';
import { aiWorkflowPrompt, searchBusinessRecords, type AiBusinessSearchResult, type AiInboxClassification, type AiInboxDocumentType, type AiInboxRoute, type AiWorkflowMode } from '../lib/ai-workflows.js';
import { applyQuoteAiPricingCommand, buildQuoteAiReview, type QuoteAiReview, type QuoteAiSourceDraft, type QuoteAiSourceItem, type QuoteAiWarning } from '../lib/quote-ai-review.js';
import { readAiJobHistory, startAiJob, updateAiJob, clearAiJobHistory, type AiJobHistoryEntry } from '../lib/ai-job-history.js';
import { normalizeSupplierAiProposal, type SupplierAiProposal } from '../lib/supplier-ai-capture.js';
import { createBlankDocument, nextDocumentNumber } from '../lib/documents.js';
import { customerSnapshotFrom } from '../lib/defaults.js';
import { resolveAiInboxQuoteCustomer, assertAiInboxQuoteProductScope, assertAiInboxQuoteReviewFresh, aiInboxUnlinkedCustomerNote } from '../lib/ai-workflow-quote-guard.js';
import { scopeVault } from '../lib/workspaces.js';
import { createDocumentEvent } from '../lib/document-lifecycle.js';
import { documentItemFromSavedItem } from '../lib/saved-items.js';
import { makeId } from '../lib/id.js';
import { buildAiSupplierPurchaseDraft } from '../lib/ai-supplier-purchase-draft.js';
import type { SupplierImportDraft } from '../lib/supplier-document-import.js';
import { SupplierAiProposalReview } from './SupplierAiProposalReview.js';
import { Button, Field, Icon, Input, Modal, Textarea } from './UI.js';

const MAX_BINARY_BYTES=2_600_000;
const MAX_SPREADSHEET_BYTES=12_000_000;
const MAX_TEXT_CHARS=120_000;
const PENDING_SOURCE_KEY='__lourexAiPendingSource';

type AiPayload={kind:'text'|'file';mimeType:string;text?:string;data?:string};
type ToolView='menu'|'inbox'|'search'|'history';
type InboxStage='idle'|'reading'|'classifying'|'extracting'|'pricing'|'review'|'saving'|'done'|'error';
interface PendingSource{route:'customer'|'product_list';file:File;files?:File[];createdAt:number;}
interface State{
  open:boolean;view:ToolView;stage:InboxStage;file:File|null;productFiles:File[];pastedText:string;classification:AiInboxClassification|null;forcedRoute:AiInboxRoute|null;
  quote:QuoteAiSourceDraft|null;quoteReview:QuoteAiReview|null;quoteCommand:string;quoteCommandMessage:string;supplier:SupplierImportDraft|null;supplierProposal:SupplierAiProposal|null;error:string;model:string;savedLabel:string;
  searchQuery:string;searchBusy:boolean;searchResults:AiBusinessSearchResult[];listening:boolean;voiceStarting:boolean;jobs:AiJobHistoryEntry[];currentJobId:string;savedReference:string;
}

function bytesToBase64(buffer:ArrayBuffer):string{const bytes=new Uint8Array(buffer);let binary='';const chunk=0x8000;for(let offset=0;offset<bytes.length;offset+=chunk)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+chunk,bytes.length)));return btoa(binary);}
async function sourcePayload(file:File):Promise<AiPayload>{
  const name=file.name.toLowerCase();
  if(name.endsWith('.pdf')||file.type==='application/pdf'){
    if(file.size>MAX_SPREADSHEET_BYTES)throw new Error(t('This PDF is larger than 12 MB.','حجم PDF أكبر من 12 MB.'));
    const text=await readablePdfText(file,MAX_TEXT_CHARS);
    if(text.trim())return{kind:'text',mimeType:'text/plain',text};
  }
  if(name.endsWith('.xlsx')||name.endsWith('.xls')||name.endsWith('.csv')){if(file.size>MAX_SPREADSHEET_BYTES)throw new Error(t('This spreadsheet is larger than 12 MB.','حجم الجدول أكبر من 12 MB.'));const sheets=await readSpreadsheetFile(file);const text=spreadsheetSheetsAsText(sheets,MAX_TEXT_CHARS);if(!text.trim())throw new Error(t('The spreadsheet has no readable business data.','الجدول لا يحتوي بيانات أعمال قابلة للقراءة.'));return{kind:'text',mimeType:'text/csv',text};}
  if(name.endsWith('.txt')){if(file.size>1_000_000)throw new Error(t('This text file is too large.','الملف النصي كبير جدًا.'));const text=await file.text();if(text.length>MAX_TEXT_CHARS)throw new Error(t('Text exceeds the analysis limit. Split the source into smaller files.','النص يتجاوز حد التحليل. قسّم المصدر إلى ملفات أصغر.'));if(!text.trim())throw new Error(t('The text file is empty.','الملف النصي فارغ.'));return{kind:'text',mimeType:'text/plain',text};}
  const mime=file.type||(name.endsWith('.pdf')?'application/pdf':name.endsWith('.png')?'image/png':/\.jpe?g$/.test(name)?'image/jpeg':name.endsWith('.webp')?'image/webp':'');if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime))throw new Error(t('Use PDF, image, Excel, CSV or TXT.','استخدم PDF أو صورة أو Excel أو CSV أو TXT.'));if(file.size>MAX_BINARY_BYTES)throw new Error(t('This PDF/image is too large for safe AI analysis. Reduce it below 2.6 MB.','ملف PDF/الصورة كبير للتحليل الآمن. خفّضه لأقل من 2.6 MB.'));return{kind:'file',mimeType:mime,data:bytesToBase64(await file.arrayBuffer())};
}
async function postAi(endpoint:string,fileName:string,payload:AiPayload,signal?:AbortSignal):Promise<any>{return requestAiJson(endpoint,{fileName,...payload},signal);}
/** Legacy voice composer fallback. The active chat may render a textarea
 * plus an invisible input bridge; always select the visible input first. */
function advisorInput(prompt:string,submit:boolean):boolean{
  const input=document.querySelector<HTMLTextAreaElement|HTMLInputElement>('#lourex-ai-panel .lourex-ai-compose .lourex-ai-premium-textarea, #lourex-ai-panel .lourex-ai-compose input:not([type="hidden"])');
  if(!input)return false;
  const base=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(base,'value')?.set;
  if(setter)setter.call(input,prompt.slice(0,1000));else input.value=prompt.slice(0,1000);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  if(submit)window.setTimeout(()=>input.form?.requestSubmit(),0);
  else{input.focus();input.setSelectionRange(input.value.length,input.value.length);}
  return true;
}
function routeLabel(route:AiInboxRoute):string{if(route==='customer')return t('Customer / company identity','عميل / هوية شركة');if(route==='supplier')return t('Supplier identity','هوية مورد');if(route==='supplier_purchase')return t('Supplier purchase document','مستند شراء من مورد');if(route==='quote_request')return t('Customer quotation request','طلب عرض سعر من عميل');if(route==='product_list')return t('Product catalog / price list','كتالوج منتجات / قائمة أسعار');return t('Needs manual choice','يحتاج اختيارًا يدويًا');}
function documentTypeLabel(value:AiInboxDocumentType):string{if(value==='commercial_registration')return t('Commercial Registration','سجل تجاري');if(value==='customer_rfq')return 'Customer RFQ';if(value==='supplier_quote')return t('Supplier Quote','عرض مورد');if(value==='supplier_invoice')return t('Supplier Invoice','فاتورة مورد');if(value==='purchase_invoice')return t('Purchase Invoice','فاتورة شراء');if(value==='product_catalog')return t('Product Catalog','كتالوج منتجات');if(value==='price_list')return t('Price List','قائمة أسعار');if(value==='company_file')return t('Company File','ملف شركة');return t('Unknown','غير معروف');}
function jobStatusLabel(value:AiJobHistoryEntry['status']):string{if(value==='processing')return t('Processing','قيد المعالجة');if(value==='needs-review')return t('Needs Review','يحتاج مراجعة');if(value==='completed')return t('Completed','مكتمل');if(value==='failed')return t('Failed','فشل');return t('Cancelled','ملغي');}
function quoteWarningLabel(warning:QuoteAiWarning):string{if(warning==='unknown-product')return t('Unknown product','صنف غير معروف');if(warning==='ambiguous-quantity')return t('Quantity / unit needs review','الكمية / الوحدة تحتاج مراجعة');if(warning==='low-product-confidence')return t('Low product confidence','ثقة منخفضة بالصنف');if(warning==='missing-cost')return t('Missing cost','تكلفة ناقصة');if(warning==='missing-currency')return t('Quotation currency missing','عملة عرض السعر مفقودة');if(warning==='currency-mismatch')return t('Cost currency mismatch','اختلاف عملة التكلفة');if(warning==='below-cost')return t('Price below cost','السعر تحت التكلفة');if(warning==='below-policy')return t('Price below pricing policy','السعر تحت سياسة التسعير');return t('Selling price missing','سعر البيع مفقود');}
function priceSourceLabel(source:QuoteAiReview['items'][number]['priceSource']):string{if(source==='explicit-source')return t('Source price','سعر المصدر');if(source==='customer-last-price')return t('Last customer price','آخر سعر للعميل');if(source==='saved-sale-price')return t('Saved selling price','سعر البيع المحفوظ');if(source==='pricing-policy')return t('Pricing policy','سياسة التسعير');return t('No price','لا يوجد سعر');}
function quoteLine(row:QuoteAiSourceItem,review:QuoteAiReview['items'][number]|undefined,vault:VaultPayload,currency:string):DocumentItem{
  if(review?.matchedItemId)assertAiInboxQuoteProductScope(vault,review.matchedItemId);
  const saved=review?.matchedItemId?vault.savedItems.find(item=>item.id===review.matchedItemId):undefined;
  if(saved){const line=documentItemFromSavedItem(saved);line.quantity=row.quantity;line.unit=row.unit.trim();line.unitPrice=review?.effectiveUnitPrice||row.unitPrice||'';if(!currency||(saved.lastCostCurrency||'').toUpperCase()!==currency.toUpperCase())line.unitCost='';return line;}
  return{id:makeId('item'),descriptionEn:row.descriptionEn,descriptionAr:row.descriptionAr,hsCode:'',origin:'',packing:'',quantity:row.quantity,unit:row.unit.trim(),unitPrice:review?.effectiveUnitPrice||row.unitPrice,unitCost:''};
}
function setPendingSource(route:'customer'|'product_list',file:File,files?:File[]):void{(window as any)[PENDING_SOURCE_KEY]={route,file,files:route==='product_list'?files:undefined,createdAt:Date.now()} satisfies PendingSource;}
function pricingIntentCommand(intent:any):string{
  const mode=String(intent?.mode||'no-change');const percent=String(intent?.percent||'').trim();
  if(mode==='company-policy')return 'use company pricing policy';
  if(mode==='margin'&&percent)return `margin ${percent}%`;
  if(mode==='markup'&&percent)return `markup ${percent}%`;
  if(mode==='increase-percent'&&percent)return `increase ${percent}%`;
  if(mode==='saved-sale-price')return 'use saved sale price';
  if(mode==='last-customer-price')return 'use last customer price';
  return '';
}
function canonicalSearchQuery(result:AiBusinessSearchResult):string{if(result.kind==='document'||result.kind==='purchase')return result.label.split(' — ')[0]?.trim()||result.label;return result.label;}
function sourceCommercialTerms(draft:QuoteAiSourceDraft):string[]{return [draft.incoterm,draft.paymentTerms,draft.deliveryTime,draft.validity,draft.remarks,draft.notes].map(value=>value.trim()).filter(Boolean);}

export class AiWorkflowTools extends React.Component<{compact?:boolean;defaultRoute?:AiInboxRoute;disabled?:boolean},State>{
  private input:HTMLInputElement|null=null;private abort:AbortController|null=null;private recognition:any=null;private generation=0;private pending=false;private saving=false;private mounted=false;private voiceGeneration=0;private voiceRetryTimer:ReturnType<typeof setTimeout>|null=null;private voiceCaptureTimer:ReturnType<typeof setTimeout>|null=null;private voiceReleaseUntil=0;
  state:State={open:false,view:'menu',stage:'idle',file:null,productFiles:[],pastedText:'',classification:null,forcedRoute:null,quote:null,quoteReview:null,quoteCommand:'',quoteCommandMessage:'',supplier:null,supplierProposal:null,error:'',model:'',savedLabel:'',searchQuery:'',searchBusy:false,searchResults:[],listening:false,voiceStarting:false,jobs:readAiJobHistory(),currentJobId:'',savedReference:''};
  componentDidMount():void{this.mounted=true;window.addEventListener('lourex-ai-composer-voice-request',this.onComposerVoiceRequest);window.addEventListener('pagehide',this.onVoicePageHide);document.addEventListener('visibilitychange',this.onVoiceVisibilityChange);}
  componentWillUnmount():void{this.mounted=false;window.removeEventListener('lourex-ai-composer-voice-request',this.onComposerVoiceRequest);window.removeEventListener('pagehide',this.onVoicePageHide);document.removeEventListener('visibilitychange',this.onVoiceVisibilityChange);this.cancelAnalysis();this.stopVoice();}
  private cancelAnalysis=()=>{this.generation++;this.pending=false;this.abort?.abort();this.abort=null;};
  private current=(generation:number,controller:AbortController)=>this.mounted&&generation===this.generation&&!controller.signal.aborted;
  private refreshJobs=()=>this.setState({jobs:readAiJobHistory()});
  private markJob=(patch:Parameters<typeof updateAiJob>[1])=>{if(this.state.currentJobId)updateAiJob(this.state.currentJobId,patch);this.refreshJobs();};
  private busy=()=>this.pending||this.saving||['reading','classifying','extracting','pricing','saving'].includes(this.state.stage);
  private resetInbox=(forcedRoute:AiInboxRoute|null=null)=>{if(this.saving)return;if(this.pending)this.markJob({status:'cancelled',note:t('Analysis cancelled','تم إلغاء التحليل')});this.cancelAnalysis();this.setState({view:'inbox',stage:'idle',file:null,productFiles:[],pastedText:'',classification:null,forcedRoute,quote:null,quoteReview:null,quoteCommand:'',quoteCommandMessage:'',supplier:null,supplierProposal:null,error:'',model:'',savedLabel:'',currentJobId:'',savedReference:''});};
  private openMenu=()=>{if(this.busy())return;this.setState({open:true,view:'menu',error:'',savedLabel:'',jobs:readAiJobHistory()});};
  private close=()=>{if(this.saving||this.state.stage==='saving')return;if(this.busy())this.markJob({status:'cancelled',note:t('Analysis cancelled','تم إلغاء التحليل')});this.cancelAnalysis();this.stopVoice();this.setState({open:false,stage:'idle',error:'',listening:false,voiceStarting:false});};
  private openTool=(eventName:string)=>{if(this.busy())return;this.setState({open:false,error:''});window.setTimeout(()=>window.dispatchEvent(new Event(eventName)),0);};
  private chooseFile=(file:File|null)=>{if(!file||this.busy())return;this.setState({file,productFiles:[file],pastedText:'',classification:null,quote:null,quoteReview:null,quoteCommand:'',quoteCommandMessage:'',supplier:null,supplierProposal:null,error:'',stage:'idle',savedLabel:'',currentJobId:'',savedReference:''});if(this.input)this.input.value='';};
  // Only Product AI accepts multiple files; other workflow contracts stay single-file.
  private chooseProductFiles=(files:File[])=>{
    if(this.busy()||!files.length)return;
    if(files.length>4){this.setState({error:t('Choose up to four product files per review. No files were changed.','اختر حتى أربعة ملفات أصناف في كل مراجعة. لم يُعدّل أي ملف.')});return;}
    const total=files.reduce((sum,file)=>sum+file.size,0);
    if(files.some(file=>!file.size)||total>16_000_000){this.setState({error:t('Product files must be nonempty and total 16 MB or less.','يجب ألا تكون ملفات الأصناف فارغة وأن لا يتجاوز مجموعها 16 ميغابايت.')});return;}
    this.setState({file:files[0]!,productFiles:files,pastedText:'',classification:null,quote:null,quoteReview:null,quoteCommand:'',quoteCommandMessage:'',supplier:null,supplierProposal:null,error:'',stage:'idle',savedLabel:'',currentJobId:'',savedReference:''});
    if(this.input)this.input.value='';
  };
  private payload=async():Promise<{fileName:string;payload:AiPayload}>=>{if(this.state.file)return{fileName:this.state.file.name,payload:await sourcePayload(this.state.file)};const text=this.state.pastedText.trim();if(!text)throw new Error(t('Choose a file or paste business text first.','اختر ملفًا أو الصق نص أعمال أولًا.'));if(text.length>MAX_TEXT_CHARS)throw new Error(t('Text exceeds the analysis limit. Split the source into smaller files.','النص يتجاوز حد التحليل. قسّم المصدر إلى ملفات أصغر.'));return{fileName:t('Pasted text','النص الملصق'),payload:{kind:'text',mimeType:'text/plain',text}};};
  private classify=async()=>{
    if(this.busy())return;
    if(this.state.forcedRoute==='product_list'){
      // Product AI's batch reviewer validates and extracts every file. Do not
      // pre-read only file[0] through the legacy one-file classifier.
      if(!this.state.productFiles.length&&!this.state.pastedText.trim()){
        this.setState({error:t('Choose product sources before starting review.','اختر ملفات الأصناف قبل بدء المراجعة.')});return;
      }
      this.setState({classification:{route:'product_list',documentType:'unknown',confidence:1,reason:t('Selected Product AI review','تم اختيار مراجعة ذكاء الأصناف')},stage:'review',error:''});
      return;
    }
    this.pending=true;const generation=++this.generation,controller=new AbortController();this.abort=controller;
    this.setState({stage:'reading',error:'',classification:null,quote:null,quoteReview:null,quoteCommand:'',quoteCommandMessage:'',supplier:null,supplierProposal:null,savedLabel:''});let jobId='';
    try{
      const source=await this.payload();if(!this.current(generation,controller))return;
      const job=startAiJob(source.fileName);jobId=job.id;this.setState({currentJobId:job.id,jobs:readAiJobHistory()});
      const forced=this.state.forcedRoute;
      if(!forced)this.setState({stage:'classifying'});
      const body=forced?null:await postAi('/api/ai-inbox',source.fileName,source.payload,controller.signal);
      if(!this.current(generation,controller))return;
      const classification=forced?{route:forced,documentType:'unknown',confidence:1,reason:t('Selected workflow','مسار محدد')} as AiInboxClassification:body.classification as AiInboxClassification;
      updateAiJob(job.id,{route:classification.route,documentType:classification.documentType,status:'needs-review',note:classification.reason});
      this.setState({classification,model:String(body?.model||'LOUREX AI'),stage:'review',jobs:readAiJobHistory()});
      await this.extractForRoute(classification.route,source.fileName,source.payload,controller,generation);
    }catch(error){if(!this.current(generation,controller))return;if(jobId)updateAiJob(jobId,{status:'failed',note:error instanceof Error?error.message:String(error)});this.setState({stage:'error',error:error instanceof Error?error.message:String(error),jobs:readAiJobHistory()});}
    finally{if(generation===this.generation){this.pending=false;if(this.mounted)this.setState({});}if(this.abort===controller)this.abort=null;}
  };
  private extractForRoute=async(route:AiInboxRoute,fileName:string,payload:AiPayload,controller:AbortController,generation:number)=>{
    if(!['quote_request','supplier_purchase','supplier'].includes(route))return;this.setState({stage:'extracting',error:''});
    const endpoint=route==='quote_request'?'/api/quote-source-ai':route==='supplier_purchase'?'/api/supplier-document-ai':'/api/supplier-capture-ai';
    const body=await postAi(endpoint,fileName,payload,controller.signal);if(!this.current(generation,controller))return;
    if(route==='quote_request'){
      const quote=body.draft as QuoteAiSourceDraft,resumed=await resumeVaultSession();if(!this.current(generation,controller))return;
      if(!resumed)throw new Error(t('Account workspace is not ready to review pricing. Sign in or retry.','مساحة عمل الحساب غير جاهزة لمراجعة التسعير. سجّل الدخول أو أعد المحاولة.'));
      this.setState({quote,quoteReview:buildQuoteAiReview(scopeVault(resumed.vault),quote),quoteCommand:'',quoteCommandMessage:'',model:String(body.model||'LOUREX AI'),stage:'review'});
    }else if(route==='supplier_purchase')this.setState({supplier:body.draft as SupplierImportDraft,model:String(body.model||'LOUREX AI'),stage:'review'});
    else this.setState({supplierProposal:normalizeSupplierAiProposal(body.proposal),model:String(body.model||'LOUREX AI'),stage:'review'});
  };
  private forceRoute=async(route:AiInboxRoute)=>{
    if(this.busy())return;
    if(route==='product_list'){
      this.setState({classification:{route,documentType:'unknown',confidence:1,reason:t('Selected Product AI review','تم اختيار مراجعة ذكاء الأصناف')},forcedRoute:route,error:'',stage:'review'});return;
    }this.pending=true;const generation=++this.generation,controller=new AbortController();this.abort=controller;
    const documentType=this.state.classification?.documentType||'unknown';this.setState({classification:{route,documentType,confidence:1,reason:t('Chosen manually','تم الاختيار يدويًا')},forcedRoute:route,error:'',stage:'reading'});this.markJob({route,status:'needs-review',note:t('Chosen manually','تم الاختيار يدويًا')});
    try{const source=await this.payload();if(!this.current(generation,controller))return;await this.extractForRoute(route,source.fileName,source.payload,controller,generation);if(this.current(generation,controller))this.setState({stage:'review'});}
    catch(error){if(!this.current(generation,controller))return;this.markJob({status:'failed',note:error instanceof Error?error.message:String(error)});this.setState({stage:'error',error:error instanceof Error?error.message:String(error)});}
    finally{if(generation===this.generation){this.pending=false;if(this.mounted)this.setState({});}if(this.abort===controller)this.abort=null;}
  };
  private handoff=()=>{const route=this.state.classification?.route;if(route!=='customer'&&route!=='product_list')return;const text=this.state.pastedText.trim();const file=this.state.file??(text?new File([text],'AI-Inbox.txt',{type:'text/plain'}):null);if(!file)return;setPendingSource(route,file,route==='product_list'?(this.state.productFiles.length?this.state.productFiles:[file]):undefined);this.markJob({status:'needs-review',note:t('Handed off for review','تم تحويله للمراجعة')});this.setState({open:false});window.dispatchEvent(new CustomEvent('lourex-global-action',{detail:{action:'navigate',target:route==='customer'?'customers':'items'}}));};
  private applyQuoteCommand=async()=>{
    const quote=this.state.quote,command=this.state.quoteCommand.trim();if(!quote||!command||this.busy())return;
    this.pending=true;const generation=++this.generation,controller=new AbortController();this.abort=controller;this.setState({stage:'pricing',error:''});
    try{
      const body=await requestAiJson('/api/quote-pricing-intent',{instruction:command},controller.signal);if(!this.current(generation,controller))return;
      const canonical=pricingIntentCommand(body.intent);if(!canonical){this.setState({quoteCommandMessage:String(body?.intent?.reason||t('This pricing instruction is ambiguous or unsupported. No price was changed.','أمر التسعير غامض أو غير مدعوم. لم يتم تغيير أي سعر.'))});return;}
      const resumed=await resumeVaultSession();if(!this.current(generation,controller))return;if(!resumed)throw new Error(t('Account workspace is not ready to apply pricing. Sign in or retry.','مساحة عمل الحساب غير جاهزة لتطبيق التسعير. سجّل الدخول أو أعد المحاولة.'));
      const result=applyQuoteAiPricingCommand(scopeVault(resumed.vault),quote,canonical);if(!result.applied){this.setState({quoteCommandMessage:t('AI understood the command, but no line could safely apply it. Check matching, cost and currency.','فهم AI الأمر، لكن لم يتمكن أي بند من تطبيقه بأمان. راجع المطابقة والتكلفة والعملة.')});return;}
      this.setState({quote:result.draft,quoteReview:buildQuoteAiReview(scopeVault(resumed.vault),result.draft),quoteCommand:'',quoteCommandMessage:t(`AI interpreted the instruction; LOUREX applied deterministic pricing to ${result.applied} line(s). Review before saving.`,`فسّر AI الأمر؛ وطبق LOUREX التسعير الحتمي على ${result.applied} بند. راجع النتيجة قبل الحفظ.`)});
    }catch(error){if(this.current(generation,controller))this.setState({error:error instanceof Error?error.message:String(error)});}
    finally{if(generation===this.generation){this.pending=false;this.setState({stage:'review'});}if(this.abort===controller)this.abort=null;}
  };
  private saveSupplier=async()=>{const draft=this.state.supplier;if(!draft||this.busy())return;this.saving=true;this.setState({stage:'saving',error:''});try{const next=await mutateVaultSafely(vault=>{assertAiImportSaveAllowed(vault,'supplier-purchase-draft');const scoped=scopeVault(vault);const purchase=buildAiSupplierPurchaseDraft(draft,scoped.purchases,scoped.suppliers,scoped.savedItems);return{...vault,purchases:[...vault.purchases,purchase]};});const saved=next.purchases.at(-1);const label=saved?t(`Purchase draft ${saved.number} saved`,`تم حفظ مسودة الشراء ${saved.number}`):t('Purchase draft saved','تم حفظ مسودة الشراء');this.markJob({status:'completed',note:label});this.setState({stage:'done',supplier:null,savedLabel:label,savedReference:saved?.number||''});}catch(error){this.markJob({status:'failed',note:error instanceof Error?error.message:String(error)});this.setState({stage:'review',error:error instanceof Error?error.message:String(error)});}finally{this.saving=false;}};
  private saveQuote=async()=>{const draft=this.state.quote,review=this.state.quoteReview;if(!draft||!review||this.busy())return;this.saving=true;this.setState({stage:'saving',error:''});try{const next=await mutateVaultSafely(vault=>{assertAiImportSaveAllowed(vault,'quotation-draft');assertAiInboxQuoteReviewFresh(vault,draft,review);const numbered=nextDocumentNumber(vault,'proforma'),now=new Date().toISOString();const customer=resolveAiInboxQuoteCustomer(numbered.vault,review.customer.customerId);let doc=createBlankDocument('proforma',numbered.number,numbered.vault.company);if(customer)doc={...doc,customerSnapshot:customerSnapshotFrom(customer)};const currency=review.currency;doc={...doc,paymentTermPresetId:'',dueDate:'',currency,items:draft.items.map((row,index)=>quoteLine(row,review.items[index],numbered.vault,currency)),terms:{...doc.terms,incoterm:draft.incoterm.trim(),paymentTerms:draft.paymentTerms.trim(),deliveryTime:draft.deliveryTime.trim(),validity:draft.validity.trim(),remarks:draft.remarks.trim()},adjustments:{...doc.adjustments,discountEnabled:false,discountMode:'fixed',discountValue:'0.00',shippingEnabled:false,shipping:'0.00',otherChargesEnabled:false,otherCharges:'0.00',taxEnabled:false,taxPercent:'0'},notes:[draft.notes.trim(),!customer?aiInboxUnlinkedCustomerNote(draft.customerName):'',review.warningCount?t(`AI source review: ${review.warningCount} warning(s) remain for manual review.`,`مراجعة مصدر AI: بقي ${review.warningCount} تنبيه للمراجعة اليدوية.`):''].filter(Boolean).join('\n'),updatedAt:now};return{...numbered.vault,documents:[...numbered.vault.documents,doc],documentEvents:[...numbered.vault.documentEvents,createDocumentEvent(doc,'created')]};});const saved=next.documents.at(-1);const label=saved?t(`Quotation draft ${saved.number} saved for review`,`تم حفظ مسودة عرض السعر ${saved.number} للمراجعة`):t('Quotation draft saved for review','تم حفظ مسودة عرض السعر للمراجعة');this.markJob({status:'completed',note:label});this.setState({stage:'done',quote:null,quoteReview:null,quoteCommand:'',quoteCommandMessage:'',savedLabel:label,savedReference:saved?.number||''});}catch(error){this.markJob({status:'failed',note:error instanceof Error?error.message:String(error)});this.setState({stage:'review',error:error instanceof Error?error.message:String(error)});}finally{this.saving=false;}};
  private supplierProposalSaved=(label:string)=>{this.markJob({status:'completed',note:label});this.setState({stage:'done',supplierProposal:null,savedLabel:label,jobs:readAiJobHistory()});};
  private runMode=(mode:AiWorkflowMode)=>{
    const prompt=aiWorkflowPrompt(mode,isArabic()).slice(0,1000);
    this.setState({open:false},()=>{
      // The workspace owns switching mode and sending. Never auto-submit an
      // advisor request through the currently selected Controller thread.
      const detail:{prompt:string;submit:boolean;handled:boolean}={prompt,submit:true,handled:false};
      window.dispatchEvent(new CustomEvent('lourex-ai-workflow-advisor',{detail}));
      if(!detail.handled)this.setState({open:true,error:t('Open the LOUREX Advisor conversation and retry. No request was sent.','افتح محادثة مستشار LOUREX وأعد المحاولة. لم يتم إرسال أي طلب.')});
    });
  };
  private search=async()=>{const query=this.state.searchQuery.trim();if(!query||this.state.searchBusy)return;this.setState({searchBusy:true,error:''});try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Account workspace is not ready to search records. Sign in or retry.','مساحة عمل الحساب غير جاهزة للبحث في السجلات. سجّل الدخول أو أعد المحاولة.'));this.setState({searchResults:searchBusinessRecords(resumed.vault,query),searchBusy:false});}catch(error){this.setState({searchBusy:false,error:error instanceof Error?error.message:String(error)});}};
  private askAbout=(result:AiBusinessSearchResult)=>{this.setState({open:false});window.dispatchEvent(new CustomEvent('lourex-global-search-open',{detail:{query:canonicalSearchQuery(result),autoOpenUnique:true}}));};
  // Safari may background/suspend without delivering recognition.onend.
  // Cancel the active native lease and retry callbacks, not the editable text.
  private onVoicePageHide=()=>{
    if(!this.recognition&&!this.voiceRetryTimer)return;
    this.stopVoice();
    if(this.mounted)this.setState({listening:false,voiceStarting:false,error:''});
  };
  private onVoiceVisibilityChange=()=>{if(document.hidden)this.onVoicePageHide();};
  // Workflow quick-mic and conversation composer must never own the native microphone together.
  // Safari can report a final transcript before its speech engine releases the device.
  private onComposerVoiceRequest=(event:Event)=>{
    const detail=(event as CustomEvent<{active?:boolean;readyAt?:number}>).detail;
    if(!detail)return;
    const holdingLease=Boolean(this.recognition||this.voiceRetryTimer||this.voiceReleaseUntil>Date.now());
    if(this.recognition||this.voiceRetryTimer){
      this.stopVoice();
      if(this.mounted)this.setState({listening:false,voiceStarting:false});
    }
    if(holdingLease)detail.active=true;
    detail.readyAt=Math.max(detail.readyAt||0,this.voiceReleaseUntil);
  };
  private clearVoiceCaptureTimer=()=>{if(this.voiceCaptureTimer){clearTimeout(this.voiceCaptureTimer);this.voiceCaptureTimer=null;}};
  private stopVoice=()=>{
    this.voiceGeneration++;
    this.clearVoiceCaptureTimer();
    if(this.voiceRetryTimer){clearTimeout(this.voiceRetryTimer);this.voiceRetryTimer=null;}
    const active=this.recognition;this.recognition=null;
    if(active){
      active.onresult=null;active.onerror=null;active.onend=null;active.onstart=null;
      this.voiceReleaseUntil=Math.max(this.voiceReleaseUntil,Date.now()+1600);
      try{active.abort();}catch{try{active.stop();}catch{}}
    }
  };
  private armVoiceDeadline=(recognition:any,generation:number,delay:number,starting:boolean)=>{
    this.clearVoiceCaptureTimer();
    this.voiceCaptureTimer=setTimeout(()=>{
      this.voiceCaptureTimer=null;
      if(!this.mounted||this.recognition!==recognition||generation!==this.voiceGeneration)return;
      this.stopVoice();
      this.setState({listening:false,voiceStarting:false,error:starting?t('Microphone did not become ready. Try again.','لم يجهز الميكروفون في الوقت المحدد. حاول مجددًا.'):t('Voice recording timed out. Try again.','انتهت مهلة التسجيل الصوتي. حاول مجددًا.')});
    },delay);
  };
  private startVoiceSession=(generation:number,attempt:number):void=>{
    if(!this.mounted||generation!==this.voiceGeneration)return;
    const remaining=this.voiceReleaseUntil-Date.now();
    if(remaining>0){
      this.voiceRetryTimer=setTimeout(()=>{this.voiceRetryTimer=null;this.startVoiceSession(generation,attempt);},Math.max(20,remaining));
      this.setState({listening:false,voiceStarting:true,error:''});
      return;
    }
    const Constructor=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!Constructor){this.setState({listening:false,voiceStarting:false,error:t('Voice input is not supported by this browser.','الإدخال الصوتي غير مدعوم في هذا المتصفح.')});return;}
    let recognition:any;
    try{recognition=new Constructor();}catch{this.setState({listening:false,voiceStarting:false,error:t('Microphone could not be started. Retry.','تعذّر بدء الميكروفون. حاول مجددًا.')});return;}
    this.recognition=recognition;
    recognition.lang=isArabic()?'ar-SA':'en-US';recognition.continuous=false;recognition.interimResults=false;recognition.maxAlternatives=1;
    recognition.onstart=()=>{
      if(this.recognition!==recognition||generation!==this.voiceGeneration)return;
      this.armVoiceDeadline(recognition,generation,30000,false);
      this.setState({listening:true,voiceStarting:false,error:''});
    };
    recognition.onresult=(event:any)=>{
      if(this.recognition!==recognition)return;
      const transcript=Array.from(event.results||[]).map((row:any)=>String(row?.[0]?.transcript||'').trim()).filter(Boolean).join(' ').trim();
      this.stopVoice();
      if(transcript)advisorInput(transcript,false);
      if(this.mounted)this.setState({listening:false,voiceStarting:false,error:transcript?'':t('No speech detected. Retry.','لم يتم التعرف على كلام. حاول مجددًا.')});
    };
    recognition.onerror=(event:any)=>{
      if(this.recognition!==recognition)return;
      const code=String(event?.error||'');
      this.stopVoice();
      if(this.mounted)this.setState({listening:false,voiceStarting:false,error:code==='not-allowed'||code==='service-not-allowed'?t('Microphone access was denied. Check Safari microphone permission.','رُفض إذن الميكروفون. تحقق من إذن الميكروفون في Safari.'):code==='audio-capture'?t('Microphone is unavailable. Close other recordings and retry.','الميكروفون غير متاح. أغلق التسجيلات الأخرى ثم حاول مجددًا.'):t('Voice recognition stopped. Retry.','توقف التعرف على الصوت. حاول مجددًا.')});
    };
    recognition.onend=()=>{
      if(this.recognition!==recognition)return;
      this.clearVoiceCaptureTimer();this.recognition=null;this.voiceReleaseUntil=Math.max(this.voiceReleaseUntil,Date.now()+1600);
      if(this.mounted)this.setState({listening:false,voiceStarting:false,error:t('No speech detected. Retry.','لم يتم التعرف على كلام. حاول مجددًا.')});
    };
    this.armVoiceDeadline(recognition,generation,12000,true);
    this.setState({listening:false,voiceStarting:true,error:''});
    try{recognition.start();}
    catch(error){
      if(this.recognition!==recognition)return;
      this.clearVoiceCaptureTimer();this.recognition=null;recognition.onresult=null;recognition.onerror=null;recognition.onend=null;recognition.onstart=null;
      try{recognition.abort?.();}catch{}
      const name=String((error as any)?.name||'').toLowerCase(),message=String((error as any)?.message||'').toLowerCase();
      const denied=name==='notallowederror'||name==='securityerror';
      const transient=!denied&&(name==='invalidstateerror'||name==='aborterror'||name==='notreadableerror'||/microphone|already.*start|busy|in use/.test(message));
      if(transient&&attempt<6){
        this.voiceReleaseUntil=Date.now()+320;
        this.voiceRetryTimer=setTimeout(()=>{this.voiceRetryTimer=null;this.startVoiceSession(generation,attempt+1);},320);
        this.setState({listening:false,voiceStarting:true,error:''});
        return;
      }
      this.voiceReleaseUntil=Math.max(this.voiceReleaseUntil,Date.now()+1600);
      this.setState({listening:false,voiceStarting:false,error:denied?t('Microphone access was denied. Check Safari microphone permission.','رُفض إذن الميكروفون. تحقق من إذن الميكروفون في Safari.'):t('Microphone did not restart. Retry after a moment.','لم يُعد تشغيل الميكروفون. حاول بعد لحظات.')});
    }
  };
  private voice=()=>{
    if(this.recognition||this.voiceRetryTimer){this.stopVoice();this.setState({listening:false,voiceStarting:false});return;}
    const handoff:{active?:boolean;readyAt?:number}={active:false,readyAt:0};
    window.dispatchEvent(new CustomEvent('lourex-ai-workflow-voice-request',{detail:handoff}));
    this.voiceReleaseUntil=Math.max(this.voiceReleaseUntil,handoff.readyAt||0);
    const generation=++this.voiceGeneration;
    this.setState({listening:false,voiceStarting:true,error:''});
    this.startVoiceSession(generation,0);
  };
  private renderMenu=():any=><div><p>{t('Use one clear entry point for LOUREX AI workflows. Deterministic tools open directly; record changes still require review and confirmation.','استخدم مدخلًا واحدًا واضحًا لمسارات ذكاء LOUREX. الأدوات الحتمية تفتح مباشرة، وتبقى تغييرات السجلات بحاجة للمراجعة والتأكيد.')}</p><div className="ta-customer-modal-actions ai-workflow-actions"><Button icon="upload" onClick={()=>this.resetInbox(null)}>{t('AI Inbox','صندوق AI')}</Button><Button icon="file" onClick={()=>this.resetInbox('quote_request')}>{t('File → Quote','ملف ← عرض سعر')}</Button><Button icon="search" onClick={()=>this.openTool('lourex-ai-open-business-search')}>{t('Ask Anything','اسأل عن أي شيء')}</Button><Button icon="file" onClick={()=>this.setState({view:'history',jobs:readAiJobHistory(),error:''})}>{t('Job History','سجل المهام')}</Button></div><div className="ta-customer-modal-actions ai-workflow-actions"><Button onClick={()=>this.runMode('guardian')}>{t('Accounting Guardian','حارس المحاسبة')}</Button><Button onClick={()=>this.openTool('lourex-ai-open-collections')}>{t('Collections','التحصيل')}</Button><Button onClick={()=>this.openTool('lourex-ai-open-cfo')}>CFO</Button><Button onClick={()=>this.openTool('lourex-ai-open-procurement')}>{t('Compare Supplier Offers','مقارنة عروض الموردين')}</Button></div><div className="ta-customer-modal-actions ai-workflow-actions"><Button onClick={()=>this.openTool('lourex-ai-open-daily')}>{t('What matters today','ما المهم اليوم')}</Button><Button onClick={()=>this.openTool('lourex-ai-open-memory')}>{t('Business Memory','ذاكرة الأعمال')}</Button><Button onClick={()=>this.resetInbox('product_list')}>{t('Product AI','ذكاء المنتجات')}</Button><Button onClick={()=>this.resetInbox('supplier')}>{t('Supplier AI','ذكاء الموردين')}</Button></div></div>;
  private renderSearch=():any=><div><Field label={t('Search all LOUREX business records','ابحث في جميع سجلات أعمال LOUREX')}><Input autoFocus value={this.state.searchQuery} onChange={(event:any)=>this.setState({searchQuery:event.target.value})} onKeyDown={(event:any)=>{if(event.key==='Enter'){event.preventDefault();void this.search();}}}/></Field><div className="ta-customer-modal-actions ai-workflow-actions"><Button onClick={()=>this.setState({view:'menu',error:''})}>{t('Back','رجوع')}</Button><Button variant="primary" disabled={this.state.searchBusy||!this.state.searchQuery.trim()} onClick={()=>void this.search()}>{this.state.searchBusy?t('Searching…','جارٍ البحث…'):t('Search','بحث')}</Button></div>{this.state.searchResults.length?<div>{this.state.searchResults.map(result=><button type="button" key={`${result.kind}:${result.id}`} onClick={()=>this.askAbout(result)} style={{display:'block',width:'100%',textAlign:isArabic()?'right':'left',padding:'10px',marginTop:'6px'}}><strong>{result.label}</strong><small style={{display:'block'}}>{result.kind} · {result.detail||'—'}</small></button>)}</div>:this.state.searchQuery&&!this.state.searchBusy?<p>{t('No matching records yet.','لا توجد سجلات مطابقة حتى الآن.')}</p>:null}</div>;
  // Never render cached filenames from a prior UID: #972 scopes sessionStorage,
  // but this component may remain mounted through an authentication change.
  private renderHistory=():any=>{const jobs=readAiJobHistory();return <div><p>{t('Session-only processing history. File contents are not stored here.','سجل معالجة لهذه الجلسة فقط. لا يتم تخزين محتوى الملفات هنا.')}</p>{jobs.length?<div>{jobs.map(job=><article key={job.id} style={{padding:'10px 0'}}><strong><bdi dir="auto">{job.sourceName}</bdi></strong><small style={{display:'block'}}>{job.documentType||'—'} · {job.route||'—'} · {jobStatusLabel(job.status)}</small>{job.note?<small style={{display:'block'}}><bdi dir="auto">{job.note}</bdi></small>:null}</article>)}</div>:<p>{t('No AI jobs in this session yet.','لا توجد مهام AI في هذه الجلسة بعد.')}</p>}<div className="ta-customer-modal-actions ai-workflow-actions"><Button onClick={()=>this.setState({view:'menu'})}>{t('Back','رجوع')}</Button><Button disabled={!jobs.length} onClick={()=>{clearAiJobHistory();this.setState({jobs:[]});}}>{t('Clear history','مسح السجل')}</Button></div></div>;};
  private renderInbox=():any=>{const route=this.state.classification?.route,quote=this.state.quote,review=this.state.quoteReview,supplier=this.state.supplier,busy=this.busy(),hasSource=Boolean(this.state.file||this.state.pastedText.trim());return <div className="lourex-ai-inbox" data-route={this.state.forcedRoute??'auto'}>{this.state.forcedRoute?<strong>{routeLabel(this.state.forcedRoute)}</strong>:null}<p>{this.state.forcedRoute==='product_list'?t('Choose up to four product images, PDFs or spreadsheets. All files are reviewed together before saving.','اختر حتى أربع صور أو ملفات PDF أو جداول أصناف. تُراجع كل الملفات معًا قبل الحفظ.'):t('Drop one business source. LOUREX classifies it, then prepares a review-only result.','أدخل مصدر أعمال واحدًا. يصنفه LOUREX ثم يجهز نتيجة للمراجعة فقط.')}</p><input ref={(node:any)=>{this.input=node;}} type="file" hidden multiple={this.state.forcedRoute==='product_list'} accept={this.state.forcedRoute==='product_list'?'.heic,.heif,image/heic,image/heif,.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.txt,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain':'.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.txt,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain'} onChange={(event:any)=>this.state.forcedRoute==='product_list'?this.chooseProductFiles(Array.from(event.target.files||[]) as File[]):this.chooseFile(event.target.files?.[0]??null)}/><div className="ta-customer-modal-actions ai-workflow-actions"><Button icon="upload" disabled={busy} onClick={()=>this.input?.click()}>{t('Choose File','اختر ملفًا')}</Button><Button variant="primary" disabled={busy||!hasSource} onClick={()=>void this.classify()}>{busy?t('Analyzing…','جارٍ التحليل…'):this.state.forcedRoute===null?t('Route with AI','توجيه بالذكاء الاصطناعي'):t('Analyze','تحليل')}</Button></div>{this.state.file?<p>{(this.state.forcedRoute==='product_list'?this.state.productFiles:[this.state.file]).map((source,index)=><span key={index} style={{display:'block'}}><strong><bdi dir="auto">{source.name}</bdi></strong> · {Math.max(1,Math.round(source.size/1024))} KB</span>)}</p>:null}{!this.state.file?<Field label={t('Or paste business text','أو الصق نص أعمال')}><Textarea rows="4" disabled={busy} value={this.state.pastedText} onChange={(event:any)=>this.setState({pastedText:event.target.value})}/></Field>:null}{this.state.classification?<section><strong>{documentTypeLabel(this.state.classification.documentType)} → {routeLabel(this.state.classification.route)}</strong><p>{this.state.classification.reason} · {Math.round((this.state.classification.confidence||0)*100)}%</p></section>:null}
    {route==='unknown'?<div><p>{t('LOUREX will not mutate an unknown source. Choose the intended workflow manually.','لن يجري LOUREX أي تغيير لمصدر غير معروف. اختر المسار المقصود يدويًا.')}</p><div className="ta-customer-modal-actions ai-workflow-actions"><Button onClick={()=>void this.forceRoute('customer')}>{t('Customer','عميل')}</Button><Button onClick={()=>void this.forceRoute('supplier')}>{t('Supplier','مورد')}</Button><Button onClick={()=>void this.forceRoute('supplier_purchase')}>{t('Supplier Purchase','شراء مورد')}</Button><Button onClick={()=>void this.forceRoute('quote_request')}>{t('Quotation','عرض سعر')}</Button><Button onClick={()=>void this.forceRoute('product_list')}>{t('Products','منتجات')}</Button></div></div>:null}
    {route&&['customer','product_list'].includes(route)?<div><p>{route==='customer'?t('The source will be handed to Customer AI for evidence and duplicate review.','سيتم تسليم المصدر إلى Customer AI لمراجعة الأدلة والتكرار.'):t('PDF, image, spreadsheet and pasted text sources use the same Product AI review.','تستخدم ملفات PDF والصور والجداول والنصوص الملصقة نفس مراجعة Product AI.')}</p>{hasSource?<Button variant="primary" onClick={this.handoff}>{t('Continue to review','متابعة إلى المراجعة')}</Button>:null}</div>:null}
    {route==='supplier'&&this.state.supplierProposal?<SupplierAiProposalReview proposal={this.state.supplierProposal} onSaved={this.supplierProposalSaved}/>:null}
    {route==='supplier_purchase'&&supplier?<div><h3>{t('Purchase draft preview','معاينة مسودة الشراء')}</h3><p>{supplier.supplierName||t('Supplier not identified','لم يتم تحديد المورد')} · {supplier.currency||'—'} · {supplier.items.length} {t('items','أصناف')}</p><ul>{supplier.items.map((item,index)=><li key={index}>{item.sku?`${item.sku} · `:''}{item.descriptionEn||item.descriptionAr} · {item.quantity} {item.unit||t('unit missing','الوحدة مفقودة')} · {item.unitCost}</li>)}</ul><p>{t('Confirming saves a purchase DRAFT only. Missing source date, currency, unit or landed-cost fields remain blank for Operations review. It does not post inventory or accounting.','التأكيد يحفظ مسودة شراء فقط. تبقى حقول التاريخ أو العملة أو الوحدة أو تكاليف الوصول المفقودة فارغة لمراجعتها في العمليات. لا يرحّل مخزونًا أو محاسبة.')}</p><Button variant="primary" disabled={busy} onClick={()=>void this.saveSupplier()}>{t('Confirm & Save Purchase Draft','تأكيد وحفظ مسودة الشراء')}</Button></div>:null}
    {route==='quote_request'&&quote&&review?<div><h3>{t('Quotation draft & pricing review','مراجعة مسودة عرض السعر والتسعير')}</h3><p>{quote.customerName||t('Customer not identified','لم يتم تحديد العميل')} · {review.currency||t('Currency missing','العملة مفقودة')} · {quote.items.length} {t('items','أصناف')} · {review.warningCount} {t('warnings','تنبيهات')}</p>{review.customer.customerId?<p><strong>{t('Customer match','مطابقة العميل')}:</strong> {review.customer.customerName} · {Math.round(review.customer.matchConfidence*100)}%</p>:quote.customerName?<p><strong>{t('Customer match','مطابقة العميل')}:</strong> {t('No exact saved customer match. The draft remains unlinked; AI will not create a customer automatically. Review the customer before issuing.','لا توجد مطابقة دقيقة وفريدة مع عميل محفوظ. ستُحفظ المسودة دون ربط عميل، ولن ينشئ AI سجل عميل تلقائيًا. راجع العميل قبل إصدار المستند.')}</p>:null}<div className="product-import-mapping-note"><Icon name="file"/><span>{sourceCommercialTerms(quote).length?<><strong>{t('Commercial terms explicitly found in the source','الشروط التجارية الموجودة صراحةً في المصدر')}:</strong> <bdi dir="auto">{sourceCommercialTerms(quote).join(' · ')}</bdi></>:t('No commercial terms were explicitly found in the source. LOUREX will keep them blank in this AI draft instead of inserting company/customer defaults silently.','لم يتم العثور على شروط تجارية صريحة في المصدر. سيبقي LOUREX هذه الحقول فارغة في مسودة AI بدل إدخال إعدادات الشركة/العميل بصمت.')}</span></div><div className="product-import-table-wrap"><table className="product-import-table"><thead><tr><th>{t('Product','الصنف')}</th><th>{t('Qty','الكمية')}</th><th>{t('Match','المطابقة')}</th><th>{t('Price','السعر')}</th><th>{t('Cost','التكلفة')}</th><th>{t('Margin','الهامش')}</th><th>{t('Review','المراجعة')}</th></tr></thead><tbody>{quote.items.map((item,index)=>{const row=review.items[index];return <tr key={`${item.sku}-${index}`}><td><strong><bdi dir="auto">{item.descriptionEn||item.descriptionAr||item.sku}</bdi></strong>{item.sku?<small style={{display:'block'}}><bdi dir="ltr">{item.sku}</bdi></small>:null}</td><td><bdi dir="ltr">{item.quantity} {item.unit||'—'}</bdi>{item.quantityConfidence?<small style={{display:'block'}}>{Math.round(item.quantityConfidence*100)}%</small>:null}</td><td>{row?.matchedItemId?<><span>{row.matchedItemName}</span><small style={{display:'block'}}>{Math.round(row.matchConfidence*100)}%</small></>:row?.matchedItemName?<><span>{row.matchedItemName}</span><small style={{display:'block'}}>{t('Likely match — not linked automatically','مطابقة محتملة — لا يتم ربطها تلقائيًا')}</small></>:t('Unknown','غير معروف')}</td><td>{row?.effectiveUnitPrice?<><bdi dir="ltr">{row.effectiveUnitPrice} {review.currency||'?'}</bdi><small style={{display:'block'}}>{priceSourceLabel(row.priceSource)}{row.suggestedPrice&&row.suggestedPrice!==row.effectiveUnitPrice?` · ${t('Policy','السياسة')}: ${row.suggestedPrice}`:''}</small></>:'—'}</td><td>{row?.cost?<bdi dir="ltr">{row.cost} {row.costCurrency||'?'}</bdi>:'—'}</td><td>{row?.marginPercent?<bdi dir="ltr">{row.marginPercent}%</bdi>:'—'}</td><td>{row?.warnings.length?row.warnings.map(warning=><small key={warning} style={{display:'block'}}>{quoteWarningLabel(warning)}</small>):<span>{t('Ready','جاهز')}</span>}{item.quantityNote?<small style={{display:'block'}}><bdi dir="auto">{item.quantityNote}</bdi></small>:null}</td></tr>;})}</tbody></table></div><Field label={t('Pricing command','أمر التسعير')} hint={t('Margin 15%, use last customer price, raise prices 4%, or use company pricing policy. AI interprets the intent; LOUREX calculates locally.','هامش 15%، استخدم آخر سعر للعميل، ارفع الأسعار 4%، أو استخدم سياسة تسعير الشركة. AI يفسر المقصود وLOUREX يحسب محليًا.')}><Input disabled={busy} value={this.state.quoteCommand} onChange={(event:any)=>this.setState({quoteCommand:event.target.value,quoteCommandMessage:''})} onKeyDown={(event:any)=>{if(event.key==='Enter'){event.preventDefault();void this.applyQuoteCommand();}}}/></Field><div className="ta-customer-modal-actions ai-workflow-actions"><Button disabled={busy||!this.state.quoteCommand.trim()} onClick={()=>void this.applyQuoteCommand()}>{t('Apply pricing command','تطبيق أمر التسعير')}</Button><Button variant="primary" disabled={busy} onClick={()=>void this.saveQuote()}>{t('Confirm & Save Quotation Draft','تأكيد وحفظ مسودة عرض السعر')}</Button></div>{this.state.quoteCommandMessage?<p role="status">{this.state.quoteCommandMessage}</p>:null}<p>{review.blockingAttentionCount?t(`${review.blockingAttentionCount} line(s) need explicit manual attention before finalizing later. Saving here creates a draft only.`,`${review.blockingAttentionCount} سطر يحتاج انتباهًا يدويًا صريحًا قبل الإصدار لاحقًا. الحفظ هنا ينشئ مسودة فقط.`):t('Deterministic pricing review found no blocking attention flags. Saving still creates a draft only.','لم تجد مراجعة التسعير الحتمية مؤشرات انتباه مانعة. الحفظ يبقى لمسودة فقط.')}</p></div>:null}
    {this.state.stage==='done'?<div role="status" className="lourex-ai-saved-result"><Icon name="check"/><strong>{this.state.savedLabel}</strong>{this.state.savedReference?<Button variant="primary" onClick={()=>{const reference=this.state.savedReference;this.setState({open:false});window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-global-search-open',{detail:{query:reference,autoOpenUnique:true}})),0);}}>{t('Open saved record','فتح السجل المحفوظ')}</Button>:null}</div>:null}{this.state.error?<div role="alert">{this.state.error}</div>:null}<div className="ta-customer-modal-actions ai-workflow-actions"><Button disabled={busy} onClick={()=>this.setState({view:'menu',stage:'idle',error:''})}>{t('Back','رجوع')}</Button></div></div>;};
  render():any{return <>{this.props.compact?<Button icon="upload" disabled={this.props.disabled} onClick={()=>{this.setState({open:true});this.resetInbox(this.props.defaultRoute??null);}}>{t('Create from file','إنشاء من ملف')}</Button>:<div className="lourex-ai-tools"><Button icon="upload" onClick={()=>{this.setState({open:true});this.resetInbox(null);}}>{t('AI Inbox','صندوق AI')}</Button><Button icon="bot" onClick={this.openMenu}>{t('AI Tools','أدوات AI')}</Button><Button icon={this.state.listening?'x':'microphone'} onClick={this.voice}>{this.state.listening?t('Stop','إيقاف'):this.state.voiceStarting?t('Starting…','جارٍ البدء…'):t('Voice','صوت')}</Button></div>}{this.state.error&&!this.state.open?<div className="lourex-ai-error" role="alert">{this.state.error}</div>:null}<Modal portal appearance="assistant" open={this.state.open} title={this.state.view==='inbox'?t('LOUREX AI Inbox','صندوق LOUREX AI'):this.state.view==='search'?t('LOUREX Business Search','بحث أعمال LOUREX'):this.state.view==='history'?t('AI Job History','سجل مهام AI'):t('LOUREX AI Workflows','مسارات LOUREX AI')} size="lg" onClose={this.close}>{this.state.view==='menu'?this.renderMenu():this.state.view==='search'?this.renderSearch():this.state.view==='history'?this.renderHistory():this.renderInbox()}</Modal></>;}
}
