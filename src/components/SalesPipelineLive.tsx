import type { Customer, LourexDocument } from '../types.js';
import { isArabic, t } from '../lib/i18n.js';
import { resumeVaultSession } from '../storage/vault.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { blankOpportunity, buildSalesPipeline, documentsForOpportunity, pipelineStageLabel, PIPELINE_STAGES, validatedOpportunityDeleteEvent, validatedOpportunityUpsertEvent, type SalesOpportunity, type SalesPipelineSnapshot } from '../lib/sales-pipeline.js';
import { ensureSalesPipelineStyles } from '../lib/sales-pipeline-style.js';
import { Button, ConfirmDialog, Field, Icon, Input, Modal, Select, Textarea } from './UI.js';

interface Props{onShowDirectory:()=>void;}
interface State{
  loading:boolean;
  busy:boolean;
  error:string;
  snapshot:SalesPipelineSnapshot|null;
  customers:Customer[];
  documents:LourexDocument[];
  editing:SalesOpportunity|null;
  originalUpdatedAt:string;
  deleting:SalesOpportunity|null;
}

function customerName(customer:Customer):string{return(isArabic()?(customer.companyNameAr||customer.companyNameEn):(customer.companyNameEn||customer.companyNameAr)).trim()||t('Unnamed customer','عميل بدون اسم');}
function moneyLabel(opportunity:SalesOpportunity):string{return opportunity.amount&&opportunity.currency?`${opportunity.amount} ${opportunity.currency}`:t('Value not recorded','القيمة غير مسجلة');}
function displayDate(value:string):string{return value||t('No date','بدون تاريخ');}

export class SalesPipelineLive extends React.Component<Props,State>{
  state:State={loading:true,busy:false,error:'',snapshot:null,customers:[],documents:[],editing:null,originalUpdatedAt:'',deleting:null};

  componentDidMount():void{
    ensureSalesPipelineStyles();
    window.addEventListener('lourex-cloud-applied',this.handleExternalRefresh);
    window.addEventListener('lourex-cloud-refresh-available',this.handleExternalRefresh);
    void this.refresh();
  }
  componentWillUnmount():void{
    window.removeEventListener('lourex-cloud-applied',this.handleExternalRefresh);
    window.removeEventListener('lourex-cloud-refresh-available',this.handleExternalRefresh);
  }
  private handleExternalRefresh=()=>void this.refresh();
  private refresh=async()=>{
    try{
      const session=await resumeVaultSession();
      if(!session){this.setState({loading:false,snapshot:null,customers:[],documents:[]});return;}
      this.setState({loading:false,snapshot:buildSalesPipeline(session.vault),customers:session.vault.customers,documents:session.vault.documents,error:''});
    }catch(error){this.setState({loading:false,error:error instanceof Error?error.message:t('Unable to load Pipeline.','تعذر تحميل خط المبيعات.')});}
  };
  private newOpportunity=()=>{
    const customer=this.state.customers[0];
    if(!customer){this.setState({error:t('Add a customer before creating an opportunity.','أضف عميلًا قبل إنشاء فرصة بيع.')});return;}
    this.setState({editing:blankOpportunity(customer),originalUpdatedAt:'',error:''});
  };
  private edit=(opportunity:SalesOpportunity)=>this.setState({editing:structuredClone(opportunity),originalUpdatedAt:opportunity.updatedAt,error:''});
  private closeEditor=()=>{if(this.state.busy)return;this.setState({editing:null,originalUpdatedAt:'',error:''});};
  private set=(patch:Partial<SalesOpportunity>)=>this.setState(state=>state.editing?{editing:{...state.editing,...patch}} as any:null as any);
  private chooseCustomer=(customerId:string)=>{
    const customer=this.state.customers.find(row=>row.id===customerId);if(!customer)return;
    this.setState(state=>state.editing?{editing:{...state.editing,customerId,currency:state.editing.currency||customer.preferredCurrency||'',linkedDocumentIds:[]}} as any:null as any);
  };
  private toggleDocument=(id:string)=>{
    this.setState(state=>{
      if(!state.editing)return null as any;
      const linked=state.editing.linkedDocumentIds.includes(id)?state.editing.linkedDocumentIds.filter(value=>value!==id):[...state.editing.linkedDocumentIds,id];
      return{editing:{...state.editing,linkedDocumentIds:linked}} as any;
    });
  };
  private save=async()=>{
    const editing=this.state.editing;if(!editing||this.state.busy)return;
    this.setState({busy:true,error:''});
    try{
      let saved:SalesOpportunity|null=null;
      const next=await mutateVaultSafely(vault=>{
        const result=validatedOpportunityUpsertEvent(vault,editing,this.state.originalUpdatedAt);saved=result.opportunity;
        return{...vault,documentEvents:[...vault.documentEvents,result.event]};
      });
      this.setState({busy:false,editing:null,originalUpdatedAt:'',snapshot:buildSalesPipeline(next),customers:next.customers,documents:next.documents,error:''});
      void saved;
    }catch(error){this.setState({busy:false,error:error instanceof Error?error.message:t('Unable to save opportunity.','تعذر حفظ فرصة البيع.')});}
  };
  private remove=async()=>{
    const opportunity=this.state.deleting;if(!opportunity||this.state.busy)return;
    this.setState({busy:true,error:''});
    try{
      const next=await mutateVaultSafely(vault=>{
        const event=validatedOpportunityDeleteEvent(vault,opportunity.id,opportunity.updatedAt);
        return{...vault,documentEvents:[...vault.documentEvents,event]};
      });
      this.setState({busy:false,deleting:null,snapshot:buildSalesPipeline(next),customers:next.customers,documents:next.documents,error:''});
    }catch(error){this.setState({busy:false,deleting:null,error:error instanceof Error?error.message:t('Unable to delete opportunity.','تعذر حذف فرصة البيع.')});}
  };
  private editor=()=>{
    const opportunity=this.state.editing;if(!opportunity)return null;
    const documents=documentsForOpportunity(this.state.documents,opportunity.customerId).slice(0,30);
    return <Modal open title={this.state.originalUpdatedAt?t('Edit Opportunity','تعديل فرصة البيع'):t('New Opportunity','فرصة بيع جديدة')} size="lg" onClose={this.closeEditor} footer={<div className="modal-footer-actions"><Button disabled={this.state.busy} onClick={this.closeEditor}>{t('Cancel','إلغاء')}</Button><Button variant="primary" disabled={this.state.busy} onClick={()=>void this.save()}>{this.state.busy?t('Saving…','جارٍ الحفظ…'):t('Save Opportunity','حفظ الفرصة')}</Button></div>}>
      <div className="lx-opportunity-form" dir={isArabic()?'rtl':'ltr'}>
        <div className="lx-opportunity-grid">
          <Field label={t('Customer','العميل')}><Select value={opportunity.customerId} onChange={(event:any)=>this.chooseCustomer(event.target.value)}>{this.state.customers.map(customer=><option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</Select></Field>
          <Field label={t('Stage','المرحلة')}><Select value={opportunity.stage} onChange={(event:any)=>this.set({stage:event.target.value as SalesOpportunity['stage']})}>{PIPELINE_STAGES.map(stage=><option key={stage} value={stage}>{pipelineStageLabel(stage,isArabic()?'ar':'en')}</option>)}</Select></Field>
          <Field className="lx-opportunity-wide" label={t('Opportunity title','اسم الفرصة')}><Input value={opportunity.title} onChange={(event:any)=>this.set({title:event.target.value})}/></Field>
          <Field label={t('Opportunity value','قيمة الفرصة')}><Input inputMode="decimal" placeholder="0.00" value={opportunity.amount} onChange={(event:any)=>this.set({amount:event.target.value})}/></Field>
          <Field label={t('Currency','العملة')}><Input maxLength={8} value={opportunity.currency} onChange={(event:any)=>this.set({currency:event.target.value.toUpperCase()})}/></Field>
          <Field label={t('Expected close','الإغلاق المتوقع')}><Input type="date" value={opportunity.expectedCloseDate} onChange={(event:any)=>this.set({expectedCloseDate:event.target.value})}/></Field>
          <Field className="lx-opportunity-wide" label={t('Next action','الإجراء القادم')}><Input value={opportunity.nextAction} placeholder={t('Example: call buyer on Thursday','مثال: الاتصال بالمشتري يوم الخميس')} onChange={(event:any)=>this.set({nextAction:event.target.value})}/></Field>
          {opportunity.stage==='lost'?<Field className="lx-opportunity-wide" label={t('Loss reason','سبب الخسارة')}><Input value={opportunity.lostReason} onChange={(event:any)=>this.set({lostReason:event.target.value})}/></Field>:null}
          <Field className="lx-opportunity-wide" label={t('Notes','ملاحظات')}><Textarea rows="4" value={opportunity.notes} onChange={(event:any)=>this.set({notes:event.target.value})}/></Field>
        </div>
        <section className="lx-opportunity-documents">
          <strong>{t('Linked documents','المستندات المرتبطة')}</strong>
          <span className="lx-pipeline-note">{t('Link only documents that belong to this customer. Pipeline status never changes document lifecycle.','اربط فقط مستندات هذا العميل. حالة فرصة البيع لا تغيّر دورة حياة المستند.')}</span>
          {documents.length?<div className="lx-opportunity-documents-list">{documents.map(document=><label key={document.id}><input type="checkbox" checked={opportunity.linkedDocumentIds.includes(document.id)} onChange={()=>this.toggleDocument(document.id)}/><span><strong>{document.number}</strong><small> · {document.kind}</small></span></label>)}</div>:<small>{t('No active customer documents to link.','لا توجد مستندات عميل فعالة للربط.')}</small>}
        </section>
        {this.state.error?<div className="lx-pipeline-error" role="alert">{this.state.error}</div>:null}
      </div>
    </Modal>;
  };
  render():any{
    const snapshot=this.state.snapshot;const opportunities=snapshot?.opportunities??[];
    const customerById=new Map(this.state.customers.map(customer=>[customer.id,customer]));
    const openCount=opportunities.filter(row=>row.stage!=='won'&&row.stage!=='lost').length;
    return <section className="lx-pipeline-page" dir={isArabic()?'rtl':'ltr'}>
      <div className="lx-pipeline-tabs" role="tablist" aria-label={t('Customer workspace','مساحة العملاء')}><button type="button" role="tab" aria-selected="false" onClick={this.props.onShowDirectory}>{t('Directory','الدليل')}</button><button type="button" role="tab" aria-selected="true" className="is-active">{t('Pipeline','خط المبيعات')}</button></div>
      <header className="lx-pipeline-topbar"><div className="lx-pipeline-heading"><small>{t('Sales & Relationships','المبيعات والعلاقات')}</small><h1>{t('Sales Pipeline','خط المبيعات')}</h1><p>{t('Track opportunities from first contact to won or lost without changing invoices, quotations or accounting records.','تابع فرص البيع من أول تواصل حتى الفوز أو الخسارة بدون تغيير الفواتير أو عروض الأسعار أو السجلات المحاسبية.')}</p></div><Button icon="plus" variant="primary" onClick={this.newOpportunity}>{t('New Opportunity','فرصة جديدة')}</Button></header>
      {this.state.error&&!this.state.editing?<div className="lx-pipeline-error" role="alert">{this.state.error}</div>:null}
      <section className="lx-pipeline-summary" aria-label={t('Pipeline summary','ملخص خط المبيعات')}>
        <div className="lx-pipeline-stat"><small>{t('Open opportunities','الفرص المفتوحة')}</small><strong>{openCount}</strong></div>
        <div className="lx-pipeline-stat"><small>{t('Won','تم الفوز')}</small><strong>{snapshot?.wonCount??0}</strong></div>
        <div className="lx-pipeline-stat"><small>{t('Lost','تم الخسارة')}</small><strong>{snapshot?.lostCount??0}</strong></div>
        <div className="lx-pipeline-stat"><small>{t('Open value by currency','القيمة المفتوحة حسب العملة')}</small><div className="lx-pipeline-values">{snapshot?.openValues.length?snapshot.openValues.map(row=><span key={row.currency}>{row.amount.toFixed(2)} {row.currency}</span>):<strong>—</strong>}</div></div>
      </section>
      {this.state.loading?<div className="lx-pipeline-empty"><Icon name="refresh"/><strong>{t('Loading Pipeline…','جارٍ تحميل خط المبيعات…')}</strong></div>:<div className="lx-pipeline-board" aria-label={t('Opportunity stages','مراحل فرص البيع')}>{PIPELINE_STAGES.map(stage=>{
        const rows=opportunities.filter(row=>row.stage===stage);return <section className="lx-pipeline-column" key={stage}><header><strong>{pipelineStageLabel(stage,isArabic()?'ar':'en')}</strong><span>{rows.length}</span></header>{rows.length?rows.map(opportunity=>{
          const customer=customerById.get(opportunity.customerId);return <button type="button" className="lx-opportunity-card" key={opportunity.id} onClick={()=>this.edit(opportunity)}><h3>{opportunity.title}</h3><span className="lx-opportunity-customer">{customer?customerName(customer):t('Customer unavailable','العميل غير متاح')}</span><div className="lx-opportunity-meta"><span>{moneyLabel(opportunity)}</span>{opportunity.expectedCloseDate?<span>{displayDate(opportunity.expectedCloseDate)}</span>:null}{opportunity.linkedDocumentIds.length?<span>{opportunity.linkedDocumentIds.length} {t('docs','مستند')}</span>:null}</div>{opportunity.nextAction?<span className="lx-opportunity-next"><b>{t('Next','التالي')}:</b> {opportunity.nextAction}</span>:null}</button>;
        }):<div className="lx-pipeline-empty"><small>{t('No opportunities','لا توجد فرص')}</small></div>}</section>;
      })}</div>}
      {snapshot?.nextActions.length?<section className="lx-pipeline-next-actions"><header><div><small>{t('Follow-up','المتابعة')}</small><h2>{t('Next actions','الإجراءات القادمة')}</h2></div></header><div className="lx-pipeline-next-list">{snapshot.nextActions.map(opportunity=><div className="lx-pipeline-next-item" key={opportunity.id}><strong>{opportunity.title}</strong><span>{opportunity.nextAction}</span><small>{opportunity.expectedCloseDate?`${t('Expected close','الإغلاق المتوقع')}: ${opportunity.expectedCloseDate}`:t('No close date','لا يوجد تاريخ إغلاق')}</small></div>)}</div></section>:null}
      <p className="lx-pipeline-note">{t('LOUREX AI may summarize pipeline context, but stage, value and won/lost decisions remain user-controlled. Currencies are never silently converted.','يمكن لذكاء LOUREX تلخيص سياق خط المبيعات، لكن المرحلة والقيمة وقرارات الفوز/الخسارة تبقى بيد المستخدم. لا يتم تحويل العملات بشكل مخفي.')}</p>
      {this.editor()}
      <ConfirmDialog open={Boolean(this.state.deleting)} title={t('Delete opportunity?','حذف فرصة البيع؟')} message={t('The current opportunity will disappear from Pipeline. Its encrypted history remains in the local audit event stream.','ستختفي فرصة البيع الحالية من خط المبيعات، بينما يبقى سجلها المشفر ضمن سجل الأحداث المحلي.')} onCancel={()=>{if(!this.state.busy)this.setState({deleting:null});}} onConfirm={()=>void this.remove()}/>
      {this.state.editing&&this.state.originalUpdatedAt?<div style={{display:'none'}} aria-hidden="true"><button type="button" onClick={()=>this.setState({deleting:this.state.editing})}>delete</button></div>:null}
    </section>;
  }
}
