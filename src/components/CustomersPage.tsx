import type { CompanySettings, Customer, DocumentKind } from '../types.js';
import { makeId } from '../lib/id.js';
import { isArabic, t } from '../lib/i18n.js';
import { validateCustomerCommercial } from '../lib/commercial-controls.js';
import { Button, ConfirmDialog, Field, Icon, IconButton, Input, Modal, Select, Textarea } from './UI.js';

export function blankCustomer(seed=''): Customer { const now=new Date().toISOString(); const name=seed.trim(); const arabic=isArabic(); return { id:makeId('customer'),createdAt:now,updatedAt:now,companyNameEn:arabic?'':name,companyNameAr:arabic?name:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'',paymentTermPresetId:'',paymentTerms:'',paymentDueDays:'',creditLimit:'',creditCurrency:'',notes:''}; }

interface FormProps { customer: Customer; company?:CompanySettings; onChange: (c:Customer)=>void; }
export function CustomerForm({customer,company,onChange}:FormProps): any {
  const set=(key:keyof Customer,value:string)=>onChange({...customer,[key]:value,updatedAt:new Date().toISOString()});
  const arabic=isArabic();
  return <div className="customer-form-stack">
    <section className="customer-form-section"><div className="customer-form-section-heading"><div><h3>{t('Company','الشركة')}</h3><p>{t('Core identity used on quotes and invoices.','البيانات الأساسية التي تظهر في عروض الأسعار والفواتير.')}</p></div></div><div className="form-grid two customer-form-grid"><Field label={t('Company Name English','اسم الشركة بالإنجليزية')}><Input autoFocus={!arabic} value={customer.companyNameEn} onChange={(e:any)=>set('companyNameEn',e.target.value)}/></Field><Field label={t('Company Name Arabic','اسم الشركة بالعربية')}><Input autoFocus={arabic} dir="rtl" value={customer.companyNameAr} onChange={(e:any)=>set('companyNameAr',e.target.value)}/></Field><Field label={t('Contact Person','جهة الاتصال')}><Input autoComplete="name" value={customer.contactPerson} onChange={(e:any)=>set('contactPerson',e.target.value)}/></Field><Field label={t('Email','البريد الإلكتروني')}><Input type="email" inputMode="email" autoComplete="email" value={customer.email} onChange={(e:any)=>set('email',e.target.value)}/></Field><Field label={t('Phone','الهاتف')}><Input type="tel" inputMode="tel" autoComplete="tel" value={customer.phone} onChange={(e:any)=>set('phone',e.target.value)}/></Field></div></section>
    <section className="customer-form-section"><div className="customer-form-section-heading"><div><h3>{t('Address','العنوان')}</h3><p>{t('Add only what you normally need on commercial documents.','أضف فقط البيانات التي تحتاجها عادةً في المستندات التجارية.')}</p></div></div><div className="form-grid two customer-form-grid"><Field label={t('Address English','العنوان بالإنجليزية')}><Input value={customer.addressEn} onChange={(e:any)=>set('addressEn',e.target.value)}/></Field><Field label={t('Address Arabic','العنوان بالعربية')}><Input dir="rtl" value={customer.addressAr} onChange={(e:any)=>set('addressAr',e.target.value)}/></Field><Field label={t('City','المدينة')}><Input autoComplete="address-level2" value={customer.city} onChange={(e:any)=>set('city',e.target.value)}/></Field><Field label={t('Country','الدولة')}><Input autoComplete="country-name" value={customer.country} onChange={(e:any)=>set('country',e.target.value)}/></Field></div></section>
    <section className="customer-form-section"><div className="customer-form-section-heading"><div><h3>{t('Business details','البيانات التجارية')}</h3><p>{t('Optional tax, registration and internal notes.','بيانات الضريبة والسجل والملاحظات الداخلية اختيارية.')}</p></div></div><div className="form-grid two customer-form-grid"><Field label={t('VAT / Tax Number','رقم الضريبة / القيمة المضافة')}><Input value={customer.vatTaxNumber} onChange={(e:any)=>set('vatTaxNumber',e.target.value)}/></Field><Field label={t('Commercial Registration','السجل التجاري')}><Input value={customer.commercialRegistration} onChange={(e:any)=>set('commercialRegistration',e.target.value)}/></Field><Field label={t('Notes','ملاحظات')} className="span-2"><Textarea rows="3" value={customer.notes} onChange={(e:any)=>set('notes',e.target.value)}/></Field></div></section>
    <section className="customer-form-section customer-credit-fields"><div className="customer-form-section-heading"><div><h3>{t('Commercial controls','الضوابط التجارية')}</h3><p>{t('Optional defaults for currency, payment terms and internal credit control.','إعدادات اختيارية للعملة وشروط الدفع والرقابة الداخلية على الائتمان.')}</p></div></div><div className="form-grid two customer-form-grid"><Field label={t('Preferred Currency','العملة المفضلة')}><Input value={customer.preferredCurrency} onChange={(e:any)=>set('preferredCurrency',e.target.value.toUpperCase())}/></Field><Field label={t('Payment Terms','شروط الدفع')}><Input value={customer.paymentTerms} onChange={(e:any)=>set('paymentTerms',e.target.value)}/>{company?.commercial.paymentTermPresets.length?<span className="commercial-preset-chips">{company.commercial.paymentTermPresets.map(preset=><button type="button" key={preset.id} onClick={()=>onChange({...customer,paymentTermPresetId:preset.id,paymentTerms:preset.label,paymentDueDays:String(preset.days),updatedAt:new Date().toISOString()})}>{preset.label}</button>)}</span>:null}</Field><Field label={t('Due in days','الاستحقاق بعد أيام')}><Input type="number" min="0" max="3650" step="1" value={customer.paymentDueDays} onChange={(e:any)=>set('paymentDueDays',e.target.value)}/></Field><Field label={t('Credit Limit','حد الائتمان')}><Input inputMode="decimal" value={customer.creditLimit} placeholder={t('Blank = no limit','فارغ = بدون حد')} onChange={(e:any)=>set('creditLimit',e.target.value)}/></Field><Field label={t('Credit Currency','عملة حد الائتمان')}><Input value={customer.creditCurrency} onChange={(e:any)=>set('creditCurrency',e.target.value.toUpperCase())}/></Field></div></section>
  </div>;
}

type CustomerSort='name'|'recent';
interface Props { customers: Customer[]; company:CompanySettings; onSave: (customer:Customer)=>Promise<void>; onDelete:(customer:Customer)=>Promise<void>; onNewDocument:(kind:DocumentKind,customer:Customer)=>Promise<void>; }
interface State { query:string; sort:CustomerSort; editing:Customer|null; editingInitial:string; discardConfirm:boolean; deleting:Customer|null; error:string; busy:boolean; creatingDocument:string; viewingId:string; }

function normalizeCustomerName(value:string):string{return value.trim().replace(/\s+/g,' ').toLocaleLowerCase();}
function customerDisplayName(customer:Customer):string{return (isArabic()?(customer.companyNameAr||customer.companyNameEn):(customer.companyNameEn||customer.companyNameAr)).trim();}
function customerSearchSeed(value:string):string{const seed=value.trim();if(!seed||seed.includes('@')||/^[+\d\s().-]{5,}$/.test(seed))return '';return seed;}
function visibleValue(value:string):string{return value.trim()||'—';}

export class CustomersPage extends React.Component<Props,State> {
  state:State={query:'',sort:'name',editing:null,editingInitial:'',discardConfirm:false,deleting:null,error:'',busy:false,creatingDocument:'',viewingId:''};
  private mounted=false;
  componentDidMount():void{this.mounted=true;document.addEventListener('keydown',this.handleKeyDown);}
  componentDidUpdate(prevProps:Props):void{if(prevProps.customers!==this.props.customers&&this.state.viewingId&&!this.props.customers.some(customer=>customer.id===this.state.viewingId))this.setState({viewingId:''});}
  componentWillUnmount():void{this.mounted=false;document.removeEventListener('keydown',this.handleKeyDown);}
  private handleKeyDown=(event:KeyboardEvent)=>{
    if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||this.state.editing||document.querySelector('.modal-backdrop'))return;
    if(event.key==='Escape'&&this.state.viewingId){event.preventDefault();this.setState({viewingId:'',error:''});return;}
    if(this.state.viewingId)return;
    const target=event.target;
    const typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||Boolean(target instanceof HTMLElement&&target.isContentEditable);
    if(event.key==='/'&&!typing){event.preventDefault();document.querySelector<HTMLInputElement>('.customers-search-input')?.focus();return;}
    if(event.key==='Escape'&&this.state.query){event.preventDefault();this.setState({query:''});}
  };
  private filtered():Customer[]{
    const raw=this.state.query.trim();
    const terms=raw.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const customers=this.props.customers.filter(c=>{
      if(!terms.length)return true;
      const haystack=[c.companyNameEn,c.companyNameAr,c.contactPerson,c.email,c.phone,c.city,c.country,c.vatTaxNumber,c.commercialRegistration,c.preferredCurrency,c.creditCurrency,c.paymentTerms,c.notes].join(' ').toLocaleLowerCase();
      return terms.every(term=>haystack.includes(term));
    });
    return customers.sort((a,b)=>{
      if(this.state.sort==='recent')return b.updatedAt.localeCompare(a.updatedAt)||customerDisplayName(a).localeCompare(customerDisplayName(b),isArabic()?'ar':'en',{sensitivity:'base'});
      return customerDisplayName(a).localeCompare(customerDisplayName(b),isArabic()?'ar':'en',{sensitivity:'base'});
    });
  }
  private beginEdit=(customer:Customer)=>{const editing=structuredClone(customer);this.setState({editing,editingInitial:JSON.stringify(editing),discardConfirm:false,error:''});};
  private openProfile=(customer:Customer)=>this.setState({viewingId:customer.id,error:''});
  private newCustomer=()=>this.beginEdit(blankCustomer(customerSearchSeed(this.state.query)));
  private editingDirty=()=>Boolean(this.state.editing&&this.state.editingInitial&&JSON.stringify(this.state.editing)!==this.state.editingInitial);
  private closeEditing=()=>this.setState({editing:null,editingInitial:'',discardConfirm:false,error:''});
  private requestClose=()=>{if(this.state.busy)return;if(this.editingDirty())this.setState({discardConfirm:true});else this.closeEditing();};
  private duplicateCustomer=(candidate:Customer):Customer|undefined=>{
    const candidateNames=[candidate.companyNameEn,candidate.companyNameAr].map(normalizeCustomerName).filter(Boolean);
    if(!candidateNames.length)return undefined;
    return this.props.customers.find(existing=>existing.id!==candidate.id&&[existing.companyNameEn,existing.companyNameAr].map(normalizeCustomerName).filter(Boolean).some(name=>candidateNames.includes(name)));
  };
  private save=async()=>{
    const c=this.state.editing;if(!c)return;
    if(!c.companyNameEn.trim()&&!c.companyNameAr.trim()){this.setState({error:t('Company name is required.','اسم الشركة مطلوب.')});return;}
    const duplicate=this.duplicateCustomer(c);
    if(duplicate){this.setState({error:t(`A customer named “${customerDisplayName(duplicate)}” already exists.`,`يوجد عميل باسم «${customerDisplayName(duplicate)}» بالفعل.`)});return;}
    if(c.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())){this.setState({error:t('Enter a valid email address or leave it empty.','أدخل بريدًا إلكترونيًا صحيحًا أو اترك الحقل فارغًا.')});return;}
    const commercialError=validateCustomerCommercial(c);if(commercialError){this.setState({error:commercialError});return;}
    this.setState({busy:true,error:''});
    try{await this.props.onSave(c);this.setState({editing:null,editingInitial:'',discardConfirm:false,busy:false,error:'',query:''});}catch(e){this.setState({error:e instanceof Error?e.message:t('Unable to save customer.','تعذر حفظ العميل.'),busy:false});}
  };
  private createDocument=async(kind:DocumentKind,customer:Customer)=>{
    if(this.state.creatingDocument||this.state.busy)return;
    const creatingDocument=`${customer.id}:${kind}`;
    this.setState({creatingDocument,error:''});
    try{await this.props.onNewDocument(kind,customer);}
    catch(e){if(this.mounted)this.setState({error:e instanceof Error?e.message:t('Unable to create document.','تعذر إنشاء المستند.')});}
    finally{if(this.mounted)this.setState({creatingDocument:''});}
  };
  private remove=async()=>{const c=this.state.deleting;if(!c||this.state.busy)return;this.setState({busy:true,error:''});try{await this.props.onDelete(c);this.setState({deleting:null,busy:false,error:'',viewingId:this.state.viewingId===c.id?'':this.state.viewingId});}catch(e){this.setState({deleting:null,busy:false,error:e instanceof Error?e.message:t('Unable to delete customer.','تعذر حذف العميل.')});}};
  private renderDialogs=():any=><>
    <Modal open={Boolean(this.state.editing)} title={this.state.editing&&this.props.customers.some(c=>c.id===this.state.editing?.id)?t('Edit Customer','تعديل العميل'):t('Add Customer','إضافة عميل')} size="lg" onClose={this.requestClose} footer={<div className="modal-footer-actions"><Button disabled={this.state.busy} onClick={this.requestClose}>{t('Cancel','إلغاء')}</Button><Button variant="primary" disabled={this.state.busy} onClick={this.save}>{this.state.busy?t('Saving…','جارٍ الحفظ…'):t('Save Customer','حفظ العميل')}</Button></div>}>{this.state.editing?<CustomerForm company={this.props.company} customer={this.state.editing} onChange={(editing)=>this.setState({editing})}/>:null}{this.state.error?<div className="inline-error customer-form-error" role="alert">{this.state.error}</div>:null}</Modal>
    <ConfirmDialog open={this.state.discardConfirm} title={t('Discard customer changes?','تجاهل تعديلات العميل؟')} message={t('You have unsaved customer changes. Discard them and close?','لديك تعديلات غير محفوظة على العميل. هل تريد تجاهلها والإغلاق؟')} confirmLabel={t('Discard','تجاهل')} onCancel={()=>this.setState({discardConfirm:false})} onConfirm={this.closeEditing}/>
    <ConfirmDialog open={Boolean(this.state.deleting)} title={t(`Delete ${this.state.deleting?customerDisplayName(this.state.deleting)||'customer':'customer'}?`,`حذف ${this.state.deleting?customerDisplayName(this.state.deleting)||'العميل':'العميل'}؟`)} message={t('This removes the customer from your address book. Existing documents keep their saved customer snapshot.','سيتم حذف العميل من دليل العملاء، بينما تحتفظ المستندات الحالية بنسخة بيانات العميل المحفوظة فيها.')} onCancel={()=>{if(!this.state.busy)this.setState({deleting:null,error:''});}} onConfirm={()=>void this.remove()}/>
  </>;
  private renderProfile=(customer:Customer):any=>{
    const primary=customerDisplayName(customer)||t('Unnamed customer','عميل بدون اسم');
    const secondary=customer.companyNameEn&&customer.companyNameAr?(isArabic()?customer.companyNameEn:customer.companyNameAr):'';
    const creatingQuote=this.state.creatingDocument===`${customer.id}:proforma`;
    const creatingInvoice=this.state.creatingDocument===`${customer.id}:invoice`;
    const creatingAny=Boolean(this.state.creatingDocument);
    const creditCurrency=customer.creditCurrency||customer.preferredCurrency;
    const creditLimit=customer.creditLimit.trim()?`${customer.creditLimit}${creditCurrency?` ${creditCurrency}`:''}`:t('No limit','بدون حد');
    return <section className="page customers-page premium-customers-page customer-document-flow-v109 customer-profile-page">
      <div className="customer-profile-topbar"><button type="button" className="customer-profile-back" onClick={()=>this.setState({viewingId:'',error:''})}><Icon name="arrowLeft"/><span>{t('Customers','العملاء')}</span></button><div className="customer-profile-top-actions"><Button icon="edit" onClick={()=>this.beginEdit(customer)}>{t('Edit customer','تعديل العميل')}</Button><Button icon="proforma" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('proforma',customer)}>{creatingQuote?t('Opening…','جارٍ الفتح…'):t('New Quote','عرض سعر جديد')}</Button><Button icon="invoice" variant="primary" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('invoice',customer)}>{creatingInvoice?t('Opening…','جارٍ الفتح…'):t('New Invoice','فاتورة جديدة')}</Button></div></div>
      {this.state.error&&!this.state.editing?<div className="inline-error customer-profile-error" role="alert">{this.state.error}</div>:null}
      <header className="customer-profile-hero"><span className="customer-profile-avatar">{primary.trim().charAt(0).toUpperCase()||'C'}</span><div className="customer-profile-identity"><p>{t('Customer profile','ملف العميل')}</p><h1>{primary}</h1>{secondary?<span className="customer-profile-secondary-name" dir={isArabic()?'ltr':'rtl'}>{secondary}</span>:null}{customer.contactPerson?<strong>{customer.contactPerson}</strong>:null}</div><div className="customer-profile-badges">{customer.preferredCurrency?<span>{t('Currency','العملة')}: <b>{customer.preferredCurrency}</b></span>:null}{customer.paymentDueDays?<span>{t('Due','الاستحقاق')}: <b>{customer.paymentDueDays} {t('days','يوم')}</b></span>:null}</div></header>
      <div className="customer-profile-grid"><div className="customer-profile-main">
        <section className="customer-profile-card"><header><h2>{t('Contact & address','التواصل والعنوان')}</h2></header><div className="customer-profile-facts"><div><small>{t('Phone','الهاتف')}</small><strong dir="ltr">{visibleValue(customer.phone)}</strong></div><div><small>{t('Email','البريد الإلكتروني')}</small><strong dir="ltr">{visibleValue(customer.email)}</strong></div><div><small>{t('City','المدينة')}</small><strong>{visibleValue(customer.city)}</strong></div><div><small>{t('Country','الدولة')}</small><strong>{visibleValue(customer.country)}</strong></div>{customer.addressEn?<div className="wide"><small>{t('Address English','العنوان بالإنجليزية')}</small><strong dir="ltr">{customer.addressEn}</strong></div>:null}{customer.addressAr?<div className="wide"><small>{t('Address Arabic','العنوان بالعربية')}</small><strong dir="rtl">{customer.addressAr}</strong></div>:null}</div></section>
        <section className="customer-profile-card"><header><h2>{t('Business identity','الهوية التجارية')}</h2></header><div className="customer-profile-facts"><div><small>{t('VAT / Tax Number','رقم الضريبة / القيمة المضافة')}</small><strong dir="ltr">{visibleValue(customer.vatTaxNumber)}</strong></div><div><small>{t('Commercial Registration','السجل التجاري')}</small><strong dir="ltr">{visibleValue(customer.commercialRegistration)}</strong></div></div></section>
        {customer.notes?<section className="customer-profile-card"><header><h2>{t('Internal notes','الملاحظات الداخلية')}</h2></header><p className="customer-profile-notes">{customer.notes}</p></section>:null}
      </div><aside className="customer-profile-side">
        <section className="customer-profile-card"><header><h2>{t('Document defaults','إعدادات المستندات')}</h2></header><div className="customer-profile-stack"><div><small>{t('Preferred Currency','العملة المفضلة')}</small><strong>{visibleValue(customer.preferredCurrency)}</strong></div><div><small>{t('Payment Terms','شروط الدفع')}</small><strong>{visibleValue(customer.paymentTerms)}</strong></div><div><small>{t('Due in days','الاستحقاق بعد أيام')}</small><strong>{visibleValue(customer.paymentDueDays)}</strong></div></div></section>
        <section className="customer-profile-card customer-profile-credit"><header><h2>{t('Credit control','الرقابة الائتمانية')}</h2><span>{t('Internal','داخلي')}</span></header><div className="customer-profile-stack"><div><small>{t('Credit Limit','حد الائتمان')}</small><strong>{creditLimit}</strong></div><div><small>{t('Credit Currency','عملة حد الائتمان')}</small><strong>{visibleValue(customer.creditCurrency)}</strong></div></div></section>
        <section className="customer-profile-card customer-profile-quick-actions"><header><h2>{t('Actions','الإجراءات')}</h2></header><button type="button" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('proforma',customer)}><Icon name="proforma"/><span>{t('Create quotation','إنشاء عرض سعر')}</span></button><button type="button" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('invoice',customer)}><Icon name="invoice"/><span>{t('Create invoice','إنشاء فاتورة')}</span></button><button type="button" onClick={()=>this.beginEdit(customer)}><Icon name="edit"/><span>{t('Edit customer','تعديل العميل')}</span></button><button type="button" className="danger" disabled={this.state.busy||creatingAny} onClick={()=>this.setState({deleting:customer,error:''})}><Icon name="trash"/><span>{t('Delete customer','حذف العميل')}</span></button></section>
      </aside></div>
      {this.renderDialogs()}
    </section>;
  };
  render():any{
    const viewing=this.props.customers.find(customer=>customer.id===this.state.viewingId);
    if(viewing)return this.renderProfile(viewing);
    const customers=this.filtered();
    const query=this.state.query.trim();
    const suggestedName=customerSearchSeed(query);
    const hasFilter=Boolean(query);
    return <section className="page customers-page premium-customers-page customer-document-flow-v109">
      <div className="page-heading customers-heading"><div><p className="eyebrow">{t('Address book','دليل العملاء')}</p><h1>{t('Customers','العملاء')}</h1><p className="page-subtitle">{t('Choose a customer and start a quote or invoice immediately.','اختر العميل وابدأ عرض سعر أو فاتورة مباشرة.')}</p></div><Button icon="plus" variant="primary" onClick={this.newCustomer}>{suggestedName?t(`Add “${suggestedName}”`,`إضافة «${suggestedName}»`):t('Add Customer','إضافة عميل')}</Button></div>
      <div className="list-toolbar customers-toolbar premium-customers-toolbar"><div className="search-box customers-search-box"><Icon name="search"/><Input className="customers-search-input" aria-label={t('Search customers','بحث في العملاء')} placeholder={t('Search name, phone, email or location','ابحث بالاسم أو الهاتف أو البريد أو الموقع')} value={this.state.query} onChange={(e:any)=>this.setState({query:e.target.value})}/>{query?<IconButton className="customers-search-clear" icon="x" label={t('Clear search','مسح البحث')} onClick={()=>this.setState({query:''})}/>:<kbd className="customers-search-shortcut" aria-hidden="true">/</kbd>}</div><Select className="customers-sort" aria-label={t('Sort customers','ترتيب العملاء')} value={this.state.sort} onChange={(e:any)=>this.setState({sort:e.target.value as CustomerSort})}><option value="name">{t('Name A–Z','الاسم أ–ي')}</option><option value="recent">{t('Recently updated','الأحدث تعديلًا')}</option></Select></div>
      <div className="customers-results-bar"><span><strong>{customers.length}</strong><span>{hasFilter?t('matching','مطابق'):t('customers','عميل')}</span>{hasFilter?<><i aria-hidden="true">/</i><span>{this.props.customers.length} {t('total','إجمالي')}</span></>:null}</span>{hasFilter?<button type="button" onClick={()=>this.setState({query:''})}>{t('Clear search','مسح البحث')}</button>:null}</div>
      {this.state.error&&!this.state.editing?<div className="inline-error" role="alert">{this.state.error}</div>:null}
      {customers.length?<div className="customer-list premium-customer-list">{customers.map(c=>{
        const primary=customerDisplayName(c)||t('Unnamed customer','عميل بدون اسم');
        const location=[c.city,c.country].filter(Boolean).join(', ');
        const contact=[c.email,c.phone].filter(Boolean).join(' · ');
        const creatingQuote=this.state.creatingDocument===`${c.id}:proforma`;
        const creatingInvoice=this.state.creatingDocument===`${c.id}:invoice`;
        const creatingAny=Boolean(this.state.creatingDocument);
        return <article className="customer-card premium-customer-card customer-card-v109" key={c.id}><button type="button" className="customer-card-main" onClick={()=>this.openProfile(c)}><span className="customer-avatar">{primary.trim().charAt(0).toUpperCase()||'C'}</span><span className="customer-info"><span className="customer-name-row"><strong>{primary}</strong>{c.contactPerson?<em>{c.contactPerson}</em>:null}</span>{c.companyNameAr&&c.companyNameEn?<span className="customer-secondary-name" dir={isArabic()?'ltr':'rtl'}>{isArabic()?c.companyNameEn:c.companyNameAr}</span>:null}<small>{location||t('No location','لا يوجد موقع')}</small><small className={contact?'':'customer-missing-contact'}>{contact||t('Add phone or email','أضف الهاتف أو البريد')}</small></span></button><div className="customer-document-actions" aria-label={t(`Create document for ${primary}`,`إنشاء مستند للعميل ${primary}`)}><button type="button" className="customer-document-action quote" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('proforma',c)}><Icon name="proforma"/><span>{creatingQuote?t('Opening…','جارٍ الفتح…'):t('Quote','عرض سعر')}</span></button><button type="button" className="customer-document-action invoice" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('invoice',c)}><Icon name="invoice"/><span>{creatingInvoice?t('Opening…','جارٍ الفتح…'):t('Invoice','فاتورة')}</span></button></div><div className="customer-actions"><IconButton icon="edit" label={t('Edit','تعديل')} onClick={()=>this.beginEdit(c)}/><IconButton icon="trash" label={t('Delete','حذف')} variant="danger" disabled={this.state.busy||creatingAny} onClick={()=>this.setState({deleting:c,error:''})}/></div></article>;
      })}</div>:<div className="empty-state customers-empty"><span className="empty-mark"><Icon name="users" size={28}/></span><h2>{query?t('No matching customer','لا يوجد عميل مطابق'):t('No customers yet','لا يوجد عملاء بعد')}</h2><p>{query&&suggestedName?t('Create this customer without typing the name again.','أنشئ هذا العميل دون إعادة كتابة الاسم.'):query?t('No customer matches this search. You can add a new customer without using the search text as the company name.','لا يوجد عميل يطابق هذا البحث. يمكنك إضافة عميل جديد دون استخدام نص البحث كاسم للشركة.'):t('Add your first customer.','أضف أول عميل.')}</p><Button icon="plus" variant="primary" onClick={this.newCustomer}>{suggestedName?t(`Create “${suggestedName}”`,`إنشاء «${suggestedName}»`):t('Add Customer','إضافة عميل')}</Button></div>}
      {this.renderDialogs()}
    </section>;
  }
}
