import type { CompanySettings, Customer, DocumentKind } from '../types.js';
import { makeId } from '../lib/id.js';
import { isArabic, t } from '../lib/i18n.js';
import { validateCustomerCommercial } from '../lib/commercial-controls.js';
import { setWorkspaceDirty } from '../lib/workspace-dirty.js';
import { Button, ConfirmDialog, Field, Icon, IconButton, Input, Modal, Select, Textarea } from './UI.js';

export function blankCustomer(seed=''):Customer{
  const now=new Date().toISOString(),name=seed.trim(),arabic=isArabic();
  return{id:makeId('customer'),createdAt:now,updatedAt:now,companyNameEn:arabic?'':name,companyNameAr:arabic?name:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'',paymentTermPresetId:'',paymentTerms:'',paymentDueDays:'',creditLimit:'',creditCurrency:'',notes:''};
}

interface FormProps {customer:Customer;company?:CompanySettings;onChange:(customer:Customer)=>void;}

/** Shared customer form used by Customer workspace and document creation flows. */
export function CustomerForm({customer,company,onChange}:FormProps):any{
  const set=(key:keyof Customer,value:string)=>onChange({...customer,[key]:value,updatedAt:new Date().toISOString()});
  const arabic=isArabic();
  return <div className="ta-customer-form">
    <section className="ta-customer-form-section"><header><span className="ta-customer-form-icon"><Icon name="users"/></span><div><h3>{t('Company','الشركة')}</h3><p>{t('Core identity used on quotes and invoices.','البيانات الأساسية التي تظهر في عروض الأسعار والفواتير.')}</p></div></header><div className="ta-customer-form-grid"><Field label={t('Company Name English','اسم الشركة بالإنجليزية')}><Input autoFocus={!arabic} value={customer.companyNameEn} onChange={(e:any)=>set('companyNameEn',e.target.value)}/></Field><Field label={t('Company Name Arabic','اسم الشركة بالعربية')}><Input autoFocus={arabic} dir="rtl" value={customer.companyNameAr} onChange={(e:any)=>set('companyNameAr',e.target.value)}/></Field><Field label={t('Contact Person','جهة الاتصال')}><Input autoComplete="name" value={customer.contactPerson} onChange={(e:any)=>set('contactPerson',e.target.value)}/></Field><Field label={t('Email','البريد الإلكتروني')}><Input type="email" inputMode="email" autoComplete="email" value={customer.email} onChange={(e:any)=>set('email',e.target.value)}/></Field><Field label={t('Phone','الهاتف')}><Input type="tel" inputMode="tel" autoComplete="tel" value={customer.phone} onChange={(e:any)=>set('phone',e.target.value)}/></Field></div></section>

    <section className="ta-customer-form-section"><header><span className="ta-customer-form-icon"><Icon name="file"/></span><div><h3>{t('Address','العنوان')}</h3><p>{t('Add only what you normally need on commercial documents.','أضف فقط البيانات التي تحتاجها عادةً في المستندات التجارية.')}</p></div></header><div className="ta-customer-form-grid"><Field label={t('Address English','العنوان بالإنجليزية')}><Input value={customer.addressEn} onChange={(e:any)=>set('addressEn',e.target.value)}/></Field><Field label={t('Address Arabic','العنوان بالعربية')}><Input dir="rtl" value={customer.addressAr} onChange={(e:any)=>set('addressAr',e.target.value)}/></Field><Field label={t('City','المدينة')}><Input autoComplete="address-level2" value={customer.city} onChange={(e:any)=>set('city',e.target.value)}/></Field><Field label={t('Country','الدولة')}><Input autoComplete="country-name" value={customer.country} onChange={(e:any)=>set('country',e.target.value)}/></Field></div></section>

    <section className="ta-customer-form-section"><header><span className="ta-customer-form-icon"><Icon name="invoice"/></span><div><h3>{t('Business details','البيانات التجارية')}</h3><p>{t('Optional tax, registration and internal notes.','بيانات الضريبة والسجل والملاحظات الداخلية اختيارية.')}</p></div></header><div className="ta-customer-form-grid"><Field label={t('VAT / Tax Number','رقم الضريبة / القيمة المضافة')}><Input value={customer.vatTaxNumber} onChange={(e:any)=>set('vatTaxNumber',e.target.value)}/></Field><Field label={t('Commercial Registration','السجل التجاري')}><Input value={customer.commercialRegistration} onChange={(e:any)=>set('commercialRegistration',e.target.value)}/></Field><Field label={t('Notes','ملاحظات')} className="ta-customer-form-wide"><Textarea rows="3" value={customer.notes} onChange={(e:any)=>set('notes',e.target.value)}/></Field></div></section>

    <section className="ta-customer-form-section"><header><span className="ta-customer-form-icon"><Icon name="chart"/></span><div><h3>{t('Commercial controls','الضوابط التجارية')}</h3><p>{t('Optional defaults for currency, payment terms and internal credit control.','إعدادات اختيارية للعملة وشروط الدفع والرقابة الداخلية على الائتمان.')}</p></div></header><div className="ta-customer-form-grid"><Field label={t('Preferred Currency','العملة المفضلة')}><Input value={customer.preferredCurrency} onChange={(e:any)=>set('preferredCurrency',e.target.value.toUpperCase())}/></Field><Field label={t('Payment Terms','شروط الدفع')}><Input value={customer.paymentTerms} onChange={(e:any)=>set('paymentTerms',e.target.value)}/>{company?.commercial.paymentTermPresets.length?<span className="ta-customer-presets">{company.commercial.paymentTermPresets.map(preset=><button type="button" key={preset.id} onClick={()=>onChange({...customer,paymentTermPresetId:preset.id,paymentTerms:preset.label,paymentDueDays:String(preset.days),updatedAt:new Date().toISOString()})}>{preset.label}</button>)}</span>:null}</Field><Field label={t('Due in days','الاستحقاق بعد أيام')}><Input type="number" min="0" max="3650" step="1" value={customer.paymentDueDays} onChange={(e:any)=>set('paymentDueDays',e.target.value)}/></Field><Field label={t('Credit Limit','حد الائتمان')}><Input inputMode="decimal" value={customer.creditLimit} placeholder={t('Blank = no limit','فارغ = بدون حد')} onChange={(e:any)=>set('creditLimit',e.target.value)}/></Field><Field label={t('Credit Currency','عملة حد الائتمان')}><Input value={customer.creditCurrency} onChange={(e:any)=>set('creditCurrency',e.target.value.toUpperCase())}/></Field></div></section>
  </div>;
}

type CustomerSort='name'|'recent';
interface Props {customers:Customer[];company:CompanySettings;onSave:(customer:Customer)=>Promise<void>;onDelete:(customer:Customer)=>Promise<void>;onNewDocument:(kind:DocumentKind,customer:Customer)=>Promise<void>;onViewStatement?:(customer:Customer)=>void;}
interface State {query:string;sort:CustomerSort;editing:Customer|null;editingInitial:string;discardConfirm:boolean;deleting:Customer|null;error:string;busy:boolean;creatingDocument:string;viewingId:string;}

function normalizeCustomerName(value:string):string{return value.trim().replace(/\s+/g,' ').toLowerCase();}
function customerDisplayName(customer:Customer):string{return(isArabic()?(customer.companyNameAr||customer.companyNameEn):(customer.companyNameEn||customer.companyNameAr)).trim();}
function customerSearchSeed(value:string):string{const seed=value.trim();if(!seed||seed.includes('@')||/^[+\d\s().-]{5,}$/.test(seed))return'';return seed;}
function visibleValue(value:string):string{return value.trim()||'—';}

export class CustomersPage extends React.Component<Props,State>{
  state:State={query:'',sort:'name',editing:null,editingInitial:'',discardConfirm:false,deleting:null,error:'',busy:false,creatingDocument:'',viewingId:''};
  private mounted=false;

  componentDidMount():void{this.mounted=true;document.addEventListener('keydown',this.handleKeyDown);window.addEventListener('lourex-create-customer',this.handleQuickCreate);window.addEventListener('beforeunload',this.handleBeforeUnload);this.syncDirtyMarker();}
  componentDidUpdate(prevProps:Props,prevState:State):void{
    if(prevProps.customers!==this.props.customers&&this.state.viewingId&&!this.props.customers.some(customer=>customer.id===this.state.viewingId))this.setState({viewingId:''});
    if(prevState.viewingId!==this.state.viewingId){
      if(this.state.viewingId)document.querySelector<HTMLButtonElement>('.ta-customer-profile-back')?.focus();
      else Array.from(document.querySelectorAll<HTMLElement>('[data-customer-id]')).find(node=>node.dataset.customerId===prevState.viewingId)?.querySelector<HTMLButtonElement>('.ta-customer-row-main')?.focus();
    }
    this.syncDirtyMarker();
  }
  componentWillUnmount():void{this.mounted=false;document.removeEventListener('keydown',this.handleKeyDown);window.removeEventListener('lourex-create-customer',this.handleQuickCreate);window.removeEventListener('beforeunload',this.handleBeforeUnload);setWorkspaceDirty('customers',false);}

  private handleQuickCreate=()=>this.newCustomer();
  private handleKeyDown=(event:KeyboardEvent)=>{
    if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||this.state.editing||document.querySelector('.modal-backdrop'))return;
    if(event.key==='Escape'&&this.state.viewingId){event.preventDefault();this.setState({viewingId:'',error:''});return;}
    if(this.state.viewingId)return;
    const target=event.target;
    const typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||Boolean(target instanceof HTMLElement&&target.isContentEditable);
    if(event.key==='/'&&!typing){event.preventDefault();document.querySelector<HTMLInputElement>('.ta-customers-search-input')?.focus();return;}
    if(event.key==='Escape'&&this.state.query){event.preventDefault();this.setState({query:''});}
  };

  private filtered():Customer[]{
    const terms=this.state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const customers=this.props.customers.filter(customer=>{
      if(!terms.length)return true;
      const haystack=[customer.companyNameEn,customer.companyNameAr,customer.contactPerson,customer.email,customer.phone,customer.city,customer.country,customer.vatTaxNumber,customer.commercialRegistration,customer.preferredCurrency,customer.creditCurrency,customer.paymentTerms,customer.notes].join(' ').toLowerCase();
      return terms.every(term=>haystack.includes(term));
    });
    return customers.sort((a,b)=>this.state.sort==='recent'?b.updatedAt.localeCompare(a.updatedAt)||customerDisplayName(a).localeCompare(customerDisplayName(b),isArabic()?'ar':'en',{sensitivity:'base'}):customerDisplayName(a).localeCompare(customerDisplayName(b),isArabic()?'ar':'en',{sensitivity:'base'}));
  }

  private beginEdit=(customer:Customer)=>{const editing=structuredClone(customer);this.setState({editing,editingInitial:JSON.stringify(editing),discardConfirm:false,error:''});};
  private openProfile=(customer:Customer)=>this.setState({viewingId:customer.id,error:''});
  private newCustomer=()=>this.beginEdit(blankCustomer(customerSearchSeed(this.state.query)));
  private editingDirty=()=>Boolean(this.state.editing&&this.state.editingInitial&&JSON.stringify(this.state.editing)!==this.state.editingInitial);
  private syncDirtyMarker=()=>setWorkspaceDirty('customers',this.editingDirty());
  private handleBeforeUnload=(event:BeforeUnloadEvent)=>{if(!this.editingDirty())return;event.preventDefault();event.returnValue='';};
  private closeEditing=()=>this.setState({editing:null,editingInitial:'',discardConfirm:false,error:''});
  private requestClose=()=>{if(this.state.busy)return;if(this.editingDirty())this.setState({discardConfirm:true});else this.closeEditing();};

  private duplicateCustomer=(candidate:Customer):Customer|undefined=>{
    const candidateNames=[candidate.companyNameEn,candidate.companyNameAr].map(normalizeCustomerName).filter(Boolean);
    if(!candidateNames.length)return undefined;
    return this.props.customers.find(existing=>existing.id!==candidate.id&&[existing.companyNameEn,existing.companyNameAr].map(normalizeCustomerName).filter(Boolean).some(name=>candidateNames.includes(name)));
  };

  private save=async()=>{
    const customer=this.state.editing;if(!customer)return;
    if(!customer.companyNameEn.trim()&&!customer.companyNameAr.trim()){this.setState({error:t('Company name is required.','اسم الشركة مطلوب.')});return;}
    const duplicate=this.duplicateCustomer(customer);
    if(duplicate){this.setState({error:t(`A customer named “${customerDisplayName(duplicate)}” already exists.`,`يوجد عميل باسم «${customerDisplayName(duplicate)}» بالفعل.`)});return;}
    if(customer.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())){this.setState({error:t('Enter a valid email address or leave it empty.','أدخل بريدًا إلكترونيًا صحيحًا أو اترك الحقل فارغًا.')});return;}
    const commercialError=validateCustomerCommercial(customer);if(commercialError){this.setState({error:commercialError});return;}
    this.setState({busy:true,error:''});
    try{await this.props.onSave(customer);this.setState({editing:null,editingInitial:'',discardConfirm:false,busy:false,error:'',query:''});}
    catch(e){this.setState({error:e instanceof Error?e.message:t('Unable to save customer.','تعذر حفظ العميل.'),busy:false});}
  };

  private createDocument=async(kind:DocumentKind,customer:Customer)=>{
    if(this.state.creatingDocument||this.state.busy)return;
    const creatingDocument=`${customer.id}:${kind}`;this.setState({creatingDocument,error:''});
    try{await this.props.onNewDocument(kind,customer);}catch(e){if(this.mounted)this.setState({error:e instanceof Error?e.message:t('Unable to create document.','تعذر إنشاء المستند.')});}
    finally{if(this.mounted)this.setState({creatingDocument:''});}
  };

  private remove=async()=>{
    const customer=this.state.deleting;if(!customer||this.state.busy)return;
    this.setState({busy:true,error:''});
    try{await this.props.onDelete(customer);this.setState({deleting:null,busy:false,error:'',viewingId:this.state.viewingId===customer.id?'':this.state.viewingId});}
    catch(e){this.setState({deleting:null,busy:false,error:e instanceof Error?e.message:t('Unable to delete customer.','تعذر حذف العميل.')});}
  };

  private renderDialogs=():any=><>
    <Modal open={Boolean(this.state.editing)} title={this.state.editing&&this.props.customers.some(customer=>customer.id===this.state.editing?.id)?t('Edit Customer','تعديل العميل'):t('Add Customer','إضافة عميل')} size="lg" onClose={this.requestClose} footer={<div className="ta-customer-modal-actions"><Button disabled={this.state.busy} onClick={this.requestClose}>{t('Cancel','إلغاء')}</Button><Button variant="primary" disabled={this.state.busy} onClick={this.save}>{this.state.busy?t('Saving…','جارٍ الحفظ…'):t('Save Customer','حفظ العميل')}</Button></div>}>{this.state.editing?<CustomerForm company={this.props.company} customer={this.state.editing} onChange={editing=>this.setState({editing})}/>:null}{this.state.error?<div className="ta-customer-form-error" role="alert">{this.state.error}</div>:null}</Modal>
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
    return <section className="ta-customer-profile">
      <div className="ta-customer-profile-toolbar"><button type="button" className="ta-customer-profile-back" onClick={()=>this.setState({viewingId:'',error:''})}><Icon name="arrowLeft"/><span>{t('Customers','العملاء')}</span></button><div><Button icon="edit" onClick={()=>this.beginEdit(customer)}>{t('Edit','تعديل')}</Button>{this.props.onViewStatement?<Button icon="file" onClick={()=>this.props.onViewStatement?.(customer)}>{t('Statement','كشف الحساب')}</Button>:null}<Button icon="proforma" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('proforma',customer)}>{creatingQuote?t('Opening…','جارٍ الفتح…'):t('New Quote','عرض سعر جديد')}</Button><Button icon="invoice" variant="primary" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('invoice',customer)}>{creatingInvoice?t('Opening…','جارٍ الفتح…'):t('New Invoice','فاتورة جديدة')}</Button></div></div>
      {this.state.error&&!this.state.editing?<div className="ta-customer-page-error" role="alert">{this.state.error}</div>:null}

      <header className="ta-customer-profile-hero"><span className="ta-customer-profile-avatar">{primary.trim().charAt(0).toUpperCase()||'C'}</span><div className="ta-customer-profile-identity"><small>{t('Customer profile','ملف العميل')}</small><h1>{primary}</h1>{secondary?<span dir={isArabic()?'ltr':'rtl'}>{secondary}</span>:null}{customer.contactPerson?<strong>{customer.contactPerson}</strong>:null}</div><div className="ta-customer-profile-badges">{customer.preferredCurrency?<span>{t('Currency','العملة')} <b>{customer.preferredCurrency}</b></span>:null}{customer.paymentDueDays?<span>{t('Due','الاستحقاق')} <b>{customer.paymentDueDays} {t('days','يوم')}</b></span>:null}</div></header>

      <div className="ta-customer-profile-grid"><main className="ta-customer-profile-main">
        <section className="ta-customer-panel"><header><div><small>{t('Contact','التواصل')}</small><h2>{t('Contact & address','التواصل والعنوان')}</h2></div></header><div className="ta-customer-facts"><div><small>{t('Phone','الهاتف')}</small><strong dir="ltr">{visibleValue(customer.phone)}</strong></div><div><small>{t('Email','البريد الإلكتروني')}</small><strong dir="ltr">{visibleValue(customer.email)}</strong></div><div><small>{t('City','المدينة')}</small><strong>{visibleValue(customer.city)}</strong></div><div><small>{t('Country','الدولة')}</small><strong>{visibleValue(customer.country)}</strong></div>{customer.addressEn?<div className="is-wide"><small>{t('Address English','العنوان بالإنجليزية')}</small><strong dir="ltr">{customer.addressEn}</strong></div>:null}{customer.addressAr?<div className="is-wide"><small>{t('Address Arabic','العنوان بالعربية')}</small><strong dir="rtl">{customer.addressAr}</strong></div>:null}</div></section>
        <section className="ta-customer-panel"><header><div><small>{t('Business','الأعمال')}</small><h2>{t('Business identity','الهوية التجارية')}</h2></div></header><div className="ta-customer-facts"><div><small>{t('VAT / Tax Number','رقم الضريبة / القيمة المضافة')}</small><strong dir="ltr">{visibleValue(customer.vatTaxNumber)}</strong></div><div><small>{t('Commercial Registration','السجل التجاري')}</small><strong dir="ltr">{visibleValue(customer.commercialRegistration)}</strong></div></div></section>
        {customer.notes?<section className="ta-customer-panel"><header><div><small>{t('Internal','داخلي')}</small><h2>{t('Internal notes','الملاحظات الداخلية')}</h2></div></header><p className="ta-customer-notes">{customer.notes}</p></section>:null}
      </main><aside className="ta-customer-profile-side">
        <section className="ta-customer-panel"><header><div><small>{t('Defaults','الإعدادات الافتراضية')}</small><h2>{t('Document defaults','إعدادات المستندات')}</h2></div></header><div className="ta-customer-stack"><div><small>{t('Preferred Currency','العملة المفضلة')}</small><strong>{visibleValue(customer.preferredCurrency)}</strong></div><div><small>{t('Payment Terms','شروط الدفع')}</small><strong>{visibleValue(customer.paymentTerms)}</strong></div><div><small>{t('Due in days','الاستحقاق بعد أيام')}</small><strong>{visibleValue(customer.paymentDueDays)}</strong></div></div></section>
        <section className="ta-customer-panel"><header><div><small>{t('Internal','داخلي')}</small><h2>{t('Credit control','الرقابة الائتمانية')}</h2></div></header><div className="ta-customer-stack"><div><small>{t('Credit Limit','حد الائتمان')}</small><strong>{creditLimit}</strong></div><div><small>{t('Credit Currency','عملة حد الائتمان')}</small><strong>{visibleValue(customer.creditCurrency)}</strong></div></div></section>
        <section className="ta-customer-panel ta-customer-action-panel"><header><div><small>{t('Actions','الإجراءات')}</small><h2>{t('Quick actions','إجراءات سريعة')}</h2></div></header>{this.props.onViewStatement?<button type="button" onClick={()=>this.props.onViewStatement?.(customer)}><Icon name="file"/><span>{t('View Statement','عرض كشف الحساب')}</span></button>:null}<button type="button" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('proforma',customer)}><Icon name="proforma"/><span>{t('Create quotation','إنشاء عرض سعر')}</span></button><button type="button" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('invoice',customer)}><Icon name="invoice"/><span>{t('Create invoice','إنشاء فاتورة')}</span></button><button type="button" onClick={()=>this.beginEdit(customer)}><Icon name="edit"/><span>{t('Edit customer','تعديل العميل')}</span></button><button type="button" className="is-danger" disabled={this.state.busy||creatingAny} onClick={()=>this.setState({deleting:customer,error:''})}><Icon name="trash"/><span>{t('Delete customer','حذف العميل')}</span></button></section>
      </aside></div>
      {this.renderDialogs()}
    </section>;
  };

  render():any{
    const viewing=this.props.customers.find(customer=>customer.id===this.state.viewingId);if(viewing)return this.renderProfile(viewing);
    const customers=this.filtered(),query=this.state.query.trim(),suggestedName=customerSearchSeed(query),hasFilter=Boolean(query);
    const withEmail=this.props.customers.filter(customer=>customer.email.trim()).length;
    const withCredit=this.props.customers.filter(customer=>customer.creditLimit.trim()).length;
    return <section className="ta-customers-page">
      <header className="ta-customers-header"><div><span className="ta-customers-eyebrow">{t('Address book','دليل العملاء')}</span><h1>{t('Customers','العملاء')}</h1><p>{t('Manage customer identity, commercial defaults and credit controls from one workspace.','أدر هوية العملاء وإعداداتهم التجارية والرقابة الائتمانية من مساحة واحدة.')}</p></div><Button icon="plus" variant="primary" onClick={this.newCustomer}>{suggestedName?t(`Add “${suggestedName}”`,`إضافة «${suggestedName}»`):t('Add Customer','إضافة عميل')}</Button></header>

      <section className="ta-customers-summary"><div><span className="ta-customers-summary-icon"><Icon name="users"/></span><span><small>{t('Customers','العملاء')}</small><strong>{this.props.customers.length}</strong><em>{t('Saved profiles','ملفات محفوظة')}</em></span></div><div><span className="ta-customers-summary-icon"><Icon name="file"/></span><span><small>{t('With email','لديهم بريد')}</small><strong>{withEmail}</strong><em>{t('Ready for contact','جاهزون للتواصل')}</em></span></div><div><span className="ta-customers-summary-icon"><Icon name="chart"/></span><span><small>{t('Credit controls','ضوابط ائتمان')}</small><strong>{withCredit}</strong><em>{t('Profiles with a limit','عملاء لديهم حد')}</em></span></div></section>

      <section className="ta-customers-register">
        <div className="ta-customers-toolbar"><div className="ta-customers-search"><Icon name="search"/><Input className="ta-customers-search-input" aria-label={t('Search customers','بحث في العملاء')} placeholder={t('Search name, phone, email or location','ابحث بالاسم أو الهاتف أو البريد أو الموقع')} value={this.state.query} onChange={(e:any)=>this.setState({query:e.target.value})}/>{query?<IconButton icon="x" label={t('Clear search','مسح البحث')} onClick={()=>this.setState({query:''})}/>:<kbd aria-hidden="true">/</kbd>}</div><Select className="ta-customers-sort" aria-label={t('Sort customers','ترتيب العملاء')} value={this.state.sort} onChange={(e:any)=>this.setState({sort:e.target.value as CustomerSort})}><option value="name">{t('Name A–Z','الاسم أ–ي')}</option><option value="recent">{t('Recently updated','الأحدث تعديلًا')}</option></Select></div>
        <div className="ta-customers-meta"><span><strong>{customers.length}</strong> {hasFilter?t('matching','مطابق'):t('customers','عميل')}{hasFilter?<><i>/</i>{this.props.customers.length} {t('total','إجمالي')}</>:null}</span>{hasFilter?<button type="button" onClick={()=>this.setState({query:''})}>{t('Clear search','مسح البحث')}</button>:null}</div>
        {this.state.error&&!this.state.editing?<div className="ta-customer-page-error" role="alert">{this.state.error}</div>:null}

        {customers.length?<div className="ta-customers-table" role="table"><div className="ta-customers-table-head" role="row"><span>{t('Customer','العميل')}</span><span>{t('Contact','التواصل')}</span><span>{t('Location','الموقع')}</span><span>{t('Commercial defaults','الإعدادات التجارية')}</span><span>{t('Create','إنشاء')}</span><span aria-label={t('Actions','الإجراءات')}/></div>{customers.map(customer=>{
          const primary=customerDisplayName(customer)||t('Unnamed customer','عميل بدون اسم');
          const location=[customer.city,customer.country].filter(Boolean).join(', ');
          const contact=[customer.email,customer.phone].filter(Boolean).join(' · ');
          const creatingQuote=this.state.creatingDocument===`${customer.id}:proforma`,creatingInvoice=this.state.creatingDocument===`${customer.id}:invoice`,creatingAny=Boolean(this.state.creatingDocument);
          const defaults=[customer.preferredCurrency,customer.paymentDueDays?`${customer.paymentDueDays} ${t('days','يوم')}`:''].filter(Boolean).join(' · ');
          return <article className="ta-customer-row" role="row" key={customer.id} data-customer-id={customer.id}><button type="button" className="ta-customer-row-main" onClick={()=>this.openProfile(customer)}><span className="ta-customer-identity"><span className="ta-customer-avatar">{primary.trim().charAt(0).toUpperCase()||'C'}</span><span><strong>{primary}</strong>{customer.companyNameAr&&customer.companyNameEn?<small dir={isArabic()?'ltr':'rtl'}>{isArabic()?customer.companyNameEn:customer.companyNameAr}</small>:customer.contactPerson?<small>{customer.contactPerson}</small>:null}</span></span><span className="ta-customer-contact"><strong>{contact||t('No phone or email','لا يوجد هاتف أو بريد')}</strong>{customer.contactPerson?<small>{customer.contactPerson}</small>:null}</span><span className="ta-customer-location">{location||t('No location','لا يوجد موقع')}</span><span className="ta-customer-defaults">{defaults||t('No defaults','لا توجد إعدادات')}</span></button><div className="ta-customer-create-actions"><button type="button" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('proforma',customer)}><Icon name="proforma"/><span>{creatingQuote?t('Opening…','جارٍ الفتح…'):t('Quote','عرض سعر')}</span></button><button type="button" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('invoice',customer)}><Icon name="invoice"/><span>{creatingInvoice?t('Opening…','جارٍ الفتح…'):t('Invoice','فاتورة')}</span></button></div><div className="ta-customer-row-actions"><IconButton icon="edit" label={t('Edit','تعديل')} onClick={()=>this.beginEdit(customer)}/><IconButton icon="trash" label={t('Delete','حذف')} variant="danger" disabled={this.state.busy||creatingAny} onClick={()=>this.setState({deleting:customer,error:''})}/></div></article>;
        })}</div>:<div className="ta-customers-empty"><span><Icon name="users" size={28}/></span><h2>{query?t('No matching customer','لا يوجد عميل مطابق'):t('No customers yet','لا يوجد عملاء بعد')}</h2><p>{query?t('Try a different name, email, phone or location.','جرّب اسمًا أو بريدًا أو هاتفًا أو موقعًا مختلفًا.'):t('Add customers once, then reuse their details on every document.','أضف العميل مرة واحدة ثم أعد استخدام بياناته في جميع المستندات.')}</p><Button icon="plus" variant="primary" onClick={this.newCustomer}>{suggestedName?t(`Add “${suggestedName}”`,`إضافة «${suggestedName}»`):t('Add Customer','إضافة عميل')}</Button></div>}
      </section>
      {this.renderDialogs()}
    </section>;
  }
}
