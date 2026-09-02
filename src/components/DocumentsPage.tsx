import type { DocumentKind, LourexDocument } from '../types.js';
import { calculateTotals, compareMoneyStrings, formatMoney } from '../lib/money.js';
import { displayDate } from '../lib/id.js';
import { hasDocumentCustomer, validateDocument } from '../lib/documents.js';
import { getUiLanguage, isArabic, t } from '../lib/i18n.js';
import { Button, Icon, IconButton, Input, Segmented, Select } from './UI.js';

interface Props {
  documents: LourexDocument[];
  onNew: (kind: DocumentKind) => void;
  onOpen: (doc: LourexDocument) => void;
  onDuplicate: (doc: LourexDocument) => void;
  onPrint: (doc: LourexDocument, mode: 'print'|'pdf'|'share') => void;
  onDelete: (doc: LourexDocument) => void;
}
type WorkspaceStatus='all'|'draft'|'ready'|'final';
type SortMode='latest'|'oldest'|'highest';
interface State { tab: 'all'|'proforma'|'invoice'; status: WorkspaceStatus; sort:SortMode; query: string; menuId: string; filtersOpen:boolean; }

function workflowStatus(doc:LourexDocument):Exclude<WorkspaceStatus,'all'>{
  if(doc.status==='final')return 'final';
  return Object.keys(validateDocument(doc)).length===0?'ready':'draft';
}
function itemCountLabel(count:number):string{
  if(isArabic())return count===1?'صنف واحد':`${count} أصناف`;
  return `${count} item${count===1?'':'s'}`;
}

export class DocumentsPage extends React.Component<Props, State> {
  state: State = { tab: 'all', status: 'all', sort:'latest', query: '', menuId: '', filtersOpen:false };
  componentDidMount():void{
    document.addEventListener('pointerdown',this.handleOutsidePointer);
    document.addEventListener('keydown',this.handleKeyDown);
  }
  componentWillUnmount():void{
    document.removeEventListener('pointerdown',this.handleOutsidePointer);
    document.removeEventListener('keydown',this.handleKeyDown);
  }
  private handleOutsidePointer=(event:PointerEvent)=>{
    if(!this.state.menuId)return;
    const target=event.target;
    if(target instanceof Element&&target.closest('.mobile-actions,.mobile-document-action-portal'))return;
    this.setState({menuId:''});
  };
  private handleKeyDown=(event:KeyboardEvent)=>{
    if(document.querySelector('.modal-backdrop'))return;
    if(event.key==='Escape'&&this.state.menuId){this.setState({menuId:''});return;}
    if(event.key!=='/'||event.ctrlKey||event.metaKey||event.altKey)return;
    const target=event.target;
    if(target instanceof HTMLElement&&(target.matches('input, textarea, select')||target.isContentEditable))return;
    const input=document.querySelector<HTMLInputElement>('.documents-search-input');
    if(!input)return;
    event.preventDefault();
    input.focus();
  };
  private filtered(): LourexDocument[] {
    const q = this.state.query.trim().toLowerCase();
    const docs=this.props.documents
      .filter(d => this.state.tab === 'all' || d.kind === this.state.tab)
      .filter(d => this.state.status === 'all' || workflowStatus(d) === this.state.status)
      .filter(d => !q || d.number.toLowerCase().includes(q) || (d.customerSnapshot?.companyNameEn ?? '').toLowerCase().includes(q) || (d.customerSnapshot?.companyNameAr ?? '').includes(this.state.query.trim()));
    return docs.sort((a,b)=>{
      if(this.state.sort==='oldest')return a.updatedAt.localeCompare(b.updatedAt);
      if(this.state.sort==='highest'){
        const currencyOrder=a.currency.localeCompare(b.currency,undefined,{sensitivity:'base'});
        if(currencyOrder)return currencyOrder;
        const av=calculateTotals(a.items,a.adjustments).grandTotal;
        const bv=calculateTotals(b.items,b.adjustments).grandTotal;
        const byTotal=compareMoneyStrings(bv,av);
        return byTotal||b.updatedAt.localeCompare(a.updatedAt);
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }
  private runAction=(action:()=>void)=>{this.setState({menuId:''},action);};
  private reserveOutput=(mode:'pdf'|'share')=>{try{(window as any).__LOUREX_PREPARE_PDF__?.(mode);}catch{}};
  private runOutput=(mode:'pdf'|'share',action:()=>void)=>{
    this.reserveOutput(mode);
    this.setState({menuId:''},action);
  };
  private clearFilters=()=>this.setState({tab:'all',status:'all',query:'',sort:'latest',menuId:'',filtersOpen:false});
  private clearSearch=()=>this.setState({query:'',menuId:''},()=>document.querySelector<HTMLInputElement>('.documents-search-input')?.focus());
  private setOverview=(tab:State['tab'],status:WorkspaceStatus)=>this.setState({tab,status,query:'',menuId:'',filtersOpen:false});
  private renderMobileActionPortal=():any=>{
    const doc=this.props.documents.find(item=>item.id===this.state.menuId);
    if(!doc||typeof document==='undefined')return null;
    const canOutput=doc.status==='final';
    return ReactDOM.createPortal(
      <div className="mobile-document-action-portal" role="presentation">
        <button type="button" className="mobile-document-action-backdrop" aria-label={t('Close actions','إغلاق الإجراءات')} onClick={()=>this.setState({menuId:''})}/>
        <div className="action-menu mobile-document-action-sheet" role="menu" aria-label={t('Document actions','إجراءات المستند')} onPointerDown={(event:any)=>event.stopPropagation()}>
          <button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.props.onOpen(doc))}><Icon name={canOutput?'edit':'eye'}/>{canOutput?t('Open','فتح'):t('Review & Issue','مراجعة وإصدار')}</button>
          <button type="button" role="menuitem" onClick={()=>this.runAction(()=>this.props.onDuplicate(doc))}><Icon name="copy"/>{t('Duplicate','نسخ')}</button>
          {canOutput?<><button type="button" role="menuitem" onClick={()=>this.runOutput('pdf',()=>this.props.onPrint(doc,'pdf'))}><Icon name="download"/>PDF</button><button type="button" role="menuitem" onClick={()=>this.runOutput('share',()=>this.props.onPrint(doc,'share'))}><Icon name="share"/>{t('Share','مشاركة')}</button></>:null}
          <button type="button" role="menuitem" className="danger" onClick={()=>this.runAction(()=>this.props.onDelete(doc))}><Icon name="trash"/>{t('Delete','حذف')}</button>
        </div>
      </div>,
      document.body
    );
  };
  render(): any {
    const docs = this.filtered();
    const quotes=this.props.documents.filter(d=>d.kind==='proforma').length;
    const invoices=this.props.documents.filter(d=>d.kind==='invoice').length;
    const drafts=this.props.documents.filter(d=>workflowStatus(d)==='draft').length;
    const ready=this.props.documents.filter(d=>workflowStatus(d)==='ready').length;
    const resume=[...this.props.documents].filter(d=>d.status!=='final').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]??null;
    const filteredView=Boolean(this.state.query||this.state.tab!=='all'||this.state.status!=='all');
    const activeFilterCount=(this.state.tab!=='all'?1:0)+(this.state.status!=='all'?1:0)+(this.state.query.trim()?1:0);
    return <section className="page documents-page premium-documents-page">
      <div className="page-heading documents-heading">
        <div><p className="eyebrow">{t('Sales documents','مستندات المبيعات')}</p><h1>{t('Documents','المستندات')}</h1><p className="page-subtitle">{t('Quotes and invoices, organized in one clear workspace.','عروض الأسعار والفواتير في مساحة واحدة واضحة ومنظمة.')}</p></div>
        <div className="heading-actions documents-heading-actions"><Button icon="proforma" variant="primary" onClick={()=>this.props.onNew('proforma')}>{t('New Quote','عرض سعر جديد')}</Button><Button icon="invoice" onClick={()=>this.props.onNew('invoice')}>{t('New Invoice','فاتورة جديدة')}</Button></div>
      </div>
      {resume?<button type="button" className={`resume-document-card workflow-${workflowStatus(resume)}`} onClick={()=>this.props.onOpen(resume)}>
        <span className="resume-icon"><Icon name={resume.kind==='proforma'?'proforma':'invoice'}/></span>
        <span className="resume-copy"><small>{t('Continue where you left off','أكمل من حيث توقفت')}</small><strong>{resume.number}</strong><span>{(isArabic()?resume.customerSnapshot?.companyNameAr:resume.customerSnapshot?.companyNameEn)||resume.customerSnapshot?.companyNameEn||resume.customerSnapshot?.companyNameAr||t('Customer not selected yet','لم يتم اختيار العميل بعد')}</span></span>
        <span className="resume-meta"><b>{formatMoney(calculateTotals(resume.items,resume.adjustments).grandTotal,resume.currency)}</b><em>{workflowStatus(resume)==='ready'?t('Ready to issue','جاهز للإصدار'):t('Continue editing','متابعة التحرير')} →</em></span>
      </button>:null}
      <div className="documents-overview documents-overview-five" aria-label={t('Document overview','ملخص المستندات')}>
        <button type="button" className={`overview-total ${this.state.tab==='all'&&this.state.status==='all'&&!this.state.query?'active':''}`} aria-pressed={this.state.tab==='all'&&this.state.status==='all'&&!this.state.query} onClick={()=>this.setOverview('all','all')}><span>{t('Total','الإجمالي')}</span><strong>{this.props.documents.length}</strong></button>
        <button type="button" className={this.state.tab==='proforma'&&this.state.status==='all'?'active':''} aria-pressed={this.state.tab==='proforma'&&this.state.status==='all'} onClick={()=>this.setOverview('proforma','all')}><span>{t('Quotes','عروض الأسعار')}</span><strong>{quotes}</strong></button>
        <button type="button" className={this.state.tab==='invoice'&&this.state.status==='all'?'active':''} aria-pressed={this.state.tab==='invoice'&&this.state.status==='all'} onClick={()=>this.setOverview('invoice','all')}><span>{t('Invoices','الفواتير')}</span><strong>{invoices}</strong></button>
        <button type="button" className={`${ready?'has-ready ':''}${this.state.status==='ready'?'active':''}`} aria-pressed={this.state.status==='ready'} onClick={()=>this.setOverview('all','ready')}><span>{t('Ready','جاهز')}</span><strong>{ready}</strong></button>
        <button type="button" className={`${drafts?'has-drafts ':''}${this.state.status==='draft'?'active':''}`} aria-pressed={this.state.status==='draft'} onClick={()=>this.setOverview('all','draft')}><span>{t('Drafts','المسودات')}</span><strong>{drafts}</strong></button>
      </div>
      <div className={`list-toolbar documents-toolbar premium-documents-toolbar ${this.state.filtersOpen?'filters-open':''}`}>
        <button type="button" className="documents-filter-toggle" aria-expanded={this.state.filtersOpen} onClick={()=>this.setState({filtersOpen:!this.state.filtersOpen,menuId:''})}><Icon name={this.state.filtersOpen?'chevronUp':'chevronDown'}/><span>{t('Filters & sort','التصفية والترتيب')}</span>{activeFilterCount?<b>{activeFilterCount}</b>:null}</button>
        <div className="documents-filter-stack"><Segmented value={this.state.tab} onChange={(value)=>this.setState({tab:value as State['tab'],menuId:''})} options={[{value:'all',label:t('All','الكل')},{value:'proforma',label:t('Quotes','عروض الأسعار')},{value:'invoice',label:t('Invoices','الفواتير')}]}/><div className="status-filter" role="group" aria-label={t('Status filter','تصفية الحالة')}>{(['all','draft','ready','final'] as const).map(status=><button key={status} type="button" className={this.state.status===status?'active':''} onClick={()=>this.setState({status,menuId:''})}>{status==='all'?t('Any status','كل الحالات'):status==='draft'?t('Draft','مسودة'):status==='ready'?t('Ready','جاهز'):t('Final','نهائي')}</button>)}</div></div>
        <div className="documents-toolbar-right"><div className="search-box documents-search-box"><Icon name="search"/><Input className="documents-search-input" aria-label={t('Search documents','بحث في المستندات')} title={t('Press / to search','اضغط / للبحث')} placeholder={t('Search number or customer','ابحث بالرقم أو العميل')} value={this.state.query} onChange={(e:any)=>this.setState({query:e.target.value,menuId:''})}/>{this.state.query?<IconButton className="documents-search-clear" icon="x" label={t('Clear search','مسح البحث')} onClick={this.clearSearch}/>:<kbd className="documents-search-shortcut" aria-hidden="true">/</kbd>}</div><Select className="documents-sort" aria-label={t('Sort documents','ترتيب المستندات')} value={this.state.sort} onChange={(e:any)=>this.setState({sort:e.target.value as SortMode,menuId:''})}><option value="latest">{t('Latest','الأحدث')}</option><option value="oldest">{t('Oldest','الأقدم')}</option><option value="highest">{t('Highest total (by currency)','أعلى إجمالي حسب العملة')}</option></Select></div>
      </div>
      {this.props.documents.length?<div className="documents-results-bar" aria-live="polite"><span><strong>{docs.length}</strong> {t('shown','ظاهرة')} <i aria-hidden="true">/</i> {this.props.documents.length} {t('total','إجمالي')}</span><div>{drafts&&this.state.status!=='draft'?<button type="button" className="documents-attention-link" onClick={()=>this.setOverview('all','draft')}>{t('Review drafts','راجع المسودات')} <b>{drafts}</b></button>:null}{filteredView?<button type="button" className="documents-clear-filters" onClick={this.clearFilters}>{t('Clear filters','مسح التصفية')}</button>:null}</div></div>:null}
      {docs.length ? <div className="document-list premium-document-list">{docs.map(doc => {
        const totals = calculateTotals(doc.items, doc.adjustments);
        const customer = isArabic() ? (doc.customerSnapshot?.companyNameAr || doc.customerSnapshot?.companyNameEn || t('No customer','بدون عميل')) : (doc.customerSnapshot?.companyNameEn || doc.customerSnapshot?.companyNameAr || t('No customer','بدون عميل'));
        const kindLabel = doc.kind === 'proforma' ? t('Proforma Invoice','عرض سعر') : t('Invoice','فاتورة');
        const state=workflowStatus(doc);
        const statusLabel = state==='draft'?t('Draft','مسودة'):state==='ready'?t('Ready','جاهز'):t('Final','نهائي');
        const missingCustomer=!hasDocumentCustomer(doc);
        const canOutput=doc.status==='final';
        return <article className={`document-card document-${doc.kind} premium-document-card workflow-${state} ${missingCustomer?'needs-customer':''}`} key={doc.id}>
          <button type="button" className="document-main" onClick={()=>this.props.onOpen(doc)}>
            <span className={`document-type-icon type-${doc.kind}`}><Icon name={doc.kind === 'proforma'?'proforma':'invoice'}/></span>
            <span className="document-info"><span className="document-info-top"><strong>{doc.number}</strong><span className={`document-kind-pill kind-${doc.kind}`}>{kindLabel}</span></span><b>{customer}</b><small className="document-info-meta"><span>{displayDate(doc.issueDate,getUiLanguage())}</span><i aria-hidden="true">•</i><span>{itemCountLabel(doc.items.length)}</span>{missingCustomer?<><i aria-hidden="true">•</i><em>{t('Customer required','العميل مطلوب')}</em></>:null}</small></span>
            <span className="document-total"><strong>{formatMoney(totals.grandTotal,doc.currency)}</strong><span className={`document-status-pill status-${state}`}>{statusLabel}</span></span>
          </button>
          <div className="document-actions desktop-actions"><Button variant="ghost" onClick={()=>this.props.onOpen(doc)}>{canOutput?t('Open','فتح'):t('Review','مراجعة')}</Button><IconButton icon="copy" label={t('Duplicate','نسخ')} onClick={()=>this.props.onDuplicate(doc)}/>{canOutput?<><IconButton icon="download" label="PDF" onClick={()=>{this.reserveOutput('pdf');this.props.onPrint(doc,'pdf');}}/><IconButton icon="share" label={t('Share','مشاركة')} onClick={()=>{this.reserveOutput('share');this.props.onPrint(doc,'share');}}/></>:null}<IconButton icon="trash" label={t('Delete','حذف')} variant="danger" onClick={()=>this.props.onDelete(doc)}/></div>
          <div className="mobile-actions"><IconButton icon="more" label={t('Actions','الإجراءات')} onClick={()=>this.setState({menuId:this.state.menuId===doc.id?'':doc.id})}/></div>
        </article>;
      })}</div> : <div className="empty-state documents-empty"><span className="empty-mark"><Icon name="file" size={28}/></span><h2>{filteredView ? t('No matching documents','لا توجد مستندات مطابقة') : t('No documents yet','لا توجد مستندات بعد')}</h2><p>{filteredView ? t('Try another search or filter.','جرّب بحثًا أو تصفية مختلفة.') : t('Start with a quote, then convert it to an invoice when the deal is confirmed.','ابدأ بعرض سعر، ثم حوّله إلى فاتورة عند تأكيد الصفقة.')}</p>{filteredView?<div className="empty-actions"><Button icon="refresh" onClick={this.clearFilters}>{t('Clear filters','مسح التصفية')}</Button></div>:<div className="empty-actions"><Button icon="proforma" variant="primary" onClick={()=>this.props.onNew('proforma')}>{t('Create Quote','إنشاء عرض سعر')}</Button><Button icon="invoice" onClick={()=>this.props.onNew('invoice')}>{t('Create Invoice','إنشاء فاتورة')}</Button></div>}</div>}
      {this.renderMobileActionPortal()}
    </section>;
  }
}
