import type { LourexDocument, Supplier } from '../types.js';
import { supplierSnapshotFrom } from '../lib/operations.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, Field, Icon, Input } from './UI.js';

interface Props { document:LourexDocument; suppliers:Supplier[]; error?:string; onChange:(document:LourexDocument)=>void; }
interface State { query:string; open:boolean; }
function supplierName(supplier:{nameEn:string;nameAr:string}):string{return isArabic()?(supplier.nameAr||supplier.nameEn):(supplier.nameEn||supplier.nameAr);}

export class PurchaseOrderPartySection extends React.Component<Props,State>{
  state:State={query:this.props.document.supplierSnapshot?supplierName(this.props.document.supplierSnapshot):'',open:!this.props.document.supplierSnapshot};
  componentDidUpdate(prev:Props):void{if(prev.document.id!==this.props.document.id)this.setState({query:this.props.document.supplierSnapshot?supplierName(this.props.document.supplierSnapshot):'',open:!this.props.document.supplierSnapshot});}
  private select=(supplier:Supplier)=>{
    this.props.onChange({...this.props.document,supplierSnapshot:supplierSnapshotFrom(supplier),supplierReference:this.props.document.supplierReference||'',currency:supplier.defaultCurrency||this.props.document.currency,terms:{...this.props.document.terms,paymentTerms:supplier.paymentTerms||this.props.document.terms.paymentTerms}});
    this.setState({query:supplierName(supplier),open:false});
  };
  private reference=(value:string)=>this.props.onChange({...this.props.document,supplierReference:value});
  render():any{
    const d=this.props.document,q=this.state.query.trim().toLowerCase(),selected=d.supplierSnapshot;
    const visible=this.props.suppliers.filter(s=>!q||[s.nameEn,s.nameAr,s.contactPerson,s.city,s.country,s.email,s.phone].join(' ').toLowerCase().includes(q)).slice(0,8);
    return <section className={'editor-section customer-section purchase-order-party-section '+(this.props.error?'section-has-error':'')}>
      <div className="section-heading"><span>02</span><h2>{t('Supplier','المورد')}</h2></div>
      {selected?<div className="selected-customer premium-selected-customer"><span className="customer-avatar"><Icon name="users" size={19}/></span><div><strong>{supplierName(selected)}</strong><span>{[selected.city,selected.country].filter(Boolean).join(', ')}</span><small>{[selected.phone,selected.email].filter(Boolean).join(' · ')}</small></div><Button variant="ghost" onClick={()=>this.setState({query:'',open:true})}>{t('Change','تغيير')}</Button></div>:null}
      {!selected||this.state.open?<div className="customer-select-wrap"><Field label={t('Saved Supplier','مورد محفوظ')} className="required-field" error={this.props.error}><div className="search-select"><Icon name="search"/><Input value={this.state.query} placeholder={t('Search supplier','ابحث عن مورد')} onFocus={()=>this.setState({open:true})} onChange={(e:any)=>this.setState({query:e.target.value,open:true})}/></div></Field>{this.state.open?<div className="customer-dropdown">{visible.map(s=><button type="button" key={s.id} onClick={()=>this.select(s)}><strong>{supplierName(s)}</strong><span>{[s.city,s.country].filter(Boolean).join(', ')}</span></button>)}{visible.length===0?<div className="customer-search-empty" role="status">{t('No matching suppliers. Add a supplier from Purchasing first.','لا يوجد مورد مطابق. أضف المورد من قسم المشتريات أولًا.')}</div>:null}</div>:null}</div>:null}
      <div className="purchase-order-reference"><Field label={t('Supplier Reference / Quote No.','مرجع المورد / رقم عرضه')} hint={t('Optional supplier quotation, offer or reference number.','رقم عرض أو مرجع المورد اختياري.')}><Input value={d.supplierReference||''} onChange={(e:any)=>this.reference(e.target.value)}/></Field></div>
    </section>;
  }
}
