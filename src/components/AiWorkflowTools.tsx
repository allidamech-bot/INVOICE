import type { DocumentItem, SavedItem, VaultPayload } from '../types.js';
import { isArabic, t } from '../lib/i18n.js';
import { resumeVaultSession } from '../storage/vault.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { readSpreadsheetFile, spreadsheetSheetsAsText } from '../lib/spreadsheet-reader.js';
import { aiWorkflowPrompt, searchBusinessRecords, type AiBusinessSearchResult, type AiInboxClassification, type AiInboxRoute, type AiWorkflowMode } from '../lib/ai-workflows.js';
import { applyQuoteAiPricingCommand, buildQuoteAiReview, type QuoteAiReview, type QuoteAiSourceDraft, type QuoteAiSourceItem, type QuoteAiWarning } from '../lib/quote-ai-review.js';
import { createBlankDocument, nextDocumentNumber } from '../lib/documents.js';
import { customerSnapshotFrom } from '../lib/defaults.js';
import { applyCustomerCommercialDefaults } from '../lib/commercial-controls.js';
import { createDocumentEvent } from '../lib/document-lifecycle.js';
import { documentItemFromSavedItem, normalizeSavedItemIdentity, normalizeSavedItemSku } from '../lib/saved-items.js';
import { makeId } from '../lib/id.js';
import { buildSupplierPurchaseDraft } from './SupplierDocumentImport.js';
import type { SupplierImportDraft } from '../lib/supplier-document-import.js';
import { Button, Field, Icon, Input, Modal, Textarea } from './UI.js';

const MAX_BINARY_BYTES=2_600_000;
const MAX_SPREADSHEET_BYTES=12_000_000;
const MAX_TEXT_CHARS=120_000;
const PENDING_SOURCE_KEY='__lourexAiPendingSource';

type AiPayload={kind:'text'|'file';mimeType:string;text?:string;data?:string};
type ToolView='menu'|'inbox'|'search';
type InboxStage='idle'|'reading'|'classifying'|'extracting'|'review'|'saving'|'done'|'error';
interface PendingSource{route:Exclude<AiInboxRoute,'quote_request'|'supplier_purchase'|'unknown'>;file:File;createdAt:number;}
interface State{
  open:boolean;view:ToolView;stage:InboxStage;file:File|null;pastedText:string;classification:AiInboxClassification|null;forcedRoute:AiInboxRoute|null;
  quote:QuoteAiSourceDraft|null;quoteReview:QuoteAiReview|null;quoteCommand:string;quoteCommandMessage:string;supplier:SupplierImportDraft|null;error:string;model:string;savedLabel:string;
  searchQuery:string;searchBusy:boolean;searchResults:AiBusinessSearchResult[];listening:boolean;
}

function bytesToBase64(buffer:ArrayBuffer):string{
  const bytes=new Uint8Array(buffer);let binary='';const chunk=0x8000;
  for(let offset=0;offset<bytes.length;offset+=chunk)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+chunk,bytes.length)));
  return btoa(binary);
}

async function sourcePayload(file:File):Promise<AiPayload>{
  const name=file.name.toLowerCase();
  if(name.endsWith('.xlsx')||name.endsWith('.xls')||name.endsWith('.csv')){
    if(file.size>MAX_SPREADSHEET_BYTES)throw new Error(t('This spreadsheet is larger than 12 MB.','حجم الجدول أكبر من 12 MB.'));
    const sheets=await readSpreadsheetFile(file);const text=spreadsheetSheetsAsText(sheets,MAX_TEXT_CHARS);
    if(!text.trim())throw new Error(t('The spreadsheet has no readable business data.','الجدول لا يحتوي بيانات أعمال قابلة للقراءة.'));
    return{kind:'text',mimeType:'text/csv',text};
  }
  if(name.endsWith('.txt')){
    if(file.size>1_000_000)throw new Error(t('This text file is too large.','الملف النصي كبير جدًا.'));
    const text=(await file.text()).slice(0,MAX_TEXT_CHARS);if(!text.trim())throw new Error(t('The text file is empty.','الملف النصي فارغ.'));
    return{kind:'text',mimeType:'text/plain',text};
  }
  const mime=file.type||(name.endsWith('.pdf')?'application/pdf':name.endsWith('.png')?'image/png':/\.jpe?g$/.test(name)?'image/jpeg':name.endsWith('.webp')?'image/webp':'');
  if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime))throw new Error(t('Use PDF, image, Excel, CSV or TXT.','استخدم PDF أو صورة أو Excel أو CSV أو TXT.'));
  if(file.size>MAX_BINARY_BYTES)throw new Error(t('This PDF/image is too large for safe AI analysis. Reduce it below 2.6 MB.','ملف PDF/الصورة كبير للتحليل الآمن. خفّضه لأقل من 2.6 MB.'));
  return{kind:'file',mimeType:mime,data:bytesToBase64(await file.arrayBuffer())};
}

async function postAi(endpoint:string,fileName:string,payload:AiPayload,signal?:AbortSignal):Promise<any>{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice'},body:JSON.stringify({fileName,...payload}),signal});
  let body:any={};try{body=await response.json();}catch{}
  if(!response.ok)throw new Error(String(body?.message||t('LOUREX AI could not process this source.','تعذر على ذكاء LOUREX معالجة هذا المصدر.')));
  return body;
}

function advisorInput(prompt:string,submit:boolean):boolean{
  const input=document.querySelector<HTMLInputElement>('#lourex-ai-panel .lourex-ai-compose input');if(!input)return false;
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(input,prompt.slice(0,1000));else input.value=prompt.slice(0,1000);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  if(submit)window.setTimeout(()=>input.form?.requestSubmit(),0);
  else{input.focus();input.setSelectionRange(input.value.length,input.value.length);}
  return true;
}

function routeLabel(route:AiInboxRoute):string{
  if(route==='customer')return t('Customer / company identity','عميل / هوية شركة');
  if(route==='supplier_purchase')return t('Supplier purchase document','مستند شراء من مورد');
  if(route==='quote_request')return t('Customer quotation request','طلب عرض سعر من عميل');
  if(route==='product_list')return t('Product catalog / price list','كتالوج منتجات / قائمة أسعار');
  return t('Needs manual choice','يحتاج اختيارًا يدويًا');
}
function quoteWarningLabel(warning:QuoteAiWarning):string{
  if(warning==='unknown-product')return t('Unknown product','صنف غير معروف');
  if(warning==='ambiguous-quantity')return t('Quantity needs review','الكمية تحتاج مراجعة');
  if(warning==='low-product-confidence')return t('Low product confidence','ثقة منخفضة بالصنف');
  if(warning==='missing-cost')return t('Missing cost','تكلفة ناقصة');
  if(warning==='currency-mismatch')return t('Cost currency mismatch','اختلاف عملة التكلفة');
  if(warning==='below-cost')return t('Price below cost','السعر تحت التكلفة');
  if(warning==='below-policy')return t('Price below pricing policy','السعر تحت سياسة التسعير');
  return t('Selling price missing','سعر البيع مفقود');
}
function priceSourceLabel(source:QuoteAiReview['items'][number]['priceSource']):string{
  if(source==='explicit-source')return t('Source price','سعر المصدر');
  if(source==='customer-last-price')return t('Last customer price','آخر سعر للعميل');
  if(source==='saved-sale-price')return t('Saved selling price','سعر البيع المحفوظ');
  if(source==='pricing-policy')return t('Pricing policy','سياسة التسعير');
  return t('No price','لا يوجد سعر');
}
function routeNavigationPrompt(route:AiInboxRoute):string{
  if(route==='customer')return t('Navigate to Customers. I have a customer source ready for AI review.','انتقل إلى العملاء. لدي مصدر بيانات عميل جاهز للمراجعة بالذكاء الاصطناعي.');
  return t('Navigate to Products & Inventory. I have a product catalog ready to import.','انتقل إلى المنتجات والمخزون. لدي كتالوج منتجات جاهز للاستيراد.');
}

function savedMatch(items:SavedItem[],row:QuoteAiSourceItem):SavedItem|undefined{
  const sku=normalizeSavedItemSku(row.sku||'');if(sku){const exact=items.find(item=>normalizeSavedItemSku(item.sku??'')===sku);if(exact)return exact;}
  const en=normalizeSavedItemIdentity(row.descriptionEn),ar=normalizeSavedItemIdentity(row.descriptionAr);
  return items.find(item=>(en&&normalizeSavedItemIdentity(item.descriptionEn)===en)||(ar&&normalizeSavedItemIdentity(item.descriptionAr)===ar));
}
function quoteLine(row:QuoteAiSourceItem,review:QuoteAiReview['items'][number]|undefined,vault:VaultPayload,currency:string):DocumentItem{
  const saved=review?.matchedItemId?vault.savedItems.find(item=>item.id===review.matchedItemId):savedMatch(vault.savedItems,row);
  if(saved){const line=documentItemFromSavedItem(saved);line.quantity=row.quantity;line.unit=row.unit||line.unit;line.unitPrice=review?.effectiveUnitPrice||row.unitPrice||'';if((saved.lastCostCurrency||'').toUpperCase()!==currency.toUpperCase())line.unitCost='';return line;}
  return{id:makeId('item'),descriptionEn:row.descriptionEn,descriptionAr:row.descriptionAr,hsCode:'',origin:'',packing:'',quantity:row.quantity,unit:row.unit||'PCS',unitPrice:review?.effectiveUnitPrice||row.unitPrice,unitCost:''};
}
function setPendingSource(route:PendingSource['route'],file:File):void{(window as any)[PENDING_SOURCE_KEY]={route,file,createdAt:Date.now()} satisfies PendingSource;}

export class AiWorkflowTools extends React.Component<{},State>{
  private input:HTMLInputElement|null=null;
  private abort:AbortController|null=null;
  private recognition:any=null;
  state:State={open:false,view:'menu',stage:'idle',file:null,pastedText:'',classification:null,forcedRoute:null,quote:null,quoteReview:null,quoteCommand:'',quoteCommandMessage:'',supplier:null,error:'',model:'',savedLabel:'',searchQuery:'',searchBusy:false,searchResults:[],listening:false};

  componentWillUnmount():void{this.abort?.abort();try{this.recognition?.stop();}catch{}}
  private busy=()=>['reading','classifying','extracting','saving'].includes(this.state.stage);
  private resetInbox=(forcedRoute:AiInboxRoute|null=null)=>this.setState({view:'inbox',stage:'idle',file:null,pastedText:'',classification:null,forcedRoute,quote:null,quoteReview:null,quoteCommand:'',quoteCommandMessage:'',supplier:null,error:'',model:'',savedLabel:''});
  private openMenu=()=>this.setState({open:true,view:'menu',error:'',savedLabel:''});
  private close=()=>{if(this.busy())return;this.abort?.abort();this.setState({open:false,error:'',listening:false});};
  private chooseFile=(file:File|null)=>{if(!file||this.busy())return;this.setState({file,pastedText:'',classification:null,quote:null,quoteReview:null,quoteCommand:'',quoteCommandMessage:'',supplier:null,error:'',stage:'idle',savedLabel:''});if(this.input)this.input.value='';};
  private payload=async():Promise<{fileName:string;payload:AiPayload}>=>{
    if(this.state.file)return{fileName:this.state.file.name,payload:await sourcePayload(this.state.file)};
    const text=this.state.pastedText.trim();if(!text)throw new Error(t('Choose a file or paste business text first.','اختر ملفًا أو الصق نص أعمال أولًا.'));
    return{fileName:t('Pasted text','النص الملصق'),payload:{kind:'text',mimeType:'text/plain',text:text.slice(0,MAX_TEXT_CHARS)}};
  };
  private classify=async()=>{
    if(this.busy())return;this.setState({stage:'reading',error:'',classification:null,quote:null,quoteReview:null,quoteCommand:'',quoteCommandMessage:'',supplier:null,savedLabel:''});
    try{const source=await this.payload();const forced=this.state.forcedRoute;if(forced){const classification={route:forced,confidence:1,reason:t('Selected workflow','مسار محدد')} as AiInboxClassification;this.setState({classification,stage:'review'});await this.extractForRoute(classification.route,source.fileName,source.payload);return;}
      this.setState({stage:'classifying'});const controller=new AbortController();this.abort=controller;const body=await postAi('/api/ai-inbox',source.fileName,source.payload,controller.signal);const classification=body.classification as AiInboxClassification;this.setState({classification,model:String(body.model||'LOUREX AI'),stage:'review'});if(classification.route==='quote_request'||classification.route==='supplier_purchase')await this.extractForRoute(classification.route,source.fileName,source.payload);}
    catch(error){this.setState({stage:'error',error:error instanceof Error?error.message:String(error)});}finally{this.abort=null;}
  };
  private extractForRoute=async(route:AiInboxRoute,fileName:string,payload:AiPayload)=>{
    if(route!=='quote_request'&&route!=='supplier_purchase')return;
    this.setState({stage:'extracting',error:''});const controller=new AbortController();this.abort=controller;
    try{
      if(route==='quote_request'){
        const body=await postAi('/api/quote-source-ai',fileName,payload,controller.signal);const quote=body.draft as QuoteAiSourceDraft;
        const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before reviewing quotation pricing.','افتح قفل LOUREX قبل مراجعة تسعير عرض السعر.'));
        this.setState({quote,quoteReview:buildQuoteAiReview(resumed.vault,quote),quoteCommand:'',quoteCommandMessage:'',model:String(body.model||'LOUREX AI'),stage:'review'});
      }else{
        const body=await postAi('/api/supplier-document-ai',fileName,payload,controller.signal);this.setState({supplier:body.draft as SupplierImportDraft,model:String(body.model||'LOUREX AI'),stage:'review'});
      }
    }catch(error){this.setState({stage:'error',error:error instanceof Error?error.message:String(error)});}finally{this.abort=null;}
  };
  private forceRoute=async(route:AiInboxRoute)=>{this.setState({classification:{route,confidence:1,reason:t('Chosen manually','تم الاختيار يدويًا')},forcedRoute:route,error:''});try{const source=await this.payload();if(route==='quote_request'||route==='supplier_purchase')await this.extractForRoute(route,source.fileName,source.payload);else this.setState({stage:'review'});}catch(error){this.setState({stage:'error',error:error instanceof Error?error.message:String(error)});}};
  private handoff=()=>{
    const route=this.state.classification?.route;if(route!=='customer'&&route!=='product_list')return;
    const text=this.state.pastedText.trim();const file=this.state.file??(text?new File([text],'AI-Inbox.txt',{type:'text/plain'}):null);if(!file)return;
    setPendingSource(route,file);this.setState({open:false});advisorInput(routeNavigationPrompt(route),true);
  };
  private applyQuoteCommand=async()=>{
    const quote=this.state.quote,command=this.state.quoteCommand.trim();if(!quote||!command||this.busy())return;
    try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before applying quotation pricing.','افتح قفل LOUREX قبل تطبيق تسعير عرض السعر.'));const result=applyQuoteAiPricingCommand(resumed.vault,quote,command);if(!result.applied){this.setState({quoteCommandMessage:t('No line could safely apply this command. Check matching, cost and currency.','لم يتمكن أي بند من تطبيق هذا الأمر بأمان. راجع المطابقة والتكلفة والعملة.')});return;}this.setState({quote:result.draft,quoteReview:buildQuoteAiReview(resumed.vault,result.draft),quoteCommand:'',quoteCommandMessage:t(`Applied to ${result.applied} line(s). Review the result before saving.`,`تم التطبيق على ${result.applied} بند. راجع النتيجة قبل الحفظ.`)});}
    catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}
  };
  private saveSupplier=async()=>{
    const draft=this.state.supplier;if(!draft||this.state.stage==='saving')return;this.setState({stage:'saving',error:''});
    try{const next=await mutateVaultSafely(vault=>{const purchase=buildSupplierPurchaseDraft(draft,vault.purchases,vault.suppliers,vault.savedItems,vault.appSettings.smartDefaults.currency||vault.company.defaultCurrency);return{...vault,purchases:[...vault.purchases,purchase]};});const saved=next.purchases.at(-1);this.setState({stage:'done',supplier:null,savedLabel:saved?t(`Purchase draft ${saved.number} saved`,`تم حفظ مسودة الشراء ${saved.number}`):t('Purchase draft saved','تم حفظ مسودة الشراء')});}
    catch(error){this.setState({stage:'review',error:error instanceof Error?error.message:String(error)});}
  };
  private saveQuote=async()=>{
    const draft=this.state.quote,review=this.state.quoteReview;if(!draft||!review||this.state.stage==='saving')return;this.setState({stage:'saving',error:''});
    try{const next=await mutateVaultSafely(vault=>{const numbered=nextDocumentNumber(vault,'proforma');let doc=createBlankDocument('proforma',numbered.number,vault.company);const customer=review.customer.customerId?vault.customers.find(item=>item.id===review.customer.customerId):undefined;if(customer)doc=applyCustomerCommercialDefaults({...doc,customerSnapshot:customerSnapshotFrom(customer)},customer,vault.company);const currency=review.currency;doc={...doc,currency,items:draft.items.map((row,index)=>quoteLine(row,review.items[index],vault,currency)),terms:{...doc.terms,incoterm:draft.incoterm||doc.terms.incoterm,paymentTerms:draft.paymentTerms||doc.terms.paymentTerms,deliveryTime:draft.deliveryTime||doc.terms.deliveryTime,validity:draft.validity||doc.terms.validity,remarks:draft.remarks||doc.terms.remarks},notes:[doc.notes,draft.notes,review.warningCount?t(`AI source review: ${review.warningCount} warning(s) remain for manual review.`,`مراجعة مصدر AI: بقي ${review.warningCount} تنبيه للمراجعة اليدوية.`):''].filter(Boolean).join('\n'),updatedAt:new Date().toISOString()};return{...numbered.vault,documents:[...numbered.vault.documents,doc],documentEvents:[...numbered.vault.documentEvents,createDocumentEvent(doc,'created')]};});const saved=next.documents.at(-1);this.setState({stage:'done',quote:null,quoteReview:null,quoteCommand:'',quoteCommandMessage:'',savedLabel:saved?t(`Quotation draft ${saved.number} saved for review`,`تم حفظ مسودة عرض السعر ${saved.number} للمراجعة`):t('Quotation draft saved for review','تم حفظ مسودة عرض السعر للمراجعة')});}
    catch(error){this.setState({stage:'review',error:error instanceof Error?error.message:String(error)});}
  };
  private runMode=(mode:AiWorkflowMode)=>{this.setState({open:false});advisorInput(aiWorkflowPrompt(mode,isArabic()),true);};
  private search=async()=>{const query=this.state.searchQuery.trim();if(!query||this.state.searchBusy)return;this.setState({searchBusy:true,error:''});try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before searching business records.','افتح قفل LOUREX قبل البحث في سجلات الأعمال.'));this.setState({searchResults:searchBusinessRecords(resumed.vault,query),searchBusy:false});}catch(error){this.setState({searchBusy:false,error:error instanceof Error?error.message:String(error)});}};
  private askAbout=(result:AiBusinessSearchResult)=>{this.setState({open:false});advisorInput(t(`Tell me about ${result.kind} “${result.label}” using LOUREX records.`,`اشرح لي ${result.kind} «${result.label}» باستخدام سجلات LOUREX.`),true);};
  private voice=()=>{
    if(this.state.listening){try{this.recognition?.stop();}catch{}this.setState({listening:false});return;}
    const Constructor=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;if(!Constructor){this.setState({error:t('Voice input is not supported by this browser.','الإدخال الصوتي غير مدعوم في هذا المتصفح.')});return;}
    const recognition=new Constructor();this.recognition=recognition;recognition.lang=isArabic()?'ar-SA':'en-US';recognition.continuous=false;recognition.interimResults=false;recognition.maxAlternatives=1;
    recognition.onresult=(event:any)=>{const text=String(event.results?.[0]?.[0]?.transcript||'').trim();if(text)advisorInput(text,false);this.setState({listening:false,error:''});};
    recognition.onerror=()=>this.setState({listening:false,error:t('Voice capture stopped before a usable command was received.','توقف التقاط الصوت قبل استلام أمر قابل للاستخدام.')});
    recognition.onend=()=>this.setState({listening:false});this.setState({listening:true,error:''});try{recognition.start();}catch{this.setState({listening:false});}
  };

  private renderMenu=():any=><div>
    <p>{t('Use the same LOUREX Advisor with focused business workflows. All record changes still require review/confirmation.','استخدم مستشار LOUREX نفسه مع مسارات أعمال مركزة. كل تغيير في السجلات يبقى خاضعًا للمراجعة والتأكيد.')}</p>
    <div className="ta-customer-modal-actions"><Button icon="upload" onClick={()=>this.resetInbox(null)}>{t('AI Inbox','صندوق AI')}</Button><Button icon="file" onClick={()=>this.resetInbox('quote_request')}>{t('File → Quote','ملف ← عرض سعر')}</Button><Button icon="search" onClick={()=>this.setState({view:'search',searchQuery:'',searchResults:[],error:''})}>{t('Business Search','بحث الأعمال')}</Button></div>
    <div className="ta-customer-modal-actions"><Button onClick={()=>this.runMode('guardian')}>{t('Accounting Guardian','حارس المحاسبة')}</Button><Button onClick={()=>this.runMode('collections')}>{t('Collections','التحصيل')}</Button><Button onClick={()=>this.runMode('cfo')}>CFO</Button></div>
    <div className="ta-customer-modal-actions"><Button onClick={()=>this.runMode('daily')}>{t('Daily Brief','الموجز اليومي')}</Button><Button onClick={()=>this.runMode('memory')}>{t('Business Memory','ذاكرة الأعمال')}</Button><Button onClick={()=>this.runMode('products')}>{t('Product AI','ذكاء المنتجات')}</Button><Button onClick={()=>this.runMode('suppliers')}>{t('Supplier AI','ذكاء الموردين')}</Button></div>
  </div>;

  private renderSearch=():any=><div><Field label={t('Search all LOUREX business records','ابحث في جميع سجلات أعمال LOUREX')}><Input autoFocus value={this.state.searchQuery} onChange={(event:any)=>this.setState({searchQuery:event.target.value})} onKeyDown={(event:any)=>{if(event.key==='Enter'){event.preventDefault();void this.search();}}}/></Field><div className="ta-customer-modal-actions"><Button onClick={()=>this.setState({view:'menu',error:''})}>{t('Back','رجوع')}</Button><Button variant="primary" disabled={this.state.searchBusy||!this.state.searchQuery.trim()} onClick={()=>void this.search()}>{this.state.searchBusy?t('Searching…','جارٍ البحث…'):t('Search','بحث')}</Button></div>{this.state.searchResults.length?<div>{this.state.searchResults.map(result=><button type="button" key={`${result.kind}:${result.id}`} onClick={()=>this.askAbout(result)} style={{display:'block',width:'100%',textAlign:isArabic()?'right':'left',padding:'10px',marginTop:'6px'}}><strong>{result.label}</strong><small style={{display:'block'}}>{result.kind} · {result.detail||'—'}</small></button>)}</div>:this.state.searchQuery&&!this.state.searchBusy?<p>{t('No matching records yet.','لا توجد سجلات مطابقة حتى الآن.')}</p>:null}</div>;

  private renderInbox=():any=>{
    const route=this.state.classification?.route;const quote=this.state.quote,review=this.state.quoteReview,supplier=this.state.supplier,busy=this.busy();const hasSource=Boolean(this.state.file||this.state.pastedText.trim());
    return <div><p>{t('Drop one business source. LOUREX first decides the safest workflow, then prepares a review-only result.','أدخل مصدر أعمال واحدًا. يحدد LOUREX أولًا المسار الأكثر أمانًا ثم يجهز نتيجة للمراجعة فقط.')}</p>
      <input ref={(node:any)=>{this.input=node;}} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.txt,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain" onChange={(event:any)=>this.chooseFile(event.target.files?.[0]??null)}/>
      <div className="ta-customer-modal-actions"><Button icon="upload" disabled={busy} onClick={()=>this.input?.click()}>{t('Choose File','اختر ملفًا')}</Button><Button variant="primary" disabled={busy||!hasSource} onClick={()=>void this.classify()}>{busy?t('Analyzing…','جارٍ التحليل…'):this.state.forcedRoute===null?t('Route with AI','توجيه بالذكاء الاصطناعي'):t('Analyze','تحليل')}</Button></div>
      {this.state.file?<p><strong>{this.state.file.name}</strong> · {Math.max(1,Math.round(this.state.file.size/1024))} KB</p>:null}
      {!this.state.file?<Field label={t('Or paste business text','أو الصق نص أعمال')}><Textarea rows="4" disabled={busy} value={this.state.pastedText} onChange={(event:any)=>this.setState({pastedText:event.target.value})}/></Field>:null}
      {route?<section><strong>{routeLabel(route)}</strong><p>{this.state.classification?.reason} · {Math.round((this.state.classification?.confidence||0)*100)}%</p></section>:null}
      {route==='unknown'?<div><p>{t('Choose the intended workflow manually; nothing has been saved.','اختر المسار المقصود يدويًا؛ لم يتم حفظ أي شيء.')}</p><div className="ta-customer-modal-actions"><Button onClick={()=>void this.forceRoute('customer')}>{t('Customer','عميل')}</Button><Button onClick={()=>void this.forceRoute('supplier_purchase')}>{t('Supplier Purchase','شراء مورد')}</Button><Button onClick={()=>void this.forceRoute('quote_request')}>{t('Quotation','عرض سعر')}</Button><Button onClick={()=>void this.forceRoute('product_list')}>{t('Products','منتجات')}</Button></div></div>:null}
      {route&&['customer','product_list'].includes(route)?<div><p>{route==='customer'?t('The source will be handed to the existing Customer AI review flow.','سيتم تسليم المصدر إلى مسار مراجعة Customer AI الموجود أصلًا.'):t('Spreadsheet sources use the existing catalog importer; PDF, image and pasted text use AI product review.','ملفات Excel/CSV تستخدم مستورد الكتالوج الحالي، بينما PDF والصور والنص تستخدم مراجعة المنتجات بالذكاء الاصطناعي.')}</p>{hasSource?<Button variant="primary" onClick={this.handoff}>{t('Continue to review','متابعة إلى المراجعة')}</Button>:null}</div>:null}
      {route==='supplier_purchase'&&supplier?<div><h3>{t('Purchase draft preview','معاينة مسودة الشراء')}</h3><p>{supplier.supplierName||t('Supplier not identified','لم يتم تحديد المورد')} · {supplier.currency||'—'} · {supplier.items.length} {t('items','أصناف')}</p><ul>{supplier.items.slice(0,12).map((item,index)=><li key={index}>{item.sku?`${item.sku} · `:''}{item.descriptionEn||item.descriptionAr} · {item.quantity} {item.unit} · {item.unitCost}</li>)}</ul><p>{t('Confirming saves a purchase DRAFT only. It does not post inventory or accounting.','التأكيد يحفظ مسودة شراء فقط. لا يرحّل مخزونًا أو محاسبة.')}</p><Button variant="primary" disabled={busy} onClick={()=>void this.saveSupplier()}>{t('Confirm & Save Purchase Draft','تأكيد وحفظ مسودة الشراء')}</Button></div>:null}
      {route==='quote_request'&&quote&&review?<div><h3>{t('Quotation draft & pricing review','مراجعة مسودة عرض السعر والتسعير')}</h3><p>{quote.customerName||t('Customer not identified','لم يتم تحديد العميل')} · {review.currency} · {quote.items.length} {t('items','أصناف')} · {review.warningCount} {t('warnings','تنبيهات')}</p>
        {review.customer.customerId?<p><strong>{t('Customer match','مطابقة العميل')}:</strong> {review.customer.customerName} · {Math.round(review.customer.matchConfidence*100)}%</p>:quote.customerName?<p><strong>{t('Customer match','مطابقة العميل')}:</strong> {t('No exact saved customer match. The draft will remain unlinked until manual review.','لا توجد مطابقة دقيقة مع عميل محفوظ. ستبقى المسودة غير مرتبطة حتى المراجعة اليدوية.')}</p>:null}
        <div className="product-import-table-wrap"><table className="product-import-table"><thead><tr><th>{t('Product','الصنف')}</th><th>{t('Qty','الكمية')}</th><th>{t('Match','المطابقة')}</th><th>{t('Price','السعر')}</th><th>{t('Cost','التكلفة')}</th><th>{t('Margin','الهامش')}</th><th>{t('Review','المراجعة')}</th></tr></thead><tbody>{quote.items.slice(0,40).map((item,index)=>{const row=review.items[index];return <tr key={`${item.sku}-${index}`}><td><strong><bdi dir="auto">{item.descriptionEn||item.descriptionAr||item.sku}</bdi></strong>{item.sku?<small style={{display:'block'}}><bdi dir="ltr">{item.sku}</bdi></small>:null}</td><td><bdi dir="ltr">{item.quantity} {item.unit}</bdi>{item.quantityConfidence?<small style={{display:'block'}}>{Math.round(item.quantityConfidence*100)}%</small>:null}</td><td>{row?.matchedItemId?<><span>{row.matchedItemName}</span><small style={{display:'block'}}>{Math.round(row.matchConfidence*100)}%</small></>:t('Unknown','غير معروف')}</td><td>{row?.effectiveUnitPrice?<><bdi dir="ltr">{row.effectiveUnitPrice} {review.currency}</bdi><small style={{display:'block'}}>{priceSourceLabel(row.priceSource)}{row.suggestedPrice&&row.suggestedPrice!==row.effectiveUnitPrice?` · ${t('Policy','السياسة')}: ${row.suggestedPrice}`:''}</small></>:'—'}</td><td>{row?.cost&&row.costCurrency===review.currency?<bdi dir="ltr">{row.cost} {row.costCurrency}</bdi>:row?.cost?<bdi dir="ltr">{row.cost} {row.costCurrency||'?'}</bdi>:'—'}</td><td>{row?.marginPercent?<bdi dir="ltr">{row.marginPercent}%</bdi>:'—'}</td><td>{row?.warnings.length?<>{row.warnings.map(warning=><small key={warning} style={{display:'block'}}>{quoteWarningLabel(warning)}</small>)}</>:<span>{t('Ready','جاهز')}</span>}{item.quantityNote?<small style={{display:'block'}}><bdi dir="auto">{item.quantityNote}</bdi></small>:null}</td></tr>;})}</tbody></table></div>
        <Field label={t('Pricing command','أمر التسعير')} hint={t('Margin 15%, use last customer price, raise prices 4%, or use company pricing policy. LOUREX calculates locally.','هامش 15%، استخدم آخر سعر للعميل، ارفع الأسعار 4%، أو استخدم سياسة تسعير الشركة. LOUREX يحسب محليًا.')}><Input value={this.state.quoteCommand} onChange={(event:any)=>this.setState({quoteCommand:event.target.value,quoteCommandMessage:''})} onKeyDown={(event:any)=>{if(event.key==='Enter'){event.preventDefault();void this.applyQuoteCommand();}}}/></Field>
        <div className="ta-customer-modal-actions"><Button disabled={busy||!this.state.quoteCommand.trim()} onClick={()=>void this.applyQuoteCommand()}>{t('Apply pricing command','تطبيق أمر التسعير')}</Button><Button variant="primary" disabled={busy} onClick={()=>void this.saveQuote()}>{t('Confirm & Save Quotation Draft','تأكيد وحفظ مسودة عرض السعر')}</Button></div>
        {this.state.quoteCommandMessage?<p role="status">{this.state.quoteCommandMessage}</p>:null}
        <p>{review.blockingAttentionCount?t(`${review.blockingAttentionCount} line(s) need explicit manual attention before finalizing later. Saving here creates a draft only.`,`${review.blockingAttentionCount} سطر يحتاج انتباهًا يدويًا صريحًا قبل الإصدار لاحقًا. الحفظ هنا ينشئ مسودة فقط.`):t('Deterministic pricing review found no blocking attention flags. Saving still creates a draft only.','لم تجد مراجعة التسعير الحتمية مؤشرات انتباه مانعة. الحفظ يبقى لمسودة فقط.')}</p></div>:null}
      {this.state.stage==='done'?<div role="status"><Icon name="check"/><strong>{this.state.savedLabel}</strong></div>:null}
      {this.state.error?<div role="alert">{this.state.error}</div>:null}
      <div className="ta-customer-modal-actions"><Button disabled={busy} onClick={()=>this.setState({view:'menu',stage:'idle',error:''})}>{t('Back','رجوع')}</Button></div>
    </div>;
  };

  render():any{return <>
    <div className="lourex-ai-tools"><Button icon="upload" onClick={()=>{this.setState({open:true});this.resetInbox(null);}}>{t('AI Inbox','صندوق AI')}</Button><Button icon="bot" onClick={this.openMenu}>{t('AI Tools','أدوات AI')}</Button><Button icon={this.state.listening?'x':'microphone'} onClick={this.voice}>{this.state.listening?t('Stop','إيقاف'):t('Voice','صوت')}</Button></div>
    {this.state.error&&!this.state.open?<div className="lourex-ai-error" role="alert">{this.state.error}</div>:null}
    <Modal open={this.state.open} title={this.state.view==='inbox'?t('LOUREX AI Inbox','صندوق LOUREX AI'):this.state.view==='search'?t('LOUREX Business Search','بحث أعمال LOUREX'):t('LOUREX AI Workflows','مسارات LOUREX AI')} size="lg" onClose={this.close}>{this.state.view==='menu'?this.renderMenu():this.state.view==='search'?this.renderSearch():this.renderInbox()}</Modal>
  </>;}
}
