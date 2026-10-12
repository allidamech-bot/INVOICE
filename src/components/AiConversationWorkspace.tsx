import { workspaceText, workspaceError } from '../lib/ai-workspace-presentation.js';
import { KnowledgeWorkspace, ReliabilityWorkspace, DiagnosticsWorkspace } from './AiReliabilityWorkspace.js';
import { strictAiActor } from '../lib/ai-foundation-approval.js';
import { CommercialWorkspace, MissionWorkspace } from './AiCommercialWorkspace.js';
import { workspaceDocument, workspaceDrafting, validateWorkspaceCard, type WorkspaceCard, type WorkspaceComponent, type WorkspaceDocument, type WorkspaceCommand } from '../lib/ai-workspace-model.js';
import { refreshIntelligenceWorkspace, updateIntelligenceWorkspace, dismissIntelligenceWorkspace, assignIntelligenceConversationMode, currentAiExperiencePreferences, updateAiExperiencePreferences, currentAiInterfaceLanguage } from '../lib/ai-intelligence-runtime.js';
import { normalizeAiConversationMode, conversationModeDescription, type AiConversationMode } from '../lib/ai-conversation-mode.js';
import { kernelScopeKey, type ConversationKernel } from '../lib/ai-conversation-kernel.js';
import { activeAccountStorageUid } from '../storage/db.js';
import { lineTotal, isNonNegativeDecimalInput } from '../lib/money.js';

// Narrow compatibility adapter: existing chat, composer, history, voice and guarded
// approval owners remain intact. All new presentation is precompiled TSX.
type Host=any;
const react=React as any;
// Text is rendered as React nodes only. Never interpret provider HTML or links.
function markdownInline(value:any,key:string):any {
  if(typeof value!=='string')return value; // preserve scoped evidence callbacks
  return value.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g).map((part,i)=>{
    const id=key+'-'+i;
    if(part.startsWith('**')&&part.endsWith('**'))return <strong key={id}>{part.slice(2,-2)}</strong>;
    if(part.startsWith('`')&&part.endsWith('`'))return <code key={id}>{part.slice(1,-1)}</code>;
    if(part.startsWith('*')&&part.endsWith('*'))return <em key={id}>{part.slice(1,-1)}</em>;
    return part;
  });
}
function markdownParagraphs(children:any[]):any[] {
  const result:any[]=[];let list:any[]=[];let listType='';
  const flush=()=>{if(list.length){result.push(react.createElement(listType,{key:'list-'+result.length},...list));list=[];listType='';}};
  children=children.flatMap(child=>{
    if(!react.isValidElement(child)||child.type!=='p')return [child];
    const parts=react.Children.toArray(child.props.children);
    if(!parts.every((part:any)=>typeof part==='string'))return [child];
    // Some providers flatten paragraph separators. Recover explicit heading
    // markers without inventing semantic blocks from ordinary punctuation.
    return parts.join('').replace(/\s+(?=#{1,6}\s)/g,'\n').split(/\r?\n/).filter(Boolean).map((line:string,i:number)=>react.createElement('p',{key:i},line));
  });
  children.forEach((child,index)=>{
    if(!react.isValidElement(child)||child.type!=='p'){flush();result.push(child);return;}
    const parts=react.Children.toArray(child.props.children),first=typeof parts[0]==='string'?parts[0]:'';
    const heading=first.match(/^\s*(#{1,6})\s+/),bullet=first.match(/^\s*(?:[-*•]|\d+[.)])\s+/);
    if(heading||bullet)parts[0]=first.slice((heading||bullet)![0].length);
    const formatted=parts.map((part:any,i:number)=>markdownInline(part,index+'-'+i));
    if(bullet){const kind=/\d/.test(bullet[0])?'ol':'ul';if(listType&&listType!==kind)flush();listType=kind;list.push(<li key={index}>{formatted}</li>);}
    else{flush();result.push(react.createElement(heading?((heading[1]||'').length<=2?'h3':'h4'):'p',{key:index},...formatted));}
  });flush();return result;
}
const label=(ar:boolean,en:string,arabic:string)=>ar?arabic:en;
const fieldLabel=(ar:boolean,value:string)=>value.replace(/incoterm|paymentTerms|deliveryTime|validity|remarks|notes|customer|descriptionEn|descriptionAr|quantity|unitPrice|unit/g,key=>({incoterm:label(ar,'Delivery terms','شروط التسليم'),paymentTerms:label(ar,'Payment terms','شروط الدفع'),deliveryTime:label(ar,'Delivery time','مدة التسليم'),validity:label(ar,'Validity','صلاحية العرض'),remarks:label(ar,'Remarks','ملاحظات إضافية'),notes:label(ar,'Notes','ملاحظات'),customer:label(ar,'Customer','العميل'),descriptionEn:label(ar,'English description','الوصف الإنجليزي'),descriptionAr:label(ar,'Arabic description','الوصف العربي'),quantity:label(ar,'Quantity','الكمية'),unitPrice:label(ar,'Unit price','سعر الوحدة'),unit:label(ar,'Unit','الوحدة')}[key]||key));
const disabled=(host:Host)=>Boolean(host.state.busy||host.applying||host.state.attachmentBusy||host.__workspaceCommandBusy||host.__workspaceModeSwitchBusy);
function dispatch(host:Host,command:WorkspaceCommand){void updateIntelligenceWorkspace(host,command);}
const aiUiAr=(host:Host):boolean=>currentAiInterfaceLanguage(host)==='ar';
function CardRows({card}:{card:WorkspaceCard}):any {
  return <dl className="lxw-facts">{card.rows.map(row=><div key={row.id}><dt>{row.label}</dt><dd>{row.detail||'—'}</dd></div>)}</dl>;
}
function Picker({card,onPick,busy,ar=false}:{ar?:boolean;card:WorkspaceCard;onPick?:(id:string)=>void;busy?:boolean}):any {
  const [query,setQuery]=React.useState(''),[page,setPage]=React.useState(0);
  const rows=card.rows.filter(row=>(row.label+' '+row.detail).normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').toLowerCase()));
  const visible=rows.slice(page*12,page*12+12);
  return <div className="lxw-picker"><input type="search" value={query} aria-label={label(ar,'Filter records','تصفية السجلات')} placeholder={label(ar,'Search name or SKU','ابحث بالاسم أو SKU')} onChange={(event:any)=>{setQuery(event.target.value);setPage(0);}}/><small>{rows.length} {label(ar,'matching records','سجل مطابق')}</small><div className="lxw-picker-list">{visible.map(row=><button type="button" key={row.id} disabled={busy||!onPick} onClick={()=>onPick?.(row.id)}><strong>{row.label}</strong><small>{row.detail}</small><code>{row.id}</code></button>)}{!rows.length?<p>{label(ar,'No matching records.','لا توجد سجلات مطابقة.')}</p>:null}</div>{rows.length>12?<nav className="lxw-pagination" aria-label={label(ar,'Record pages','صفحات السجلات')}><button type="button" disabled={page===0} onClick={()=>setPage(page-1)}>{label(ar,'Previous','السابق')}</button><span>{page+1} / {Math.ceil(rows.length/12)}</span><button type="button" disabled={(page+1)*12>=rows.length} onClick={()=>setPage(page+1)}>{label(ar,'Next','التالي')}</button></nav>:null}</div>;
}
const CARD_RENDERERS:Record<WorkspaceComponent,(props:any)=>any>={CustomerPicker:Picker,ProductPicker:Picker,EditablePricingGrid:CardRows,QuotePreview:CardRows,QuoteDiff:CardRows,AttachmentGallery:CardRows,EvidencePopover:CardRows,ApprovalDiff:CardRows,WorkflowProgress:CardRows,FinanceScenario:CardRows,SourceCompare:CardRows};
/** Descriptors choose a registered display only. Callbacks come exclusively from the host. */
export function RegisteredWorkspaceCard({descriptor,onPick,busy,ar=false}:{ar?:boolean;descriptor:unknown;onPick?:(id:string)=>void;busy?:boolean}):any {
  const card=validateWorkspaceCard(descriptor);if(!card)return null;
  const Component=CARD_RENDERERS[card.component];return <section data-workspace-component={card.component}><Component card={card} onPick={onPick} busy={busy} ar={ar}/></section>;
}
function CellEditor({value,numeric,onCommit,name,busy}:{value:string;numeric:boolean;onCommit:(value:string)=>void;name:string;busy:boolean}):any {
  const [input,setInput]=React.useState(value);
  return <input value={input} aria-label={name} inputMode={numeric?'decimal':'text'} dir={numeric?'ltr':undefined} maxLength={numeric?24:160} disabled={busy} onChange={(event:any)=>setInput(event.target.value)} onBlur={()=>{if(input!==value){onCommit(input);setInput(value);}}} onKeyDown={(event:any)=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}}/>;
}
/** Accessible, read-only document review. All amounts come from LOUREX money math,
 * never model-generated totals; missing/invalid prices remain visibly unknown. */
function QuotePreviewSummary({doc,ar}:{doc:WorkspaceDocument;ar:boolean}):any {
  const amount=(quantity:string,price:string):string=>{
    if(!quantity||!price||!isNonNegativeDecimalInput(quantity)||!isNonNegativeDecimalInput(price))return '—';
    try{return lineTotal(quantity,price);}catch{return '—';}
  };
  // An incomplete line must not be silently counted as zero in the preview.
  const subtotal=!doc.rows.length||doc.rows.some(row=>amount(row.quantity,row.unitPrice)==='—')||!isNonNegativeDecimalInput(doc.subtotal??'')?'—':doc.subtotal;
  return <div className="lxw-document-review" aria-label={label(ar,'Quotation or invoice review','مراجعة المستند المالي')}>
    <header className="lxw-review-banner">
      <span className="lxw-review-kicker">{label(ar,'LOUREX · Document review','LOUREX · مراجعة المستند')}</span>
      <strong>{doc.title||label(ar,'Document preview','معاينة المستند')}</strong>
      <span className="lxw-review-state">{doc.status==='saved'?label(ar,'Saved · read only','محفوظ · للقراءة'):label(ar,'Working draft · not saved','مسودة عمل · غير محفوظة')}</span>
    </header>
    <dl className="lxw-review-facts">
      <div><dt>{label(ar,'Customer','العميل')}</dt><dd>{doc.customer||label(ar,'Not selected','لم يحدد بعد')}</dd></div>
      <div><dt>{label(ar,'Currency','العملة')}</dt><dd dir="ltr">{doc.currency}</dd></div>
    </dl>
    <section className="lxw-review-section" aria-label={label(ar,'Items and prices','الأصناف والأسعار')}>
      <div className="lxw-review-heading"><strong>{label(ar,'Items and prices','الأصناف والأسعار')}</strong><span>{doc.rows.length} {label(ar,'lines','أصناف')}</span></div>
      {doc.rows.length?<ol className="lxw-review-items">{doc.rows.map((row,i)=>{
        const total=amount(row.quantity,row.unitPrice);
        const name=(ar?row.descriptionAr||row.descriptionEn:row.descriptionEn||row.descriptionAr)||label(ar,'Unnamed item','صنف بدون وصف');
        return <li key={row.id} className="lxw-review-item">
          <div className="lxw-review-item-heading"><span className="lxw-review-index" aria-hidden="true">{i+1}</span><strong>{name}</strong><b dir="ltr" className={total==='—'?'lxw-review-unknown':'lxw-review-amount'}>{total==='—'?'—':total+' '+doc.currency}</b></div>
          <dl><div><dt>{label(ar,'Quantity','الكمية')}</dt><dd dir="ltr">{row.quantity||'—'} {row.unit}</dd></div><div><dt>{label(ar,'Unit price','سعر الوحدة')}</dt><dd dir="ltr">{row.unitPrice||'—'} {doc.currency}</dd></div></dl>
          {total==='—'?<small className="lxw-review-unknown">{label(ar,'Price or quantity needs review','الكمية أو السعر يحتاج مراجعة')}</small>:null}
        </li>;
      })}</ol>:<p className="lxw-review-unknown">{label(ar,'No item lines yet.','لم تُضف أصناف بعد.')}</p>}
    </section>
    {doc.terms.length?<section className="lxw-review-section" aria-label={label(ar,'Commercial terms','الشروط التجارية')}><div className="lxw-review-heading"><strong>{label(ar,'Terms and delivery','الشروط والتسليم')}</strong></div><dl className="lxw-review-terms">{doc.terms.map((row,i)=><div key={i}><dt>{fieldLabel(ar,row.label)}</dt><dd>{row.value}</dd></div>)}</dl></section>:null}
    {doc.diff.length?<section className="lxw-review-section" aria-label={label(ar,'Pending changes','التغييرات للمراجعة')}><div className="lxw-review-heading"><strong>{label(ar,'Changes to review','الفروق قبل الاعتماد')}</strong><span>{doc.diff.length}</span></div><dl className="lxw-review-diff">{doc.diff.map((row,i)=><div key={i}><dt>{fieldLabel(ar,row.field)}</dt><dd><span>{row.before||'—'}</span><span aria-hidden="true">→</span><strong>{row.after||'—'}</strong></dd></div>)}</dl></section>:null}
    <div className="lxw-review-subtotal"><span>{label(ar,'Item subtotal','المجموع الفرعي للأصناف')}</span><strong dir="ltr">{subtotal==='—'?'—':subtotal+' '+doc.currency}</strong></div>
    <p className="lxw-review-disclaimer">{doc.status==='saved'?label(ar,'Read-only record. This item subtotal excludes tax, discounts and freight; the original document has the complete totals.','سجل للقراءة فقط. المجموع الفرعي للأصناف لا يشمل الضريبة والخصومات والشحن؛ الإجماليات الكاملة في المستند الأصلي.'):label(ar,'Review-only draft. This item subtotal excludes tax, discounts and freight. Nothing is saved by opening this preview.','مسودة للمراجعة فقط. المجموع الفرعي لا يشمل الضريبة والخصومات والشحن؛ فتح هذه المعاينة لا يحفظ أي شيء.')}</p>
    {doc.blockers.length?<div className="lxw-review-warnings" role="status"><strong>{label(ar,'Complete before approval','أكمل قبل الموافقة')}</strong><ul>{doc.blockers.map((value,i)=><li key={i}>{value}</li>)}</ul></div>:null}
  </div>;
}
function PricingGrid({host,doc,editable}:{host:Host;doc:WorkspaceDocument;editable:boolean}):any {
  const [page,setPage]=React.useState(0),ar=aiUiAr(host),rows=doc.rows.slice(page*10,page*10+10);
  const fields=['descriptionEn','descriptionAr','quantity','unit','unitPrice'] as const;
  const names=[label(ar,'Description','الوصف'),label(ar,'Arabic description','الوصف العربي'),label(ar,'Quantity','الكمية'),label(ar,'Unit','الوحدة'),label(ar,'Unit price','سعر الوحدة')];
  return <section data-workspace-component="EditablePricingGrid"><div className="lxw-table-scroll" tabIndex={0} aria-label={label(ar,'Pricing grid; scroll for all columns','جدول الأسعار؛ مرر لرؤية الأعمدة')}><table className="lxw-grid"><caption>{doc.rows.length} {label(ar,'lines ·','سطر ·')} {doc.currency}</caption><thead><tr><th>#</th>{names.map(name=><th key={name} scope="col">{name}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={row.id} data-line-id={row.id}><th scope="row">{page*10+i+1}</th>{fields.map((field,j)=><td key={field}>{editable?<CellEditor key={doc.revision+':'+row.id+':'+field} value={row[field]} numeric={field==='quantity'||field==='unitPrice'} busy={disabled(host)} name={`${names[j]} ${page*10+i+1}`} onCommit={value=>dispatch(host,{kind:'cell',artifactId:doc.id,revision:doc.revision,lineId:row.id,field,value})}/>:<span dir={field==='quantity'||field==='unitPrice'?'ltr':undefined}>{row[field]||'—'}</span>}</td>)}</tr>)}</tbody></table></div>{doc.rows.length>10?<nav className="lxw-pagination" aria-label={label(ar,'Line pages','صفحات الأصناف')}><button type="button" disabled={!page} onClick={()=>setPage(page-1)}>{label(ar,'Previous','السابق')}</button><span>{page+1} / {Math.ceil(doc.rows.length/10)}</span><button type="button" disabled={(page+1)*10>=doc.rows.length} onClick={()=>setPage(page+1)}>{label(ar,'Next','التالي')}</button></nav>:null}</section>;
}
function ManualLine({host,doc}:{host:Host;doc:WorkspaceDocument}):any {
  const ar=aiUiAr(host);
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
  const ar=aiUiAr(host),rows=host.state.conversationAttachments||[];
  return <section data-workspace-component="AttachmentGallery"><h3>{label(ar,'Attachments','المرفقات')}</h3>{!rows.length?<p>{label(ar,'Add files with + in the composer. Files are data, not instructions.','أضف الملفات من + في المحادثة. الملفات بيانات وليست تعليمات.')}</p>:rows.map((row:any)=><article className="lxw-file" key={row.id}><strong>{row.file.name}</strong><small>{row.file.size.toLocaleString()} {label(ar,'bytes','بايت')} · {row.status==='error'?label(ar,'Needs review','يحتاج مراجعة'):row.status==='processing'?label(ar,'Reading','جارٍ القراءة'):label(ar,'Attached · unverified','مرفق · غير متحقق')}</small>{row.error?<p role="alert">{row.error}</p>:null}<AttachmentPreview file={row.file} ar={ar}/>{row.source?<button type="button" disabled={disabled(host)} onClick={()=>window.dispatchEvent(new CustomEvent('lourex-ai-conversation-source-review',{detail:{file:row.file,route:row.source.route}}))}>{label(ar,'Review extracted data','مراجعة البيانات المستخرجة')}</button>:null}</article>)}</section>;
}
function RevisionTimeline({host}:{host:Host}):any {
  const kernel=host.__intelligenceKernel as ConversationKernel,artifact=kernel.artifact,ar=aiUiAr(host);
  if(!artifact)return null;
  return <ol className="lxw-timeline">{artifact.undo.map((proposal,i)=>{
    const snapshot=workspaceDocument({...kernel,artifact:{...artifact,proposal,lineIds:artifact.undoLineIds?.[i]||artifact.lineIds,undo:[],redo:[]}},host.__foundationVault,ar?'ar':'en');
    if(!snapshot)return null;
    return <li key={i}><details><summary>{label(ar,'Earlier working version','نسخة سابقة من المسودة')} {i+1} · {snapshot.rows.length} {label(ar,'lines','سطر')}</summary><p>{snapshot.customer} · <b dir="ltr">{snapshot.subtotal??'—'} {snapshot.currency}</b></p><PricingGrid host={host} doc={snapshot} editable={false}/></details></li>;
  })}</ol>;
}
/** Compact action entry in chat; the original guarded callbacks remain the
 * only execution owners. Approval buttons appear only after explicit review. */
/** Per-account, AI-only preferences. The host owns state, and encrypted
 * persistence reuses the serialized assistant-store queue (no site setting writes). */
function AiExperienceSettings({host}:{host:Host}):any {
  const ar=aiUiAr(host),prefs=currentAiExperiencePreferences(host);
  const saving=Boolean(host.state.__workspaceSettingsSaving);
  const update=(patch:any)=>{if(!saving)void updateAiExperiencePreferences(host,patch);};
  const field=(id:string,titleEn:string,titleAr:string,helpEn:string,helpAr:string,value:string,choices:{value:string;en:string;ar:string}[],key:string)=>
    <label className="lxw-settings-field" htmlFor={id}><strong>{label(ar,titleEn,titleAr)}</strong><small>{label(ar,helpEn,helpAr)}</small>
      <select id={id} value={value} disabled={saving} onChange={(event:any)=>update({[key]:event.target.value})}>
        {choices.map(option=><option key={option.value} value={option.value}>{label(ar,option.en,option.ar)}</option>)}
      </select>
    </label>;
  return <section className="lxw-settings" role="region" aria-label={label(ar,'LOUREX AI settings','إعدادات LOUREX AI')}>
    <header className="lxw-settings-head"><div><strong>{label(ar,'AI preferences','تفضيلات المساعد')}</strong><small>{label(ar,'Independent from the main LOUREX site settings','مستقلة عن إعدادات موقع LOUREX')}</small></div><button type="button" onClick={()=>host.setState({__workspaceSettingsOpen:false})}>{label(ar,'Done','تم')}</button></header>
    {field('lxw-ui-language','AI interface language','لغة واجهة المحادثة','Does not change the main site language.','لا تغيّر لغة الموقع الرئيسية.',prefs.interfaceLanguage,[{value:'inherit',en:'Same as site',ar:'مثل لغة الموقع'},{value:'ar',en:'Arabic',ar:'العربية'},{value:'en',en:'English',ar:'الإنجليزية'}],'interfaceLanguage')}
    {field('lxw-reply-language','Answer language','لغة الإجابات','The language to request from LOUREX AI.','اللغة المطلوبة لردود LOUREX AI.',prefs.replyLanguage,[{value:'auto',en:'Follow the conversation',ar:'حسب المحادثة'},{value:'ar',en:'Arabic',ar:'العربية'},{value:'en',en:'English',ar:'الإنجليزية'}],'replyLanguage')}
    {field('lxw-response-detail','Response length','تفصيل الإجابات','Choose how much detail to request in analysis.','حدّد مقدار التفاصيل المطلوب في التحليل.',prefs.detail,[{value:'balanced',en:'Balanced',ar:'متوازن'},{value:'brief',en:'Concise',ar:'مختصر'},{value:'detailed',en:'Detailed',ar:'مفصل'}],'detail')}
    {field('lxw-motion','Motion and transitions','الحركة والانتقالات','Use device preference or reduce optional animations.','اتبع إعداد الجهاز أو خفف المؤثرات الاختيارية.',prefs.motion,[{value:'system',en:'Follow device',ar:'حسب الجهاز'},{value:'reduced',en:'Reduce motion',ar:'تقليل الحركة'}],'motion')}
    <div className="lxw-settings-info"><strong>{label(ar,'Voice and permissions','الصوت والصلاحيات')}</strong><p>{label(ar,'Voice text remains editable before sending. Advisor stays read-only regardless of these settings.','يظل النص الصوتي قابلًا للمراجعة قبل الإرسال. ويبقى المستشار للقراءة والتحليل فقط مهما تغيّرت الإعدادات.')}</p></div>
    {host.state.__workspaceSettingsError?<p role="alert" className="lxw-settings-error">{host.state.__workspaceSettingsError}</p>:null}
    {saving?<p role="status" className="lxw-settings-note">{label(ar,'Saving preferences…','جارٍ حفظ التفضيلات…')}</p>:null}
  </section>;
}
/** Generic Controller suggestions stay compact, including navigation.
 * Non-navigation actions retain the exact legacy approval buttons and
 * require opening details plus an explicit acknowledgement before exposure. */
/** Decline is always allowed. A short exit motion runs before invoking the
 * original dismiss callback. Stale-proposal and unmount checks cancel the
 * animation without ever authorizing or changing a business record. */
function useInlineDecline(host:Host,proposal:any):{exiting:boolean;wrap:(button:any)=>any}{
  const [exiting,setExiting]=React.useState(false);
  const timer=react.useRef(null);
  React.useEffect(()=>{setExiting(false);return()=>{if(timer.current)window.clearTimeout(timer.current);};},[proposal]);
  const wrap=(button:any)=>react.cloneElement(button,{
    disabled:Boolean(button.props?.disabled||exiting),
    onClick:()=>{
      if(exiting||timer.current||host.state.proposal!==proposal)return;
      const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||document.getElementById('lourex-ai-panel')?.getAttribute('data-ai-motion')==='reduced';
      if(reduced){timer.current=-1;button.props?.onClick?.();return;}
      setExiting(true);
      timer.current=window.setTimeout(()=>{
        timer.current=null;
        if(host.state.proposal===proposal)button.props?.onClick?.();
      },160);
    }
  });
  return{exiting,wrap};
}
function InlineGeneralProposal({host,proposalNode,ar}:{host:Host;proposalNode:any;ar:boolean}):any {
  const proposal=host.state.proposal;
  const [expanded,setExpanded]=React.useState(false);
  const [reviewedProposal,setReviewedProposal]=React.useState<any>(null);
  const dismissal=useInlineDecline(host,proposal);
  if(!proposal||!proposalNode)return null;
  const children=react.Children.toArray(proposalNode.props?.children);
  const actions=children.find((node:any)=>String(node?.props?.className||'').split(' ').includes('lourex-ai-proposal-actions'));
  const buttons=actions?react.Children.toArray((actions as any).props.children):[];
  const primary=buttons.find((button:any)=>String(button?.props?.className||'').includes('primary'));
  const other=buttons.filter((button:any)=>button!==primary).map((button:any)=>dismissal.wrap(button));
  const isNavigation=proposal.capability==='workspace.navigate';
  const reviewed=reviewedProposal===proposal;
  return <section className="lxw-inline-general" data-exiting={dismissal.exiting?'true':'false'} aria-label={label(ar,'Suggested action','إجراء مقترح')}>
    <div className="lxw-inline-general-heading"><span>{label(ar,'LOUREX suggests','يقترح LOUREX')}</span><strong>{proposal.label||label(ar,'Review an action','مراجعة إجراء')}</strong></div>
    {isNavigation?<div className="lxw-inline-general-row">
      {primary?react.cloneElement(primary,{className:'lxw-inline-open'},label(ar,'Open section','فتح القسم')):null}
      {other.length?<div className="lxw-inline-secondary">{other}</div>:null}
    </div>:<>
      <div className="lxw-inline-general-row">
        <button type="button" className="lxw-inline-preview-button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{label(ar,expanded?'Hide details':'Review details',expanded?'إخفاء التفاصيل':'عرض التفاصيل')}</button>
        {buttons.length?<div className="lxw-inline-approval-buttons" role="group" aria-label={label(ar,'Approve or decline','الموافقة أو الرفض')}>{other}{reviewed&&primary?primary:null}</div>:null}
      </div>
      {expanded?<div className="lxw-inline-general-detail" role="region" aria-label={label(ar,'Action details','تفاصيل الإجراء')}>
        {children.filter((child:any)=>child!==actions)}
        {!reviewed?<button type="button" className="lxw-inline-review-confirm" disabled={disabled(host)} onClick={()=>{host.setState({__workspaceReviewedProposal:proposal});setReviewedProposal(proposal);setExpanded(false);}}>{label(ar,'I reviewed this action','اطلعت على الإجراء')}</button>:null}
      </div>:null}
      {reviewed&&!buttons.length?<p role="status">{label(ar,'Action controls are unavailable. Nothing was executed.','أزرار الإجراء غير متاحة. لم يُنفّذ أي شيء.')}</p>:null}
    </>}
  </section>;
}
function InlineDocumentApproval({host,approval,ar}:{host:Host;approval:any;ar:boolean}):any {
  const dismissal=useInlineDecline(host,host.state.proposal);
  if(!approval||!host.state.proposal)return null;
  const reviewed=host.state.__workspaceReviewedProposal===host.state.proposal;
  const actions=react.Children.toArray(approval.props?.children).find((child:any)=>
    String(child?.props?.className||'').split(' ').includes('lourex-ai-proposal-actions'));
  const originalButtons=actions?react.Children.toArray((actions as any).props.children):[];
  const originalConfirm=originalButtons.find((button:any)=>String(button?.props?.className||'').includes('primary'));
  const confirm=originalConfirm?react.cloneElement(originalConfirm,{'aria-label':label(ar,'Approve draft','اعتماد المسودة')},label(ar,'Approve draft','اعتماد المسودة')):null;
  const decline=originalButtons.filter((button:any)=>button!==originalConfirm).map((button:any)=>react.cloneElement(dismissal.wrap(button),{'aria-label':label(ar,'Decline','رفض')},label(ar,'Decline','رفض')));
  return <section className="lxw-inline-approval" data-exiting={dismissal.exiting?'true':'false'} aria-label={label(ar,'Document approval suggestion','اقتراح اعتماد مستند')}>
    <div className="lxw-inline-approval-title">
      <strong>{label(ar,'Draft ready for review','المسودة جاهزة للمراجعة')}</strong>
      <small>{label(ar,'No changes are saved by previewing.','المعاينة لا تحفظ أي تغيير.')}</small>
    </div>
    <div className="lxw-inline-approval-row">
      <button type="button" className="lxw-inline-preview-button" disabled={disabled(host)} onClick={()=>host.setState({__workspaceOpen:true,__workspacePane:'workspace',__workspaceTab:'preview',__workspaceSavedId:'',__workspaceEditing:false})}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>
        {label(ar,'Review details','عرض التفاصيل')}
      </button>
      {originalButtons.length?<div className="lxw-inline-approval-buttons" role="group" aria-label={label(ar,'Approval decision','قرار الاعتماد')}>{decline}{reviewed&&confirm?confirm:null}</div>:null}
    </div>
    {reviewed&&!originalButtons.length?<p role="status" className="lxw-review-unknown">{label(ar,'Approval controls could not load. No action was executed.','تعذر تحميل أزرار الاعتماد. لم يُنفّذ أي إجراء.')}</p>:null}
  </section>;
}
function ArtifactWorkspace({host,approval}:{host:Host;approval:any}):any {
  const kernel=host.__intelligenceKernel as ConversationKernel,vault=host.__foundationVault,ar=aiUiAr(host);
  let doc:WorkspaceDocument|null=null,error='';try{doc=workspaceDocument(kernel,vault,ar?'ar':'en',host.state.__workspaceSavedId||(!kernel.artifact&&kernel.entity?.entityType==='document'?kernel.entity.entityId:''));}catch(e){error=e instanceof Error?e.message:String(e);}
  const tab=host.state.__workspaceTab||'preview',editable=Boolean(host.state.__workspaceEditing&&doc?.status==='draft');
  const choose=(value:string)=>host.setState({__workspaceTab:value});
  const viewGroups=[
    {id:'document',label:label(ar,'Document','المستند'),views:[['preview','Preview','المعاينة'],['edit','Edit','تعديل'],['customer','Customer','العميل'],['product','Products','الأصناف'],['files','Files','الملفات'],['revisions','Revisions','التعديلات']]},
    {id:'commercial',label:label(ar,'Business','الأعمال'),views:[['commercial','Deal studio','استوديو الصفقة'],['missions','Missions','المهام']]},
    {id:'analysis',label:label(ar,'Insights','التحليلات'),views:[['evidence','Evidence','الأدلة'],['knowledge','Memory','الذاكرة'],['reliability','Review','المراجعة'],['diagnostics','Reliability','الموثوقية']]},
  ] as Array<{id:string;label:string;views:Array<[string,string,string]>}>;
  const activeGroup=viewGroups.find(group=>group.views.some(view=>view[0]===tab))||viewGroups[0]!;
  const chooseGroup=(id:string)=>{const group=viewGroups.find(row=>row.id===id);const first=group?.views[0];if(first)host.setState({__workspaceTab:first[0]});};

  const drafting=workspaceDrafting(vault,kernel.artifact?.proposal.capability==='document.updateDraft'?kernel.artifact.proposal.documentId:'');
  const pick=(kind:'customer'|'product',id:string)=>{if(doc?.status==='draft')dispatch(host,{kind,artifactId:doc.id,revision:doc.revision,entityId:id});};
  const evidence=host.__lourexLatestContext?.advisorV2?.evidence||[];
  return <aside className="lxw-artifact" aria-label={label(ar,'Document workspace','مساحة المستند')}><header className="lxw-artifact-head"><div><strong>{workspaceText(ar,doc?.title||'')||label(ar,'Your workspace','مساحة عملك')}</strong><span className={'lxw-badge '+(doc?.status||'empty')}>{!doc?label(ar,'No document open','لا يوجد مستند مفتوح'):doc.status==='saved'?label(ar,'Saved in LOUREX','محفوظ في LOUREX'):label(ar,'Draft · unsaved','مسودة · غير محفوظة')}</span></div><button type="button" className="lxw-back" onClick={()=>host.setState({__workspacePane:'chat',__workspaceOpen:false})}>{label(ar,'Back to chat','العودة للمحادثة')}</button></header><div className="lxw-view-navigation">
    <nav className="lxw-view-groups" aria-label={label(ar,'Workspace areas','أقسام مساحة العمل')}>
      {viewGroups.map(group=><button key={group.id} type="button" aria-pressed={activeGroup.id===group.id} onClick={()=>chooseGroup(group.id)}>{group.label}</button>)}
    </nav>
    <nav className="lxw-view-options" aria-label={label(ar,'Current area views','عروض القسم الحالي')}>
      {activeGroup.views.map(([value,en,arabic])=><button key={value} type="button" aria-current={tab===value?'page':undefined} onClick={()=>choose(value)}>{label(ar,en,arabic)}</button>)}
    </nav>
  </div><div className="lxw-artifact-content">{error||host.state.error?<p role="alert">{workspaceError(ar,error||host.state.error)}</p>:null}
    {(tab==='preview'||tab==='edit')&&doc?<section data-workspace-component="QuotePreview">
      {tab==='preview'?<QuotePreviewSummary doc={doc} ar={ar}/>:<>
        <p><strong>{doc.customer||label(ar,'Select a customer','حدد العميل')}</strong> · <b dir="ltr">{doc.currency}</b></p>
        {doc.status==='draft'?<div className="lxw-revision-controls"><span>{label(ar,'Revision','التعديل')} {doc.revision}</span><button type="button" disabled={!kernel.artifact?.undo.length||disabled(host)} onClick={()=>dispatch(host,{kind:'undo',artifactId:doc.id,revision:doc.revision})}>{label(ar,'Undo','تراجع')}</button><button type="button" disabled={!kernel.artifact?.redo.length||disabled(host)} onClick={()=>dispatch(host,{kind:'redo',artifactId:doc.id,revision:doc.revision})}>{label(ar,'Redo','إعادة')}</button><button type="button" aria-pressed={editable} disabled={disabled(host)} onClick={()=>host.setState({__workspaceEditing:!editable})}>{label(ar,editable?'Finish editing':'Edit draft cells',editable?'إنهاء التعديل':'تعديل خانات المسودة')}</button></div>:null}
        <PricingGrid key={doc.id+':edit'} host={host} doc={doc} editable={editable}/>
        {doc.status==='draft'?<ManualLine key={doc.id} host={host} doc={doc}/>:null}
        <div className="lxw-subtotal"><span>{label(ar,'Item subtotal','المجموع الفرعي للأصناف')}</span><b dir="ltr">{doc.subtotal??'—'} {doc.currency}</b></div>
        <p className="lxw-note">{label(ar,'Working items exclude taxes, freight and discounts. Review the full document before saving.','مجموع الأصناف لا يشمل الضرائب والشحن والخصومات. راجع المستند كاملًا قبل الحفظ.')}</p>
      </>}
    </section>:null}
    {(tab==='preview'||tab==='edit')&&!doc?<p>{label(ar,'Ask LOUREX to prepare a quotation, or open a saved document from the chat.','اطلب من LOUREX تجهيز عرض سعر، أو افتح مستندًا محفوظًا من المحادثة.')}</p>:null}
    {tab==='customer'?<><h3>{label(ar,'Choose the exact customer','اختر العميل المحدد')}</h3><RegisteredWorkspaceCard ar={ar} descriptor={{component:'CustomerPicker',rows:drafting.customers.map(row=>({id:row.id,label:row.name,detail:row.preferredCurrency+' · '+row.paymentTerms}))}} busy={disabled(host)||doc?.status!=='draft'||kernel.artifact?.proposal.capability!=='document.createDraft'} onPick={id=>pick('customer',id)}/></>:null}
    {tab==='product'?<><h3>{label(ar,'Add a product to this draft','أضف صنفًا لهذه المسودة')}</h3><RegisteredWorkspaceCard ar={ar} descriptor={{component:'ProductPicker',rows:drafting.items.map(row=>({id:row.id,label:row.name,detail:[row.sku,row.unit,row.lastUnitPrice,row.lastCurrency].filter(Boolean).join(' · ')}))}} busy={disabled(host)||doc?.status!=='draft'} onPick={id=>pick('product',id)}/><p className="lxw-note">{label(ar,'A recorded price is used only when its currency matches. Otherwise enter a price; no FX rate is inferred.','يستخدم السعر المسجل عند تطابق العملة فقط. خلاف ذلك أدخل السعر؛ لا يُفترض سعر صرف.')}</p></>:null}
    {tab==='knowledge'?<KnowledgeWorkspace key={kernelScopeKey(kernel.scope)} host={host}/>:null}
    {tab==='reliability'?<ReliabilityWorkspace key={kernelScopeKey(kernel.scope)} host={host}/>:null}
    {tab==='diagnostics'?<DiagnosticsWorkspace key={kernelScopeKey(kernel.scope)} host={host}/>:null}
    {tab==='commercial'?<CommercialWorkspace key={doc?.id||'new'} host={host} doc={doc}/>:null}
    {tab==='missions'?<MissionWorkspace host={host}/>:null}
    {tab==='files'?<AttachmentGallery host={host}/>:null}
    {tab==='revisions'?<><h3>{label(ar,'Latest revision diff','فروق آخر تعديل')}</h3><RegisteredWorkspaceCard ar={ar} descriptor={{component:'QuoteDiff',rows:(doc?.diff||[]).map((row,i)=>({id:String(i),label:fieldLabel(ar,row.field),detail:(row.before||'—')+' → '+(row.after||'—')}))}}/><p>{kernel.artifact?.undo.length||0} {label(ar,'earlier working revisions. Undo changes drafts only.','تعديل سابق في المسودة. التراجع يغير المسودة فقط.')}</p><RevisionTimeline host={host}/></>:null}
    {tab==='evidence'?<><h3>{label(ar,'Evidence','الأدلة')}</h3><RegisteredWorkspaceCard ar={ar} descriptor={{component:'EvidencePopover',rows:evidence.map((row:any,i:number)=>({id:String(row.id||i),label:String(row.source||''),detail:String(row.fact||'')}))}}/>{!evidence.length?<p>{label(ar,'No evidence in the current response.','لا يوجد دليل في الرد الحالي.')}</p>:null}<span className="lxw-badge saved">{label(ar,'Scoped LOUREX evidence','أدلة LOUREX ضمن النطاق')}</span></>:null}
    {approval&&doc?.status==='draft'?<section className="lxw-approval" data-workspace-component="ApprovalDiff">
      <h3>{label(ar,'Review before saving','راجع قبل الحفظ')}</h3>
      <p>{label(ar,'Check the full contents, missing data and differences. Confirm review to reveal the decision buttons in chat.','افحص جميع البنود والبيانات الناقصة والفروق، ثم أكّد المراجعة لإظهار زري القرار في المحادثة.')}</p>
      <button type="button" className="lxw-review-complete" disabled={disabled(host)||Boolean(doc.blockers.length)} onClick={()=>host.setState({__workspaceReviewedProposal:host.state.proposal,__workspaceOpen:false,__workspacePane:'chat',__workspaceTab:'preview'})}>{label(ar,'I reviewed the details','اطلعت على التفاصيل')}</button>
      {doc.blockers.length?<p role="status" className="lxw-review-unknown">{label(ar,'Resolve the listed issues before approval.','يجب معالجة الملاحظات المعروضة قبل الاعتماد.')}</p>:null}
    </section>:null}
  </div></aside>;
}
function workspaceVisible(host:Host):boolean {
  const k=host.__intelligenceKernel as ConversationKernel|undefined,v=host.__foundationVault;if(!k||!v||k.scope.scope==='personal'||host.__workspaceObservedProps!==host.props)return false;
  try{strictAiActor(v);}catch{return false;}
  return k.scope.accountId===(activeAccountStorageUid()||'')&&k.scope.scope===(host.state.assistantScope||'business')&&k.scope.threadId===host.__lourexAssistantThreadId&&k.scope.workspaceId===(v.appSettings.activeWorkspaceId||'default')&&k.scope.branchId===(v.appSettings.activeBranchId||'main');
}
export function clearConversationToolPresentation(host:Host):void {
  host.__lourexToolPresentation=null;
  host.__lourexLastToolAudit='';
  host.__foundationToolOutcomes=[];
}
function conversationModeTabs(host:Host,mode:AiConversationMode|undefined,locked:boolean):any {
  const ar=aiUiAr(host);
  return <nav className="lxw-mode-tabs" role="tablist" aria-label={label(ar,'Conversation modes','نوع المحادثة')}>
    {(['controller','advisor'] as const).map(value=><button key={value} type="button" role="tab" aria-selected={mode===value} disabled={locked} onClick={()=>void host.__workspaceSwitchMode?.(value)}>{value==='controller'?label(ar,'Controller','المتحكم'):label(ar,'Advisor','المستشار')}</button>)}
  </nav>;
}
/** The legacy conversation-context container is hidden by the workspace shell.
 * History must have its own visible, scoped UI instead of relying on that DOM. */
function AiConversationHistory({host,ar}:{host:Host;ar:boolean}):any {
  const [query,setQuery]=react.useState('');
  const rows=(Array.isArray(host.__businessThreads)?host.__businessThreads:[])
    .filter((row:any)=>row&&typeof row.id==='string')
    .filter((row:any)=>{
      const needle=String(query||'').trim().toLocaleLowerCase();
      return !needle||String(row.title||'').toLocaleLowerCase().includes(needle);
    })
    .sort((a:any,b:any)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  const busy=disabled(host)||Boolean(host.state.__workspaceHistoryBusy);
  const openThread=async(id:string)=>{
    if(busy)return;
    host.setState({__workspaceHistoryBusy:true,__workspaceHistoryError:''});
    try{await host.__lourexOpenThread(id);host.setState({__workspaceHistoryOpen:false});}
    catch(error){host.setState({__workspaceHistoryError:error instanceof Error?error.message:String(error)});}
    finally{host.setState({__workspaceHistoryBusy:false});}
  };
  const newThread=async()=>{
    if(busy)return;
    const previousMode=normalizeAiConversationMode(host.__intelligenceKernel?.mode);
    host.setState({__workspaceHistoryBusy:true,__workspaceHistoryError:''});
    try{
      await host.__lourexNewConversation();
      if(previousMode==='advisor')await assignIntelligenceConversationMode(host,'advisor');
      host.setState({__workspaceHistoryOpen:false});
    }catch(error){host.setState({__workspaceHistoryError:error instanceof Error?error.message:String(error)});}
    finally{host.setState({__workspaceHistoryBusy:false});}
  };
  return <section className="lxw-history" aria-label={label(ar,'Saved conversations','المحادثات المحفوظة')}>
    <header className="lxw-history-head">
      <button type="button" disabled={busy} onClick={()=>host.setState({__workspaceHistoryOpen:false,__workspaceHistoryError:''})} aria-label={label(ar,'Back to chat','العودة للمحادثة')}>←</button>
      <strong>{label(ar,'Conversations','المحادثات')}</strong>
      <button type="button" disabled={busy} onClick={()=>void newThread()}>{label(ar,'New','جديدة')}</button>
    </header>
    <input className="lxw-history-search" type="search" value={query} onChange={(event:any)=>setQuery(event.target.value)} aria-label={label(ar,'Search conversation titles','البحث في عناوين المحادثات')} placeholder={label(ar,'Search saved conversations…','ابحث في المحادثات المحفوظة…')}/>
    {host.state.__workspaceHistoryError?<p role="alert" className="lxw-history-error">{workspaceError(ar,String(host.state.__workspaceHistoryError))}</p>:null}
    <div className="lxw-history-list" role="list">
      {rows.map((row:any)=><div role="listitem" key={row.id}>
        <button type="button" className="lxw-history-row" disabled={busy} aria-current={row.id===host.__lourexAssistantThreadId?'page':undefined} onClick={()=>void openThread(row.id)}>
          <span className="lxw-history-row-title" dir="auto">{row.title||label(ar,'Untitled conversation','محادثة بلا عنوان')}</span>
          <span className="lxw-history-row-meta"><small>{normalizeAiConversationMode(row.mode)==='advisor'?label(ar,'Advisor','المستشار'):label(ar,'Controller','المتحكم')}</small><small>{row.updatedAt?new Date(row.updatedAt).toLocaleDateString(ar?'ar':'en',{day:'numeric',month:'short'}):''}</small></span>
        </button>
      </div>)}
      {!rows.length?<p className="lxw-history-empty">{query?label(ar,'No matching conversation titles.','لا توجد محادثات مطابقة للبحث.'):label(ar,'No saved conversations in this company or branch.','لا توجد محادثات محفوظة لهذه الشركة أو الفرع.')}</p>:null}
    </div>
  </section>;
}

export function renderConversationWorkspace(host:Host,tree:any):any {
  const transform=(node:any):any=>{
    if(typeof node==='string')return workspaceText(aiUiAr(host),node);
    if(!react.isValidElement(node))return node;
    const cn=String(node.props?.className||''),children=react.Children.toArray(node.props?.children).map(transform);
    if(cn.split(' ').includes('lourex-ai-busy'))return react.cloneElement(node,undefined,label(aiUiAr(host),'LOUREX AI is reviewing…','LOUREX AI يراجع الطلب…'));
    if(cn.split(' ').includes('lourex-ai-premium-textarea')){
      const prompt=label(aiUiAr(host),'Ask LOUREX…','اسأل LOUREX…');
      return react.cloneElement(node,{placeholder:prompt,'aria-label':prompt});
    }
    if(cn.split(' ').includes('lourex-ai-message-action')){
      const actions:Record<string,[string,string]>={copy:['Copy','نسخ'],edit:['Edit','تعديل'],retry:['Retry','إعادة المحاولة'],reask:['Re-ask','اسأل مجددًا'],helpful:['Helpful','مفيد'],'not-helpful':['Not helpful','غير مفيد'],more:['More','المزيد']};
      const action=Object.entries(actions).find(([key])=>cn.split(' ').includes('is-'+key));
      if(action){const name=label(aiUiAr(host),...action[1]);return react.cloneElement(node,{'aria-label':name,title:name},...children);}
    }
    if(cn.split(' ').includes('lourex-ai-close'))return react.cloneElement(node,{'aria-label':label(aiUiAr(host),'Close','إغلاق'),title:label(aiUiAr(host),'Close','إغلاق')},...children);
    if(cn.split(' ').includes('lourex-ai-overflow-trigger'))return react.cloneElement(node,{'aria-label':label(aiUiAr(host),'Conversation menu','قائمة المحادثة')},...children);
    if(cn.split(' ').includes('lourex-ai-overflow-menu')){
      const names=[label(aiUiAr(host),'New conversation','محادثة جديدة'),label(aiUiAr(host),'Conversations','المحادثات')];
      return react.cloneElement(node,undefined,...children.map((button:any,i:number)=>{
        if(!react.isValidElement(button)||!names[i])return button;
        const parts=react.Children.toArray(button.props.children);
        return react.cloneElement(button,i===1?{onClick:(event:any)=>{button.props?.onClick?.(event);host.setState({__workspaceHistoryOpen:true,__workspaceHistoryError:'',__workspaceSettingsOpen:false,__workspaceOpen:false,__workspacePane:'chat'});}}:undefined,parts[0],<span>{names[i]}</span>);
      }));
    }
    if(cn.split(' ').includes('lourex-ai-answer-copy'))return react.cloneElement(node,{className:cn+' lxw-markdown'},...markdownParagraphs(children));
    if(cn.split(' ').includes('lourex-ai-message')&&(cn.split(' ').includes('user')||cn.split(' ').includes('assistant'))){
      const sender=cn.split(' ').includes('user')?'user':'assistant';
      const actions=children.filter((child:any)=>String(child?.props?.className||'').split(' ').includes('lourex-ai-message-actions'));
      const content=children.filter((child:any)=>!actions.includes(child));
      // Keep the bubble sized to its content. Action controls remain outside it
      // and retain their original copy/edit/retry/evidence callbacks.
      return react.createElement('div',{className:'lxw-message-turn is-'+sender},react.cloneElement(node,{dir:'auto'},...content),...actions);
    }
    if(cn.split(' ').includes('lourex-ai-launcher')&&workspaceVisible(host))return react.cloneElement(node,{'data-ai-motion':currentAiExperiencePreferences(host).motion},...children);
    if(cn.split(' ').includes('lourex-ai-head')){
      const settings=<button key="lxw-ai-settings" type="button" className="lxw-settings-trigger" disabled={!workspaceVisible(host)} aria-label={label(aiUiAr(host),'AI settings','إعدادات المساعد')} aria-expanded={Boolean(host.state.__workspaceSettingsOpen)} onClick={()=>host.setState({__workspaceSettingsOpen:!host.state.__workspaceSettingsOpen,__workspaceOpen:false,__workspacePane:'chat'})}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6M15 14v6"/></svg></button>;
      return react.cloneElement(node,undefined,...children.slice(0,-1),settings,...children.slice(-1));
    }
    if(cn.split(' ').includes('lourex-ai-title')){
      const branded=children.map((child:any)=>{
        if(child?.type!=='div')return child;
        const text=react.Children.toArray(child.props?.children).map((part:any)=>{
          if(part?.type==='strong')return react.cloneElement(part,undefined,'LOUREX AI');
          if(part?.type==='small')return react.cloneElement(part,undefined,label(aiUiAr(host),'Your business AI','مساعد أعمالك الذكي'));
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
      if(documentId)return react.cloneElement(node,undefined,...children,<button type="button" onClick={()=>host.setState({__workspaceOpen:true,__workspacePane:'workspace',__workspaceTab:'preview',__workspaceSavedId:documentId})}>{label(aiUiAr(host),'Read-only preview','معاينة للقراءة')}</button>);
    }
    if(cn.split(' ').includes('lourex-ai-empty')&&workspaceVisible(host)&&normalizeAiConversationMode(host.__intelligenceKernel?.mode)==='controller'){
      const ar=aiUiAr(host),prompts=ar?['أعطني ملخص الأعمال اليوم','أنشئ مسودة عرض سعر']:['Give me today’s business brief','Create a quotation draft'];
      return react.cloneElement(node,undefined,<strong>{label(ar,'What would you like to work on?','ما الذي تريد إنجازه؟')}</strong>,<p>{label(ar,'Discuss your business, review documents and prepare changes. Nothing is saved without your approval.','ناقش أعمالك، راجع المستندات وجهّز التعديلات. لن يُحفظ أي تغيير دون موافقتك.')}</p>,<div className="lourex-ai-starters">{prompts.map(prompt=><button type="button" key={prompt} disabled={disabled(host)} onClick={()=>void host.ask(prompt)}>{prompt}</button>)}</div>);
    }
    if(cn.split(' ').includes('lourex-ai-empty')&&host.state.assistantScope==='personal'){
      const ar=aiUiAr(host),prompts=ar?['ذكرني غدًا بمراجعة أهدافي','ما الذي تتذكره عن تفضيلاتي؟']:['Remind me tomorrow to review my goals','What do you remember about my preferences?'];
      return react.cloneElement(node,undefined,<strong>{label(ar,'Your personal assistant','مساعدك الشخصي')}</strong>,<p>{label(ar,'Plan tasks and manage personal reminders and preferences in this separate conversation.','نظّم مهامك وتذكيراتك وتفضيلاتك الشخصية في هذه المحادثة المستقلة.')}</p>,<div className="lourex-ai-starters">{prompts.map(prompt=><button type="button" key={prompt} onClick={()=>void host.ask(prompt)}>{prompt}</button>)}</div>);
    }
    if(cn.split(' ').includes('lourex-ai-empty')&&workspaceVisible(host)&&normalizeAiConversationMode(host.__intelligenceKernel?.mode)==='advisor'){
      const ar=aiUiAr(host);
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
      const withoutLegacyScope=children.filter((child:any)=>!String(child?.props?.className||'').split(' ').includes('lourex-ai-context'));
      const lockComposer=(child:any):any=>{
        if(!react.isValidElement(child))return child;
        const props=['button','input','textarea','select'].includes(child.type)?{disabled:true}:{};
        return react.cloneElement(child,props,...react.Children.toArray(child.props?.children).map(lockComposer));
      };
      const safe=personalReady?withoutLegacyScope:withoutLegacyScope.map((child:any)=>{
        const classes=String(child?.props?.className||'').split(' ');
        if(classes.includes('lourex-ai-proposal'))return null;
        if(classes.includes('lourex-ai-compose'))return lockComposer(child);
        if(classes.includes('lourex-ai-messages'))return react.cloneElement(child,undefined,host.state.__workspaceLoadError
          ?<div role="alert" className="lxw-load-error"><p>{label(aiUiAr(host),'Conversation could not be loaded.','تعذّر تحميل المحادثة.')}</p><small>{workspaceError(aiUiAr(host),String(host.state.__workspaceLoadError))}</small><button type="button" onClick={()=>host.setState({__workspaceLoadError:''},()=>void host.__workspaceRefresh?.())}>{label(aiUiAr(host),'Retry loading','إعادة المحاولة')}</button></div>
          :<p role="status">{label(aiUiAr(host),'Loading scoped conversation…','جارٍ تحميل المحادثة في نطاقها…')}</p>);
        return child;
      });
      const ar=aiUiAr(host);
      const heads=safe.filter((child:any)=>String(child?.props?.className||'').split(' ').includes('lourex-ai-head')).map((head:any)=>{const parts=react.Children.toArray(head.props.children);return react.cloneElement(head,undefined,parts[0],<span className="lxw-header-slot" aria-hidden="true"/>,...parts.slice(1));});
      const body=safe.filter((child:any)=>!String(child?.props?.className||'').split(' ').includes('lourex-ai-head'));
      return react.cloneElement(node,{'aria-label':'LOUREX AI',dir:ar?'rtl':'ltr','data-ai-ui-language':ar?'ar':'en','data-lourex-workspace':'2','data-workspace-ready':'false'},...heads,conversationModeTabs(host,undefined,true),<div className="lxw-mode-description" role="status">{label(ar,'Loading conversation…','جارٍ تحميل المحادثة…')}</div>,...body);
    }
    const ar=aiUiAr(host),k=host.__intelligenceKernel as ConversationKernel;
    const legacyContext=children.filter((child:any)=>String(child?.props?.className||'').split(' ').includes('lourex-ai-context'));
    const header=children.filter((child:any)=>String(child?.props?.className||'').split(' ').includes('lourex-ai-head'));
    const content=children.filter((child:any)=>!header.includes(child)&&!legacyContext.includes(child));
    const proposalNode=content.find((child:any)=>String(child?.props?.className||'').split(' ').includes('lourex-ai-proposal'));
    const approval=['document.createDraft','document.updateDraft'].includes(host.state.proposal?.capability)?proposalNode:null;
    const generalProposal=proposalNode&&!approval?proposalNode:null;
    const mode=normalizeAiConversationMode(k.mode),open=mode==='controller'&&Boolean(host.state.__workspaceOpen),pane=host.state.__workspacePane||'chat';
    const switching=Boolean(host.state.__workspaceSwitching),inactive=disabled(host)||switching;
    const tabs=conversationModeTabs(host,mode,inactive);
    const description=<div className="lxw-mode-description" dir={ar?'rtl':'ltr'} aria-live="polite">
      <span className="lxw-mode-symbol" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{mode==='controller'?<><path d="M4 7h16M4 17h16"/><path d="M8 4v6M16 14v6"/></>:<><path d="M20 11.5a8 8 0 0 1-8.5 8 8 8 0 0 1-3.8-1L4 20l1.5-3.7A8 8 0 1 1 20 11.5Z"/><path d="M8 11h8M8 14h5"/></>}</svg></span>
      <span>{conversationModeDescription(mode,ar?'ar':'en')}</span>
    </div>;
    const toolbar=mode==='controller'?<button type="button" className="lxw-workspace-trigger" disabled={inactive} aria-label={label(ar,'Workspace','مساحة العمل')} title={label(ar,'Workspace','مساحة العمل')} aria-expanded={open} onClick={()=>host.setState({__workspaceSettingsOpen:false,__workspaceOpen:!open,__workspacePane:open?'chat':'workspace'})}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></button>:<span className="lxw-header-slot" aria-hidden="true"/>;
    const historyButton=<button type="button" className="lxw-history-trigger" disabled={inactive} aria-label={label(ar,'Conversation history','سجل المحادثات')} title={label(ar,'Conversation history','سجل المحادثات')} aria-expanded={Boolean(host.state.__workspaceHistoryOpen)} onClick={()=>host.setState({__workspaceHistoryOpen:!host.state.__workspaceHistoryOpen,__workspaceHistoryError:'',__workspaceSettingsOpen:false,__workspaceOpen:false,__workspacePane:'chat'})}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 11a8 8 0 1 1 2.6 5.9"/><path d="M4 5v6h6M12 7v5l4 2"/></svg></button>;
    const compactHeader=header.map((head:any)=>{const parts=react.Children.toArray(head.props.children);return react.cloneElement(head,undefined,parts[0],historyButton,toolbar,...parts.slice(1));});
    const safeContent=content.filter((child:any)=>child!==proposalNode);
    return react.cloneElement(node,{'aria-label':'LOUREX AI',dir:ar?'rtl':'ltr','data-ai-ui-language':ar?'ar':'en','data-lourex-workspace':'2','data-ai-motion':currentAiExperiencePreferences(host).motion,'data-workspace-ready':'true','data-workspace-mode':mode,'data-workspace-open':String(open),'data-workspace-pane':pane},...compactHeader,tabs,description,<div className="lxw-body"><div className="lxw-chat">{host.state.__workspaceSettingsOpen?<AiExperienceSettings host={host}/>:host.state.__workspaceHistoryOpen?<AiConversationHistory host={host} ar={ar}/>:<>{safeContent}{mode==='controller'&&approval?<InlineDocumentApproval host={host} approval={approval} ar={ar}/>:null}{mode==='controller'&&generalProposal?<InlineGeneralProposal host={host} proposalNode={generalProposal} ar={ar}/>:null}</>}</div>{open?<ArtifactWorkspace key={kernelScopeKey(k.scope)} host={host} approval={approval}/>:null}</div>);
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
        host.setState({__workspaceLoadError:label(aiUiAr(host),'Conversation loading timed out. Retry loading.','انتهت مهلة تحميل المحادثة. حاول مجددًا.')});
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
  const dismiss=host.dismissProposal.bind(host);host.dismissProposal=()=>{if(disabled(host)||host.__foundationApprovalBusy)return;const proposal=host.state.proposal;dismiss();void dismissIntelligenceWorkspace(host,proposal).catch((error:Error)=>host.setState({error:error.message}));};
  // Immediately remove volatile UI references during scope/thread changes. Hydrate
  // the requested thread before redisplaying its encrypted working artifact.
  for(const name of ['__lourexSetScope','__lourexOpenThread','__lourexNewConversation','__lourexDeleteThread']){
    const old=host[name]?.bind(host);if(!old)continue;
    if(name==='__lourexSetScope')host.__workspaceBaseSetScope=old;
    host[name]=async(...args:any[])=>{if(disabled(host)&&!host.__workspaceInternalModeSwitch)return;clearConversationToolPresentation(host);host.__intelligenceKernel=undefined;host.__foundationVault=undefined;host.__lourexLatestContext=undefined;host.__businessMemories=[];host.__businessThreads=[];host.__lourexLastConversationSources=[];host.__lourexLastConversationFiles=[];host.setState({__workspaceOpen:false,__workspacePane:'chat',__workspaceSavedId:'',__workspaceEditing:false,__workspaceSettingsOpen:false,__workspaceHistoryOpen:false,__workspaceHistoryBusy:false,__workspaceHistoryError:'',__workspaceReviewedProposal:null,assistantEvidence:null,conversationAttachments:[],proposal:null,review:null});await old(...args);await refresh();};
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
      host.setState({input:drafts.get(kernelScopeKey(current.scope))||'',__workspaceSettingsOpen:false});
    }catch(error){
      host.setState({error:error instanceof Error?error.message:String(error)});
    }finally{
      host.__workspaceModeSwitchBusy=false;host.__workspaceInternalModeSwitch=false;
      host.setState({__workspaceSwitching:false});
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
  if(previous!==host.props){clearConversationToolPresentation(host);host.__workspaceObservedProps=undefined;host.__foundationVault=undefined;host.__businessMemories=[];host.__businessThreads=[];host.__workspaceRefresh?.();}
}
export function unmountConversationWorkspace(host:Host):void {host.__workspaceLoadGeneration=(host.__workspaceLoadGeneration||0)+1;if(host.__workspaceLoadTimer)window.clearTimeout(host.__workspaceLoadTimer);host.__workspaceLoadTimer=0;window.visualViewport?.removeEventListener('resize',host.__workspaceViewport);window.visualViewport?.removeEventListener('scroll',host.__workspaceViewport);window.removeEventListener('resize',host.__workspaceViewport);}
