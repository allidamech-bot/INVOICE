import type { DocumentEventRecord, LourexDocument, SavedItem } from '../types.js';
import { matchedSupplierInvoices } from '../lib/supplier-invoice-flow.js';
import { invoicePostingForMatch, type PostMatchedSupplierInvoiceInput } from '../lib/supplier-invoice-posting.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, Select } from './UI.js';

interface Props{
  order:LourexDocument;
  events:DocumentEventRecord[];
  savedItems:SavedItem[];
  onPost:(input:PostMatchedSupplierInvoiceInput)=>Promise<void>;
}
interface State{
  matchEventId:string;
  mappedIds:string[];
  confirmed:boolean;
  working:boolean;
  error:string;
}
const MATCH_MARKER='@lourex:supplier-invoice:matched:v1:';

export class SupplierInvoicePostingReview extends React.Component<Props,State>{
  state:State={matchEventId:'',mappedIds:[],confirmed:false,working:false,error:''};
  private busy=false;
  private selectInvoice=(matchEventId:string,lineCount:number)=>{
    if(this.busy)return;
    this.setState({matchEventId,mappedIds:Array.from({length:lineCount},()=>''),confirmed:false,error:''});
  };
  private submit=async()=>{
    if(this.busy||!this.state.confirmed||!this.state.matchEventId)return;
    this.busy=true;this.setState({working:true,error:''});
    try{
      await this.props.onPost({
        purchaseOrderId:this.props.order.id,matchEventId:this.state.matchEventId,
        expectedPurchaseOrderUpdatedAt:this.props.order.updatedAt,
        savedItemIds:[...this.state.mappedIds],confirmed:this.state.confirmed
      });
      this.setState({matchEventId:'',mappedIds:[],confirmed:false,working:false,error:''});
    }catch(e){
      this.setState({working:false,error:e instanceof Error?e.message:t('Posting failed.','تعذّر الترحيل.')});
    }finally{this.busy=false;}
  };
  render():any{
    const {order,events,savedItems}=this.props;
    if(order.kind!=='purchase-order')return null;
    const sources=events.filter(event=>event.type==='audit'&&event.documentId===order.id
      &&event.note.startsWith(MATCH_MARKER)).flatMap(event=>{
        const invoice=matchedSupplierInvoices(order.id,[event])[0];
        return invoice?[{event,invoice}]:[];
      });
    if(!sources.length)return null;
    const active=sources.find(row=>row.event.id===this.state.matchEventId);
    const eligible=order.status==='final'&&order.lifecycleStatus!=='voided';
    const ready=Boolean(eligible&&active&&!invoicePostingForMatch(active.event.id,events));
    return <section className="ta-doc-panel" aria-label={t('Post matched supplier invoice','ترحيل فاتورة المورد المطابقة')}>
      <header><div><small>{t('Procurement • Batch 7','المشتريات • الدفعة السابعة')}</small>
        <h2>{t('Approve and post supplier invoice','اعتماد وترحيل فاتورة المورد')}</h2></div></header>
      <p>{t('Each reviewed supplier invoice is posted separately, for its exact received and matched quantities. Posting opens its supplier payable and receives linked inventory once. Match every line to an existing stock catalog item first.','تُرحّل كل فاتورة مورد تمت مطابقتها بشكل مستقل وبكمياتها المعتمدة والمستلمة فقط. يفتح الترحيل ذمة المورد ويستلم المخزون المرتبط مرة واحدة. اربط جميع البنود بأصناف مخزنية موجودة أولًا.')}</p>
      <div style={{display:'grid',gap:8,marginBlock:12}}>
        {sources.map(({event,invoice})=>{
          const posted=invoicePostingForMatch(event.id,events);
          return <div key={event.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <div><strong dir="auto">{invoice.invoiceReference}</strong><small style={{display:'block'}}>{invoice.total} {invoice.currency} · {invoice.invoiceDate}</small></div>
            {posted?<span>{t('Posted as','مُرحّلة برقم')} <bdi>{posted.purchaseNumber}</bdi></span>:
              <Button icon="check" disabled={!eligible||this.state.working} variant={active?.event.id===event.id?'primary':'secondary'}
                onClick={()=>this.selectInvoice(event.id,invoice.lines.length)}>
                {t('Review posting','مراجعة الترحيل')}
              </Button>}
          </div>;
        })}
      </div>
      {ready&&active?<div style={{display:'grid',gap:12}}>
        <p>{t('Select an exact inventory catalog item for each line. The unit must match. No product or SKU is guessed automatically.','اختر صنفًا مخزنيًا محددًا لكل بند بشرط تطابق الوحدة؛ لا يجري تخمين الأصناف أو SKU تلقائيًا.')}</p>
        {active.invoice.lines.map((line,index)=>{
          const poItem=order.items.find(item=>item.id===line.purchaseOrderLineId);
          const choices=savedItems.filter(item=>!item.archived&&item.unit.trim().toLowerCase()===line.unit.trim().toLowerCase());
          return <label key={line.purchaseOrderLineId} style={{display:'grid',gap:6}}>
            <strong>{index+1}. {isArabic()?(poItem?.descriptionAr||poItem?.descriptionEn):(poItem?.descriptionEn||poItem?.descriptionAr)} — <bdi>{line.quantity} {line.unit}</bdi> · <bdi>{line.unitPrice} {order.currency}</bdi></strong>
            <Select aria-label={t(`Inventory catalog item for line ${index+1}`,`صنف المخزون للبند ${index+1}`)}
              value={this.state.mappedIds[index]||''}
              onChange={(e:any)=>this.setState(state=>({mappedIds:state.mappedIds.map((id,i)=>i===index?e.target.value:id),confirmed:false,error:''}))}>
              <option value="">{t('Choose existing inventory item','اختر صنفًا مخزنيًا موجودًا')}</option>
              {choices.map(item=><option key={item.id} value={item.id}>{item.sku?item.sku+' · ':''}{isArabic()?(item.descriptionAr||item.descriptionEn):(item.descriptionEn||item.descriptionAr)} ({item.unit})</option>)}
            </Select>
            {!choices.length?<small>{t('No active catalog item uses this unit. Add it from Products before posting.','لا يوجد صنف نشط بهذه الوحدة. أضفه في المنتجات قبل الترحيل.')}</small>:null}
          </label>;
        })}
        <label style={{display:'flex',gap:10,alignItems:'flex-start'}}>
          <input type="checkbox" checked={this.state.confirmed}
            aria-label={t('Confirm irreversible supplier invoice purchase posting','أؤكد ترحيل شراء فاتورة المورد')}
            onChange={(e:any)=>this.setState({confirmed:e.target.checked,error:''})}/>
          <span>{t('I verified the matched invoice, supplier, quantities and all catalog mappings. I authorize one purchase posting, its inventory receipts and one supplier payable.','راجعت الفاتورة المطابقة والمورد والكميات وربط جميع الأصناف، وأصرّح بترحيل شراء واحد واستلام مخزونه وفتح ذمة مورد واحدة.')}</span>
        </label>
        {this.state.error?<p className="field-error" role="alert">{this.state.error}</p>:null}
        <Button variant="primary" icon="check" disabled={!this.state.confirmed||this.state.working
          ||this.state.mappedIds.some(id=>!id)||new Set(this.state.mappedIds).size!==this.state.mappedIds.length}
          onClick={()=>void this.submit()}>
          {this.state.working?t('Posting supplier invoice…','جارٍ ترحيل فاتورة المورد…'):t('Post matched invoice and stock','ترحيل الفاتورة والمخزون')}
        </Button>
      </div>:null}
      {!eligible?<p>{t('The Purchase Order is not eligible for posting.','أمر الشراء غير مؤهل للترحيل.')}</p>:null}
    </section>;
  }
}
