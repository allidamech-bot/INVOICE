import type { Customer, DocumentItem, LourexDocument } from '../types.js';
import { t } from '../lib/i18n.js';
import { buildAiContext, type AiWorkspaceScreen } from './AiCopilot.js';
import { aiWorkflowPrompt, searchBusinessRecords, type AiBusinessSearchResult, type AiInboxClassification, type AiInboxRoute, type AiWorkflowMode } from '../lib/ai-workflows.js';
import { CUSTOMER_AI_FIELDS, customerAiFieldLabel, customerFromAiProposal, findCustomerDuplicateCandidates, normalizeCustomerAiProposal, normalizeEmail, normalizeName, normalizePhone, type CustomerAiProposal, type CustomerDuplicateCandidate } from '../lib/customer-ai-capture.js';
import { readSpreadsheetFile, spreadsheetSheetsAsText } from '../lib/spreadsheet-reader.js';
import type { SupplierImportDraft } from '../lib/supplier-document-import.js';
import { buildSupplierPurchaseDraft } from './SupplierDocumentImport.js';
import { resumeVaultSession } from '../storage/vault.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { createBlankDocument, nextDocumentNumber } from '../lib/documents.js';
import { customerSnapshotFrom } from '../lib/defaults.js';
import { applyCustomerCommercialDefaults } from '../lib/commercial-controls.js';
import { createDocumentEvent } from '../lib/document-lifecycle.js';
import { documentItemFromSavedItem } from '../lib/saved-items.js';
import { makeId } from '../lib/id.js';

const MAX_BINARY_BYTES=2_600_000;
const MAX_TEXT_CHARS=120_000;

type SourcePayload={kind:'text'|'file';mimeType:string;text?:string;data?:string};
type PowerView='command'|'inbox'|'search'|'answer';
type PowerStage='idle'|'reading'|'classifying'|'extracting'|'ready'|'saving'|'error';

interface QuoteSourceItem{sku:string;descriptionEn:string;descriptionAr:string;quantity:string;unit:string;unitPrice:string;}
interface QuoteSourceDraft{customerName:string;customerEmail:string;customerPhone:string;currency:string;incoterm:string;paymentTerms:string;deliveryTime:string;validity:string;remarks:string;notes:string;items:QuoteSourceItem[];}

interface State{
  host:HTMLElement|null;
  open:boolean;
  view:PowerView;
  stage:PowerStage;
  busy:boolean;
  error:string;
  answer:string;
  answerTitle:string;
  fileName:string;
  classification:AiInboxClassification|null;
  customerProposal:CustomerAiProposal|null;
  customerDuplicates:CustomerDuplicateCandidate[];
  customerTargetId:string;
  quoteDraft:QuoteSourceDraft|null;
  quoteCurrency:string;
  supplierDraft:SupplierImportDraft|null;
  searchQuery:string;
  searchResults:AiBusinessSearchResult[];
  voiceListening:boolean;
}

function bytesToBase64(buffer:ArrayBuffer):string{
  const bytes=new Uint8Array(buffer);let binary='';const chunk=0x8000;
  for(let offset=0;offset<bytes.length;offset+=chunk)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+chunk,bytes.length)));
  return btoa(binary);
}

function currentScreen():AiWorkspaceScreen{
  const shell=document.querySelector<HTMLElement>('.ta-shell');
  const allowed:AiWorkspaceScreen[]=['home','documents','customers','receivables','reports','items','operations','editor'];
  for(const screen of allowed)if(shell?.classList.contains(`screen-${screen}`))return screen;
  return 'home';
}

function arabicUi():boolean{return document.documentElement.dir==='rtl'||document.documentElement.lang.toLowerCase().startsWith('ar');}
function clean(value:unknown,max=500):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function money(value:unknown):string{const text=clean(value,24).replace(/,/g,'');return /^\d{1,12}(?:\.\d{1,4})?$/.test(text)?text:'';}
function quantity(value:unknown):string{const text=clean(value,24).replace(/,/g,'');return /^\d{1,12}(?:\.\d{1,4})?$/.test(text)?text:'';}

async function sourcePayload(file:File):Promise<SourcePayload>{
  const name=file.name.toLowerCase();
  if(name.endsWith('.xlsx')||name.endsWith('.xls')||name.endsWith('.csv')){
    if(file.size>12_000_000)throw new Error(t('This spreadsheet is larger than 12 MB. Split it before AI review.','حجم الجدول أكبر من 12 MB. قسّمه قبل مراجعة AI.'));
    const sheets=await readSpreadsheetFile(file);
    const text=spreadsheetSheetsAsText(sheets,MAX_TEXT_CHARS);
    if(!text.trim())throw new Error(t('No readable business data was found in this spreadsheet.','لم يتم العثور على بيانات أعمال قابلة للقراءة في الجدول.'));
    return {kind:'text',mimeType:'text/csv',text};
  }
  if(name.endsWith('.txt')){
    const text=(await file.text()).slice(0,MAX_TEXT_CHARS);
    if(!text.trim())throw new Error(t('This text file is empty.','الملف النصي فارغ.'));
    return {kind:'text',mimeType:'text/plain',text};
  }
  const mime=file.type||(name.endsWith('.pdf')?'application/pdf':name.endsWith('.png')?'image/png':name.endsWith('.webp')?'image/webp':name.endsWith('.jpg')||name.endsWith('.jpeg')?'image/jpeg':'');
  if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime))throw new Error(t('Use PDF, PNG, JPG, WEBP, Excel, CSV or TXT.','استخدم PDF أو PNG أو JPG أو WEBP أو Excel أو CSV أو TXT.'));
  if(file.size>MAX_BINARY_BYTES)throw new Error(t('This PDF/image is too large for safe AI review. Reduce it below 2.6 MB.','ملف PDF/الصورة كبير للمراجعة الآمنة. خفّضه لأقل من 2.6 MB.'));
  return {kind:'file',mimeType:mime,data:bytesToBase64(await file.arrayBuffer())};
}

async function postJson(path:string,body:any,timeoutMs=22000):Promise<any>{
  const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice'},body:JSON.stringify(body),signal:controller.signal});
    let payload:any={};try{payload=await response.json();}catch{}
    if(!response.ok)throw new Error(String(payload?.message||t('LOUREX AI could not complete this request.','تعذر على ذكاء LOUREX إكمال هذا الطلب.')));
    return payload;
  }catch(error){
    if(controller.signal.aborted)throw new Error(t('AI review took too long. Nothing was saved.','استغرقت مراجعة AI وقتًا طويلًا. لم يتم حفظ شيء.'));
    throw error;
  }finally{window.clearTimeout(timeout);}
}

function quoteLanguage(draft:QuoteSourceDraft):'en'|'ar'|'bilingual'{
  const ar=draft.items.some(item=>Boolean(item.descriptionAr));const en=draft.items.some(item=>Boolean(item.descriptionEn));
  return ar&&en?'bilingual':ar?'ar':'en';
}

function matchQuoteCustomer(customers:Customer[],draft:QuoteSourceDraft):Customer|undefined{
  const email=normalizeEmail(draft.customerEmail),phone=normalizePhone(draft.customerPhone),name=normalizeName(draft.customerName);
  return customers.find(customer=>(email&&normalizeEmail(customer.email)===email)||(phone&&normalizePhone(customer.phone)===phone)||(name&&[customer.companyNameEn,customer.companyNameAr].some(value=>normalizeName(value)===name)));
}

function matchQuoteItem(items:any[],row:QuoteSourceItem):any|undefined{
  const sku=clean(row.sku,60).toUpperCase();if(sku){const exact=items.find(item=>clean(item.sku,60).toUpperCase()===sku);if(exact)return exact;}
  const en=normalizeName(row.descriptionEn),ar=normalizeName(row.descriptionAr);
  return items.find(item=>(en&&normalizeName(item.descriptionEn)===en)||(ar&&normalizeName(item.descriptionAr)===ar));
}

function quoteDocumentLine(row:QuoteSourceItem,vault:any):DocumentItem{
  const saved=matchQuoteItem(vault.savedItems,row);const base:DocumentItem=saved?documentItemFromSavedItem(saved):{id:makeId('item'),descriptionEn:'',descriptionAr:'',hsCode:'',origin:'',packing:'',quantity:'1',unit:'PCS',unitPrice:'',unitCost:''};
  return {...base,descriptionEn:clean(row.descriptionEn,180)||base.descriptionEn,descriptionAr:clean(row.descriptionAr,180)||base.descriptionAr,quantity:quantity(row.quantity)||'1',unit:clean(row.unit,40)||base.unit||'PCS',unitPrice:money(row.unitPrice)};
}

const POWER_CSS=`
.lourex-ai-power-host{margin:0 0 9px}.lourex-ai-power-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.lourex-ai-power-strip button{min-height:34px;border:1px solid var(--ft-line);border-radius:9px;background:var(--ft-input);color:var(--ft-text);font:700 10px/1.2 Inter,"Noto Sans Arabic",sans-serif;cursor:pointer;padding:6px}.lourex-ai-power-strip button:hover{border-color:var(--ft-accent);background:var(--ft-accent-faint)}.lourex-ai-power-strip button.is-listening{border-color:var(--ft-accent);box-shadow:0 0 0 2px var(--ft-accent-faint)}
.lourex-power-backdrop{position:fixed;inset:0;z-index:1190;background:rgba(0,0,0,.48);backdrop-filter:blur(3px)}.lourex-power-modal{position:fixed;z-index:1191;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(720px,calc(100vw - 28px));max-height:min(82dvh,820px);overflow:auto;border:1px solid var(--ft-line-strong);border-radius:18px;background:var(--ft-surface);color:var(--ft-text);box-shadow:var(--ft-shadow-pop);padding:18px;box-sizing:border-box}.lourex-power-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.lourex-power-head strong{font-size:16px}.lourex-power-head p{margin:4px 0 0;color:var(--ft-text-soft);font-size:12px;line-height:1.5}.lourex-power-close{border:0;background:transparent;color:var(--ft-text-soft);font-size:24px;cursor:pointer}.lourex-power-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.lourex-power-card{border:1px solid var(--ft-line);border-radius:12px;background:var(--ft-surface-2);padding:12px;text-align:start;color:var(--ft-text);cursor:pointer}.lourex-power-card strong{display:block;font-size:13px}.lourex-power-card span{display:block;margin-top:5px;color:var(--ft-text-soft);font-size:11px;line-height:1.4}.lourex-power-section{border:1px solid var(--ft-line);border-radius:12px;background:var(--ft-surface-2);padding:12px;margin-top:10px}.lourex-power-section h4{margin:0 0 8px;font-size:13px}.lourex-power-note{color:var(--ft-text-soft);font-size:11px;line-height:1.5}.lourex-power-error{padding:10px;border-radius:10px;background:rgba(160,55,55,.13);color:#e7aaaa;font-size:12px}.lourex-power-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:14px}.lourex-power-actions button,.lourex-power-upload,.lourex-power-search button{border:1px solid var(--ft-line);border-radius:10px;background:var(--ft-input);color:var(--ft-text);font-weight:700;padding:9px 12px;cursor:pointer}.lourex-power-actions button.primary,.lourex-power-upload.primary,.lourex-power-search button.primary{background:var(--ft-accent);border-color:var(--ft-accent);color:var(--ft-on-accent,#fff)}.lourex-power-upload input{display:none}.lourex-power-route{display:flex;gap:8px;align-items:center;padding:9px 10px;border:1px solid var(--ft-line);border-radius:10px;background:var(--ft-workspace);font-size:12px}.lourex-power-route b{color:var(--ft-accent)}.lourex-power-table{width:100%;border-collapse:collapse;font-size:11px}.lourex-power-table th,.lourex-power-table td{padding:7px 6px;border-bottom:1px solid var(--ft-line);text-align:start;vertical-align:top}.lourex-power-table th{color:var(--ft-text-soft);font-weight:700}.lourex-power-confidence{font-variant-numeric:tabular-nums;color:var(--ft-text-soft)}.lourex-power-search{display:flex;gap:8px}.lourex-power-search input,.lourex-power-select,.lourex-power-currency{min-width:0;flex:1;border:1px solid var(--ft-line);border-radius:10px;background:var(--ft-input);color:var(--ft-text);padding:10px;outline:none}.lourex-power-results{display:grid;gap:7px;margin-top:10px}.lourex-power-result{border:1px solid var(--ft-line);border-radius:10px;background:var(--ft-workspace);padding:9px}.lourex-power-result strong{display:block;font-size:12px}.lourex-power-result span{display:block;margin-top:3px;color:var(--ft-text-soft);font-size:10px}.lourex-power-answer{white-space:pre-wrap;line-height:1.65;font-size:13px}.lourex-power-items{max-height:260px;overflow:auto}.lourex-power-busy{padding:22px 8px;text-align:center;color:var(--ft-text-soft);font-size:12px}
@media(max-width:720px){.lourex-power-modal{top:auto;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));transform:none;width:auto;max-height:86dvh;border-radius:18px}.lourex-power-grid{grid-template-columns:1fr}.lourex-ai-power-strip{grid-template-columns:repeat(4,minmax(0,1fr))}.lourex-ai-power-strip button{font-size:9px;padding-inline:4px}.lourex-power-table{font-size:10px}.lourex-power-table th:nth-child(3),.lourex-power-table td:nth-child(3){display:none}}
`;

export class AiPowerBridge extends React.Component<{},State>{
  private observer:MutationObserver|null=null;
  private fileInput:HTMLInputElement|null=null;
  private recognition:any=null;

  state:State={host:null,open:false,view:'command',stage:'idle',busy:false,error:'',answer:'',answerTitle:'',fileName:'',classification:null,customerProposal:null,customerDuplicates:[],customerTargetId:'new',quoteDraft:null,quoteCurrency:'',supplierDraft:null,searchQuery:'',searchResults:[],voiceListening:false};

  componentDidMount():void{
    this.syncHost();
    this.observer=new MutationObserver(()=>this.syncHost());
    this.observer.observe(document.body,{childList:true,subtree:true});
  }

  componentWillUnmount():void{this.observer?.disconnect();try{this.recognition?.abort?.();}catch{}}

  private syncHost=()=>{
    const compose=document.querySelector<HTMLElement>('.lourex-ai-compose');
    if(!compose){if(this.state.host)this.setState({host:null});return;}
    let host=compose.querySelector<HTMLElement>('[data-lourex-ai-power-host]');
    if(!host){host=document.createElement('div');host.dataset.lourexAiPowerHost='true';host.className='lourex-ai-power-host';const form=compose.querySelector('form');compose.insertBefore(host,form||compose.firstChild);}
    if(this.state.host!==host)this.setState({host});
  };

  private resetWork=(view:PowerView)=>this.setState({open:true,view,stage:'idle',busy:false,error:'',answer:'',answerTitle:'',fileName:'',classification:null,customerProposal:null,customerDuplicates:[],customerTargetId:'new',quoteDraft:null,quoteCurrency:'',supplierDraft:null,searchResults:view==='search'?this.state.searchResults:[]});
  private close=()=>this.setState({open:false,error:'',busy:false,voiceListening:false});

  private askCore=async(prompt:string,title:string)=>{
    this.setState({open:true,view:'answer',busy:true,error:'',answer:'',answerTitle:title});
    try{
      const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before using AI analysis.','افتح قفل LOUREX قبل استخدام تحليل AI.'));
      const financeSource={documents:resumed.vault.documents,payments:resumed.vault.payments,customers:resumed.vault.customers,activeDocument:null};
      const context=buildAiContext(currentScreen(),arabicUi()?'ar':'en',financeSource,resumed.vault,prompt,null);
      const payload=await postJson('/api/ai-core',{message:prompt,context},26000);
      this.setState({busy:false,answer:clean(payload?.answer,6000)||t('No useful answer was produced.','لم يتم إنتاج إجابة مفيدة.')});
    }catch(error){this.setState({busy:false,error:error instanceof Error?error.message:String(error)});}
  };

  private runMode=(mode:AiWorkflowMode)=>void this.askCore(aiWorkflowPrompt(mode,arabicUi()),this.modeLabel(mode));
  private modeLabel=(mode:AiWorkflowMode):string=>({guardian:t('Accounting Guardian','حارس المحاسبة'),collections:t('Collections','التحصيل'),cfo:'CFO',daily:t('Daily Command Center','مركز القيادة اليومي'),memory:t('Business Memory','ذاكرة الأعمال'),products:t('Product Intelligence','ذكاء المنتجات'),suppliers:t('Supplier Intelligence','ذكاء الموردين')})[mode];

  private classify=async(file:File|null)=>{
    if(!file||this.state.busy)return;
    this.setState({open:true,view:'inbox',stage:'reading',busy:true,error:'',fileName:file.name,classification:null,customerProposal:null,customerDuplicates:[],customerTargetId:'new',quoteDraft:null,quoteCurrency:'',supplierDraft:null});
    try{
      const payload=await sourcePayload(file);this.setState({stage:'classifying'});
      const body=await postJson('/api/ai-inbox',{fileName:file.name,...payload},18000);
      const classification=body?.classification as AiInboxClassification;if(!classification)throw new Error(t('LOUREX could not classify this source.','لم يتمكن LOUREX من تصنيف هذا المصدر.'));
      this.setState({classification,stage:'extracting'});
      await this.prepareRoute(classification.route,file,payload);
    }catch(error){this.setState({stage:'error',busy:false,error:error instanceof Error?error.message:String(error)});}
    finally{if(this.fileInput)this.fileInput.value='';}
  };

  private prepareRoute=async(route:AiInboxRoute,file:File,payload:SourcePayload)=>{
    if(route==='customer'){
      const body=await postJson('/api/customer-capture-ai',{fileName:file.name,...payload},24000);const proposal=normalizeCustomerAiProposal(body?.proposal);
      const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before reviewing customer data.','افتح قفل LOUREX قبل مراجعة بيانات العميل.'));
      const candidate=customerFromAiProposal(proposal);const duplicates=findCustomerDuplicateCandidates(resumed.vault.customers,candidate);
      this.setState({customerProposal:proposal,customerDuplicates:duplicates,stage:'ready',busy:false});return;
    }
    if(route==='quote_request'){
      const body=await postJson('/api/quote-source-ai',{fileName:file.name,...payload},26000);const draft=body?.draft as QuoteSourceDraft;if(!draft?.items?.length)throw new Error(t('No reliable quotation lines were found.','لم يتم العثور على بنود عرض سعر موثوقة.'));
      const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before reviewing a quotation draft.','افتح قفل LOUREX قبل مراجعة مسودة عرض السعر.'));
      const fallback=resumed.vault.appSettings.smartDefaults.currency||resumed.vault.company.defaultCurrency||'USD';
      this.setState({quoteDraft:draft,quoteCurrency:(draft.currency||fallback).toUpperCase(),stage:'ready',busy:false});return;
    }
    if(route==='supplier_purchase'){
      const body=await postJson('/api/supplier-document-ai',{fileName:file.name,...payload},26000);const draft=body?.draft as SupplierImportDraft;if(!draft?.items?.length)throw new Error(t('No reliable supplier purchase lines were found.','لم يتم العثور على بنود شراء موثوقة من المورد.'));
      this.setState({supplierDraft:draft,stage:'ready',busy:false});return;
    }
    if(route==='product_list'){
      this.setState({stage:'ready',busy:false,answer:t('This source looks like a product catalog or price list. LOUREX will keep it out of accounting and route it to Products & Inventory, where the existing review-first importer handles mapping, duplicates and prices.','يبدو هذا المصدر ككتالوج أو قائمة أسعار. سيبقيه LOUREX خارج المحاسبة ويوجهه إلى المنتجات والمخزون، حيث يتولى المستورد الحالي الربط والمكررات والأسعار مع المراجعة أولًا.')});return;
    }
    this.setState({stage:'ready',busy:false,answer:t('LOUREX could not determine a safe automatic destination. No data was changed.','لم يتمكن LOUREX من تحديد وجهة تلقائية آمنة. لم يتم تغيير أي بيانات.')});
  };

  private saveCustomer=async()=>{
    const proposal=this.state.customerProposal;if(!proposal||this.state.busy)return;this.setState({busy:true,stage:'saving',error:''});
    try{
      const target=this.state.customerTargetId;
      await mutateVaultSafely(vault=>{
        const existing=target==='new'?undefined:vault.customers.find(customer=>customer.id===target);if(target!=='new'&&!existing)throw new Error(t('The selected customer no longer exists.','العميل المحدد لم يعد موجودًا.'));
        const customer=customerFromAiProposal(proposal,existing);const customers=existing?vault.customers.map(row=>row.id===existing.id?customer:row):[...vault.customers,customer];return {...vault,customers};
      });
      this.setState({busy:false,stage:'ready',answer:t('Customer saved after your approval.','تم حفظ العميل بعد موافقتك.'),customerProposal:null});
    }catch(error){this.setState({busy:false,stage:'ready',error:error instanceof Error?error.message:String(error)});}
  };

  private saveSupplierDraft=async()=>{
    const extracted=this.state.supplierDraft;if(!extracted||this.state.busy)return;this.setState({busy:true,stage:'saving',error:''});
    try{
      await mutateVaultSafely(vault=>{const purchase=buildSupplierPurchaseDraft(extracted,vault.purchases,vault.suppliers,vault.savedItems,vault.appSettings.smartDefaults.currency||vault.company.defaultCurrency);return {...vault,purchases:[...vault.purchases,purchase]};});
      this.setState({busy:false,stage:'ready',answer:t('Purchase draft saved. Inventory and accounting were not posted.','تم حفظ مسودة الشراء. لم يتم ترحيل المخزون أو المحاسبة.'),supplierDraft:null});
    }catch(error){this.setState({busy:false,stage:'ready',error:error instanceof Error?error.message:String(error)});}
  };

  private saveQuoteDraft=async()=>{
    const extracted=this.state.quoteDraft;if(!extracted||this.state.busy)return;const currency=this.state.quoteCurrency.trim().toUpperCase();if(!/^[A-Z]{3}$/.test(currency)){this.setState({error:t('Use a 3-letter currency such as USD, EUR or SAR.','استخدم عملة من 3 أحرف مثل USD أو EUR أو SAR.')});return;}this.setState({busy:true,stage:'saving',error:''});
    try{
      await mutateVaultSafely(vault=>{
        const next=nextDocumentNumber(vault,'proforma');let doc=createBlankDocument('proforma',next.number,vault.company);const customer=matchQuoteCustomer(vault.customers,extracted);if(customer)doc=applyCustomerCommercialDefaults({...doc,customerSnapshot:customerSnapshotFrom(customer)},customer,vault.company);
        const now=new Date().toISOString();const updated:LourexDocument={...doc,currency,language:quoteLanguage(extracted),items:extracted.items.map(row=>quoteDocumentLine(row,vault)),terms:{...doc.terms,incoterm:clean(extracted.incoterm,80)||doc.terms.incoterm,paymentTerms:clean(extracted.paymentTerms,160)||doc.terms.paymentTerms,deliveryTime:clean(extracted.deliveryTime,160)||doc.terms.deliveryTime,validity:clean(extracted.validity,100)||doc.terms.validity,remarks:clean(extracted.remarks,500)||doc.terms.remarks},notes:clean(extracted.notes,500),status:'draft',createdAt:now,updatedAt:now};
        return {...next.vault,documents:[...next.vault.documents,updated],documentEvents:[...next.vault.documentEvents,createDocumentEvent(updated,'created')]};
      });
      this.setState({busy:false,stage:'ready',answer:t('Quotation draft saved after your approval. It was not finalized or sent.','تم حفظ مسودة عرض السعر بعد موافقتك. لم يتم اعتمادها أو إرسالها.'),quoteDraft:null});
    }catch(error){this.setState({busy:false,stage:'ready',error:error instanceof Error?error.message:String(error)});}
  };

  private runSearch=async()=>{
    const query=this.state.searchQuery.trim();if(!query||this.state.busy)return;this.setState({busy:true,error:''});
    try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before searching business records.','افتح قفل LOUREX قبل البحث في سجلات الأعمال.'));this.setState({searchResults:searchBusinessRecords(resumed.vault,query,30),busy:false});}
    catch(error){this.setState({busy:false,error:error instanceof Error?error.message:String(error)});}
  };

  private openProducts=()=>{
    const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('.ta-nav-item'));const button=buttons.find(item=>{const text=item.textContent||'';return text.includes('Products')||text.includes('المنتجات');});if(button){button.click();this.close();}else this.setState({error:t('Close the document editor first, then open Products & Inventory.','أغلق محرر المستند أولًا ثم افتح المنتجات والمخزون.')});
  };

  private startVoice=()=>{
    if(this.state.voiceListening)return;const Speech=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;if(!Speech){this.setState({open:true,view:'answer',error:t('Voice recognition is not supported by this browser. You can still type in LOUREX Advisor.','التعرف الصوتي غير مدعوم في هذا المتصفح. ما زال بإمكانك الكتابة في مستشار LOUREX.'),answerTitle:t('Voice AI','الذكاء الصوتي')});return;}
    try{
      const recognition=new Speech();this.recognition=recognition;recognition.lang=arabicUi()?'ar-SA':'en-US';recognition.interimResults=false;recognition.maxAlternatives=1;
      recognition.onstart=()=>this.setState({voiceListening:true,error:''});recognition.onerror=()=>this.setState({voiceListening:false,error:t('Voice recognition stopped before a usable request was captured.','توقف التعرف الصوتي قبل التقاط طلب قابل للاستخدام.')});
      recognition.onend=()=>this.setState({voiceListening:false});recognition.onresult=(event:any)=>{const transcript=clean(event?.results?.[0]?.[0]?.transcript,1000);if(transcript)void this.askCore(transcript,t('Voice request','طلب صوتي'));};recognition.start();
    }catch(error){this.setState({voiceListening:false,error:error instanceof Error?error.message:String(error)});}
  };

  private routeLabel=(route:AiInboxRoute):string=>({customer:t('Customer identity','بيانات عميل'),supplier_purchase:t('Supplier purchase','شراء من مورد'),quote_request:t('Quotation request','طلب عرض سعر'),product_list:t('Product list','قائمة منتجات'),unknown:t('Unknown','غير محدد')})[route];

  private renderCommand=()=>{
    const modes:AiWorkflowMode[]=['daily','guardian','collections','cfo','memory','products','suppliers'];
    return <><div className="lourex-power-grid">{modes.map(mode=><button type="button" className="lourex-power-card" key={mode} disabled={this.state.busy} onClick={()=>this.runMode(mode)}><strong>{this.modeLabel(mode)}</strong><span>{mode==='daily'?t('Today, changes and priorities','اليوم والتغيرات والأولويات'):mode==='guardian'?t('Deterministic accounting and data checks','فحوص محاسبية وبيانات حتمية'):mode==='collections'?t('Overdue, aging and next follow-up','المتأخرات والأعمار وخطوة المتابعة'):mode==='cfo'?t('Sales, collections, profit and exposure','المبيعات والتحصيل والربح والتعرض'):mode==='memory'?t('Derived patterns; nothing stored permanently','أنماط مشتقة؛ لا حفظ دائم'):mode==='products'?t('Pricing, costs, duplicates and dormancy','التسعير والتكاليف والتكرار والخمول'):t('Same-item supplier and landed-cost signals','إشارات الموردين وتكلفة الوصول لنفس الصنف')}</span></button>)}</div><p className="lourex-power-note">{t('These modes read the same deterministic LOUREX engines. They do not create accounting entries and they keep currencies separate.','هذه الأوضاع تقرأ نفس محركات LOUREX الحتمية. لا تنشئ قيودًا محاسبية وتبقي العملات منفصلة.')}</p></>;
  };

  private renderSearch=()=> <><div className="lourex-power-search"><input value={this.state.searchQuery} onChange={(event:any)=>this.setState({searchQuery:event.target.value})} onKeyDown={(event:any)=>{if(event.key==='Enter'){event.preventDefault();void this.runSearch();}}} placeholder={t('Customer, document no., SKU, supplier…','عميل، رقم مستند، SKU، مورد…')}/><button type="button" className="primary" disabled={this.state.busy||!this.state.searchQuery.trim()} onClick={()=>void this.runSearch()}>{t('Search','بحث')}</button></div><div className="lourex-power-results">{this.state.searchResults.map(result=><div className="lourex-power-result" key={`${result.kind}-${result.id}`}><strong>{result.label}</strong><span>{result.kind} · {result.detail||result.id}</span></div>)}</div>{!this.state.busy&&this.state.searchQuery&&this.state.searchResults.length===0?<p className="lourex-power-note">{t('No matching local business records.','لا توجد سجلات أعمال محلية مطابقة.')}</p>:null}</>;

  private renderCustomerReview=()=>{
    const proposal=this.state.customerProposal;if(!proposal)return null;
    return <><div className="lourex-power-section"><h4>{t('Customer proposal','اقتراح العميل')}</h4><table className="lourex-power-table"><thead><tr><th>{t('Field','الحقل')}</th><th>{t('Value','القيمة')}</th><th>{t('Evidence','الدليل')}</th><th>{t('Confidence','الثقة')}</th></tr></thead><tbody>{CUSTOMER_AI_FIELDS.map(key=>{const row=proposal.fields[key];return row.value?<tr key={key}><td>{customerAiFieldLabel(key,arabicUi())}</td><td><bdi dir="auto">{row.value}</bdi></td><td><bdi dir="auto">{[row.sourceFile,row.sourcePage?`p.${row.sourcePage}`:'',row.sourceExcerpt].filter(Boolean).join(' · ')}</bdi></td><td className="lourex-power-confidence">{Math.round(row.confidence*100)}%</td></tr>:null;})}</tbody></table></div>{this.state.customerDuplicates.length?<div className="lourex-power-section"><h4>{t('Possible existing customer','عميل موجود محتمل')}</h4><p className="lourex-power-note">{t('Choose whether this proposal creates a new customer or updates one of the matched customers. Nothing is merged automatically.','اختر هل ينشئ هذا الاقتراح عميلًا جديدًا أو يحدث أحد العملاء المطابقين. لا يتم الدمج تلقائيًا.')}</p><select className="lourex-power-select" value={this.state.customerTargetId} onChange={(event:any)=>this.setState({customerTargetId:event.target.value})}><option value="new">{t('Create new customer','إنشاء عميل جديد')}</option>{this.state.customerDuplicates.map(row=><option value={row.customer.id} key={row.customer.id}>{row.customer.companyNameEn||row.customer.companyNameAr||row.customer.contactPerson} · {row.reasons.join(', ')}</option>)}</select></div>:null}<div className="lourex-power-actions"><button type="button" onClick={this.close}>{t('Cancel','إلغاء')}</button><button type="button" className="primary" disabled={this.state.busy} onClick={()=>void this.saveCustomer()}>{t('Approve & Save Customer','موافقة وحفظ العميل')}</button></div></>;
  };

  private renderQuoteReview=()=>{
    const draft=this.state.quoteDraft;if(!draft)return null;
    return <><div className="lourex-power-section"><h4>{t('Quotation proposal','اقتراح عرض السعر')}</h4><p className="lourex-power-note"><bdi dir="auto">{draft.customerName||t('Customer not linked','العميل غير مربوط')}</bdi></p><label className="lourex-power-note">{t('Currency','العملة')}<input className="lourex-power-currency" maxLength={3} value={this.state.quoteCurrency} onChange={(event:any)=>this.setState({quoteCurrency:event.target.value.toUpperCase()})}/></label><div className="lourex-power-items"><table className="lourex-power-table"><thead><tr><th>{t('Item','الصنف')}</th><th>{t('Qty','الكمية')}</th><th>{t('Unit','الوحدة')}</th><th>{t('Price','السعر')}</th></tr></thead><tbody>{draft.items.map((row,index)=><tr key={`${row.sku}-${index}`}><td><bdi dir="auto">{row.sku?`${row.sku} · `:''}{row.descriptionEn||row.descriptionAr}</bdi></td><td>{row.quantity}</td><td>{row.unit}</td><td>{row.unitPrice||'—'}</td></tr>)}</tbody></table></div></div><p className="lourex-power-note">{t('Missing prices stay empty. Saving creates a draft only; it never finalizes or sends it.','الأسعار غير الموجودة تبقى فارغة. الحفظ ينشئ مسودة فقط ولا يعتمدها أو يرسلها.')}</p><div className="lourex-power-actions"><button type="button" onClick={this.close}>{t('Cancel','إلغاء')}</button><button type="button" className="primary" disabled={this.state.busy} onClick={()=>void this.saveQuoteDraft()}>{t('Approve & Save Quotation Draft','موافقة وحفظ مسودة العرض')}</button></div></>;
  };

  private renderSupplierReview=()=>{
    const draft=this.state.supplierDraft;if(!draft)return null;
    return <><div className="lourex-power-section"><h4>{t('Supplier purchase proposal','اقتراح شراء من المورد')}</h4><p className="lourex-power-note"><bdi dir="auto">{draft.supplierName||t('Supplier not linked','المورد غير مربوط')} · {draft.documentNumber||'—'} · {draft.currency||'—'}</bdi></p><div className="lourex-power-items"><table className="lourex-power-table"><thead><tr><th>{t('Item','الصنف')}</th><th>{t('Qty','الكمية')}</th><th>{t('Unit','الوحدة')}</th><th>{t('Cost','التكلفة')}</th></tr></thead><tbody>{draft.items.map((row,index)=><tr key={`${row.sku}-${index}`}><td><bdi dir="auto">{row.sku?`${row.sku} · `:''}{row.descriptionEn||row.descriptionAr}</bdi></td><td>{row.quantity}</td><td>{row.unit}</td><td>{row.unitCost}</td></tr>)}</tbody></table></div></div><p className="lourex-power-note">{t('Approval saves a purchase draft only. Inventory and accounting remain untouched until the normal Operations posting flow.','الموافقة تحفظ مسودة شراء فقط. يبقى المخزون والمحاسبة دون تغيير حتى مسار الترحيل الطبيعي في العمليات.')}</p><div className="lourex-power-actions"><button type="button" onClick={this.close}>{t('Cancel','إلغاء')}</button><button type="button" className="primary" disabled={this.state.busy} onClick={()=>void this.saveSupplierDraft()}>{t('Approve & Save Purchase Draft','موافقة وحفظ مسودة الشراء')}</button></div></>;
  };

  private renderInbox=()=> <><label className="lourex-power-upload primary"><input ref={(node:any)=>{this.fileInput=node;}} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.txt,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain" onChange={(event:any)=>void this.classify(event.target.files?.[0]??null)}/>{t('Choose business file','اختر ملف أعمال')}</label>{this.state.classification?<div className="lourex-power-route"><span>{t('Detected route','المسار المكتشف')}:</span><b>{this.routeLabel(this.state.classification.route)}</b><span>{Math.round(this.state.classification.confidence*100)}%</span></div>:null}{this.state.customerProposal?this.renderCustomerReview():this.state.quoteDraft?this.renderQuoteReview():this.state.supplierDraft?this.renderSupplierReview():null}{this.state.classification?.route==='product_list'&&this.state.stage==='ready'?<div className="lourex-power-actions"><button type="button" className="primary" onClick={this.openProducts}>{t('Open Products & Inventory','فتح المنتجات والمخزون')}</button></div>:null}{this.state.answer?<div className="lourex-power-section lourex-power-answer">{this.state.answer}</div>:null}<p className="lourex-power-note">{t('Files are classified first. Any extracted customer, quotation or purchase is shown as a proposal and requires your approval before safe mutation.','يتم تصنيف الملفات أولًا. أي عميل أو عرض سعر أو شراء مستخرج يظهر كاقتراح ويتطلب موافقتك قبل الحفظ الآمن.')}</p></>;

  private modal=()=>{
    if(!this.state.open)return null;const title=this.state.view==='inbox'?t('AI Inbox','صندوق AI'):this.state.view==='search'?t('Business Search','بحث الأعمال'):this.state.view==='answer'?(this.state.answerTitle||t('LOUREX AI','ذكاء LOUREX')):t('AI Command Center','مركز قيادة AI');
    return <><button type="button" className="lourex-power-backdrop" aria-label={t('Close','إغلاق')} onClick={this.close}/><section className="lourex-power-modal" role="dialog" aria-modal="true" dir={arabicUi()?'rtl':'ltr'}><header className="lourex-power-head"><div><strong>{title}</strong><p>{this.state.view==='inbox'?t('One file → the right LOUREX workflow','ملف واحد ← مسار LOUREX الصحيح'):this.state.view==='search'?t('Local search across customers, documents, products, suppliers and purchases','بحث محلي عبر العملاء والمستندات والمنتجات والموردين والمشتريات'):t('Built on deterministic LOUREX business engines','مبني على محركات أعمال LOUREX الحتمية')}</p></div><button type="button" className="lourex-power-close" onClick={this.close}>×</button></header>{this.state.error?<div className="lourex-power-error" role="alert">{this.state.error}</div>:null}{this.state.busy?<div className="lourex-power-busy">{t('LOUREX AI is reviewing…','ذكاء LOUREX يراجع…')}</div>:null}{!this.state.busy&&this.state.view==='command'?this.renderCommand():null}{!this.state.busy&&this.state.view==='search'?this.renderSearch():null}{!this.state.busy&&this.state.view==='inbox'?this.renderInbox():null}{!this.state.busy&&this.state.view==='answer'&&this.state.answer?<div className="lourex-power-section lourex-power-answer">{this.state.answer}</div>:null}</section></>;
  };

  render():any{
    const toolbar=this.state.host?ReactDOM.createPortal(<div className="lourex-ai-power-strip" aria-label={t('LOUREX AI tools','أدوات ذكاء LOUREX')}><button type="button" onClick={()=>this.resetWork('inbox')}>{t('AI Inbox','صندوق AI')}</button><button type="button" onClick={()=>this.resetWork('command')}>{t('Command','قيادة')}</button><button type="button" onClick={()=>this.resetWork('search')}>{t('Search','بحث')}</button><button type="button" className={this.state.voiceListening?'is-listening':''} onClick={this.startVoice}>{this.state.voiceListening?t('Listening…','أستمع…'):t('Voice','صوت')}</button></div>,this.state.host):null;
    return <><style data-lourex-ai-power="v1">{POWER_CSS}</style>{toolbar}{this.modal()}</>;
  }
}
