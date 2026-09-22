import { readFile, writeFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const write=async(path,text)=>{await writeFile(path,text,'utf8');console.log('updated',path);};
function rep(text,from,to,label){if(!text.includes(from))throw new Error('Missing target: '+label);return text.replace(from,to);}
function repRx(text,re,to,label){if(!re.test(text))throw new Error('Missing regex target: '+label);re.lastIndex=0;return text.replace(re,to);}

// The first v300 pass writes types/defaults/vault before reaching the legacy numbering implementation.
// Continue from the real current document-numbering code.
{
  let s=await read('src/lib/documents.ts');
  const nextFn=`export function nextDocumentNumber(vault: VaultPayload, kind: DocumentKind): { number: string; vault: VaultPayload } {
  const year = new Date().getFullYear();
  const sourceNumbering=vault.appSettings.numbering;
  const numbering = { ...sourceNumbering };
  const isProforma=kind==='proforma';
  const isPurchaseOrder=kind==='purchase-order';
  const fallbackPrefix=isProforma?'PI':isPurchaseOrder?'PO':'INV';
  let prefix='';
  let seq=0;
  const live=liveNumberReservations.get(sourceNumbering);
  const used=new Set(vault.documents.map(document=>document.number.trim().toLowerCase()).filter(Boolean));

  if(isProforma){
    if(numbering.proformaYear!==year){numbering.proformaYear=year;numbering.proformaLast=0;}
    prefix=(numbering.proformaPrefix||fallbackPrefix).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||fallbackPrefix;
    numbering.proformaPrefix=prefix;
    const reserved=live?.year===year?live.proforma:0;
    seq=Math.max(0,Math.trunc(numbering.proformaLast||0),reserved);
  }else if(isPurchaseOrder){
    if((numbering.purchaseOrderYear??year)!==year){numbering.purchaseOrderYear=year;numbering.purchaseOrderLast=0;}
    prefix=(numbering.purchaseOrderPrefix||fallbackPrefix).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||fallbackPrefix;
    numbering.purchaseOrderPrefix=prefix;
    const reserved=live?.year===year?live.purchaseOrder:0;
    seq=Math.max(0,Math.trunc(numbering.purchaseOrderLast||0),reserved);
  }else{
    if(numbering.invoiceYear!==year){numbering.invoiceYear=year;numbering.invoiceLast=0;}
    prefix=(numbering.invoicePrefix||fallbackPrefix).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||fallbackPrefix;
    numbering.invoicePrefix=prefix;
    const reserved=live?.year===year?live.invoice:0;
    seq=Math.max(0,Math.trunc(numbering.invoiceLast||0),reserved);
  }

  let number='';
  do{seq+=1;number=\`${'${prefix}'}-${'${year}'}-${'${String(seq).padStart(4, \'0\')}'}\`;}while(used.has(number.toLowerCase()));
  const reservation:NumberReservation=live?.year===year?{...live}:{year,proforma:0,invoice:0,creditNote:0,purchaseOrder:0};
  if(isProforma){numbering.proformaLast=seq;reservation.proforma=seq;}
  else if(isPurchaseOrder){numbering.purchaseOrderLast=seq;numbering.purchaseOrderYear=year;reservation.purchaseOrder=seq;}
  else{numbering.invoiceLast=seq;reservation.invoice=seq;}
  liveNumberReservations.set(sourceNumbering,reservation);
  return {number,vault:{...vault,appSettings:{...vault.appSettings,numbering}}};
}`;
  s=repRx(s,/export function nextDocumentNumber\(vault: VaultPayload, kind: DocumentKind\): \{ number: string; vault: VaultPayload \} \{[\s\S]*?\n\}\n\nexport function nextCreditNoteNumber/,nextFn+'\n\nexport function nextCreditNoteNumber','nextDocumentNumber');
  s=s.replaceAll('{year,proforma:0,invoice:0,creditNote:0}', '{year,proforma:0,invoice:0,creditNote:0,purchaseOrder:0}');
  s=rep(s,`    dueDate: kind === 'proforma' ? addDaysIso(issueDate, validityDays) : paymentPreset ? addDaysIso(issueDate,paymentPreset.days) : '',`,`    dueDate: kind === 'proforma' ? addDaysIso(issueDate, validityDays) : kind === 'purchase-order' ? '' : paymentPreset ? addDaysIso(issueDate,paymentPreset.days) : '',`,'PO dueDate');
  s=rep(s,`    currency: company.defaultCurrency, language: company.defaultLanguage, customerSnapshot: null,\n    companySnapshot: companySnapshotFrom(company), items: [emptyItem()],`,`    currency: company.defaultCurrency, language: company.defaultLanguage, customerSnapshot: null,\n    supplierSnapshot:null, supplierReference:'', attachments:[],\n    companySnapshot: companySnapshotFrom(company), items: [emptyItem()],`,'blank document extensions');
  s=rep(s,`export function hasDocumentCustomer(doc:LourexDocument):boolean{`,`export function hasDocumentSupplier(doc:LourexDocument):boolean{\n  const supplier=doc.supplierSnapshot;\n  return Boolean(supplier&&(supplier.nameEn.trim()||supplier.nameAr.trim()));\n}\n\nexport function hasDocumentCustomer(doc:LourexDocument):boolean{`,'supplier validator');
  s=rep(s,`  if (doc.kind === 'proforma' && !doc.dueDate) errors.dueDate = 'Valid until date is required.';`,`  if (doc.kind === 'proforma' && !doc.dueDate) errors.dueDate = 'Valid until date is required.';\n  if (doc.kind === 'purchase-order' && !doc.dueDate) errors.dueDate = 'Requested delivery date is required.';`,'PO required date');
  s=rep(s,`  if(doc.dueDate&&!isIsoDate(doc.dueDate))errors.dueDate=doc.kind==='proforma'?'Valid until date is invalid.':'Due date is invalid.';\n  else if(doc.dueDate&&isIsoDate(doc.issueDate)&&compareIsoDates(doc.dueDate,doc.issueDate)<0)errors.dueDate=doc.kind==='proforma'?'Valid until date cannot be before issue date.':'Due date cannot be before issue date.';`,`  if(doc.dueDate&&!isIsoDate(doc.dueDate))errors.dueDate=doc.kind==='proforma'?'Valid until date is invalid.':doc.kind==='purchase-order'?'Requested delivery date is invalid.':'Due date is invalid.';\n  else if(doc.dueDate&&isIsoDate(doc.issueDate)&&compareIsoDates(doc.dueDate,doc.issueDate)<0)errors.dueDate=doc.kind==='proforma'?'Valid until date cannot be before issue date.':doc.kind==='purchase-order'?'Requested delivery cannot be before order date.':'Due date cannot be before issue date.';`,'PO date validation');
  s=rep(s,`  if (!hasDocumentCustomer(doc)) errors.customer = 'Select a customer.';`,`  if(doc.kind==='purchase-order'){if(!hasDocumentSupplier(doc))errors.supplier='Select a supplier.';}\n  else if (!hasDocumentCustomer(doc)) errors.customer = 'Select a customer.';`,'PO supplier validation');
  await write('src/lib/documents.ts',s);
}

const purchaseOrderParty=`import type { LourexDocument, Supplier } from '../types.js';
import { supplierSnapshotFrom } from '../lib/operations.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, Field, Icon, Input } from './UI.js';

interface Props { document:LourexDocument; suppliers:Supplier[]; error?:string; onChange:(document:LourexDocument)=>void; }
interface State { query:string; open:boolean; }
function supplierName(supplier:{nameEn:string;nameAr:string}):string{return isArabic()?(supplier.nameAr||supplier.nameEn):(supplier.nameEn||supplier.nameAr);}

export class PurchaseOrderPartySection extends React.Component<Props,State>{
  state:State={query:this.props.document.supplierSnapshot?supplierName(this.props.document.supplierSnapshot):'',open:!this.props.document.supplierSnapshot};
  componentDidUpdate(prev:Props):void{if(prev.document.id!==this.props.document.id)this.setState({query:this.props.document.supplierSnapshot?supplierName(this.props.document.supplierSnapshot):'',open:!this.props.document.supplierSnapshot});}
  private select=(supplier:Supplier)=>{
    this.props.onChange({...this.props.document,supplierSnapshot:supplierSnapshotFrom(supplier),supplierReference:this.props.document.supplierReference||'',currency:supplier.defaultCurrency||this.props.document.currency,terms:{...this.props.document.terms,paymentTerms:supplier.paymentTerms||this.props.document.terms.paymentTerms}});
    this.setState({query:supplierName(supplier),open:false});
  };
  private reference=(value:string)=>this.props.onChange({...this.props.document,supplierReference:value});
  render():any{
    const d=this.props.document,q=this.state.query.trim().toLowerCase(),selected=d.supplierSnapshot;
    const visible=this.props.suppliers.filter(s=>!q||[s.nameEn,s.nameAr,s.contactPerson,s.city,s.country,s.email,s.phone].join(' ').toLowerCase().includes(q)).slice(0,8);
    return <section className={'editor-section customer-section purchase-order-party-section '+(this.props.error?'section-has-error':'')}>
      <div className="section-heading"><span>02</span><h2>{t('Supplier','المورد')}</h2></div>
      {selected?<div className="selected-customer premium-selected-customer"><span className="customer-avatar"><Icon name="users" size={19}/></span><div><strong>{supplierName(selected)}</strong><span>{[selected.city,selected.country].filter(Boolean).join(', ')}</span><small>{[selected.phone,selected.email].filter(Boolean).join(' · ')}</small></div><Button variant="ghost" onClick={()=>this.setState({query:'',open:true})}>{t('Change','تغيير')}</Button></div>:null}
      {!selected||this.state.open?<div className="customer-select-wrap"><Field label={t('Saved Supplier','مورد محفوظ')} className="required-field" error={this.props.error}><div className="search-select"><Icon name="search"/><Input value={this.state.query} placeholder={t('Search supplier','ابحث عن مورد')} onFocus={()=>this.setState({open:true})} onChange={(e:any)=>this.setState({query:e.target.value,open:true})}/></div></Field>{this.state.open?<div className="customer-dropdown">{visible.map(s=><button type="button" key={s.id} onClick={()=>this.select(s)}><strong>{supplierName(s)}</strong><span>{[s.city,s.country].filter(Boolean).join(', ')}</span></button>)}{visible.length===0?<div className="customer-search-empty" role="status">{t('No matching suppliers. Add a supplier from Purchasing first.','لا يوجد مورد مطابق. أضف المورد من قسم المشتريات أولًا.')}</div>:null}</div>:null}</div>:null}
      <div className="purchase-order-reference"><Field label={t('Supplier Reference / Quote No.','مرجع المورد / رقم عرضه')} hint={t('Optional supplier quotation, offer or reference number.','رقم عرض أو مرجع المورد اختياري.')}><Input value={d.supplierReference||''} onChange={(e:any)=>this.reference(e.target.value)}/></Field></div>
    </section>;
  }
}
`;
await write('src/components/PurchaseOrderPartySection.tsx',purchaseOrderParty);

const attachments=`import type { DocumentAttachment, LourexDocument } from '../types.js';
import { t } from '../lib/i18n.js';
import { Button, Icon, IconButton } from './UI.js';
interface Props { document:LourexDocument; onChange:(document:LourexDocument)=>void; }
interface State { busy:boolean; error:string; }
const MAX_FILE_BYTES=5*1024*1024,MAX_TOTAL_BYTES=20*1024*1024,MAX_FILES=8;
function asAttachment(file:File):Promise<DocumentAttachment>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Unable to read attachment.'));reader.onload=()=>{if(typeof reader.result!=='string'){reject(new Error('Unable to read attachment.'));return;}resolve({id:'att-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9),name:file.name,mimeType:file.type||(/\\.pdf$/i.test(file.name)?'application/pdf':'image/*'),size:file.size,dataUrl:reader.result,createdAt:new Date().toISOString()});};reader.readAsDataURL(file);});}
function bytes(value:number):string{return value<1024*1024?Math.max(1,Math.round(value/1024))+' KB':(value/(1024*1024)).toFixed(1)+' MB';}
export class DocumentAttachmentsSection extends React.Component<Props,State>{
  state:State={busy:false,error:''};private input:HTMLInputElement|null=null;
  private add=async(event:any)=>{const input=event.target as HTMLInputElement,files=Array.from(input.files??[]),current=this.props.document.attachments??[];if(!files.length)return;
    if(current.length+files.length>MAX_FILES){this.setState({error:t('A document can contain up to 8 attachments.','يمكن أن يحتوي المستند على 8 مرفقات كحد أقصى.')});input.value='';return;}
    for(const file of files){const allowed=file.type==='application/pdf'||file.type.startsWith('image/')||/\\.(pdf|png|jpe?g|webp|heic|heif)$/i.test(file.name);if(!allowed){this.setState({error:t('Only PDF and image attachments are supported.','المرفقات المدعومة هي PDF والصور فقط.')});input.value='';return;}if(file.size>MAX_FILE_BYTES){this.setState({error:t('Each attachment must be 5 MB or smaller.','يجب ألا يتجاوز حجم كل مرفق 5 ميغابايت.')});input.value='';return;}}
    if(current.reduce((n,a)=>n+(a.size||0),0)+files.reduce((n,f)=>n+f.size,0)>MAX_TOTAL_BYTES){this.setState({error:t('Attachments are limited to 20 MB per document.','إجمالي مرفقات المستند محدود بـ 20 ميغابايت.')});input.value='';return;}
    this.setState({busy:true,error:''});try{const added=await Promise.all(files.map(asAttachment));this.props.onChange({...this.props.document,attachments:[...current,...added]});}catch(e){this.setState({error:e instanceof Error?e.message:t('Unable to add attachment.','تعذر إضافة المرفق.')});}finally{this.setState({busy:false});input.value='';}}
  private remove=(id:string)=>this.props.onChange({...this.props.document,attachments:(this.props.document.attachments??[]).filter(a=>a.id!==id)});
  render():any{const list=this.props.document.attachments??[];return <section className="editor-section document-attachments-section"><div className="section-heading with-action"><div><span>07</span><h2>{t('Attachments','المرفقات')}</h2></div><Button icon="plus" disabled={this.state.busy||list.length>=MAX_FILES} onClick={()=>this.input?.click()}>{this.state.busy?t('Adding…','جارٍ الإضافة…'):t('Add image / PDF','إضافة صورة / PDF')}</Button></div><input ref={(n:HTMLInputElement|null)=>{this.input=n;}} className="document-attachment-input" type="file" accept="image/*,application/pdf,.pdf" multiple onChange={this.add}/><p className="attachment-help">{t('Supporting files are kept inside the encrypted LOUREX workspace and travel with the document backup.','تُحفظ الملفات الداعمة داخل مساحة LOUREX المشفّرة وتنتقل مع نسخة المستند الاحتياطية.')}</p>{this.state.error?<div className="inline-error">{this.state.error}</div>:null}{list.length?<div className="document-attachment-list">{list.map(a=><article key={a.id}><span className="attachment-file-icon"><Icon name="file"/></span><div><strong>{a.name}</strong><small>{a.mimeType==='application/pdf'?'PDF':t('Image','صورة')} · {bytes(a.size)}</small></div><a href={a.dataUrl} target="_blank" rel="noreferrer">{t('Open','فتح')}</a><IconButton icon="trash" label={t('Remove attachment','حذف المرفق')} onClick={()=>this.remove(a.id)}/></article>)}</div>:<div className="attachments-empty"><Icon name="file"/><span>{t('No attachments yet.','لا توجد مرفقات بعد.')}</span></div>}</section>;}
}
`;
await write('src/components/DocumentAttachmentsSection.tsx',attachments);

{
  let s=await read('src/components/EditorPageCore.tsx');
  s=rep(s,`import type { AppSettings, CompanySettings, Customer, DocumentItem, LourexDocument, PaymentRecord, PaymentTermPreset, SavedItem, TemplateId } from '../types.js';`,`import type { AppSettings, CompanySettings, Customer, DocumentItem, LourexDocument, PaymentRecord, PaymentTermPreset, SavedItem, Supplier, TemplateId } from '../types.js';`,'core Supplier import');
  s=rep(s,`import { Button, ConfirmDialog, Field, Icon, IconButton, Input, Modal, Select, Textarea, Toggle } from './UI.js';`,`import { Button, ConfirmDialog, Field, Icon, IconButton, Input, Modal, Select, Textarea, Toggle } from './UI.js';\nimport { PurchaseOrderPartySection } from './PurchaseOrderPartySection.js';\nimport { DocumentAttachmentsSection } from './DocumentAttachmentsSection.js';`,'core feature imports');
  s=rep(s,`document:LourexDocument; documents:LourexDocument[]; customers:Customer[]; company:CompanySettings; savedItems:SavedItem[]; payments:PaymentRecord[]; smartDefaults:AppSettings['smartDefaults'];`,`document:LourexDocument; documents:LourexDocument[]; customers:Customer[]; suppliers:Supplier[]; company:CompanySettings; savedItems:SavedItem[]; payments:PaymentRecord[]; smartDefaults:AppSettings['smartDefaults'];`,'core suppliers prop');
  s=rep(s,`    const d=this.state.doc,errors=this.state.errors,totals=calculateTotals(d.items,d.adjustments),readiness=getDocumentReadiness(d),locked=d.status==='final',revisionAllowed=d.status==='final'&&d.lifecycleStatus!=='voided'&&d.role!=='credit-note';`,`    const d=this.state.doc,errors=this.state.errors,totals=calculateTotals(d.items,d.adjustments),readiness=getDocumentReadiness(d),locked=d.status==='final',revisionAllowed=d.status==='final'&&d.lifecycleStatus!=='voided'&&d.role!=='credit-note';\n    const isPurchaseOrder=d.kind==='purchase-order';`,'core PO flag');
  s=rep(s,`    const credit=customerCreditStatus(d,this.props.customers,this.props.documents,this.props.payments);`,`    const credit=isPurchaseOrder?null:customerCreditStatus(d,this.props.customers,this.props.documents,this.props.payments);`,'core PO credit');
  s=rep(s,`d.role==='credit-note'?t('Credit Note','إشعار دائن'):d.kind==='proforma'?t('Quotation','عرض سعر'):t('Invoice','فاتورة')`,`d.role==='credit-note'?t('Credit Note','إشعار دائن'):d.kind==='proforma'?t('Quotation','عرض سعر'):isPurchaseOrder?t('Purchase Order','طلب شراء'):t('Invoice','فاتورة')`,'core PO title');
  s=rep(s,`<Field label={t('Issue Date','تاريخ الإصدار')} className="required-field" error={error('issueDate')}><EditorDateInput label={t('Issue Date','تاريخ الإصدار')} value={d.issueDate} onChange={this.issueDate}/></Field>`,`<Field label={isPurchaseOrder?t('Order Date','تاريخ الطلب'):t('Issue Date','تاريخ الإصدار')} className="required-field" error={error('issueDate')}><EditorDateInput label={isPurchaseOrder?t('Order Date','تاريخ الطلب'):t('Issue Date','تاريخ الإصدار')} value={d.issueDate} onChange={this.issueDate}/></Field>`,'core PO date label');
  s=rep(s,`<Field label={d.kind==='proforma'?t('Valid Until','صالح حتى'):t('Due Date','تاريخ الاستحقاق')} className={d.kind==='proforma'?'required-field':''} error={error('dueDate')}><EditorDateInput label={d.kind==='proforma'?t('Valid Until','صالح حتى'):t('Due Date','تاريخ الاستحقاق')} value={d.dueDate} onChange={value=>this.field('dueDate',value)}/></Field>`,`<Field label={d.kind==='proforma'?t('Valid Until','صالح حتى'):isPurchaseOrder?t('Requested Delivery','التسليم المطلوب'):t('Due Date','تاريخ الاستحقاق')} className={d.kind==='proforma'||isPurchaseOrder?'required-field':''} error={error('dueDate')}><EditorDateInput label={d.kind==='proforma'?t('Valid Until','صالح حتى'):isPurchaseOrder?t('Requested Delivery','التسليم المطلوب'):t('Due Date','تاريخ الاستحقاق')} value={d.dueDate} onChange={value=>this.field('dueDate',value)}/></Field>`,'core PO delivery label');
  const customerStart=`        <section className={\`editor-section customer-section \${sectionHasError('customer')?'section-has-error':''}\`}>`;
  s=rep(s,customerStart,`        {isPurchaseOrder?<PurchaseOrderPartySection document={d} suppliers={this.props.suppliers} error={error('supplier')} onChange={next=>this.mutate(()=>next)}/>:<section className={\`editor-section customer-section \${sectionHasError('customer')?'section-has-error':''}\`}>`,'core PO party start');
  s=rep(s,`</section>{credit?<div className={\`credit-limit-banner`,`</section>}{credit?<div className={\`credit-limit-banner`,'core PO party end');
  s=rep(s,`<Field label={t(\`Unit Price (\${d.currency})\`,\`سعر الوحدة (\${d.currency})\`)} className="required-field"`,`<Field label={isPurchaseOrder?t(\`Unit Cost (\${d.currency})\`,\`تكلفة الوحدة (\${d.currency})\`):t(\`Unit Price (\${d.currency})\`,\`سعر الوحدة (\${d.currency})\`)} className="required-field"`,'core PO unit cost label');
  s=rep(s,`</section>\n      </fieldset></div></aside>`,`</section>\n        <DocumentAttachmentsSection document={d} onChange={next=>this.mutate(()=>next)}/>\n      </fieldset></div></aside>`,'core attachments');
  await write('src/components/EditorPageCore.tsx',s);
}

{
  let s=await read('src/components/EditorPage.tsx');
  s=rep(s,`import type { AppSettings, CompanySettings, Customer, DocumentEventRecord, DocumentItem, DocumentRevisionRecord, LourexDocument, PaymentRecord, SavedItem } from '../types.js';`,`import type { AppSettings, CompanySettings, Customer, DocumentEventRecord, DocumentItem, DocumentRevisionRecord, LourexDocument, PaymentRecord, SavedItem, Supplier } from '../types.js';`,'wrapper Supplier import');
  s=rep(s,`document:LourexDocument; documents:LourexDocument[]; customers:Customer[]; company:CompanySettings; savedItems:SavedItem[]; payments:PaymentRecord[];`,`document:LourexDocument; documents:LourexDocument[]; customers:Customer[]; suppliers:Supplier[]; company:CompanySettings; savedItems:SavedItem[]; payments:PaymentRecord[];`,'wrapper suppliers prop');
  s=rep(s,`      <InvoicePaymentsPanel document={props.document} documents={props.documents} payments={props.payments} onSave={props.onSavePayment} onDelete={props.onDeletePayment}/>`,`      {props.document.kind!=='purchase-order'?<InvoicePaymentsPanel document={props.document} documents={props.documents} payments={props.payments} onSave={props.onSavePayment} onDelete={props.onDeletePayment}/>:null}`,'hide PO payments');
  s=rep(s,`      <ProfitabilityPanel document={props.document} savedItems={props.savedItems} onSave={props.onSave} onSaveSavedItem={props.onSaveSavedItem}/>`,`      {props.document.kind!=='purchase-order'?<ProfitabilityPanel document={props.document} savedItems={props.savedItems} onSave={props.onSave} onSaveSavedItem={props.onSaveSavedItem}/>:null}`,'hide PO profitability');
  await write('src/components/EditorPage.tsx',s);
}

{
  let s=await read('src/app/App.tsx');
  s=rep(s,`if(paymentPreset)doc=applyPaymentTermPreset(doc,paymentPreset);return{doc,vault:current};`,`if(paymentPreset&&kind!=='purchase-order')doc=applyPaymentTermPreset(doc,paymentPreset);return{doc,vault:current};`,'App PO payment date');
  s=rep(s,`<EditorPage document={this.state.editorDoc} documents={vault.documents} customers={vault.customers} company={vault.company}`,`<EditorPage document={this.state.editorDoc} documents={vault.documents} customers={vault.customers} suppliers={vault.suppliers} company={vault.company}`,'App suppliers');
  await write('src/app/App.tsx',s);
}

{
  let s=await read('src/components/AppShell.tsx');
  s=rep(s,`    <button type="button" role="menuitem" onClick={()=>this.createDocument('invoice')}><Icon name="invoice"/><span><strong>{t('Invoice','فاتورة')}</strong><small>{t('Final invoice','فاتورة نهائية')}</small></span></button>`,`    <button type="button" role="menuitem" onClick={()=>this.createDocument('invoice')}><Icon name="invoice"/><span><strong>{t('Invoice','فاتورة')}</strong><small>{t('Final invoice','فاتورة نهائية')}</small></span></button>\n    <button type="button" role="menuitem" onClick={()=>this.createDocument('purchase-order')}><Icon name="file"/><span><strong>{t('Purchase Order','طلب شراء')}</strong><small>{t('Supplier order and delivery terms','طلب للمورد وشروط التسليم')}</small></span></button>`,'shell PO create');
  await write('src/components/AppShell.tsx',s);
}

{
  let s=await read('src/components/DocumentsPage.tsx');
  s=rep(s,`tab:'all'|'proforma'|'invoice'|'credit';`,`tab:'all'|'proforma'|'invoice'|'purchase-order'|'credit';`,'documents PO tab type');
  s=rep(s,`function kindLabel(doc:LourexDocument):string{\n  if(doc.role==='credit-note')return t('Credit Note','إشعار دائن');\n  return doc.kind==='proforma'?t('Quotation','عرض سعر'):t('Invoice','فاتورة');\n}`,`function kindLabel(doc:LourexDocument):string{\n  if(doc.role==='credit-note')return t('Credit Note','إشعار دائن');\n  if(doc.kind==='purchase-order')return t('Purchase Order','طلب شراء');\n  return doc.kind==='proforma'?t('Quotation','عرض سعر'):t('Invoice','فاتورة');\n}\n\nfunction partyName(doc:LourexDocument):string{\n  if(doc.kind!=='purchase-order')return customerName(doc);\n  const supplier=doc.supplierSnapshot;\n  if(!supplier)return t('No supplier','بدون مورد');\n  return isArabic()?(supplier.nameAr||supplier.nameEn||t('No supplier','بدون مورد')):(supplier.nameEn||supplier.nameAr||t('No supplier','بدون مورد'));\n}`,'documents PO labels');
  s=rep(s,`      if(this.state.tab==='invoice'&&(doc.kind!=='invoice'||doc.role!=='standard'))return false;`,`      if(this.state.tab==='invoice'&&(doc.kind!=='invoice'||doc.role!=='standard'))return false;\n      if(this.state.tab==='purchase-order'&&(doc.kind!=='purchase-order'||doc.role!=='standard'))return false;`,'documents PO filter');
  s=rep(s,`    const invoices=this.props.documents.filter(doc=>doc.kind==='invoice'&&doc.role==='standard').length;`,`    const invoices=this.props.documents.filter(doc=>doc.kind==='invoice'&&doc.role==='standard').length;\n    const purchaseOrders=this.props.documents.filter(doc=>doc.kind==='purchase-order'&&doc.role==='standard').length;`,'documents PO count');
  s=rep(s,`<div><p className="eyebrow">{t('Sales documents','مستندات المبيعات')}</p><h1>{t('Documents','المستندات')}</h1><p className="page-subtitle">{t('Find, review and manage every quotation, invoice and credit note from one workspace.','ابحث وراجع وأدر عروض الأسعار والفواتير والإشعارات الدائنة من مساحة عمل واحدة.')}</p></div>`,`<div><p className="eyebrow">{t('Business documents','مستندات الأعمال')}</p><h1>{t('Documents','المستندات')}</h1><p className="page-subtitle">{t('Find and manage quotations, invoices, purchase orders and credit notes from one workspace.','ابحث وأدر عروض الأسعار والفواتير وطلبات الشراء والإشعارات الدائنة من مساحة عمل واحدة.')}</p></div>`,'documents heading');
  s=rep(s,`<div className="heading-actions documents-heading-actions"><Button icon="proforma" variant="primary" onClick={()=>this.props.onNew('proforma')}>{t('New Quote','عرض سعر جديد')}</Button><Button icon="invoice" onClick={()=>this.props.onNew('invoice')}>{t('New Invoice','فاتورة جديدة')}</Button></div>`,`<div className="heading-actions documents-heading-actions"><Button icon="proforma" variant="primary" onClick={()=>this.props.onNew('proforma')}>{t('New Quote','عرض سعر جديد')}</Button><Button icon="invoice" onClick={()=>this.props.onNew('invoice')}>{t('New Invoice','فاتورة جديدة')}</Button><Button icon="file" onClick={()=>this.props.onNew('purchase-order')}>{t('New Purchase Order','طلب شراء جديد')}</Button></div>`,'documents PO create');
  s=rep(s,`        <button type="button" className={this.overviewActive('invoice','all')?'active':''} aria-pressed={this.overviewActive('invoice','all')} onClick={()=>this.setOverview('invoice','all')}><span>{t('Invoices','الفواتير')}</span><strong>{invoices}</strong></button>`,`        <button type="button" className={this.overviewActive('invoice','all')?'active':''} aria-pressed={this.overviewActive('invoice','all')} onClick={()=>this.setOverview('invoice','all')}><span>{t('Invoices','الفواتير')}</span><strong>{invoices}</strong></button>\n        <button type="button" className={this.overviewActive('purchase-order','all')?'active':''} aria-pressed={this.overviewActive('purchase-order','all')} onClick={()=>this.setOverview('purchase-order','all')}><span>{t('Purchase Orders','طلبات الشراء')}</span><strong>{purchaseOrders}</strong></button>`,'documents PO overview');
  s=s.replaceAll('customerName(resume)','partyName(resume)');
  const rowNeedle=`        const missingCustomer=!hasDocumentCustomer(doc);`;
  s=rep(s,rowNeedle,`        const missingCustomer=doc.kind==='purchase-order'?!doc.supplierSnapshot:!hasDocumentCustomer(doc);`,'documents PO missing party');
  // Only presentation uses below this point; keep customerName helper itself unchanged.
  const rowStart=s.indexOf(`      {docs.length?<div className="documents-register">`);
  if(rowStart<0)throw new Error('Missing documents row start');
  const before=s.slice(0,rowStart),after=s.slice(rowStart).replaceAll('customerName(doc)','partyName(doc)').replace(`{missingCustomer? \` · \${t('Customer required','العميل مطلوب')}\`:''}`,`{missingCustomer? \` · \${doc.kind==='purchase-order'?t('Supplier required','المورد مطلوب'):t('Customer required','العميل مطلوب')}\`:''}`);
  s=before+after;
  s=rep(s,`<Button icon="invoice" onClick={()=>this.props.onNew('invoice')}>{t('Create Invoice','إنشاء فاتورة')}</Button></div>`,`<Button icon="invoice" onClick={()=>this.props.onNew('invoice')}>{t('Create Invoice','إنشاء فاتورة')}</Button><Button icon="file" onClick={()=>this.props.onNew('purchase-order')}>{t('Create Purchase Order','إنشاء طلب شراء')}</Button></div>`,'documents empty PO');
  await write('src/components/DocumentsPage.tsx',s);
}

{
  let s=await read('src/templates/TemplateRenderer.tsx');
  s=rep(s,`const typeEn = doc.role==='credit-note' ? 'CREDIT NOTE' : doc.kind === 'proforma' ? 'QUOTATION' : 'INVOICE';\n  const typeAr = doc.role==='credit-note' ? 'إشعار دائن' : doc.kind === 'proforma' ? 'عرض سعر' : 'فاتورة';`,`const typeEn = doc.role==='credit-note' ? 'CREDIT NOTE' : doc.kind === 'proforma' ? 'QUOTATION' : doc.kind === 'purchase-order' ? 'PURCHASE ORDER' : 'INVOICE';\n  const typeAr = doc.role==='credit-note' ? 'إشعار دائن' : doc.kind === 'proforma' ? 'عرض سعر' : doc.kind === 'purchase-order' ? 'طلب شراء' : 'فاتورة';`,'template PO title');
  s=rep(s,`{localized(doc, 'Issue Date', 'تاريخ الإصدار')}`,`{localized(doc, doc.kind==='purchase-order'?'Order Date':'Issue Date', doc.kind==='purchase-order'?'تاريخ الطلب':'تاريخ الإصدار')}`,'template PO date');
  s=rep(s,`{localized(doc, doc.kind === 'proforma' ? 'Valid Until' : 'Due Date', doc.kind === 'proforma' ? 'صالح حتى' : 'تاريخ الاستحقاق')}`,`{localized(doc, doc.kind === 'proforma' ? 'Valid Until' : doc.kind==='purchase-order' ? 'Requested Delivery' : 'Due Date', doc.kind === 'proforma' ? 'صالح حتى' : doc.kind==='purchase-order' ? 'التسليم المطلوب' : 'تاريخ الاستحقاق')}`,'template PO delivery');
  const partyFn=`function PartyBlock({ document: doc, type }: { document: LourexDocument; type: 'seller' | 'customer' }): any {
  const isSeller=type==='seller',isSupplier=!isSeller&&doc.kind==='purchase-order',c=doc.customerSnapshot,supplier=doc.supplierSnapshot;
  const name=isSeller?companyName(doc):isSupplier?identityPair(doc,supplier?.nameEn??'',supplier?.nameAr??''):customerName(doc);
  const addressEn=isSeller?doc.companySnapshot.addressEn:isSupplier?(supplier?.address??''):(c?.addressEn??'');
  const addressAr=isSeller?doc.companySnapshot.addressAr:isSupplier?(supplier?.address??''):(c?.addressAr??'');
  const addressVisible=identityOutputValues(doc,addressEn,addressAr).length>0;
  const cityRaw=isSeller?doc.companySnapshot.city:isSupplier?(supplier?.city??''):(c?.city??'');const countryRaw=isSeller?doc.companySnapshot.country:isSupplier?(supplier?.country??''):(c?.country??'');
  const city=safeValue(doc,cityRaw,'neutral'),country=safeValue(doc,countryRaw,'country');
  const phone=isSeller?doc.companySnapshot.phone:isSupplier?(supplier?.phone??''):(c?.phone??'');const email=isSeller?doc.companySnapshot.email:isSupplier?(supplier?.email??''):(c?.email??'');const website=isSeller?doc.companySnapshot.website:'';
  const identifiers:Array<[string,string,string]>=isSeller?[['VAT No.','رقم ضريبة القيمة المضافة',doc.companySnapshot.vatNumber],['Tax No.','الرقم الضريبي',doc.companySnapshot.taxNumber],['Commercial Registration','السجل التجاري',doc.companySnapshot.commercialRegistration]]:isSupplier?[['VAT / Tax','الضريبة',supplier?.vatTaxNumber??''],['Commercial Registration','السجل التجاري',supplier?.commercialRegistration??''],['Supplier Ref.','مرجع المورد',doc.supplierReference??'']]:[['VAT / Tax','الضريبة',c?.vatTaxNumber??''],['Commercial Registration','السجل التجاري',c?.commercialRegistration??'']];
  const visibleIdentifiers=identifiers.filter(([, ,value],index,array)=>Boolean(value.trim())&&array.findIndex(row=>row[2].trim()===value.trim())===index);
  const labelEn=isSeller?'Buyer / From':isSupplier?'Supplier / Vendor':'Bill To / Customer';const labelAr=isSeller?'المشتري / من':isSupplier?'المورد':'إلى / العميل';
  return <section className={'party-block party-'+type+(isSupplier?' party-supplier':'')}><div className="section-kicker">{localized(doc,labelEn,labelAr)}</div><div className="party-name">{name}</div>{addressVisible?<div className="party-address">{identityPair(doc,addressEn,addressAr)}</div>:null}{(city||country)?<div className="party-location">{city?<bdi>{city}</bdi>:null}{city&&country?', ':null}{country?<bdi>{country}</bdi>:null}</div>:null}{(phone||email||website)?<div className="party-contact">{[phone,email,website].filter(Boolean).join(' • ')}</div>:null}{visibleIdentifiers.length?<div className="party-identifiers">{visibleIdentifiers.map(([en,ar,value])=><div key={en+'-'+value}><b>{localized(doc,en,ar)}</b><span>{value}</span></div>)}</div>:null}</section>;
}`;
  s=repRx(s,/function PartyBlock\(\{ document: doc, type \}: \{ document: LourexDocument; type: 'seller' \| 'customer' \}\): any \{[\s\S]*?\n\}/,partyFn,'template supplier party');
  s=rep(s,`{localized(doc, 'Unit Price', 'سعر الوحدة')}<small>{currency}</small>`,`{localized(doc, doc.kind==='purchase-order'?'Unit Cost':'Unit Price', doc.kind==='purchase-order'?'تكلفة الوحدة':'سعر الوحدة')}<small>{currency}</small>`,'template unit cost');
  s=rep(s,`  const c=doc.customerSnapshot;\n  const values=[`,`  const c=doc.customerSnapshot;\n  const supplier=doc.supplierSnapshot;\n  const values=[`,'template supplier capacity var');
  s=rep(s,`    c?.city??'',c?.country??'',c?.phone??'',c?.email??'',c?.vatTaxNumber??'',c?.commercialRegistration??''\n  ].map(value=>value.trim()).filter(Boolean);`,`    c?.city??'',c?.country??'',c?.phone??'',c?.email??'',c?.vatTaxNumber??'',c?.commercialRegistration??'',\n    supplier?.nameEn??'',supplier?.nameAr??'',supplier?.address??'',supplier?.city??'',supplier?.country??'',supplier?.phone??'',supplier?.email??'',supplier?.vatTaxNumber??'',supplier?.commercialRegistration??'',doc.supplierReference??''\n  ].map(value=>value.trim()).filter(Boolean);`,'template supplier capacity');
  await write('src/templates/TemplateRenderer.tsx',s);
}

{
  let s=await read('src/app/index.tsx');
  s=rep(s,`    // A previously unlocked vault key is bound to the Firebase UID and may be\n    // resumed only after that same account authenticates. This keeps sign-out a\n    // real workspace boundary without making the user enter a second PIN.\n    await resumeAccountSession(user.uid);`,`    // Every explicit Firebase/Google login must cross the local encryption PIN gate.\n    // Normal reloads can still resume the UID-bound unlocked session.\n    let freshLogin=false;\n    try{freshLogin=sessionStorage.getItem('lourex-auth-just-signed-in')==='1';if(freshLogin)sessionStorage.removeItem('lourex-auth-just-signed-in');}catch{}\n    if(freshLogin)await suspendSession();else await resumeAccountSession(user.uid);`,'PIN after login');
  await write('src/app/index.tsx',s);
}

{
  let s=await read('index.html');
  s=repRx(s,/  <meta name="theme-color" content="#061820" \/>\n  <script id="lourex-theme-bootstrap">[\s\S]*?  <\/script>/,`  <meta name="theme-color" content="#080808" />
  <script id="lourex-theme-bootstrap">
    (function(){
      var key='lourex-ui-theme',pref='system';try{var saved=localStorage.getItem(key);if(saved==='light'||saved==='dark'||saved==='system')pref=saved;}catch(e){}
      var resolved=pref;if(pref==='system'){try{resolved=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}catch(e){resolved='dark';}}
      var root=document.documentElement,meta=document.querySelector('meta[name="theme-color"]');root.dataset.uiTheme=resolved;root.dataset.uiThemePreference=pref;root.dataset.lourexBooting='true';root.style.colorScheme='dark';root.style.backgroundColor='#080808';root.style.setProperty('--boot-bg','#080808');if(meta)meta.setAttribute('content','#080808');
      document.addEventListener('DOMContentLoaded',function(){var mount=document.getElementById('root');if(!mount)return;var restore=function(){if(document.getElementById('lourex-boot'))return;delete root.dataset.lourexBooting;root.style.removeProperty('--boot-bg');root.style.colorScheme=resolved;root.style.backgroundColor=resolved==='light'?'#f2f7f8':'#061820';if(meta)meta.setAttribute('content',resolved==='light'?'#f2f7f8':'#061820');observer.disconnect();};var observer=new MutationObserver(restore);observer.observe(mount,{childList:true});restore();},{once:true});
    })();
  </script>`,'boot bootstrap');
  s=rep(s,`html,body,#root{min-height:100%;min-height:100dvh;margin:0;background:var(--boot-bg,#061820)}`,`html,body,#root{min-height:100%;min-height:100dvh;margin:0;background:var(--boot-bg,#061820)}\n    html[data-lourex-booting="true"],html[data-lourex-booting="true"] body,html[data-lourex-booting="true"] #root{background:#080808!important;color-scheme:dark!important}`,'boot canvas');
  s=rep(s,`  <link rel="stylesheet" href="./styles/visual-auth-settings-closeout-v299.css?v=299" data-lourex-v299="true" />`,`  <link rel="stylesheet" href="./styles/visual-auth-settings-closeout-v299.css?v=299" data-lourex-v299="true" />\n  <link rel="stylesheet" href="./styles/visual-features-v300.css?v=300" data-lourex-v300="true" />`,'v300 css');
  s=s.replace('./home-final-closeout-v286.js?v=299','./home-final-closeout-v286.js?v=300');
  await write('index.html',s);
}

{
  let s=await read('src/lib/ui-theme.ts');
  s=rep(s,`  root.style.colorScheme=resolved;\n  root.style.backgroundColor=THEME_COLORS[resolved];\n  const meta=document.querySelector('meta[name="theme-color"]');\n  if(meta)meta.setAttribute('content',THEME_COLORS[resolved]);`,`  const booting=root.dataset.lourexBooting==='true'&&Boolean(document.getElementById('lourex-boot'));\n  root.style.colorScheme=booting?'dark':resolved;\n  root.style.backgroundColor=booting?'#080808':THEME_COLORS[resolved];\n  const meta=document.querySelector('meta[name="theme-color"]');\n  if(meta)meta.setAttribute('content',booting?'#080808':THEME_COLORS[resolved]);`,'theme boot guard');
  await write('src/lib/ui-theme.ts',s);
}

await write('src/styles/visual-features-v300.css',`/* LOUREX v300 — purchase orders, encrypted attachments and iPhone boot closeout */
html[data-lourex-booting="true"],html[data-lourex-booting="true"] body,html[data-lourex-booting="true"] #root{background:#080808!important;min-height:100dvh!important}html[data-lourex-booting="true"] body{overscroll-behavior:none}
.document-attachment-input{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}.document-attachments-section .section-heading{align-items:center}.attachment-help{margin:8px 0 14px;color:var(--text-muted,#789099);font-size:12px;line-height:1.65}.document-attachment-list{display:grid;gap:8px}.document-attachment-list article{display:grid;grid-template-columns:40px minmax(0,1fr) auto 44px;align-items:center;gap:10px;min-height:58px;padding:8px 10px;border:1px solid var(--border-subtle,rgba(120,155,165,.22));border-radius:14px;background:var(--surface-raised,rgba(14,38,45,.55))}.attachment-file-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:rgba(32,211,219,.1);color:var(--accent,#20d3db)}.document-attachment-list article div{min-width:0;display:grid;gap:3px}.document-attachment-list strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.document-attachment-list small{font-size:11px;color:var(--text-muted,#789099)}.document-attachment-list a{min-height:40px;display:inline-flex;align-items:center;padding:0 12px;border-radius:10px;text-decoration:none;color:var(--accent,#20d3db);font-weight:700;font-size:12px}.attachments-empty{min-height:70px;display:flex;align-items:center;justify-content:center;gap:8px;border:1px dashed var(--border-subtle,rgba(120,155,165,.26));border-radius:14px;color:var(--text-muted,#789099)}.purchase-order-reference{margin-top:12px}.document-kind-pill.kind-purchase-order{border-color:rgba(196,152,70,.42);background:rgba(196,152,70,.12);color:#c49a4d}.invoice-page.kind-purchase-order .doc-title{letter-spacing:.04em}
@media(max-width:720px){.document-attachment-list article{grid-template-columns:36px minmax(0,1fr) 44px}.document-attachment-list article>a{grid-column:2/3;justify-self:start;padding:0;min-height:32px}.document-attachment-list article>.icon-button{grid-column:3;grid-row:1/3}.document-attachments-section .section-heading.with-action{align-items:flex-start;gap:10px}.document-attachments-section .section-heading.with-action>.button{min-height:44px}}
`);

await write('tests/v300-purchase-order-attachments-pin.test.mjs',`import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';const read=p=>readFile(p,'utf8');
test('v300 purchase orders are first-class encrypted documents',async()=>{const [types,docs,vault,template]=await Promise.all([read('src/types.ts'),read('src/lib/documents.ts'),read('src/storage/vault.ts'),read('src/templates/TemplateRenderer.tsx')]);assert.match(types,/purchase-order/);assert.match(docs,/purchaseOrderPrefix/);assert.match(vault,/supplierSnapshot/);assert.match(template,/PURCHASE ORDER/);});
test('v300 image and PDF attachments live in the encrypted document payload',async()=>{const [types,panel,vault]=await Promise.all([read('src/types.ts'),read('src/components/DocumentAttachmentsSection.tsx'),read('src/storage/vault.ts')]);assert.match(types,/DocumentAttachment/);assert.match(panel,/application\\/pdf/);assert.match(panel,/MAX_TOTAL_BYTES/);assert.match(vault,/attachments/);});
test('v300 explicit login requires PIN and boot stays dark on iPhone',async()=>{const [entry,html]=await Promise.all([read('src/app/index.tsx'),read('index.html')]);assert.match(entry,/freshLogin/);assert.match(entry,/await suspendSession\\(\\)/);assert.match(html,/data-lourex-booting/);assert.match(html,/visual-features-v300/);});
`);
console.log('v300 continuation applied');
