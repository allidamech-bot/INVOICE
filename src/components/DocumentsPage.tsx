import type { DocumentKind, LourexDocument } from '../types.js';
import { calculateTotals, formatMoney } from '../lib/money.js';
import { displayDate } from '../lib/id.js';
import { validateDocument } from '../lib/documents.js';
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
interface State { tab: 'all'|'proforma'|'invoice'; status: WorkspaceStatus; sort:SortMode; query: string; menuId: string; }

function workflowStatus(doc:LourexDocument):Exclude<WorkspaceStatus,'all'>{
  if(doc.status==='final')return 'final';
  return Object.keys(validateDocument(doc)).length===0?'ready':'draft';
}

export class DocumentsPage extends React.Component<Props, State> {
  state: State = { tab: 'all', status: 'all', sort:'latest', query: '', menuId: '' };
  private filtered(): LourexDocument[] {
    const q = this.state.query.trim().toLowerCase();
    const docs=this.props.documents
      .filter(d => this.state.tab === 'all' || d.kind === this.state.tab)
      .filter(d => this.state.status === 'all' || workflowStatus(d) === this.state.status)
      .filter(d => !q || d.number.toLowerCase().includes(q) || (d.customerSnapshot?.companyNameEn ?? '').toLowerCase().includes(q) || (d.customerSnapshot?.companyNameAr ?? '').includes(this.state.query.trim()));
    return docs.sort((a,b)=>{
      if(this.state.sort==='oldest')return a.updatedAt.localeCompare(b.updatedAt);
      if(this.state.sort==='highest'){
        const av=Number(calculateTotals(a.items,a.adjustments).grandTotal)||0;
        const bv=Number(calculateTotals(b.items,b.adjustments).grandTotal)||0;
        return bv-av||b.updatedAt.localeCompare(a.updatedAt);
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }
  private runAction=(action:()=>void)=>{this.setState({menuId:''},action);};
  render(): any {
    const docs = this.filtered();
    const quotes=this.props.documents.filter(d=>d.kind==='proforma').length;
    const invoices=this.props.documents.filter(d=>d.kind==='invoice').length;
    const drafts=this.props.documents.filter(d=>workflowStatus(d)==='draft').length;
    const ready=this.props.documents.filter(d=>workflowStatus(d)==='ready').length;
    return <section className="page documents-page premium-documents-page">
      <div className="page-heading documents-heading"><div><p className="eyebrow">{t('Sales documents','مستندات المبيعات')}</p><h1>{t('Documents','المستندات')}</h1><p className="page-subtitle">{t('Quotes and invoices, organized in one clear workspace.','عروض الأسعار والفواتير في مساحة واحدة واضحة ومنظمة.')}</p></div></div>
      <div className="documents-overview documents-overview-five" aria-label={t('Document overview','ملخص المستندات')}><div><span>{t('Total','الإجمالي')}</span><strong>{this.props.documents.length}</strong></div><div><span>{t('Quotes','عروض الأسعار')}</span><strong>{quotes}</strong></div><div><span>{t('Invoices','الفواتير')}</span><strong>{invoices}</strong></div><div className={ready?'has-ready':''}><span>{t('Ready','جاهز')}</span><strong>{ready}</strong></div><div className={drafts?'has-drafts':''}><span>{t('Drafts','المسودات')}</span><strong>{drafts}</strong></div></div>
      <div className="list-toolbar documents-toolbar premium-documents-toolbar"><div className="documents-filter-stack"><Segmented value={this.state.tab} onChange={(value)=>this.setState({tab:value as State['tab'],menuId:''})} options={[{value:'all',label:t('All','الكل')},{value:'proforma',label:t('Quotes','عروض الأسعار')},{value:'invoice',label:t('Invoices','الفواتير')}]}/><div className="status-filter" role="group" aria-label={t('Status filter','تصفية الحالة')}>{(['all','draft','ready','final'] as const).map(status=><button key={status} type="button" className={this.state.status===status?'active':''} onClick={()=>this.setState({status,menuId:''})}>{status==='all'?t('Any status','كل الحالات'):status==='draft'?t('Draft','مسودة'):status==='ready'?t('Ready','جاهز'):t('Final','نهائي')}</button>)}</div></div><div className="documents-toolbar-right"><div className="search-box"><Icon name="search"/><Input aria-label={t('Search documents','بحث في المستندات')} placeholder={t('Search number or customer','ابحث بالرقم أو العميل')} value={this.state.query} onChange={(e:any)=>this.setState({query:e.target.value,menuId:''})}/></div><Select className="documents-sort" aria-label={t('Sort documents','ترتيب المستندات')} value={this.state.sort} onChange={(e:any)=>this.setState({sort:e.target.value as SortMode,menuId:''})}><option value="latest">{t('Latest','الأحدث')}</option><option value="oldest">{t('Oldest','الأقدم')}</option><option value="highest">{t('Highest total','أعلى إجمالي')}</option></Select></div></div>
      {docs.length ? <div className="document-list premium-document-list">{docs.map(doc => {
        const totals = calculateTotals(doc.items, doc.adjustments);
        const customer = isArabic() ? (doc.customerSnapshot?.companyNameAr || doc.customerSnapshot?.companyNameEn || t('No customer','بدون عميل')) : (doc.customerSnapshot?.companyNameEn || doc.customerSnapshot?.companyNameAr || t('No customer','بدون عميل'));
        const kindLabel = doc.kind === 'proforma' ? t('Proforma Invoice','عرض سعر') : t('Invoice','فاتورة');
        const state=workflowStatus(doc);
        const statusLabel = state==='draft'?t('Draft','مسودة'):state==='ready'?t('Ready','جاهز'):t('Final','نهائي');
        const missingCustomer=!doc.customerSnapshot;
        return <article className={`document-card document-${doc.kind} premium-document-card workflow-${state} ${missingCustomer?'needs-customer':''}`} key={doc.id}>
          <button className="document-main" onClick={()=>this.props.onOpen(doc)}>
            <span className={`document-type-icon type-${doc.kind}`}><Icon name={doc.kind === 'proforma'?'proforma':'invoice'}/></span>
            <span className="document-info"><span className="document-info-top"><strong>{doc.number}</strong><span className={`document-kind-pill kind-${doc.kind}`}>{kindLabel}</span></span><b>{customer}</b><small>{displayDate(doc.issueDate,getUiLanguage())}{missingCustomer?` · ${t('Customer required','العميل مطلوب')}`:''}</small></span>
            <span className="document-total"><strong>{formatMoney(totals.grandTotal,doc.currency)}</strong><span className={`document-status-pill status-${state}`}>{statusLabel}</span></span>
          </button>
          <div className="document-actions desktop-actions"><Button variant="ghost" onClick={()=>this.props.onOpen(doc)}>{t('Open','فتح')}</Button><IconButton icon="copy" label={t('Duplicate','نسخ')} onClick={()=>this.props.onDuplicate(doc)}/><IconButton icon="download" label="PDF" onClick={()=>this.props.onPrint(doc,'pdf')}/><IconButton icon="share" label={t('Share','مشاركة')} onClick={()=>this.props.onPrint(doc,'share')}/><IconButton icon="trash" label={t('Delete','حذف')} variant="danger" onClick={()=>this.props.onDelete(doc)}/></div>
          <div className="mobile-actions"><IconButton icon="more" label={t('Actions','الإجراءات')} onClick={()=>this.setState({menuId:this.state.menuId===doc.id?'':doc.id})}/>{this.state.menuId===doc.id?<div className="action-menu"><button onClick={()=>this.runAction(()=>this.props.onOpen(doc))}><Icon name="edit"/>{t('Open','فتح')}</button><button onClick={()=>this.runAction(()=>this.props.onDuplicate(doc))}><Icon name="copy"/>{t('Duplicate','نسخ')}</button><button onClick={()=>this.runAction(()=>this.props.onPrint(doc,'pdf'))}><Icon name="download"/>PDF</button><button onClick={()=>this.runAction(()=>this.props.onPrint(doc,'share'))}><Icon name="share"/>{t('Share','مشاركة')}</button><button className="danger" onClick={()=>this.runAction(()=>this.props.onDelete(doc))}><Icon name="trash"/>{t('Delete','حذف')}</button></div>:null}</div>
        </article>;
      })}</div> : <div className="empty-state documents-empty"><span className="empty-mark"><Icon name="file" size={28}/></span><h2>{this.state.query || this.state.tab!=='all' || this.state.status!=='all' ? t('No matching documents','لا توجد مستندات مطابقة') : t('No documents yet','لا توجد مستندات بعد')}</h2><p>{this.state.query || this.state.tab!=='all' || this.state.status!=='all' ? t('Try another search or filter.','جرّب بحثًا أو تصفية مختلفة.') : t('Start with a quote, then convert it to an invoice when the deal is confirmed.','ابدأ بعرض سعر، ثم حوّله إلى فاتورة عند تأكيد الصفقة.')}</p>{!this.state.query&&this.state.tab==='all'&&this.state.status==='all'?<div className="empty-actions"><Button icon="proforma" variant="primary" onClick={()=>this.props.onNew('proforma')}>{t('Create Quote','إنشاء عرض سعر')}</Button><Button icon="invoice" onClick={()=>this.props.onNew('invoice')}>{t('Create Invoice','إنشاء فاتورة')}</Button></div>:null}</div>}
    </section>;
  }
}
