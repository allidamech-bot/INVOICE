import { workspaceText, workspaceError } from '../lib/ai-workspace-presentation.js';
import { KnowledgeWorkspace, ReliabilityWorkspace, DiagnosticsWorkspace } from './AiReliabilityWorkspace.js';
import { strictAiActor } from '../lib/ai-foundation-approval.js';
import { CommercialWorkspace, MissionWorkspace } from './AiCommercialWorkspace.js';
import { workspaceDocument, workspaceDrafting, validateWorkspaceCard, type WorkspaceCard, type WorkspaceComponent, type WorkspaceDocument, type WorkspaceCommand } from '../lib/ai-workspace-model.js';
import { refreshIntelligenceWorkspace, updateIntelligenceWorkspace, dismissIntelligenceWorkspace, assignIntelligenceConversationMode } from '../lib/ai-intelligence-runtime.js';
import { normalizeAiConversationMode, conversationModeDescription, type AiConversationMode } from '../lib/ai-conversation-mode.js';
import { kernelScopeKey, type ConversationKernel } from '../lib/ai-conversation-kernel.js';
import { activeAccountStorageUid } from '../storage/db.js';

// Narrow compatibility adapter: existing chat, composer, history, voice and guarded
// approval owners remain intact. All new presentation is precompiled TSX.
type Host=any;
const react=React as any;
const label=(ar:boolean,en:string,arabic:string)=>ar?arabic:en;
const fieldLabel=(ar:boolean,value:string)=>value.replace(/incoterm|paymentTerms|deliveryTime|validity|remarks|notes|customer|descriptionEn|descriptionAr|quantity|unitPrice|unit/g,key=>({incoterm:label(ar,'Delivery terms','شروط التسليم'),paymentTerms:label(ar,'Payment terms','شروط الدفع'),deliveryTime:label(ar,'Delivery time','مدة التسليم'),validity:label(ar,'Validity','صلاحية العرض'),remarks:label(ar,'Remarks','ملاحظات إضافية'),notes:label(ar,'Notes','ملاحظات'),customer:label(ar,'Customer','العميل'),descriptionEn:label(ar,'English description','الوصف الإنجليزي'),descriptionAr:label(ar,'Arabic description','الوصف العربي'),quantity:label(ar,'Quantity','الكمية'),unitPrice:label(ar,'Unit price','سعر الوحدة'),unit:label(ar,'Unit','الوحدة')}[key]||key));
const disabled=(host:Host)=>Boolean(host.state.busy||host.applying||host.state.attachmentBusy||host.__workspaceCommandBusy||host.__foundationApprovalBusy||host.__workspaceModeSwitchBusy);
function dispatch(host:Host,command:WorkspaceCommand){void updateIntelligenceWorkspace(host,command);}
function CardRows({card}:{card:WorkspaceCard}):any {
  return <dl className="lxw-facts">{card.rows.map(row=><div key={row.id}><dt>{row.label}</dt><dd>{row.detail||'—'}</dd></div>)}</dl>;
}
function Picker({card,onPick,busy}:{card:WorkspaceCard;onPick?:(id:string)=>void;busy?:boolean}):any {
  const [query,setQuery]=React.useState(''),[page,setPage]=React.useState(0);
  const rows=card.rows.filter(row=>(row.label+' '+row.detail).normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').toLowerCase()));
  const ar=document.documentElement.lang==='ar',visible=rows.slice(page*12,page*12+12);
  return <div className="lxw-picker"><input type="search" value={query} aria-label={label(ar,'Filter records','تصفية السجلات')} placeholder={label(ar,'Search name or SKU','ابحث بالاسم أو SKU')} onChange={(event:any)=>{setQuery(event.target.value);setPage(0);}}/><small>{rows.length} {label(ar,'matching records','سجل مطابق')}</small><div className="lxw-picker-list">{visible.map(row=><button type="button" key={row.id} disabled={busy||!onPick} onClick={()=>onPick?.(row.id)}><strong>{row.label}</strong><small>{row.detail}</small><code>{row.id}</code></button>)}{!rows.length?<p>{label(ar,'No matching records.','لا توجد سجلات مطابقة.')}</p>:null}</div>{rows.length>12?<nav className="lxw-pagination" aria-label={label(ar,'Record pages','صفحات السجلات')}><button type="button" disabled={page===0} onClick={()=>setPage(page-1)}>{label(ar,'Previous','السابق')}</button><span>{page+1} / {Math.ceil(rows.length/12)}</span><button type="button" disabled={(page+1)*12>=rows.length} onClick={()=>setPage(page+1)}>{label(ar,'Next','التالي')}</button></nav>:null}</div>;
}
const CARD_RENDERERS:Record<WorkspaceComponent,(props:any)=>any>={CustomerPicker:Picker,ProductPicker:Picker,EditablePricingGrid:CardRows,QuotePreview:CardRows,QuoteDiff:CardRows,AttachmentGallery:CardRows,EvidencePopover:CardRows,ApprovalDiff:CardRows,WorkflowProgress:CardRows,FinanceScenario:CardRows,SourceCompare:CardRows};
/** Descriptors choose a registered display only. Callbacks come exclusively from the host. */
export function RegisteredWorkspaceCard({descriptor,onPick,busy}:{descriptor:unknown;onPick?:(id:string)=>void;busy?:boolean}):any {
  const card=validateWorkspaceCard(descriptor);if(!card)return null;
  const Component=CARD_RENDERERS[card.component];return <section data-workspace-component={card.component}><Component card={card} onPick={onPick} busy={busy}/></section>;
}
function CellEditor({value,numeric,onCommit,name,busy}:{value:string;numeric:boolean;onCommit:(value:string)=>void;name:string;busy:boolean}):any {
  const [input,setInput]=React.useState(value);
  return <input value={input} aria-label={name} inputMode={numeric?'decimal':'text'} dir={numeric?'ltr':undefined} maxLength={numeric?24:160} disabled={busy} onChange={(event:any)=>setInput(event.target.value)} onBlur={()=>{if(input!==value){onCommit(input);setInput(value);}}} onKeyDown={(event:any)=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}}/>;
}
function PricingGrid({host,doc,editable}:{host:Host;doc:WorkspaceDocument;editable:boolean}):any {
  const [page,setPage]=React.useState(0),ar=host.props.language==='ar',rows=doc.rows.slice(page*10,page*10+10);
  const fields=['descriptionEn','descriptionAr','quantity','unit','unitPrice'] as const;
  const names=[label(ar,'Description','الوصف'),label(ar,'Arabic description','الوصف العربي'),label(ar,'Quantity','الكمية'),label(ar,'Unit','الوحدة'),label(ar,'Unit price','سعر الوحدة')];
  return <section data-workspace-component="EditablePricingGrid"><div className="lxw-table-scroll" tabIndex={0} aria-label={label(ar,'Pricing grid; scroll for all columns','جدول الأسعار؛ مرر لرؤية الأعمدة')}><table className="lxw-grid"><caption>{doc.rows.length} {label(ar,'lines ·','سطر ·')} {doc.currency}</caption><thead><tr><th>#</th>{names.map(name=><th key={name} scope="col">{name}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={row.id} data-line-id={row.id}><th scope="row">{page*10+i+1}</th>{fields.map((field,j)=><td key={field}>{editable?<CellEditor key={doc.revision+':'+row.id+':'+field} value={row[field]} numeric={field==='quantity'||field==='unitPrice'} busy={disabled(host)} name={`${names[j]} ${page*10+i+1}`} onCommit={value=>dispatch(host,{kind:'cell',artifactId:doc.id,revision:doc.revision,lineId:row.id,field,value})}/>:<span dir={field==='quantity'||field==='unitPrice'?'ltr':undefined}>{row[field]||'—'}</span>}</td>)}</tr>)}</tbody></table></div>{doc.rows.length>10?<nav className="lxw-pagination" aria-label={label(ar,'Line pages','صفحات الأصناف')}><button type="button" disabled={!page} onClick={()=>setPage(page-1)}>{label(ar,'Previous','السابق')}</button><span>{page+1} / {Math.ceil(doc.rows.length/10)}</span><button type="button" disabled={(page+1)*10>=doc.rows.length} onClick={()=>setPage(page+1)}>{label(ar,'Next','التالي')}</button></nav>:null}</section>;
}
function ManualLine({host,doc}:{host:Host;doc:WorkspaceDocument}):any {
  const ar=host.props.language==='ar';
  const [line,setLine]=React.useState({descriptionEn:'',descriptionAr:'',quantity:'',unit:'',unitPrice:''});
  const fields=[['descriptionEn','English description','الوصف الإنجليزي'],['descriptionAr','Arabic description','الوصف العربي'],['quantity','Quantity','الكمية'],['unit','Unit','الوحدة'],['unitPrice','Unit price','سعر الوحدة']];
  return <form className="lxw-manual-line" onSubmit={async(event:any)=>{event.preventDefault();if(disabled(host))return;await updateIntelligenceWorkspace(host,{kind:'add-line',artifactId:doc.id,revision:doc.revision,...line});if(!host.state.error&&host.__intelligenceKernel?.artifact?.id===doc.id&&host.__intelligenceKernel.artifact.revision>doc.revision)setLine({descriptionEn:'',descriptionAr:'',quantity:'',unit:'',unitPrice:''});}}><h4>{label(ar,'Add a manual line','إضافة صنف يدوي')} · {doc.currency}</h4>{fields.map(([key,en,arabic])=><label key={key}>{label(ar,en!,arabic!)}<input aria-label={label(ar,'New line: ','الصنف الجديد: ')+label(ar,en!,arabic!)} value={line[key as keyof typeof line]} disabled={disabled(host)} inputMode={key==='quantity'||key==='unitPrice'?'decimal':'text'} maxLength={key==='unit'?40:key==='quantity'||key==='unitPrice'?24:160} onChange={(event:any)=>setLine(previous=>({...previous,[key!]:event.target.value}))}/></label>)}<button type="submit" disabled={disabled(host)}>{label(ar,'Add to unsaved draft','إضافة إلى المسودة دون حفظ')}</button></form>;
}
function AttachmentPreview({file,ar}:{file:File;ar:boolean}):any {
  const [url,setUrl]=React.useState(''),[open,setOpen]=React.useState(false);
  React.useEffect(()=>{if(!open||!(/^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(file.type)))return;const objectUrl=URL.createObjectURL(file);setUrl(objectUrl);return()=>URL.revokeObjectURL(objectUrl);},[file,open]);
  const canPreview=/^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(file.type);
  return <div>{canPreview?<button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{label(ar,open?'Close preview':'Preview file',open?'إغلاق المعاينة':'معاينة الملف')}</button>:null}{open&&url?(file.type==='application/pdf'?<a href={url} target="_blank" rel="noopener noreferrer">{label(ar,'Open original PDF','فتح ملف PDF الأصلي')}</a>:<img className="lxw-file-image" src={url} alt={file.name}/>):null}</div>;
}
function AttachmentGallery({host}:{host:Host}):any {
  const ar=host.props.language==='ar',rows=host.state.conversationAttachments||[];
  return <section data-workspace-component="AttachmentGallery"><h3>{label(ar,'Attachments','المرفقات')}</h3>{!rows.length?<p>{label(ar,'Add files with + in the composer. Files are data, not instructions.','أضف الملفات من + في المحادثة. الملفات بيانات وليست تعليمات.')}</p>:rows.map((row:any)=><article className="lxw-file" key={row.id}><strong>{row.file.name}</strong><small>{row.file.size.toLocaleString()} {label(ar,'bytes','بايت')} · {row.status==='error'?label(ar,'Needs review','يحتاج مراجعة'):row.status==='processing'?label(ar,'Reading','جارٍ القراءة'):label(ar,'Attached · unverified','مرفق · غير متحقق')}</small>{row.error?<p role="alert">{row.error}</p>:null}<AttachmentPreview file={row.file} ar={ar}/>{row.source?<button type="button" disabled={disabled(host)} onClick={()=>window.dispatchEvent(new CustomEvent('lourex-ai-conversation-source-review',{detail:{file:row.file,route:row.source.route}}))}>{label(ar,'Review extracted data','مراجعة البيانات المستخرجة')}</button>:null}</article>)}</section>;
}
function RevisionTimeline({host}:{host:Host}):any {
  const kernel=host.__intelligenceKernel as ConversationKernel,artifact=kernel.artifact,ar=host.props.language==='ar';
  if(!artifact)return null;
  return <ol className="lxw-timeline">{artifact.undo.map((proposal,i)=>{
    const snapshot=workspaceDocument({...kernel,artifact:{...artifact,proposal,lineIds:artifact.undoLineIds?.[i]||artifact.lineIds,undo:[],redo:[]}},host.__foundationVault,ar?'ar':'en');
    if(!snapshot)return null;
    return <li key={i}><details><summary>{label(ar,'Earlier working version','نسخة سابقة من المسودة')} {i+1} · {snapshot.rows.length} {label(ar,'lines','سطر')}</summary><p>{snapshot.customer} · <b dir="ltr">{snapshot.subtotal??'—'} {snapshot.currency}</b></p><PricingGrid host={host} doc={snapshot} editable={false}/></details></li>;
  })}</ol>;
}
function ArtifactWorkspace({host,approval}:{host:Host;approval:any}):any {
  const kernel=host.__intelligenceKernel as ConversationKernel,vault=host.__foundationVault,ar=host.props.language==='ar';
  let doc:WorkspaceDocument|null=null,error='';try{doc=workspaceDocument(kernel,vault,ar?'ar':'en',host.state.__workspaceSavedId||(!kernel.artifact&&kernel.entity?.entityType==='document'?kernel.entity.entityId:''));}catch(e){error=e instanceof Error?e.message:String(e);}
  const tab=host.state.__workspaceTab||'preview',editable=Boolean(host.state.__workspaceEditing&&doc?.status==='draft');
  const choose=(value:string)=>host.setState({__workspaceTab:value});
  const drafting=workspaceDrafting(vault,kernel.artifact?.proposal.capability==='document.updateDraft'?kernel.artifact.proposal.documentId:'');
  const pick=(kind:'customer'|'product',id:string)=>{if(doc?.status==='draft')dispatch(host,{kind,artifactId:doc.id,revision:doc.revision,entityId:id});};
  const evidence=host.__lourexLatestContext?.advisorV2?.evidence||[];
  return <aside className="lxw-artifact" aria-label={label(ar,'Document workspace','مساحة المستند')}><header className="lxw-artifact-head"><div><strong>{workspaceText(ar,doc?.title||'')||label(ar,'Your workspace','مساحة عملك')}</strong><span className={'lxw-badge '+(doc?.status||'draft')}>{doc?.status==='saved'?label(ar,'Saved in LOUREX','محفوظ في LOUREX'):label(ar,'Draft · unsaved','مسودة · غير محفوظة')}</span></div><button type="button" className="lxw-back" onClick={()=>host.setState({__workspacePane:'chat',__workspaceOpen:false})}>{label(ar,'Back to chat','العودة للمحادثة')}</button></header><div className="lxw-tabs" aria-label={label(ar,'Workspace views','طرق عرض مساحة العمل')}>{[['preview','Preview','المعاينة'],['edit','Edit','تعديل'],['customer','Customer','العميل'],['product','Products','الأصناف'],['files','Files','الملفات'],['revisions','Revisions','التعديلات'],['evidence','Evidence','الأدلة'],['commercial','Deal studio','استوديو الصفقة'],['missions','Missions','المهام'],['knowledge','Memory','الذاكرة'],['reliability','Review','المراجعة'],['diagnostics','Reliability','الموثوقية']].map(([value,en,arabic])=><button key={value} type="button" aria-pressed={tab===value} onClick={()=>choose(value!)}>{label(ar,en!,arabic!)}</button>)}</div><div className="lxw-artifact-content">{error||host.state.error?<p role="alert">{workspaceError(ar,error||host.state.error)}</p>:null}
    {(tab==='preview'||tab==='edit')&&doc?<><section data-workspace-component="QuotePreview"><p><strong>{doc.customer||label(ar,'Select a customer','حدد العميل')}</strong> · <b dir="ltr">{doc.currency}</b></p>{doc.status==='draft'?<div className="lxw-revision-controls"><span>{label(ar,'Revision','التعديل')} {doc.revision}</span><button type="button" disabled={!kernel.artifact?.undo.length||disabled(host)} onClick={()=>dispatch(host,{kind:'undo',artifactId:doc!.id,revision:doc!.revision})}>{label(ar,'Undo','تراجع')}</button><button type="button" disabled={!kernel.artifact?.redo.length||disabled(host)} onClick={()=>dispatch(host,{kind:'redo',artifactId:doc!.id,revision:doc!.revision})}>{label(ar,'Redo','إعادة')}</button>{tab==='edit'?<button type="button" aria-pressed={editable} disabled={disabled(host)} onClick={()=>host.setState({__workspaceEditing:!editable})}>{label(ar,editable?'Finish editing':'Edit draft cells',editable?'إنهاء التعديل':'تعديل خانات المسودة')}</button>:null}</div>:null}<PricingGrid key={doc.id+':'+tab} host={host} doc={doc} editable={tab==='edit'&&editable}/>{tab==='edit'&&doc.status==='draft'?<ManualLine key={doc.id} host={host} doc={doc}/>:null}<div className="lxw-subtotal"><span>{label(ar,'Item subtotal','المجموع الفرعي للأصناف')}</span><b dir="ltr">{doc.subtotal??'—'} {doc.currency}</b></div><p className="lxw-note">{doc.status==='saved'?label(ar,'Read-only saved record. Item subtotal excludes tax, discounts and freight; open the document for its full totals and final PDF.','سجل محفوظ للقراءة. المجموع الفرعي لا يشمل الضرائب والخصومات والشحن؛ افتح المستند لإجمالياته الكاملة وPDF النهائي.'):label(ar,'Item subtotal excludes tax, discounts and freight. This is a working preview; it is not a saved invoice or a final PDF.','المجموع الفرعي لا يشمل الضرائب والخصومات والشحن. هذه معاينة عمل؛ ليست فاتورة محفوظة أو PDF نهائيًا.')}</p><RegisteredWorkspaceCard descriptor={{component:'QuotePreview',rows:doc.terms.map((row,i)=>({id:String(i),label:fieldLabel(ar,row.label),detail:row.value}))}}/>{doc.blockers.length?<div role="status" className="lxw-blockers"><strong>{label(ar,'Complete before approval','أكمل قبل الموافقة')}</strong><ul>{doc.blockers.map((row,i)=><li key={i}>{row}</li>)}</ul></div>:null}</section></>:null}
    {(tab==='preview'||tab==='edit')&&!doc?<p>{label(ar,'Ask LOUREX to prepare a quotation, or open a saved document from the chat.','اطلب من LOUREX تجهيز عرض سعر، أو افتح مستندًا محفوظًا من المحادثة.')}</p>:null}
    {tab==='customer'?<><h3>{label(ar,'Choose the exact customer','اختر العميل المحدد')}</h3><RegisteredWorkspaceCard descriptor={{component:'CustomerPicker',rows:drafting.customers.map(row=>({id:row.id,label:row.name,detail:row.preferredCurrency+' · '+row.paymentTerms}))}} busy={disabled(host)||doc?.status!=='draft'||kernel.artifact?.proposal.capability!=='document.createDraft'} onPick={id=>pick('customer',id)}/></>:null}
    {tab==='product'?<><h3>{label(ar,'Add a product to this draft','أضف صنفًا لهذه المسودة')}</h3><RegisteredWorkspaceCard descriptor={{component:'ProductPicker',rows:drafting.items.map(row=>({id:row.id,label:row.name,detail:[row.sku,row.unit,row.lastUnitPrice,row.lastCurrency].filter(Boolean).join(' · ')}))}} busy={disabled(host)||doc?.status!=='draft'} onPick={id=>pick('product',id)}/><p className="lxw-note">{label(ar,'A recorded price is used only when its currency matches. Otherwise enter a price; no FX rate is inferred.','يستخدم السعر المسجل عند تطابق العملة فقط. خلاف ذلك أدخل السعر؛ لا يُفترض سعر صرف.')}</p></>:null}
    {tab==='knowledge'?<KnowledgeWorkspace key={kernelScopeKey(kernel.scope)} host={host}/>:null}
    {tab==='reliability'?<ReliabilityWorkspace key={kernelScopeKey(kernel.scope)} host={host}/>:null}
    {tab==='diagnostics'?<DiagnosticsWorkspace key={kernelScopeKey(kernel.scope)} host={host}/>:null}
    {tab==='commercial'?<CommercialWorkspace key={doc?.id||'new'} host={host} doc={doc}/>:null}
    {tab==='missions'?<MissionWorkspace host={host}/>:null}
    {tab==='files'?<AttachmentGallery host={host}/>:null}
    {tab==='revisions'?<><h3>{label(ar,'Latest revision diff','فروق آخر تعديل')}</h3><RegisteredWorkspaceCard descriptor={{component:'QuoteDiff',rows:(doc?.diff||[]).map((row,i)=>({id:String(i),label:fieldLabel(ar,row.field),detail:(row.before||'—')+' → '+(row.after||'—')}))}}/><p>{kernel.artifact?.undo.length||0} {label(ar,'earlier working revisions. Undo changes drafts only.','تعديل سابق في المسودة. التراجع يغير المسودة فقط.')}</p><RevisionTimeline host={host}/></>:null}
    {tab==='evidence'?<><h3>{label(ar,'Evidence','الأدلة')}</h3><RegisteredWorkspaceCard descriptor={{component:'EvidencePopover',rows:evidence.map((row:any,i:number)=>({id:String(row.id||i),label:String(row.source||''),detail:String(row.fact||'')}))}}/>{!evidence.length?<p>{label(ar,'No evidence in the current response.','لا يوجد دليل في الرد الحالي.')}</p>:null}<span className="lxw-badge saved">{label(ar,'Scoped LOUREX evidence','أدلة LOUREX ضمن النطاق')}</span></>:null}
    {approval&&doc?.status==='draft'?<section className="lxw-approval" data-workspace-component="ApprovalDiff"><h3>{label(ar,'Review before saving','راجع قبل الحفظ')}</h3><RegisteredWorkspaceCard descriptor={{component:'ApprovalDiff',rows:(doc.diff||[]).map((row,i)=>({id:String(i),label:fieldLabel(ar,row.field),detail:(row.before||'—')+' → '+row.after}))}}/>{approval}</section>:null}
  </div></aside>;
}
function workspaceVisible(host:Host):boolean {
  const k=host.__intelligenceKernel as ConversationKernel|undefined,v=host.__foundationVault;if(!k||!v||k.scope.scope==='personal'||host.__workspaceObservedProps!==host.props)return false;
  try{strictAiActor(v);}catch{return false;}
  return k.scope.accountId===(activeAccountStorageUid()||'')&&k.scope.scope===(host.state.assistantScope||'business')&&k.scope.threadId===host.__lourexAssistantThreadId&&k.scope.workspaceId===(v.appSettings.activeWorkspaceId||'default')&&k.scope.branchId===(v.appSettings.activeBranchId||'main');
}
export function renderConversationWorkspace(host:Host,tree:any):any {
  const transform=(node:any):any=>{
    if(typeof node==='string')return workspaceText(host.props.language==='ar',node);
    if(!react.isValidElement(node))return node;
    const cn=String(node.props?.className||''),children=react.Children.toArray(node.props?.children).map(transform);
    if(cn.split(' ').includes('lourex-ai-title')){
      const branded=children.map((child:any)=>{
        if(child?.type!=='div')return child;
        const text=react.Children.toArray(child.props?.children).map((part:any)=>{
          if(part?.type==='strong')return react.cloneElement(part,undefined,'LOUREX AI');
          if(part?.type==='small')return react.cloneElement(part,undefined,label(host.props.language==='ar','Your business AI','مساعد أعمالك الذكي'));
          return part;
        });
        return react.cloneElement(child,undefined,...text);
      });
      return react.cloneElement(node,undefined,...branded);
    }
    if(cn.split(' ').includes('lourex-ai-created-artifact')&&workspaceVisible(host)&&normalizeAiConversationMode(host.__intelligenceKernel?.mode)==='advisor'){
      // Retain the historic document number but never expose route-changing buttons.
      return react.cloneElement(node,undefined,...children.filter((child:any)=>child?.type!=='div'));
    }
    if(cn.split(' ').includes('lourex-ai-created-artifact')&&workspaceVisible(host)&&normalizeAiConversationMode(host.__intelligenceKernel?.mode)==='controller'){
      const number=children.find((child:any)=>child?.type==='strong')?.props?.children?.props?.children;
      const documentId=host.state.messages?.find((message:any)=>message.artifact?.document?.number===number)?.artifact?.document?.id;
      if(documentId)return react.cloneElement(node,undefined,...children,<button type="button" onClick={()=>host.setState({__workspaceOpen:true,__workspacePane:'workspace',__workspaceTab:'preview',__workspaceSavedId:documentId})}>{label(host.props.language==='ar','Read-only preview','معاينة للقراءة')}</button>);
    }
    if(cn.split(' ').includes('lourex-ai-empty')&&host.state.assistantScope==='personal'){
      const ar=host.props.language==='ar',prompts=ar?['ذكرني غدًا بمراجعة أهدافي','ما الذي تتذكره عن تفضيلاتي؟']:['Remind me tomorrow to review my goals','What do you remember about my preferences?'];
      return react.cloneElement(node,undefined,<strong>{label(ar,'Your personal assistant','مساعدك الشخصي')}</strong>,<p>{label(ar,'Plan tasks and manage personal reminders and preferences in this separate conversation.','نظّم مهامك وتذكيراتك وتفضيلاتك الشخصية في هذه المحادثة المستقلة.')}</p>,<div className="lourex-ai-starters">{prompts.map(prompt=><button type="button" key={prompt} onClick={()=>void host.ask(prompt)}>{prompt}</button>)}</div>);
    }
    if(cn.split(' ').includes('lourex-ai-empty')&&workspaceVisible(host)&&normalizeAiConversationMode(host.__intelligenceKernel?.mode)==='advisor'){
      const ar=host.props.language==='ar';
      const prompts=ar?['حلّل هامش الربح بناءً على بيانات الشركة','اشرح لي الذمم والمستحقات الحالية']:['Analyze profit margins from business records','Explain current receivables and outstanding balances'];
      return react.cloneElement(node,undefined,
        <strong>{label(ar,'What would you like to analyze?','ما الذي تريد مناقشته؟')}</strong>,
        <p>{label(ar,'Discuss financial and commercial questions. The Advisor reads permitted information but never opens pages or changes records.','ناقش الأمور المالية والتجارية. يقرأ المستشار المعلومات المصرّح بها للتحليل دون فتح صفحات أو تغيير سجلات.')}</p>,
        <div className="lourex-ai-starters">{prompts.map(prompt=><button type="button" key={prompt} disabled={disabled(host)} onClick={()=>void host.ask(prompt)}>{prompt}</button>)}</div>);
    }
    if(node.props?.id!=='lourex-ai-panel')return children.length?react.cloneElement(node,undefined,...children):node;
    if(!workspaceVisible(host)){
      const k=host.__intelligenceKernel as ConversationKernel|undefined;
      const personalReady=k?.scope.scope==='personal'&&host.state.assistantScope==='personal'&&host.__workspaceObservedProps===host.props&&k.scope.accountId===(activeAccountStorageUid()||'')&&k.scope.threadId===host.__lourexAssistantThreadId;
      const safe=personalReady?children:children.map((child:any)=>{
        const classes=String(child?.props?.className||'').split(' ');
        if(classes.includes('lourex-ai-proposal'))return null;
        if(classes.includes('lourex-ai-messages'))return react.cloneElement(child,undefined,host.state.__workspaceLoadError
          ?<div role="alert" className="lxw-load-error"><p>{label(host.props.language==='ar','Conversation could not be loaded.','تعذّر تحميل المحادثة.')}</p><small>{workspaceError(host.props.language==='ar',String(host.state.__workspaceLoadError))}</small><button type="button" onClick={()=>host.setState({__workspaceLoadError:''},()=>void host.__workspaceRefresh?.())}>{label(host.props.language==='ar','Retry loading','إعادة المحاولة')}</button></div>
          :<p role="status">{label(host.props.language==='ar','Loading scoped conversation…','جارٍ تحميل المحادثة في نطاقها…')}</p>);
        return child;
      });
      return react.cloneElement(node,{'data-lourex-workspace':'2','data-workspace-ready':'false'},...safe);
    }
    const ar=host.props.language==='ar',k=host.__intelligenceKernel as ConversationKernel;
    const header=children.filter((child:any)=>['lourex-ai-head','lourex-ai-context'].some(name=>String(child?.props?.className||'').split(' ').includes(name)));
    const content=children.filter((child:any)=>!header.includes(child));
    const approval=content.find((child:any)=>String(child?.props?.className||'').split(' ').includes('lourex-ai-proposal')&&['document.createDraft','document.updateDraft'].includes(host.state.proposal?.capability));
    const mode=normalizeAiConversationMode(k.mode),open=mode==='controller'&&Boolean(host.state.__workspaceOpen),pane=host.state.__workspacePane||'chat';
    const switching=Boolean(host.state.__workspaceSwitching),inactive=disabled(host)||switching;
    const tabs=<nav className="lxw-mode-tabs" role="tablist" aria-label={label(ar,'Conversation modes','نوع المحادثة')}>
      {(['controller','advisor'] as const).map(value=><button key={value} type="button" role="tab" aria-selected={mode===value} disabled={inactive} onClick={()=>void host.__workspaceSwitchMode?.(value)}>{value==='controller'?label(ar,'Controller','المتحكم'):label(ar,'Advisor','المستشار')}</button>)}
    </nav>;
    const description=<div className="lxw-mode-description" dir={ar?'rtl':'ltr'} aria-live="polite">
      <span className="lxw-mode-symbol" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{mode==='controller'?<><path d="M4 7h16M4 17h16"/><path d="M8 4v6M16 14v6"/></>:<><path d="M20 11.5a8 8 0 0 1-8.5 8 8 8 0 0 1-3.8-1L4 20l1.5-3.7A8 8 0 1 1 20 11.5Z"/><path d="M8 11h8M8 14h5"/></>}</svg></span>
      <span>{conversationModeDescription(mode,ar?'ar':'en')}</span>
    </div>;
    const toolbar=mode==='controller'?<div className="lxw-toolbar"><button type="button" disabled={inactive} aria-expanded={open} onClick={()=>host.setState({__workspaceOpen:!open,__workspacePane:open?'chat':'workspace'})}>{label(ar,'Workspace','مساحة العمل')}{k.artifact?' · '+k.artifact.revision:''}</button></div>:null;
    const safeContent=mode==='controller'?content.filter((child:any)=>child!==approval):content.filter((child:any)=>!String(child?.props?.className||'').split(' ').includes('lourex-ai-proposal'));
    return react.cloneElement(node,{'aria-label':'LOUREX AI','data-lourex-workspace':'2','data-workspace-ready':'true','data-workspace-mode':mode,'data-workspace-open':String(open),'data-workspace-pane':pane},...header,tabs,description,toolbar,<div className="lxw-body"><div className="lxw-chat">{safeContent}{mode==='controller'&&!open&&approval?<div className="lxw-collapsed-approval">{approval}</div>:null}</div>{open?<ArtifactWorkspace key={kernelScopeKey(k.scope)} host={host} approval={approval}/>:null}</div>);
  };return transform(tree);
}
export function installConversationWorkspace(host:Host):void {
  if(host.__workspaceInstalled)return;host.__workspaceInstalled=true;
  const refresh=async()=>{
    const generation=(host.__workspaceLoadGeneration||0)+1;
    host.__workspaceLoadGeneration=generation;
    if(host.__workspaceLoadTimer)window.clearTimeout(host.__workspaceLoadTimer);
    // IndexedDB and account hydration can stall without rejecting a promise.
    // Surface a retryable failure instead of leaving the panel loading forever.
    host.__workspaceLoadTimer=window.setTimeout(()=>{
      if(host.mounted!==false&&host.__workspaceLoadGeneration===generation){
        // Invalidate the unresolved attempt, including any late cache read.
        host.__workspaceLoadGeneration=generation+1;
        host.__workspaceObservedProps=undefined;host.__foundationVault=undefined;
        host.setState({__workspaceLoadError:label(host.props.language==='ar','Conversation loading timed out. Retry loading.','انتهت مهلة تحميل المحادثة. حاول مجددًا.')});
      }
    },20_000);
    try{
      const previous=host.__intelligenceKernel?.scope&&kernelScopeKey(host.__intelligenceKernel.scope);
      await refreshIntelligenceWorkspace(host);
      if(host.mounted===false||host.__workspaceLoadGeneration!==generation)return;
      if(previous&&previous!==kernelScopeKey(host.__intelligenceKernel.scope)){
        host.__lourexLatestContext=undefined;host.__businessMemories=[];
        host.__businessThreads=[];host.__lourexLastConversationSources=[];host.__lourexLastConversationFiles=[];
      }
      host.__workspaceObservedProps=host.props;
      host.setState({__workspaceLoadError:''});
    }catch(error){
      if(host.mounted===false||host.__workspaceLoadGeneration!==generation)return;
      host.__workspaceObservedProps=undefined;host.__foundationVault=undefined;
      host.setState({__workspaceLoadError:error instanceof Error?error.message:String(error)});
    }finally{
      if(host.__workspaceLoadGeneration===generation){
        window.clearTimeout(host.__workspaceLoadTimer);
        host.__workspaceLoadTimer=0;
      }
    }
  };
  const toggle=host.toggle.bind(host);host.toggle=()=>{const opening=!host.state.open;toggle();if(opening)void refresh();};
  const ask=host.ask.bind(host);host.ask=async(raw?:string)=>{if(host.__workspaceModeSwitchBusy)return;await ask(raw);if(host.state.open)await refresh();};
  const dismiss=host.dismissProposal.bind(host);host.dismissProposal=()=>{if(disabled(host))return;dismiss();void dismissIntelligenceWorkspace(host).catch((error:Error)=>host.setState({error:error.message}));};
  // Immediately remove volatile UI references during scope/thread changes. Hydrate
  // the requested thread before redisplaying its encrypted working artifact.
  for(const name of ['__lourexSetScope','__lourexOpenThread','__lourexNewConversation','__lourexDeleteThread']){
    const old=host[name]?.bind(host);if(!old)continue;
    if(name==='__lourexSetScope')host.__workspaceBaseSetScope=old;
    host[name]=async(...args:any[])=>{if(disabled(host)&&!host.__workspaceInternalModeSwitch)return;host.__intelligenceKernel=undefined;host.__foundationVault=undefined;host.__lourexLatestContext=undefined;host.__businessMemories=[];host.__businessThreads=[];host.__lourexLastConversationSources=[];host.__lourexLastConversationFiles=[];host.setState({__workspaceOpen:false,__workspacePane:'chat',__workspaceSavedId:'',__workspaceEditing:false,assistantEvidence:null,conversationAttachments:[],proposal:null,review:null});await old(...args);await refresh();};
  }
  // Each mode opens its own scoped thread. Never relabel an existing turn.
  const drafts=new Map<string,string>();
  host.__workspaceSwitchMode=async(target:AiConversationMode)=>{
    if(target!=='controller'&&target!=='advisor')return;
    if(disabled(host)||host.__workspaceModeSwitchBusy)return;
    const previous=host.__intelligenceKernel as ConversationKernel|undefined;
    if(!previous||previous.scope.scope!=='business'||normalizeAiConversationMode(previous.mode)===target)return;
    host.__workspaceModeSwitchBusy=true;host.__workspaceInternalModeSwitch=true;
    drafts.set(kernelScopeKey(previous.scope),String(host.state.input||''));
    host.setState({__workspaceSwitching:true,error:''});
    try{
      const matching=(host.__businessThreads||[]).filter((row:any)=>row.mode===target).sort((a:any,b:any)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
      if(matching.length&&matching[0].id!==previous.scope.threadId)await host.__lourexOpenThread(matching[0].id);
      else await host.__lourexNewConversation();
      if(!host.__intelligenceKernel)throw new Error('The selected conversation could not be loaded.');
      if(normalizeAiConversationMode(host.__intelligenceKernel.mode)!==target)await assignIntelligenceConversationMode(host,target);
      const current=host.__intelligenceKernel as ConversationKernel;
      host.setState({input:drafts.get(kernelScopeKey(current.scope))||'',__workspaceSwitching:false});
    }catch(error){
      host.setState({__workspaceSwitching:false,error:error instanceof Error?error.message:String(error)});
    }finally{
      host.__workspaceModeSwitchBusy=false;host.__workspaceInternalModeSwitch=false;
    }
  };
  host.__workspaceRefresh=refresh;
  const viewport=()=>syncWorkspaceViewport();host.__workspaceViewport=viewport;
  window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);
  void host.__lourexLoadPromise?.then(refresh);
}
function syncWorkspaceViewport():void {
  const panel=document.getElementById('lourex-ai-panel');if(!panel)return;
  const viewport=window.visualViewport,height=viewport?.height||window.innerHeight,top=viewport?.offsetTop||0;
  panel.style.setProperty('--lxw-viewport-height',height+'px');panel.style.setProperty('--lxw-viewport-top',top+'px');
}
export function updateConversationWorkspace(host:Host,previous:unknown):void {
  syncWorkspaceViewport();
  if(previous!==host.props){host.__workspaceObservedProps=undefined;host.__foundationVault=undefined;host.__businessMemories=[];host.__businessThreads=[];host.__workspaceRefresh?.();}
}
export function unmountConversationWorkspace(host:Host):void {host.__workspaceLoadGeneration=(host.__workspaceLoadGeneration||0)+1;if(host.__workspaceLoadTimer)window.clearTimeout(host.__workspaceLoadTimer);host.__workspaceLoadTimer=0;window.visualViewport?.removeEventListener('resize',host.__workspaceViewport);window.visualViewport?.removeEventListener('scroll',host.__workspaceViewport);window.removeEventListener('resize',host.__workspaceViewport);}
