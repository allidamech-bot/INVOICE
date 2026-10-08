import type { DocumentEventRecord, InventoryMovementRecord, LourexDocument, SavedItem, WarehouseRecord } from '../types.js';
import { salesDeliveryStockIssues, type PostSalesDeliveryStockInput } from '../lib/sales-delivery-stock.js';
import { warehouseItemQuantity,defaultWarehouseId } from '../lib/warehouses.js';
import {
  confirmedSalesDeliveries, deliverySalesOrderContext, salesDeliveryBalances,
  type ConfirmSalesDeliveryInput
} from '../lib/sales-delivery-flow.js';
import { todayIso } from '../lib/id.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, Field, Input, Textarea } from './UI.js';

interface Props{
  deliveryNote:LourexDocument;
  documents:LourexDocument[];
  events:DocumentEventRecord[];
  onConfirm:(input:ConfirmSalesDeliveryInput)=>Promise<void>;
  onCreateInvoice?:()=>void;
  savedItems:SavedItem[];
  warehouses:WarehouseRecord[];
  inventoryMovements:InventoryMovementRecord[];
  workspaceId:string;
  branchId:string;
  onPostStock?:(input:PostSalesDeliveryStockInput)=>Promise<void>;
}
interface State{
  reference:string;
  deliveredDate:string;
  notes:string;
  confirmed:boolean;
  busy:boolean;
  error:string;
  stockBusy:boolean;
  stockConfirmed:boolean;
  warehouseId:string;
  stockItems:string[];
  stockError:string;
}
export class SalesDeliveryReview extends React.Component<Props,State>{
  state:State={reference:'',deliveredDate:todayIso(),notes:'',confirmed:false,busy:false,error:'',stockBusy:false,stockConfirmed:false,warehouseId:'',stockItems:[],stockError:''};
  private inFlight=false;
  componentDidUpdate(prev:Props):void{
    if(prev.deliveryNote.id!==this.props.deliveryNote.id||prev.deliveryNote.updatedAt!==this.props.deliveryNote.updatedAt){
      this.setState({reference:'',deliveredDate:todayIso(),notes:'',confirmed:false,busy:false,error:'',stockBusy:false,stockConfirmed:false,warehouseId:'',stockItems:[],stockError:''});
    }
  }
  private submit=async()=>{
    if(!this.state.confirmed||this.inFlight)return;
    this.inFlight=true;this.setState({busy:true,error:''});
    try{
      await this.props.onConfirm({
        deliveryNoteId:this.props.deliveryNote.id,
        expectedDeliveryNoteUpdatedAt:this.props.deliveryNote.updatedAt,
        deliveredDate:this.state.deliveredDate,reference:this.state.reference,notes:this.state.notes,confirmed:true
      });
      this.setState({reference:'',deliveredDate:todayIso(),notes:'',confirmed:false,busy:false,error:''});
    }catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Delivery confirmation failed.','فشل تأكيد التسليم.')});}
    finally{this.inFlight=false;}
  };
  private postStock=async()=>{
    if(this.state.stockBusy||!this.state.stockConfirmed||!this.props.onPostStock)return;
    this.setState({stockBusy:true,stockError:''});
    try{
      await this.props.onPostStock({deliveryNoteId:this.props.deliveryNote.id,
        expectedDeliveryNoteUpdatedAt:this.props.deliveryNote.updatedAt,
        warehouseId:this.state.warehouseId,savedItemIds:this.state.stockItems,confirmed:true});
      this.setState({stockBusy:false,stockConfirmed:false,stockError:''});
    }catch(e){
      this.setState({stockBusy:false,stockConfirmed:false,
        stockError:e instanceof Error?e.message:t('Could not issue stock.','تعذر صرف المخزون.')});
    }
  };
  render():any{
    const {deliveryNote,documents,events}=this.props;
    if(deliveryNote.kind!=='delivery-note')return null;
    const context=deliverySalesOrderContext(deliveryNote,documents,events);
    if(!context)return null;
    const proofs=confirmedSalesDeliveries(deliveryNote.id,events);
    const stockIssues=salesDeliveryStockIssues(deliveryNote.id,this.props.inventoryMovements);
    const warehouseOptions=this.props.warehouses.filter(w=>w.active&&w.workspaceId===this.props.workspaceId&&w.branchId===this.props.branchId);
    const matchingItems=this.props.savedItems.filter(row=>!row.archived&&Boolean(row.sku?.trim())
      &&(!row.workspaceId||row.workspaceId===this.props.workspaceId)
      &&(!row.branchId||row.branchId===this.props.branchId));

    const {order}=context;
    const balances=salesDeliveryBalances(order,events);
    const open=deliveryNote.role==='standard'&&deliveryNote.status==='final'
      &&deliveryNote.lifecycleStatus!=='voided'&&!proofs.length;
    return <section className="ta-doc-panel" aria-label={t('Sales delivery confirmation','تأكيد تسليم أمر البيع')}>
      <header><div><small>{t('Sales fulfillment • Batch 7','تسليم المبيعات • الدفعة السابعة')}</small>
        <h2>{t('Confirm physical delivery','تأكيد التسليم الفعلي')}</h2></div>
        <span className="ta-doc-count-badge">{proofs.length}</span></header>
      <p>{t('Confirm the actual goods on an issued Delivery Note against the accepted Sales Order. Evidence is immutable; this does not yet post stock movements or issue an invoice.','أكد البضاعة المسلّمة بسند تسليم صادر مقابل أمر البيع المعتمد. إثبات التسليم ثابت، ولا يُرحّل المخزون أو يصدر فاتورة تلقائيًا.')}</p>
      <p><strong>{t('Sales Order','أمر البيع')}: <bdi>{order.salesOrderNumber}</bdi></strong></p>
      {proofs.map(proof=><div key={proof.reference} className="ta-doc-facts" style={{display:'grid',gap:6,marginBlock:12}}>
        <strong>{t('Confirmed','مؤكد')}: <bdi>{proof.reference}</bdi></strong>
        <span>{t('Delivered on','تاريخ التسليم')}: <bdi>{proof.deliveredDate}</bdi></span>
        <span>{proof.lines.map(line=>`${line.quantity} ${line.unit}`).join(' · ')}</span>
      </div>)}
      {proofs.length===1&&this.props.onPostStock?<section style={{display:'grid',gap:10,padding:'12px 0'}} aria-label={t('Post sales stock issue','ترحيل صرف مخزون المبيعات')}>
        {stockIssues.length>0?
          <p><strong>{t('Stock issued for confirmed delivery','تم صرف مخزون التسليم المؤكد')}</strong> — <bdi>{stockIssues.length}</bdi> {t('inventory movements recorded','حركات مخزون مسجلة')}</p>
          :<>
          <strong>{t('Issue actual delivered stock (separate approval)','صرف المخزون المسلّم (موافقة مستقلة)')}</strong>
          <p>{t('Choose the exact SKU for every delivered line and its warehouse. This deducts inventory only, without issuing invoices or recording payments.','اختر SKU الصحيح لكل بند مسلّم ومستودعه. يتم خصم المخزون فقط، دون إصدار فاتورة أو تسجيل دفعة.')}</p>
          <Field label={t('Stock warehouse','مستودع الصرف')}>
            <select className="input" aria-label={t('Stock warehouse','مستودع الصرف')}
              value={this.state.warehouseId} onChange={(e:any)=>this.setState({warehouseId:e.target.value,stockConfirmed:false,stockError:''})}>
              <option value="">{t('Select warehouse','اختر المستودع')}</option>
              {warehouseOptions.map(w=><option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
            </select>
          </Field>
          {proofs[0]!.lines.map((line,i)=>{
            const eligible=matchingItems.filter(item=>item.unit.trim().toLowerCase()===line.unit.trim().toLowerCase());
            return <Field key={line.deliveryLineId} label={t('Delivered line','بند التسليم')+' '+(i+1)+': '+line.quantity+' '+line.unit}>
              <select className="input" aria-label={t('Stock SKU for line','SKU المخزون للبند')+' '+(i+1)}
                value={this.state.stockItems[i]||''}
                onChange={(e:any)=>this.setState(prev=>({stockItems:proofs[0]!.lines.map((_,j)=>j===i?e.target.value:prev.stockItems[j]||''),stockConfirmed:false,stockError:''}))}>
                <option value="">{t('Select verified SKU','اختر SKU المؤكد')}</option>
                {eligible.map(item=><option key={item.id} value={item.id}>
                  {item.sku} — {isArabic()?(item.descriptionAr||item.descriptionEn):(item.descriptionEn||item.descriptionAr)}
                  {this.state.warehouseId?' ('+t('Available','المتاح')+': '+String(Number(warehouseItemQuantity(item.id,this.state.warehouseId,this.props.inventoryMovements,defaultWarehouseId(this.props.branchId)))/10000)+')':''}
                </option>)}
              </select>
            </Field>;
          })}
          <label style={{display:'flex',alignItems:'flex-start',gap:10}}>
            <input type="checkbox" checked={this.state.stockConfirmed}
              aria-label={t('Approve stock deduction','أوافق على خصم المخزون')}
              onChange={(e:any)=>this.setState({stockConfirmed:e.target.checked,stockError:''})}/>
            <span>{t('I checked the physical quantities, warehouse and SKU. Deduct exactly the confirmed quantity, once.','تحققت من الكميات الفعلية والمستودع وSKU. اخصم الكمية المؤكدة مرة واحدة فقط.')}</span>
          </label>
          {this.state.stockError?<p className="field-error" role="alert">{this.state.stockError}</p>:null}
          <Button icon="check" variant="primary" disabled={this.state.stockBusy||!this.state.stockConfirmed
            ||!this.state.warehouseId||this.state.stockItems.slice(0,proofs[0]!.lines.length).some(v=>!v)
            ||this.state.stockItems.length!==proofs[0]!.lines.length} onClick={()=>void this.postStock()}>
            {this.state.stockBusy?t('Posting stock…','جارٍ ترحيل المخزون…'):t('Confirm and issue stock','تأكيد وصرف المخزون')}
          </Button>
          </>}
      </section>:null}
      {proofs.length===1&&this.props.onCreateInvoice?<div style={{display:'grid',gap:8,marginBlock:12}}>
        <p>{t('Prepare an invoice draft for exactly these confirmed quantities. Review prices, VAT, discounts and shipping before issuance. Nothing is posted or collected automatically.','جهّز مسودة فاتورة للكميات المؤكدة فقط. راجع الأسعار والضريبة والخصومات والشحن قبل الإصدار. لا تُرحّل أي مبالغ أو تحصيلات تلقائيًا.')}</p>
        <Button icon="invoice" variant="primary" onClick={()=>this.props.onCreateInvoice?.()}>{t('Create / open invoice draft','إنشاء / فتح مسودة فاتورة')}</Button>
      </div>:null}
      <div style={{display:'grid',gap:8,marginBlock:12}}>
        {balances.map((balance,i)=>{
          const item=order.lines[i];
          return <div key={balance.salesOrderLineId} style={{display:'flex',gap:10,justifyContent:'space-between',flexWrap:'wrap'}}>
            <strong>{i+1}. {isArabic()?(item?.descriptionAr||item?.descriptionEn):(item?.descriptionEn||item?.descriptionAr)}</strong>
            <span>{t('Ordered','المطلوب')} <bdi>{balance.ordered}</bdi> · {t('Confirmed','المسلّم')} <bdi>{balance.delivered}</bdi> · {t('Remaining','المتبقي')} <bdi>{balance.remaining}</bdi> {item?.unit}</span>
          </div>;
        })}
      </div>
      {deliveryNote.status!=='final'&&deliveryNote.lifecycleStatus!=='voided'?
        <p>{t('Issue this Delivery Note before recording physical delivery.','أصدر سند التسليم أولًا قبل تسجيل التسليم الفعلي.')}</p>:null}
      {open?<div style={{display:'grid',gap:12}}>
        <strong>{t('Items on this Delivery Note','الأصناف المدرجة في سند التسليم')}</strong>
        {deliveryNote.items.map((item,i)=><div key={item.id} style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
          <span>{i+1}. {isArabic()?(item.descriptionAr||item.descriptionEn):(item.descriptionEn||item.descriptionAr)}</span>
          <bdi>{item.quantity} {item.unit}</bdi>
        </div>)}
        <p>{t('To record a smaller shipment, revise quantities on the delivery draft before issuing it. A confirmed note cannot be changed.','لتسجيل شحنة أصغر، عدّل كمياتها في مسودة سند التسليم قبل إصدارها. لا يمكن تغيير السند بعد تأكيده.')}</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,210px),1fr))',gap:10}}>
          <Field label={t('Physical delivery reference','مرجع التسليم الفعلي')}>
            <Input maxLength={100} value={this.state.reference} placeholder="POD-2026-001"
              aria-label={t('Physical delivery reference','مرجع التسليم الفعلي')}
              onChange={(e:any)=>this.setState({reference:e.target.value,confirmed:false,error:''})}/>
          </Field>
          <Field label={t('Physical delivery date','تاريخ التسليم الفعلي')}>
            <Input type="date" min={deliveryNote.issueDate} max={todayIso()} value={this.state.deliveredDate}
              aria-label={t('Physical delivery date','تاريخ التسليم الفعلي')}
              onChange={(e:any)=>this.setState({deliveredDate:e.target.value,confirmed:false,error:''})}/>
          </Field>
        </div>
        <Field label={t('Receipt notes (optional)','ملاحظات الاستلام (اختياري)')}>
          <Textarea maxLength={500} rows={2} value={this.state.notes}
            onChange={(e:any)=>this.setState({notes:e.target.value,confirmed:false,error:''})}/>
        </Field>
        <label style={{display:'flex',gap:10,alignItems:'flex-start'}}>
          <input type="checkbox" checked={this.state.confirmed}
            aria-label={t('Confirm physical delivery against Sales Order','أؤكد التسليم الفعلي مقابل أمر البيع')}
            onChange={(e:any)=>this.setState({confirmed:e.target.checked,error:''})}/>
          <span>{t('I verified physical receipt, the customer, each delivered quantity and the Delivery Note. Save delivery evidence only without stock or accounting posting.','تحققت من التسليم الفعلي والعميل وكل كمية مسلّمة وسند التسليم. احفظ إثبات التسليم فقط دون ترحيل مخزون أو محاسبة.')}</span>
        </label>
        {this.state.error?<p className="field-error" role="alert">{this.state.error}</p>:null}
        <Button icon="check" variant="primary" disabled={!this.state.confirmed||this.state.busy} onClick={()=>void this.submit()}>
          {this.state.busy?t('Recording physical delivery…','جارٍ تسجيل التسليم الفعلي…'):t('Confirm delivered quantities','تأكيد الكميات المسلّمة')}
        </Button>
      </div>:null}
    </section>;
  }
}