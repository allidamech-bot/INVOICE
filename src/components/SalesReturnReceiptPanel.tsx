import type {DocumentAttachment,InventoryMovementRecord,LourexDocument,WarehouseRecord} from '../types.js';
import {INVOICE_STOCK_PREFIX} from '../lib/invoice-stock.js';
import {isSalesReturn,type SalesReturnInput} from '../lib/sales-returns.js';
import {readManualMovementEvidence} from '../lib/inventory-evidence.js';
import {decimalToScaled,isDecimalInput} from '../lib/money.js';
import {todayIso} from '../lib/id.js';
import {t} from '../lib/i18n.js';
import {Button,Input,Select} from './UI.js';

interface Props{
  documents:LourexDocument[];movements:InventoryMovementRecord[];
  warehouses:WarehouseRecord[];workspaceId:string;branchId:string;
  onRecord:(input:SalesReturnInput)=>Promise<void>;
}
interface State{
  choice:string;warehouseId:string;quantity:string;date:string;reason:string;
  evidence:DocumentAttachment|null;fileBusy:boolean;busy:boolean;error:string;success:string;
}
interface Choice{
  key:string;invoice:LourexDocument;invoiceLine:LourexDocument['items'][number];
  credit:LourexDocument;creditLine:LourexDocument['items'][number];remaining:bigint;
}
const qty=(x:string)=>decimalToScaled(x,4);
const display=(n:bigint)=>String(n/10000n)+(n%10000n?'.'+String(n%10000n).padStart(4,'0').replace(/0+$/,''):'');
function eligible(document:LourexDocument,workspaceId:string,branchId:string):boolean{
  return (!document.workspaceId||document.workspaceId===workspaceId)&&(!document.branchId||document.branchId===branchId);
}

export class SalesReturnReceiptPanel extends React.Component<Props,State>{
  state:State={choice:'',warehouseId:'',quantity:'',date:todayIso(),reason:'',
    evidence:null,fileBusy:false,busy:false,error:'',success:''};

  private choices=():Choice[]=>{
    const {documents,movements,workspaceId,branchId}=this.props,results:Choice[]=[];
    for(const credit of documents){
      if(credit.kind!=='invoice'||credit.role!=='credit-note'||credit.status!=='final'||credit.lifecycleStatus==='voided'
        ||!eligible(credit,workspaceId,branchId))continue;
      const invoice=documents.find(d=>d.id===credit.creditForId);
      if(!invoice||invoice.kind!=='invoice'||invoice.role!=='standard'||invoice.status!=='final'
        ||invoice.lifecycleStatus==='voided'||!eligible(invoice,workspaceId,branchId))continue;
      for(const creditLine of credit.items){
        if(creditLine.stockTreatment!=='tracked'||!creditLine.savedItemId||!isDecimalInput(creditLine.quantity)||qty(creditLine.quantity)<=0n)continue;
        const priorByCredit=movements.filter(m=>isSalesReturn(m)&&m.salesReturn?.creditNoteId===credit.id
          &&m.salesReturn?.creditLineId===creditLine.id).reduce((sum,m)=>sum+qty(m.quantity),0n);
        const creditLeft=qty(creditLine.quantity)-priorByCredit;
        for(const invoiceLine of invoice.items){
          if(invoiceLine.stockTreatment!=='tracked'||invoiceLine.savedItemId!==creditLine.savedItemId
            ||invoiceLine.skuSnapshot!==creditLine.skuSnapshot||invoiceLine.unit.toLowerCase()!==creditLine.unit.toLowerCase()
            ||!isDecimalInput(invoiceLine.quantity)||qty(invoiceLine.quantity)<=0n)continue;
          if(!movements.some(m=>m.id===INVOICE_STOCK_PREFIX+invoice.id+':'+invoiceLine.id))continue;
          const already=movements.filter(m=>isSalesReturn(m)&&m.salesReturn?.invoiceId===invoice.id
            &&m.salesReturn?.invoiceLineId===invoiceLine.id).reduce((sum,m)=>sum+qty(m.quantity),0n);
          const invoiceLeft=qty(invoiceLine.quantity)-already;
          const remaining=creditLeft<invoiceLeft?creditLeft:invoiceLeft;
          if(remaining<=0n)continue;
          results.push({key:JSON.stringify([credit.id,creditLine.id,invoiceLine.id]),invoice,invoiceLine,credit,creditLine,remaining});
        }
      }
    }
    return results;
  };
  private loadProof=async(event:any)=>{
    const file=event.target.files?.[0] as File|undefined;
    event.target.value='';
    if(!file)return;
    this.setState({fileBusy:true,error:'',success:''});
    try{const evidence=await readManualMovementEvidence(file);this.setState({evidence});}
    catch(error){this.setState({evidence:null,error:error instanceof Error?error.message:String(error)});}
    finally{this.setState({fileBusy:false});}
  };
  private submit=async()=>{
    if(this.state.busy||this.state.fileBusy)return;
    const choice=this.choices().find(c=>c.key===this.state.choice),evidence=this.state.evidence;
    if(!choice||!evidence){this.setState({error:t('Choose a credited item and upload physical receipt evidence.','اختر صنف إشعار دائن وأرفق إثبات الاستلام الفعلي.')});return;}
    if(!isDecimalInput(this.state.quantity)||qty(this.state.quantity)<=0n||qty(this.state.quantity)>choice.remaining){
      this.setState({error:t('Returned quantity must be positive and cannot exceed the available credited quantity.','يجب أن تكون الكمية موجبة وألا تتجاوز الكمية المتبقية في الإشعار.')});return;
    }
    const warehouse=this.props.warehouses.find(w=>w.id===this.state.warehouseId&&w.active&&w.workspaceId===this.props.workspaceId&&w.branchId===this.props.branchId);
    if(!warehouse||this.state.reason.trim().length<5){
      this.setState({error:t('Choose a live warehouse and document why the physical goods were received.','اختر مستودعًا نشطًا ودوّن سبب استلام البضاعة الفعلي.')});return;
    }
    this.setState({busy:true,error:'',success:''});
    try{
      await this.props.onRecord({creditNoteId:choice.credit.id,creditLineId:choice.creditLine.id,
        invoiceLineId:choice.invoiceLine.id,warehouseId:warehouse.id,quantity:this.state.quantity.trim(),
        date:this.state.date,reason:this.state.reason.trim(),evidence,operatorId:'assigned-by-app'});
      this.setState({choice:'',quantity:'',reason:'',evidence:null,
        success:t('Physical return recorded with its credit note and proof.','تم تسجيل المرتجع وربطه بالإشعار الدائن والإثبات.')});
    }catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}
    finally{this.setState({busy:false});}
  };
  render():any{
    const options=this.choices(),selected=options.find(c=>c.key===this.state.choice);
    const warehouses=this.props.warehouses.filter(w=>w.active&&w.workspaceId===this.props.workspaceId&&w.branchId===this.props.branchId);
    return <section className="ta-ops-list-card ta-sales-return-receipt" aria-label={t('Physical sales return receipt','استلام مرتجع مبيعات فعلي')}>
      <header className="ta-ops-panel-head"><div><small>{t('Credit-linked inventory','مخزون مرتبط بالإشعار الدائن')}</small>
        <h3>{t('Receive Returned Goods','استلام بضاعة مرتجعة')}</h3>
        <p>{t('A credit note adjusts the financial balance, not inventory. Record goods only after physical receipt and upload a proof.','الإشعار الدائن يعدّل الرصيد المالي، ولا يعيد البضاعة تلقائيًا. سجّل البضاعة فقط بعد استلامها الفعلي مع الإثبات.')}</p>
      </div></header>
      {!options.length?<p className="ta-sales-return-guidance">{t('No eligible physical returns. Issue a final credit note with catalog-linked stock lines first. A generic monetary credit cannot automatically restock goods.','لا توجد مرتجعات متاحة. أصدر إشعارًا دائنًا نهائيًا ببنود مخزنية مربوطة بالكتالوج أولًا. الإشعار المالي العام لا يعيد المخزون تلقائيًا.')}</p>:<>
        <div className="ta-ops-form-grid">
          <label className="is-wide">{t('Credited invoice item','بند الفاتورة المشمول بالإشعار الدائن')}
            <Select value={this.state.choice} onChange={(e:any)=>this.setState({choice:e.target.value,quantity:'',error:'',success:''})}>
              <option value="">{t('Select final credit note and item','اختر إشعارًا دائنًا نهائيًا وصنفًا')}</option>
              {options.map(c=><option key={c.key} value={c.key}>{c.credit.number} · {c.invoice.number} · {c.invoiceLine.skuSnapshot} · {t('Up to','حتى')} {display(c.remaining)} {c.invoiceLine.unit}</option>)}
            </Select>
          </label>
          <label>{t('Quantity physically received','الكمية المستلمة فعليًا')}
            <Input inputMode="decimal" value={this.state.quantity} onChange={(e:any)=>this.setState({quantity:e.target.value,error:''})} placeholder={selected?display(selected.remaining):'0'}/>
          </label>
          <label>{t('Receipt date','تاريخ الاستلام')}
            <Input type="date" value={this.state.date} onChange={(e:any)=>this.setState({date:e.target.value})}/>
          </label>
          <label className="is-wide">{t('Receiving warehouse','مستودع الاستلام')}
            <Select value={this.state.warehouseId} onChange={(e:any)=>this.setState({warehouseId:e.target.value})}>
              <option value="">{t('Choose receiving warehouse','اختر مستودع الاستلام')}</option>
              {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </label>
          <label className="is-wide">{t('Physical condition and reason (required)','الحالة الفعلية وسبب الإرجاع (إلزامي)')}
            <Input value={this.state.reason} onChange={(e:any)=>this.setState({reason:e.target.value,error:''})}
              placeholder={t('E.g. 2 sealed cartons returned, inspected, placed in warehouse','مثلاً: استلام كرتونين سليمين بعد فحصهما وإدخالهما المستودع')}/>
          </label>
          <label className="is-wide">{t('Mandatory return delivery/receipt photo or PDF (max 2 MB)','صورة أو PDF لإثبات الاستلام (إلزامي، 2 ميغابايت)')}
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif"
              disabled={this.state.busy||this.state.fileBusy} onChange={this.loadProof}/>
            {this.state.evidence?<small>{t('Proof loaded','تم تحميل الإثبات')}: {this.state.evidence.name}</small>:null}
          </label>
        </div>
        {selected?<p className="ta-sales-return-guidance" role="status">{t('Maximum restock from this credited item','أقصى كمية يمكن إعادتها من هذا البند')}: <strong>{display(selected.remaining)} {selected.invoiceLine.unit}</strong>. {t('Valued at the original invoice stock cost.','تُقيّم بتكلفة المخزون الأصلية للفاتورة.')}</p>:null}
        <div className="ta-inventory-entry-action"><Button icon="check" variant="primary" disabled={!selected||!this.state.evidence||this.state.busy||this.state.fileBusy||this.state.reason.trim().length<5||!this.state.warehouseId}
          onClick={()=>void this.submit()}>{this.state.busy?t('Recording…','جارٍ التسجيل…'):t('Record Physical Return','تسجيل المرتجع الفعلي')}</Button></div>
      </>}
      {this.state.error?<p className="ta-ops-error" role="alert">{this.state.error}</p>:null}
      {this.state.success?<p role="status">{this.state.success}</p>:null}
    </section>;
  }
}
