/**
 * R06 standalone UI PREVIEW. Deliberately not imported by the legacy app.
 * No API, Firebase, provider, financial writer or approval authority here.
 * All callbacks must be bound to a future authenticated R07 server coordinator.
 */
import type {AuthenticatedScope,ReviewDraft} from '../domain/contracts.js';
import type {DraftEditorChange} from '../guarded-finance/drafts.js';
import {
  R06_NEXT_CONVERSATION_ENABLED,R06_MAX_VISIBLE_MESSAGES,
  R06_MAX_ATTACHMENTS_PER_SELECTION,assertR06Scope,r06DocumentState,
  r06DocumentLabel,r06ObservedProgress,r06DraftBlockers,r06VisibleMemories,
  type R06ConversationView,type R06Message,
} from './view-model.js';

export interface R06WorkspaceProps {
  // Trusted from the host auth boundary, not a user-supplied permission selector.
  scope:AuthenticatedScope;
  view:R06ConversationView;
  mode:'advisor'|'controller';
  onModeChange:(mode:'advisor'|'controller')=>void;
  onSend:(input:{
    text:string;mode:'advisor'|'controller';sourceIds:string[];
    signal:AbortSignal;
  })=>Promise<{accepted:boolean}>;
  onSelectFiles:(files:File[])=>Promise<void>;
  onSelectSource:(sourceId:string,selected:boolean)=>void;
  onEditDraft:(change:DraftEditorChange,expectedRevision:number)=>Promise<void>;
  onUndoDraft:(expectedRevision:number)=>Promise<void>;
  onRedoDraft:(expectedRevision:number)=>Promise<void>;
  onDiscardDraft:(draftId:string,expectedRevision:number)=>Promise<void>;
  onRequestReview:(draftId:string,expectedRevision:number)=>Promise<void>;
  onCancelTask:(taskId:string)=>Promise<void>;
  onRetryTask:(taskId:string)=>Promise<void>;
  onLoadOlder?:()=>Promise<void>;
  onRevokeMemory:(memoryId:string)=>Promise<void>;
}

const surface:Record<string,unknown>={
  background:'#f8faf8',color:'#142a2a',fontFamily:'inherit',
  borderRadius:16,border:'1px solid #d7e3df',
};
const control:Record<string,unknown>={
  font:'inherit',padding:'10px 12px',minHeight:42,borderRadius:10,
  background:'#fff',border:'1px solid #bad0c9',color:'#143a37',
};
const action:Record<string,unknown>={...control,cursor:'pointer'};
const secondary:Record<string,unknown>={fontSize:13,color:'#536961'};
const title:Record<string,unknown>={fontSize:16,fontWeight:700,margin:'0 0 10px'};
const focusRing={borderColor:'#007d70',boxShadow:'0 0 0 2px rgba(0,125,112,.28)',outline:'none'};

type ComposerProps=Pick<R06WorkspaceProps,'mode'|'onSend'> & {sourceIds:string[]};
interface ComposerState {text:string;focused:boolean;sending:boolean;error:string|null}
class R06Composer extends React.Component<ComposerProps,ComposerState>{
  state:ComposerState={text:'',focused:false,sending:false,error:null};
  private composing=false;
  private live=true;
  private activeAbort:AbortController|null=null;
  componentWillUnmount():void{this.live=false;this.activeAbort?.abort();}
  private submit=async()=>{
    if(this.state.sending||this.composing||!this.state.text.trim())return;
    const value=this.state.text;
    const controller=new AbortController();this.activeAbort=controller;
    this.setState({sending:true,error:null});
    try{
      const response=await this.props.onSend({
        text:value,mode:this.props.mode,sourceIds:[...this.props.sourceIds],
        signal:controller.signal,
      });
      // Accepted means coordinator acknowledged the turn, NOT a saved invoice.
      if(this.live)this.setState({
        sending:false,text:response?.accepted?'':value,
        error:response?.accepted?null:'لم يُؤكد استقبال الرسالة. لم تُحذف المسودة.',
      });
    }catch{
      if(this.live)this.setState({
        sending:false,error:'تعذر تأكيد الإرسال. بقي النص محفوظاً في حقل الكتابة.',
      });
    }finally{if(this.activeAbort===controller)this.activeAbort=null;}
  };
  render():any{return <form dir="rtl" aria-label="كتابة رسالة"
      onSubmit={(e:any)=>{e.preventDefault();void this.submit();}}
      style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap',padding:12,
        background:'#fff',borderTop:'1px solid #d7e3df'}}>
      <label style={{display:'block',flex:'1 1 230px',minWidth:0}}>
        <span style={{...secondary,display:'block',marginBottom:5}}>رسالتك</span>
        <textarea aria-label="رسالتك إلى LOUREX AI" rows={2}
          value={this.state.text}
          onChange={(e:any)=>this.setState({text:e.currentTarget.value})}
          onCompositionStart={()=>{this.composing=true;}}
          onCompositionEnd={()=>{this.composing=false;}}
          onFocus={()=>this.setState({focused:true})}
          onBlur={()=>this.setState({focused:false})}
          onKeyDown={(e:any)=>{
            if(e.key==='Enter'&&!e.shiftKey&&!this.composing&&!e.nativeEvent?.isComposing){
              e.preventDefault();void this.submit();
            }
          }}
          disabled={this.state.sending}
          placeholder="اكتب طلبك بالعربية أو الإنجليزية..."
          dir="auto"
          style={{...control,width:'100%',boxSizing:'border-box',
            minHeight:64,maxHeight:160,resize:'vertical',
            textAlign:'start',unicodeBidi:'plaintext',
            ...(this.state.focused?focusRing:{outline:'none'})}}/>
      </label>
      <button type="submit" style={{...action,background:'#006d63',color:'#fff',
        minWidth:78}} disabled={this.state.sending||!this.state.text.trim()}>
        {this.state.sending?'جاري الإرسال':'إرسال'}
      </button>
      {this.state.error&&<p role="alert" style={{color:'#a22d2d',width:'100%',margin:0}}>
        {this.state.error}</p>}
    </form>;}
}
class R06MessageFeed extends React.Component<{messages:readonly R06Message[];
  onLoadOlder?:()=>Promise<void>},{showCount:number}>{
  state={showCount:R06_MAX_VISIBLE_MESSAGES};
  shouldComponentUpdate(nextProps:Readonly<{messages:readonly R06Message[];
    onLoadOlder?:()=>Promise<void>}>,nextState:Readonly<{showCount:number}>):boolean{
    return nextProps.messages!==this.props.messages||nextState.showCount!==this.state.showCount;
  }
  render():any{
    const messages=this.props.messages;
    const shown=messages.slice(Math.max(0,messages.length-this.state.showCount));
    return <section aria-label="المحادثة" role="log" aria-live="polite"
      style={{padding:12,overflowY:'auto',flex:'1 1 auto',minHeight:180,maxHeight:'60vh'}}>
      {messages.length>shown.length&&<button type="button"
        style={action} onClick={()=>{
          this.setState(s=>({showCount:s.showCount+R06_MAX_VISIBLE_MESSAGES}));
          if(this.props.onLoadOlder)void this.props.onLoadOlder();
        }}>إظهار رسائل أقدم</button>}
      {shown.map(message=><article key={message.messageId}
        style={{maxWidth:'92%',margin:message.role==='user'?'12px 0 12px auto':'12px auto 12px 0',
          background:message.role==='user'?'#e5f3ef':'#fff',
          border:'1px solid #d8e6e1',borderRadius:12,padding:12}}>
        <strong style={secondary}>{message.role==='user'?'أنت':'LOUREX AI'}</strong>
        <p dir="auto" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',
          unicodeBidi:'plaintext',margin:'7px 0'}}>{message.text}</p>
        {message.sourceIds.length>0&&<small style={secondary}>
          المصادر: {message.sourceIds.join('، ')}</small>}
      </article>)}
      {!shown.length&&<p style={secondary}>لا توجد رسائل في هذه المحادثة.</p>}
    </section>;
  }
}
interface DraftState {
  lineId:string;description:string;quantity:string;unit:string;
  price:string;currency:string;customer:string;busy:boolean;error:string|null;
}
const selectedLine=(d:ReviewDraft,id:string)=>d.lineItems.find(x=>x.lineId===id);
class R06DraftReview extends React.Component<{
  draft:ReviewDraft;
  onEdit:R06WorkspaceProps['onEditDraft'];
  onUndo:R06WorkspaceProps['onUndoDraft'];
  onRedo:R06WorkspaceProps['onRedoDraft'];
  onDiscard:R06WorkspaceProps['onDiscardDraft'];
  onReview:R06WorkspaceProps['onRequestReview'];
},DraftState>{
  constructor(props:any){
    super(props);this.state=this.snapshot(props.draft,props.draft.lineItems[0]?.lineId??'');
  }
  private snapshot(d:ReviewDraft,lineId:string):DraftState{
    const l=selectedLine(d,lineId)??d.lineItems[0];
    return {lineId:l?.lineId??'',description:l?.description??'',
      quantity:l?.quantity??'',unit:l?.unit??'',price:l?.sellingUnitPrice??'',
      currency:d.currency??'',customer:d.explicitCustomerId??'',busy:false,error:null};
  }
  componentDidUpdate(previous:Readonly<{draft:ReviewDraft}>):void{
    if(this.props.draft.draftId!==previous.draft.draftId||
      this.props.draft.draftRevision!==previous.draft.draftRevision)
      this.setState(this.snapshot(this.props.draft,this.state.lineId));
  }
  private saveLine=async()=>{
    const {draft}=this.props,{lineId}=this.state;if(!lineId||this.state.busy)return;
    const patch={
      description:this.state.description,quantity:this.state.quantity||null,
      unit:this.state.unit||null,sellingUnitPrice:this.state.price||null,
      currency:this.state.currency||null,
    };
    this.setState({busy:true,error:null});
    try{await this.props.onEdit({kind:'line_patch',lineId,patch},draft.draftRevision);}
    catch{this.setState({error:'لم يتم تأكيد تعديل السطر. راجع النسخة الحالية.'});}
    finally{this.setState({busy:false});}
  };
  render():any{
    const d=this.props.draft,issues=r06DraftBlockers(d),line=selectedLine(d,this.state.lineId);
    return <section aria-label="مراجعة المسودة" style={{...surface,padding:12}}>
      <h3 style={title}>مسودة عرض سعر غير محفوظة — مراجعة {d.draftRevision}</h3>
      <p style={secondary}>تعديل المسودة لا ينشئ فاتورة أو عرض سعر محفوظاً.
        عدد الأصناف: {d.lineItems.length} / 120</p>
      <p style={secondary}>العملة: {d.currency??'غير محددة'} · العميل:
        {d.explicitCustomerId??'غير محدد'}</p>
      {issues.length>0&&<p role="status" style={{color:'#98552a'}}>
        متطلبات المراجعة: {issues.join('، ')}</p>}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
        <button type="button" style={action} disabled={this.state.busy}
          onClick={()=>void this.props.onUndo(d.draftRevision)}>تراجع</button>
        <button type="button" style={action} disabled={this.state.busy}
          onClick={()=>void this.props.onRedo(d.draftRevision)}>إعادة</button>
        <button type="button" style={action} disabled={this.state.busy}
          onClick={()=>void this.props.onDiscard(d.draftId,d.draftRevision)}>إلغاء المسودة</button>
      </div>
      <label style={secondary}>اختر السطر للتعديل
        <select style={{...control,display:'block',width:'100%'}} value={this.state.lineId}
          onChange={(e:any)=>this.setState(this.snapshot(d,e.currentTarget.value))}>
          <option value="">اختر...</option>
          {d.lineItems.map((l,i)=><option key={l.lineId} value={l.lineId}>
            {i+1}. {l.description}</option>)}
        </select>
      </label>
      {line&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',
        gap:8,marginTop:10}}>
        {([
          ['description','الوصف'],['quantity','الكمية'],['unit','الوحدة'],
          ['price','سعر البيع'],['currency','العملة'],
        ] as const).map(([field,label])=><label key={field} style={secondary}>
          {label}<input dir={field==='description'?'auto':'ltr'} style={{
            ...control,width:'100%',boxSizing:'border-box',display:'block'}}
            value={this.state[field]}
            onChange={(e:any)=>this.setState({[field]:e.currentTarget.value} as any)}/>
        </label>)}
        <div style={{gridColumn:'1 / -1',...secondary}}>
          أدلة السطر: {line.evidenceRefs.length?line.evidenceRefs.join('، '):'لا توجد أدلة'}
        </div>
        <button type="button" style={action} disabled={this.state.busy}
          onClick={()=>void this.saveLine()}>حفظ تعديل هذا السطر فقط</button>
      </div>}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
        <label style={secondary}>معرّف العميل
          <input style={{...control,display:'block'}} value={this.state.customer}
            onChange={(e:any)=>this.setState({customer:e.currentTarget.value})}/>
        </label>
        <button type="button" style={action} disabled={this.state.busy}
          onClick={()=>void this.props.onEdit({
            kind:'set_customer',customerId:this.state.customer||null},d.draftRevision)}>
          تحديث العميل</button>
        <button type="button" style={action} disabled={this.state.busy}
          onClick={()=>void this.props.onEdit({
            kind:'set_currency',currency:this.state.currency||null},d.draftRevision)}>
          تحديث العملة</button>
      </div>
      {this.state.error&&<p role="alert" style={{color:'#a22d2d'}}>{this.state.error}</p>}
      <div style={{marginTop:12,borderTop:'1px solid #d7e3df',paddingTop:12}}>
        <strong>المعاينة المرجعية</strong>
        <div role="list">{d.lineItems.map((l,i)=><p role="listitem" key={l.lineId}
          dir="auto" style={{fontSize:13,whiteSpace:'pre-wrap'}}>
          {i+1}. {l.description} — {l.quantity??'؟'} {l.unit??'؟'} ×
          {l.sellingUnitPrice??'سعر ناقص'} {l.currency??''}
        </p>)}</div>
        <p style={secondary}>هذه ليست معاينة PDF مالية نهائية؛ الإخراج النهائي حصرياً في
          المحرر المالي المعتمد.</p>
        <button type="button" style={action}
          disabled={this.state.busy||issues.length>0}
          onClick={()=>void this.props.onReview(d.draftId,d.draftRevision)}>
          طلب مراجعة الموافقة من الخادم
        </button>
        <p style={secondary}>لا توجد هنا موافقة موقّعة أو صلاحية حفظ مالي.</p>
      </div>
    </section>;
  }
}

export function NextConversationWorkspace(props:R06WorkspaceProps):any{
  // Static safety gate: not a product setting and never activated by request params.
  if(!R06_NEXT_CONVERSATION_ENABLED)return null;
  try{assertR06Scope(props.view,props.scope);}catch{
    return <p role="alert">تعذّر التحقق من نطاق المحادثة.</p>;
  }
  const view=props.view,selected=view.attachments.filter(a=>a.selected).map(a=>a.sourceId);
  const observed=r06ObservedProgress(view.currentTask);
  const task=view.currentTask;
  const active=task&&!['completed','failed','cancelled'].includes(task.state);
  return <main dir="rtl" lang="ar" aria-label="LOUREX AI Next Generation"
    style={{...surface,display:'flex',flexDirection:'column',maxWidth:1200,
      margin:'0 auto',minHeight:520,overflow:'hidden'}}>
    <header style={{padding:14,display:'flex',gap:10,justifyContent:'space-between',
      alignItems:'center',flexWrap:'wrap',borderBottom:'1px solid #d7e3df'}}>
      <div><h2 style={{...title,margin:0}}>LOUREX AI</h2>
        <span style={secondary}>واجهة تجريبية — دون عمليات حفظ مالي</span></div>
      <div role="group" aria-label="وضع المساعد" style={{display:'flex',gap:5}}>
        <button type="button" style={{...action,
          background:props.mode==='advisor'?'#d8eee7':'#fff'}}
          onClick={()=>props.onModeChange('advisor')}>المستشار (قراءة)</button>
        <button type="button" style={{...action,
          background:props.mode==='controller'?'#d8eee7':'#fff'}}
          onClick={()=>props.onModeChange('controller')}>المتحكم (إعداد)</button>
      </div>
    </header>
    <R06MessageFeed messages={view.messages} onLoadOlder={props.onLoadOlder}/>
    {task&&<section aria-label="حالة المهمة" role="status"
      style={{padding:12,borderTop:'1px solid #d7e3df',background:'#eef5f2'}}>
      <strong>الحالة: {task.state}</strong>
      {observed&&<span style={{marginInlineStart:8}}>{observed}</span>}
      {task.lastError&&<p role="alert">{task.lastError.userMessage}</p>}
      {active&&task.cancellable&&<button type="button" style={action}
        onClick={()=>void props.onCancelTask(task.taskId)}>طلب إلغاء المهمة</button>}
      {task.retryPolicy==='safe_only'&&['recoverable','failed'].includes(task.state)&&
        <button type="button" style={action}
          onClick={()=>void props.onRetryTask(task.taskId)}>محاولة استعادة آمنة</button>}
    </section>}
    <section aria-label="مرفقات المحادثة" style={{padding:12}}>
      <h3 style={title}>الملفات والمصادر ({view.attachments.length})</h3>
      <input type="file" multiple accept=".pdf,.xlsx,.xls,.csv,image/*"
        aria-label="إضافة ملفات" onChange={(e:any)=>{
          const files=Array.from(e.currentTarget.files??[]) as File[];
          if(files.length>0&&files.length<=R06_MAX_ATTACHMENTS_PER_SELECTION)
            void props.onSelectFiles(files);
          e.currentTarget.value='';
        }}/>
      <p style={secondary}>يمكن اختيار حتى 10 ملفات في المرة. رفع الملف لا يعني
        أن البيانات قد فُهمت أو أصبحت جاهزة للعرض.</p>
      {view.attachments.map(a=><div key={a.sourceId} style={{...surface,padding:8,marginTop:6}}>
        <label style={{display:'flex',gap:8,alignItems:'center'}}>
          <input type="checkbox" checked={a.selected}
            onChange={(e:any)=>props.onSelectSource(a.sourceId,e.currentTarget.checked)}/>
          <span dir="auto" style={{overflowWrap:'anywhere'}}>{a.fileName} ({a.format})</span>
        </label>
        <p role="status" style={{...secondary,margin:'5px 0'}}>
          {r06DocumentLabel(r06DocumentState(a))}
          {a.coverage?.expectedPageCount!==null&&a.coverage?.expectedPageCount!==undefined&&
            ' — الصفحات: '+(a.coverage.observedPageCount??0)+' / '+a.coverage.expectedPageCount}
        </p>
        {a.errorCode&&<small role="alert">{a.errorCode}</small>}
      </div>)}
    </section>
    {view.draft&&<R06DraftReview draft={view.draft}
      onEdit={props.onEditDraft} onUndo={props.onUndoDraft}
      onRedo={props.onRedoDraft} onDiscard={props.onDiscardDraft}
      onReview={props.onRequestReview}/>}
    <section aria-label="الذاكرة المعتمدة" style={{padding:12}}>
      <details>
        <summary>الذاكرة والسجل</summary>
        {r06VisibleMemories(view,new Date().toISOString()).map(m=>
          <div key={m.memoryId} style={{display:'flex',gap:8,padding:8}}>
            <p dir="auto" style={{flex:1}}>{m.text}</p>
            <button type="button" style={action}
              onClick={()=>void props.onRevokeMemory(m.memoryId)}>إلغاء التذكر</button>
          </div>)}
        <p style={secondary}>لا تُضاف الذاكرة دون موافقة مثبتة. لا يوجد هنا
          تخزين محلي دائم أو استرجاع متعدد الأجهزة.</p>
      </details>
    </section>
    <R06Composer mode={props.mode} sourceIds={selected} onSend={props.onSend}/>
  </main>;
}
