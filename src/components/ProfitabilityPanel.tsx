import type { DocumentItem, LourexDocument, SavedItem } from '../types.js';
import { formatMoney, isDecimalInput, lineTotal, normalizeDecimalInput } from '../lib/money.js';
import { calculateProfitability, validInternalCost } from '../lib/profitability.js';
import { findSavedItemMatch } from '../lib/saved-items.js';
import { t } from '../lib/i18n.js';
import { Button, Icon, Input } from './UI.js';

interface Props{
  document:LourexDocument;
  savedItems:SavedItem[];
  onSave:(document:LourexDocument,auto?:boolean)=>Promise<void>;
  onSaveSavedItem:(item:SavedItem)=>Promise<void>;
}
interface State{
  open:boolean;
  unitCosts:Record<string,string>;
  shippingCost:string;
  otherCost:string;
  dirty:boolean;
  saving:boolean;
  error:string;
}

function costsFrom(document:LourexDocument):Pick<State,'unitCosts'|'shippingCost'|'otherCost'> {
  return {
    unitCosts:Object.fromEntries(document.items.map(item=>[item.id,item.unitCost??''])),
    shippingCost:document.internalCosts?.shippingCost??'0.00',
    otherCost:document.internalCosts?.otherCost??'0.00'
  };
}

function titleOf(item:DocumentItem):string{return item.descriptionEn.trim()||item.descriptionAr.trim()||t('Untitled item','صنف بلا اسم');}

export class ProfitabilityPanel extends React.Component<Props,State>{
  constructor(props:Props){
    super(props);
    this.state={open:false,...costsFrom(props.document),dirty:false,saving:false,error:''};
  }

  componentDidUpdate(prevProps:Props):void{
    if(prevProps.document.id!==this.props.document.id){
      this.setState({open:false,...costsFrom(this.props.document),dirty:false,saving:false,error:''});
      return;
    }
    if(prevProps.document.updatedAt!==this.props.document.updatedAt&&!this.state.dirty){
      this.setState({...costsFrom(this.props.document)});
    }
  }

  private setUnitCost=(itemId:string,value:string)=>this.setState(state=>({unitCosts:{...state.unitCosts,[itemId]:value},dirty:true,error:''}));
  private setShippingCost=(shippingCost:string)=>this.setState({shippingCost,dirty:true,error:''});
  private setOtherCost=(otherCost:string)=>this.setState({otherCost,dirty:true,error:''});

  private workingDocument=():LourexDocument=>({
    ...structuredClone(this.props.document),
    items:this.props.document.items.map(item=>({...structuredClone(item),unitCost:this.state.unitCosts[item.id]??item.unitCost??''})),
    internalCosts:{shippingCost:this.state.shippingCost||'0.00',otherCost:this.state.otherCost||'0.00'}
  });

  private validate=():string=>{
    for(const item of this.props.document.items){
      const value=this.state.unitCosts[item.id]??'';
      if(!validInternalCost(value))return t(`Invalid unit cost for ${titleOf(item)}.`,`تكلفة الوحدة غير صالحة للصنف ${titleOf(item)}.`);
    }
    if(!validInternalCost(this.state.shippingCost))return t('Internal shipping cost must be zero or greater.','تكلفة الشحن الداخلية يجب أن تكون صفرًا أو أكثر.');
    if(!validInternalCost(this.state.otherCost))return t('Other internal cost must be zero or greater.','التكلفة الداخلية الأخرى يجب أن تكون صفرًا أو أكثر.');
    return '';
  };

  private save=async()=>{
    if(this.state.saving||this.props.document.lifecycleStatus==='voided')return;
    const error=this.validate();if(error){this.setState({error});return;}
    const document=this.workingDocument();
    document.items=document.items.map(item=>({...item,unitCost:item.unitCost.trim()?normalizeDecimalInput(item.unitCost):''}));
    document.internalCosts={
      shippingCost:this.state.shippingCost.trim()?normalizeDecimalInput(this.state.shippingCost):'0.00',
      otherCost:this.state.otherCost.trim()?normalizeDecimalInput(this.state.otherCost):'0.00'
    };
    this.setState({saving:true,error:''});
    try{
      await this.props.onSave(document,true);
      this.setState({...costsFrom(document),dirty:false,saving:false});
    }catch(e){this.setState({saving:false,error:e instanceof Error?e.message:t('Unable to save internal costs.','تعذر حفظ التكاليف الداخلية.')});}
  };

  private useSavedCost=(item:DocumentItem,saved:SavedItem)=>{
    if(!saved.lastUnitCost||saved.lastCostCurrency!==this.props.document.currency)return;
    this.setUnitCost(item.id,saved.lastUnitCost);
  };

  private saveProductCost=async(item:DocumentItem)=>{
    const saved=findSavedItemMatch(this.props.savedItems,item);
    const value=(this.state.unitCosts[item.id]??'').trim();
    if(!saved){this.setState({error:t('Save this item to the Product Library first, then its cost can be reused.','احفظ هذا الصنف في مكتبة الأصناف أولًا، ثم يمكن إعادة استخدام تكلفته.')});return;}
    if(!value||!isDecimalInput(value)){this.setState({error:t('Enter a valid unit cost first.','أدخل تكلفة وحدة صالحة أولًا.')});return;}
    try{
      await this.props.onSaveSavedItem({...saved,lastUnitCost:normalizeDecimalInput(value),lastCostCurrency:this.props.document.currency,updatedAt:new Date().toISOString()});
      this.setState({error:''});
    }catch(e){this.setState({error:e instanceof Error?e.message:t('Unable to update product cost.','تعذر تحديث تكلفة الصنف.')});}
  };

  render():any{
    const document=this.workingDocument();
    const summary=calculateProfitability(document);
    const voided=this.props.document.lifecycleStatus==='voided';
    const label=this.props.document.role==='credit-note'?t('Profitability reversal','عكس الربحية'):this.props.document.kind==='proforma'?t('Projected profitability','الربحية المتوقعة'):t('Profitability','الربحية');
    return <section className={`profitability-panel ${this.state.open?'is-open':''}`} aria-label={t('Internal profitability','الربحية الداخلية')}>
      <button type="button" className="profitability-toggle" onClick={()=>this.setState({open:!this.state.open})} aria-expanded={this.state.open}>
        <span className="profitability-icon"><Icon name="invoice" size={18}/></span>
        <span><small>{t('Internal only · never printed','داخلي فقط · لا يظهر بالطباعة')}</small><strong>{label}</strong></span>
        <span className={`profitability-status ${summary.complete?'complete':'incomplete'}`}>{summary.complete?t('Cost complete','التكلفة مكتملة'):t(`${summary.missingCostItems} costs missing`,`ناقص ${summary.missingCostItems} تكلفة`)}</span>
      </button>
      {this.state.open?<div className="profitability-body">
        <div className="profitability-summary">
          <div><span>{t('Net revenue','صافي الإيراد')}</span><strong>{formatMoney(summary.netRevenue,document.currency)}</strong><small>{t('Tax excluded','بدون الضريبة')}</small></div>
          <div><span>{summary.complete?t('Total cost','إجمالي التكلفة'):t('Known cost','التكلفة المعروفة')}</span><strong>{formatMoney(summary.totalCost,document.currency)}</strong><small>{summary.costedItems}/{summary.totalItems} {t('items costed','أصناف مسعّرة بالتكلفة')}</small></div>
          <div className="profitability-profit"><span>{t('Gross profit','الربح الإجمالي')}</span><strong>{summary.complete?formatMoney(summary.grossProfit,document.currency):'—'}</strong><small>{summary.complete?`${summary.marginPercent}% ${t('margin','هامش')}`:t('Complete item costs first','أكمل تكاليف الأصناف أولًا')}</small></div>
        </div>
        <div className="profitability-lines">
          <div className="profitability-lines-head"><strong>{t('Item costs','تكاليف الأصناف')}</strong><span>{t(`Same currency as document: ${document.currency}`,`بنفس عملة المستند: ${document.currency}`)}</span></div>
          {document.items.map(item=>{
            const saved=findSavedItemMatch(this.props.savedItems,item);
            const reusable=Boolean(saved?.lastUnitCost&&saved.lastCostCurrency===document.currency);
            const cost=this.state.unitCosts[item.id]??'';
            return <div className="profitability-line" key={item.id}>
              <div><strong>{titleOf(item)}</strong><span>{item.quantity} × {formatMoney(item.unitPrice||'0',document.currency)} = {formatMoney(lineTotal(item.quantity,item.unitPrice),document.currency)}</span></div>
              <label><span>{t('Unit cost','تكلفة الوحدة')}</span><Input disabled={voided} inputMode="decimal" value={cost} placeholder="0.00" onChange={(e:any)=>this.setUnitCost(item.id,e.target.value)}/></label>
              <div className="profitability-line-actions">{reusable?<Button variant="ghost" disabled={voided} onClick={()=>this.useSavedCost(item,saved!)}>{t(`Use ${saved!.lastUnitCost}`,`استخدم ${saved!.lastUnitCost}`)}</Button>:null}<Button variant="ghost" disabled={voided||!cost.trim()} onClick={()=>void this.saveProductCost(item)}>{t('Save cost','حفظ التكلفة')}</Button></div>
            </div>;
          })}
        </div>
        <div className="profitability-overheads">
          <label><span>{t('Internal shipping cost','تكلفة الشحن الداخلية')}</span><Input disabled={voided} inputMode="decimal" value={this.state.shippingCost} onChange={(e:any)=>this.setShippingCost(e.target.value)}/><small>{document.adjustments.shippingEnabled?t(`Customer shipping charge: ${document.adjustments.shipping} ${document.currency}`,`رسم الشحن على العميل: ${document.adjustments.shipping} ${document.currency}`):t('No shipping charged to customer','لا يوجد شحن محمّل على العميل')}</small></label>
          <label><span>{t('Other internal cost','تكلفة داخلية أخرى')}</span><Input disabled={voided} inputMode="decimal" value={this.state.otherCost} onChange={(e:any)=>this.setOtherCost(e.target.value)}/><small>{t('Freight handling, packaging, commissions, or other direct cost','مناولة أو تغليف أو عمولات أو تكلفة مباشرة أخرى')}</small></label>
        </div>
        <div className="profitability-privacy"><Icon name="lock" size={15}/><span>{t('These figures stay inside the encrypted LOUREX vault and are not rendered in invoices, PDFs, print, or share output.','تبقى هذه الأرقام داخل خزنة LOUREX المشفّرة ولا تظهر في الفاتورة أو PDF أو الطباعة أو المشاركة.')}</span></div>
        {this.state.error?<div className="profitability-error" role="alert">{this.state.error}</div>:null}
        <div className="profitability-actions"><span>{this.state.dirty?t('Unsaved internal cost changes','تغييرات تكلفة داخلية غير محفوظة'):t('Internal costs saved','تم حفظ التكاليف الداخلية')}</span><Button icon="save" variant="primary" disabled={voided||this.state.saving||!this.state.dirty} onClick={()=>void this.save()}>{this.state.saving?t('Saving…','جارٍ الحفظ…'):t('Save Internal Costs','حفظ التكاليف الداخلية')}</Button></div>
      </div>:null}
    </section>;
  }
}
