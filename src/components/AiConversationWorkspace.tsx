import { aiInlineTextRuns, aiTextDirection } from '../lib/ai-text-layout.js';
import { AiMenuPresence } from './AiMenuPresence.js';
import { AiIdentityMark } from './AiIdentityMark.js';
import {AiFinancialReadout} from './AiFinancialReadout.js';
import {normalizeFinancialReadout,parseFinancialReadout} from '../lib/ai-financial-readout.js';
import { automaticElectronicDocument } from '../lib/secure-share.js';
import { aiChatQrFailureGuidance, planAiChatPdfQr } from '../lib/ai-chat-pdf-qr-policy.js';
import { workspaceText, workspaceError } from '../lib/ai-workspace-presentation.js';
import { KnowledgeWorkspace, ReliabilityWorkspace, DiagnosticsWorkspace } from './AiReliabilityWorkspace.js';
import { strictAiActor } from '../lib/ai-foundation-approval.js';
import { CommercialWorkspace, MissionWorkspace } from './AiCommercialWorkspace.js';
import { workspaceDocument, workspaceDrafting, validateWorkspaceCard, type WorkspaceCard, type WorkspaceComponent, type WorkspaceDocument, type WorkspaceCommand } from '../lib/ai-workspace-model.js';
import { refreshIntelligenceWorkspace, updateIntelligenceWorkspace, dismissIntelligenceWorkspace, discardIntelligenceDraft, saveIntelligenceDraft, assignIntelligenceConversationMode, currentAiExperiencePreferences, updateAiExperiencePreferences, currentAiInterfaceLanguage } from '../lib/ai-intelligence-runtime.js';
import { normalizeAiConversationMode, conversationModeDescription, type AiConversationMode } from '../lib/ai-conversation-mode.js';
import { kernelScopeKey, type ConversationKernel } from '../lib/ai-conversation-kernel.js';
import { activeAccountStorageUid } from '../storage/db.js';
import { resumeVaultSession } from '../storage/vault.js';
import { loadAssistantState } from '../storage/assistant-store.js';
import { lineTotal, isNonNegativeDecimalInput } from '../lib/money.js';
import { prepareAiPdfPreview } from '../lib/ai-pdf-preview.js';
import { assertGeneratedAiPdfFile } from '../lib/ai-pdf-file-validation.js';
import { attachAiChatScrollFollower, type AiChatScrollFollower } from '../lib/ai-chat-scroll.js';
import { prepareAdvisorControllerHandoff } from '../lib/ai-advisor-controller-handoff.js';
import type { LourexDocument } from '../types.js';


// Narrow compatibility adapter: existing chat, composer, history, voice and guarded
// approval owners remain intact. All new presentation is precompiled TSX.
type Host=any;
const react=React as any;
// Text is rendered as React nodes only. Never interpret provider HTML or links.
function bidiInlineText(value:string,key:string):any {
  return aiInlineTextRuns(value).map((run,i)=>run.direction
    ?<bdi key={key+'-bidi-'+i} className="lxw-inline-ltr" dir="ltr">{run.text}</bdi>:run.text);
}
function markdownInline(value:any,key:string):any {
  if(typeof value!=='string')return value; // preserve scoped evidence callbacks
  return value.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g).map((part,i)=>{
    const id=key+'-'+i;
    if(part.startsWith('**')&&part.endsWith('**'))return <strong key={id}>{bidiInlineText(part.slice(2,-2),id)}</strong>;
    if(part.startsWith('`')&&part.endsWith('`'))return <code key={id} dir={aiTextDirection(part.slice(1,-1))}>{bidiInlineText(part.slice(1,-1),id)}</code>;
    if(part.startsWith('*')&&part.endsWith('*'))return <em key={id}>{bidiInlineText(part.slice(1,-1),id)}</em>;
    return bidiInlineText(part,id);
  });
}
/** Presentation-only hierarchy. Punctuation never creates an action. */
function messageParagraph(parts:any[],key:string):any {
  if(parts.every(part=>typeof part==='string')){
    const text=parts.join(''),end=text.search(/[؟?]/);
    // A short question leads the paragraph; explanatory copy stays separate.
    if(end>=0&&end<220&&text.slice(0,end).trim()){
      const question=text.slice(0,end+1),detail=text.slice(end+1);
      return <div className="lxw-reply-question" key={key} dir="auto"><p className="lxw-reply-question-title"><strong>{markdownInline(question,key+'-question')}</strong></p>{detail.trim()?<p className="lxw-reply-question-detail">{markdownInline(detail,key+'-detail')}</p>:null}</div>;
    }
  }
  return react.createElement('p',{key,dir:'auto'},...parts.map((part:any,i:number)=>markdownInline(part,key+'-'+i)));
}
function messageResult(parts:any[],key:string):any[] {
  if(parts.every(part=>typeof part==='string')){
    const text=parts.join(''),sku=text.match(/^(.*?)(\(?SKU:\s*[A-Za-z0-9][A-Za-z0-9._\/-]*\)?)(.*)$/i);
    if(sku&&sku[1]!.trim())return [<strong className="lxw-result-name" key={key+'-name'} dir="auto">{markdownInline(sku[1],key+'-label')}</strong>,<bdi className="lxw-result-sku" key={key+'-sku'} dir="ltr">{sku[2]}</bdi>,...markdownInline(sku[3]||'',key+'-tail')];
  }
  return parts.map((part:any,i:number)=>markdownInline(part,key+'-'+i));
}
function markdownParagraphs(children:any[]):any[] {
  const result:any[]=[];let list:any[]=[];let listType='';
  const flush=()=>{if(list.length){result.push(react.createElement(listType,{key:'list-'+result.length},...list));list=[];listType='';}};
  // Providers may split a Markdown table across consecutive paragraph nodes.
  // Reassemble those rows before formatting; ordinary paragraphs and scoped
  // evidence elements keep their existing presentation and callbacks.
  // Preserve provider line breaks through legacy Fragment wrappers. Those
  // wrappers are presentation only; evidence buttons remain original nodes.
  const lines:any[]=[];let line:any[]=[];
  const flushLine=()=>{if(line.length){lines.push(react.createElement('p',{key:'reply-line-'+lines.length},...line));line=[];}};
  const visit=(child:any):void=>{
    if(react.isValidElement(child)&&child.type===react.Fragment){react.Children.toArray(child.props.children).forEach(visit);return;}
    if(react.isValidElement(child)&&child.type==='br'){flushLine();return;}
    if(react.isValidElement(child)&&child.type==='p'){flushLine();lines.push(child);return;}
    if(typeof child==='string'||react.isValidElement(child))line.push(child);
  };
  children.forEach(visit);flushLine();children=lines;
  const grouped:any[]=[];
  const paragraphText=(node:any):string|null=>{
    if(!react.isValidElement(node)||node.type!=='p')return null;
    const parts=react.Children.toArray(node.props.children);
    return parts.every((part:any)=>typeof part==='string')?parts.join(''):null;
  };
  for(let i=0;i<children.length;i++){
    const text=paragraphText(children[i]),next=paragraphText(children[i+1]);
    if(text?.includes('|')&&next&&/^\s*\|?\s*:?-{3,}/.test(next)){
      const rows=[text,next];i+=2;
      while(i<children.length){const row=paragraphText(children[i]);if(!row?.includes('|'))break;rows.push(row);i++;}
      i--;grouped.push(react.createElement('p',{key:'table-source-'+i},rows.join('\n')));
    }else grouped.push(children[i]);
  }
  children=grouped;
  children=children.flatMap(child=>{
    if(!react.isValidElement(child)||child.type!=='p')return [child];
    const parts=react.Children.toArray(child.props.children);
    if(!parts.every((part:any)=>typeof part==='string'))return [child];
    // Some providers flatten paragraph separators. Recover explicit heading
    // markers without inventing semantic blocks from ordinary punctuation.
    const text=parts.join('').replace(/\s+(?=#{1,6}\s)/g,'\n').replace(/\s+(?=[*•●▪]\s+\S)/g,'\n');
    if(/\|[^\n]*\n\s*\|?\s*:?-{3,}/.test(text))return assistantMessageBlocks(text);
    return text.split(/\r?\n/).filter(Boolean).map((line:string,i:number)=>react.createElement('p',{key:i},line));
  });
  children.forEach((child,index)=>{
    if(!react.isValidElement(child)||child.type!=='p'){flush();result.push(child);return;}
    const parts=react.Children.toArray(child.props.children),first=typeof parts[0]==='string'?parts[0]:'';
    const heading=first.match(/^\s*(#{1,6})\s+/),bullet=first.match(/^\s*(?:[-*•]|\d+[.)])\s+/);
    if(heading||bullet)parts[0]=first.slice((heading||bullet)![0].length);
    const formatted=bullet?messageResult(parts,String(index)):parts.map((part:any,i:number)=>markdownInline(part,index+'-'+i));
    if(bullet){const kind=/\d/.test(bullet[0])?'ol':'ul';if(listType&&listType!==kind)flush();listType=kind;list.push(<li key={index} className="lxw-ai-compact-result-row" dir="auto">{formatted}</li>);}
    else{flush();result.push(heading?react.createElement((heading[1]||'').length<=2?'h3':'h4',{key:index},...formatted):messageParagraph(parts,String(index)));}
  });flush();return result;
}

/** Render a plain-text assistant reply as actual paragraphs and accessible
 * lists. AI text is never parsed as HTML and never gets event callbacks. */
function assistantMessageBlocks(text:string):any[] {
  if(!text.trim())return [text];
  const blocks:any[]=[];
  let bullets:any[]=[],bulletKind:'ul'|'ol'|''='';
  const flush=()=>{if(bullets.length){blocks.push(react.createElement(bulletKind,{key:'list-'+blocks.length},...bullets));bullets=[];bulletKind='';}};
  const input=text.replace(/\r\n?/g,'\n')
    // Recover multiple numbered entries or bullet points flattened onto one
    // provider line. Arabic-Indic and Persian numerals are also supported.
    .replace(/\s+(?=(?:[1-9]|1[0-9]|20|[١-٩]|[۱-۹])[.)]\s+\S)/g,'\n')
    .replace(/\s+(?=[*•●▪]\s+\S)/g,'\n');
  const lines=input.split('\n');
  for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
    const line=lines[lineIndex]!;
    // Recognize only explicit Markdown tables. All cell content remains text;
    // provider HTML, URLs and callbacks are never interpreted.
    if(line.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[lineIndex+1]||'')){
      flush();
      const cells=(value:string)=>value.trim().replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim());
      const headers=cells(line),rows:string[][]=[];
      lineIndex+=2;
      while(lineIndex<lines.length&&lines[lineIndex]!.includes('|')){rows.push(cells(lines[lineIndex]!));lineIndex++;}
      lineIndex--;
      blocks.push(<div className="lxw-response-table" key={'table-'+blocks.length} tabIndex={0} role="region" aria-label="AI results"><table dir={aiTextDirection(headers.join(' '))}><thead><tr>{headers.map((cell,i)=><th key={i} scope="col" dir="auto">{markdownInline(cell,'th-'+i)}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{headers.map((_,j)=><td key={j} dir="auto">{markdownInline(row[j]||'—','td-'+i+'-'+j)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const trimmed=line.trim();
    if(!trimmed){flush();continue;}
    const heading=trimmed.match(/^(#{1,5})\s+(.+)/);
    const bullet=trimmed.match(/^([-*•●▪]|[0-9٠-٩۰-۹]{1,3}[.)])\s+(.+)/);
    if(heading){flush();blocks.push(react.createElement(heading[1]!.length<=2?'h3':'h4',{key:'heading-'+blocks.length,dir:'auto'},markdownInline(heading[2],String(blocks.length))));continue;}
    if(bullet){
      const kind=/[0-9٠-٩۰-۹]/.test(bullet[1]!)?'ol':'ul';
      if(bulletKind&&bulletKind!==kind)flush();
      bulletKind=kind;
      bullets.push(<li key={'item-'+bullets.length} className="lxw-ai-compact-result-row" dir="auto">{messageResult([bullet[2]],String(bullets.length))}</li>);
      continue;
    }
    flush();
    blocks.push(messageParagraph([trimmed],'paragraph-'+blocks.length));
  }
  flush();
  return blocks.length?blocks:[text];
}
const label=(ar:boolean,en:string,arabic:string)=>ar?arabic:en;
const fieldLabel=(ar:boolean,value:string)=>value.replace(/incoterm|paymentTerms|deliveryTime|validity|remarks|notes|customer|descriptionEn|descriptionAr|quantity|unitPrice|unit/g,key=>({incoterm:label(ar,'Delivery terms','شروط التسليم'),paymentTerms:label(ar,'Payment terms','شروط الدفع'),deliveryTime:label(ar,'Delivery time','مدة التسليم'),validity:label(ar,'Validity','صلاحية العرض'),remarks:label(ar,'Remarks','ملاحظات إضافية'),notes:label(ar,'Notes','ملاحظات'),customer:label(ar,'Customer','العميل'),descriptionEn:label(ar,'English description','الوصف الإنجليزي'),descriptionAr:label(ar,'Arabic description','الوصف العربي'),quantity:label(ar,'Quantity','الكمية'),unitPrice:label(ar,'Unit price','سعر الوحدة'),unit:label(ar,'Unit','الوحدة')}[key]||key));
const disabled=(host:Host)=>Boolean(host.state.busy||host.applying||host.state.attachmentBusy||host.__workspaceCommandBusy||host.__workspaceModeSwitchBusy||host.__foundationTurnBusy||host.__workspaceSaveBusy);
function dispatch(host:Host,command:WorkspaceCommand){void updateIntelligenceWorkspace(host,command);}
const aiUiAr=(host:Host):boolean=>currentAiInterfaceLanguage(host)==='ar';
function CardRows({card}:{card:WorkspaceCard}):any {
  // Compact fact rows: descriptive text wraps naturally; empty evidence stays
  // visibly unknown. These are read-only displays, never generated actions.
  return <dl className="lxw-facts lxw-compact-facts">{card.rows.map(row=><div key={row.id}><dt>{row.label}</dt><dd dir="auto">{row.detail||'—'}</dd></div>)}</dl>;
}
function Picker({card,onPick,busy,ar=false}:{ar?:boolean;card:WorkspaceCard;onPick?:(id:string)=>void;busy?:boolean}):any {
  const [query,setQuery]=React.useState(''),[page,setPage]=React.useState(0);
  const rows=card.rows.filter(row=>(row.label+' '+row.detail).normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').toLowerCase()));
  const visible=rows.slice(page*12,page*12+12);
  return <div className="lxw-picker"><input type="search" value={query} aria-label={label(ar,'Filter records','تصفية السجلات')} placeholder={label(ar,'Search name or SKU','ابحث بالاسم أو SKU')} onChange={(event:any)=>{setQuery(event.target.value);setPage(0);}}/><small>{rows.length} {label(ar,'matching records','سجل مطابق')}</small><div className="lxw-picker-list">{visible.map(row=><button type="button" key={row.id} disabled={busy||!onPick} onClick={()=>onPick?.(row.id)}><strong>{row.label}</strong><small>{row.detail}</small>{rows.some(other=>other.id!==row.id&&other.label===row.label)?<code className="lxw-picker-id">{row.id}</code>:null}</button>)}{!rows.length?<p>{label(ar,'No matching records.','لا توجد سجلات مطابقة.')}</p>:null}</div>{rows.length>12?<nav className="lxw-pagination" aria-label={label(ar,'Record pages','صفحات السجلات')}><button type="button" disabled={page===0} onClick={()=>setPage(page-1)}>{label(ar,'Previous','السابق')}</button><span>{page+1} / {Math.ceil(rows.length/12)}</span><button type="button" disabled={(page+1)*12>=rows.length} onClick={()=>setPage(page+1)}>{label(ar,'Next','التالي')}</button></nav>:null}</div>;
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
          <dl><div><dt>{label(ar,'Quantity','الكمية')}</dt><dd dir="ltr">{row.quantity||'—'} {row.unit}</dd></div><div><dt>{label(ar,'Unit price','سعر الوحدة')}</dt><dd dir="ltr">{row.unitPrice||'—'} {doc.currency}</dd></div>{row.packing?<div><dt>{label(ar,'Packing','التعبئة')}</dt><dd>{row.packing}</dd></div>:null}</dl>
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
  return <section data-workspace-component="EditablePricingGrid"><div className="lxw-table-scroll" tabIndex={0} aria-label={label(ar,'Pricing grid; scroll for all columns','جدول الأسعار؛ مرر لرؤية الأعمدة')}><table className="lxw-grid"><caption>{doc.rows.length} {label(ar,'lines ·','سطر ·')} {doc.currency}</caption><thead><tr><th>#</th>{names.map(name=><th key={name} scope="col">{name}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={row.id} data-line-id={row.id}><th scope="row">{page*10+i+1}</th>{fields.map((field,j)=><td key={field}>{editable?<CellEditor key={doc.revision+':'+row.id+':'+field} value={row[field]} numeric={field==='quantity'||field==='unitPrice'} busy={disabled(host)} name={`${names[j]} ${page*10+i+1}`} onCommit={value=>dispatch(host,{kind:'cell',artifactId:doc.id,revision:doc.revision,lineId:row.id,field,value})}/>:<span dir={field==='quantity'||field==='unitPrice'?'ltr':undefined}>{row[field]||'—'}</span>}</td>)}</tr>)}</tbody></table></div><div className="lxw-mobile-pricing" role="list" aria-label={label(ar,'Product lines','سطور الأصناف')}>
    {rows.map((row,i)=><section role="listitem" className="lxw-price-line" key={row.id} data-line-id={row.id}>
      <div className="lxw-price-line-heading"><span>{page*10+i+1}</span><strong dir="auto">{(ar?row.descriptionAr||row.descriptionEn:row.descriptionEn||row.descriptionAr)||label(ar,'Unnamed item','صنف بلا اسم')}</strong></div>
      <div className="lxw-price-line-fields">{fields.map((field,j)=><div className={'lxw-price-line-field lxw-price-field-'+field} key={field}>
        <label>{names[j]}{editable?<CellEditor key={doc.revision+':mobile:'+row.id+':'+field} value={row[field]} numeric={field==='quantity'||field==='unitPrice'} busy={disabled(host)} name={names[j]+' '+(page*10+i+1)} onCommit={value=>dispatch(host,{kind:'cell',artifactId:doc.id,revision:doc.revision,lineId:row.id,field,value})}/>:<span dir={field==='quantity'||field==='unitPrice'?'ltr':'auto'}>{row[field]||'—'}</span>}</label>
      </div>)}</div>
    </section>)}
  </div>{doc.rows.length>10?<nav className="lxw-pagination" aria-label={label(ar,'Line pages','صفحات الأصناف')}><button type="button" disabled={!page} onClick={()=>setPage(page-1)}>{label(ar,'Previous','السابق')}</button><span>{page+1} / {Math.ceil(doc.rows.length/10)}</span><button type="button" disabled={(page+1)*10>=doc.rows.length} onClick={()=>setPage(page+1)}>{label(ar,'Next','التالي')}</button></nav>:null}</section>;
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
    <fieldset className="lxw-settings-group"><legend>{label(ar,'Language','اللغة')}</legend>
    {field('lxw-ui-language','AI interface language','لغة واجهة المحادثة','Does not change the main site language.','لا تغيّر لغة الموقع الرئيسية.',prefs.interfaceLanguage,[{value:'inherit',en:'Same as site',ar:'مثل لغة الموقع'},{value:'ar',en:'Arabic',ar:'العربية'},{value:'en',en:'English',ar:'الإنجليزية'}],'interfaceLanguage')}
    {field('lxw-reply-language','Answer language','لغة الإجابات','The language to request from LOUREX AI.','اللغة المطلوبة لردود LOUREX AI.',prefs.replyLanguage,[{value:'auto',en:'Follow the conversation',ar:'حسب المحادثة'},{value:'ar',en:'Arabic',ar:'العربية'},{value:'en',en:'English',ar:'الإنجليزية'}],'replyLanguage')}
    </fieldset><fieldset className="lxw-settings-group"><legend>{label(ar,'Conversation experience','تجربة المحادثة')}</legend>
    {field('lxw-response-detail','Response length','تفصيل الإجابات','Choose how much detail to request in analysis.','حدّد مقدار التفاصيل المطلوب في التحليل.',prefs.detail,[{value:'balanced',en:'Balanced',ar:'متوازن'},{value:'brief',en:'Concise',ar:'مختصر'},{value:'detailed',en:'Detailed',ar:'مفصل'}],'detail')}
    {field('lxw-motion','Motion and transitions','الحركة والانتقالات','Use device preference or reduce optional animations.','اتبع إعداد الجهاز أو خفف المؤثرات الاختيارية.',prefs.motion,[{value:'system',en:'Follow device',ar:'حسب الجهاز'},{value:'reduced',en:'Reduce motion',ar:'تقليل الحركة'}],'motion')}
    </fieldset><div className="lxw-settings-info"><strong>{label(ar,'Voice and permissions','الصوت والصلاحيات')}</strong><p>{label(ar,'Voice text remains editable before sending. Advisor stays read-only regardless of these settings.','يظل النص الصوتي قابلًا للمراجعة قبل الإرسال. ويبقى المستشار للقراءة والتحليل فقط مهما تغيّرت الإعدادات.')}</p></div>
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
  const [expanded,setExpanded]=React.useState(false);
  if(!approval||!host.state.proposal)return null;
  const reviewed=host.state.__workspaceReviewedProposal===host.state.proposal;
  const actions=react.Children.toArray(approval.props?.children).find((child:any)=>
    String(child?.props?.className||'').split(' ').includes('lourex-ai-proposal-actions'));
  const originalButtons=actions?react.Children.toArray((actions as any).props.children):[];
  const originalConfirm=originalButtons.find((button:any)=>String(button?.props?.className||'').includes('primary'));
  const quotation=host.state.proposal?.capability==='document.createDraft'&&host.state.proposal.kind==='proforma';
  const saveText=quotation?label(ar,'Confirm quotation save','تأكيد حفظ عرض السعر'):label(ar,'Confirm draft save','تأكيد حفظ المسودة');
  const confirm=originalConfirm?react.cloneElement(originalConfirm,{'aria-label':saveText},saveText):null;
  const decline=originalButtons.filter((button:any)=>button!==originalConfirm).map((button:any)=>react.cloneElement(dismissal.wrap(button),{'aria-label':label(ar,'Decline','رفض')},label(ar,'Decline','رفض')));
  return <section className="lxw-inline-approval" data-exiting={dismissal.exiting?'true':'false'} aria-label={label(ar,'Document approval suggestion','اقتراح اعتماد مستند')}>
    <div className="lxw-inline-approval-title">
      <strong>{label(ar,'Draft ready for review','المسودة جاهزة للمراجعة')}</strong>
      <small>{label(ar,'No changes are saved by previewing.','المعاينة لا تحفظ أي تغيير.')}</small>
    </div>
    <div className="lxw-inline-approval-row">
      <button type="button" className="lxw-inline-preview-button" disabled={disabled(host)} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>
        {label(ar,'Review details','عرض التفاصيل')}
      </button>
      {originalButtons.length?<div className="lxw-inline-approval-buttons" role="group" aria-label={label(ar,'Approval decision','قرار الاعتماد')}>{decline}{reviewed&&confirm?confirm:null}</div>:null}
    </div>
    {expanded?<div className="lxw-inline-general-detail">
      <QuotePreviewSummary doc={workspaceDocument(host.__intelligenceKernel,host.__foundationVault,ar?'ar':'en')!} ar={ar}/>
      <button type="button" disabled={disabled(host)||Boolean(host.state.review?.blockers.length)} onClick={()=>{host.setState({__workspaceReviewedProposal:host.state.proposal});setExpanded(false);}}>{label(ar,'I reviewed this draft','اطلعت على المسودة')}</button>
    </div>:null}
    {reviewed&&!originalButtons.length?<p role="status" className="lxw-review-unknown">{label(ar,'Approval controls could not load. No action was executed.','تعذر تحميل أزرار الاعتماد. لم يُنفّذ أي إجراء.')}</p>:null}
  </section>;
}
/** Real, scoped business records are rendered as an accessible, paged chat
 * table, not as model-generated Markdown or navigation buttons. Selection is
 * conversation-only until a separately reviewed business mutation is prepared. */
function ConversationRecordList({host}:{host:Host}):any {
  const kernel=host.__intelligenceKernel as ConversationKernel|undefined;
  const selection=kernel?.selection;
  const [query,setQuery]=React.useState('');
  const [page,setPage]=React.useState(0);
  if(!selection)return null;
  const ar=aiUiAr(host),rows=selection.items||[],chosen=new Set(selection.selectedIds||[]);
  const match=query.normalize('NFKC').toLocaleLowerCase();
  const filtered=rows.filter(row=>(row.label+' '+row.entityId).normalize('NFKC').toLocaleLowerCase().includes(match));
  const visible=filtered.slice(page*12,page*12+12),pages=Math.max(1,Math.ceil(filtered.length/12));
  const busy=disabled(host);
  const update=(ids:string[])=>dispatch(host,{kind:'selection-set',selectionId:selection.id,entityIds:ids});
  const kind=rows[0]?.entityType||'record';
  const vault=host.__foundationVault;
  const isRed=(id:string):boolean=>Boolean(vault&&(kind==='customer'
    ?vault.customers?.some((r:any)=>r.id===id&&(r.workspaceId||'default')===(vault.appSettings.activeWorkspaceId||'default')&&r.highlightColor==='red')
    :kind==='supplier'&&vault.suppliers?.some((r:any)=>r.id===id&&(r.workspaceId||'default')===(vault.appSettings.activeWorkspaceId||'default')&&r.highlightColor==='red')));
  return <section className="lxw-picker lxw-records-picker" data-record-selection-id={selection.id}
    aria-label={label(ar,'Company records in conversation','سجلات الشركة داخل المحادثة')}>
    <header><strong>{label(ar,'Company records','سجلات الشركة')} · {kind}</strong>
      <small>{rows.length} {label(ar,'records','سجل')} · {chosen.size} {label(ar,'selected','محدد')}</small></header>
    <input type="search" value={query} disabled={busy}
      aria-label={label(ar,'Filter company records','تصفية سجلات الشركة')}
      placeholder={label(ar,'Search names or IDs','ابحث بالاسم أو المعرّف')}
      onChange={(event:any)=>{setQuery(event.target.value);setPage(0);}}/>
    <div className="lxw-record-actions">
      <button type="button" disabled={busy||!filtered.length}
        onClick={()=>update([...new Set([...chosen,...filtered.map(row=>row.entityId)])])}>{label(ar,'Select all matching','تحديد كل المطابق')}</button>
      <button type="button" disabled={busy||!chosen.size} onClick={()=>update([])}>{label(ar,'Clear selection','إلغاء التحديد')}</button>
    </div>
    <div className="lxw-picker-list" role="group" aria-label={label(ar,'Select exact records','تحديد سجلات دقيقة')}>
      {visible.map(row=><label key={row.entityId} className="lxw-record-option">
        <input type="checkbox" disabled={busy} checked={chosen.has(row.entityId)}
          onChange={(event:any)=>update(event.target.checked?[...chosen,row.entityId]:[...chosen].filter(id=>id!==row.entityId))}/>
        <span><strong>{row.label}{isRed(row.entityId)?<span aria-label={label(ar,'Red mark','علامة حمراء')} title={label(ar,'Red mark','علامة حمراء')} style={{color:'#db4444',paddingInlineStart:6}}>●</span>:null}</strong>
          <small dir="ltr">{row.entityId}</small></span>
      </label>)}
      {!filtered.length?<p>{label(ar,'No matching records.','لا توجد سجلات مطابقة.')}</p>:null}
    </div>
    {pages>1?<nav className="lxw-pagination" aria-label={label(ar,'Record pages','صفحات السجلات')}>
      <button type="button" disabled={busy||page===0} onClick={()=>setPage(page-1)}>{label(ar,'Previous','السابق')}</button>
      <span>{page+1} / {pages}</span>
      <button type="button" disabled={busy||page+1>=pages} onClick={()=>setPage(page+1)}>{label(ar,'Next','التالي')}</button>
    </nav>:null}
    <small>{label(ar,'Selection only. No records are changed until a separate approval.','التحديد فقط؛ لا تتغير السجلات دون موافقة مستقلة.')}</small>
  </section>;
}
/** True in-chat A4 preview. Safari/iPad PDF blob iframes can render blank, so
 * render the same canonical document model visibly, without touching the PDF
 * bridge, saved records or the separate downloadable generated File. */
function InlineControllerPdfPreview({Renderer,source,ar,onClose}:{Renderer:any;source:{document:LourexDocument;identity:string;electronicShareId?:string};ar:boolean;onClose:()=>void}):any {
  const viewport=react.useRef(null as HTMLDivElement|null);
  const stage=react.useRef(null as HTMLDivElement|null);
  const extent=react.useRef(null as HTMLDivElement|null);
  const [actualSize,setActualSize]=React.useState(false);
  React.useEffect(()=>{
    const container=viewport.current,paper=stage.current,space=extent.current;
    if(!container||!paper||!space)return;
    let frame=0;
    const fit=()=>{
      window.cancelAnimationFrame(frame);
      frame=window.requestAnimationFrame(()=>{
        if(!container.isConnected||!paper.isConnected)return;
        const width=Math.max(794,paper.scrollWidth);
        const height=Math.max(1123,paper.scrollHeight);
        const scale=actualSize?1:Math.min(1,Math.max(.1,(container.clientWidth-12)/width));
        paper.style.transform='scale('+scale+')';
        space.style.width=Math.ceil(width*scale)+'px';
        space.style.height=Math.ceil(height*scale)+'px';
      });
    };
    const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(fit):null;
    resize?.observe(container);
    const mutation=typeof MutationObserver!=='undefined'?new MutationObserver(fit):null;
    mutation?.observe(paper,{subtree:true,childList:true});
    window.addEventListener('resize',fit);
    fit();
    return()=>{window.cancelAnimationFrame(frame);resize?.disconnect();mutation?.disconnect();window.removeEventListener('resize',fit);};
  },[actualSize,source.identity]);
  return <section className="lxw-pdf-direct-preview" role="region" aria-label={label(ar,'Document preview inside the conversation','معاينة المستند داخل المحادثة')}>
    <div className="lxw-pdf-direct-toolbar">
      <strong>{label(ar,'A4 document preview · unsaved','معاينة مستند A4 · دون حفظ')}</strong>
      <div><button type="button" onClick={()=>setActualSize(value=>!value)}>{actualSize?label(ar,'Fit page','ملاءمة الصفحة'):label(ar,'100% zoom','تكبير 100%')}</button>
      <button type="button" onClick={onClose} aria-label={label(ar,'Close preview','إغلاق المعاينة')}>{label(ar,'Close','إغلاق')}</button></div>
    </div>
    <div className="lxw-pdf-direct-viewport" ref={viewport} tabIndex={0} aria-label={label(ar,'Scroll PDF document pages','تمرير صفحات المستند')}>
      <div className="lxw-pdf-direct-extent" ref={extent}>
        <div className="lxw-pdf-direct-paper" ref={stage}>
          <Renderer document={source.document} scale={1} electronicShareId={source.electronicShareId}/>
        </div>
      </div>
    </div>
  </section>;
}

function ConversationDocumentCard({host,approval}:{host:Host;approval?:any}):any {
  const kernel=host.__intelligenceKernel as ConversationKernel,vault=host.__foundationVault,ar=aiUiAr(host);
  // A saved document reference survives chat reload in the scoped kernel.
  // Never let an earlier saved document hide a newer unsaved working draft.
  const savedId=String(kernel.artifact?'':(host.state.__workspaceSavedId||
    (kernel.entity?.entityType==='document'?kernel.entity.entityId:'')));
  let doc:WorkspaceDocument|null=null;
  try{doc=workspaceDocument(kernel,vault,ar?'ar':'en',savedId);}catch{}
  // Phase-only telemetry: report where account-specific PDF generation stopped,
  // even if Safari closes before an error message can be displayed. Never
  // record document identity, filename, customer, amount or exception text.
  type PdfStage='document'|'qr'|'template'|'render'|'validate'|'identity'|'complete';
  const markPdfStage=(stage:PdfStage,status:'start'|'ok'|'failed')=>{
    try{(window as any).__LOUREX_DIAGNOSTICS__?.mark?.('ai-chat-pdf-stage','stage='+stage+' status='+status);}catch{}
  };
  const pdfStage=react.useRef(null as HTMLDivElement|null);
  const [PdfRenderer,setPdfRenderer]=React.useState(null as any);
  const [pdfSource,setPdfSource]=React.useState(null as {document:LourexDocument;identity:string;electronicShareId?:string;offlineCopy?:boolean}|null);
  const [pdfResult,setPdfResult]=React.useState(null as {url:string;name:string;bytes:number}|null);
  const [pdfBusy,setPdfBusy]=React.useState(false);
  const [pdfPreviewOpen,setPdfPreviewOpen]=React.useState(false);
  const [pdfError,setPdfError]=React.useState('');
  const [pdfQrError,setPdfQrError]=React.useState('');
  const [discardExpanded,setDiscardExpanded]=React.useState(false);
  const dismissal=useInlineDecline(host,host.state.proposal);
  const pdfIdentity=kernelScopeKey(kernel.scope)+'|'+savedId+'|'+String(kernel.artifact?.id||'')+'|'+String(kernel.artifact?.revision||0);
  // A renderer import can resolve after changing conversation, branch or
  // revision. Refs guard that async gap before any stale state is published.
  const latestPdfIdentity=react.useRef(pdfIdentity);
  const pdfSequence=react.useRef(0);
  const pdfStarting=react.useRef(false);
  latestPdfIdentity.current=pdfIdentity;
  React.useEffect(()=>{setDiscardExpanded(false);},[pdfIdentity,host.state.proposal]);
  React.useEffect(()=>{
    pdfSequence.current+=1;pdfStarting.current=false;
    setPdfSource(null);setPdfResult(null);setPdfBusy(false);setPdfPreviewOpen(false);setPdfError('');setPdfQrError('');
  },[pdfIdentity]);
  React.useEffect(()=>()=>{if(pdfResult?.url)URL.revokeObjectURL(pdfResult.url);},[pdfResult?.url]);
  const createPdf=async(allowOfflineCopy=false)=>{
    if(allowOfflineCopy&&!pdfQrError)return; // Explicit fallback appears only after a QR failure.
    if(pdfStarting.current||pdfBusy||normalizeAiConversationMode(kernel.mode)!=='controller')return;
    const identity=pdfIdentity,request=++pdfSequence.current;
    pdfStarting.current=true;
    setPdfBusy(true);setPdfError('');setPdfResult(null);setPdfPreviewOpen(false);setPdfQrError('');
    let qrAttemptFailed=false;
    let phase:PdfStage='document';
    markPdfStage(phase,'start');
    try{
      const document=prepareAiPdfPreview(kernel,vault,ar?'ar':'en',savedId);
      markPdfStage(phase,'ok');
      phase='qr';
      markPdfStage(phase,'start');
      // No renderer initialization on ordinary chat turns. The canonical A4
      // React class is loaded only after a Controller expressly asks for PDF.
      const qr=await planAiChatPdfQr(document,async()=>{
        try{
          const {ensureDocumentElectronicCopy}=await import('../cloud/secure-share-owner.js');
          const share=await ensureDocumentElectronicCopy(document,{isCurrent:()=>identity===latestPdfIdentity.current&&request===pdfSequence.current});
          if(!share?.id)throw new Error('Electronic QR reference is missing.');
          return share.id;
        }catch(error){qrAttemptFailed=true;throw error;}
      },allowOfflineCopy);
      markPdfStage(phase,'ok');
      phase='template';
      markPdfStage(phase,'start');
      const {TemplateRenderer}=await import('../templates/TemplateRenderer.js');
      markPdfStage(phase,'ok');
      if(identity!==latestPdfIdentity.current||request!==pdfSequence.current)return;
      setPdfRenderer(()=>TemplateRenderer);
      setPdfSource({document:qr.document,identity,electronicShareId:qr.electronicShareId,offlineCopy:qr.offlineCopy});
    }catch(e){
      if(identity===latestPdfIdentity.current&&request===pdfSequence.current){
        markPdfStage(phase,'failed');
        setPdfError(qrAttemptFailed?aiChatQrFailureGuidance(e,ar).message:e instanceof Error?e.message:String(e));
        if(qrAttemptFailed)setPdfQrError('qr-unavailable');
        setPdfBusy(false);pdfStarting.current=false;
      }
    }
  };
  React.useEffect(()=>{
    if(host.state.__workspacePdfAutoStart!==pdfIdentity)return;
    // One shot: a chat PDF request opens this workspace and starts generation
    // only after the correct scoped document revision is mounted.
    host.setState({__workspacePdfAutoStart:''});
    void createPdf();
  },[pdfIdentity,host.state.__workspacePdfAutoStart]);
  React.useEffect(()=>{
    if(!pdfSource)return;
    let cancelled=false;
    const timer=window.setTimeout(async()=>{
      let phase:PdfStage='render';
      markPdfStage(phase,'start');
      try{
        const build=(window as any).__LOUREX_BUILD_CHAT_PDF__;
        if(typeof build!=='function')throw new Error('The LOUREX PDF engine is not available. Reload and retry.');
        const stage=pdfStage.current;
        if(!stage)throw new Error('The A4 preview renderer is not mounted.');
        const file=await build(stage,'LOUREX-'+pdfSource.document.number);
        markPdfStage(phase,'ok');
        phase='validate';
        markPdfStage(phase,'start');
        await assertGeneratedAiPdfFile(file);
        markPdfStage(phase,'ok');
        phase='identity';
        markPdfStage(phase,'start');
        const active=host.__intelligenceKernel as ConversationKernel|undefined;
        // The same saved identity must be used at the start AND completion of
        // PDF rendering. After a reload the scoped kernel entity is durable,
        // while the transient __workspaceSavedId UI field can still be empty.
        const activeSavedId=active?String(active.artifact?'':(host.state.__workspaceSavedId||
          (active.entity?.entityType==='document'?active.entity.entityId:''))):'';
        const identity=active?kernelScopeKey(active.scope)+'|'+activeSavedId+'|'+String(active.artifact?.id||'')+'|'+String(active.artifact?.revision||0):'';
        if(identity!==pdfSource.identity)throw new Error('The document changed while rendering. Generate a new PDF.');
        if(cancelled)return;
        const url=URL.createObjectURL(file);
        if(cancelled){URL.revokeObjectURL(url);return;}
        markPdfStage(phase,'ok');
        phase='complete';
        setPdfResult({url,name:(file as File).name||'LOUREX-Preview.pdf',bytes:file.size});
        setPdfPreviewOpen(true);
        markPdfStage(phase,'ok');
      }catch(error){if(!cancelled){markPdfStage(phase,'failed');setPdfError(error instanceof Error?error.message:String(error));}}
      finally{if(!cancelled){setPdfBusy(false);pdfStarting.current=false;}}
    },0);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[pdfSource]);

  if(!doc)return approval?<InlineDocumentApproval host={host} approval={approval} ar={ar}/>:null;
  const saveReviewPending=doc.status==='draft'&&['document.createDraft','document.updateDraft'].includes(host.state.proposal?.capability);
  const approvalActions=approval?react.Children.toArray(approval.props?.children).find((child:any)=>
    String(child?.props?.className||'').split(' ').includes('lourex-ai-proposal-actions')):null;
  const approvalButtons=approvalActions?react.Children.toArray((approvalActions as any).props.children):[];
  const originalConfirm=approvalButtons.find((button:any)=>String(button?.props?.className||'').includes('primary'));
  const originalDecline=approvalButtons.find((button:any)=>button!==originalConfirm);
  const viewPdf=pdfResult&&pdfSource?.identity===pdfIdentity?pdfResult:null;
  const currentTerms=doc.terms.slice(0,2);
  const iconPdf=<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>;
  const iconEdit=<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 5 3 3M4 20l4.4-.9L20 7.5a2.1 2.1 0 0 0-3-3L5.4 16.1 4 20Z"/></svg>;
  const iconAccept=<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>;
  const iconReject=<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>;
  const approvalDecline=saveReviewPending&&originalDecline?react.cloneElement(dismissal.wrap(originalDecline),{
    className:'lxw-document-action lxw-document-action-reject',
    'aria-label':label(ar,'Decline','رفض')
  },iconReject,<span>{label(ar,'Decline','رفض')}</span>):null;
  return <section className="lxw-chat-document lxw-document-unified" aria-label={label(ar,'Document review and actions','مراجعة المستند وإجراءاته')} data-artifact-id={doc.id} data-artifact-revision={doc.revision} data-exiting={dismissal.exiting?'true':'false'}>
    <header className="lxw-document-card-head">
      <div className="lxw-document-card-title"><span className="lxw-document-card-symbol" aria-hidden="true">{iconPdf}</span>
        <div><small>{label(ar,'LOUREX · Business document','LOUREX · مستند أعمال')}</small><strong>{workspaceText(ar,doc.title)}</strong></div>
      </div>
      <span className="lxw-document-card-state" data-status={doc.status}>{doc.status==='saved'?label(ar,'Saved','محفوظ'):label(ar,'Draft · unsaved','مسودة غير محفوظة')}</span>
    </header>
    <div className="lxw-document-essentials">
      <span className="lxw-document-essential-customer" dir="auto">{doc.customer||label(ar,'Customer not selected','العميل غير محدد')}</span>
      <div className="lxw-document-essential-price">
        <span>{label(ar,'Items subtotal','المجموع الفرعي للأصناف')}</span>
        <strong className="lxw-document-essential-total" dir="ltr">{doc.subtotal??'—'} <small>{doc.currency}</small></strong>
      </div>
    </div>
    <div className="lxw-document-meta" aria-label={label(ar,'Document summary','ملخص المستند')}>
      <span>{doc.rows.length} {label(ar,'items','أصناف')}</span>
      {currentTerms.map((term,i)=><span key={i} dir="auto">{fieldLabel(ar,term.label)}: {term.value}</span>)}
    </div>
    {doc.blockers.length?<p className="lxw-document-blockers" role="status" id="lxw-document-blockers">
      <strong>{label(ar,'Complete these details to save','أكمل هذه البيانات للحفظ')}</strong>
      <span>{doc.blockers.slice(0,3).map(value=>fieldLabel(ar,value)).join(' · ')}</span>
    </p>:null}
    {doc.status==='draft'&&kernel.artifact?.proposal.capability==='document.createDraft'?<label className="lxw-document-customer-select">{label(ar,'Customer','العميل')} <select aria-label={label(ar,'Draft customer','عميل المسودة')} value={kernel.artifact.proposal.customerId} disabled={disabled(host)} onChange={(event:any)=>dispatch(host,{kind:'customer',artifactId:doc!.id,revision:doc!.revision,entityId:event.target.value})}><option value="">{doc.customer||label(ar,'Choose customer','اختر العميل')}</option>{workspaceDrafting(vault).customers.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>:null}
    <div className="lxw-document-action-grid" role="group" aria-label={label(ar,'Document actions','إجراءات المستند')}>
      {doc.status==='draft'?<button type="button" className="lxw-document-action lxw-document-action-approve" aria-busy={Boolean(host.state.__workspaceSaving)} aria-describedby={doc.blockers.length?'lxw-document-blockers':undefined} disabled={disabled(host)||Boolean(doc.blockers.length)} onClick={()=>void saveIntelligenceDraft(host,doc.id,doc.revision)}>{iconAccept}<span>{host.state.__workspaceSaving?label(ar,'Saving…','جارٍ الحفظ…'):label(ar,'Save draft','حفظ المسودة')}</span></button>:null}
      {viewPdf?<button type="button" className="lxw-document-action lxw-document-action-preview" aria-expanded={pdfPreviewOpen} onClick={()=>setPdfPreviewOpen(value=>!value)}>{iconPdf}<span>{label(ar,'Preview PDF','معاينة PDF')}</span></button>:
        <button type="button" className="lxw-document-action lxw-document-action-preview" aria-label={label(ar,'Generate PDF preview','إنشاء ومعاينة PDF')} aria-busy={pdfBusy} disabled={pdfBusy||disabled(host)||Boolean(doc.blockers.length)||doc.subtotal===null} onClick={()=>void createPdf()}>{iconPdf}<span>{pdfBusy?label(ar,'Generating PDF…','جارٍ تجهيز PDF…'):label(ar,'Preview PDF','معاينة PDF')}</span></button>}
      <button type="button" className="lxw-document-action lxw-document-action-edit" disabled={disabled(host)} onClick={()=>host.setState({__workspaceOpen:true,__workspacePane:'workspace',__workspaceTab:doc.status==='draft'?'edit':'preview',__workspaceEditing:doc.status==='draft'})}>{iconEdit}<span>{doc.status==='draft'?label(ar,'Edit','تحرير'):label(ar,'View document','عرض المستند')}</span></button>
      {doc.status==='draft'?(approvalDecline||<button type="button" className="lxw-document-action lxw-document-action-reject" disabled={disabled(host)||saveReviewPending} onClick={()=>setDiscardExpanded(true)}>{iconReject}<span>{label(ar,'Reject draft','رفض المسودة')}</span></button>):null}
    </div>
    {discardExpanded&&doc.status==='draft'?<section className="lxw-document-discard-confirm" role="region" aria-label={label(ar,'Confirm draft rejection','تأكيد رفض المسودة')}>
      <strong>{label(ar,'Discard this unsaved draft?','هل تريد رفض المسودة غير المحفوظة؟')}</strong>
      <p>{label(ar,'No saved quotation, invoice or inventory record will be changed.','لن يتغير أي عرض سعر أو فاتورة أو سجل مخزون محفوظ.')}</p>
      <div><button type="button" onClick={()=>setDiscardExpanded(false)}>{label(ar,'Continue editing','متابعة التحرير')}</button>
      <button type="button" className="lxw-document-discard-final" disabled={disabled(host)} onClick={()=>{
        setDiscardExpanded(false);
        void discardIntelligenceDraft(host,doc!.id,doc!.revision).catch((error:Error)=>host.setState({error:error.message||String(error)}));
      }}>{label(ar,'Reject without saving','رفض دون حفظ')}</button></div>
    </section>:null}
    {doc.status==='draft'?<small className="lxw-document-safety-note">{label(ar,'Save stores this draft only. PDF preview is optional; issuing is a separate action.','الحفظ يسجّل المسودة فقط. معاينة PDF اختيارية، والإصدار إجراء مستقل.')}</small>:null}
    <details className="lxw-document-extra"><summary>{label(ar,'All items and details','جميع الأصناف والتفاصيل')}</summary><QuotePreviewSummary doc={doc} ar={ar}/></details>
    {doc.status==='draft'&&kernel.artifact?<div className="lxw-document-revision-tools">
      <span>{label(ar,'Revision','نسخة')} {doc.revision}</span>
      <button type="button" disabled={disabled(host)||!kernel.artifact.undo.length} onClick={()=>dispatch(host,{kind:'undo',artifactId:doc!.id,revision:doc!.revision})}>{label(ar,'Undo','تراجع')}</button>
      <button type="button" disabled={disabled(host)||!kernel.artifact.redo.length} onClick={()=>dispatch(host,{kind:'redo',artifactId:doc!.id,revision:doc!.revision})}>{label(ar,'Redo','إعادة')}</button>
    </div>:null}
    <section className="lxw-ai-pdf-actions" aria-label={label(ar,'Real PDF document','مستند PDF فعلي')}>
      {pdfError?<p role="alert">{workspaceError(ar,pdfError)}</p>:null}
      {pdfQrError?<button type="button" className="lxw-pdf-download" disabled={pdfBusy||disabled(host)} onClick={()=>void createPdf(true)}>{label(ar,'Preview marked local copy without QR','معاينة نسخة محلية موسومة بدون QR')}</button>:null}
      {pdfSource?.offlineCopy?<p role="status">{label(ar,'LOCAL COPY — NO QR. This is a preview only, not an authenticated electronic document. Do not send it as an issued electronic copy.','نسخة محلية بدون QR. هذه معاينة فقط وليست نسخة إلكترونية موثقة. لا ترسلها باعتبارها النسخة الإلكترونية الصادرة.')}</p>:null}
      {viewPdf?<div className="lxw-ai-pdf-result">
        <div className="lxw-ai-pdf-file" role="group" aria-label={label(ar,'Generated PDF file','ملف PDF المنشأ')}>
          <span className="lxw-pdf-symbol" aria-hidden="true">PDF</span><div className="lxw-pdf-file-meta"><strong dir="auto">{viewPdf.name}</strong><small><bdi>{Math.ceil(viewPdf.bytes/1024)} KB</bdi> · {label(ar,'Ready','جاهز')}</small></div>
        </div>
        <div className="lxw-ai-pdf-file-actions"><a className="lxw-pdf-download" href={viewPdf.url} download={viewPdf.name}>{label(ar,'Download PDF','تنزيل PDF')}</a></div>
      </div>:null}
      {viewPdf&&pdfPreviewOpen&&PdfRenderer&&pdfSource?<InlineControllerPdfPreview key={pdfIdentity} Renderer={PdfRenderer} source={pdfSource} ar={ar} onClose={()=>setPdfPreviewOpen(false)}/>:null}
    </section>
    {pdfSource?<div className="lxw-ai-pdf-render-target" ref={pdfStage}
      aria-hidden="true" style={{position:'fixed',left:'-12000px',top:0,width:'210mm',minWidth:'210mm',maxWidth:'none',background:'#fff',pointerEvents:'none',zIndex:-1}}>
      {PdfRenderer?<PdfRenderer document={pdfSource.document} scale={1} electronicShareId={pdfSource.electronicShareId}/>:null}
    </div>:null}
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
      {tab==='preview'?<>
        <QuotePreviewSummary doc={doc} ar={ar}/>
        <p>{label(ar,'The document PDF is available in the conversation card.','ملف PDF متاح في بطاقة المستند داخل المحادثة.')}</p>
      </>:<>
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
/** Keep the active chat at its newest turn without dragging a reader away from
 * earlier messages. Unlike a message-count-only hook, this observes actual
 * content growth (drafts, PDFs, tool cards and streamed replies) on iOS Safari. */
function ConversationScrollKeeper({scopeKey,lastUserId}:{scopeKey:string;lastUserId:string}):any {
  const marker=react.useRef(null as HTMLSpanElement|null);
  const follower=react.useRef(null as AiChatScrollFollower|null);
  react.useEffect(()=>{
    const box=marker.current?.closest('.lourex-ai-messages') as HTMLElement|null;
    if(!box)return;
    const attached=attachAiChatScrollFollower(box);
    follower.current=attached;
    return()=>{
      attached.disconnect();
      if(follower.current===attached)follower.current=null;
    };
  },[scopeKey]);
  react.useEffect(()=>{
    // Keep the user's freshly sent turn visible even if they had scrolled
    // back through the history. Incoming content follows until manual scroll.
    if(lastUserId)follower.current?.followNewMessage();
  },[scopeKey,lastUserId]);
  return <span ref={marker} className="lxw-chat-scroll-marker" aria-hidden="true"/>;
}
function ConversationWelcomeMark():any {
  return <div className="lxw-welcome-identity" aria-hidden="true"><span className="lxw-welcome-orbit"/><AiIdentityMark/></div>;
}
function ConversationThinkingIndicator({ar}:{ar:boolean}):any {
  return <div className="lxw-thinking" role="status" aria-live="polite">
    <span className="lxw-thinking-dots" aria-hidden="true"><i/><i/><i/></span>
    <span>{label(ar,'LOUREX AI is working on your request…','LOUREX AI يعالج طلبك…')}</span>
  </div>;
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
  const [confirmDelete,setConfirmDelete]=react.useState('');
  const rows=(Array.isArray(host.__businessThreads)?host.__businessThreads:[])
    .filter((row:any)=>row&&typeof row.id==='string')
    .filter((row:any)=>{
      const needle=String(query||'').normalize('NFKC').trim().toLocaleLowerCase();
      const searchable=[row.title,row.summary].filter(value=>typeof value==='string').join(' ').normalize('NFKC').toLocaleLowerCase();
      return !needle||searchable.includes(needle);
    })
    .sort((a:any,b:any)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  const busy=disabled(host)||Boolean(host.state.__workspaceHistoryBusy);
  // A new thread with an unsent message but no saved thread identity cannot
  // be safely reopened from history after switching away.
  const preserveUnsentDraft=():boolean=>{
    if(!String(host.state.input||'').trim()||(host.__businessThreads||[]).some((row:any)=>row.id===host.__lourexAssistantThreadId))return true;
    host.setState({__workspaceHistoryError:label(ar,
      'Send or clear the unsent message before leaving this new conversation.',
      'أرسل الرسالة غير المرسلة أو امسحها قبل مغادرة هذه المحادثة الجديدة.')});
    return false;
  };
  const openThread=async(id:string)=>{
    if(busy||!preserveUnsentDraft())return;
    host.setState({__workspaceHistoryBusy:true,__workspaceHistoryError:''});
    try{await host.__lourexOpenThread(id);if(host.__lourexAssistantThreadId!==id)throw new Error('Conversation was not opened. Retry.');host.setState({__workspaceHistoryOpen:false});}
    catch(error){host.setState({__workspaceHistoryError:error instanceof Error?error.message:String(error)});}
    finally{host.setState({__workspaceHistoryBusy:false});}
  };
  const newThread=async()=>{
    if(busy||!preserveUnsentDraft())return;
    const previousMode=normalizeAiConversationMode(host.__intelligenceKernel?.mode),previousId=host.__lourexAssistantThreadId;
    host.setState({__workspaceHistoryBusy:true,__workspaceHistoryError:''});
    try{
      await host.__lourexNewConversation();
      if(!host.__lourexAssistantThreadId||host.__lourexAssistantThreadId===previousId)throw new Error('New conversation was not created. Retry.');
      if(previousMode==='advisor')await assignIntelligenceConversationMode(host,'advisor');
      host.setState({__workspaceHistoryOpen:false});
    }catch(error){host.setState({__workspaceHistoryError:error instanceof Error?error.message:String(error)});}
    finally{host.setState({__workspaceHistoryBusy:false});}
  };
  const deleteThread=async(id:string)=>{
    if(busy)return;
    if(id===host.__lourexAssistantThreadId&&String(host.state.input||'').trim()){
      host.setState({__workspaceHistoryError:label(ar,
        'Send or clear your unsent message before deleting this conversation.',
        'أرسل رسالتك غير المرسلة أو امسحها قبل حذف هذه المحادثة.')});
      return;
    }
    host.setState({__workspaceHistoryBusy:true,__workspaceHistoryError:''});
    try{
      await host.__lourexDeleteThread(id);
      const session=await resumeVaultSession();
      if(!session||!(await loadAssistantState(session.key)).deletedThreads?.[id])throw new Error('Conversation deletion was not confirmed. Retry.');
      await refreshIntelligenceWorkspace(host); // Never retain a deleted kernel as the active draft.
      // The lifecycle owner commits a deletion tombstone locally before
      // scheduling cloud publication. A failed cloud push remains retryable.
      host.__businessThreads=(host.__businessThreads||[]).filter((row:any)=>row.id!==id);
      setConfirmDelete('');
      host.setState({__workspaceHistoryOpen:true});
    }catch(error){host.setState({__workspaceHistoryError:error instanceof Error?error.message:String(error)});}
    finally{host.setState({__workspaceHistoryBusy:false});}
  };
  return <section className="lxw-history" aria-label={label(ar,'Saved conversations','المحادثات المحفوظة')}>
    <header className="lxw-history-head">
      <button type="button" disabled={busy} onClick={()=>host.setState({__workspaceHistoryOpen:false,__workspaceHistoryError:''})} aria-label={label(ar,'Back to chat','العودة للمحادثة')}>←</button>
      <strong>{label(ar,'Conversations','المحادثات')}</strong>
      <button type="button" disabled={busy} onClick={()=>void newThread()}>{label(ar,'New','جديدة')}</button>
    </header>
    <input className="lxw-history-search" type="search" value={query} onChange={(event:any)=>setQuery(event.target.value)} aria-label={label(ar,'Search conversation titles and summaries','البحث في عناوين المحادثات وملخصاتها')} placeholder={label(ar,'Search conversations…','ابحث في المحادثات…')}/>
    {host.state.__workspaceHistoryError?<p role="alert" className="lxw-history-error">{workspaceError(ar,String(host.state.__workspaceHistoryError))}</p>:null}
    <p className="lxw-history-sync" role="status">
      {host.state.__workspaceHistorySyncStatus==='syncing'?label(ar,'Syncing account conversations…','جارٍ مزامنة محادثات الحساب…'):
       host.state.__workspaceHistorySyncStatus==='synced'?label(ar,'Account conversation history synchronized','تمت مزامنة سجل محادثات الحساب'):
       host.state.__workspaceHistorySyncStatus==='uploaded'?label(ar,'Conversation changes saved to cloud; refresh to receive other-device changes.','حُفظت تغييرات المحادثة في السحابة؛ حدّث السجل لجلب تغييرات الأجهزة الأخرى.'):
       label(ar,'Conversations are saved locally. Cloud sync is pending or unavailable.','المحادثات محفوظة محليًا. المزامنة السحابية معلقة أو غير متاحة.')}
    </p>
    {host.state.__workspaceHistorySyncError?<p role="alert" className="lxw-history-error">{workspaceError(ar,String(host.state.__workspaceHistorySyncError))}</p>:null}
    <div className="lxw-history-list" role="list">
      {rows.map((row:any)=><div role="listitem" className="lxw-history-item" key={row.id}>
        <button type="button" className="lxw-history-row" disabled={busy} aria-current={row.id===host.__lourexAssistantThreadId?'page':undefined} onClick={()=>void openThread(row.id)}>
          <span className="lxw-history-row-title" dir="auto">{row.title||label(ar,'Untitled conversation','محادثة بلا عنوان')}</span>
          <span className="lxw-history-row-meta"><small>{normalizeAiConversationMode(row.mode)==='advisor'?label(ar,'Advisor','المستشار'):label(ar,'Controller','المتحكم')}</small><small>{row.updatedAt?new Date(row.updatedAt).toLocaleDateString(ar?'ar':'en',{day:'numeric',month:'short'}):''}</small></span>
        </button>
        {confirmDelete===row.id?<div className="lxw-history-delete-confirm">
          <span>{label(ar,'Delete this conversation?','حذف هذه المحادثة؟')}</span>
          <button type="button" disabled={busy} onClick={()=>void deleteThread(row.id)}>{label(ar,'Confirm','تأكيد')}</button>
          <button type="button" disabled={busy} onClick={()=>setConfirmDelete('')}>{label(ar,'Cancel','إلغاء')}</button>
        </div>:<button type="button" className="lxw-history-delete" disabled={busy} aria-label={label(ar,'Delete conversation','حذف المحادثة')} onClick={()=>setConfirmDelete(row.id)}>×</button>}
      </div>)}
      {!rows.length?<p className="lxw-history-empty">{query?label(ar,'No matching conversation titles.','لا توجد محادثات مطابقة للبحث.'):label(ar,'No saved conversations in this company or branch.','لا توجد محادثات محفوظة لهذه الشركة أو الفرع.')}</p>:null}
    </div>
  </section>;
}

export function renderConversationWorkspace(host:Host,tree:any):any {
  // Map the existing message sequence to its canonical saved content, not
  // to a reconstructed tree from any earlier visual owner. Accounting records
  // and action callbacks remain unchanged.
  let messageCursor=0;
  const transform=(node:any):any=>{
    if(typeof node==='string')return workspaceText(aiUiAr(host),node);
    if(!react.isValidElement(node))return node;
    const cn=String(node.props?.className||'');
    const tokens=cn.split(' ');
    const isTurn=tokens.includes('lourex-ai-message')&&(tokens.includes('assistant')||tokens.includes('user'));
    const originalMessage=isTurn&&Array.isArray(host.state?.messages)?host.state.messages[messageCursor++]:null;
    const children=react.Children.toArray(node.props?.children).map(transform);
    if(cn.split(' ').includes('lourex-ai-send'))return react.cloneElement(node,{
      disabled:Boolean(node.props.disabled||host.state.__workspaceTurnPending),
      'data-turn-pending':host.state.__workspaceTurnPending?'true':'false',
      'aria-busy':Boolean(host.state.__workspaceTurnPending)
    },...children);
    if(cn.split(' ').includes('lourex-ai-busy'))return react.cloneElement(node,undefined,label(aiUiAr(host),'LOUREX AI is reviewing…','LOUREX AI يراجع الطلب…'));
    if(cn.split(' ').includes('lourex-ai-premium-textarea')){
      const prompt=label(aiUiAr(host),'Ask LOUREX…','اسأل LOUREX…');
      const originalRef=node.ref||node.props.ref;
      return react.cloneElement(node,{placeholder:prompt,'aria-label':prompt,dir:'auto',ref:(element:any)=>{
        if(typeof originalRef==='function')originalRef(element);
        else if(originalRef)originalRef.current=element;
        // Input events grow the textarea, but clearing a controlled value after
        // send does not fire an input event. Release its stale inline height.
        if(element&&String(node.props.value??'')==='')element.style.height='auto';
      }});
    }
    if(tokens.includes('lourex-ai-user-copy'))return react.cloneElement(node,undefined,...children.flatMap((child:any,i:number)=>typeof child==='string'?bidiInlineText(child,'user-'+i):[child]));
    if(cn.split(' ').includes('lourex-ai-message-action')){
      const actions:Record<string,[string,string]>={copy:['Copy','نسخ'],edit:['Edit','تعديل'],retry:['Retry','إعادة المحاولة'],reask:['Re-ask','اسأل مجددًا'],helpful:['Helpful','مفيد'],'not-helpful':['Not helpful','غير مفيد'],more:['More','المزيد']};
      const action=Object.entries(actions).find(([key])=>cn.split(' ').includes('is-'+key));
      if(action){const name=label(aiUiAr(host),...action[1]);return react.cloneElement(node,{'aria-label':name,title:name},...children);}
    }
    if(cn.split(' ').includes('lourex-ai-close'))return react.cloneElement(node,{'aria-label':label(aiUiAr(host),'Close','إغلاق'),title:label(aiUiAr(host),'Close','إغلاق')},...children);
    if(cn.split(' ').includes('lourex-ai-overflow-trigger'))return react.cloneElement(node,{'aria-label':label(aiUiAr(host),'Conversation menu','قائمة المحادثة'),title:label(aiUiAr(host),'Conversation menu','قائمة المحادثة')},<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v11l4-3h5"/><path d="M18 14v7M14.5 17.5h7"/></svg>);
    if(cn.split(' ').includes('lourex-ai-overflow-menu')){
      const names=[label(aiUiAr(host),'New conversation','محادثة جديدة'),label(aiUiAr(host),'Conversations','المحادثات')];
      return react.cloneElement(node,undefined,...children.map((button:any,i:number)=>{
        if(!react.isValidElement(button)||!names[i])return button;
        const parts=react.Children.toArray(button.props.children);
        const icon=<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{i===0?<><path d="M12 5v14M5 12h14"/></>:<><path d="M4 11a8 8 0 1 1 2 6M4 5v6h6"/><path d="M12 7v5l3 2"/></>}</svg>;
        return react.cloneElement(button,i===1?{onClick:(event:any)=>{button.props?.onClick?.(event);host.setState({__workspaceHistoryOpen:true,__workspaceHistoryError:'',__workspaceSettingsOpen:false,__workspaceOpen:false,__workspacePane:'chat'});}}:undefined,icon,<span>{names[i]}</span>);
      }));
    }
    if(tokens.includes('lourex-ai-overflow')){
      const menu=children.find((child:any)=>String(child?.props?.className||'').split(' ').includes('lourex-ai-overflow-menu'));
      const trigger=children.find((child:any)=>String(child?.props?.className||'').split(' ').includes('lourex-ai-overflow-trigger'));
      return react.cloneElement(node,undefined,...children.filter((child:any)=>child!==menu),<AiMenuPresence key={'menu-'+(host.__intelligenceKernel?.scope?kernelScopeKey(host.__intelligenceKernel.scope):'loading')} content={menu||null} reduced={currentAiExperiencePreferences(host).motion==='reduced'} onDismiss={()=>trigger?.props?.onClick?.()}/>);
    }
    if(cn.split(' ').includes('lourex-ai-answer-copy'))return react.cloneElement(node,{className:cn+' lxw-markdown'},...markdownParagraphs(children));
    if(cn.split(' ').includes('lourex-ai-message')&&(cn.split(' ').includes('user')||cn.split(' ').includes('assistant'))){
      const sender=cn.split(' ').includes('user')?'user':'assistant';
      const actions=children.filter((child:any)=>String(child?.props?.className||'').split(' ').includes('lourex-ai-message-actions'));
      const content=children.filter((child:any)=>!actions.includes(child));
      // Financial readouts have one DOM owner and one bounded view model. Old
      // nested JSX from the legacy renderer is discarded for these messages.
      // Non-financial chat, approvals and original action callbacks are kept.
      const canonical=originalMessage?.role===sender?originalMessage.text:null;
      // Typed read-only evidence takes precedence; text parsing is historic fallback only.
      const report=sender==='assistant'
        ?normalizeFinancialReadout(originalMessage?.financialReadout)||parseFinancialReadout(canonical)
        :null;
      const formatted=report?[<AiFinancialReadout key="financial-report" readout={report} language={aiUiAr(host)?'ar':'en'}/>]:
        sender==='assistant'?content.flatMap((child:any)=>
        typeof child==='string'?assistantMessageBlocks(child):[child]):content;
      return react.createElement('div',{className:'lxw-message-turn is-'+sender},
        react.cloneElement(node,{dir:'auto',className:cn+(sender==='assistant'?' lxw-markdown lxw-formatted-reply':'')},...formatted),...actions);
    }
    if(cn.split(' ').includes('lourex-ai-launcher'))return react.cloneElement(node,{'data-ai-motion':currentAiExperiencePreferences(host).motion},...children);
    if(cn.split(' ').includes('lourex-ai-head')){
      const settings=<button key="lxw-ai-settings" type="button" className="lxw-settings-trigger" disabled={!workspaceVisible(host)} aria-label={label(aiUiAr(host),'AI settings','إعدادات المساعد')} aria-expanded={Boolean(host.state.__workspaceSettingsOpen)} onClick={()=>host.setState({__workspaceSettingsOpen:!host.state.__workspaceSettingsOpen,__workspaceHistoryOpen:false,__workspaceOpen:false,__workspacePane:'chat'})}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6M15 14v6"/></svg></button>;
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
    if(cn.split(' ').includes('lourex-ai-messages')&&workspaceVisible(host)&&normalizeAiConversationMode(host.__intelligenceKernel?.mode)==='advisor'){
       return react.cloneElement(node,undefined,...children,
         (host.state.__workspaceTurnPending||host.state.busy||host.state.attachmentBusy)?<ConversationThinkingIndicator ar={aiUiAr(host)}/>:null,
         <ConversationScrollKeeper key={'scroll-'+kernelScopeKey(host.__intelligenceKernel.scope)} scopeKey={kernelScopeKey(host.__intelligenceKernel.scope)} lastUserId={String([...(host.state.messages||[])].reverse().find((row:any)=>row.role==='user')?.id||'')}/>);
     }
     if(cn.split(' ').includes('lourex-ai-messages')&&workspaceVisible(host)&&normalizeAiConversationMode(host.__intelligenceKernel?.mode)==='controller'){
      return react.cloneElement(node,undefined,...children,
        (host.state.__workspaceTurnPending||host.state.busy||host.state.attachmentBusy)?<ConversationThinkingIndicator ar={aiUiAr(host)}/>:null,
        <ConversationDocumentCard key={kernelScopeKey(host.__intelligenceKernel.scope)} host={host}/>,
        <ConversationRecordList key={'records-'+kernelScopeKey(host.__intelligenceKernel.scope)+'-'+(host.__intelligenceKernel.selection?.id||'')} host={host}/>,
         <ConversationScrollKeeper key={'scroll-'+kernelScopeKey(host.__intelligenceKernel.scope)} scopeKey={kernelScopeKey(host.__intelligenceKernel.scope)} lastUserId={String([...(host.state.messages||[])].reverse().find((row:any)=>row.role==='user')?.id||'')}/>);
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
      return react.cloneElement(node,undefined,<ConversationWelcomeMark/>,<strong>{label(ar,'What would you like to work on?','ما الذي تريد إنجازه؟')}</strong>,<p>{label(ar,'Discuss your business, review documents and prepare changes. Nothing is saved without your approval.','ناقش أعمالك، راجع المستندات وجهّز التعديلات. لن يُحفظ أي تغيير دون موافقتك.')}</p>,<div className="lourex-ai-starters">{prompts.map(prompt=><button type="button" key={prompt} disabled={disabled(host)} onClick={()=>void host.ask(prompt)}>{prompt}</button>)}</div>);
    }
    if(cn.split(' ').includes('lourex-ai-empty')&&host.state.assistantScope==='personal'){
      const ar=aiUiAr(host),prompts=ar?['ذكرني غدًا بمراجعة أهدافي','ما الذي تتذكره عن تفضيلاتي؟']:['Remind me tomorrow to review my goals','What do you remember about my preferences?'];
      return react.cloneElement(node,undefined,<ConversationWelcomeMark/>,<strong>{label(ar,'Your personal assistant','مساعدك الشخصي')}</strong>,<p>{label(ar,'Plan tasks and manage personal reminders and preferences in this separate conversation.','نظّم مهامك وتذكيراتك وتفضيلاتك الشخصية في هذه المحادثة المستقلة.')}</p>,<div className="lourex-ai-starters">{prompts.map(prompt=><button type="button" key={prompt} onClick={()=>void host.ask(prompt)}>{prompt}</button>)}</div>);
    }
    if(cn.split(' ').includes('lourex-ai-empty')&&workspaceVisible(host)&&normalizeAiConversationMode(host.__intelligenceKernel?.mode)==='advisor'){
      const ar=aiUiAr(host);
      const prompts=ar?['حلّل هامش الربح بناءً على بيانات الشركة','اشرح لي الذمم والمستحقات الحالية']:['Analyze profit margins from business records','Explain current receivables and outstanding balances'];
      return react.cloneElement(node,undefined,<ConversationWelcomeMark/>,
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
      return react.cloneElement(node,{'aria-label':'LOUREX AI',dir:ar?'rtl':'ltr','data-ai-ui-language':ar?'ar':'en','data-lourex-workspace':'2','data-workspace-ready':'false'},...heads,conversationModeTabs(host,undefined,true),<div className="lxw-mode-description" role="status">{label(ar,'Loading conversation…','جارٍ تحميل المحادثة…')}</div>,<div className="lxw-body"><div className="lxw-chat">{body}</div></div>);
    }
    const ar=aiUiAr(host),k=host.__intelligenceKernel as ConversationKernel;
    const legacyContext=children.filter((child:any)=>String(child?.props?.className||'').split(' ').includes('lourex-ai-context'));
    // Keep the ONE existing encrypted Memory & Tasks manager alive when the
    // obsolete context bar is removed. The historical + Tools menu delegates
    // its memory action to the original React button, and that button owns the
    // legacy manager's exact scoped state and write-approval boundaries.
    // Do not duplicate its storage/UI implementation or restore the old bar.
    // The previous bridge inspected only immediate children. The legacy
    // navigation owner nests them in context rows, so the manager button was
    // silently removed along with the old context bar. Preserve the ORIGINAL
    // React elements and callbacks, even under deeply nested context wrappers.
    const memoryManagerParts:any[]=[];
    const findMemoryManager=(node:any):void=>{
      if(!react.isValidElement(node))return;
      const classes=String(node.props?.className||'').split(' ');
      if(classes.includes('lourex-ai-manager-button')){
        // This is a delegated control, not a second visible navigation button.
        // Native button.click() still works from the existing Tools gateway.
        memoryManagerParts.push(react.cloneElement(node,{
          style:{...(node.props?.style||{}),position:'absolute',width:'1px',
            height:'1px',minWidth:0,minHeight:0,padding:0,opacity:0,
            pointerEvents:'none',overflow:'hidden'},
          tabIndex:-1,'aria-hidden':true
        }));
        return;
      }
      if(classes.includes('lourex-ai-manager')){
        memoryManagerParts.push(node);return;
      }
      react.Children.toArray(node.props?.children).forEach(findMemoryManager);
    };
    legacyContext.forEach(findMemoryManager);
    const memoryManagerBridge=memoryManagerParts.length?
      <div className="lxw-memory-manager-bridge"
        style={{position:'absolute',insetInline:0,top:0,height:0,zIndex:85}}>
        {memoryManagerParts}
      </div>:null;
    const header=children.filter((child:any)=>String(child?.props?.className||'').split(' ').includes('lourex-ai-head'));
    const content=children.filter((child:any)=>!header.includes(child)&&!legacyContext.includes(child));
    const proposalNode=content.find((child:any)=>String(child?.props?.className||'').split(' ').includes('lourex-ai-proposal'));
    const approval=['document.createDraft','document.updateDraft'].includes(host.state.proposal?.capability)?proposalNode:null;
    const generalProposal=proposalNode&&!approval?proposalNode:null;
    const mode=normalizeAiConversationMode(k.mode),open=mode==='controller'&&Boolean(host.state.__workspaceOpen),pane=host.state.__workspacePane||'chat';
    const latestAdvisorReply=mode==='advisor'?[...(host.state.messages||[])].reverse().find((m:any)=>m.role==='assistant'&&typeof m.text==='string'&&m.text.trim()):null;
    const switching=Boolean(host.state.__workspaceSwitching),inactive=disabled(host)||switching;
    const tabs=conversationModeTabs(host,mode,inactive);
    const description=<div className="lxw-mode-description" dir={ar?'rtl':'ltr'} aria-live="polite">
      <span className="lxw-mode-symbol" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{mode==='controller'?<><path d="M4 7h16M4 17h16"/><path d="M8 4v6M16 14v6"/></>:<><path d="M20 11.5a8 8 0 0 1-8.5 8 8 8 0 0 1-3.8-1L4 20l1.5-3.7A8 8 0 1 1 20 11.5Z"/><path d="M8 11h8M8 14h5"/></>}</svg></span>
      <span>{switching?label(ar,'Opening conversation…','جارٍ فتح المحادثة…'):conversationModeDescription(mode,ar?'ar':'en')}</span>
      {switching?<span className="lxw-inline-spinner" aria-hidden="true"/>:null}
      {mode==='advisor'?<button type="button" className="lxw-advisor-controller-handoff"
        disabled={inactive||!latestAdvisorReply||Boolean(host.__workspaceAdvisorHandoffBusy)}
        title={label(ar,'Copy latest Advisor proposal into Controller for review only','إرسال أحدث اقتراح للمتحكم للمراجعة فقط')}
        onClick={()=>void host.__workspaceSendAdvisorProposal?.(latestAdvisorReply?.text||'')}>
        {label(ar,'Send proposal to Controller','إرسال الاقتراح إلى المتحكم')}
      </button>:null}
    </div>;
    const toolbar=mode==='controller'?<button type="button" className="lxw-workspace-trigger" disabled={inactive} aria-label={label(ar,'Workspace','مساحة العمل')} title={label(ar,'Workspace','مساحة العمل')} aria-expanded={open} onClick={()=>host.setState({__workspaceSettingsOpen:false,__workspaceOpen:!open,__workspacePane:open?'chat':'workspace'})}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></button>:<span className="lxw-header-slot" aria-hidden="true"/>;
    const historyButton=<button type="button" className="lxw-history-trigger" disabled={inactive} aria-label={label(ar,'Conversation history','سجل المحادثات')} title={label(ar,'Conversation history','سجل المحادثات')} aria-expanded={Boolean(host.state.__workspaceHistoryOpen)} onClick={()=>host.setState({__workspaceHistoryOpen:!host.state.__workspaceHistoryOpen,__workspaceHistoryError:'',__workspaceSettingsOpen:false,__workspaceOpen:false,__workspacePane:'chat'})}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 11a8 8 0 1 1 2.6 5.9"/><path d="M4 5v6h6M12 7v5l4 2"/></svg></button>;
    const compactHeader=header.map((head:any)=>{const parts=react.Children.toArray(head.props.children);return react.cloneElement(head,undefined,parts[0],historyButton,toolbar,...parts.slice(1));});
    const safeContent=content.filter((child:any)=>child!==proposalNode);
    // Review controls belong to the conversation timeline, not AFTER the
    // composer. Keeping approval below the footer shrinks the chat viewport,
    // causes iPad layout jumps and hides buttons behind the soft keyboard.
    // This keeps the original guarded approval callbacks and scroll observer.
    const chatContent=safeContent.map((child:any)=>{
      if(!react.isValidElement(child)||!String(child.props?.className||'').split(' ').includes('lourex-ai-messages'))return child;
      const existing=react.Children.toArray(child.props?.children);
      const beforeMarker=existing.findIndex((entry:any)=>entry?.type===ConversationScrollKeeper);
      const index=beforeMarker<0?existing.length:beforeMarker;
      const inline=mode==='controller'&&generalProposal?
        [<InlineGeneralProposal key="review-action" host={host} proposalNode={generalProposal} ar={ar}/>]:[];
      // One document review card owns its PDF, edit and guarded approval actions.
      // Avoid rendering a second approval card below the same draft.
      const unified=existing.map((entry:any)=>entry?.type===ConversationDocumentCard?
        react.cloneElement(entry,{approval}):entry);
      return react.cloneElement(child,undefined,...unified.slice(0,index),...inline,...unified.slice(index));
    });
    return react.cloneElement(node,{'aria-label':'LOUREX AI',dir:ar?'rtl':'ltr','data-ai-ui-language':ar?'ar':'en','data-lourex-workspace':'2','data-ai-motion':currentAiExperiencePreferences(host).motion,'data-workspace-ready':'true','data-workspace-mode':mode,'data-workspace-open':String(open),'data-workspace-pane':pane},...compactHeader,tabs,description,<div className="lxw-body"><div className="lxw-chat">{host.state.__workspaceSettingsOpen?<AiExperienceSettings host={host}/>:host.state.__workspaceHistoryOpen?<AiConversationHistory host={host} ar={ar}/>:<>{chatContent}</>}</div>{open?<ArtifactWorkspace key={kernelScopeKey(k.scope)} host={host} approval={approval}/>:null}</div>,...(memoryManagerBridge?[memoryManagerBridge]:[]));
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
        host.__businessThreads=[];host.__lourexLastConversationSources=[];host.__lourexLastConversationFiles=[];host.__lourexLastConversationSourceScope='';(globalThis as any).__lourexConversationSourcesV3=[];
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
  const dismiss=host.dismissProposal.bind(host);host.dismissProposal=()=>{
    if(disabled(host)||host.__foundationApprovalBusy||host.__workspaceDismissBusy)return;
    const proposal=host.state.proposal;if(!proposal)return;
    host.__workspaceDismissBusy=true;
    void dismissIntelligenceWorkspace(host,proposal).then(()=>{
      // Only the original dismiss callback records the audit and clears the UI.
      if(host.state.proposal===proposal)dismiss();
    }).catch((error:Error)=>host.setState({error:error.message}))
      .finally(()=>{host.__workspaceDismissBusy=false;});
  };
  // In-memory only; key includes account, workspace, branch and thread identity.
  const drafts=new Map<string,string>();
  host.__workspaceComposerDrafts=drafts;
  // Immediately remove volatile UI references during scope/thread changes. Hydrate
  // the requested thread before redisplaying its encrypted working artifact.
  for(const name of ['__lourexSetScope','__lourexOpenThread','__lourexNewConversation','__lourexDeleteThread']){
    const old=host[name]?.bind(host);if(!old)continue;
    if(name==='__lourexSetScope')host.__workspaceBaseSetScope=old;
    host[name]=async(...args:any[])=>{
      if(disabled(host)&&!host.__workspaceInternalModeSwitch)return;
      const departing=host.__intelligenceKernel as ConversationKernel|undefined;
      if(departing?.scope){
        const key=kernelScopeKey(departing.scope),text=String(host.state.input||'');
        if(text)drafts.set(key,text);else drafts.delete(key);
      }
      clearConversationToolPresentation(host);host.__intelligenceKernel=undefined;host.__foundationVault=undefined;host.__lourexLatestContext=undefined;host.__businessMemories=[];host.__businessThreads=[];host.__lourexLastConversationSources=[];host.__lourexLastConversationFiles=[];host.__lourexLastConversationSourceScope='';(globalThis as any).__lourexConversationSourcesV3=[];
      host.setState({__workspaceOpen:false,__workspacePane:'chat',__workspaceSavedId:'',__workspaceEditing:false,__workspaceSettingsOpen:false,__workspaceHistoryOpen:false,__workspaceHistoryBusy:false,__workspaceHistoryError:'',__workspaceReviewedProposal:null,assistantEvidence:null,conversationAttachments:[],proposal:null,review:null});
      await old(...args);await refresh();
      const arrived=host.__intelligenceKernel as ConversationKernel|undefined;
      if(arrived?.scope)host.setState({input:drafts.get(kernelScopeKey(arrived.scope))||''});
    };
  }
  // Each mode opens its own scoped thread. Never relabel an existing turn.
  // Preserve the exact last-used thread separately for each mode and company.
  const recentModeThread=new Map<string,string>();
  host.__workspaceSwitchMode=async(target:AiConversationMode)=>{
    if(target!=='controller'&&target!=='advisor')return;
    if(disabled(host)||host.__workspaceModeSwitchBusy)return;
    const previous=host.__intelligenceKernel as ConversationKernel|undefined;
    if(!previous||previous.scope.scope!=='business'||normalizeAiConversationMode(previous.mode)===target)return;
    host.__workspaceModeSwitchBusy=true;host.__workspaceInternalModeSwitch=true;
    drafts.set(kernelScopeKey(previous.scope),String(host.state.input||''));
    const keyFor=(mode:AiConversationMode)=>JSON.stringify([previous.scope.accountId,previous.scope.workspaceId,previous.scope.branchId,mode]);
    recentModeThread.set(keyFor(normalizeAiConversationMode(previous.mode)),previous.scope.threadId);
    host.setState({__workspaceSwitching:true,error:''});
    try{
      const matching=(host.__businessThreads||[]).filter((row:any)=>row.mode===target).sort((a:any,b:any)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
      const selected=matching.find((row:any)=>row.id===recentModeThread.get(keyFor(target)))||matching[0];
      if(selected&&selected.id!==previous.scope.threadId)await host.__lourexOpenThread(selected.id);
      else await host.__lourexNewConversation();
      if(!host.__intelligenceKernel)throw new Error('The selected conversation could not be loaded.');
      if(normalizeAiConversationMode(host.__intelligenceKernel.mode)!==target)await assignIntelligenceConversationMode(host,target);
      const current=host.__intelligenceKernel as ConversationKernel;
      if(normalizeAiConversationMode(current.mode)!==target||current.scope.accountId!==previous.scope.accountId||current.scope.workspaceId!==previous.scope.workspaceId||current.scope.branchId!==previous.scope.branchId)throw new Error('Selected conversation mode or scope did not match. Retry.');
      recentModeThread.set(keyFor(target),current.scope.threadId);
      // Mode assignment persisted the new empty thread, but refresh() took
      // its list snapshot before that save. Make it immediately selectable
      // so a rapid mode switch does not discard a new thread or its draft.
      if(!(host.__businessThreads||[]).some((row:any)=>row.id===current.scope.threadId)){
        host.__businessThreads=[{
          id:current.scope.threadId,title:'',updatedAt:new Date().toISOString(),
          mode:target,hasArtifact:Boolean(current.artifact),
          artifactTitle:current.artifact?.proposal.label||''
        },...(host.__businessThreads||[])];
      }
      host.setState({input:drafts.get(kernelScopeKey(current.scope))||'',__workspaceSettingsOpen:false});
    }catch(error){
      host.setState({error:error instanceof Error?error.message:String(error)});
    }finally{
      host.__workspaceModeSwitchBusy=false;host.__workspaceInternalModeSwitch=false;
      host.setState({__workspaceSwitching:false});
    }
  };
  host.__workspaceSendAdvisorProposal=async(text:string)=>{
    if(disabled(host)||host.__workspaceAdvisorHandoffBusy||host.__workspaceModeSwitchBusy)return;
    const from=host.__intelligenceKernel as ConversationKernel|undefined;
    if(!from||normalizeAiConversationMode(from.mode)!=='advisor'||from.scope.scope!=='business'){
      host.setState({error:'An Advisor business conversation is required for a handoff.'});return;
    }
    const scopedFrom={...from.scope};
    host.__workspaceAdvisorHandoffBusy=true;
    try{
      if(!String(text||'').trim()||text.length>4000)throw new Error('Select one specific, concise Advisor response.');
      await host.__workspaceSwitchMode('controller');
      const destination=host.__intelligenceKernel as ConversationKernel|undefined;
      if(!destination||normalizeAiConversationMode(destination.mode)!=='controller')
        throw new Error('Controller was not opened. No handoff was made.');
      if(String(host.state.input||'').trim())
        throw new Error('Controller already has an unsent message. Preserve or send it before handing off this proposal.');
      const prepared=prepareAdvisorControllerHandoff(text,scopedFrom,destination.scope,currentAiInterfaceLanguage(host));
      // Draft text in the composer only. No call to ask(), stageKernelArtifact,
      // approveProposal or any document/customer/product writer occurs here.
      host.setState({input:prepared,error:'',__workspaceSettingsOpen:false,__workspaceHistoryOpen:false});
    }catch(error){host.setState({error:error instanceof Error?error.message:String(error)});}
    finally{host.__workspaceAdvisorHandoffBusy=false;}
  };
  host.__workspaceRefresh=refresh;
  // AI workflow tools use this single, checked bridge into the Advisor.
  // No action is routed through Controller and no message is sent if the
  // account/scope, selected mode, or existing unsent draft is unsafe.
  const receiveWorkflowAdvisor=(event:Event)=>{
    const detail=(event as CustomEvent).detail as {prompt?:unknown;submit?:unknown;handled?:boolean}|undefined;
    const prompt=typeof detail?.prompt==='string'?detail.prompt.trim().slice(0,1000):'';
    if(!prompt||host.mounted===false||host.__workspaceWorkflowHandoffBusy||host.__workspaceModeSwitchBusy)return;
    if(detail)detail.handled=true;
    host.__workspaceWorkflowHandoffBusy=true;
    void (async()=>{
      if(!host.state.open){
        host.toggle();
        // Wait for the state transition; the context tool just closed its
        // portal and the legacy toggle may refuse while another modal exists.
        await new Promise<void>(resolve=>host.setState({},resolve));
        if(!host.state.open)throw new Error('The LOUREX conversation could not be opened. No Advisor request was sent.');
        await refresh();
      }else if(!host.__intelligenceKernel)await refresh();
      const current=host.__intelligenceKernel as ConversationKernel|undefined;
      if(!host.state.open||!current||current.scope.scope!=='business')
        throw new Error('Open the LOUREX business conversation and retry the Advisor request.');
      if(normalizeAiConversationMode(current.mode)!=='advisor'){
        await host.__workspaceSwitchMode('advisor');
        // The selected thread's composer draft is set asynchronously by
        // React; wait before deciding whether it is safe to insert a prompt.
        await new Promise<void>(resolve=>host.setState({},resolve));
        const selected=host.__intelligenceKernel as ConversationKernel|undefined;
        if(!selected||normalizeAiConversationMode(selected.mode)!=='advisor'||selected.scope.accountId!==current.scope.accountId||
          selected.scope.workspaceId!==current.scope.workspaceId||selected.scope.branchId!==current.scope.branchId)
          throw new Error('Advisor mode was not opened. No request was sent.');
      }
      if(disabled(host))throw new Error('The conversation is busy. Retry this Advisor request after the current operation.');
      if(String(host.state.input||'').trim())throw new Error('Advisor has an unsent message. Send or clear it before opening another analysis.');
      host.setState({input:prompt,__workspaceSettingsOpen:false,__workspaceHistoryOpen:false,error:''});
      // Submission uses the actual selected Advisor conversation and the
      // existing authenticated ask/response pipeline, never tool.execute.
      if(detail?.submit===true)await host.ask(prompt);
    })().catch((error:Error)=>host.setState({error:error.message||String(error)}))
      .finally(()=>{host.__workspaceWorkflowHandoffBusy=false;});
  };
  host.__workspaceWorkflowHandoffHandler=receiveWorkflowAdvisor;
  window.addEventListener('lourex-ai-workflow-advisor',receiveWorkflowAdvisor);
  const viewport=()=>syncWorkspaceViewport();host.__workspaceViewport=viewport;
  window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);
  void host.__lourexLoadPromise?.then(refresh);
}
function syncWorkspaceViewport():void {
  const panel=document.getElementById('lourex-ai-panel');if(!panel)return;
  const viewport=window.visualViewport,height=viewport?.height||window.innerHeight,top=viewport?.offsetTop||0;
  // Keystrokes re-render the host. Avoid invalidating panel layout when the
  // actual visual viewport has not changed.
  if(panel.style.getPropertyValue('--lxw-viewport-height')!==height+'px')panel.style.setProperty('--lxw-viewport-height',height+'px');
  if(panel.style.getPropertyValue('--lxw-viewport-top')!==top+'px')panel.style.setProperty('--lxw-viewport-top',top+'px');
}
export function updateConversationWorkspace(host:Host,previous:unknown):void {
  syncWorkspaceViewport();
  if(previous!==host.props){clearConversationToolPresentation(host);host.__workspaceComposerDrafts?.clear();host.__workspaceObservedProps=undefined;host.__foundationVault=undefined;host.__businessMemories=[];host.__businessThreads=[];host.__workspaceRefresh?.();}
}
export function unmountConversationWorkspace(host:Host):void {host.__workspaceComposerDrafts?.clear();if(host.__workspaceWorkflowHandoffHandler){window.removeEventListener('lourex-ai-workflow-advisor',host.__workspaceWorkflowHandoffHandler);host.__workspaceWorkflowHandoffHandler=undefined;}host.__workspaceLoadGeneration=(host.__workspaceLoadGeneration||0)+1;if(host.__workspaceLoadTimer)window.clearTimeout(host.__workspaceLoadTimer);host.__workspaceLoadTimer=0;window.visualViewport?.removeEventListener('resize',host.__workspaceViewport);window.visualViewport?.removeEventListener('scroll',host.__workspaceViewport);window.removeEventListener('resize',host.__workspaceViewport);}
