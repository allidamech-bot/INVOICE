import type { CompanySettings, Customer, DocumentKind } from '../types.js';
import { makeId } from '../lib/id.js';
import { isArabic, t } from '../lib/i18n.js';
import { validateCustomerCommercial } from '../lib/commercial-controls.js';
import { Button, ConfirmDialog, Field, Icon, IconButton, Input, Modal, Select, Textarea } from './UI.js';

export function blankCustomer(seed=''):Customer{
  const now=new Date().toISOString();
  const name=seed.trim();
  const arabic=isArabic();
  return {
    id:makeId('customer'),createdAt:now,updatedAt:now,
    companyNameEn:arabic?'':name,companyNameAr:arabic?name:'',contactPerson:'',
    addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',
    preferredCurrency:'',paymentTermPresetId:'',paymentTerms:'',paymentDueDays:'',creditLimit:'',creditCurrency:'',notes:''
  };
}

interface FormProps{customer:Customer;company?:CompanySettings;onChange:(customer:Customer)=>void;}
export function CustomerForm({customer,company,onChange}:FormProps):any{
  const set=(key:keyof Customer,value:string)=>onChange({...customer,[key]:value,updatedAt:new Date().toISOString()});
  const arabic=isArabic();
  return <div className="customer-form-stack customer-profile-form">
    <section className="customer-form-section">
      <div className="customer-form-section-heading"><div><span>01</span><h3>{t('Identity & contact','الهوية والتواصل')}</h3><p>{t('The customer identity used across quotations and invoices.','هوية العميل المستخدمة في عروض الأسعار والفواتير.')}</p></div></div>
      <div className="form-grid two customer-form-grid">
        <Field label={t('Company Name English','اسم الشركة بالإنجليزية')}><Input autoFocus={!arabic} value={customer.companyNameEn} onChange={(e:any)=>set('companyNameEn',e.target.value)}/></Field>
        <Field label={t('Company Name Arabic','اسم الشركة بالعربية')}><Input autoFocus={arabic} dir="rtl" value={customer.companyNameAr} onChange={(e:any)=>set('companyNameAr',e.target.value)}/></Field>
        <Field label={t('Contact Person','جهة الاتصال')}><Input autoComplete="name" value={customer.contactPerson} onChange={(e:any)=>set('contactPerson',e.target.value)}/></Field>
        <Field label={t('Phone','الهاتف')}><Input type="tel" inputMode="tel" autoComplete="tel" value={customer.phone} onChange={(e:any)=>set('phone',e.target.value)}/></Field>
        <Field label={t('Email','البريد الإلكتروني')} className="span-2"><Input type="email" inputMode="email" autoComplete="email" value={customer.email} onChange={(e:any)=>set('email',e.target.value)}/></Field>
      </div>
    </section>

    <section className="customer-form-section">
      <div className="customer-form-section-heading"><div><span>02</span><h3>{t('Address & registration','العنوان والتسجيل')}</h3><p>{t('Commercial address, tax and registration information.','العنوان التجاري وبيانات الضريبة والتسجيل.')}</p></div></div>
      <div className="form-grid two customer-form-grid">
        <Field label={t('Address English','العنوان بالإنجليزية')}><Input value={customer.addressEn} onChange={(e:any)=>set('addressEn',e.target.value)}/></Field>
        <Field label={t('Address Arabic','العنوان بالعربية')}><Input dir="rtl" value={customer.addressAr} onChange={(e:any)=>set('addressAr',e.target.value)}/></Field>
        <Field label={t('City','المدينة')}><Input autoComplete="address-level2" value={customer.city} onChange={(e:any)=>set('city',e.target.value)}/></Field>
        <Field label={t('Country','الدولة')}><Input autoComplete="country-name" value={customer.country} onChange={(e:any)=>set('country',e.target.value)}/></Field>
        <Field label={t('VAT / Tax Number','رقم الضريبة / القيمة المضافة')}><Input value={customer.vatTaxNumber} onChange={(e:any)=>set('vatTaxNumber',e.target.value)}/></Field>
        <Field label={t('Commercial Registration','السجل التجاري')}><Input value={customer.commercialRegistration} onChange={(e:any)=>set('commercialRegistration',e.target.value)}/></Field>
      </div>
    </section>

    <section className="customer-form-section customer-credit-fields">
      <div className="customer-form-section-heading"><div><span>03</span><h3>{t('Document defaults & credit','إعدادات المستند والائتمان')}</h3><p>{t('Defaults applied when you create a new document for this customer.','إعدادات افتراضية تُستخدم عند إنشاء مستند جديد لهذا العميل.')}</p></div></div>
      <div className="form-grid two customer-form-grid">
        <Field label={t('Preferred Currency','العملة المفضلة')}><Input value={customer.preferredCurrency} placeholder={t('e.g. USD','مثال: USD')} onChange={(e:any)=>set('preferredCurrency',String(e.target.value).toUpperCase())}/></Field>
        <Field label={t('Payment Terms','شروط الدفع')}><Input value={customer.paymentTerms} onChange={(e:any)=>set('paymentTerms',e.target.value)}/>{company?.commercial.paymentTermPresets.length?<span className="commercial-preset-chips">{company.commercial.paymentTermPresets.map(preset=><button type="button" key={preset.id} onClick={()=>onChange({...customer,paymentTermPresetId:preset.id,paymentTerms:preset.label,paymentDueDays:String(preset.days),updatedAt:new Date().toISOString()})}>{preset.label}</button>)}</span>:null}</Field>
        <Field label={t('Due in days','الاستحقاق بعد أيام')}><Input type="number" min="0" max="3650" step="1" value={customer.paymentDueDays} onChange={(e:any)=>set('paymentDueDays',e.target.value)}/></Field>
        <Field label={t('Credit Limit','حد الائتمان')}><Input inputMode="decimal" value={customer.creditLimit} placeholder={t('Blank = no limit','فارغ = بدون حد')} onChange={(e:any)=>set('creditLimit',e.target.value)}/></Field>
        <Field label={t('Credit Currency','عملة حد الائتمان')}><Input value={customer.creditCurrency} onChange={(e:any)=>set('creditCurrency',String(e.target.value).toUpperCase())}/></Field>
        <Field label={t('Internal Notes','ملاحظات داخلية')} className="span-2"><Textarea rows="4" value={customer.notes} onChange={(e:any)=>set('notes',e.target.value)}/></Field>
      </div>
    </section>
  </div>;
}

type CustomerSort='name'|'recent';
interface Props{
  customers:Customer[];
  company:CompanySettings;
  onSave:(customer:Customer)=>Promise<void>;
  onDelete:(customer:Customer)=>Promise<void>;
  onNewDocument:(kind:DocumentKind,customer:Customer)=>Promise<void>;
}
interface State{
  query:string;
  sort:CustomerSort;
  selectedId:string;
  editing:Customer|null;
  editingInitial:string;
  discardConfirm:boolean;
  deleting:Customer|null;
  error:string;
  busy:boolean;
  creatingDocument:string;
}

function normalizeCustomerName(value:string):string{return value.trim().replace(/\s+/g,' ').toLocaleLowerCase();}
function customerDisplayName(customer:Customer):string{return (isArabic()?(customer.companyNameAr||customer.companyNameEn):(customer.companyNameEn||customer.companyNameAr)).trim();}
function secondaryName(customer:Customer):string{return (isArabic()?customer.companyNameEn:customer.companyNameAr).trim();}
function customerLocation(customer:Customer):string{return [customer.city,customer.country].filter(Boolean).join(', ');}
function dateLabel(value:string):string{
  if(!value)return '—';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '—';
  return date.toLocaleDateString(isArabic()?'ar':'en',{year:'numeric',month:'short',day:'numeric'});
}

export class CustomersPage extends React.Component<Props,State>{
  state:State={query:'',sort:'name',selectedId:'',editing:null,editingInitial:'',discardConfirm:false,deleting:null,error:'',busy:false,creatingDocument:''};
  private mounted=false;

  componentDidMount():void{this.mounted=true;document.addEventListener('keydown',this.handleKeyDown);}
  componentWillUnmount():void{this.mounted=false;document.removeEventListener('keydown',this.handleKeyDown);}
  componentDidUpdate():void{
    if(this.state.selectedId&&!this.props.customers.some(customer=>customer.id===this.state.selectedId))this.setState({selectedId:''});
  }

  private handleKeyDown=(event:KeyboardEvent)=>{
    if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||document.querySelector('.modal-backdrop'))return;
    const target=event.target;
    const typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||Boolean(target instanceof HTMLElement&&target.isContentEditable);
    if(event.key==='/'&&!typing&&!this.state.selectedId){event.preventDefault();document.querySelector<HTMLInputElement>('.customers-search-input')?.focus();return;}
    if(event.key==='Escape'&&!typing){
      if(this.state.selectedId){event.preventDefault();this.setState({selectedId:'',error:''});return;}
      if(this.state.query){event.preventDefault();this.setState({query:''});}
    }
  };

  private filtered():Customer[]{
    const terms=this.state.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const rows=this.props.customers.filter(customer=>{
      if(!terms.length)return true;
      const haystack=[customer.companyNameEn,customer.companyNameAr,customer.contactPerson,customer.email,customer.phone,customer.city,customer.country,customer.vatTaxNumber,customer.commercialRegistration,customer.preferredCurrency,customer.creditCurrency].join(' ').toLocaleLowerCase();
      return terms.every(term=>haystack.includes(term));
    });
    return rows.sort((a,b)=>this.state.sort==='recent'?(b.updatedAt.localeCompare(a.updatedAt)||customerDisplayName(a).localeCompare(customerDisplayName(b),isArabic()?'ar':'en',{sensitivity:'base'})):customerDisplayName(a).localeCompare(customerDisplayName(b),isArabic()?'ar':'en',{sensitivity:'base'}));
  }

  private beginEdit=(customer:Customer)=>{const editing=structuredClone(customer);this.setState({editing,editingInitial:JSON.stringify(editing),discardConfirm:false,error:''});};
  private newCustomer=()=>this.beginEdit(blankCustomer(this.state.query));
  private editingDirty=()=>Boolean(this.state.editing&&this.state.editingInitial&&JSON.stringify(this.state.editing)!==this.state.editingInitial);
  private closeEditing=()=>this.setState({editing:null,editingInitial:'',discardConfirm:false,error:''});
  private requestClose=()=>{if(this.state.busy)return;if(this.editingDirty())this.setState({discardConfirm:true});else this.closeEditing();};

  private duplicateCustomer=(candidate:Customer):Customer|undefined=>{
    const names=[candidate.companyNameEn,candidate.companyNameAr].map(normalizeCustomerName).filter(Boolean);
    if(!names.length)return undefined;
    return this.props.customers.find(existing=>existing.id!==candidate.id&&[existing.companyNameEn,existing.companyNameAr].map(normalizeCustomerName).filter(Boolean).some(name=>names.includes(name)));
  };

  private save=async()=>{
    const customer=this.state.editing;if(!customer||this.state.busy)return;
    if(!customer.companyNameEn.trim()&&!customer.companyNameAr.trim()){this.setState({error:t('Company name is required.','اسم الشركة مطلوب.')});return;}
    const duplicate=this.duplicateCustomer(customer);
    if(duplicate){this.setState({error:t(`A customer named “${customerDisplayName(duplicate)}” already exists.`,`يوجد عميل باسم «${customerDisplayName(duplicate)}» بالفعل.`)});return;}
    if(customer.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())){this.setState({error:t('Enter a valid email address or leave it empty.','أدخل بريدًا إلكترونيًا صحيحًا أو اترك الحقل فارغًا.')});return;}
    const commercialError=validateCustomerCommercial(customer);if(commercialError){this.setState({error:commercialError});return;}
    this.setState({busy:true,error:''});
    try{
      await this.props.onSave(customer);
      this.setState({editing:null,editingInitial:'',discardConfirm:false,busy:false,error:'',query:'',selectedId:customer.id});
    }catch(error){this.setState({error:error instanceof Error?error.message:t('Unable to save customer.','تعذر حفظ العميل.'),busy:false});}
  };

  private createDocument=async(kind:DocumentKind,customer:Customer)=>{
    if(this.state.creatingDocument||this.state.busy)return;
    const creatingDocument=`${customer.id}:${kind}`;
    this.setState({creatingDocument,error:''});
    try{await this.props.onNewDocument(kind,customer);}
    catch(error){if(this.mounted)this.setState({error:error instanceof Error?error.message:t('Unable to create document.','تعذر إنشاء المستند.')});}
    finally{if(this.mounted)this.setState({creatingDocument:''});}
  };

  private remove=async()=>{
    const customer=this.state.deleting;if(!customer||this.state.busy)return;
    this.setState({busy:true,error:''});
    try{await this.props.onDelete(customer);this.setState({deleting:null,busy:false,error:'',selectedId:this.state.selectedId===customer.id?'':this.state.selectedId});}
    catch(error){this.setState({deleting:null,busy:false,error:error instanceof Error?error.message:t('Unable to delete customer.','تعذر حذف العميل.')});}
  };

  private renderProfile(customer:Customer):any{
    const primary=customerDisplayName(customer)||t('Unnamed customer','عميل بدون اسم');
    const alternate=secondaryName(customer);
    const location=customerLocation(customer);
    const creatingQuote=this.state.creatingDocument===`${customer.id}:proforma`;
    const creatingInvoice=this.state.creatingDocument===`${customer.id}:invoice`;
    const currency=customer.preferredCurrency||'—';
    const terms=customer.paymentTerms||(customer.paymentDueDays?`${customer.paymentDueDays} ${t('days','يوم')}`:'—');
    const credit=customer.creditLimit?`${customer.creditLimit} ${customer.creditCurrency||customer.preferredCurrency||''}`.trim():t('No limit','بدون حد');
    return <div className="customer-profile-view">
      <div className="customer-profile-topbar"><button type="button" className="customer-profile-back" onClick={()=>this.setState({selectedId:'',error:''})}><Icon name="arrowLeft"/><span>{t('Customers','العملاء')}</span></button><div className="customer-profile-top-actions"><Button icon="edit" onClick={()=>this.beginEdit(customer)}>{t('Edit','تعديل')}</Button><IconButton icon="trash" variant="danger" label={t('Delete customer','حذف العميل')} onClick={()=>this.setState({deleting:customer})}/></div></div>

      <section className="customer-profile-hero">
        <div className="customer-profile-identity"><span className="customer-profile-avatar">{primary.charAt(0).toUpperCase()||'C'}</span><div><p>{t('Customer profile','ملف العميل')}</p><h1>{primary}</h1>{alternate?<span>{alternate}</span>:null}<small>{[customer.contactPerson,location].filter(Boolean).join(' · ')||t('No contact details yet','لا توجد تفاصيل تواصل بعد')}</small></div></div>
        <div className="customer-profile-create"><Button icon="proforma" disabled={Boolean(this.state.creatingDocument)} onClick={()=>void this.createDocument('proforma',customer)}>{creatingQuote?t('Creating…','جارٍ الإنشاء…'):t('New Quote','عرض سعر جديد')}</Button><Button icon="invoice" variant="primary" disabled={Boolean(this.state.creatingDocument)} onClick={()=>void this.createDocument('invoice',customer)}>{creatingInvoice?t('Creating…','جارٍ الإنشاء…'):t('New Invoice','فاتورة جديدة')}</Button></div>
      </section>

      {this.state.error?<div className="inline-error customer-profile-error" role="alert">{this.state.error}</div>:null}

      <div className="customer-profile-metrics" aria-label={t('Customer defaults','إعدادات العميل')}>
        <div><span>{t('Currency','العملة')}</span><strong>{currency}</strong></div>
        <div><span>{t('Payment terms','شروط الدفع')}</span><strong>{terms}</strong></div>
        <div><span>{t('Credit limit','حد الائتمان')}</span><strong>{credit}</strong></div>
        <div><span>{t('Last updated','آخر تحديث')}</span><strong>{dateLabel(customer.updatedAt)}</strong></div>
      </div>

      <div className="customer-profile-grid">
        <section className="customer-profile-card"><header><Icon name="users"/><div><h2>{t('Contact','التواصل')}</h2><p>{t('People and communication channels','الأشخاص وقنوات التواصل')}</p></div></header><dl><div><dt>{t('Contact person','جهة الاتصال')}</dt><dd>{customer.contactPerson||'—'}</dd></div><div><dt>{t('Phone','الهاتف')}</dt><dd>{customer.phone||'—'}</dd></div><div><dt>{t('Email','البريد الإلكتروني')}</dt><dd>{customer.email||'—'}</dd></div></dl></section>
        <section className="customer-profile-card"><header><Icon name="file"/><div><h2>{t('Commercial identity','الهوية التجارية')}</h2><p>{t('Address and registration details','العنوان وبيانات التسجيل')}</p></div></header><dl><div><dt>{t('Location','الموقع')}</dt><dd>{location||'—'}</dd></div><div><dt>{t('Address','العنوان')}</dt><dd>{(isArabic()?(customer.addressAr||customer.addressEn):(customer.addressEn||customer.addressAr))||'—'}</dd></div><div><dt>{t('VAT / Tax Number','رقم الضريبة')}</dt><dd>{customer.vatTaxNumber||'—'}</dd></div><div><dt>{t('Commercial Registration','السجل التجاري')}</dt><dd>{customer.commercialRegistration||'—'}</dd></div></dl></section>
        <section className="customer-profile-card customer-profile-card-wide"><header><Icon name="settings"/><div><h2>{t('Document defaults','إعدادات المستند الافتراضية')}</h2><p>{t('Applied automatically when starting a document for this customer','تُطبق تلقائيًا عند بدء مستند لهذا العميل')}</p></div></header><dl className="customer-profile-defaults"><div><dt>{t('Preferred Currency','العملة المفضلة')}</dt><dd>{currency}</dd></div><div><dt>{t('Payment Terms','شروط الدفع')}</dt><dd>{terms}</dd></div><div><dt>{t('Due in days','الاستحقاق بعد أيام')}</dt><dd>{customer.paymentDueDays||'—'}</dd></div><div><dt>{t('Credit Limit','حد الائتمان')}</dt><dd>{credit}</dd></div></dl>{customer.notes?<div className="customer-profile-notes"><span>{t('Internal notes','ملاحظات داخلية')}</span><p>{customer.notes}</p></div>:null}</section>
      </div>
    </div>;
  }

  render():any{
    const selected=this.state.selectedId?this.props.customers.find(customer=>customer.id===this.state.selectedId):undefined;
    if(selected)return <section className="page customers-page customer-profile-page">{this.renderProfile(selected)}{this.renderDialogs()}</section>;

    const customers=this.filtered();
    const query=this.state.query.trim();
    const hasFilter=Boolean(query);
    const withEmail=this.props.customers.filter(customer=>Boolean(customer.email.trim())).length;
    const withDefaults=this.props.customers.filter(customer=>Boolean(customer.preferredCurrency||customer.paymentTerms||customer.paymentDueDays)).length;
    const countries=new Set(this.props.customers.map(customer=>customer.country.trim()).filter(Boolean)).size;

    return <section className="page customers-page premium-customers-page customer-directory-v165">
      <div className="page-heading customers-heading"><div><p className="eyebrow">{t('Customer directory','دليل العملاء')}</p><h1>{t('Customers','العملاء')}</h1><p className="page-subtitle">{t('Keep commercial identities and document defaults organized in one place.','رتّب الهوية التجارية وإعدادات المستندات لكل عميل في مكان واحد.')}</p></div><Button icon="plus" variant="primary" onClick={this.newCustomer}>{query?t(`Add “${query}”`,`إضافة «${query}»`):t('Add Customer','إضافة عميل')}</Button></div>

      <div className="customer-directory-metrics"><div><span>{t('Customers','العملاء')}</span><strong>{this.props.customers.length}</strong></div><div><span>{t('With email','مع بريد')}</span><strong>{withEmail}</strong></div><div><span>{t('With defaults','مع إعدادات')}</span><strong>{withDefaults}</strong></div><div><span>{t('Countries','الدول')}</span><strong>{countries}</strong></div></div>

      <div className="list-toolbar customers-toolbar premium-customers-toolbar"><div className="search-box customers-search-box"><Icon name="search"/><Input className="customers-search-input" aria-label={t('Search customers','بحث في العملاء')} placeholder={t('Search name, phone, email, tax number or location','ابحث بالاسم أو الهاتف أو البريد أو الضريبة أو الموقع')} value={this.state.query} onChange={(e:any)=>this.setState({query:e.target.value})}/>{query?<IconButton className="customers-search-clear" icon="x" label={t('Clear search','مسح البحث')} onClick={()=>this.setState({query:''})}/>:<kbd className="customers-search-shortcut" aria-hidden="true">/</kbd>}</div><Select className="customers-sort" aria-label={t('Sort customers','ترتيب العملاء')} value={this.state.sort} onChange={(e:any)=>this.setState({sort:e.target.value as CustomerSort})}><option value="name">{t('Name A–Z','الاسم أ–ي')}</option><option value="recent">{t('Recently updated','الأحدث تعديلًا')}</option></Select></div>

      <div className="customers-results-bar"><span><strong>{customers.length}</strong><span>{hasFilter?t('matching','مطابق'):t('customers','عميل')}</span>{hasFilter?<><i aria-hidden="true">/</i><span>{this.props.customers.length} {t('total','إجمالي')}</span></>:null}</span>{hasFilter?<button type="button" onClick={()=>this.setState({query:''})}>{t('Clear search','مسح البحث')}</button>:null}</div>
      {this.state.error&&!this.state.editing?<div className="inline-error" role="alert">{this.state.error}</div>:null}

      {customers.length?<div className="customer-list premium-customer-list customer-directory-grid">{customers.map(customer=>{
        const primary=customerDisplayName(customer)||t('Unnamed customer','عميل بدون اسم');
        const alternate=secondaryName(customer);
        const location=customerLocation(customer);
        const contact=[customer.email,customer.phone].filter(Boolean).join(' · ');
        return <article className="customer-card customer-directory-card" key={customer.id}>
          <button type="button" className="customer-card-main" onClick={()=>this.setState({selectedId:customer.id,error:''})}>
            <span className="customer-avatar">{primary.charAt(0).toUpperCase()||'C'}</span>
            <span className="customer-info"><strong>{primary}</strong>{alternate?<span className="customer-secondary-name">{alternate}</span>:null}<small>{contact||location||t('Open customer profile','فتح ملف العميل')}</small><span className="customer-directory-meta">{location?<em>{location}</em>:null}{customer.preferredCurrency?<em>{customer.preferredCurrency}</em>:null}{customer.paymentTerms?<em>{customer.paymentTerms}</em>:null}</span></span>
            <Icon name="arrowLeft" className="customer-card-arrow"/>
          </button>
          <div className="customer-directory-actions"><IconButton icon="edit" label={t('Edit customer','تعديل العميل')} onClick={()=>this.beginEdit(customer)}/><IconButton icon="proforma" label={t('New quote','عرض سعر جديد')} onClick={()=>void this.createDocument('proforma',customer)}/><IconButton icon="invoice" label={t('New invoice','فاتورة جديدة')} onClick={()=>void this.createDocument('invoice',customer)}/></div>
        </article>;
      })}</div>:<div className="empty-state customer-empty"><span className="empty-mark"><Icon name="users" size={26}/></span><h2>{this.props.customers.length?t('No customers match your search','لا يوجد عملاء مطابقون للبحث'):t('Build your customer directory','أنشئ دليل العملاء')}</h2><p>{this.props.customers.length?t('Try another name, phone, email or location.','جرّب اسمًا أو هاتفًا أو بريدًا أو موقعًا آخر.'):t('Save a customer once, then reuse their commercial details on every document.','احفظ العميل مرة واحدة ثم أعد استخدام بياناته التجارية في كل مستند.')}</p>{!this.props.customers.length?<Button icon="plus" variant="primary" onClick={this.newCustomer}>{t('Add Customer','إضافة عميل')}</Button>:null}</div>}
      {this.renderDialogs()}
    </section>;
  }

  private renderDialogs=():any=><>
    <Modal open={Boolean(this.state.editing)} title={this.state.editing?.id&&this.props.customers.some(customer=>customer.id===this.state.editing?.id)?t('Edit Customer','تعديل العميل'):t('New Customer','عميل جديد')} size="lg" onClose={this.requestClose} footer={<><Button disabled={this.state.busy} onClick={this.requestClose}>{t('Cancel','إلغاء')}</Button><Button icon="save" variant="primary" disabled={this.state.busy} onClick={()=>void this.save()}>{this.state.busy?t('Saving…','جارٍ الحفظ…'):t('Save Customer','حفظ العميل')}</Button></>}>
      {this.state.editing?<CustomerForm customer={this.state.editing} company={this.props.company} onChange={editing=>this.setState({editing,error:''})}/>:null}
      {this.state.error&&this.state.editing?<div className="inline-error customer-form-error" role="alert">{this.state.error}</div>:null}
    </Modal>
    <ConfirmDialog open={this.state.discardConfirm} title={t('Discard changes?','تجاهل التعديلات؟')} message={t('Your unsaved customer changes will be lost.','سيتم فقدان تعديلات العميل غير المحفوظة.')} confirmLabel={t('Discard','تجاهل')} destructive={false} onCancel={()=>this.setState({discardConfirm:false})} onConfirm={this.closeEditing}/>
    <ConfirmDialog open={Boolean(this.state.deleting)} title={t('Delete customer?','حذف العميل؟')} message={t('This removes the saved customer profile. Existing documents keep their stored customer snapshot.','سيتم حذف ملف العميل المحفوظ. المستندات الحالية ستحتفظ بنسخة بيانات العميل المخزنة داخلها.')} confirmLabel={t('Delete','حذف')} onCancel={()=>this.setState({deleting:null})} onConfirm={()=>void this.remove()}/>
  </>;
}
