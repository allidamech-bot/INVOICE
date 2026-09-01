import type { Customer, DocumentKind } from '../types.js';
import { makeId } from '../lib/id.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, ConfirmDialog, Field, Icon, IconButton, Input, Modal, Select, Textarea } from './UI.js';

export function blankCustomer(seed=''): Customer { const now=new Date().toISOString(); const name=seed.trim(); const arabic=isArabic(); return { id:makeId('customer'),createdAt:now,updatedAt:now,companyNameEn:arabic?'':name,companyNameAr:arabic?name:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',notes:''}; }

interface FormProps { customer: Customer; onChange: (c:Customer)=>void; }
export function CustomerForm({customer,onChange}:FormProps): any {
  const set=(key:keyof Customer,value:string)=>onChange({...customer,[key]:value,updatedAt:new Date().toISOString()});
  const arabic=isArabic();
  return <div className="customer-form-stack">
    <section className="customer-form-section"><div className="customer-form-section-heading"><div><h3>{t('Company','الشركة')}</h3><p>{t('Core identity used on quotes and invoices.','البيانات الأساسية التي تظهر في عروض الأسعار والفواتير.')}</p></div></div><div className="form-grid two customer-form-grid"><Field label={t('Company Name English','اسم الشركة بالإنجليزية')}><Input autoFocus={!arabic} value={customer.companyNameEn} onChange={(e:any)=>set('companyNameEn',e.target.value)}/></Field><Field label={t('Company Name Arabic','اسم الشركة بالعربية')}><Input autoFocus={arabic} dir="rtl" value={customer.companyNameAr} onChange={(e:any)=>set('companyNameAr',e.target.value)}/></Field><Field label={t('Contact Person','جهة الاتصال')}><Input autoComplete="name" value={customer.contactPerson} onChange={(e:any)=>set('contactPerson',e.target.value)}/></Field><Field label={t('Email','البريد الإلكتروني')}><Input type="email" inputMode="email" autoComplete="email" value={customer.email} onChange={(e:any)=>set('email',e.target.value)}/></Field><Field label={t('Phone','الهاتف')}><Input type="tel" inputMode="tel" autoComplete="tel" value={customer.phone} onChange={(e:any)=>set('phone',e.target.value)}/></Field></div></section>
    <section className="customer-form-section"><div className="customer-form-section-heading"><div><h3>{t('Address','العنوان')}</h3><p>{t('Add only what you normally need on commercial documents.','أضف فقط البيانات التي تحتاجها عادةً في المستندات التجارية.')}</p></div></div><div className="form-grid two customer-form-grid"><Field label={t('Address English','العنوان بالإنجليزية')}><Input value={customer.addressEn} onChange={(e:any)=>set('addressEn',e.target.value)}/></Field><Field label={t('Address Arabic','العنوان بالعربية')}><Input dir="rtl" value={customer.addressAr} onChange={(e:any)=>set('addressAr',e.target.value)}/></Field><Field label={t('City','المدينة')}><Input autoComplete="address-level2" value={customer.city} onChange={(e:any)=>set('city',e.target.value)}/></Field><Field label={t('Country','الدولة')}><Input autoComplete="country-name" value={customer.country} onChange={(e:any)=>set('country',e.target.value)}/></Field></div></section>
    <section className="customer-form-section"><div className="customer-form-section-heading"><div><h3>{t('Business details','البيانات التجارية')}</h3><p>{t('Optional tax, registration and internal notes.','بيانات الضريبة والسجل والملاحظات الداخلية اختيارية.')}</p></div></div><div className="form-grid two customer-form-grid"><Field label={t('VAT / Tax Number','رقم الضريبة / القيمة المضافة')}><Input value={customer.vatTaxNumber} onChange={(e:any)=>set('vatTaxNumber',e.target.value)}/></Field><Field label={t('Commercial Registration','السجل التجاري')}><Input value={customer.commercialRegistration} onChange={(e:any)=>set('commercialRegistration',e.target.value)}/></Field><Field label={t('Notes','ملاحظات')} className="span-2"><Textarea rows="3" value={customer.notes} onChange={(e:any)=>set('notes',e.target.value)}/></Field></div></section>
  </div>;
}

type CustomerSort='name'|'recent';
interface Props { customers: Customer[]; onSave: (customer:Customer)=>Promise<void>; onDelete:(customer:Customer)=>Promise<void>; onNewDocument:(kind:DocumentKind,customer:Customer)=>Promise<void>; }
interface State { query:string; sort:CustomerSort; editing:Customer|null; editingInitial:string; discardConfirm:boolean; deleting:Customer|null; error:string; busy:boolean; creatingDocument:string; }

function normalizeCustomerName(value:string):string{return value.trim().replace(/\s+/g,' ').toLocaleLowerCase();}
function customerDisplayName(customer:Customer):string{return (isArabic()?(customer.companyNameAr||customer.companyNameEn):(customer.companyNameEn||customer.companyNameAr)).trim();}

export class CustomersPage extends React.Component<Props,State> {
  state:State={query:'',sort:'name',editing:null,editingInitial:'',discardConfirm:false,deleting:null,error:'',busy:false,creatingDocument:''};
  private mounted=false;
  componentDidMount():void{this.mounted=true;document.addEventListener('keydown',this.handleKeyDown);}
  componentWillUnmount():void{this.mounted=false;document.removeEventListener('keydown',this.handleKeyDown);}
  private handleKeyDown=(event:KeyboardEvent)=>{
    if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||this.state.editing||document.querySelector('.modal-backdrop'))return;
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
      const haystack=[c.companyNameEn,c.companyNameAr,c.contactPerson,c.email,c.phone,c.city,c.country,c.vatTaxNumber,c.commercialRegistration].join(' ').toLocaleLowerCase();
      return terms.every(term=>haystack.includes(term));
    });
    return customers.sort((a,b)=>{
      if(this.state.sort==='recent')return b.updatedAt.localeCompare(a.updatedAt)||customerDisplayName(a).localeCompare(customerDisplayName(b),isArabic()?'ar':'en',{sensitivity:'base'});
      return customerDisplayName(a).localeCompare(customerDisplayName(b),isArabic()?'ar':'en',{sensitivity:'base'});
    });
  }
  private beginEdit=(customer:Customer)=>{const editing=structuredClone(customer);this.setState({editing,editingInitial:JSON.stringify(editing),discardConfirm:false,error:''});};
  private newCustomer=()=>this.beginEdit(blankCustomer(this.state.query));
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
  private remove=async()=>{const c=this.state.deleting;if(!c||this.state.busy)return;this.setState({busy:true,error:''});try{await this.props.onDelete(c);this.setState({deleting:null,busy:false,error:''});}catch(e){this.setState({deleting:null,busy:false,error:e instanceof Error?e.message:t('Unable to delete customer.','تعذر حذف العميل.')});}};
  render():any{
    const customers=this.filtered();
    const query=this.state.query.trim();
    const hasFilter=Boolean(query);
    return <section className="page customers-page premium-customers-page customer-document-flow-v109">
      <div className="page-heading customers-heading"><div><p className="eyebrow">{t('Address book','دليل العملاء')}</p><h1>{t('Customers','العملاء')}</h1><p className="page-subtitle">{t('Choose a customer and start a quote or invoice immediately.','اختر العميل وابدأ عرض سعر أو فاتورة مباشرة.')}</p></div><Button icon="plus" variant="primary" onClick={this.newCustomer}>{query?t(`Add “${query}”`,`إضافة «${query}»`):t('Add Customer','إضافة عميل')}</Button></div>
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
        return <article className="customer-card premium-customer-card customer-card-v109" key={c.id}><button type="button" className="customer-card-main" onClick={()=>this.beginEdit(c)}><span className="customer-avatar">{primary.trim().charAt(0).toUpperCase()||'C'}</span><span className="customer-info"><span className="customer-name-row"><strong>{primary}</strong>{c.contactPerson?<em>{c.contactPerson}</em>:null}</span>{c.companyNameAr&&c.companyNameEn?<span className="customer-secondary-name" dir={isArabic()?'ltr':'rtl'}>{isArabic()?c.companyNameEn:c.companyNameAr}</span>:null}<small>{location||t('No location','لا يوجد موقع')}</small><small className={contact?'':'customer-missing-contact'}>{contact||t('Add phone or email','أضف الهاتف أو البريد')}</small></span></button><div className="customer-document-actions" aria-label={t(`Create document for ${primary}`,`إنشاء مستند للعميل ${primary}`)}><button type="button" className="customer-document-action quote" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('proforma',c)}><Icon name="proforma"/><span>{creatingQuote?t('Opening…','جارٍ الفتح…'):t('Quote','عرض سعر')}</span></button><button type="button" className="customer-document-action invoice" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('invoice',c)}><Icon name="invoice"/><span>{creatingInvoice?t('Opening…','جارٍ الفتح…'):t('Invoice','فاتورة')}</span></button></div><div className="customer-actions"><IconButton icon="edit" label={t('Edit','تعديل')} onClick={()=>this.beginEdit(c)}/><IconButton icon="trash" label={t('Delete','حذف')} variant="danger" disabled={this.state.busy||creatingAny} onClick={()=>this.setState({deleting:c,error:''})}/></div></article>;
      })}</div>:<div className="empty-state customers-empty"><span className="empty-mark"><Icon name="users" size={28}/></span><h2>{query?t('No matching customer','لا يوجد عميل مطابق'):t('No customers yet','لا يوجد عملاء بعد')}</h2><p>{query?t('Create this customer without typing the name again.','أنشئ هذا العميل دون إعادة كتابة الاسم.'):t('Add your first customer.','أضف أول عميل.')}</p><Button icon="plus" variant="primary" onClick={this.newCustomer}>{query?t(`Create “${query}”`,`إنشاء «${query}»`):t('Add Customer','إضافة عميل')}</Button></div>}
      <Modal open={Boolean(this.state.editing)} title={this.state.editing&&this.props.customers.some(c=>c.id===this.state.editing?.id)?t('Edit Customer','تعديل العميل'):t('Add Customer','إضافة عميل')} size="lg" onClose={this.requestClose} footer={<div className="modal-footer-actions"><Button disabled={this.state.busy} onClick={this.requestClose}>{t('Cancel','إلغاء')}</Button><Button variant="primary" disabled={this.state.busy} onClick={this.save}>{this.state.busy?t('Saving…','جارٍ الحفظ…'):t('Save Customer','حفظ العميل')}</Button></div>}>{this.state.editing?<CustomerForm customer={this.state.editing} onChange={(editing)=>this.setState({editing})}/>:null}{this.state.error?<div className="inline-error customer-form-error" role="alert">{this.state.error}</div>:null}</Modal>
      <ConfirmDialog open={this.state.discardConfirm} title={t('Discard customer changes?','تجاهل تعديلات العميل؟')} message={t('You have unsaved customer changes. Discard them and close?','لديك تعديلات غير محفوظة على العميل. هل تريد تجاهلها والإغلاق؟')} confirmLabel={t('Discard','تجاهل')} onCancel={()=>this.setState({discardConfirm:false})} onConfirm={this.closeEditing}/>
      <ConfirmDialog open={Boolean(this.state.deleting)} title={t(`Delete ${this.state.deleting?.companyNameEn||'customer'}?`,`حذف ${this.state.deleting?.companyNameAr||this.state.deleting?.companyNameEn||'العميل'}؟`)} message={t('This removes the customer from your address book. Existing documents keep their saved customer snapshot.','سيتم حذف العميل من دليل العملاء، بينما تحتفظ المستندات الحالية بنسخة بيانات العميل المحفوظة فيها.')} onCancel={()=>{if(!this.state.busy)this.setState({deleting:null,error:''});}} onConfirm={()=>void this.remove()}/>
    </section>;
  }
}