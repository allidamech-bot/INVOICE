import type { DocumentKind, LourexDocument, PaymentRecord, PaymentStatus } from '../types.js';
import { calculateTotals, compareMoneyStrings, formatMoney, lineTotal } from '../lib/money.js';
import { displayDate } from '../lib/id.js';
import { hasDocumentCustomer, validateDocument } from '../lib/documents.js';
import { invoicePaymentSummary } from '../lib/payments.js';
import { getUiLanguage, isArabic, t } from '../lib/i18n.js';
import { Button, Icon, IconButton, Input, Select } from './UI.js';
import { letterPlainText } from '../lib/document-extras.js';
import { documentCanConvertToInvoice, documentKindLabel, documentPriceOptional, isSupplierDocumentKind } from '../lib/document-kinds.js';

interface Props {
  documents:LourexDocument[];
  payments:PaymentRecord[];
  onNew:(kind:DocumentKind)=>void;
  onOpen:(doc:LourexDocument)=>void;
  onDuplicate:(doc:LourexDocument)=>void;
  onConvert?:(doc:LourexDocument)=>void;
  onPrint:(doc:LourexDocument,mode:'print'|'pdf'|'share')=>Promise<void>;
  onDelete:(doc:LourexDocument)=>void;
  onRecordPayment?:(doc:LourexDocument)=>void;
  onCreateCreditNote?:(doc:LourexDocument)=>void;
  onOpenStatements?:()=>void;
}

type WorkspaceStatus='all'|'draft'|'ready'|'final'|'voided';
type SortMode='latest'|'oldest'|'highest'|'lowest';
type PaymentFilter='all'|PaymentStatus;
type OverviewTab='all'|DocumentKind|'credit';

interface State {
  tab:OverviewTab;
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
  if(doc.kind==='draft')return 'draft';
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

function attachmentSizeLabel(size:number):string{
  return size<1024*1024?`${Math.max(1,Math.round(size/1024))} KB`:`${(size/(1024*1024)).toFixed(1)} MB`;
}

function customerName(doc:LourexDocument):string{
  const snapshot=doc.customerSnapshot;
  if(!snapshot)return t('No customer','بدون عميل');
  return isArabic()
    ?(snapshot.companyNameAr||snapshot.companyNameEn||t('No customer','بدون عميل'))
    :(snapshot.companyNameEn||snapshot.companyNameAr||t('No customer','بدون عميل'));
}

function kindLabel(doc:LourexDocument):string{
  const label=documentKindLabel(doc.kind,doc.role);
  return t(label.en,label.ar);
}

function partyName(doc:LourexDocument):string{
  if(doc.kind==='draft')return doc.letter?.subject||t('Company document','مستند شركة');
  if(!isSupplierDocumentKind(doc.kind))return customerName(doc);
  const supplier=doc.supplierSnapshot;
  if(!supplier)return t('No supplier','بدون مورد');
  return isArabic()
    ?(supplier.nameAr||supplier.nameEn||t('No supplier','بدون مورد'))
    :(supplier.nameEn||supplier.nameAr||t('No supplier','بدون مورد'));
}

function paymentLabel(status:PaymentStatus):string{
  return status==='paid'?t('Paid','مدفوعة')
    :status==='partially-paid'?t('Partially Paid','مدفوعة جزئيًا')
    :status==='overdue'?t('Overdue','متأخرة')
    :t('Unpaid','غير مدفوعة');
}

function documentSearchText(doc:LourexDocument):string{
  const customer=doc.customerSnapshot;
  const supplier=doc.supplierSnapshot;
  const itemValues=doc.items.flatMap(item=>[item.descriptionEn,item.descriptionAr,item.hsCode,item.origin,item.packing,item.unit]);
  return [
    doc.number,doc.currency,doc.creditForNumber,doc.supplierReference,
    customer?.companyNameEn,customer?.companyNameAr,customer?.contactPerson,
    customer?.phone,customer?.email,customer?.city,customer?.country,
    supplier?.nameEn,supplier?.nameAr,supplier?.contactPerson,supplier?.phone,supplier?.email,supplier?.city,supplier?.country,
    ...itemValues,
    doc.terms.incoterm,doc.terms.paymentTerms,doc.terms.finalDestination,
    doc.terms.countryOfOrigin,doc.terms.portOfLoading,doc.notes,letterPlainText(doc.letter??undefined)
  ].filter(Boolean).join(' ').toLowerCase();
}

function statusLabel(doc:LourexDocument,state:Exclude<WorkspaceStatus,'all'|'voided'>):string{
  if(doc.lifecycleStatus==='voided')return (doc.kind==='proforma'||doc.kind==='purchase-order')?t('Cancelled','ملغى'):t('Voided','ملغى');
  if(state==='draft')return doc.revision>1?t(`Revision ${doc.revision}`,`مراجعة ${doc.revision}`):t('Draft','مسودة');
  return state==='ready'?t('Ready','جاهز'):t('Issued','صادر');
}

export class DocumentsPage extends React.Component<Props,State>{
  state:State={tab:'all',status:'all',payment:'all',currency:'all',sort:'latest',query:'',menuId:'',filtersOpen:false,outputId:'',detailId:''};
  private quoteConversions=new Set<string>();
  private menuTrigger:HTMLElement|null=null;
  private desktopMenu:HTMLDivElement|null=null;

  componentDidMount():void{
    document.addEventListener('pointerdown',this.handleOutsidePointer);
    document.addEventListener('keydown',this.handleKeyDown);
    window.addEventListener('resize',this.handleViewportChange);
    document.addEventListener('scroll',this.handleScroll,true);
  }

  componentDidUpdate(prevProps:Props,prevState:State):void{
    if(this.state.detailId&&prevState.detailId!==this.state.detailId)document.querySelector<HTMLButtonElement>('.ta-doc-detail-back')?.focus();
    if(this.state.menuId&&prevState.menuId!==this.state.menuId){
      this.positionMenu();
      const selector=window.innerWidth<=900?'.ta-doc-mobile-action-sheet':'.ta-doc-action-popover';
      document.querySelector<HTMLButtonElement>(`${selector} button:not(:disabled)`)?.focus({preventScroll:true});
    }
    if(this.state.detailId&&!this.props.documents.some(doc=>doc.id===this.state.detailId))this.setState({detailId:''});
    if(prevProps.documents!==this.props.documents&&this.state.menuId&&!this.props.documents.some(doc=>doc.id===this.state.menuId))this.setState({menuId:''});
  }

  componentWillUnmount():void{
    document.removeEventListener('pointerdown',this.handleOutsidePointer);
    document.removeEventListener('keydown',this.handleKeyDown);
    window.removeEventListener('resize',this.handleViewportChange);
    document.removeEventListener('scroll',this.handleScroll,true);
  }

  private toggleMenu=(doc:LourexDocument,event:any)=>{
    this.menuTrigger=event.currentTarget;
    this.setState({menuId:this.state.menuId===doc.id?'':doc.id});
  };

  private closeMenu=()=>this.setState({menuId:''},()=>this.menuTrigger?.isConnected&&this.menuTrigger.focus({preventScroll:true}));

  private positionMenu=()=>{
    const menu=this.desktopMenu,trigger=this.menuTrigger;
    if(!menu||!trigger||!this.state.menuId||window.innerWidth<=900)return;
    const anchor=trigger.getBoundingClientRect(),height=menu.getBoundingClientRect().height;
    const left=isArabic()?anchor.left:anchor.right-menu.offsetWidth;
    menu.style.left=`${Math.max(12,Math.min(left,window.innerWidth-menu.offsetWidth-12))}px`;
    menu.style.top=`${Math.max(12,Math.min(anchor.bottom+8,window.innerHeight-height-12))}px`;
  };

  private handleViewportChange=()=>{if(this.state.menuId)this.setState({menuId:''});};

  private handleScroll=(event:Event)=>{
    if(event.target instanceof Element&&event.target.closest('.ta-doc-action-popover,.ta-doc-mobile-action-sheet'))return;
    this.positionMenu();
  };

  private handleOutsidePointer=(event:PointerEvent)=>{
    if(!this.state.menuId)return;
    const target=event.target;
    if(target instanceof Element&&target.closest('.ta-doc-actions,.ta-doc-detail-more,.ta-doc-action-popover,.ta-doc-mobile-action-portal'))return;
    this.setState({menuId:''});
  };

  private handleKeyDown=(event:KeyboardEvent)=>{
    if(document.querySelector('.modal-backdrop'))return;
    if(event.key==='Escape'){
      if(this.state.menuId){event.preventDefault();this.closeMenu();return;}
      if(this.state.detailId){event.preventDefault();this.setState({detailId:''});return;}
    }
    if(this.state.menuId&&['ArrowDown','ArrowUp','Home','End','Tab'].includes(event.key)){
      const selector=window.innerWidth<=900?'.ta-doc-mobile-action-sheet':'.ta-doc-action-popover';
      const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(`${selector} button:not(:disabled)`));
      if(buttons.length){
        event.preventDefault();
        const current=buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowUp'||(event.key==='Tab'&&event.shiftKey)?-1:1)+buttons.length)%buttons.length;
        buttons[next]?.focus();
      }
      return;
    }
    if(this.state.detailId||event.key!=='/'||event.ctrlKey||event.metaKey||event.altKey)return;
    const target=event.target;
    if(target instanceof HTMLElement&&(target.matches('input, textarea, select')||target.isContentEditable))return;
    const input=document.querySelector<HTMLInputElement>('.ta-doc-search-input');
    if(!input)return;
    event.preventDefault();
    input.focus();
  };

  private paymentStatus=(doc:LourexDocument):PaymentStatus|null=>{
    if(doc.kind!=='invoice'||doc.role==='credit-note'||doc.status!=='final'||doc.lifecycleStatus==='voided')return null;
    return invoicePaymentSummary(doc,this.props.payments,undefined,this.props.documents).status;
  };

  private linkedInvoiceForQuote=(doc:LourexDocument):LourexDocument|undefined=>{
    if(!documentCanConvertToInvoice(doc.kind)||doc.role!=='standard')return undefined;
    return this.props.documents.find(item=>item.kind==='invoice'&&item.role==='standard'&&item.convertedFromId===doc.id&&item.lifecycleStatus!=='voided');
  };

  private filtered():LourexDocument[]{
    const q=this.state.query.trim().toLowerCase();
    return this.props.documents.filter(doc=>{
      if(this.state.tab==='credit'&&doc.role!=='credit-note')return false;
      if(this.state.tab!=='all'&&this.state.tab!=='credit'&&(doc.kind!==this.state.tab||doc.role!=='standard'))return false;
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
    try{
      // v318 reliability guard: attachments are supporting files and are not part
      // of A4 output. Strip their base64 payloads before print/share preparation so
      // Safari does not deep-clone multi-megabyte data URLs.
      const outputDocument=doc.attachments?.length?{...doc,attachments:[]}:doc;
      await this.props.onPrint(outputDocument,mode);
    }catch{/* App owns output error reporting. */}
    finally{this.setState({outputId:''});}
  };

  private clearFilters=()=>this.setState({tab:'all',status:'all',payment:'all',currency:'all',query:'',sort:'latest',menuId:'',filtersOpen:false});
  private clearSearch=()=>this.setState({query:'',menuId:''},()=>document.querySelector<HTMLInputElement>('.ta-doc-search-input')?.focus());
  private setOverview=(tab:OverviewTab,status:WorkspaceStatus)=>this.setState({tab,status,payment:'all',currency:'all',query:'',menuId:'',filtersOpen:false});
  private overviewActive=(tab:OverviewTab,status:WorkspaceStatus)=>this.state.tab===tab&&this.state.status===status&&this.state.payment==='all'&&this.state.currency==='all'&&!this.state.query.trim();

  private actionButtons=(doc:LourexDocument):any=>{
    const canOutput=doc.kind==='draft'||doc.status==='final';
    const canDelete=doc.status!=='final'&&(doc.revision||1)<=1;
    const linkedInvoice=this.linkedInvoiceForQuote(doc);
    const canConvert=Boolean(this.props.onConvert&&documentCanConvertToInvoice(doc.kind)&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&!linkedInvoice);
    const standardFinalInvoice=doc.kind==='invoice'&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided';
    const canCollect=Boolean(this.props.onRecordPayment&&standardFinalInvoice&&invoicePaymentSummary(doc,this.props.payments,undefined,this.props.documents).status!=='paid');
    const canCredit=Boolean(this.props.onCreateCreditNote&&standardFinalInvoice);
    return <>
      <button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.setState({detailId:doc.id}))}><Icon name="eye"/><span>{t('View details','عرض التفاصيل')}</span></button>
      <button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.props.onOpen(doc))}><Icon name="edit"/><span>{doc.lifecycleStatus==='voided'?t('Open archive','فتح الأرشيف'):doc.status==='final'?t('Open / manage','فتح / إدارة'):t('Continue editing','متابعة التحرير')}</span></button>
      <button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.props.onDuplicate(doc))}><Icon name="copy"/><span>{t('Duplicate','نسخ')}</span></button>
      {linkedInvoice?<button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.setState({detailId:linkedInvoice.id}))}><Icon name="invoice"/><span>{t(`Open linked invoice ${linkedInvoice.number}`,`فتح الفاتورة المرتبطة ${linkedInvoice.number}`)}</span></button>:canConvert?<button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.convertQuote(doc))}><Icon name="invoice"/><span>{t('Convert to Invoice','تحويل إلى فاتورة')}</span></button>:null}
      {canCollect?<button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.props.onRecordPayment?.(doc))}><Icon name="invoice"/><span>{t('Record Payment','تسجيل دفعة')}</span></button>:null}
      {canCredit?<button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.props.onCreateCreditNote?.(doc))}><Icon name="invoice"/><span>{t('Create Credit Note','إنشاء إشعار دائن')}</span></button>:null}
      {canOutput?<><button type="button" role="menuitem" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('pdf',doc)}><Icon name="download"/><span>{this.state.outputId===doc.id?t('Preparing…','جارٍ التجهيز…'):'PDF'}</span></button><button type="button" role="menuitem" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('share',doc)}><Icon name="share"/><span>{t('Share','مشاركة')}</span></button></>:null}
      {canDelete?<button type="button" role="menuitem" className="is-danger" onClick={()=>this.runAction(()=>this.props.onDelete(doc))}><Icon name="trash"/><span>{t('Delete Draft','حذف المسودة')}</span></button>:null}
    </>;
  };

  private renderActionPortal=():any=>{
    const doc=this.props.documents.find(item=>item.id===this.state.menuId);
    if(!doc||typeof document==='undefined')return null;
    return <>
      {ReactDOM.createPortal(<div className="app-ui ta-doc-desktop-action-portal"><div ref={(node:HTMLDivElement|null)=>{this.desktopMenu=node;}} className="ta-doc-action-popover" role="menu" aria-label={t('Document actions','إجراءات المستند')}>{this.actionButtons(doc)}</div></div>,document.body)}
      {ReactDOM.createPortal(<div className="app-ui ta-doc-mobile-action-portal" role="presentation"><button type="button" className="ta-doc-action-backdrop" aria-label={t('Close actions','إغلاق الإجراءات')} onClick={()=>this.setState({menuId:''})}/><div className="ta-doc-mobile-action-sheet" role="menu" aria-label={t('Document actions','إجراءات المستند')} onPointerDown={(event:any)=>event.stopPropagation()}><span className="ta-doc-sheet-handle" aria-hidden="true"/>{this.actionButtons(doc)}</div></div>,document.body)}
    </>;
  };

  private documentTypeIcon=(doc:LourexDocument):'edit'|'proforma'|'file'|'invoice'=>doc.kind==='draft'?'edit':doc.kind==='proforma'?'proforma':doc.kind==='purchase-order'||doc.kind==='rfq'||doc.kind==='delivery-note'?'file':'invoice';

  private renderDraftDetail=(doc:LourexDocument):any=>{
    const letter=doc.letter;
    const canDelete=doc.status!=='final';
    return <section className="ta-doc-detail-page ta-doc-draft-detail">
      <div className="ta-doc-detail-toolbar">
        <button type="button" className="ta-doc-detail-back" onClick={()=>this.setState({detailId:'',menuId:''})}><Icon name="arrowLeft"/><span>{t('Documents','المستندات')}</span></button>
        <div className="ta-doc-detail-toolbar-actions"><Button icon="edit" variant="primary" onClick={()=>this.props.onOpen(doc)}>{t('Open Studio','فتح الاستديو')}</Button><Button icon="download" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('pdf',doc)}>PDF</Button><Button icon="share" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('share',doc)}>{t('Share','مشاركة')}</Button></div>
      </div>
      <header className="ta-doc-detail-hero">
        <div className="ta-doc-detail-title"><span className="ta-doc-detail-icon"><Icon name="edit"/></span><div><small>{t('Company Draft','مسودة شركة')}</small><h1>{doc.number}</h1><p>{letter?.subject||t('Untitled company document','مستند شركة بدون عنوان')}</p></div></div>
        <div className="ta-doc-detail-total"><small>{t('Date','التاريخ')}</small><strong>{displayDate(doc.issueDate,getUiLanguage())}</strong></div>
      </header>
      <div className="ta-doc-detail-columns ta-doc-draft-columns">
        <main className="ta-doc-detail-main">
          <section className="ta-doc-panel"><header><div><small>{t('Overview','نظرة عامة')}</small><h2>{t('Document details','بيانات المستند')}</h2></div></header><div className="ta-doc-facts"><div><small>{t('Recipient','المستلم')}</small><strong>{letter?.recipient||'—'}</strong></div><div><small>{t('Reference','المرجع')}</small><strong>{letter?.reference||'—'}</strong></div><div><small>{t('Subject','الموضوع')}</small><strong>{letter?.subject||'—'}</strong></div><div><small>{t('Language','اللغة')}</small><strong>{doc.language==='ar'?t('Arabic','العربية'):doc.language==='bilingual'?t('Bilingual','ثنائي اللغة'):t('English','الإنجليزية')}</strong></div></div></section>
          <section className="ta-doc-panel ta-doc-letter-content"><header><div><small>{t('Content','المحتوى')}</small><h2>{t('Draft content','محتوى المسودة')}</h2></div><span className="ta-doc-count-badge">{letter?.blocks.length||0}</span></header><div className="ta-doc-letter-blocks">{letter?.blocks.filter(block=>block.type!=='spacer').map(block=><p key={block.id} dir={block.direction}>{block.text||'—'}</p>)}</div></section>
        </main>
        <aside className="ta-doc-detail-side"><section className="ta-doc-panel ta-doc-action-panel"><header><div><small>{t('Actions','الإجراءات')}</small><h2>{t('Document actions','إجراءات المستند')}</h2></div></header><button type="button" onClick={()=>this.props.onDuplicate(doc)}><Icon name="copy"/><span>{t('Duplicate document','نسخ المستند')}</span></button>{canDelete?<button type="button" className="is-danger" onClick={()=>this.props.onDelete(doc)}><Icon name="trash"/><span>{t('Delete draft','حذف المسودة')}</span></button>:null}</section></aside>
      </div>
      {this.renderActionPortal()}
    </section>;
  };

  private renderDetail=(doc:LourexDocument):any=>{
    if(doc.kind==='draft')return this.renderDraftDetail(doc);

    const totals=calculateTotals(doc.items,doc.adjustments);
    const priceOptional=documentPriceOptional(doc.kind);
    const collection=this.paymentStatus(doc)?invoicePaymentSummary(doc,this.props.payments,undefined,this.props.documents):null;
    const state=workflowStatus(doc);
    const visualState=doc.lifecycleStatus==='voided'?'voided':state;
    const currentStatus=statusLabel(doc,state);
    const customer=doc.customerSnapshot;
    const supplier=doc.supplierSnapshot;
    const attachments=doc.attachments??[];
    const commercial=[
      [t('Incoterm','الإنكوترم'),doc.terms.incoterm],
      [t('Payment terms','شروط الدفع'),doc.terms.paymentTerms],
      [doc.kind==='purchase-order'?t('Delivery / Lead Time','مدة التوريد'):t('Delivery','التسليم'),doc.terms.deliveryTime],
      [t('Packing','التعبئة'),doc.terms.packing],
      [t('Origin','المنشأ'),doc.terms.countryOfOrigin],
      [doc.kind==='purchase-order'?t('Ship To / Delivery Address','عنوان التسليم'):t('Destination','الوجهة النهائية'),doc.terms.finalDestination],
      [t('Port of loading','ميناء التحميل'),doc.terms.portOfLoading],
      ...(doc.kind==='purchase-order'?[]:[[t('Validity','الصلاحية'),doc.terms.validity]])
    ].filter(([,value])=>Boolean(value));
    const canOutput=doc.status==='final';
    const canDelete=doc.status!=='final'&&(doc.revision||1)<=1;
    const linkedInvoice=this.linkedInvoiceForQuote(doc);
    const sourceQuote=doc.convertedFromId?this.props.documents.find(item=>item.id===doc.convertedFromId):undefined;
    const sourceInvoice=doc.creditForId?this.props.documents.find(item=>item.id===doc.creditForId):undefined;
    const creditNotes=doc.kind==='invoice'&&doc.role==='standard'?this.props.documents.filter(item=>item.role==='credit-note'&&item.creditForId===doc.id):[];
    const relatedDocuments=[linkedInvoice,sourceQuote,sourceInvoice,...creditNotes].filter((item,index,array):item is LourexDocument=>Boolean(item&&item.id!==doc.id)&&array.findIndex(candidate=>candidate?.id===item?.id)===index);
    const canConvert=Boolean(this.props.onConvert&&documentCanConvertToInvoice(doc.kind)&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&!linkedInvoice);

    return <section className="ta-doc-detail-page">
      <div className="ta-doc-detail-toolbar">
        <button type="button" className="ta-doc-detail-back" onClick={()=>this.setState({detailId:'',menuId:''})}><Icon name="arrowLeft"/><span>{t('Documents','المستندات')}</span></button>
        <div className="ta-doc-detail-toolbar-actions">
          <Button icon={doc.lifecycleStatus==='voided'?'file':'edit'} variant="primary" onClick={()=>this.props.onOpen(doc)}>{doc.lifecycleStatus==='voided'?t('Open archive','فتح الأرشيف'):doc.status==='final'?t('Open / manage','فتح / إدارة'):t('Continue editing','متابعة التحرير')}</Button>
          {linkedInvoice?<Button icon="invoice" onClick={()=>this.setState({detailId:linkedInvoice.id,menuId:''})}>{t(`Open ${linkedInvoice.number}`,`فتح ${linkedInvoice.number}`)}</Button>:canConvert?<Button icon="invoice" onClick={()=>this.convertQuote(doc)}>{t('Convert to Invoice','تحويل إلى فاتورة')}</Button>:null}
          {canOutput?<><Button icon="download" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('pdf',doc)}>PDF</Button><Button icon="share" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('share',doc)}>{t('Share','مشاركة')}</Button></>:null}
          <div className="ta-doc-detail-more ta-doc-actions"><IconButton icon="more" label={t('More actions','إجراءات أخرى')} aria-haspopup="menu" aria-expanded={this.state.menuId===doc.id} onClick={(event:any)=>this.toggleMenu(doc,event)}/></div>
        </div>
      </div>

      <header className="ta-doc-detail-hero">
        <div className="ta-doc-detail-title"><span className={`ta-doc-detail-icon kind-${doc.kind}`}><Icon name={this.documentTypeIcon(doc)}/></span><div><small>{kindLabel(doc)}</small><h1><bdi>{doc.number}</bdi></h1><p>{partyName(doc)}</p></div></div>
        <div className="ta-doc-detail-total"><small>{priceOptional?t('Non-financial','غير مالي'):doc.kind==='purchase-order'?t('Order Total','إجمالي الطلب'):t('Total','الإجمالي')}</small><strong><bdi>{priceOptional?'—':formatMoney(totals.grandTotal,doc.currency)}</bdi></strong><div><span className={`ta-doc-status status-${visualState}`}>{currentStatus}</span>{collection?<span className={`ta-doc-payment payment-${collection.status}`}>{paymentLabel(collection.status)}</span>:null}</div></div>
      </header>

      <div className="ta-doc-detail-columns">
        <main className="ta-doc-detail-main">
          <section className="ta-doc-panel"><header><div><small>{t('Overview','نظرة عامة')}</small><h2>{t('Document details','بيانات المستند')}</h2></div></header><div className="ta-doc-facts"><div><small>{doc.kind==='purchase-order'?t('Order date','تاريخ الطلب'):t('Issue date','تاريخ الإصدار')}</small><strong>{displayDate(doc.issueDate,getUiLanguage())}</strong></div><div><small>{doc.kind==='invoice'?t('Due date','تاريخ الاستحقاق'):doc.kind==='purchase-order'?t('Requested delivery','التسليم المطلوب'):(doc.kind==='proforma'||doc.kind==='proforma-invoice')?t('Valid until','صالح حتى'):t('Additional date','تاريخ إضافي')}</small><strong>{doc.dueDate?displayDate(doc.dueDate,getUiLanguage()):'—'}</strong></div><div><small>{t('Currency','العملة')}</small><strong>{doc.currency}</strong></div><div><small>{t('Language','اللغة')}</small><strong>{doc.language==='bilingual'?t('Bilingual','ثنائي اللغة'):doc.language==='ar'?t('Arabic','العربية'):t('English','الإنجليزية')}</strong></div></div></section>

          <section className="ta-doc-panel ta-doc-items-panel">
            <header><div><small>{t('Line items','بنود المستند')}</small><h2>{t('Items','الأصناف')}</h2></div><span className="ta-doc-count-badge">{itemCountLabel(doc.items.length)}</span></header>
            <div className="ta-doc-items-head"><span>{t('Description','الوصف')}</span><span>{t('Qty','الكمية')}</span><span>{t('Unit','الوحدة')}</span><span>{doc.kind==='purchase-order'?t('Unit Cost','تكلفة الوحدة'):t('Price','السعر')}</span><span>{t('Total','الإجمالي')}</span></div>
            <div className="ta-doc-items-list">{doc.items.map(item=>{
              const tradeMeta=[item.hsCode?`HS ${item.hsCode}`:'',item.origin?`${t('Origin','المنشأ')}: ${item.origin}`:'',item.packing?`${t('Packing','التعبئة')}: ${item.packing}`:''].filter(Boolean).join(' · ');
              return <div key={item.id} className="ta-doc-item-row"><span className="ta-doc-item-description"><strong>{isArabic()?(item.descriptionAr||item.descriptionEn):(item.descriptionEn||item.descriptionAr)||t('Item','صنف')}</strong>{tradeMeta?<small>{tradeMeta}</small>:null}</span><span data-label={t('Qty','الكمية')}>{item.quantity}</span><span data-label={t('Unit','الوحدة')}>{item.unit}</span><span data-label={doc.kind==='purchase-order'?t('Unit Cost','تكلفة الوحدة'):t('Price','السعر')}>{priceOptional?'—':formatMoney(item.unitPrice,doc.currency)}</span><strong data-label={t('Total','الإجمالي')}>{priceOptional?'—':formatMoney(lineTotal(item.quantity,item.unitPrice),doc.currency)}</strong></div>;
            })}</div>
            {!priceOptional?<div className="ta-doc-totals"><div><span>{t('Subtotal','المجموع الفرعي')}</span><strong>{formatMoney(totals.subtotal,doc.currency)}</strong></div>{doc.adjustments.discountEnabled?<div><span>{t('Discount','الخصم')}</span><strong>- {formatMoney(totals.discount,doc.currency)}</strong></div>:null}{doc.adjustments.shippingEnabled?<div><span>{t('Shipping','الشحن')}</span><strong>{formatMoney(totals.shipping,doc.currency)}</strong></div>:null}{doc.adjustments.otherChargesEnabled?<div><span>{t('Other charges','رسوم أخرى')}</span><strong>{formatMoney(totals.otherCharges,doc.currency)}</strong></div>:null}{doc.adjustments.taxEnabled?<div><span>{t(`Tax ${doc.adjustments.taxPercent}%`,`الضريبة ${doc.adjustments.taxPercent}%`)}</span><strong>{formatMoney(totals.tax,doc.currency)}</strong></div>:null}<div className="is-grand"><span>{t('Grand total','الإجمالي النهائي')}</span><strong>{formatMoney(totals.grandTotal,doc.currency)}</strong></div></div>:null}
          </section>

          {commercial.length?<section className="ta-doc-panel"><header><div><small>{t('Trade','التجارة')}</small><h2>{t('Commercial terms','الشروط التجارية')}</h2></div></header><div className="ta-doc-terms">{commercial.map(([label,value])=><div key={String(label)}><small>{label}</small><strong>{value}</strong></div>)}</div></section>:null}
          {doc.notes||doc.terms.remarks?<section className="ta-doc-panel"><header><div><small>{t('Notes','الملاحظات')}</small><h2>{t('Additional information','معلومات إضافية')}</h2></div></header><div className="ta-doc-notes">{doc.notes?<p>{doc.notes}</p>:null}{doc.terms.remarks?<p>{doc.terms.remarks}</p>:null}</div></section>:null}
          {attachments.length?<section className="ta-doc-panel"><header><div><small>{t('Files','الملفات')}</small><h2>{t('Attachments','المرفقات')}</h2></div><span className="ta-doc-count-badge">{attachments.length}</span></header><div className="ta-doc-attachments">{attachments.map(attachment=><a key={attachment.id} href={attachment.dataUrl} target="_blank" rel="noreferrer"><span className="ta-doc-file-icon"><Icon name="file"/></span><span><strong>{attachment.name}</strong><small>{attachment.mimeType==='application/pdf'?'PDF':t('Image','صورة')} · {attachmentSizeLabel(attachment.size)}</small></span><em>{t('Open','فتح')}</em></a>)}</div></section>:null}
        </main>

        <aside className="ta-doc-detail-side">
          <section className="ta-doc-panel"><header><div><small>{t('Party','الطرف')}</small><h2>{isSupplierDocumentKind(doc.kind)?t('Supplier','المورد'):t('Customer','العميل')}</h2></div></header>{isSupplierDocumentKind(doc.kind)?(supplier?<div className="ta-doc-party"><strong>{partyName(doc)}</strong>{supplier.contactPerson?<span>{supplier.contactPerson}</span>:null}{supplier.phone?<span>{supplier.phone}</span>:null}{supplier.email?<span>{supplier.email}</span>:null}{supplier.city||supplier.country?<span>{[supplier.city,supplier.country].filter(Boolean).join(', ')}</span>:null}{doc.supplierReference?<span>{t('Reference','المرجع')}: {doc.supplierReference}</span>:null}</div>:<div className="ta-doc-muted">{t('No supplier attached.','لا يوجد مورد مرتبط.')}</div>):customer?<div className="ta-doc-party"><strong>{customerName(doc)}</strong>{customer.contactPerson?<span>{customer.contactPerson}</span>:null}{customer.phone?<span>{customer.phone}</span>:null}{customer.email?<span>{customer.email}</span>:null}{customer.city||customer.country?<span>{[customer.city,customer.country].filter(Boolean).join(', ')}</span>:null}</div>:<div className="ta-doc-muted">{t('No customer attached.','لا يوجد عميل مرتبط.')}</div>}</section>

          {collection?<section className="ta-doc-panel ta-doc-payment-panel"><header><div><small>{t('Collections','التحصيل')}</small><h2>{t('Payment','الدفع')}</h2></div><span className={`ta-doc-payment payment-${collection.status}`}>{paymentLabel(collection.status)}</span></header><div className="ta-doc-payment-lines"><div><span>{t('Invoice total','إجمالي الفاتورة')}</span><strong>{formatMoney(collection.total,doc.currency)}</strong></div>{collection.credits!=='0.00'?<div><span>{t('Credits','الإشعارات الدائنة')}</span><strong>{formatMoney(collection.credits,doc.currency)}</strong></div>:null}<div><span>{t('Paid','المدفوع')}</span><strong>{formatMoney(collection.paid,doc.currency)}</strong></div><div className="is-remaining"><span>{t('Remaining','المتبقي')}</span><strong>{formatMoney(collection.remaining,doc.currency)}</strong></div></div></section>:null}

          {relatedDocuments.length?<section className="ta-doc-panel ta-doc-action-panel"><header><div><small>{t('Links','الروابط')}</small><h2>{t('Related documents','المستندات المرتبطة')}</h2></div></header>{relatedDocuments.map(related=><button type="button" key={related.id} onClick={()=>this.setState({detailId:related.id,menuId:''})}><Icon name={related.kind==='invoice'?'invoice':'proforma'}/><span>{kindLabel(related)} · {related.number}</span></button>)}</section>:null}

          <section className="ta-doc-panel ta-doc-action-panel"><header><div><small>{t('Actions','الإجراءات')}</small><h2>{t('More actions','إجراءات إضافية')}</h2></div></header><button type="button" onClick={()=>this.props.onDuplicate(doc)}><Icon name="copy"/><span>{t('Duplicate document','نسخ المستند')}</span></button>{canDelete?<button type="button" className="is-danger" onClick={()=>this.props.onDelete(doc)}><Icon name="trash"/><span>{t('Delete draft','حذف المسودة')}</span></button>:null}</section>
        </aside>
      </div>
      {this.renderActionPortal()}
    </section>;
  };

  private typeCount=(kind:DocumentKind)=>this.props.documents.filter(doc=>doc.kind===kind&&doc.role==='standard').length;

  private typeTab=(tab:OverviewTab,label:string,count:number,index?:number)=>{
    const active=this.overviewActive(tab,'all');
    return <button type="button" className={active?'is-active':''} aria-pressed={active} onClick={()=>this.setOverview(tab,'all')}><span>{index?`${index} · `:''}{label}</span><strong>{count}</strong></button>;
  };

  render():any{
    const detail=this.props.documents.find(doc=>doc.id===this.state.detailId);
    if(detail)return this.renderDetail(detail);

    const docs=this.filtered();
    const drafts=this.props.documents.filter(doc=>workflowStatus(doc)==='draft').length;
    const issued=this.props.documents.filter(doc=>matchesWorkspaceStatus(doc,'final')).length;
    const resume=[...this.props.documents].filter(doc=>doc.status!=='final').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]??null;
    const currencies=Array.from(new Set(this.props.documents.map(doc=>doc.currency).filter(Boolean))).sort();
    const filteredView=Boolean(this.state.query||this.state.tab!=='all'||this.state.status!=='all'||this.state.payment!=='all'||this.state.currency!=='all');
    const activeFilterCount=(this.state.tab!=='all'?1:0)+(this.state.status!=='all'?1:0)+(this.state.payment!=='all'?1:0)+(this.state.currency!=='all'?1:0)+(this.state.query.trim()?1:0);

    return <section className="ta-documents-page">
      <header className="ta-documents-header">
        <div><span className="ta-documents-eyebrow">{t('Business documents','مستندات الأعمال')}</span><h1>{t('Documents','المستندات')}</h1><p>{t('Create, issue and manage the complete LOUREX trade-document workflow.','أنشئ وأصدر وأدر دورة مستندات LOUREX التجارية الكاملة.')}</p></div>
        <div className="ta-documents-header-actions"><Button icon="edit" onClick={()=>this.props.onNew('draft')}>{t('Draft','مسودة')}</Button><Button icon="file" onClick={()=>this.props.onNew('rfq')}>{t('RFQ','طلب عرض سعر')}</Button><Button icon="proforma" variant="primary" onClick={()=>this.props.onNew('proforma')}>{t('Quotation','عرض سعر')}</Button><Button icon="invoice" onClick={()=>this.props.onNew('invoice')}>{t('Invoice','فاتورة')}</Button></div>
      </header>

      <section className="ta-doc-summary-grid" aria-label={t('Document summary','ملخص المستندات')}>
        <button type="button" className={this.overviewActive('all','all')?'is-active':''} onClick={()=>this.setOverview('all','all')}><span className="ta-doc-summary-icon"><Icon name="file"/></span><span><small>{t('All documents','كل المستندات')}</small><strong>{this.props.documents.length}</strong><em>{t('Complete register','السجل الكامل')}</em></span></button>
        <button type="button" className={this.overviewActive('all','draft')?'is-active':''} onClick={()=>this.setOverview('all','draft')}><span className="ta-doc-summary-icon is-warning"><Icon name="edit"/></span><span><small>{t('In progress','قيد التحرير')}</small><strong>{drafts}</strong><em>{t('Draft or needs data','مسودة أو يحتاج بيانات')}</em></span></button>
        <button type="button" className={this.overviewActive('all','final')?'is-active':''} onClick={()=>this.setOverview('all','final')}><span className="ta-doc-summary-icon is-success"><Icon name="invoice"/></span><span><small>{t('Issued','صادرة')}</small><strong>{issued}</strong><em>{t('Final documents','المستندات النهائية')}</em></span></button>
        <button type="button" onClick={()=>this.props.onOpenStatements?.()}><span className="ta-doc-summary-icon"><Icon name="users"/></span><span><small>{t('Statements','كشوف الحساب')}</small><strong>↗</strong><em>{t('Customer accounts','حسابات العملاء')}</em></span></button>
      </section>

      {resume?<button type="button" className="ta-doc-resume" onClick={()=>this.props.onOpen(resume)}><span className="ta-doc-resume-icon"><Icon name={this.documentTypeIcon(resume)}/></span><span className="ta-doc-resume-copy"><small>{t('Continue where you left off','أكمل من حيث توقفت')}</small><strong>{resume.number}</strong><span>{partyName(resume)}</span></span><span className="ta-doc-resume-meta"><b>{resume.kind==='draft'?(resume.letter?.subject||t('Company Draft','مسودة شركة')):documentPriceOptional(resume.kind)?'—':formatMoney(calculateTotals(resume.items,resume.adjustments).grandTotal,resume.currency)}</b><em>{workflowStatus(resume)==='ready'?t('Ready to issue','جاهز للإصدار'):t('Continue editing','متابعة التحرير')}</em></span><span className="ta-doc-resume-arrow" aria-hidden="true">→</span></button>:null}

      <section className="ta-doc-register-card">
        <div className="ta-doc-type-tabs" aria-label={t('Document types','أنواع المستندات')}>
          {this.typeTab('all',t('All','الكل'),this.props.documents.length)}
          {this.typeTab('draft',t('Draft','مسودة'),this.typeCount('draft'),1)}
          {this.typeTab('rfq',t('RFQ','طلب عرض سعر'),this.typeCount('rfq'),2)}
          {this.typeTab('proforma',t('Quotation','عرض سعر'),this.typeCount('proforma'),3)}
          {this.typeTab('proforma-invoice',t('Proforma Invoice','فاتورة مبدئية'),this.typeCount('proforma-invoice'),4)}
          {this.typeTab('purchase-order',t('Purchase Order','طلب شراء'),this.typeCount('purchase-order'),5)}
          {this.typeTab('invoice',t('Commercial Invoice','فاتورة تجارية'),this.typeCount('invoice'),6)}
          {this.typeTab('delivery-note',t('Delivery Note','سند تسليم'),this.typeCount('delivery-note'),7)}
          {this.typeTab('payment-receipt',t('Payment Receipt','إيصال دفع'),this.typeCount('payment-receipt'),8)}
          {this.typeTab('credit',t('Credit Note','إشعار دائن'),this.props.documents.filter(doc=>doc.role==='credit-note').length,9)}
        </div>

        <div className="ta-doc-commandbar">
          <div className="ta-doc-search"><Icon name="search"/><Input className="ta-doc-search-input" aria-label={t('Search documents','بحث في المستندات')} title={t('Press / to search','اضغط / للبحث')} placeholder={t('Search number, customer, item, HS code…','ابحث بالرقم أو العميل أو الصنف أو HS Code…')} value={this.state.query} onChange={(e:any)=>this.setState({query:e.target.value,menuId:''})}/>{this.state.query?<IconButton className="ta-doc-search-clear" icon="x" label={t('Clear search','مسح البحث')} onClick={this.clearSearch}/>:<kbd aria-hidden="true">/</kbd>}</div>
          <Select className="ta-doc-sort" aria-label={t('Sort documents','ترتيب المستندات')} value={this.state.sort} onChange={(e:any)=>this.setState({sort:e.target.value as SortMode,menuId:''})}><option value="latest">{t('Latest first','الأحدث أولاً')}</option><option value="oldest">{t('Oldest first','الأقدم أولاً')}</option><option value="highest">{t('Highest total','أعلى إجمالي')}</option><option value="lowest">{t('Lowest total','أقل إجمالي')}</option></Select>
          <button type="button" className={`ta-doc-filter-button ${this.state.filtersOpen?'is-active':''}`} aria-expanded={this.state.filtersOpen} onClick={()=>this.setState({filtersOpen:!this.state.filtersOpen,menuId:''})}><Icon name={this.state.filtersOpen?'chevronUp':'chevronDown'}/><span>{t('Filters','التصفية')}</span>{activeFilterCount?<b>{activeFilterCount}</b>:null}</button>
        </div>

        {this.state.filtersOpen?<div className="ta-doc-filters">
          <label><span>{t('Document status','حالة المستند')}</span><Select aria-label={t('Document status','حالة المستند')} value={this.state.status} onChange={(e:any)=>this.setState({status:e.target.value as WorkspaceStatus,menuId:''})}><option value="all">{t('Any status','كل الحالات')}</option><option value="draft">{t('Draft','مسودة')}</option><option value="ready">{t('Ready to issue','جاهز للإصدار')}</option><option value="final">{t('Issued','صادر')}</option><option value="voided">{t('Cancelled / Voided','ملغى')}</option></Select></label>
          <label><span>{t('Payment status','حالة الدفع')}</span><Select aria-label={t('Payment status','حالة الدفع')} value={this.state.payment} onChange={(e:any)=>this.setState({payment:e.target.value as PaymentFilter,tab:e.target.value==='all'?this.state.tab:'invoice',menuId:''})}><option value="all">{t('Any payment status','كل حالات الدفع')}</option><option value="unpaid">{t('Unpaid','غير مدفوعة')}</option><option value="partially-paid">{t('Partially Paid','مدفوعة جزئيًا')}</option><option value="paid">{t('Paid','مدفوعة')}</option><option value="overdue">{t('Overdue','متأخرة')}</option></Select></label>
          <label><span>{t('Currency','العملة')}</span><Select aria-label={t('Currency','العملة')} value={this.state.currency} onChange={(e:any)=>this.setState({currency:e.target.value,menuId:''})}><option value="all">{t('All currencies','كل العملات')}</option>{currencies.map(currency=><option key={currency} value={currency}>{currency}</option>)}</Select></label>
          <div className="ta-doc-filter-reset"><Button icon="refresh" onClick={this.clearFilters}>{t('Reset filters','إعادة التصفية')}</Button></div>
        </div>:null}

        <div className="ta-doc-register-meta" aria-live="polite"><span><strong>{docs.length}</strong> {t('shown','ظاهرة')} <i>/</i> {this.props.documents.length} {t('total','إجمالي')}</span>{filteredView?<button type="button" onClick={this.clearFilters}>{t('Clear filters','مسح التصفية')}</button>:null}</div>

        {docs.length?<div className="ta-doc-table" role="table">
          <div className="ta-doc-table-head" role="row"><span>{t('Document','المستند')}</span><span>{t('Party','الطرف')}</span><span>{t('Date','التاريخ')}</span><span>{t('Amount','المبلغ')}</span><span>{t('Status','الحالة')}</span><span aria-label={t('Actions','الإجراءات')}/></div>
          {docs.map(doc=>{
            const totals=calculateTotals(doc.items,doc.adjustments);
            const state=workflowStatus(doc);
            const visualState=doc.lifecycleStatus==='voided'?'voided':state;
            const missingParty=doc.kind==='draft'?false:isSupplierDocumentKind(doc.kind)?!doc.supplierSnapshot:!hasDocumentCustomer(doc);
            const payment=this.paymentStatus(doc);
            return <article className="ta-doc-row" role="row" key={doc.id}>
              <button type="button" className="ta-doc-row-open" onClick={()=>this.setState({detailId:doc.id,menuId:''})}>
                <span className="ta-doc-row-identity"><span className={`ta-doc-row-icon kind-${doc.kind}`}><Icon name={this.documentTypeIcon(doc)}/></span><span><strong><bdi>{doc.number}</bdi></strong><small>{kindLabel(doc)}</small></span></span>
                <span className="ta-doc-row-party"><strong>{partyName(doc)}</strong><small>{doc.kind==='draft'?t(`${doc.letter?.blocks.length??0} content blocks`,`${doc.letter?.blocks.length??0} فقرات محتوى`):itemCountLabel(doc.items.length)}{missingParty?` · ${isSupplierDocumentKind(doc.kind)?t('Supplier required','المورد مطلوب'):t('Customer required','العميل مطلوب')}`:''}</small></span>
                <span className="ta-doc-row-date">{displayDate(doc.issueDate,getUiLanguage())}</span>
                <strong className="ta-doc-row-amount"><bdi>{doc.kind==='draft'||documentPriceOptional(doc.kind)?'—':formatMoney(totals.grandTotal,doc.currency)}</bdi></strong>
                <span className="ta-doc-row-status"><span className={`ta-doc-status status-${visualState}`}>{statusLabel(doc,state)}</span>{payment?<span className={`ta-doc-payment payment-${payment}`}>{paymentLabel(payment)}</span>:null}{doc.creditForNumber?<span className="ta-doc-link-badge">↳ {doc.creditForNumber}</span>:null}</span>
              </button>
              <div className="ta-doc-actions"><IconButton icon="more" label={t('Document actions','إجراءات المستند')} aria-haspopup="menu" aria-expanded={this.state.menuId===doc.id} onClick={(event:any)=>this.toggleMenu(doc,event)}/></div>
            </article>;
          })}
        </div>:<div className="ta-doc-empty"><span className="ta-doc-empty-icon"><Icon name="file" size={28}/></span><h2>{filteredView?t('No matching documents','لا توجد مستندات مطابقة'):t('No documents yet','لا توجد مستندات بعد')}</h2><p>{filteredView?t('Try another search or filter.','جرّب بحثًا أو تصفية مختلفة.'):t('Choose the business document you need and LOUREX will keep it in the same workspace.','اختر مستند الأعمال الذي تحتاجه وسيحتفظ به LOUREX في نفس مساحة العمل.')}</p>{filteredView?<Button icon="refresh" onClick={this.clearFilters}>{t('Clear filters','مسح التصفية')}</Button>:<div><Button icon="proforma" variant="primary" onClick={()=>this.props.onNew('proforma')}>{t('Create Quote','إنشاء عرض سعر')}</Button><Button icon="invoice" onClick={()=>this.props.onNew('invoice')}>{t('Create Invoice','إنشاء فاتورة')}</Button><Button icon="file" onClick={()=>this.props.onNew('purchase-order')}>{t('Create Purchase Order','إنشاء طلب شراء')}</Button></div>}</div>}
      </section>

      {this.renderActionPortal()}
    </section>;
  }
}
