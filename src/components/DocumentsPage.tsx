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
  documents: LourexDocument[];
  payments: PaymentRecord[];
  onNew: (kind: DocumentKind) => void;
  onOpen: (doc: LourexDocument) => void;
  onDuplicate: (doc: LourexDocument) => void;
  onConvert?: (doc: LourexDocument) => void;
  onPrint: (doc: LourexDocument, mode: 'print'|'pdf'|'share') => Promise<void>;
  onDelete: (doc:LourexDocument) => void;
  onRecordPayment?: (doc:LourexDocument) => void;
  onCreateCreditNote?: (doc:LourexDocument) => void;
  onOpenStatements?: () => void;
}

type WorkspaceStatus='all'|'draft'|'ready'|'final'|'voided';
type SortMode='latest'|'oldest'|'highest'|'lowest';
type PaymentFilter='all'|PaymentStatus;
interface State {
  tab:'all'|DocumentKind|'credit';
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
    ? (snapshot.companyNameAr||snapshot.companyNameEn||t('No customer','بدون عميل'))
    : (snapshot.companyNameEn||snapshot.companyNameAr||t('No customer','بدون عميل'));
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
  return isArabic()?(supplier.nameAr||supplier.nameEn||t('No supplier','بدون مورد')):(supplier.nameEn||supplier.nameAr||t('No supplier','بدون مورد'));
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

export class DocumentsPage extends React.Component<Props,State>{
  state:State={tab:'all',status:'all',payment:'all',currency:'all',sort:'latest',query:'',menuId:'',filtersOpen:false,outputId:'',detailId:''};
  private quoteConversions=new Set<string>();
  private menuTrigger:HTMLElement|null=null;
  private desktopMenu:HTMLDivElement|null=null;
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
    if(event.target instanceof Element&&event.target.closest('.document-action-popover,.mobile-document-action-sheet'))return;
    this.positionMenu();
  };

  componentDidMount():void{
    document.addEventListener('pointerdown',this.handleOutsidePointer);
    document.addEventListener('keydown',this.handleKeyDown);
    window.addEventListener('resize',this.handleViewportChange);
    document.addEventListener('scroll',this.handleScroll,true);
  }
  componentDidUpdate(prevProps:Props,prevState:State):void{
    if(this.state.detailId&&prevState.detailId!==this.state.detailId)document.querySelector<HTMLButtonElement>('.document-detail-back')?.focus();
    if(this.state.menuId&&prevState.menuId!==this.state.menuId){
      this.positionMenu();
      const selector=window.innerWidth<=900?'.mobile-document-action-sheet':'.document-action-popover';
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

  private handleOutsidePointer=(event:PointerEvent)=>{
    if(!this.state.menuId)return;
    const target=event.target;
    if(target instanceof Element&&target.closest('.document-actions,.mobile-actions,.document-detail-more,.document-action-popover,.mobile-document-action-portal'))return;
    this.setState({menuId:''});
  };
  private handleKeyDown=(event:KeyboardEvent)=>{
    if(document.querySelector('.modal-backdrop'))return;
    if(event.key==='Escape'){
      if(this.state.menuId){event.preventDefault();this.closeMenu();return;}
      if(this.state.detailId){this.setState({detailId:''});return;}
    }
    if(this.state.menuId&&['ArrowDown','ArrowUp','Home','End','Tab'].includes(event.key)){
      const selector=window.innerWidth<=900?'.mobile-document-action-sheet':'.document-action-popover';
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
    const input=document.querySelector<HTMLInputElement>('.documents-search-input');
    if(!input)return;
    event.preventDefault();input.focus();
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
      // Supporting attachments are not rendered in the A4 document. Removing
      // their base64 payloads from output preparation prevents App.requestPrint()
      // from deep-cloning multi-megabyte files on iPhone/Safari.
      const outputDocument=doc.attachments?.length?{...doc,attachments:[]}:doc;
      await this.props.onPrint(outputDocument,mode);
    }catch{/* App surfaces actionable output errors. */}
    finally{this.setState({outputId:''});}
  };
  private clearFilters=()=>this.setState({tab:'all',status:'all',payment:'all',currency:'all',query:'',sort:'latest',menuId:'',filtersOpen:false});
  private clearSearch=()=>this.setState({query:'',menuId:''},()=>document.querySelector<HTMLInputElement>('.documents-search-input')?.focus());
  private setOverview=(tab:State['tab'],status:WorkspaceStatus)=>this.setState({tab,status,payment:'all',currency:'all',query:'',menuId:'',filtersOpen:false});
  private overviewActive=(tab:State['tab'],status:WorkspaceStatus)=>this.state.tab===tab&&this.state.status===status&&this.state.payment==='all'&&this.state.currency==='all'&&!this.state.query.trim();

  private actionButtons=(doc:LourexDocument):any=>{
    const canOutput=doc.kind==='draft'||doc.status==='final';
    const canDelete=doc.status!=='final'&&(doc.revision||1)<=1;
    const linkedInvoice=this.linkedInvoiceForQuote(doc);
    const canConvert=Boolean(this.props.onConvert&&documentCanConvertToInvoice(doc.kind)&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&!linkedInvoice);
    const standardFinalInvoice=doc.kind==='invoice'&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided';
    const canCollect=Boolean(this.props.onRecordPayment&&standardFinalInvoice&&invoicePaymentSummary(doc,this.props.payments,undefined,this.props.documents).status!=='paid');
    const canCredit=Boolean(this.props.onCreateCreditNote&&standardFinalInvoice);
    return <>
      <button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.setState({detailId:doc.id}))}><Icon name="eye"/>{t('View details','عرض التفاصيل')}</button>
      <button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.props.onOpen(doc))}><Icon name="edit"/>{doc.lifecycleStatus==='voided'?t('Open archive','فتح الأرشيف'):doc.status==='final'?t('Open / manage','فتح / إدارة'):t('Continue editing','متابعة التحرير')}</button>
      <button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.props.onDuplicate(doc))}><Icon name="copy"/>{t('Duplicate','نسخ')}</button>
      {linkedInvoice?<button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.setState({detailId:linkedInvoice.id}))}><Icon name="invoice"/>{t(`Open linked invoice ${linkedInvoice.number}`,`فتح الفاتورة المرتبطة ${linkedInvoice.number}`)}</button>:canConvert?<button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.convertQuote(doc))}><Icon name="invoice"/>{t('Convert to Invoice','تحويل إلى فاتورة')}</button>:null}
      {canCollect?<button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.props.onRecordPayment?.(doc))}><Icon name="invoice"/>{t('Record Payment','تسجيل دفعة')}</button>:null}
      {canCredit?<button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.props.onCreateCreditNote?.(doc))}><Icon name="invoice"/>{t('Create Credit Note','إنشاء إشعار دائن')}</button>:null}
      {canOutput?<><button type="button" role="menuitem" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('pdf',doc)}><Icon name="download"/>{this.state.outputId===doc.id?t('Preparing…','جارٍ التجهيز…'):'PDF'}</button><button type="button" role="menuitem" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('share',doc)}><Icon name="share"/>{t('Share','مشاركة')}</button></>:null}
      {canDelete?<button type="button" role="menuitem" className="danger" onClick={()=>this.runAction(()=>this.props.onDelete(doc))}><Icon name="trash"/>{t('Delete Draft','حذف المسودة')}</button>:null}
    </>;
  };

  private renderMobileActionPortal=():any=>{
    const doc=this.props.documents.find(item=>item.id===this.state.menuId);
    if(!doc||typeof document==='undefined')return null;
    return <>{ReactDOM.createPortal(<div className="app-ui document-desktop-action-portal"><div ref={(node:HTMLDivElement|null)=>{this.desktopMenu=node;}} className="document-action-popover" role="menu" aria-label={t('Document actions','إجراءات المستند')}>{this.actionButtons(doc)}</div></div>,document.body)}{ReactDOM.createPortal(<div className="mobile-document-action-portal app-ui" role="presentation"><button type="button" className="mobile-document-action-backdrop" aria-label={t('Close actions','إغلاق الإجراءات')} onClick={()=>this.setState({menuId:''})}/><div className="action-menu mobile-document-action-sheet" role="menu" aria-label={t('Document actions','إجراءات المستند')} onPointerDown={(event:any)=>event.stopPropagation()}>{this.actionButtons(doc)}</div></div>,document.body)}</>;
  };

  private renderDetail=(doc:LourexDocument):any=>{
    if(doc.kind==='draft'){const letter=doc.letter;const canDelete=doc.status!=='final';return <section className="page document-detail-page draft-document-detail"><div className="document-detail-topbar"><button type="button" className="document-detail-back" onClick={()=>this.setState({detailId:'',menuId:''})}><Icon name="arrowLeft"/><span>{t('Documents','المستندات')}</span></button><div className="document-detail-actions"><Button icon="edit" variant="primary" onClick={()=>this.props.onOpen(doc)}>{t('Open Studio','فتح الاستديو')}</Button><Button icon="download" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('pdf',doc)}>PDF</Button><Button icon="share" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('share',doc)}>{t('Share','مشاركة')}</Button></div></div><header className="document-detail-hero kind-draft"><div className="document-detail-identity"><span className="document-detail-kind-icon"><Icon name="edit"/></span><div><p>{t('Company Draft','مسودة شركة')}</p><h1>{doc.number}</h1><span>{letter?.subject||t('Untitled company document','مستند شركة بدون عنوان')}</span></div></div><div className="document-detail-value draft-document-date"><small>{t('Date','التاريخ')}</small><strong>{displayDate(doc.issueDate,getUiLanguage())}</strong></div></header><div className="draft-detail-grid"><section className="document-detail-card"><header><h2>{t('Document overview','بيانات المستند')}</h2></header><div className="document-detail-facts"><div><small>{t('Recipient','المستلم')}</small><strong>{letter?.recipient||'—'}</strong></div><div><small>{t('Reference','المرجع')}</small><strong>{letter?.reference||'—'}</strong></div><div><small>{t('Subject','الموضوع')}</small><strong>{letter?.subject||'—'}</strong></div><div><small>{t('Language','اللغة')}</small><strong>{doc.language==='ar'?t('Arabic','العربية'):doc.language==='bilingual'?t('Bilingual','ثنائي اللغة'):t('English','الإنجليزية')}</strong></div></div></section><section className="document-detail-card draft-detail-content"><header><h2>{t('Content','المحتوى')}</h2><small>{letter?.blocks.length||0}</small></header><div>{letter?.blocks.filter(block=>block.type!=='spacer').map(block=><p key={block.id} dir={block.direction}>{block.text||'—'}</p>)}</div></section><section className="document-detail-card document-detail-secondary-actions"><header><h2>{t('Actions','الإجراءات')}</h2></header><button type="button" onClick={()=>this.props.onDuplicate(doc)}><Icon name="copy"/><span>{t('Duplicate document','نسخ المستند')}</span></button>{canDelete?<button type="button" className="danger" onClick={()=>this.props.onDelete(doc)}><Icon name="trash"/><span>{t('Delete draft','حذف المسودة')}</span></button>:null}</section></div>{this.renderMobileActionPortal()}</section>;}
    const totals=calculateTotals(doc.items,doc.adjustments);
    const priceOptional=documentPriceOptional(doc.kind);
    const collection=this.paymentStatus(doc)?invoicePaymentSummary(doc,this.props.payments,undefined,this.props.documents):null;
    const state=workflowStatus(doc);
    const visualState=doc.lifecycleStatus==='voided'?'voided':state;
    const status=doc.lifecycleStatus==='voided'?((doc.kind==='proforma'||doc.kind==='purchase-order')?t('Cancelled','ملغى'):t('Voided','ملغى')):state==='draft'?t('Draft','مسودة'):state==='ready'?t('Ready to issue','جاهز للإصدار'):t('Issued','صادر');
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

    return <section className="page document-detail-page">
      <div className="document-detail-topbar">
        <button type="button" className="document-detail-back" onClick={()=>this.setState({detailId:'',menuId:''})}><Icon name="arrowLeft"/><span>{t('Documents','المستندات')}</span></button>
        <div className="document-detail-actions">
          <Button icon={doc.lifecycleStatus==='voided'?'file':'edit'} variant="primary" onClick={()=>this.props.onOpen(doc)}>{doc.lifecycleStatus==='voided'?t('Open archive','فتح الأرشيف'):doc.status==='final'?t('Open / manage','فتح / إدارة'):t('Continue editing','متابعة التحرير')}</Button>
          {linkedInvoice?<Button icon="invoice" onClick={()=>this.setState({detailId:linkedInvoice.id,menuId:''})}>{t(`Open ${linkedInvoice.number}`,`فتح ${linkedInvoice.number}`)}</Button>:canConvert?<Button icon="invoice" onClick={()=>this.convertQuote(doc)}>{t('Convert to Invoice','تحويل إلى فاتورة')}</Button>:null}
          {canOutput?<><Button icon="download" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('pdf',doc)}>PDF</Button><Button icon="share" disabled={Boolean(this.state.outputId)} onClick={()=>void this.runOutput('share',doc)}>{t('Share','مشاركة')}</Button></>:null}
          <div className="document-detail-more"><IconButton icon="more" label={t('More actions','إجراءات أخرى')} aria-haspopup="menu" aria-expanded={this.state.menuId===doc.id} onClick={(event:any)=>this.toggleMenu(doc,event)}/></div>
        </div>
      </div>

      <header className={`document-detail-hero kind-${doc.kind}`}>
        <div className="document-detail-identity"><span className="document-detail-kind-icon"><Icon name={doc.kind==='proforma'?'proforma':doc.kind==='purchase-order'?'file':'invoice'}/></span><div><p>{kindLabel(doc)}</p><h1>{doc.number}</h1><span>{partyName(doc)}</span></div></div>
        <div className="document-detail-value"><small>{priceOptional?t('Non-financial','غير مالي'):doc.kind==='purchase-order'?t('Order Total','إجمالي الطلب'):t('Total','الإجمالي')}</small><strong>{priceOptional?'—':formatMoney(totals.grandTotal,doc.currency)}</strong><div><span className={`document-status-pill status-${visualState}`}>{status}</span>{collection?<span className={`collection-pill collection-${collection.status}`}>{paymentLabel(collection.status)}</span>:null}</div></div>
      </header>

      <div className="document-detail-grid">
        <div className="document-detail-main">
          <section className="document-detail-card">
            <header><h2>{t('Document overview','بيانات المستند')}</h2></header>
            <div className="document-detail-facts">
              <div><small>{doc.kind==='purchase-order'?t('Order date','تاريخ الطلب'):t('Issue date','تاريخ الإصدار')}</small><strong>{displayDate(doc.issueDate,getUiLanguage())}</strong></div>
              <div><small>{doc.kind==='invoice'?t('Due date','تاريخ الاستحقاق'):doc.kind==='purchase-order'?t('Requested delivery','التسليم المطلوب'):(doc.kind==='proforma'||doc.kind==='proforma-invoice')?t('Valid until','صالح حتى'):t('Additional date','تاريخ إضافي')}</small><strong>{doc.dueDate?displayDate(doc.dueDate,getUiLanguage()):'—'}</strong></div>
              <div><small>{t('Currency','العملة')}</small><strong>{doc.currency}</strong></div>
              <div><small>{t('Language','اللغة')}</small><strong>{doc.language==='bilingual'?t('Bilingual','ثنائي اللغة'):doc.language==='ar'?t('Arabic','العربية'):t('English','الإنجليزية')}</strong></div>
            </div>
          </section>

          <section className="document-detail-card document-detail-items">
            <header><div><h2>{t('Items','الأصناف')}</h2><small>{itemCountLabel(doc.items.length)}</small></div></header>
            <div className="document-detail-item-head"><span>{t('Description','الوصف')}</span><span>{t('Qty','الكمية')}</span><span>{t('Unit','الوحدة')}</span><span>{doc.kind==='purchase-order'?t('Unit Cost','تكلفة الوحدة'):t('Price','السعر')}</span><span>{t('Total','الإجمالي')}</span></div>
            <div className="document-detail-item-list">{doc.items.map(item=>{
              const tradeMeta=[item.hsCode?`HS ${item.hsCode}`:'',item.origin?`${t('Origin','المنشأ')}: ${item.origin}`:'',item.packing?`${t('Packing','التعبئة')}: ${item.packing}`:''].filter(Boolean).join(' · ');
              return <div key={item.id} className="document-detail-item-row"><span><strong>{isArabic()?(item.descriptionAr||item.descriptionEn):(item.descriptionEn||item.descriptionAr)||t('Item','صنف')}</strong>{tradeMeta?<small>{tradeMeta}</small>:null}</span><span data-label={t('Qty: ','الكمية: ')}>{item.quantity}</span><span data-label={t('Unit: ','الوحدة: ')}>{item.unit}</span><span data-label={doc.kind==='purchase-order'?t('Unit Cost: ','تكلفة الوحدة: '):t('Price: ','السعر: ')}>{priceOptional?'—':formatMoney(item.unitPrice,doc.currency)}</span><span data-label={t('Total: ','الإجمالي: ')}>{priceOptional?'—':formatMoney(lineTotal(item.quantity,item.unitPrice),doc.currency)}</span></div>;
            })}</div>
            {!priceOptional?<div className="document-detail-totals">
              <div><span>{t('Subtotal','المجموع الفرعي')}</span><strong>{formatMoney(totals.subtotal,doc.currency)}</strong></div>
              {doc.adjustments.discountEnabled?<div><span>{t('Discount','الخصم')}</span><strong>- {formatMoney(totals.discount,doc.currency)}</strong></div>:null}
              {doc.adjustments.shippingEnabled?<div><span>{t('Shipping','الشحن')}</span><strong>{formatMoney(totals.shipping,doc.currency)}</strong></div>:null}
              {doc.adjustments.otherChargesEnabled?<div><span>{t('Other charges','رسوم أخرى')}</span><strong>{formatMoney(totals.otherCharges,doc.currency)}</strong></div>:null}
              {doc.adjustments.taxEnabled?<div><span>{t(`Tax ${doc.adjustments.taxPercent}%`,`الضريبة ${doc.adjustments.taxPercent}%`)}</span><strong>{formatMoney(totals.tax,doc.currency)}</strong></div>:null}
              <div className="grand"><span>{t('Grand total','الإجمالي النهائي')}</span><strong>{formatMoney(totals.grandTotal,doc.currency)}</strong></div>
            </div>:null}
          </section>

          {commercial.length?<section className="document-detail-card"><header><h2>{t('Commercial terms','الشروط التجارية')}</h2></header><div className="document-detail-terms">{commercial.map(([label,value])=><div key={String(label)}><small>{label}</small><strong>{value}</strong></div>)}</div></section>:null}
          {doc.notes||doc.terms.remarks?<section className="document-detail-card"><header><h2>{t('Notes','الملاحظات')}</h2></header><div className="document-detail-notes">{doc.notes?<p>{doc.notes}</p>:null}{doc.terms.remarks?<p>{doc.terms.remarks}</p>:null}</div></section>:null}
          {attachments.length?<section className="document-detail-card document-detail-attachments"><header><h2>{t('Attachments','المرفقات')}</h2><small>{attachments.length}</small></header><div className="document-detail-attachment-list">{attachments.map(attachment=><a key={attachment.id} href={attachment.dataUrl} target="_blank" rel="noreferrer"><span className="attachment-file-icon"><Icon name="file"/></span><span><strong>{attachment.name}</strong><small>{attachment.mimeType==='application/pdf'?'PDF':t('Image','صورة')} · {attachmentSizeLabel(attachment.size)}</small></span><em>{t('Open','فتح')}</em></a>)}</div></section>:null}
        </div>

        <aside className="document-detail-side">
          <section className="document-detail-card"><header><h2>{isSupplierDocumentKind(doc.kind)?t('Supplier','المورد'):t('Customer','العميل')}</h2></header>{isSupplierDocumentKind(doc.kind)?(supplier?<div className="document-detail-customer"><strong>{partyName(doc)}</strong>{supplier.contactPerson?<span>{supplier.contactPerson}</span>:null}{supplier.phone?<span>{supplier.phone}</span>:null}{supplier.email?<span>{supplier.email}</span>:null}{supplier.city||supplier.country?<span>{[supplier.city,supplier.country].filter(Boolean).join(', ')}</span>:null}{doc.supplierReference?<span>{t('Reference','المرجع')}: {doc.supplierReference}</span>:null}</div>:<div className="document-detail-muted">{t('No supplier attached.','لا يوجد مورد مرتبط.')}</div>):customer?<div className="document-detail-customer"><strong>{customerName(doc)}</strong>{customer.contactPerson?<span>{customer.contactPerson}</span>:null}{customer.phone?<span>{customer.phone}</span>:null}{customer.email?<span>{customer.email}</span>:null}{customer.city||customer.country?<span>{[customer.city,customer.country].filter(Boolean).join(', ')}</span>:null}</div>:<div className="document-detail-muted">{t('No customer attached.','لا يوجد عميل مرتبط.')}</div>}</section>
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
    const typeCount=(kind:DocumentKind)=>this.props.documents.filter(doc=>doc.kind===kind&&doc.role==='standard').length;
    const freeDrafts=typeCount('draft');
    const rfqs=typeCount('rfq');
    const quotes=typeCount('proforma');
    const proformaInvoices=typeCount('proforma-invoice');
    const purchaseOrders=typeCount('purchase-order');
    const invoices=typeCount('invoice');
    const deliveryNotes=typeCount('delivery-note');
    const paymentReceipts=typeCount('payment-receipt');
    const creditNotes=this.props.documents.filter(doc=>doc.role==='credit-note').length;
    const drafts=this.props.documents.filter(doc=>workflowStatus(doc)==='draft').length;
    const issued=this.props.documents.filter(doc=>matchesWorkspaceStatus(doc,'final')).length;
    const resume=[...this.props.documents].filter(doc=>doc.status!=='final').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]??null;
    const currencies=Array.from(new Set(this.props.documents.map(doc=>doc.currency).filter(Boolean))).sort();
    const filteredView=Boolean(this.state.query||this.state.tab!=='all'||this.state.status!=='all'||this.state.payment!=='all'||this.state.currency!=='all');
    const activeFilterCount=(this.state.tab!=='all'?1:0)+(this.state.status!=='all'?1:0)+(this.state.payment!=='all'?1:0)+(this.state.currency!=='all'?1:0)+(this.state.query.trim()?1:0);

    return <section className="page documents-page premium-documents-page documents-workspace-v2">
      <div className="page-heading documents-heading">
        <div><p className="eyebrow">{t('Business documents','مستندات الأعمال')}</p><h1>{t('Documents','المستندات')}</h1><p className="page-subtitle">{t('Create and manage the complete LOUREX trade-document workflow from one workspace.','أنشئ وأدر دورة مستندات LOUREX التجارية الكاملة من مساحة عمل واحدة.')}</p></div>
        <div className="heading-actions documents-heading-actions"><Button icon="edit" className="new-draft-button" onClick={()=>this.props.onNew('draft')}>{t('Draft','مسودة')}</Button><Button icon="file" onClick={()=>this.props.onNew('rfq')}>{t('RFQ','طلب عرض سعر')}</Button><Button icon="proforma" variant="primary" onClick={()=>this.props.onNew('proforma')}>{t('Quotation','عرض سعر')}</Button><Button icon="invoice" onClick={()=>this.props.onNew('invoice')}>{t('Commercial Invoice','فاتورة تجارية')}</Button></div>
      </div>

      {resume?<button type="button" className="documents-resume" onClick={()=>this.props.onOpen(resume)}><span className="resume-icon"><Icon name={resume.kind==='proforma'?'proforma':resume.kind==='purchase-order'?'file':'invoice'}/></span><span className="resume-copy"><small>{t('Continue where you left off','أكمل من حيث توقفت')}</small><strong>{resume.number}</strong><span>{partyName(resume)}</span></span><span className="resume-meta"><b>{resume.kind==='draft'?(resume.letter?.subject||t('Company Draft','مسودة شركة')):documentPriceOptional(resume.kind)?'—':formatMoney(calculateTotals(resume.items,resume.adjustments).grandTotal,resume.currency)}</b><em>{workflowStatus(resume)==='ready'?t('Ready to issue','جاهز للإصدار'):t('Continue editing','متابعة التحرير')} <span className="resume-arrow"><Icon name="arrowLeft"/></span></em></span></button>:null}

      <div className="documents-register-tabs document-type-tabs" aria-label={t('Document types','أنواع المستندات')}>
        <button type="button" className={this.overviewActive('all','all')?'active':''} aria-pressed={this.overviewActive('all','all')} onClick={()=>this.setOverview('all','all')}><span>{t('All','الكل')}</span><strong>{this.props.documents.length}</strong></button>
        <button type="button" className={'draft-tab '+(this.overviewActive('draft','all')?'active':'')} aria-pressed={this.overviewActive('draft','all')} onClick={()=>this.setOverview('draft','all')}><span>1 · {t('Draft','مسودة')}</span><strong>{freeDrafts}</strong></button>
        <button type="button" className={this.overviewActive('rfq','all')?'active':''} aria-pressed={this.overviewActive('rfq','all')} onClick={()=>this.setOverview('rfq','all')}><span>2 · {t('RFQ','طلب عرض سعر')}</span><strong>{rfqs}</strong></button>
        <button type="button" className={this.overviewActive('proforma','all')?'active':''} aria-pressed={this.overviewActive('proforma','all')} onClick={()=>this.setOverview('proforma','all')}><span>3 · {t('Quotation','عرض سعر')}</span><strong>{quotes}</strong></button>
        <button type="button" className={this.overviewActive('proforma-invoice','all')?'active':''} aria-pressed={this.overviewActive('proforma-invoice','all')} onClick={()=>this.setOverview('proforma-invoice','all')}><span>4 · {t('Proforma Invoice','فاتورة مبدئية')}</span><strong>{proformaInvoices}</strong></button>
        <button type="button" className={this.overviewActive('purchase-order','all')?'active':''} aria-pressed={this.overviewActive('purchase-order','all')} onClick={()=>this.setOverview('purchase-order','all')}><span>5 · {t('Purchase Order','طلب شراء')}</span><strong>{purchaseOrders}</strong></button>
        <button type="button" className={this.overviewActive('invoice','all')?'active':''} aria-pressed={this.overviewActive('invoice','all')} onClick={()=>this.setOverview('invoice','all')}><span>6 · {t('Commercial Invoice','فاتورة تجارية')}</span><strong>{invoices}</strong></button>
        <button type="button" className={this.overviewActive('delivery-note','all')?'active':''} aria-pressed={this.overviewActive('delivery-note','all')} onClick={()=>this.setOverview('delivery-note','all')}><span>7 · {t('Delivery Note','سند تسليم')}</span><strong>{deliveryNotes}</strong></button>
        <button type="button" className={this.overviewActive('payment-receipt','all')?'active':''} aria-pressed={this.overviewActive('payment-receipt','all')} onClick={()=>this.setOverview('payment-receipt','all')}><span>8 · {t('Payment Receipt','إيصال دفع')}</span><strong>{paymentReceipts}</strong></button>
        <button type="button" className={this.overviewActive('credit','all')?'active':''} aria-pressed={this.overviewActive('credit','all')} onClick={()=>this.setOverview('credit','all')}><span>9 · {t('Credit Note','إشعار دائن')}</span><strong>{creditNotes}</strong></button>
        <button type="button" onClick={()=>this.props.onOpenStatements?.()}><span>10 · {t('Statement of Account','كشف حساب')}</span><strong aria-hidden="true">↗</strong></button>
        <button type="button" className={`${drafts?'has-drafts ':''}${this.overviewActive('all','draft')?'active':''}`} aria-pressed={this.overviewActive('all','draft')} onClick={()=>this.setOverview('all','draft')}><span>{t('In progress','قيد التحرير')}</span><strong>{drafts}</strong></button>
        <button type="button" className={this.overviewActive('all','final')?'active':''} aria-pressed={this.overviewActive('all','final')} onClick={()=>this.setOverview('all','final')}><span>{t('Issued','صادرة')}</span><strong>{issued}</strong></button>
      </div>

      <div className={`documents-command ${this.state.filtersOpen?'filters-open':''}`}>
        <button type="button" className="documents-filter-toggle" aria-expanded={this.state.filtersOpen} onClick={()=>this.setState({filtersOpen:!this.state.filtersOpen,menuId:''})}><Icon name={this.state.filtersOpen?'chevronUp':'chevronDown'}/><span>{t('Filters & sort','التصفية والترتيب')}</span>{activeFilterCount?<b>{activeFilterCount}</b>:null}</button>
        <div className="documents-command-filters">
          <div className="documents-advanced-filters">
            <label><span>{t('Document status','حالة المستند')}</span><Select aria-label={t('Document status','حالة المستند')} value={this.state.status} onChange={(e:any)=>this.setState({status:e.target.value as WorkspaceStatus,menuId:''})}><option value="all">{t('Any document status','كل حالات المستند')}</option><option value="draft">{t('Draft','مسودة')}</option><option value="ready">{t('Ready to issue','جاهز للإصدار')}</option><option value="final">{t('Issued','صادر')}</option><option value="voided">{t('Cancelled / Voided','ملغى')}</option></Select></label>
            <label><span>{t('Payment status','حالة الدفع')}</span><Select aria-label={t('Payment status','حالة الدفع')} value={this.state.payment} onChange={(e:any)=>this.setState({payment:e.target.value as PaymentFilter,tab:e.target.value==='all'?this.state.tab:'invoice',menuId:''})}><option value="all">{t('Any payment status','كل حالات الدفع')}</option><option value="unpaid">{t('Unpaid','غير مدفوعة')}</option><option value="partially-paid">{t('Partially Paid','مدفوعة جزئيًا')}</option><option value="paid">{t('Paid','مدفوعة')}</option><option value="overdue">{t('Overdue','متأخرة')}</option></Select></label>
            <label><span>{t('Currency','العملة')}</span><Select aria-label={t('Currency','العملة')} value={this.state.currency} onChange={(e:any)=>this.setState({currency:e.target.value,menuId:''})}><option value="all">{t('All currencies','كل العملات')}</option>{currencies.map(currency=><option key={currency} value={currency}>{currency}</option>)}</Select></label>
          </div>
        </div>
        <div className="documents-command-search"><div className="search-box documents-search-box"><Icon name="search"/><Input className="documents-search-input" aria-label={t('Search documents','بحث في المستندات')} title={t('Press / to search','اضغط / للبحث')} placeholder={t('Number, customer, item, HS code…','رقم، عميل، صنف، HS Code…')} value={this.state.query} onChange={(e:any)=>this.setState({query:e.target.value,menuId:''})}/>{this.state.query?<IconButton className="documents-search-clear" icon="x" label={t('Clear search','مسح البحث')} onClick={this.clearSearch}/>:<kbd className="documents-search-shortcut" aria-hidden="true">/</kbd>}</div><Select className="documents-sort" aria-label={t('Sort documents','ترتيب المستندات')} value={this.state.sort} onChange={(e:any)=>this.setState({sort:e.target.value as SortMode,menuId:''})}><option value="latest">{t('Latest','الأحدث')}</option><option value="oldest">{t('Oldest','الأقدم')}</option><option value="highest">{t('Highest total (by currency)','أعلى إجمالي حسب العملة')}</option><option value="lowest">{t('Lowest total (by currency)','أقل إجمالي حسب العملة')}</option></Select></div>
      </div>

      {this.props.documents.length?<div className="documents-results-bar" aria-live="polite"><span><strong>{docs.length}</strong> {t('shown','ظاهرة')} <i aria-hidden="true">/</i> {this.props.documents.length} {t('total','إجمالي')}</span><div>{filteredView?<button type="button" className="documents-clear-filters" onClick={this.clearFilters}>{t('Clear filters','مسح التصفية')}</button>:null}</div></div>:null}

      {docs.length?<div className="documents-register">{docs.map(doc=>{
        const totals=calculateTotals(doc.items,doc.adjustments);
        const state=workflowStatus(doc);
        const visualState=doc.lifecycleStatus==='voided'?'voided':state;
        const missingCustomer=doc.kind==='draft'?false:isSupplierDocumentKind(doc.kind)?!doc.supplierSnapshot:!hasDocumentCustomer(doc);
        const payment=this.paymentStatus(doc);
        const statusLabel=doc.lifecycleStatus==='voided'?((doc.kind==='proforma'||doc.kind==='purchase-order')?t('Cancelled','ملغى'):t('Voided','ملغى')):state==='draft'?(doc.revision>1?t(`Revision ${doc.revision}`,`مراجعة ${doc.revision}`):t('Draft','مسودة')):state==='ready'?t('Ready','جاهز'):t('Issued','صادر');
        return <article className="documents-register-row" key={doc.id}>
          <button type="button" className="document-register-open" onClick={()=>this.setState({detailId:doc.id,menuId:''})}>
            <span className="register-identity"><strong><bdi>{doc.number}</bdi></strong><span className={`document-kind-pill kind-${doc.kind}`}>{kindLabel(doc)}</span></span>
            <span className="register-customer"><b>{partyName(doc)}</b><small>{doc.kind==='draft'?t(`${doc.letter?.blocks.length??0} content blocks`,`${doc.letter?.blocks.length??0} فقرات محتوى`):itemCountLabel(doc.items.length)}{missingCustomer? ` · ${isSupplierDocumentKind(doc.kind)?t('Supplier required','المورد مطلوب'):t('Customer required','العميل مطلوب')}`:''}</small></span>
            <span className="register-date">{displayDate(doc.issueDate,getUiLanguage())}</span>
            <strong className="register-amount"><bdi>{doc.kind==='draft'||documentPriceOptional(doc.kind)?'—':formatMoney(totals.grandTotal,doc.currency)}</bdi></strong>
            <span className="register-status"><span className={`document-status-pill status-${visualState}`}>{statusLabel}</span>{payment?<span className={`collection-pill collection-${payment}`}>{paymentLabel(payment)}</span>:null}{doc.creditForNumber?<span className="collection-pill lifecycle-link-pill">↳ {doc.creditForNumber}</span>:null}</span>
          </button>
          <div className="document-actions desktop-actions"><IconButton icon="more" label={t('Document actions','إجراءات المستند')} aria-haspopup="menu" aria-expanded={this.state.menuId===doc.id} onClick={(event:any)=>this.toggleMenu(doc,event)}/></div>
          <div className="mobile-actions"><IconButton icon="more" label={t('Actions','الإجراءات')} aria-haspopup="menu" aria-expanded={this.state.menuId===doc.id} onClick={(event:any)=>this.toggleMenu(doc,event)}/></div>
        </article>;
      })}</div>:<div className="empty-state documents-empty"><span className="empty-mark"><Icon name="file" size={28}/></span><h2>{filteredView?t('No matching documents','لا توجد مستندات مطابقة'):t('No documents yet','لا توجد مستندات بعد')}</h2><p>{filteredView?t('Try another search or filter.','جرّب بحثًا أو تصفية مختلفة.'):t('Choose the business document you need and LOUREX will keep it in the same workspace.','اختر مستند الأعمال الذي تحتاجه وسيحتفظ به LOUREX في نفس مساحة العمل.')}</p>{filteredView?<div className="empty-actions"><Button icon="refresh" onClick={this.clearFilters}>{t('Clear filters','مسح التصفية')}</Button></div>:<div className="empty-actions"><Button icon="proforma" variant="primary" onClick={()=>this.props.onNew('proforma')}>{t('Create Quote','إنشاء عرض سعر')}</Button><Button icon="invoice" onClick={()=>this.props.onNew('invoice')}>{t('Create Invoice','إنشاء فاتورة')}</Button><Button icon="file" onClick={()=>this.props.onNew('purchase-order')}>{t('Create Purchase Order','إنشاء طلب شراء')}</Button></div>}</div>}
      {this.renderMobileActionPortal()}
    </section>;
  }
}
