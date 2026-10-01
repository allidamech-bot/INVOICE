import type { LourexDocument, PurchaseRecord, RecurringCadence, RecurringTarget, RecurringWorkflowRecord } from '../types.js';
import { displayDate, todayIso } from '../lib/id.js';
import { getUiLanguage, t } from '../lib/i18n.js';
import { assertRecurringWorkflow, createDocumentRecurringWorkflow, createPurchaseRecurringWorkflow, recurringCadenceLabel, recurringWorkflowDue } from '../lib/recurring-workflows.js';
import { Button, Input, Modal, Select } from './UI.js';

interface Props {
  open:boolean;
  filter:'all'|RecurringTarget;
  workflows:RecurringWorkflowRecord[];
  sourceDocument:LourexDocument|null;
  sourcePurchase:PurchaseRecord|null;
  onClose:()=>void;
  onSave:(workflow:RecurringWorkflowRecord)=>Promise<void>;
  onDelete:(workflow:RecurringWorkflowRecord)=>Promise<void>;
  onGenerate:(workflow:RecurringWorkflowRecord)=>Promise<void>;
  onOpenGenerated:(target:RecurringTarget,id:string)=>void;
}

interface FormState {title:string;cadence:RecurringCadence;interval:string;nextRunDate:string;endDate:string;}
const EMPTY_FORM:FormState={title:'',cadence:'monthly',interval:'1',nextRunDate:'',endDate:''};

function sourceTitle(doc:LourexDocument|null,purchase:PurchaseRecord|null):string{return doc?.number||purchase?.number||'';}
function stateLabel(workflow:RecurringWorkflowRecord):string{
  if(!workflow.enabled)return t('Paused','متوقف');
  if(recurringWorkflowDue(workflow))return t('Due','مستحق');
  return t('Scheduled','مجدول');
}
function cadenceText(workflow:RecurringWorkflowRecord):string{
  const ar=getUiLanguage()==='ar',label=recurringCadenceLabel(workflow.cadence,ar);
  return workflow.interval===1?label:t(`Every ${workflow.interval} ${label.toLowerCase()}`,`كل ${workflow.interval} · ${label}`);
}

export function RecurringWorkflowsManager(props:Props):any{
  const {open,filter,workflows,sourceDocument,sourcePurchase,onClose,onSave,onDelete,onGenerate,onOpenGenerated}=props;
  const [form,setForm]=React.useState<FormState>(EMPTY_FORM),[editId,setEditId]=React.useState(''),[busy,setBusy]=React.useState(''),[error,setError]=React.useState('');
  const source=sourceDocument||sourcePurchase;
  React.useEffect(()=>{
    if(!open)return;
    setError('');setBusy('');setEditId('');
    const title=sourceTitle(sourceDocument,sourcePurchase);
    setForm({title,cadence:'monthly',interval:'1',nextRunDate:todayIso(),endDate:''});
  },[open,sourceDocument?.id,sourcePurchase?.id]);
  if(!open)return null;
  const visible=workflows.filter(workflow=>filter==='all'||workflow.target===filter).sort((a,b)=>a.nextRunDate.localeCompare(b.nextRunDate)||b.updatedAt.localeCompare(a.updatedAt));
  const editing=editId?workflows.find(workflow=>workflow.id===editId)??null:null;
  const canCreate=Boolean(source)&&!editId;
  const showForm=canCreate||Boolean(editing);
  const set=(key:keyof FormState,value:string)=>setForm(current=>({...current,[key]:value}));
  const edit=(workflow:RecurringWorkflowRecord)=>{setEditId(workflow.id);setError('');setForm({title:workflow.title,cadence:workflow.cadence,interval:String(workflow.interval),nextRunDate:workflow.nextRunDate,endDate:workflow.endDate});};
  const cancelEdit=()=>{setEditId('');setError('');const title=sourceTitle(sourceDocument,sourcePurchase);setForm({title,cadence:'monthly',interval:'1',nextRunDate:todayIso(),endDate:''});};
  const save=async()=>{
    if(busy)return;setBusy('save');setError('');
    try{
      const interval=Number(form.interval);
      let workflow:RecurringWorkflowRecord;
      if(editing){workflow={...editing,title:form.title.trim()||editing.sourceNumber,cadence:form.cadence,interval,nextRunDate:form.nextRunDate,endDate:form.endDate,updatedAt:new Date().toISOString()};assertRecurringWorkflow(workflow);}
      else if(sourceDocument)workflow=createDocumentRecurringWorkflow(sourceDocument,{title:form.title,cadence:form.cadence,interval,nextRunDate:form.nextRunDate,endDate:form.endDate});
      else if(sourcePurchase)workflow=createPurchaseRecurringWorkflow(sourcePurchase,{title:form.title,cadence:form.cadence,interval,nextRunDate:form.nextRunDate,endDate:form.endDate});
      else throw new Error(t('Choose a source document or purchase first.','اختر مستندًا أو عملية شراء أولًا.'));
      await onSave(workflow);cancelEdit();
    }catch(e){setError(e instanceof Error?e.message:t('Unable to save recurring workflow.','تعذر حفظ سير العمل المتكرر.'));}
    finally{setBusy('');}
  };
  const toggle=async(workflow:RecurringWorkflowRecord)=>{if(busy)return;setBusy(workflow.id);setError('');try{await onSave({...workflow,enabled:!workflow.enabled,updatedAt:new Date().toISOString()});}catch(e){setError(e instanceof Error?e.message:t('Unable to update recurring workflow.','تعذر تحديث سير العمل المتكرر.'));}finally{setBusy('');}};
  const remove=async(workflow:RecurringWorkflowRecord)=>{if(busy)return;setBusy(workflow.id);setError('');try{await onDelete(workflow);if(editId===workflow.id)cancelEdit();}catch(e){setError(e instanceof Error?e.message:t('Unable to delete recurring workflow.','تعذر حذف سير العمل المتكرر.'));}finally{setBusy('');}};
  const generate=async(workflow:RecurringWorkflowRecord)=>{if(busy)return;setBusy(workflow.id);setError('');try{await onGenerate(workflow);}catch(e){setError(e instanceof Error?e.message:t('Unable to create recurring draft.','تعذر إنشاء المسودة المتكررة.'));}finally{setBusy('');}};
  return <Modal open={open} title={t('Recurring Workflows','المهام المتكررة')} size="lg" onClose={()=>{if(!busy)onClose();}} footer={<div className="modal-footer-actions"><Button disabled={Boolean(busy)} onClick={onClose}>{t('Close','إغلاق')}</Button></div>}>
    <div className="lx-recurring-manager">
      <div className="lx-recurring-intro"><strong>{t('Drafts only','مسودات فقط')}</strong><span>{t('Recurring workflows prepare reviewable drafts. They never finalize, post, approve, or send automatically.','المهام المتكررة تُنشئ مسودات قابلة للمراجعة فقط. لا يتم الإصدار أو الترحيل أو الاعتماد أو الإرسال تلقائيًا.')}</span></div>
      {showForm?<section className="lx-recurring-form"><header><div><small>{editing?t('Edit workflow','تعديل المهمة'):t('Make recurring','جعلها متكررة')}</small><h3>{editing?editing.sourceNumber:sourceTitle(sourceDocument,sourcePurchase)}</h3></div>{editing?<Button onClick={cancelEdit}>{t('Cancel edit','إلغاء التعديل')}</Button>:null}</header><div className="lx-recurring-fields"><label><span>{t('Name','الاسم')}</span><Input value={form.title} onChange={(e:any)=>set('title',e.target.value)}/></label><label><span>{t('Frequency','التكرار')}</span><Select value={form.cadence} onChange={(e:any)=>set('cadence',e.target.value)}><option value="weekly">{t('Weekly','أسبوعي')}</option><option value="monthly">{t('Monthly','شهري')}</option><option value="quarterly">{t('Quarterly','ربع سنوي')}</option><option value="yearly">{t('Yearly','سنوي')}</option></Select></label><label><span>{t('Every','كل')}</span><Input inputMode="numeric" type="number" min="1" max="52" value={form.interval} onChange={(e:any)=>set('interval',e.target.value)}/></label><label><span>{t('Next draft date','تاريخ المسودة التالية')}</span><Input type="date" value={form.nextRunDate} onChange={(e:any)=>set('nextRunDate',e.target.value)}/></label><label><span>{t('End date (optional)','تاريخ الانتهاء (اختياري)')}</span><Input type="date" value={form.endDate} onChange={(e:any)=>set('endDate',e.target.value)}/></label></div><Button variant="primary" disabled={busy==='save'} onClick={()=>void save()}>{busy==='save'?t('Saving…','جارٍ الحفظ…'):editing?t('Save changes','حفظ التعديلات'):t('Create recurring workflow','إنشاء مهمة متكررة')}</Button></section>:null}
      {error?<p className="lx-recurring-error" role="alert">{error}</p>:null}
      <section className="lx-recurring-list"><header><div><small>{t('Manager','المدير')}</small><h3>{t('Scheduled workflows','المهام المجدولة')}</h3></div><span className="lx-recurring-count">{visible.length}</span></header>{visible.length?visible.map(workflow=>{const last=workflow.generatedRuns[workflow.generatedRuns.length-1];return <article className="lx-recurring-card" key={workflow.id}><div className="lx-recurring-card-main"><div className="lx-recurring-card-title"><strong>{workflow.title||workflow.sourceNumber}</strong><span className={`lx-recurring-state ${recurringWorkflowDue(workflow)?'is-due':workflow.enabled?'is-active':'is-paused'}`}>{stateLabel(workflow)}</span></div><div className="lx-recurring-meta"><span>{workflow.target==='document'?t('Document','مستند'):t('Purchase','شراء')} · <bdi>{workflow.sourceNumber}</bdi></span><span>{cadenceText(workflow)}</span><span>{t('Next','التالي')}: {displayDate(workflow.nextRunDate,getUiLanguage())}</span>{workflow.endDate?<span>{t('Ends','ينتهي')}: {displayDate(workflow.endDate,getUiLanguage())}</span>:null}</div>{last?<button type="button" className="lx-recurring-last" onClick={()=>onOpenGenerated(workflow.target,last.generatedId)}>{t('Last draft','آخر مسودة')}: <bdi>{last.generatedNumber}</bdi> · {displayDate(last.scheduledFor,getUiLanguage())}</button>:null}</div><div className="lx-recurring-actions">{recurringWorkflowDue(workflow)?<Button variant="primary" disabled={Boolean(busy)} onClick={()=>void generate(workflow)}>{busy===workflow.id?t('Creating…','جارٍ الإنشاء…'):t('Create due draft','إنشاء المسودة المستحقة')}</Button>:null}<Button disabled={Boolean(busy)} onClick={()=>edit(workflow)}>{t('Edit','تعديل')}</Button><Button disabled={Boolean(busy)} onClick={()=>void toggle(workflow)}>{workflow.enabled?t('Pause','إيقاف مؤقت'):t('Resume','استئناف')}</Button><Button variant="danger" disabled={Boolean(busy)} onClick={()=>void remove(workflow)}>{t('Delete','حذف')}</Button></div></article>;}):<div className="lx-recurring-empty">{t('No recurring workflows here yet.','لا توجد مهام متكررة هنا بعد.')}</div>}</section>
    </div>
  </Modal>;
}
