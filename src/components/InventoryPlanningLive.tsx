import type { SavedItem, Supplier, VaultPayload } from '../types.js';
import { isArabic, t } from '../lib/i18n.js';
import { resumeVaultSession } from '../storage/vault.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { scopeVault } from '../lib/workspaces.js';
import { blankInventoryPlanningPolicy, buildInventoryPlanning, validatedInventoryPlanningDeleteEvent, validatedInventoryPlanningUpsertEvent, type InventoryPlanningPolicy, type InventoryPlanningRow, type InventoryPlanningSnapshot, type InventoryPlanStatus } from '../lib/inventory-planning.js';
import { ensureInventoryPlanningStyles } from '../lib/inventory-planning-style.js';
import { Button, ConfirmDialog, Field, Icon, Input, Modal, Select, Textarea } from './UI.js';

interface State{
  loading:boolean;
  busy:boolean;
  error:string;
  snapshot:InventoryPlanningSnapshot|null;
  suppliers:Supplier[];
  editing:InventoryPlanningPolicy|null;
  originalUpdatedAt:string;
  resetting:InventoryPlanningRow|null;
  query:string;
  filter:'all'|InventoryPlanStatus;
}

function itemName(item:SavedItem):string{return(isArabic()?(item.descriptionAr||item.descriptionEn):(item.descriptionEn||item.descriptionAr)).trim()||item.sku||t('Unnamed product','صنف بدون اسم');}
function supplierName(supplier:Supplier|null):string{return supplier?((isArabic()?(supplier.nameAr||supplier.nameEn):(supplier.nameEn||supplier.nameAr)).trim()||t('Unnamed supplier','مورد بدون اسم')):t('Not set','غير محدد');}
function statusLabel(status:InventoryPlanStatus):string{
  if(status==='critical')return t('Critical','حرج');
  if(status==='reorder')return t('Reorder','إعادة طلب');
  if(status==='healthy')return t('Healthy','جيد');
  return t('Not configured','غير مهيأ');
}
function unitLabel(row:InventoryPlanningRow):string{return row.item.unit.trim()||'PCS';}
function compactQuantity(value:string,row:InventoryPlanningRow):string{return `${value} ${unitLabel(row)}`;}
function daysCoverLabel(row:InventoryPlanningRow):string{
  if(row.daysCover===null)return row.averageDailyIssue==='0'?t('No issue history','لا يوجد سجل صرف'):t('—','—');
  if(row.daysCover>999)return t('999+ days','999+ يوم');
  return t(`${row.daysCover.toFixed(row.daysCover<10?1:0)} days`,`${row.daysCover.toFixed(row.daysCover<10?1:0)} يوم`);
}

export class InventoryPlanningLive extends React.Component<Record<string,never>,State>{
  state:State={loading:true,busy:false,error:'',snapshot:null,suppliers:[],editing:null,originalUpdatedAt:'',resetting:null,query:'',filter:'all'};

  componentDidMount():void{
    ensureInventoryPlanningStyles();
    window.addEventListener('lourex-cloud-applied',this.handleExternalRefresh);
    window.addEventListener('lourex-cloud-refresh-available',this.handleExternalRefresh);
    void this.refresh();
  }
  componentWillUnmount():void{
    window.removeEventListener('lourex-cloud-applied',this.handleExternalRefresh);
    window.removeEventListener('lourex-cloud-refresh-available',this.handleExternalRefresh);
  }
  private handleExternalRefresh=()=>void this.refresh();
  private loadSnapshot=(vault:VaultPayload)=>{
    const scoped=scopeVault(vault);
    return{snapshot:buildInventoryPlanning(scoped),suppliers:scoped.suppliers};
  };
  private refresh=async()=>{
    try{
      const session=await resumeVaultSession();
      if(!session){this.setState({loading:false,snapshot:null,suppliers:[],error:''});return;}
      this.setState({loading:false,...this.loadSnapshot(session.vault),error:''});
    }catch(error){this.setState({loading:false,error:error instanceof Error?error.message:t('Unable to load Inventory Planning.','تعذر تحميل تخطيط المخزون.')});}
  };
  private edit=(row:InventoryPlanningRow)=>{
    const policy=row.policy?structuredClone(row.policy):blankInventoryPlanningPolicy(row.item);
    this.setState({editing:policy,originalUpdatedAt:row.policy?.updatedAt??'',error:''});
  };
  private closeEditor=()=>{if(this.state.busy)return;this.setState({editing:null,originalUpdatedAt:'',error:''});};
  private set=(patch:Partial<InventoryPlanningPolicy>)=>this.setState(state=>state.editing?{editing:{...state.editing,...patch},error:''}:null);
  private save=async()=>{
    const editing=this.state.editing;if(!editing||this.state.busy)return;
    this.setState({busy:true,error:''});
    try{
      const next=await mutateVaultSafely(vault=>{
        const result=validatedInventoryPlanningUpsertEvent(vault,editing,this.state.originalUpdatedAt);
        return{...vault,documentEvents:[...vault.documentEvents,result.event]};
      });
      this.setState({busy:false,editing:null,originalUpdatedAt:'',...this.loadSnapshot(next),error:''});
    }catch(error){this.setState({busy:false,error:error instanceof Error?error.message:t('Unable to save inventory plan.','تعذر حفظ خطة المخزون.')});}
  };
  private reset=async()=>{
    const row=this.state.resetting;if(!row?.policy||this.state.busy)return;
    this.setState({busy:true,error:''});
    try{
      const next=await mutateVaultSafely(vault=>{
        const event=validatedInventoryPlanningDeleteEvent(vault,row.item.id,row.policy?.updatedAt??'');
        return{...vault,documentEvents:[...vault.documentEvents,event]};
      });
      this.setState({busy:false,resetting:null,editing:null,originalUpdatedAt:'',...this.loadSnapshot(next),error:''});
    }catch(error){this.setState({busy:false,resetting:null,error:error instanceof Error?error.message:t('Unable to reset inventory plan.','تعذر إعادة ضبط خطة المخزون.')});}
  };
  private visibleRows=():InventoryPlanningRow[]=>{
    const snapshot=this.state.snapshot;if(!snapshot)return[];
    const query=this.state.query.trim().toLowerCase();
    return snapshot.rows.filter(row=>{
      if(this.state.filter!=='all'&&row.status!==this.state.filter)return false;
      if(!query)return true;
      const haystack=[row.item.sku,row.item.descriptionEn,row.item.descriptionAr,row.item.category,row.preferredSupplier?.nameEn,row.preferredSupplier?.nameAr].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  };
  private renderSummary(snapshot:InventoryPlanningSnapshot):any{
    return <section className="lx-inventory-plan-summary" aria-label={t('Inventory planning summary','ملخص تخطيط المخزون')}>
      <div><span className="lx-inventory-plan-summary-icon is-critical"><Icon name="alert"/></span><span><small>{t('Critical','حرج')}</small><strong>{snapshot.critical}</strong><em>{t('At or below zero','الرصيد صفر أو أقل')}</em></span></div>
      <div><span className="lx-inventory-plan-summary-icon is-reorder"><Icon name="backup"/></span><span><small>{t('Reorder now','اطلب الآن')}</small><strong>{snapshot.reorder}</strong><em>{t('Reached planning trigger','وصل إلى حد إعادة الطلب')}</em></span></div>
      <div><span className="lx-inventory-plan-summary-icon is-healthy"><Icon name="check"/></span><span><small>{t('Healthy','جيد')}</small><strong>{snapshot.healthy}</strong><em>{t('Above planning trigger','فوق حد إعادة الطلب')}</em></span></div>
      <div><span className="lx-inventory-plan-summary-icon"><Icon name="settings"/></span><span><small>{t('Needs setup','بحاجة لإعداد')}</small><strong>{snapshot.unconfigured}</strong><em>{t('No planning policy yet','لا توجد سياسة تخطيط')}</em></span></div>
    </section>;
  }
  private renderRow=(row:InventoryPlanningRow):any=>{
    const configured=Boolean(row.policy),needsOrder=row.status==='critical'||row.status==='reorder';
    return <article key={row.item.id} className={`lx-inventory-plan-row is-${row.status}`}>
      <div className="lx-inventory-plan-row-main">
        <div className="lx-inventory-plan-product"><span className="lx-inventory-plan-product-icon"><Icon name="items"/></span><span><strong>{itemName(row.item)}</strong><small>{[row.item.sku,row.item.category].filter(Boolean).join(' · ')||t('Saved product','صنف محفوظ')}</small></span></div>
        <span className={`lx-inventory-plan-status is-${row.status}`}>{statusLabel(row.status)}</span>
      </div>
      <div className="lx-inventory-plan-metrics">
        <div><small>{t('On hand','المتوفر')}</small><strong>{compactQuantity(row.onHand,row)}</strong><span>{t('Current ledger balance','الرصيد الحالي من السجل')}</span></div>
        <div><small>{t('Planning trigger','حد التخطيط')}</small><strong>{configured?compactQuantity(row.reorderTrigger,row):'—'}</strong><span>{configured?t('Max of policy and lead-time demand','الأعلى بين السياسة وطلب مهلة التوريد'):t('Set a policy first','أعد السياسة أولًا')}</span></div>
        <div><small>{t('Suggested order','الطلب المقترح')}</small><strong className={needsOrder&&row.suggestedOrder!=='0'?'is-attention':''}>{configured?compactQuantity(row.suggestedOrder,row):'—'}</strong><span>{t('Suggestion only — never auto-posted','اقتراح فقط — لا يتم الترحيل تلقائيًا')}</span></div>
        <div><small>{t('90-day issue rate','معدل الصرف 90 يوم')}</small><strong>{compactQuantity(row.averageDailyIssue,row)} / {t('day','يوم')}</strong><span>{daysCoverLabel(row)}</span></div>
      </div>
      <div className="lx-inventory-plan-row-foot">
        <div><span>{t('Lead time','مهلة التوريد')}</span><b>{row.policy?`${row.policy.leadTimeDays} ${t('days','يوم')}`:'—'}</b></div>
        <div><span>{t('Preferred supplier','المورد المفضل')}</span><b>{supplierName(row.preferredSupplier)}</b></div>
        <div><span>{t('Latest posted purchase','آخر شراء مرحل')}</span><b>{row.lastPurchase?`${row.lastPurchase.number} · ${row.lastPurchase.date}`:'—'}</b></div>
        <Button icon="edit" variant={configured?'secondary':'primary'} onClick={()=>this.edit(row)}>{configured?t('Edit Policy','تعديل السياسة'):t('Set Reorder Policy','إعداد سياسة إعادة الطلب')}</Button>
      </div>
    </article>;
  };
  private renderEditor():any{
    const policy=this.state.editing;if(!policy)return null;
    const row=this.state.snapshot?.rows.find(candidate=>candidate.item.id===policy.itemId),title=row?itemName(row.item):t('Inventory policy','سياسة المخزون');
    return <Modal open={Boolean(policy)} title={t(`Planning Policy — ${title}`,`سياسة التخطيط — ${title}`)} size="lg" onClose={this.closeEditor} footer={<div className="lx-inventory-plan-modal-actions">{row?.policy?<Button variant="danger" onClick={()=>this.setState({resetting:row,editing:null,originalUpdatedAt:''})} disabled={this.state.busy}>{t('Reset Policy','إعادة ضبط السياسة')}</Button>:<span/>}<div><Button onClick={this.closeEditor} disabled={this.state.busy}>{t('Cancel','إلغاء')}</Button><Button icon="save" variant="primary" onClick={()=>void this.save()} disabled={this.state.busy}>{this.state.busy?t('Saving…','جارٍ الحفظ…'):t('Save Policy','حفظ السياسة')}</Button></div></div>}>
      <div className="lx-inventory-plan-editor-intro"><Icon name="chart"/><div><strong>{t('Deterministic planning controls','ضوابط تخطيط حتمية')}</strong><p>{t('LOUREX uses your stock ledger and issue history. It never creates a purchase, changes stock, or converts currencies automatically.','يستخدم LOUREX سجل المخزون وتاريخ الصرف فقط. لا ينشئ شراءً ولا يغير المخزون ولا يحول العملات تلقائيًا.')}</p></div></div>
      <div className="lx-inventory-plan-form-grid">
        <Field label={t('Reorder point','نقطة إعادة الطلب')} hint={t('Static minimum you choose.','حد أدنى ثابت تحدده أنت.')}><Input inputMode="decimal" value={policy.reorderPoint} placeholder="0" onChange={(e:any)=>this.set({reorderPoint:String(e.target.value)})}/></Field>
        <Field label={t('Target stock','المخزون المستهدف')} hint={t('Quantity LOUREX should plan back up to.','الكمية التي يقترح LOUREX العودة إليها.')}><Input inputMode="decimal" value={policy.targetStock} placeholder="0" onChange={(e:any)=>this.set({targetStock:String(e.target.value)})}/></Field>
        <Field label={t('Safety stock','مخزون الأمان')} hint={t('Added to lead-time demand.','يضاف إلى طلب مهلة التوريد.')}><Input inputMode="decimal" value={policy.safetyStock} placeholder="0" onChange={(e:any)=>this.set({safetyStock:String(e.target.value)})}/></Field>
        <Field label={t('Lead time (days)','مهلة التوريد (أيام)')} hint={t('Used with observed issue rate.','تستخدم مع معدل الصرف المرصود.')}><Input inputMode="numeric" type="number" min="0" max="3650" step="1" value={policy.leadTimeDays} onChange={(e:any)=>this.set({leadTimeDays:Math.max(0,Math.trunc(Number(e.target.value)||0))})}/></Field>
        <Field label={t('Preferred supplier','المورد المفضل')} hint={t('Optional. Latest posted supplier remains visible for context.','اختياري. يبقى آخر مورد من شراء مرحل ظاهرًا للسياق.')}><Select value={policy.preferredSupplierId} onChange={(e:any)=>this.set({preferredSupplierId:String(e.target.value)})}><option value="">{t('Use latest posted supplier','استخدم آخر مورد مرحل')}</option>{this.state.suppliers.map(supplier=><option key={supplier.id} value={supplier.id}>{supplierName(supplier)}</option>)}</Select></Field>
        <Field label={t('Planning notes','ملاحظات التخطيط')} className="lx-inventory-plan-notes"><Textarea rows={3} value={policy.notes} placeholder={t('MOQ, carton constraints, supplier cadence…','الحد الأدنى للطلب، قيود الكرتون، دورة المورد…')} onChange={(e:any)=>this.set({notes:String(e.target.value)})}/></Field>
      </div>
      {row?<div className="lx-inventory-plan-preview"><div><small>{t('Current on hand','المتوفر الحالي')}</small><strong>{compactQuantity(row.onHand,row)}</strong></div><div><small>{t('Observed issue rate','معدل الصرف المرصود')}</small><strong>{compactQuantity(row.averageDailyIssue,row)} / {t('day','يوم')}</strong></div><div><small>{t('Current suggested order','الطلب المقترح حاليًا')}</small><strong>{compactQuantity(row.suggestedOrder,row)}</strong></div></div>:null}
      {this.state.error?<div className="lx-inventory-plan-error" role="alert"><Icon name="alert"/><span>{this.state.error}</span></div>:null}
    </Modal>;
  }

  render():any{
    if(this.state.loading)return <section className="lx-inventory-plan-loading" role="status"><Icon name="refresh"/><span>{t('Loading inventory planning…','جارٍ تحميل تخطيط المخزون…')}</span></section>;
    const snapshot=this.state.snapshot,rows=this.visibleRows();
    if(!snapshot)return <section className="lx-inventory-plan-empty"><Icon name="alert"/><h3>{t('Inventory Planning is unavailable','تخطيط المخزون غير متاح')}</h3><p>{this.state.error||t('Unlock the workspace and try again.','افتح مساحة العمل وحاول مجددًا.')}</p><Button disabled={this.state.busy} onClick={()=>void this.refresh()}>{t('Try again','إعادة المحاولة')}</Button></section>;
    return <section className="lx-inventory-planning">
      <header className="lx-inventory-plan-heading"><div><span>{t('Inventory intelligence','ذكاء المخزون')}</span><h2>{t('Inventory Planning','تخطيط المخزون')}</h2><p>{t('Turn the existing stock ledger into clear reorder signals without automatic purchasing or hidden assumptions.','حوّل سجل المخزون الحالي إلى إشارات إعادة طلب واضحة بدون شراء تلقائي أو افتراضات مخفية.')}</p></div><div className="lx-inventory-plan-window"><Icon name="chart"/><span><small>{t('Demand window','نافذة الطلب')}</small><strong>{snapshot.lookbackDays} {t('days','يوم')}</strong></span></div></header>
      {this.renderSummary(snapshot)}
      {snapshot.unconfigured>0?<div className="lx-inventory-plan-footnote is-setup-guide"><Icon name="settings"/><p><strong>{t('First setup','الإعداد الأول')}:</strong> {t('Set Policy defines the reorder point, target stock and lead time. Opening stock is recorded through Inventory Movements; Planning never invents or posts stock automatically.','إعداد السياسة يحدد نقطة إعادة الطلب والمخزون المستهدف ومهلة التوريد. يتم تسجيل الرصيد الافتتاحي من خلال حركات المخزون؛ التخطيط لا ينشئ أو يرحّل مخزونًا تلقائيًا.')}</p></div>:null}
      <div className="lx-inventory-plan-toolbar">
        <label className="lx-inventory-plan-search"><Icon name="search"/><Input value={this.state.query} placeholder={t('Search product, SKU or supplier','ابحث عن صنف أو SKU أو مورد')} onChange={(e:any)=>this.setState({query:String(e.target.value)})}/></label>
        <Select aria-label={t('Planning status','حالة التخطيط')} value={this.state.filter} onChange={(e:any)=>this.setState({filter:e.target.value as State['filter']})}>
          <option value="all">{t('All statuses','كل الحالات')}</option><option value="critical">{t('Critical','حرج')}</option><option value="reorder">{t('Reorder','إعادة طلب')}</option><option value="healthy">{t('Healthy','جيد')}</option><option value="unconfigured">{t('Not configured','غير مهيأ')}</option>
        </Select>
      </div>
      {this.state.error&&!this.state.editing?<div className="lx-inventory-plan-error" role="alert"><Icon name="alert"/><span>{this.state.error}</span></div>:null}
      <div className="lx-inventory-plan-list">{rows.length?rows.map(this.renderRow):<div className="lx-inventory-plan-empty"><Icon name="search"/><h3>{snapshot.rows.length?t('No matching products','لا توجد أصناف مطابقة'):t('No products to plan yet','لا توجد أصناف للتخطيط بعد')}</h3><p>{snapshot.rows.length?t('Clear the search or status filter to see the rest of inventory planning.','امسح البحث أو فلتر الحالة لرؤية بقية تخطيط المخزون.'):t('Add a product before reviewing its recorded stock and planning policy.','أضف صنفًا قبل مراجعة رصيده المسجل وسياسة تخطيطه.')}</p>{this.state.query||this.state.filter!=='all'?<Button onClick={()=>this.setState({query:'',filter:'all'})}>{t('Clear filters','مسح التصفية')}</Button>:<Button onClick={()=>window.dispatchEvent(new Event('lourex-create-product'))}>{t('New Product','صنف جديد')}</Button>}</div>}</div>
      <div className="lx-inventory-plan-footnote"><Icon name="alert"/><p>{t('Planning signals use only recorded inventory movements. Purchase reversals and adjustments affect on-hand balance, while demand velocity uses issue movements only. Suggested orders are advisory and never create or post purchases automatically.','إشارات التخطيط تستخدم حركات المخزون المسجلة فقط. عكس المشتريات والتسويات يؤثران على الرصيد، بينما سرعة الطلب تعتمد على حركات الصرف فقط. الطلبات المقترحة إرشادية ولا تنشئ أو ترحّل مشتريات تلقائيًا.')}</p></div>
      {this.renderEditor()}
      <ConfirmDialog open={Boolean(this.state.resetting)} title={t('Reset inventory policy?','إعادة ضبط سياسة المخزون؟')} message={t('This removes the planning thresholds for this product. Inventory movements and purchase history are not changed.','سيؤدي هذا إلى إزالة حدود التخطيط لهذا الصنف. لن تتغير حركات المخزون أو سجل المشتريات.')} confirmLabel={t('Reset Policy','إعادة ضبط السياسة')} destructive onCancel={()=>this.setState({resetting:null})} onConfirm={()=>void this.reset()}/>
    </section>;
  }
}
