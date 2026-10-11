import { workspaceDocument, workspaceDrafting, validateWorkspaceCard, type WorkspaceCard, type WorkspaceComponent, type WorkspaceDocument, type WorkspaceCommand } from '../lib/ai-workspace-model.js';
import { refreshIntelligenceWorkspace, updateIntelligenceWorkspace, dismissIntelligenceWorkspace } from '../lib/ai-intelligence-runtime.js';
import { kernelScopeKey, type ConversationKernel } from '../lib/ai-conversation-kernel.js';
import { activeAccountStorageUid } from '../storage/db.js';

// Narrow compatibility adapter: existing chat, composer, history, voice and guarded
// approval owners remain intact. All new presentation is precompiled TSX.
type Host=any;
const react=React as any;
const label=(ar:boolean,en:string,arabic:string)=>ar?arabic:en;
const disabled=(host:Host)=>Boolean(host.state.busy||host.applying||host.state.attachmentBusy||host.__workspaceCommandBusy);
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
const CARD_RENDERERS:Record<WorkspaceComponent,(props:any)=>any>={CustomerPicker:Picker,ProductPicker:Picker,EditablePricingGrid:CardRows,QuotePreview:CardRows,QuoteDiff:CardRows,AttachmentGallery:CardRows,EvidencePopover:CardRows,ApprovalDiff:CardRows};
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
  return <aside className="lxw-artifact" aria-label={label(ar,'Document workspace','مساحة المستند')}><header className="lxw-artifact-head"><div><strong>{doc?.title||label(ar,'Your workspace','مساحة عملك')}</strong><span className={'lxw-badge '+(doc?.status||'draft')}>{doc?.status==='saved'?label(ar,'Saved in LOUREX','محفوظ في LOUREX'):label(ar,'Draft · unsaved','مسودة · غير محفوظة')}</span></div><button type="button" className="lxw-back" onClick={()=>host.setState({__workspacePane:'chat',__workspaceOpen:false})}>{label(ar,'Back to chat','العودة للمحادثة')}</button></header><div className="lxw-tabs" aria-label={label(ar,'Workspace views','طرق عرض مساحة العمل')}>{[['preview','Preview','المعاينة'],['edit','Edit','تعديل'],['customer','Customer','العميل'],['product','Products','الأصناف'],['files','Files','الملفات'],['revisions','Revisions','التعديلات'],['evidence','Evidence','الأدلة']].map(([value,en,arabic])=><button key={value} type="button" aria-pressed={tab===value} onClick={()=>choose(value!)}>{label(ar,en!,arabic!)}</button>)}</div><div className="lxw-artifact-content">{error||host.state.error?<p role="alert">{error||host.state.error}</p>:null}
    {(tab==='preview'||tab==='edit')&&doc?<><section data-workspace-component="QuotePreview"><p><strong>{doc.customer||label(ar,'Select a customer','حدد العميل')}</strong> · <b dir="ltr">{doc.currency}</b></p>{doc.status==='draft'?<div className="lxw-revision-controls"><span>{label(ar,'Revision','التعديل')} {doc.revision}</span><button type="button" disabled={!kernel.artifact?.undo.length||disabled(host)} onClick={()=>dispatch(host,{kind:'undo',artifactId:doc!.id,revision:doc!.revision})}>{label(ar,'Undo','تراجع')}</button><button type="button" disabled={!kernel.artifact?.redo.length||disabled(host)} onClick={()=>dispatch(host,{kind:'redo',artifactId:doc!.id,revision:doc!.revision})}>{label(ar,'Redo','إعادة')}</button>{tab==='edit'?<button type="button" aria-pressed={editable} disabled={disabled(host)} onClick={()=>host.setState({__workspaceEditing:!editable})}>{label(ar,editable?'Finish editing':'Edit draft cells',editable?'إنهاء التعديل':'تعديل خانات المسودة')}</button>:null}</div>:null}<PricingGrid key={doc.id+':'+tab} host={host} doc={doc} editable={tab==='edit'&&editable}/><div className="lxw-subtotal"><span>{label(ar,'Item subtotal','المجموع الفرعي للأصناف')}</span><b dir="ltr">{doc.subtotal??'—'} {doc.currency}</b></div><p className="lxw-note">{doc.status==='saved'?label(ar,'Read-only saved record. Item subtotal excludes tax, discounts and freight; open the document for its full totals and final PDF.','سجل محفوظ للقراءة. المجموع الفرعي لا يشمل الضرائب والخصومات والشحن؛ افتح المستند لإجمالياته الكاملة وPDF النهائي.'):label(ar,'Item subtotal excludes tax, discounts and freight. This is a working preview; it is not a saved invoice or a final PDF.','المجموع الفرعي لا يشمل الضرائب والخصومات والشحن. هذه معاينة عمل؛ ليست فاتورة محفوظة أو PDF نهائيًا.')}</p><RegisteredWorkspaceCard descriptor={{component:'QuotePreview',rows:doc.terms.map((row,i)=>({id:String(i),label:row.label,detail:row.value}))}}/>{doc.blockers.length?<div role="status" className="lxw-blockers"><strong>{label(ar,'Complete before approval','أكمل قبل الموافقة')}</strong><ul>{doc.blockers.map((row,i)=><li key={i}>{row}</li>)}</ul></div>:null}</section></>:null}
    {(tab==='preview'||tab==='edit')&&!doc?<p>{label(ar,'Ask LOUREX to prepare a quotation, or open a saved document from the chat.','اطلب من LOUREX تجهيز عرض سعر، أو افتح مستندًا محفوظًا من المحادثة.')}</p>:null}
    {tab==='customer'?<><h3>{label(ar,'Choose the exact customer','اختر العميل المحدد')}</h3><RegisteredWorkspaceCard descriptor={{component:'CustomerPicker',rows:drafting.customers.map(row=>({id:row.id,label:row.name,detail:row.preferredCurrency+' · '+row.paymentTerms}))}} busy={disabled(host)||doc?.status!=='draft'||kernel.artifact?.proposal.capability!=='document.createDraft'} onPick={id=>pick('customer',id)}/></>:null}
    {tab==='product'?<><h3>{label(ar,'Add a product to this draft','أضف صنفًا لهذه المسودة')}</h3><RegisteredWorkspaceCard descriptor={{component:'ProductPicker',rows:drafting.items.map(row=>({id:row.id,label:row.name,detail:[row.sku,row.unit,row.lastUnitPrice,row.lastCurrency].filter(Boolean).join(' · ')}))}} busy={disabled(host)||doc?.status!=='draft'} onPick={id=>pick('product',id)}/><p className="lxw-note">{label(ar,'A recorded price is used only when its currency matches. Otherwise enter a price; no FX rate is inferred.','يستخدم السعر المسجل عند تطابق العملة فقط. خلاف ذلك أدخل السعر؛ لا يُفترض سعر صرف.')}</p></>:null}
    {tab==='files'?<AttachmentGallery host={host}/>:null}
    {tab==='revisions'?<><h3>{label(ar,'Latest revision diff','فروق آخر تعديل')}</h3><RegisteredWorkspaceCard descriptor={{component:'QuoteDiff',rows:(doc?.diff||[]).map((row,i)=>({id:String(i),label:row.field,detail:(row.before||'—')+' → '+(row.after||'—')}))}}/><p>{kernel.artifact?.undo.length||0} {label(ar,'earlier working revisions. Undo changes drafts only.','تعديل سابق في المسودة. التراجع يغير المسودة فقط.')}</p><RevisionTimeline host={host}/></>:null}
    {tab==='evidence'?<><h3>{label(ar,'Evidence','الأدلة')}</h3><RegisteredWorkspaceCard descriptor={{component:'EvidencePopover',rows:evidence.map((row:any,i:number)=>({id:String(row.id||i),label:String(row.source||''),detail:String(row.fact||'')}))}}/>{!evidence.length?<p>{label(ar,'No evidence in the current response.','لا يوجد دليل في الرد الحالي.')}</p>:null}<span className="lxw-badge saved">{label(ar,'Scoped LOUREX evidence','أدلة LOUREX ضمن النطاق')}</span></>:null}
    {approval&&doc?.status==='draft'?<section className="lxw-approval" data-workspace-component="ApprovalDiff"><h3>{label(ar,'Review before saving','راجع قبل الحفظ')}</h3><RegisteredWorkspaceCard descriptor={{component:'ApprovalDiff',rows:(doc.diff||[]).map((row,i)=>({id:String(i),label:row.field,detail:(row.before||'—')+' → '+row.after}))}}/>{approval}</section>:null}
  </div></aside>;
}
function workspaceVisible(host:Host):boolean {
  const k=host.__intelligenceKernel as ConversationKernel|undefined,v=host.__foundationVault;if(!k||!v||k.scope.scope==='personal'||host.__workspaceObservedProps!==host.props)return false;
  return k.scope.accountId===(activeAccountStorageUid()||'')&&k.scope.scope===(host.state.assistantScope||'business')&&k.scope.threadId===host.__lourexAssistantThreadId&&k.scope.workspaceId===(v.appSettings.activeWorkspaceId||'default')&&k.scope.branchId===(v.appSettings.activeBranchId||'main');
}
export function renderConversationWorkspace(host:Host,tree:any):any {
  const transform=(node:any):any=>{
    if(!react.isValidElement(node))return node;
    const cn=String(node.props?.className||''),children=react.Children.toArray(node.props?.children).map(transform);
    if(cn.split(' ').includes('lourex-ai-created-artifact')&&workspaceVisible(host)){
      const number=children.find((child:any)=>child?.type==='strong')?.props?.children?.props?.children;
      const documentId=host.state.messages?.find((message:any)=>message.artifact?.document?.number===number)?.artifact?.document?.id;
      if(documentId)return react.cloneElement(node,undefined,...children,<button type="button" onClick={()=>host.setState({__workspaceOpen:true,__workspacePane:'workspace',__workspaceTab:'preview',__workspaceSavedId:documentId})}>{label(host.props.language==='ar','Read-only preview','معاينة للقراءة')}</button>);
    }
    if(node.props?.id!=='lourex-ai-panel')return children.length?react.cloneElement(node,undefined,...children):node;
    if(!workspaceVisible(host)){
      const k=host.__intelligenceKernel as ConversationKernel|undefined;
      const personalReady=k?.scope.scope==='personal'&&host.state.assistantScope==='personal'&&host.__workspaceObservedProps===host.props&&k.scope.accountId===(activeAccountStorageUid()||'')&&k.scope.threadId===host.__lourexAssistantThreadId;
      const safe=personalReady?children:children.map((child:any)=>{
        const classes=String(child?.props?.className||'').split(' ');
        if(classes.includes('lourex-ai-proposal'))return null;
        if(classes.includes('lourex-ai-messages'))return react.cloneElement(child,undefined,<p role="status">{label(host.props.language==='ar','Loading scoped conversation…','جارٍ تحميل المحادثة في نطاقها…')}</p>);
        return child;
      });
      return react.cloneElement(node,{'data-lourex-workspace':'2','data-workspace-ready':'false'},...safe);
    }
    const ar=host.props.language==='ar',k=host.__intelligenceKernel as ConversationKernel;
    const header=children.filter((child:any)=>['lourex-ai-head','lourex-ai-context'].some(name=>String(child?.props?.className||'').split(' ').includes(name)));
    const content=children.filter((child:any)=>!header.includes(child));
    const approval=content.find((child:any)=>String(child?.props?.className||'').split(' ').includes('lourex-ai-proposal')&&['document.createDraft','document.updateDraft'].includes(host.state.proposal?.capability));
    const open=Boolean(host.state.__workspaceOpen),pane=host.state.__workspacePane||'chat';
    const toolbar=<div className="lxw-toolbar"><label>{label(ar,'Focus','التخصص')}<select value={k.focus} disabled={disabled(host)} onChange={(event:any)=>dispatch(host,{kind:'focus',focus:event.target.value})}><option value="auto">{label(ar,'Auto','تلقائي')}</option><option value="operator">{label(ar,'Operator','تنفيذ')}</option><option value="advisor">{label(ar,'Advisor','استشاري')}</option><option value="financial">{label(ar,'Financial expert','خبير مالي')}</option></select></label><button type="button" aria-expanded={open} onClick={()=>host.setState({__workspaceOpen:!open,__workspacePane:open?'chat':'workspace'})}>{label(ar,'Workspace','مساحة العمل')}{k.artifact?' · '+k.artifact.revision:''}</button></div>;
    return react.cloneElement(node,{'data-lourex-workspace':'2','data-workspace-ready':'true','data-workspace-open':String(open),'data-workspace-pane':pane},...header,toolbar,<div className="lxw-body"><div className="lxw-chat">{content.filter((child:any)=>child!==approval)}{!open&&approval?<div className="lxw-collapsed-approval">{approval}</div>:null}</div>{open?<ArtifactWorkspace key={kernelScopeKey(k.scope)} host={host} approval={approval}/>:null}</div>);
  };return transform(tree);
}
export function installConversationWorkspace(host:Host):void {
  if(host.__workspaceInstalled)return;host.__workspaceInstalled=true;
  const refresh=async()=>{try{const previous=host.__intelligenceKernel?.scope&&kernelScopeKey(host.__intelligenceKernel.scope);await refreshIntelligenceWorkspace(host);if(host.mounted===false)return;if(previous&&previous!==kernelScopeKey(host.__intelligenceKernel.scope)){host.__lourexLatestContext=undefined;host.__lourexLastConversationSources=[];host.__lourexLastConversationFiles=[];}host.__workspaceObservedProps=host.props;host.forceUpdate();}catch(error){if(host.mounted!==false)host.setState({error:error instanceof Error?error.message:String(error)});}};
  const toggle=host.toggle.bind(host);host.toggle=()=>{toggle();if(host.state.open)void refresh();};
  const ask=host.ask.bind(host);host.ask=async(raw?:string)=>{await ask(raw);if(host.state.open)await refresh();};
  const dismiss=host.dismissProposal.bind(host);host.dismissProposal=()=>{if(disabled(host))return;dismiss();void dismissIntelligenceWorkspace(host).catch((error:Error)=>host.setState({error:error.message}));};
  // Immediately remove volatile UI references during scope/thread changes. Hydrate
  // the requested thread before redisplaying its encrypted working artifact.
  for(const name of ['__lourexSetScope','__lourexOpenThread','__lourexNewConversation','__lourexDeleteThread']){
    const old=host[name]?.bind(host);if(!old)continue;
    host[name]=async(...args:any[])=>{if(disabled(host))return;host.__intelligenceKernel=undefined;host.__foundationVault=undefined;host.__lourexLatestContext=undefined;host.__lourexLastConversationSources=[];host.__lourexLastConversationFiles=[];host.setState({__workspaceOpen:false,__workspacePane:'chat',__workspaceSavedId:'',__workspaceEditing:false,assistantEvidence:null,conversationAttachments:[],proposal:null,review:null});await old(...args);await refresh();};
  }
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
  if(previous!==host.props){host.__workspaceObservedProps=undefined;host.__foundationVault=undefined;host.__workspaceRefresh?.();}
}
export function unmountConversationWorkspace(host:Host):void {window.visualViewport?.removeEventListener('resize',host.__workspaceViewport);window.visualViewport?.removeEventListener('scroll',host.__workspaceViewport);window.removeEventListener('resize',host.__workspaceViewport);}
