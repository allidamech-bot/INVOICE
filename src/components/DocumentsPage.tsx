import type { DocumentKind, LourexDocument } from '../types.js';
import { calculateTotals, formatMoney } from '../lib/money.js';
import { displayDate } from '../lib/id.js';
import { Button, Icon, IconButton, Input, Segmented } from './UI.js';

interface Props {
  documents: LourexDocument[];
  onNew: (kind: DocumentKind) => void;
  onOpen: (doc: LourexDocument) => void;
  onDuplicate: (doc: LourexDocument) => void;
  onPrint: (doc: LourexDocument, mode: 'print'|'pdf'|'share') => void;
  onDelete: (doc: LourexDocument) => void;
}
interface State { tab: 'all'|'proforma'|'invoice'; query: string; menuId: string; }

export class DocumentsPage extends React.Component<Props, State> {
  state: State = { tab: 'all', query: '', menuId: '' };
  private filtered(): LourexDocument[] {
    const q = this.state.query.trim().toLowerCase();
    return this.props.documents
      .filter(d => this.state.tab === 'all' || d.kind === this.state.tab)
      .filter(d => !q || d.number.toLowerCase().includes(q) || (d.customerSnapshot?.companyNameEn ?? '').toLowerCase().includes(q) || (d.customerSnapshot?.companyNameAr ?? '').includes(this.state.query.trim()))
      .sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  render(): any {
    const docs = this.filtered();
    return <section className="page documents-page">
      <div className="page-heading"><div><p className="eyebrow">LOUREX Invoice</p><h1>Documents</h1></div><div className="heading-actions"><Button icon="plus" variant="primary" onClick={()=>this.props.onNew('proforma')}>New Proforma</Button><Button icon="plus" onClick={()=>this.props.onNew('invoice')}>New Invoice</Button></div></div>
      <div className="list-toolbar"><Segmented value={this.state.tab} onChange={(value)=>this.setState({tab:value as State['tab']})} options={[{value:'all',label:'All'},{value:'proforma',label:'Proforma'},{value:'invoice',label:'Invoices'}]}/><div className="search-box"><Icon name="search"/><Input aria-label="Search documents" placeholder="Search number or customer" value={this.state.query} onChange={(e:any)=>this.setState({query:e.target.value})}/></div></div>
      {docs.length ? <div className="document-list">{docs.map(doc => {
        const totals = calculateTotals(doc.items, doc.adjustments); const customer = doc.customerSnapshot?.companyNameEn || doc.customerSnapshot?.companyNameAr || 'No customer';
        return <article className="document-card" key={doc.id}>
          <button className="document-main" onClick={()=>this.props.onOpen(doc)}>
            <span className={`document-type-icon type-${doc.kind}`}><Icon name={doc.kind === 'proforma'?'proforma':'invoice'}/></span>
            <span className="document-info"><strong>{doc.number}</strong><b>{customer}</b><small>{displayDate(doc.issueDate,doc.language)} · {doc.kind === 'proforma' ? 'Proforma' : 'Invoice'}</small></span>
            <span className="document-total"><strong>{formatMoney(totals.grandTotal,doc.currency)}</strong><small>{doc.status === 'draft' ? 'Draft' : 'Final'}</small></span>
          </button>
          <div className="document-actions desktop-actions"><Button variant="ghost" onClick={()=>this.props.onOpen(doc)}>Open</Button><IconButton icon="copy" label="Duplicate" onClick={()=>this.props.onDuplicate(doc)}/><IconButton icon="download" label="PDF" onClick={()=>this.props.onPrint(doc,'pdf')}/><IconButton icon="share" label="Share" onClick={()=>this.props.onPrint(doc,'share')}/><IconButton icon="trash" label="Delete" variant="danger" onClick={()=>this.props.onDelete(doc)}/></div>
          <div className="mobile-actions"><IconButton icon="more" label="Actions" onClick={()=>this.setState({menuId:this.state.menuId===doc.id?'':doc.id})}/>{this.state.menuId===doc.id?<div className="action-menu"><button onClick={()=>this.props.onOpen(doc)}><Icon name="edit"/>Open</button><button onClick={()=>this.props.onDuplicate(doc)}><Icon name="copy"/>Duplicate</button><button onClick={()=>this.props.onPrint(doc,'pdf')}><Icon name="download"/>PDF</button><button onClick={()=>this.props.onPrint(doc,'share')}><Icon name="share"/>Share</button><button className="danger" onClick={()=>this.props.onDelete(doc)}><Icon name="trash"/>Delete</button></div>:null}</div>
        </article>;
      })}</div> : <div className="empty-state"><span className="empty-mark"><Icon name="file" size={28}/></span><h2>No documents yet</h2><p>Create your first Proforma or Invoice.</p><Button icon="plus" variant="primary" onClick={()=>this.props.onNew('proforma')}>New Proforma</Button></div>}
    </section>;
  }
}
