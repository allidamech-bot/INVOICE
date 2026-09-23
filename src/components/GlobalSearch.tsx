import type { Customer, DocumentKind, LourexDocument, PurchaseRecord, SavedItem, Supplier, UiLanguage } from '../types.js';
import { isArabic, t } from '../lib/i18n.js';
import { documentKindLabel, isSupplierDocumentKind } from '../lib/document-kinds.js';
import { Icon } from './UI.js';

export type GlobalSearchTarget='documents'|'customers'|'items'|'operations'|'receivables'|'reports';
interface Props{
  documents:LourexDocument[];
  customers:Customer[];
  items:SavedItem[];
  suppliers:Supplier[];
  purchases:PurchaseRecord[];
  language:UiLanguage;
  onNavigate:(screen:GlobalSearchTarget)=>void;
  onOpenDocument:(document:LourexDocument)=>void;
  onNewDocument:(kind:DocumentKind)=>void;
}
interface State{open:boolean;query:string;paymentPicker:boolean;}
type ResultKind='document'|'customer'|'product'|'supplier'|'purchase';
interface SearchResult{key:string;kind:ResultKind;title:string;subtitle:string;searchText:string;action:()=>void;}

const OPEN_EVENT='lourex-global-search-open';
function normalize(value:string):string{return value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();}
function localized(primary:string,secondary:string,fallback:string):string{return (isArabic()?(secondary||primary):(primary||secondary))||fallback;}
function documentCustomer(document:LourexDocument):string{if(document.kind==='draft')return document.letter?.subject||document.letter?.recipient||t('Company document','مستند شركة');if(isSupplierDocumentKind(document.kind))return localized(document.supplierSnapshot?.nameEn||'',document.supplierSnapshot?.nameAr||'',t('No supplier','بدون مورد'));return localized(document.customerSnapshot?.companyNameEn||'',document.customerSnapshot?.companyNameAr||'',t('No customer','بدون عميل'));}
function kindLabel(kind:ResultKind):string{
  if(kind==='document')return t('Document','مستند');
  if(kind==='customer')return t('Customer','عميل');
  if(kind==='product')return t('Product','منتج');
  if(kind==='supplier')return t('Supplier','مورد');
  return t('Purchase','شراء');
}
function iconFor(kind:ResultKind):'file'|'users'|'items'|'backup'{return kind==='document'||kind==='purchase'?'file':kind==='customer'||kind==='supplier'?'users':kind==='product'?'items':'backup';}

export class GlobalSearch extends React.Component<Props,State>{
  state:State={open:false,query:'',paymentPicker:false};
  private inputRef:HTMLInputElement|null=null;

  componentDidMount():void{
    document.addEventListener('keydown',this.handleKeyDown);
    window.addEventListener(OPEN_EVENT,this.openFromEvent);
  }
  componentWillUnmount():void{
    document.removeEventListener('keydown',this.handleKeyDown);
    window.removeEventListener(OPEN_EVENT,this.openFromEvent);
  }
  private openFromEvent=()=>this.open();
  private handleKeyDown=(event:KeyboardEvent)=>{
    if(event.key==='Escape'&&this.state.open){event.preventDefault();if(this.state.paymentPicker){this.setState({paymentPicker:false});return;}this.close();return;}
    if(event.key.toLowerCase()==='k'&&(event.metaKey||event.ctrlKey)){
      event.preventDefault();
      this.state.open?this.close():this.open();
    }
  };
  private open=()=>this.setState({open:true,query:'',paymentPicker:false},()=>window.setTimeout(()=>this.inputRef?.focus(),0));
  private close=()=>this.setState({open:false,query:'',paymentPicker:false});
  private navigate=(screen:GlobalSearchTarget)=>{this.close();this.props.onNavigate(screen);};
  private create=(kind:DocumentKind)=>{this.close();this.props.onNewDocument(kind);};
  private openDocument=(document:LourexDocument)=>{this.close();this.props.onOpenDocument(document);};
  private navigateAndCreate=(screen:GlobalSearchTarget,eventName:string)=>{
    this.close();
    this.props.onNavigate(screen);
    window.setTimeout(()=>window.dispatchEvent(new Event(eventName)),0);
  };
  private paymentInvoices=():LourexDocument[]=>this.props.documents
    .filter(document=>document.kind==='invoice'&&document.role!=='credit-note'&&document.status==='final'&&document.lifecycleStatus!=='voided')
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
    .slice(0,20);
  private createPayment=(document:LourexDocument)=>{
    this.close();
    this.props.onNavigate('receivables');
    window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-finance-payment',{detail:{invoiceId:document.id}})),0);
  };

  private results=():SearchResult[]=>{
    const q=normalize(this.state.query);
    if(!q)return[];
    const candidates:SearchResult[]=[];
    for(const document of this.props.documents){
      const customer=documentCustomer(document);
      const kind=documentKindLabel(document.kind,document.role);const label=t(kind.en,kind.ar);
      candidates.push({key:`doc-${document.id}`,kind:'document',title:document.number,subtitle:`${label} · ${customer}`,searchText:[document.number,customer,document.currency,document.issueDate,label].join(' '),action:()=>this.openDocument(document)});
    }
    for(const customer of this.props.customers){
      const name=localized(customer.companyNameEn,customer.companyNameAr,customer.contactPerson||t('Unnamed customer','عميل بدون اسم'));
      candidates.push({key:`customer-${customer.id}`,kind:'customer',title:name,subtitle:[customer.contactPerson,customer.phone,customer.email].filter(Boolean).join(' · ')||t('Customer profile','ملف العميل'),searchText:[customer.companyNameEn,customer.companyNameAr,customer.contactPerson,customer.phone,customer.email,customer.city,customer.country].join(' '),action:()=>this.navigate('customers')});
    }
    for(const item of this.props.items){
      if(item.archived)continue;
      const name=localized(item.descriptionEn,item.descriptionAr,item.sku||t('Unnamed product','منتج بدون اسم'));
      candidates.push({key:`item-${item.id}`,kind:'product',title:name,subtitle:[item.sku,item.category,item.lastCurrency&&item.lastUnitPrice?`${item.lastCurrency} ${item.lastUnitPrice}`:''].filter(Boolean).join(' · ')||t('Product record','سجل المنتج'),searchText:[item.sku||'',item.descriptionEn,item.descriptionAr,item.hsCode,item.origin,item.category||'',...(item.tags||[])].join(' '),action:()=>this.navigate('items')});
    }
    for(const supplier of this.props.suppliers){
      const name=localized(supplier.nameEn,supplier.nameAr,t('Unnamed supplier','مورد بدون اسم'));
      candidates.push({key:`supplier-${supplier.id}`,kind:'supplier',title:name,subtitle:[supplier.contactPerson,supplier.country,supplier.defaultCurrency].filter(Boolean).join(' · ')||t('Supplier profile','ملف المورد'),searchText:[supplier.nameEn,supplier.nameAr,supplier.contactPerson,supplier.phone,supplier.email,supplier.country].join(' '),action:()=>this.navigate('operations')});
    }
    for(const purchase of this.props.purchases){
      const supplier=localized(purchase.supplierSnapshot?.nameEn||'',purchase.supplierSnapshot?.nameAr||'',t('No supplier','بدون مورد'));
      candidates.push({key:`purchase-${purchase.id}`,kind:'purchase',title:purchase.number,subtitle:`${supplier} · ${purchase.date} · ${purchase.currency}`,searchText:[purchase.number,supplier,purchase.date,purchase.currency,purchase.status].join(' '),action:()=>this.navigate('operations')});
    }
    const tokens=q.split(' ').filter(Boolean);
    return candidates.map(result=>{
      const haystack=normalize(`${result.title} ${result.subtitle} ${result.searchText}`);
      const score=tokens.reduce((sum,token)=>sum+(haystack.startsWith(token)?5:haystack.includes(token)?2:0),0)+(normalize(result.title).startsWith(q)?8:0);
      return{result,score};
    }).filter(entry=>entry.score>0).sort((a,b)=>b.score-a.score||a.result.title.localeCompare(b.result.title)).slice(0,10).map(entry=>entry.result);
  };

  private renderPaymentPicker=():any=>{
    const invoices=this.paymentInvoices();
    return <div className="global-search-start global-search-payment-picker">
      <div className="global-search-section-title"><button type="button" className="global-search-back-button" onClick={()=>this.setState({paymentPicker:false})}>← {t('Quick create','الإنشاء السريع')}</button><small>{t('Choose the invoice to collect','اختر الفاتورة للتحصيل')}</small></div>
      <div className="global-search-payment-list">{invoices.length?invoices.map(document=><button type="button" key={document.id} className="global-search-result" onClick={()=>this.createPayment(document)}><span className="global-search-result-icon"><Icon name="invoice"/></span><span className="global-search-result-copy"><small>{t('Record payment','تسجيل دفعة')}</small><strong>{document.number}</strong><span>{documentCustomer(document)} · {document.currency}</span></span><span className="global-search-result-arrow" aria-hidden="true">→</span></button>):<div className="global-search-empty"><Icon name="invoice"/><strong>{t('No collectible invoices','لا توجد فواتير قابلة للتحصيل')}</strong><span>{t('Finalize an invoice first, then record its collection here.','أصدر فاتورة نهائية أولًا ثم سجّل تحصيلها من هنا.')}</span></div>}</div>
    </div>;
  };

  render():any{
    if(!this.state.open)return null;
    const results=this.results();
    return <><button type="button" className="global-search-backdrop" aria-label={t('Close global search','إغلاق البحث الشامل')} onClick={this.close}/><section className="global-search-panel" role="dialog" aria-modal="true" aria-label={t('Search LOUREX','بحث LOUREX')} dir={this.props.language==='ar'?'rtl':'ltr'}>
      <header className="global-search-input-wrap"><Icon name="search"/><input ref={(node:HTMLInputElement|null)=>{this.inputRef=node;}} value={this.state.query} disabled={this.state.paymentPicker} onChange={(event:any)=>this.setState({query:event.target.value})} placeholder={t('Search documents, customers, products, suppliers or purchases…','ابحث في المستندات والعملاء والمنتجات والموردين والمشتريات…')} aria-label={t('Search LOUREX','بحث LOUREX')}/><kbd>ESC</kbd></header>
      {this.state.paymentPicker?this.renderPaymentPicker():!this.state.query.trim()?<div className="global-search-start">
        <div className="global-search-section-title"><span>{t('Quick create','إنشاء سريع')}</span><small>{t('Always opens the canonical workspace','يفتح دائمًا مساحة العمل الأصلية')}</small></div>
        <div className="global-search-actions">
          <button type="button" onClick={()=>this.create('proforma')}><Icon name="proforma"/><span><strong>{t('New quotation','عرض سعر جديد')}</strong><small>{t('Create a commercial quotation','إنشاء عرض تجاري')}</small></span></button>
          <button type="button" onClick={()=>this.create('invoice')}><Icon name="invoice"/><span><strong>{t('New invoice','فاتورة جديدة')}</strong><small>{t('Create an invoice draft','إنشاء مسودة فاتورة')}</small></span></button>
          <button type="button" onClick={()=>this.navigateAndCreate('customers','lourex-create-customer')}><Icon name="users"/><span><strong>{t('New customer','عميل جديد')}</strong><small>{t('Open the customer master form','فتح نموذج العميل الأساسي')}</small></span></button>
          <button type="button" onClick={()=>this.navigateAndCreate('items','lourex-create-product')}><Icon name="items"/><span><strong>{t('New product','منتج جديد')}</strong><small>{t('Add to the product master','إضافة إلى سجل المنتجات')}</small></span></button>
          <button type="button" onClick={()=>this.navigateAndCreate('operations','lourex-create-purchase')}><Icon name="backup"/><span><strong>{t('New purchase','شراء جديد')}</strong><small>{t('Create a purchase draft','إنشاء مسودة شراء')}</small></span></button>
          <button type="button" onClick={()=>this.navigateAndCreate('receivables','lourex-create-expense')}><Icon name="file"/><span><strong>{t('New expense','مصروف جديد')}</strong><small>{t('Record an operating expense','تسجيل مصروف تشغيلي')}</small></span></button>
          <button type="button" onClick={()=>this.setState({paymentPicker:true,query:''})}><Icon name="invoice"/><span><strong>{t('Record payment','تسجيل دفعة')}</strong><small>{t('Collect against a final invoice','تحصيل على فاتورة نهائية')}</small></span></button>
        </div>
        <div className="global-search-section-title"><span>{t('Go to','انتقل إلى')}</span></div>
        <div className="global-search-destinations"><button type="button" onClick={()=>this.navigate('documents')}><Icon name="file"/>{t('Documents','المستندات')}</button><button type="button" onClick={()=>this.navigate('customers')}><Icon name="users"/>{t('Customers','العملاء')}</button><button type="button" onClick={()=>this.navigate('items')}><Icon name="items"/>{t('Products & Inventory','المنتجات والمخزون')}</button><button type="button" onClick={()=>this.navigate('operations')}><Icon name="backup"/>{t('Purchasing','المشتريات')}</button><button type="button" onClick={()=>this.navigate('receivables')}><Icon name="invoice"/>{t('Finance','المالية')}</button><button type="button" onClick={()=>this.navigate('reports')}><Icon name="file"/>{t('Reports','التقارير')}</button></div>
      </div>:<div className="global-search-results">{results.length?results.map(result=><button type="button" key={result.key} className="global-search-result" onClick={result.action}><span className="global-search-result-icon"><Icon name={iconFor(result.kind)}/></span><span className="global-search-result-copy"><small>{kindLabel(result.kind)}</small><strong>{result.title}</strong><span>{result.subtitle}</span></span><span className="global-search-result-arrow" aria-hidden="true">→</span></button>):<div className="global-search-empty"><Icon name="search"/><strong>{t('No matching records','لا توجد نتائج مطابقة')}</strong><span>{t('Try a document number, customer, product, supplier or purchase reference.','جرّب رقم مستند أو اسم عميل أو منتج أو مورد أو مرجع شراء.')}</span></div>}</div>}
      <footer className="global-search-footer"><span>{t('Global search routes every record to its single source of truth.','البحث الشامل يوجّه كل سجل إلى مكانه الأصلي الوحيد.')}</span><kbd>{typeof navigator!=='undefined'&&/Mac|iPhone|iPad/.test(navigator.platform)?'⌘ K':'Ctrl K'}</kbd></footer>
    </section></>;
  }
}
