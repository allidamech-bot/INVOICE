import type { DocumentEventRecord, LourexDocument } from '../types.js';
import { linkedPurchaseOrders } from '../lib/procurement-flow.js';
import { acceptedSupplierQuotationEvents, type SupplierQuotationAcceptanceInput } from '../lib/supplier-quotation-flow.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, Field, Input, Textarea } from './UI.js';

interface Props{
  rfq:LourexDocument;
  documents:LourexDocument[];
  events:DocumentEventRecord[];
  onAccept:(input:SupplierQuotationAcceptanceInput)=>Promise<void>;
  onOpenPurchaseOrder:(order:LourexDocument)=>void;
}
interface State{
  reference:string;validUntil:string;notes:string;unitPrices:string[];
  confirmed:boolean;working:boolean;error:string;
}

/** The explicit supplier quote review is never an accounting-posting action. */
export class SupplierQuotationReview extends React.Component<Props,State>{
  state:State={reference:'',validUntil:'',notes:'',unitPrices:this.props.rfq.items.map(()=>''),confirmed:false,working:false,error:''};
  private inFlight=false;

  componentDidUpdate(prev:Props):void{
    if(prev.rfq.id!==this.props.rfq.id||prev.rfq.updatedAt!==this.props.rfq.updatedAt){
      this.setState({reference:'',validUntil:'',notes:'',unitPrices:this.props.rfq.items.map(()=>''),confirmed:false,error:''});
    }
  }

  private setPrice=(index:number,value:string)=>{
    this.setState(state=>({unitPrices:state.unitPrices.map((old,i)=>i===index?value:old),confirmed:false,error:''}));
  };

  private accept=async()=>{
    if(this.inFlight||!this.state.confirmed)return;
    this.inFlight=true;this.setState({working:true,error:''});
    try{
      const rfq=this.props.rfq;
      const po=linkedPurchaseOrders(rfq,this.props.documents,this.props.events).find(item=>item.lifecycleStatus!=='voided');
      await this.props.onAccept({
        rfqId:rfq.id,expectedRfqUpdatedAt:rfq.updatedAt,
        expectedPurchaseOrderUpdatedAt:po?.updatedAt??'',
        reference:this.state.reference,validUntil:this.state.validUntil,
        notes:this.state.notes,unitPrices:[...this.state.unitPrices]
      });
      this.setState({working:false,confirmed:false});
    }catch(error){
      this.setState({working:false,error:error instanceof Error?error.message:t('Unable to accept supplier quote.','تعذّر اعتماد عرض المورد.')});
    }finally{this.inFlight=false;}
  };

  render():any{
    const rfq=this.props.rfq;
    if(rfq.kind!=='rfq')return null;
    const quotes=acceptedSupplierQuotationEvents(rfq.id,this.props.events);
    const activePO=linkedPurchaseOrders(rfq,this.props.documents,this.props.events).find(doc=>doc.lifecycleStatus!=='voided');
    const activeQuote=quotes.find(quote=>quote.purchaseOrderId===activePO?.id);
    const active=rfq.status==='final'&&rfq.lifecycleStatus!=='voided';
    const canReview=active&&!activeQuote&&(!activePO||activePO.status==='draft');
    return <section className="ta-doc-panel" aria-label={t('Supplier quotation review','مراجعة عرض سعر المورد')}>
      <header><div><small>{t('Procurement • Batch 7','المشتريات • الدفعة السابعة')}</small><h2>{t('Supplier quotation','عرض سعر المورد')}</h2></div></header>
      {activeQuote?<div className="ta-doc-facts">
        <div><small>{t('Accepted supplier reference','مرجع عرض المورد المعتمد')}</small><strong dir="auto">{activeQuote.reference}</strong></div>
        <div><small>{t('Currency','العملة')}</small><strong>{activeQuote.currency}</strong></div>
        <div><small>{t('Accepted on','تاريخ الاعتماد')}</small><strong>{activeQuote.acceptedAt.slice(0,10)}</strong></div>
        {activePO?<Button icon="file" onClick={()=>this.props.onOpenPurchaseOrder(activePO)}>{t('Open linked Purchase Order','فتح أمر الشراء المرتبط')}</Button>:null}
        <p>{t('Prices are a reviewed snapshot. The linked order remains a draft until explicitly issued.','الأسعار محفوظة كمراجعة موثقة. يبقى أمر الشراء مسودة حتى إصداره صراحةً.')}</p>
      </div>:null}
      {!active?<p>{t('Issue the RFQ before accepting supplier pricing.','أصدر طلب عرض السعر أولًا قبل اعتماد أسعار المورد.')}</p>:null}
      {active&&activePO?.status==='final'&&!activeQuote?<p>{t('The linked Purchase Order is already issued. Its pricing cannot be changed here.','أمر الشراء المرتبط صادر بالفعل ولا يمكن تغيير أسعاره من هنا.')}</p>:null}
      {canReview?<div style={{display:'grid',gap:12}}>
        <p>{t('Enter the supplier’s actual quote reference and unit prices. Verify every line before acceptance. This action does not post inventory or create supplier debt.','أدخل رقم عرض المورد الفعلي وأسعار الوحدات. راجع جميع البنود قبل الاعتماد. هذا الإجراء لا يرحّل المخزون ولا ينشئ ذمة للمورد.')}</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:12}}>
          <Field label={t('Supplier quote reference','مرجع عرض المورد')}>
            <Input value={this.state.reference} maxLength={100} onChange={(e:any)=>this.setState({reference:e.target.value,confirmed:false,error:''})} placeholder="SQ-2026-001" aria-label={t('Supplier quote reference','مرجع عرض المورد')}/>
          </Field>
          <Field label={t('Valid until (optional)','ساري حتى (اختياري)')}>
            <Input type="date" value={this.state.validUntil} onChange={(e:any)=>this.setState({validUntil:e.target.value,confirmed:false,error:''})} aria-label={t('Valid until','ساري حتى')}/>
          </Field>
        </div>
        <div style={{display:'grid',gap:10}}>
          {rfq.items.map((line,i)=><label key={line.id} className="field">
            <span className="field-label">{i+1}. {isArabic()?(line.descriptionAr||line.descriptionEn):(line.descriptionEn||line.descriptionAr)} — {line.quantity} {line.unit}</span>
            <Input inputMode="decimal" dir="ltr" value={this.state.unitPrices[i]||''}
              aria-label={t(`Unit price for item ${i+1}`,`سعر الوحدة للصنف ${i+1}`)}
              placeholder={t(`Unit price in ${rfq.currency}`,`سعر الوحدة بعملة ${rfq.currency}`)}
              onChange={(e:any)=>this.setPrice(i,e.target.value)}/>
          </label>)}
        </div>
        <Field label={t('Supplier conditions (optional)','شروط المورد (اختياري)')}>
          <Textarea rows={2} maxLength={500} value={this.state.notes} onChange={(e:any)=>this.setState({notes:e.target.value,confirmed:false,error:''})}/>
        </Field>
        <label style={{display:'flex',alignItems:'flex-start',gap:10}}>
          <input type="checkbox" checked={this.state.confirmed} onChange={(e:any)=>this.setState({confirmed:e.target.checked,error:''})}
            aria-label={t('Confirm supplier quote prices and quantities','أؤكد مراجعة أسعار عرض المورد وكمياته')}/>
          <span>{t('I checked the supplier reference, currency, quantities and every price. Apply these prices to the linked draft PO (or create one).','راجعت مرجع المورد والعملة والكميات وجميع الأسعار. أوافق على نقلها لمسودة أمر الشراء المرتبطة (أو إنشاء واحدة).')}</span>
        </label>
        {this.state.error?<p role="alert" className="field-error">{this.state.error}</p>:null}
        <Button variant="primary" icon="check" disabled={this.state.working||!this.state.confirmed} onClick={()=>void this.accept()}>
          {this.state.working?t('Saving review…','جارٍ حفظ المراجعة…'):t('Accept quote & prepare Purchase Order','اعتماد العرض وتجهيز أمر الشراء')}
        </Button>
      </div>:null}
      {quotes.length>0&&!activeQuote?<p>{t('Earlier supplier quotation decisions remain in the encrypted audit history.','قرارات عروض المورد السابقة محفوظة في سجل التدقيق المشفر.')}</p>:null}
    </section>;
  }
}
