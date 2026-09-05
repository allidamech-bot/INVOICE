import type { DocumentKind, LourexDocument, PaymentRecord, PaymentStatus } from '../types.js';
import { calculateTotals, compareMoneyStrings, formatMoney, lineTotal } from '../lib/money.js';
import { displayDate } from '../lib/id.js';
import { hasDocumentCustomer, validateDocument } from '../lib/documents.js';
import { invoicePaymentSummary } from '../lib/payments.js';
import { getUiLanguage, isArabic, t } from '../lib/i18n.js';
import { Button, Icon, IconButton, Input, Segmented, Select } from './UI.js';

interface Props {
  documents: LourexDocument[];
  payments: PaymentRecord[];
  onNew: (kind: DocumentKind) => void;
  onOpen: (doc: LourexDocument) => void;
  onDuplicate: (doc: LourexDocument) => void;
  onConvert?: (doc: LourexDocument) => void;
  onPrint: (doc: LourexDocument, mode: 'print'|'pdf'|'share') => Promise<void>;
  onDelete: (doc:LourexDocument) => void;
}

type WorkspaceStatus='all'|'draft'|'ready'|'final'|'voided';
type SortMode='latest'|'oldest'|'highest'|'lowest';
type PaymentFilter='all'|PaymentStatus;
interface State {
  tab:'all'|'proforma'|'invoice';
  status:WorkspaceStatus;
  payment:PaymentFilter;
  currency:string;
  sort:SortMode;
  query:string;
  menuId:string;
  filtersOpen:boolean;
  outputId:string;
  detailId:string;
}

function workflowStatus(doc:LourexDocument):Exclude<WorkspaceStatus,'all'|'voided'>{
  if(doc.status==='final')return 'final';
  return Object.keys(validateDocument(doc)).length===0?'ready':'draft';
}

function matchesWorkspaceStatus(doc:LourexDocument,status:WorkspaceStatus):boolean{
  if(status==='all')return true;
  if(status==='voided')return doc.lifecycleStatus==='voided';
  if(status==='final')return doc.status==='final'&&doc.lifecycleStatus!=='voided';
  return workflowStatus(doc)===status;
}

function itemCountLabel(count:number):string{
  if(isArabic())return count===1?'صنف واحد':`${count} أصناف`;
  return `${count} item${count===1?'':'s'}`;
}

function customerName(doc:LourexDocument):string{
  const snapshot=doc.customerSnapshot;
  if(!snapshot)return t('No customer','بدون عميل');
  return isArabic()
    ? (snapshot.companyNameAr||snapshot.companyNameEn||t('No customer','بدون عميل'))
    : (snapshot.companyNameEn||snapshot.companyNameAr||t('No customer','بدون عميل'));
}

function kindLabel(doc:LourexDocument):string{
  if(doc.role==='credit-note')return t('Credit Note','إشعار دائن');
  return doc.kind==='proforma'?t('Quotation','عرض سعر'):t('Invoice','فاتورة');
}

function paymentLabel(status:PaymentStatus):string{
  return status==='paid'?t('Paid','مدفوعة')
    :status==='partially-paid'?t('Partially Paid','مدفوعة جزئيًا')
    :status==='overdue'?t('Overdue','متأخرة')
    :t('Unpaid','غير مدفوعة');
}

function documentSearchText(doc:LourexDocument):string{
  const customer=doc.customerSnapshot;
  const itemValues=doc.items.flatMap(item=>[item.descriptionEn,item.descriptionAr,item.hsCode,item.origin,item.packing,item.unit]);
  return [
    doc.number,doc.currency,doc.creditForNumber,
    customer?.companyNameEn,customer?.companyNameAr,customer?.contactPerson,
    customer?.phone,customer?.email,customer?.city,customer?.country,
    ...itemValues,
    doc.terms.incoterm,doc.terms.paymentTerms,doc.terms.finalDestination,
    doc.terms.countryOfOrigin,doc.terms.portOfLoading,doc.notes
  ].filter(Boolean).join(' ').toLowerCase();
}

export class DocumentsPage extends React.Component<Props,State>{
  state:State={tab:'all',status:'all',payment:'all',currency:'all',sort:'latest',query:'',menuId:'',filtersOpen:false,outputId:'',detailId:''};
  private quoteConversions=new Set<string>();

  componentDidMount():void{
    document.addEventListener('pointerdown',this.handleOutsidePointer);
    document.addEventListener('keydown',this.handleKeyDown);
  }
  componentDidUpdate(prevProps:Props):void{
    if(this.state.detailId&&!this.props.documents.some(doc=>doc.id===this.state.detailId))this.setState({detailId:''});
    if(prevProps.documents!==this.props.documents&&this.state.menuId&&!this.props.documents.some(doc=>doc.id===this.state.menuId))this.setState({menuId:''});
  }
  componentWillUnmount():void{
    document.removeEventListener('pointerdown',this.handleOutsidePointer);
    document.removeEventListener('keydown',this.handleKeyDown);
  }

  private handleOutsidePointer=(event:PointerEvent)=>{
    if(!this.state.menuId)return;
    const target=event.target;
    if(target instanceof Element&&target.closest('.document-actions,.mobile-actions,.document-action-popover,.mobile-document-action-portal'))return;
    this.setState({menuId:''});
  };
  private handleKeyDown=(event:KeyboardEvent)=>{
    if(document.querySelector('.modal-backdrop'))return;
    if(event.key==='Escape'){
      if(this.state.menuId){this.setState({menuId:''});return;}
      if(this.state.detailId){this.setState({detailId:''});return;}
    }
    if(this.state.detailId||event.key!=='/'||event.ctrlKey||event.metaKey||event.altKey)return;
    const target=event.target;
    if(target instanceof HTMLElement&&(target.matches('input, textarea, select')||target.isContentEditable))return;
    const input=document.querySelector<HTMLInputElement>('.documents-search-input');
    if(!input)return;
    event.preventDefault();input.focus();
  };

  private paymentStatus=(doc:LourexDocument):PaymentStatus|null=>{
    if(doc.kind!=='invoice'||doc.role==='credit-note'||doc.status!=='final'||doc.lifecycleStatus==='voided')return null;
    return invoicePaymentSummary(doc,this.props.payments,undefined,this.props.documents).status;
  };

  private linkedInvoiceForQuote=(doc:LourexDocument):LourexDocument|undefined=>{
    if(doc.kind!=='proforma'||doc.role!=='standard')return undefined;
    return this.props.documents.find(item=>item.kind==='invoice'&&item.role==='standard'&&item.convertedFromId===doc.id&&item.lifecycleStatus!=='voided');
  };

  private filtered():LourexDocument[]{
    const q=this.state.query.trim().toLowerCase();
    return this.props.documents.filter(doc=>{
      if(this.state.tab!=='all'&&doc.kind!==this.state.tab)return false;
      if(!matchesWorkspaceStatus(doc,this.state.status))return false;
      if(this.state.currency!=='all'&&doc.currency!==this.state.currency)return false;
      if(this.state.payment!=='all'&&this.paymentStatus(doc)!==this.state.payment)return false;
      if(q&&!documentSearchText(doc).includes(q))return false;
      return true;
    }).sort((a,b)=>{
      if(this.state.sort==='oldest')return a.updatedAt.localeCompare(b.updatedAt);
      if(this.state.sort==='highest'||this.state.sort==='lowest'){
        const currencyOrder=a.currency.localeCompare(b.currency,undefined,{sensitivity:'base'});
        if(currencyOrder)return currencyOrder;
        const av=calculateTotals(a.items,a.adjustments).grandTotal;
        const bv=calculateTotals(b.items,b.adjustments).grandTotal;
        const byTotal=compareMoneyStrings(av,bv);
        if(byTotal)return this.state.sort==='highest'?-byTotal:byTotal;
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }

  private runAction=(action:()=>void)=>this.setState({menuId:''},action);
  private convertQuote=(doc:LourexDocument)=>{
    if(this.quoteConversions.has(doc.id))return;
    this.quoteConversions.add(doc.id);
    void Promise.resolve(this.props.onConvert?.(doc)).finally(()=>this.quoteConversions.delete(doc.id));
  };
  private reserveOutput=(mode:'pdf'|'share')=>{try{(window as any).__LOUREX_PREPARE_PDF__?.(mode);}catch{}};
  private runOutput=async(mode:'pdf'|'share',doc:LourexDocument)=>{
    if(this.state.outputId)return;
    this.reserveOutput(mode);
    this.setState({menuId:'',outputId:doc.id});
    try{await this.props.onPrint(doc,mode);}catch{/* App surfaces actionable output errors. */}
    finally{this.setState({outputId:''});}
  };
  private clearFilters=()=>this.setState({tab:'all',status:'all',payment:'all',currency:'all',query:'',sort:'latest',menuId:'',filtersOpen:false});
  private clearSearch=()=>this.setState({query:'',menuId:''},()=>document.querySelector<HTMLInputElement>('.documents-search-input')?.focus());
  private setOverview=(tab:State['tab'],status:WorkspaceStatus)=>this.setState({tab,status,payment:'all',currency:'all',query:'',menuId:'',filtersOpen:false});
  private overviewActive=(tab:State['tab'],status:WorkspaceStatus)=>this.state.tab===tab&&this.state.status===status&&this.state.payment==='all'&&this.state.currency==='all'&&!this.state.query.trim();

  private actionButtons=(doc:LourexDocument):any=>{
    const canOutput=doc.status==='final';
    const canDelete=doc.status!=='final'&&(doc.revision||1)<=1;
    const linkedInvoice=this.linkedInvoiceForQuote(doc);
    const canConvert=Boolean(this.props.onConvert&&doc.kind==='proforma'&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&!linkedInvoice);
    return <>
      <button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.setState({detailId:doc.id}))}><Icon name="eye"/>{t('View details','عرض التفاصيل')}</button>
      <button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.props.onOpen(doc))}><Icon name="edit"/>{doc.lifecycleStatus==='voided'?t('Open archive','فتح الأرشيف'):doc.status==='final'?t('Open / manage','فتح / إدارة'):t('Continue editing','متابعة التحرير')}</button>
      <button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.props.onDuplicate(doc))}><Icon name="copy"/>{t('Duplicate','نسخ')}</button>
      {linkedInvoice?<button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.setState({detailId:linkedInvoice.id}))}><Icon name="invoice"/>{t(`Open linked invoice ${linkedInvoice.number}`,`فتح الفاتورة المرتبطة ${linkedInvoice.number}`)}</button>:canConvert?<button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.convertQuote(doc))}><Icon name="invoice"/>{t('Convert to Invoice','تحويل إلى فاتورة')}</button>:null}
      {canOutput?<><button type="button" role="menuitem" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('pdf',doc)}><Icon name="download"/>{this.state.outputId===doc.id?t('Preparing…','جارٍ التجهيز…'):'PDF'}</button><button type="button" role="menuitem" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('share',doc)}><Icon name="share"/>{t('Share','مشاركة')}</button></>:null}
      {canDelete?<button type="button" role="menuitem" className="danger" onClick={()=>this.runAction(()=>this.props.onDelete(doc))}><Icon name="trash"/>{t('Delete Draft','حذف المسودة')}</button>:null}
    </>;
  };

  private renderMobileActionPortal=():any=>{
    const doc=this.props.documents.find(item=>item.id===this.state.menuId);
    if(!doc||typeof document==='undefined')return null;
    return ReactDOM.createPortal(<div className="mobile-document-action-portal" role="presentation"><button type="button" className="mobile-document-action-backdrop" aria-label={t('Close actions','إغلاق الإجراءات')} onClick={()=>this.setState({menuId:''})}/><div className="action-menu mobile-document-action-sheet" role="menu" aria-label={t('Document actions','إجراءات المستند')} onPointerDown={(event:any)=>event.stopPropagation()}>{this.actionButtons(doc)}</div></div>,document.body);
  };

  private renderDetail=(doc:LourexDocument):any=>{
    const totals=calculateTotals(doc.items,doc.adjustments);
    const collection=this.paymentStatus(doc)?invoicePaymentSummary(doc,this.props.payments,undefined,this.props.documents):null;
    const state=workflowStatus(doc);
    const visualState=doc.lifecycleStatus==='voided'?'voided':state;
    const status=doc.lifecycleStatus==='voided'?(doc.kind==='proforma'?t('Cancelled','ملغى'):t('Voided','ملغى')):state==='draft'?t('Draft','مسودة'):state==='ready'?t('Ready to issue','جاهز للإصدار'):t('Issued','صادر');
    const customer=doc.customerSnapshot;
    const commercial=[
      [t('Incoterm','الإنكوترم'),doc.terms.incoterm],
      [t('Payment terms','شروط الدفع'),doc.terms.paymentTerms],
      [t('Delivery','التسليم'),doc.terms.deliveryTime],
      [t('Packing','التعبئة'),doc.terms.packing],
      [t('Origin','المنشأ'),doc.terms.countryOfOrigin],
      [t('Destination','الوجهة النهائية'),doc.terms.finalDestination],
      [t('Port of loading','ميناء التحميل'),doc.terms.portOfLoading],
      [t('Validity','الصلاحية'),doc.terms.validity]
    ].filter(([,value])=>Boolean(value));
    const canOutput=doc.status==='final';
    const canDelete=doc.status!=='final'&&(doc.revision||1)<=1;
    const linkedInvoice=this.linkedInvoiceForQuote(doc);
    const sourceQuote=doc.convertedFromId?this.props.documents.find(item=>item.id===doc.convertedFromId):undefined;
    const sourceInvoice=doc.creditForId?this.props.documents.find(item=>item.id===doc.creditForId):undefined;
    const creditNotes=doc.kind==='invoice'&&doc.role==='standard'?this.props.documents.filter(item=>item.role==='credit-note'&&item.creditForId===doc.id):[];
    const relatedDocuments=[linkedInvoice,sourceQuote,sourceInvoice,...creditNotes].filter((item,index,array):item is LourexDocument=>Boolean(item&&item.id!==doc.id)&&array.findIndex(candidate=>candidate?.id===item?.id)===index);
    const canConvert=Boolean(this.props.onConvert&&doc.kind==='proforma'&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&!linkedInvoice);

    return <section className="page document-detail-page">
      <div className="document-detail-topbar">
        <button type="button" className="document-detail-back" onClick={()=>this.setState({detailId:'',menuId:''})}><Icon name="arrowLeft"/><span>{t('Documents','المستندات')}</span></button>
        <div className="document-detail-actions">
          <Button icon={doc.lifecycleStatus==='voided'?'file':'edit'} variant="primary" onClick={()=>this.props.onOpen(doc)}>{doc.lifecycleStatus==='voided'?t('Open archive','فتح الأرشيف'):doc.status==='final'?t('Open / manage','فتح / إدارة'):t('Continue editing','متابعة التحرير')}</Button>
          {linkedInvoice?<Button icon="invoice" onClick={()=>this.setState({detailId:linkedInvoice.id,menuId:''})}>{t(`Open ${linkedInvoice.number}`,`فتح ${linkedInvoice.number}`)}</Button>:canConvert?<Button icon="invoice" onClick={()=>this.convertQuote(doc)}>{t('Convert to Invoice','تحويل إلى فاتورة')}</Button>:null}
          {canOutput?<><Button icon="download" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('pdf',doc)}>PDF</Button><Button icon="share" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('share',doc)}>{t('Share','مشاركة')}</Button></>:null}
          <div className="document-detail-more"><IconButton icon="more" label={t('More actions','إجراءات أخرى')} onClick={()=>this.setState({menuId:this.state.menuId===doc.id?'':doc.id})}/>{this.state.menuId===doc.id?<div className="document-action-popover" role="menu">{this.actionButtons(doc)}</div>:null}</div>
        </div>
      </div>

      <header className={`document-detail-hero kind-${doc.kind}`}>
        <div className="document-detail-identity"><span className="document-detail-kind-icon"><Icon name={doc.kind==='proforma'?'proforma':'invoice'}/></span><div><p>{kindLabel(doc)}</p><h1>{doc.number}</h1><span>{customerName(doc)}</span></div></div>
        <div className="document-detail-value"><small>{t('Total','الإجمالي')}</small><strong>{formatMoney(totals.grandTotal,doc.currency)}</strong><div><span className={`document-status-pill status-${visualState}`}>{status}</span>{collection?<span className={`collection-pill collection-${collection.status}`}>{paymentLabel(collection.status)}</span>:null}</div></div>
      </header>

      <div className="document-detail-grid">
        <div className="document-detail-main">
          <section className="document-detail-card">
            <header><h2>{t('Document overview','بيانات المستند')}</h2></header>
            <div className="document-detail-facts">
              <div><small>{t('Issue date','تاريخ الإصدار')}</small><strong>{displayDate(doc.issueDate,getUiLanguage())}</strong></div>
              <div><small>{doc.kind==='invoice'?t('Due date','تاريخ الاستحقاق'):t('Valid until','صالح حتى')}</small><strong>{doc.dueDate?displayDate(doc.dueDate,getUiLanguage()):'—'}</strong></div>
              <div><small>{t('Currency','العملة')}</small><strong>{doc.currency}</strong></div>
              <div><small>{t('Language','اللغة')}</small><strong>{doc.language==='bilingual'?t('Bilingual','ثنائي اللغة'):doc.language==='ar'?t('Arabic','العربية'):t('English','الإنجليزية')}</strong></div>
            </div>
          </section>

          <section className="document-detail-card document-detail-items">
            <header><div><h2>{t('Items','الأصناف')}</h2><small>{itemCountLabel(doc.items.length)}</small></div></header>
            <div className="document-detail-item-head"><span>{t('Description','الوصف')}</span><span>{t('Qty','الكمية')}</span><span>{t('Unit','الوحدة')}</span><span>{t('Price','السعر')}</span><span>{t('Total','الإجمالي')}</span></div>
            <div className="document-detail-item-list">{doc.items.map(item=>{
              const tradeMeta=[item.hsCode?`HS ${item.hsCode}`:'',item.origin?`${t('Origin','المنشأ')}: ${item.origin}`:'',item.packing?`${t('Packing','التعبئة')}: ${item.packing}`:''].filter(Boolean).join(' · ');
              return <div key={item.id} className="document-detail-item-row"><span><strong>{isArabic()?(item.descriptionAr||item.descriptionEn):(item.descriptionEn||item.descriptionAr)||t('Item','صنف')}</strong>{tradeMeta?<small>{tradeMeta}</small>:null}</span><span>{item.quantity}</span><span>{item.unit}</span><span>{formatMoney(item.unitPrice,doc.currency)}</span><span>{formatMoney(lineTotal(item.quantity,item.unitPrice),doc.currency)}</span></div>;
            })}</div>
            <div className="document-detail-totals">
              <div><span>{t('Subtotal','المجموع الفرعي')}</span><strong>{formatMoney(totals.subtotal,doc.currency)}</strong></div>
              {doc.adjustments.discountEnabled?<div><span>{t('Discount','الخصم')}</span><strong>- {formatMoney(totals.discount,doc.currency)}</strong></div>:null}
              {doc.adjustments.shippingEnabled?<div><span>{t('Shipping','الشحن')}</span><strong>{formatMoney(totals.shipping,doc.currency)}</strong></div>:null}
              {doc.adjustments.otherChargesEnabled?<div><span>{t('Other charges','رسوم أخرى')}</span><strong>{formatMoney(totals.otherCharges,doc.currency)}</strong></div>:null}
              {doc.adjustments.taxEnabled?<div><span>{t(`Tax ${doc.adjustments.taxPercent}%`,`الضريبة ${doc.adjustments.taxPercent}%`)}</span><strong>{formatMoney(totals.tax,doc.currency)}</strong></div>:null}
              <div className="grand"><span>{t('Grand total','الإجمالي النهائي')}</span><strong>{formatMoney(totals.grandTotal,doc.currency)}</strong></div>
            </div>
          </section>

          {commercial.length?<section className="document-detail-card"><header><h2>{t('Commercial terms','الشروط التجارية')}</h2></header><div className="document-detail-terms">{commercial.map(([label,value])=><div key={String(label)}><small>{label}</small><strong>{value}</strong></div>)}</div></section>:null}
          {doc.notes||doc.terms.remarks?<section className="document-detail-card"><header><h2>{t('Notes','الملاحظات')}</h2></header><div className="document-detail-notes">{doc.notes?<p>{doc.notes}</p>:null}{doc.terms.remarks?<p>{doc.terms.remarks}</p>:null}</div></section>:null}
        </div>

        <aside className="document-detail-side">
          <section className="document-detail-card"><header><h2>{t('Customer','العميل')}</h2></header>{customer?<div className="document-detail-customer"><strong>{customerName(doc)}</strong>{customer.contactPerson?<span>{customer.contactPerson}</span>:null}{customer.phone?<span>{customer.phone}</span>:null}{customer.email?<span>{customer.email}</span>:null}{customer.city||customer.country?<span>{[customer.city,customer.country].filter(Boolean).join(', ')}</span>:null}</div>:<div className="document-detail-muted">{t('No customer attached.','لا يوجد عميل مرتبط.')}</div>}</section>
          {collection?<section className="document-detail-card document-detail-payment"><header><h2>{t('Payment','الدفع')}</h2><span className={`collection-pill collection-${collection.status}`}>{paymentLabel(collection.status)}</span></header><div><span>{t('Invoice total','إجمالي الفاتورة')}</span><strong>{formatMoney(collection.total,doc.currency)}</strong></div>{collection.credits!=='0.00'?<div><span>{t('Credits','الإشعارات الدائنة')}</span><strong>{formatMoney(collection.credits,doc.currency)}</strong></div>:null}<div><span>{t('Paid','المدفوع')}</span><strong>{formatMoney(collection.paid,doc.currency)}</strong></div><div className="remaining"><span>{t('Remaining','المتبقي')}</span><strong>{formatMoney(collection.remaining,doc.currency)}</strong></div></section>:null}
          {relatedDocuments.length?<section className="document-detail-card document-detail-secondary-actions"><header><h2>{t('Related documents','المستندات المرتبطة')}</h2></header>{relatedDocuments.map(related=><button type="button" key={related.id} onClick={()=>this.setState({detailId:related.id,menuId:''})}><Icon name={related.kind==='invoice'?'invoice':'proforma'}/><span>{kindLabel(related)} · {related.number}</span></button>)}</section>:null}
          <section className="document-detail-card document-detail-secondary-actions"><header><h2>{t('Actions','الإجراءات')}</h2></header><button type="button" onClick={()=>this.props.onDuplicate(doc)}><Icon name="copy"/><span>{t('Duplicate document','نسخ المستند')}</span></button>{canDelete?<button type="button" className="danger" onClick={()=>this.props.onDelete(doc)}><Icon name="trash"/><span>{t('Delete draft','حذف المسودة')}</span></button>:null}</section>
        </aside>
      </div>
      {this.renderMobileActionPortal()}
    </section>;
  };

  render():any{
    const detail=this.props.documents.find(doc=>doc.id===this.state.detailId);
    if(detail)return this.renderDetail(detail);

    const docs=this.filtered();
    const quotes=this.props.documents.filter(doc=>doc.kind==='proforma'&&doc.role==='standard').length;
    const invoices=this.props.documents.filter(doc=>doc.kind==='invoice'&&doc.role==='standard').length;
    const drafts=this.props.documents.filter(doc=>workflowStatus(doc)==='draft').length;
    const issued=this.props.documents.filter(doc=>matchesWorkspaceStatus(doc,'final')).length;
    const resume=[...this.props.documents].filter(doc=>doc.status!=='final').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]??null;
    const currencies=Array.from(new Set(this.props.documents.map(doc=>doc.currency).filter(Boolean))).sort();
    const filteredView=Boolean(this.state.query||this.state.tab!=='all'||this.state.status!=='all'||this.state.payment!=='all'||this.state.currency!=='all');
    const activeFilterCount=(this.state.tab!=='all'?1:0)+(this.state.status!=='all'?1:0)+(this.state.payment!=='all'?1:0)+(this.state.currency!=='all'?1:0)+(this.state.query.trim()?1:0);

    return <section className="page documents-page premium-documents-page documents-workspace-v2">
      <div className="page-heading documents-heading">
        <div><p className="eyebrow">{t('Sales documents','مستندات المبيعات')}</p><h1>{t('Documents','المستندات')}</h1><p className="page-subtitle">{t('Find, review and manage every quotation and invoice from one workspace.','ابحث وراجع وأدر كل عرض سعر وفاتورة من مساحة عمل واحدة.')}</p></div>
        <div className="heading-actions documents-heading-actions"><Button icon="proforma" variant="primary" onClick={()=>this.props.onNew('proforma')}>{t('New Quote','عرض سعر جديد')}</Button><Button icon="invoice" onClick={()=>this.props.onNew('invoice')}>{t('New Invoice','فاتورة جديدة')}</Button></div>
      </div>

      {resume?<button type="button" className={`resume-document-card workflow-${workflowStatus(resume)}`} onClick={()=>this.props.onOpen(resume)}><span className="resume-icon"><Icon name={resume.kind==='proforma'?'proforma':'invoice'}/></span><span className="resume-copy"><small>{t('Continue where you left off','أكمل من حيث توقفت')}</small><strong>{resume.number}</strong><span>{customerName(resume)}</span></span><span className="resume-meta"><b>{formatMoney(calculateTotals(resume.items,resume.adjustments).grandTotal,resume.currency)}</b><em>{workflowStatus(resume)==='ready'?t('Ready to issue','جاهز للإصدار'):t('Continue editing','متابعة التحرير')} →</em></span></button>:null}

      <div className="documents-overview documents-overview-five" aria-label={t('Document overview','ملخص المستندات')}>
        <button type="button" className={this.overviewActive('all','all')?'active':''} onClick={()=>this.setOverview('all','all')}><span>{t('All','الكل')}</span><strong>{this.props.documents.length}</strong></button>
        <button type="button" className={this.overviewActive('proforma','all')?'active':''} onClick={()=>this.setOverview('proforma','all')}><span>{t('Quotes','عروض الأسعار')}</span><strong>{quotes}</strong></button>
        <button type="button" className={this.overviewActive('invoice','all')?'active':''} onClick={()=>this.setOverview('invoice','all')}><span>{t('Invoices','الفواتير')}</span><strong>{invoices}</strong></button>
        <button type="button" className={`${drafts?'has-drafts ':''}${this.overviewActive('all','draft')?'active':''}`} onClick={()=>this.setOverview('all','draft')}><span>{t('Drafts','المسودات')}</span><strong>{drafts}</strong></button>
        <button type="button" className={this.overviewActive('all','final')?'active':''} onClick={()=>this.setOverview('all','final')}><span>{t('Issued','صادرة')}</span><strong>{issued}</strong></button>
      </div>

      <div className={`list-toolbar documents-toolbar premium-documents-toolbar ${this.state.filtersOpen?'filters-open':''}`}>
        <button type="button" className="documents-filter-toggle" aria-expanded={this.state.filtersOpen} onClick={()=>this.setState({filtersOpen:!this.state.filtersOpen,menuId:''})}><Icon name={this.state.filtersOpen?'chevronUp':'chevronDown'}/><span>{t('Filters & sort','التصفية والترتيب')}</span>{activeFilterCount?<b>{activeFilterCount}</b>:null}</button>
        <div className="documents-filter-stack">
          <Segmented value={this.state.tab} onChange={value=>this.setState({tab:value as State['tab'],menuId:''})} options={[{value:'all',label:t('All','الكل')},{value:'proforma',label:t('Quotes','عروض الأسعار')},{value:'invoice',label:t('Invoices','الفواتير')}]}/>
          <div className="documents-advanced-filters">
            <Select aria-label={t('Document status','حالة المستند')} value={this.state.status} onChange={(e:any)=>this.setState({status:e.target.value as WorkspaceStatus,menuId:''})}><option value="all">{t('Any document status','كل حالات المستند')}</option><option value="draft">{t('Draft','مسودة')}</option><option value="ready">{t('Ready to issue','جاهز للإصدار')}</option><option value="final">{t('Issued','صادر')}</option><option value="voided">{t('Cancelled / Voided','ملغى')}</option></Select>
            <Select aria-label={t('Payment status','حالة الدفع')} value={this.state.payment} onChange={(e:any)=>this.setState({payment:e.target.value as PaymentFilter,tab:e.target.value==='all'?this.state.tab:'invoice',menuId:''})}><option value="all">{t('Any payment status','كل حالات الدفع')}</option><option value="unpaid">{t('Unpaid','غير مدفوعة')}</option><option value="partially-paid">{t('Partially Paid','مدفوعة جزئيًا')}</option><option value="paid">{t('Paid','مدفوعة')}</option><option value="overdue">{t('Overdue','متأخرة')}</option></Select>
            <Select aria-label={t('Currency','العملة')} value={this.state.currency} onChange={(e:any)=>this.setState({currency:e.target.value,menuId:''})}><option value="all">{t('All currencies','كل العملات')}</option>{currencies.map(currency=><option key={currency} value={currency}>{currency}</option>)}</Select>
          </div>
        </div>
        <div className="documents-toolbar-right"><div className="search-box documents-search-box"><Icon name="search"/><Input className="documents-search-input" aria-label={t('Search documents','بحث في المستندات')} title={t('Press / to search','اضغط / للبحث')} placeholder={t('Number, customer, item, HS code…','رقم، عميل، صنف، HS Code…')} value={this.state.query} onChange={(e:any)=>this.setState({query:e.target.value,menuId:''})}/>{this.state.query?<IconButton className="documents-search-clear" icon="x" label={t('Clear search','مسح البحث')} onClick={this.clearSearch}/>:<kbd className="documents-search-shortcut" aria-hidden="true">/</kbd>}</div><Select className="documents-sort" aria-label={t('Sort documents','ترتيب المستندات')} value={this.state.sort} onChange={(e:any)=>this.setState({sort:e.target.value as SortMode,menuId:''})}><option value="latest">{t('Latest','الأحدث')}</option><option value="oldest">{t('Oldest','الأقدم')}</option><option value="highest">{t('Highest total (by currency)','أعلى إجمالي حسب العملة')}</option><option value="lowest">{t('Lowest total (by currency)','أقل إجمالي حسب العملة')}</option></Select></div>
      </div>

      {this.props.documents.length?<div className="documents-results-bar" aria-live="polite"><span><strong>{docs.length}</strong> {t('shown','ظاهرة')} <i aria-hidden="true">/</i> {this.props.documents.length} {t('total','إجمالي')}</span><div>{filteredView?<button type="button" className="documents-clear-filters" onClick={this.clearFilters}>{t('Clear filters','مسح التصفية')}</button>:null}</div></div>:null}

      {docs.length?<div className="document-list premium-document-list">{docs.map(doc=>{
        const totals=calculateTotals(doc.items,doc.adjustments);
        const state=workflowStatus(doc);
        const visualState=doc.lifecycleStatus==='voided'?'voided':state;
        const missingCustomer=!hasDocumentCustomer(doc);
        const payment=this.paymentStatus(doc);
        const statusLabel=doc.lifecycleStatus==='voided'?(doc.kind==='proforma'?t('Cancelled','ملغى'):t('Voided','ملغى')):state==='draft'?(doc.revision>1?t(`Revision ${doc.revision}`,`مراجعة ${doc.revision}`):t('Draft','مسودة')):state==='ready'?t('Ready','جاهز'):t('Issued','صادر');
        return <article className={`document-card document-${doc.kind} role-${doc.role} lifecycle-${doc.lifecycleStatus} premium-document-card workflow-${state} ${missingCustomer?'needs-customer':''}`} key={doc.id}>
          <button type="button" className="document-main" onClick={()=>this.setState({detailId:doc.id,menuId:''})}><span className={`document-type-icon type-${doc.kind}`}><Icon name={doc.kind==='proforma'?'proforma':'invoice'}/></span><span className="document-info"><span className="document-info-top"><strong>{doc.number}</strong><span className={`document-kind-pill kind-${doc.kind}`}>{kindLabel(doc)}</span></span><b>{customerName(doc)}</b><small className="document-info-meta"><span>{displayDate(doc.issueDate,getUiLanguage())}</span><i aria-hidden="true">•</i><span>{itemCountLabel(doc.items.length)}</span>{missingCustomer?<><i aria-hidden="true">•</i><em>{t('Customer required','العميل مطلوب')}</em></>:null}</small></span><span className="document-total"><strong>{formatMoney(totals.grandTotal,doc.currency)}</strong><span className={`document-status-pill status-${visualState}`}>{statusLabel}</span>{payment?<span className={`collection-pill collection-${payment}`}>{paymentLabel(payment)}</span>:null}{doc.creditForNumber?<span className="collection-pill lifecycle-link-pill">↳ {doc.creditForNumber}</span>:null}</span></button>
          <div className="document-actions desktop-actions"><IconButton icon="more" label={t('Document actions','إجراءات المستند')} onClick={()=>this.setState({menuId:this.state.menuId===doc.id?'':doc.id})}/>{this.state.menuId===doc.id?<div className="document-action-popover" role="menu">{this.actionButtons(doc)}</div>:null}</div>
          <div className="mobile-actions"><IconButton icon="more" label={t('Actions','الإجراءات')} onClick={()=>this.setState({menuId:this.state.menuId===doc.id?'':doc.id})}/></div>
        </article>;
      })}</div>:<div className="empty-state documents-empty"><span className="empty-mark"><Icon name="file" size={28}/></span><h2>{filteredView?t('No matching documents','لا توجد مستندات مطابقة'):t('No documents yet','لا توجد مستندات بعد')}</h2><p>{filteredView?t('Try another search or filter.','جرّب بحثًا أو تصفية مختلفة.'):t('Start with a quotation, then issue the invoice when the deal is confirmed.','ابدأ بعرض سعر، ثم أصدر الفاتورة عند تأكيد الصفقة.')}</p>{filteredView?<div className="empty-actions"><Button icon="refresh" onClick={this.clearFilters}>{t('Clear filters','مسح التصفية')}</Button></div>:<div className="empty-actions"><Button icon="proforma" variant="primary" onClick={()=>this.props.onNew('proforma')}>{t('Create Quote','إنشاء عرض سعر')}</Button><Button icon="invoice" onClick={()=>this.props.onNew('invoice')}>{t('Create Invoice','إنشاء فاتورة')}</Button></div>}</div>}
      {this.renderMobileActionPortal()}
    </section>;
  }
}