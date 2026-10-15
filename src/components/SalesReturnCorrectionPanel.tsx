import type {DocumentAttachment,InventoryMovementRecord} from '../types.js';
import {isSalesReturn,isSalesReturnCorrection,type SalesReturnCorrectionInput} from '../lib/sales-returns.js';
import {readManualMovementEvidence} from '../lib/inventory-evidence.js';
import {warehouseItemQuantity,defaultWarehouseId} from '../lib/warehouses.js';
import {decimalToScaled} from '../lib/money.js';
import {todayIso} from '../lib/id.js';
import {t} from '../lib/i18n.js';
import {Button,Input,Select} from './UI.js';

interface Props{
  movements:InventoryMovementRecord[];workspaceId:string;branchId:string;
  onCorrect:(input:SalesReturnCorrectionInput)=>Promise<void>;
}
interface State{
  receiptId:string;date:string;reason:string;evidence:DocumentAttachment|null;
  fileBusy:boolean;busy:boolean;error:string;success:string;
}
export class SalesReturnCorrectionPanel extends React.Component<Props,State>{
  state:State={receiptId:'',date:todayIso(),reason:'',evidence:null,
    fileBusy:false,busy:false,error:'',success:''};

  private openReceipts=():InventoryMovementRecord[]=>{
    const corrected=new Set(this.props.movements.filter(isSalesReturnCorrection)
      .map(m=>m.salesReturnCorrection?.receiptMovementId));
    return this.props.movements.filter(m=>isSalesReturn(m)&&!!m.salesReturn
      &&m.workspaceId===this.props.workspaceId&&m.branchId===this.props.branchId
      &&!corrected.has(m.id));
  };
  private readEvidence=async(e:any)=>{
    const file=e.target.files?.[0] as File|undefined;
    e.target.value='';
    if(!file)return;
    this.setState({fileBusy:true,error:'',success:''});
    try{this.setState({evidence:await readManualMovementEvidence(file)});}
    catch(error){this.setState({error:error instanceof Error?error.message:String(error),evidence:null});}
    finally{this.setState({fileBusy:false});}
  };
  private submit=async()=>{
    if(this.state.busy||this.state.fileBusy)return;
    const receipt=this.openReceipts().find(m=>m.id===this.state.receiptId);
    if(!receipt||!this.state.evidence||this.state.reason.trim().length<5){
      this.setState({error:t('Select the receipt, describe the mistake and upload NEW correction evidence.','اختر الاستلام، واذكر سبب الخطأ، وأرفق إثبات تصحيح جديدًا.')});return;
    }
    if(this.state.evidence.id===receipt.evidence?.id
      ||this.state.evidence.dataUrl===receipt.evidence?.dataUrl){
      this.setState({error:t('A new correction needs new evidence, not the original receipt.','التصحيح يتطلب إثباتًا جديدًا غير إثبات الاستلام الأصلي.')});return;
    }
    this.setState({busy:true,error:'',success:''});
    try{
      await this.props.onCorrect({receiptMovementId:receipt.id,date:this.state.date,reason:this.state.reason.trim(),
        evidence:this.state.evidence,operatorId:'assigned-by-app'});
      this.setState({receiptId:'',reason:'',evidence:null,
        success:t('Return correction posted; original receipt remains in history.','تم ترحيل تصحيح المرتجع مع الاحتفاظ بسجل الاستلام الأصلي.')});
    }catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}
    finally{this.setState({busy:false});}
  };
  render():any{
    const choices=this.openReceipts(),selected=choices.find(m=>m.id===this.state.receiptId);
    const fallback=defaultWarehouseId(this.props.branchId);
    const onHand=selected?warehouseItemQuantity(selected.itemId,selected.toWarehouseId||fallback,this.props.movements,fallback):0n;
    const required=selected?decimalToScaled(selected.quantity,4):0n;
    const insufficient=!!selected&&required>onHand;
    return <section className="ta-ops-list-card ta-sales-return-correction" aria-label={t('Correct a posted physical return','تصحيح استلام مرتجع مثبت')}>
      <header className="ta-ops-panel-head"><div><small>{t('Immutable stock audit','تدقيق مخزون غير قابل للتعديل')}</small>
        <h3>{t('Correct an Incorrect Return Receipt','تصحيح استلام مرتجع خاطئ')}</h3>
        <p>{t('Never delete the original receipt. Post an exactly offsetting movement with a NEW reason and independent document proof.','لا تحذف الاستلام الأصلي. سجّل حركة عكس بنفس الكمية مع سبب وإثبات جديدين مستقلين.')}</p>
      </div></header>
      {!choices.length?<p>{t('No uncorrected physical return receipts in this branch.','لا توجد استلامات مرتجعات قابلة للتصحيح في هذا الفرع.')}</p>:<>
      <div className="ta-ops-form-grid">
        <label className="is-wide">{t('Recorded physical return','استلام المرتجع المسجل')}
          <Select value={this.state.receiptId} onChange={(e:any)=>this.setState({receiptId:e.target.value,error:'',success:''})}>
            <option value="">{t('Choose receipt to reverse','اختر الاستلام المطلوب عكسه')}</option>
            {choices.map(m=><option key={m.id} value={m.id}>{m.sourceNumber} · {m.sku} · {m.quantity} · {m.date}</option>)}
          </Select>
        </label>
        <label>{t('Correction date','تاريخ التصحيح')}
          <Input type="date" value={this.state.date} onChange={(e:any)=>this.setState({date:e.target.value})}/>
        </label>
        <label className="is-wide">{t('New correction reason (required)','سبب التصحيح الجديد (إلزامي)')}
          <Input value={this.state.reason} onChange={(e:any)=>this.setState({reason:e.target.value,error:''})}
            placeholder={t('Explain why the original physical receipt is incorrect','وضح لماذا كان الاستلام الفعلي الأصلي غير صحيح')}/>
        </label>
        <label className="is-wide">{t('NEW PDF/image supporting document (max 2 MB)','إثبات تصحيح جديد PDF أو صورة (2 ميغابايت)')}
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif"
            disabled={this.state.fileBusy||this.state.busy} onChange={this.readEvidence}/>
          {this.state.evidence?<small>{t('New proof ready','الإثبات الجديد جاهز')}: {this.state.evidence.name}</small>:null}
        </label>
      </div>
      {selected?<p role="status">{t('Full correction quantity (cannot be edited)','كمية التصحيح الكاملة (غير قابلة للتعديل)')}: <strong>-{selected.quantity}</strong>. {t('Original receipt and original cost stay in the audit ledger.','يبقى الاستلام الأصلي وتكلفته الأصلية في سجل التدقيق.')}</p>:null}
      {insufficient?<p role="alert" className="ta-ops-error">{t('The warehouse no longer has enough of this item to reverse the receipt. Reconcile subsequent movements first.','رصيد المستودع لا يكفي لعكس الاستلام. يلزم مطابقة الحركات اللاحقة أولًا.')}</p>:null}
      <div className="ta-inventory-entry-action"><Button icon="check" variant="primary"
        disabled={!selected||!this.state.evidence||this.state.reason.trim().length<5||this.state.busy||this.state.fileBusy||insufficient}
        onClick={()=>void this.submit()}>{this.state.busy?t('Correcting…','جارٍ التصحيح…'):t('Post Audited Correction','ترحيل التصحيح الموثق')}</Button></div>
      </>}
      {this.state.error?<p role="alert" className="ta-ops-error">{this.state.error}</p>:null}
      {this.state.success?<p role="status">{this.state.success}</p>:null}
    </section>;
  }
}
