import type { UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';

export type AiWorkspaceScreen='home'|'documents'|'customers'|'receivables'|'reports'|'items'|'operations'|'editor';
export type AiNavTarget=Exclude<AiWorkspaceScreen,'editor'>;
export type AiCapabilityId='workspace.help'|'workspace.navigate';

export interface AiCapabilityDefinition {
  id:AiCapabilityId;
  mode:'read'|'execute';
  requiresApproval:boolean;
  dataMutation:boolean;
}

export const AI_CAPABILITIES:ReadonlyArray<AiCapabilityDefinition>=Object.freeze([
  {id:'workspace.help',mode:'read',requiresApproval:false,dataMutation:false},
  {id:'workspace.navigate',mode:'execute',requiresApproval:true,dataMutation:false}
]);

export interface AiContextEnvelope {
  version:1;
  screen:AiWorkspaceScreen;
  language:UiLanguage;
  allowedCapabilities:AiCapabilityId[];
}

export interface AiNavigationProposal {
  capability:'workspace.navigate';
  target:AiNavTarget;
  label:string;
  rationale:string;
}

interface AiServerResponse {answer:string;proposal?:AiNavigationProposal|null;}
interface AiMessage {id:string;role:'user'|'assistant';text:string;}
interface AiAuditEntry {id:string;at:string;capability:AiCapabilityId;outcome:'requested'|'answered'|'approved'|'dismissed'|'failed';screen:AiWorkspaceScreen;}

interface Props {
  screen:AiWorkspaceScreen;
  language:UiLanguage;
  onNavigate:(screen:AiNavTarget)=>void;
}

interface State {
  open:boolean;
  busy:boolean;
  input:string;
  error:string;
  messages:AiMessage[];
  proposal:AiNavigationProposal|null;
  audit:AiAuditEntry[];
  auditOpen:boolean;
}

const NAV_TARGETS=new Set<AiNavTarget>(['home','documents','customers','receivables','reports','items','operations']);
const MAX_MESSAGE_CHARS=1000;

function id(prefix:string):string{return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}

export function buildAiContext(screen:AiWorkspaceScreen,language:UiLanguage):AiContextEnvelope{
  return {version:1,screen,language,allowedCapabilities:AI_CAPABILITIES.map(capability=>capability.id)};
}

export function capabilityRequiresApproval(capability:AiCapabilityId):boolean{
  return AI_CAPABILITIES.find(item=>item.id===capability)?.requiresApproval!==false;
}

export function safeNavigationProposal(value:any):AiNavigationProposal|null{
  if(!value||value.capability!=='workspace.navigate'||!NAV_TARGETS.has(value.target))return null;
  return {capability:'workspace.navigate',target:value.target,label:String(value.label||'Open section').slice(0,80),rationale:String(value.rationale||'').slice(0,180)};
}

function screenLabel(screen:AiWorkspaceScreen):string{
  switch(screen){
    case 'home':return t('Home','الرئيسية');
    case 'documents':return t('Documents','المستندات');
    case 'customers':return t('Customers','العملاء');
    case 'receivables':return t('Receivables','المستحقات');
    case 'reports':return t('Reports','التقارير');
    case 'items':return t('Items','الأصناف');
    case 'operations':return t('Operations','العمليات');
    case 'editor':return t('Document Editor','محرر المستند');
  }
}

function starterPrompts(screen:AiWorkspaceScreen):string[]{
  if(screen==='reports')return [t('What can I do in reports?','ماذا يمكنني أن أفعل في التقارير؟'),t('Take me to receivables','خذني إلى المستحقات')];
  if(screen==='receivables')return [t('What is this page for?','ما وظيفة هذه الصفحة؟'),t('Take me to reports','خذني إلى التقارير')];
  if(screen==='items')return [t('What can I manage here?','ماذا يمكنني إدارة هنا؟'),t('Take me to operations','خذني إلى العمليات')];
  if(screen==='editor')return [t('What should I review before finalizing?','ماذا أراجع قبل الاعتماد؟'),t('Take me to documents','خذني إلى المستندات')];
  return [t('What can you help me with here?','كيف يمكنك مساعدتي هنا؟'),t('Show me where reports are','أرني أين توجد التقارير')];
}

const AI_CORE_CSS=`
.lourex-ai-launcher{position:fixed;z-index:1180;right:22px;bottom:22px;width:52px;height:52px;border:1px solid rgba(184,160,113,.35);border-radius:16px;background:#111;color:#f6f0e5;box-shadow:0 14px 34px rgba(0,0,0,.34);display:grid;place-items:center;font:700 21px/1 Inter,sans-serif;cursor:pointer;transition:transform .16s ease,border-color .16s ease,background .16s ease}.lourex-ai-launcher:hover{transform:translateY(-2px);border-color:rgba(184,160,113,.7);background:#171717}.lourex-ai-launcher[aria-expanded="true"]{background:#1b1916;border-color:#b8a071}.lourex-ai-backdrop{position:fixed;inset:0;z-index:1181;background:rgba(0,0,0,.42);backdrop-filter:blur(2px)}.lourex-ai-panel{position:fixed;z-index:1182;top:14px;right:14px;bottom:14px;width:min(410px,calc(100vw - 28px));border:1px solid rgba(255,255,255,.1);border-radius:22px;background:#0d0d0e;color:#f6f4ef;box-shadow:0 24px 80px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden}.lourex-ai-panel[dir="rtl"]{right:auto;left:14px}.lourex-ai-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px 18px 14px;border-bottom:1px solid rgba(255,255,255,.08);background:#101011}.lourex-ai-title{display:flex;gap:12px;align-items:center}.lourex-ai-mark{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;border:1px solid rgba(184,160,113,.35);background:#171512;color:#d8c08e}.lourex-ai-title strong{display:block;font-size:15px}.lourex-ai-title small{display:block;color:#9e9b94;margin-top:3px}.lourex-ai-close{border:0;background:transparent;color:#aaa;font-size:24px;line-height:1;cursor:pointer;padding:4px}.lourex-ai-context{padding:9px 16px;border-bottom:1px solid rgba(255,255,255,.06);font-size:12px;color:#b8a071;background:#0b0b0c}.lourex-ai-messages{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:10px}.lourex-ai-empty{padding:14px;border:1px solid rgba(255,255,255,.07);border-radius:16px;background:#121213}.lourex-ai-empty strong{display:block;margin-bottom:6px;font-size:14px}.lourex-ai-empty p{margin:0;color:#aaa;font-size:13px;line-height:1.55}.lourex-ai-starters{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.lourex-ai-starters button{border:1px solid rgba(255,255,255,.09);border-radius:999px;background:#181819;color:#ddd;padding:8px 10px;font:600 11px/1.2 Inter,sans-serif;cursor:pointer}.lourex-ai-message{max-width:88%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.55;white-space:pre-wrap}.lourex-ai-message.user{align-self:flex-end;background:#23201a;border:1px solid rgba(184,160,113,.24)}.lourex-ai-message.assistant{align-self:flex-start;background:#151516;border:1px solid rgba(255,255,255,.07)}.lourex-ai-proposal{margin:0 16px 12px;padding:12px;border:1px solid rgba(184,160,113,.28);border-radius:16px;background:#171510}.lourex-ai-proposal small{color:#b8a071}.lourex-ai-proposal strong{display:block;margin:4px 0;font-size:13px}.lourex-ai-proposal p{margin:0 0 10px;color:#aaa;font-size:12px;line-height:1.45}.lourex-ai-proposal-actions{display:flex;gap:8px}.lourex-ai-proposal-actions button{flex:1;border-radius:10px;padding:9px 10px;border:1px solid rgba(255,255,255,.1);background:#181819;color:#ddd;font-weight:700;cursor:pointer}.lourex-ai-proposal-actions button.primary{background:#b8a071;color:#111;border-color:#b8a071}.lourex-ai-compose{padding:12px;border-top:1px solid rgba(255,255,255,.08);background:#101011}.lourex-ai-compose form{display:flex;gap:8px}.lourex-ai-compose input{min-width:0;flex:1;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#171718;color:#f4f2ed;padding:11px 12px;outline:none}.lourex-ai-compose input:focus{border-color:rgba(184,160,113,.55)}.lourex-ai-send{width:42px;border-radius:12px;border:1px solid #b8a071;background:#b8a071;color:#111;font-weight:900;cursor:pointer}.lourex-ai-send:disabled{opacity:.5;cursor:not-allowed}.lourex-ai-error{margin:0 12px 8px;padding:8px 10px;border-radius:10px;background:rgba(153,54,54,.16);color:#e7aaaa;font-size:12px}.lourex-ai-meta{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;color:#777;font-size:10px}.lourex-ai-meta button{border:0;background:transparent;color:#8f8c85;padding:0;cursor:pointer;font-size:10px}.lourex-ai-audit{max-height:110px;overflow:auto;margin-top:8px;padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#0c0c0d}.lourex-ai-audit div{display:flex;justify-content:space-between;gap:8px;padding:3px 0;color:#85827c;font-size:10px}.lourex-ai-busy{color:#8d8a84;font-size:12px;padding:2px 0}.lourex-ai-panel button:focus-visible,.lourex-ai-launcher:focus-visible{outline:2px solid #d5bb86;outline-offset:2px}
@media(max-width:720px){.lourex-ai-launcher{right:14px;bottom:calc(84px + env(safe-area-inset-bottom));width:50px;height:50px;border-radius:15px}.lourex-ai-backdrop{background:rgba(0,0,0,.48)}.lourex-ai-panel,.lourex-ai-panel[dir="rtl"]{top:auto;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));width:auto;height:min(88dvh,760px);border-radius:22px 22px 18px 18px}.lourex-ai-panel:before{content:"";width:38px;height:4px;border-radius:99px;background:#3a3a3c;position:absolute;top:7px;left:50%;transform:translateX(-50%)}.lourex-ai-head{padding-top:20px}.lourex-ai-message{max-width:92%}}
@media(prefers-reduced-motion:reduce){.lourex-ai-launcher{transition:none}}
`;

export class AiCopilot extends React.Component<Props,State>{
  state:State={open:false,busy:false,input:'',error:'',messages:[],proposal:null,audit:[],auditOpen:false};

  componentDidMount():void{document.addEventListener('keydown',this.onKeyDown);}
  componentWillUnmount():void{document.removeEventListener('keydown',this.onKeyDown);}

  private onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'&&this.state.open)this.setState({open:false,proposal:null,error:''});};
  private addAudit=(capability:AiCapabilityId,outcome:AiAuditEntry['outcome'])=>this.setState(state=>({audit:[{id:id('audit'),at:new Date().toISOString(),capability,outcome,screen:this.props.screen},...state.audit].slice(0,20)}));
  private toggle=()=>this.setState(state=>({open:!state.open,error:'',proposal:state.open?null:state.proposal}));

  private ask=async(raw?:string)=>{
    if(this.state.busy)return;
    const message=String(raw??this.state.input).trim().slice(0,MAX_MESSAGE_CHARS);if(!message)return;
    const userMessage:AiMessage={id:id('user'),role:'user',text:message};
    this.setState(state=>({busy:true,error:'',input:'',proposal:null,messages:[...state.messages,userMessage]}));
    this.addAudit('workspace.help','requested');
    try{
      const response=await fetch('/api/ai-core',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice'},body:JSON.stringify({message,context:buildAiContext(this.props.screen,this.props.language)})});
      let payload:any={};try{payload=await response.json();}catch{}
      if(!response.ok)throw new Error(String(payload?.message||t('LOUREX AI is temporarily unavailable.','ذكاء LOUREX غير متاح مؤقتًا.')));
      const answer=String(payload?.answer||'').trim().slice(0,4000)||t('I could not form a useful answer from this request.','لم أتمكن من تكوين إجابة مفيدة لهذا الطلب.');
      const proposal=safeNavigationProposal(payload?.proposal);
      const assistant:AiMessage={id:id('assistant'),role:'assistant',text:answer};
      this.setState(state=>({busy:false,messages:[...state.messages,assistant],proposal}));
      this.addAudit('workspace.help','answered');
    }catch(error){
      const text=error instanceof Error?error.message:t('LOUREX AI is temporarily unavailable.','ذكاء LOUREX غير متاح مؤقتًا.');
      this.setState({busy:false,error:text});this.addAudit('workspace.help','failed');
    }
  };

  private approveProposal=()=>{
    const proposal=this.state.proposal;if(!proposal)return;
    if(!capabilityRequiresApproval(proposal.capability)||!NAV_TARGETS.has(proposal.target))return;
    this.addAudit(proposal.capability,'approved');
    this.setState({proposal:null,open:false},()=>this.props.onNavigate(proposal.target));
  };
  private dismissProposal=()=>{if(this.state.proposal)this.addAudit(this.state.proposal.capability,'dismissed');this.setState({proposal:null});};

  render():any{
    const prompts=starterPrompts(this.props.screen);
    return <>
      <style data-lourex-ai-core="v263">{AI_CORE_CSS}</style>
      <button type="button" className="lourex-ai-launcher" aria-label={t('Open LOUREX AI','فتح ذكاء LOUREX')} aria-expanded={this.state.open} aria-controls="lourex-ai-panel" onClick={this.toggle}>✦</button>
      {this.state.open?<>
        <button type="button" className="lourex-ai-backdrop" aria-label={t('Close LOUREX AI','إغلاق ذكاء LOUREX')} onClick={this.toggle}/>
        <aside id="lourex-ai-panel" className="lourex-ai-panel" role="dialog" aria-modal="true" aria-label={t('LOUREX AI','ذكاء LOUREX')} dir={this.props.language==='ar'?'rtl':'ltr'}>
          <header className="lourex-ai-head"><div className="lourex-ai-title"><span className="lourex-ai-mark">✦</span><div><strong>{t('LOUREX AI','ذكاء LOUREX')}</strong><small>{t('Business copilot · approval controlled','مساعد الأعمال · التنفيذ بموافقتك')}</small></div></div><button type="button" className="lourex-ai-close" aria-label={t('Close','إغلاق')} onClick={this.toggle}>×</button></header>
          <div className="lourex-ai-context">{t('Current context','السياق الحالي')}: {screenLabel(this.props.screen)}</div>
          <div className="lourex-ai-messages" aria-live="polite">
            {!this.state.messages.length?<div className="lourex-ai-empty"><strong>{t('Ask without leaving your work','اسأل بدون أن تغادر عملك')}</strong><p>{t('This first AI Core release understands your current LOUREX section, explains workflows and can prepare navigation actions. It cannot edit, delete or change financial records.','هذه النسخة الأولى من AI Core تفهم القسم الحالي وتشرح سير العمل ويمكنها تجهيز الانتقال بين الأقسام. لا يمكنها تعديل أو حذف أو تغيير السجلات المالية.')}</p><div className="lourex-ai-starters">{prompts.map(prompt=><button type="button" key={prompt} onClick={()=>void this.ask(prompt)}>{prompt}</button>)}</div></div>:null}
            {this.state.messages.map(message=><div key={message.id} className={`lourex-ai-message ${message.role}`}>{message.text}</div>)}
            {this.state.busy?<div className="lourex-ai-busy">{t('LOUREX AI is thinking…','ذكاء LOUREX يحلل…')}</div>:null}
          </div>
          {this.state.proposal?<section className="lourex-ai-proposal" aria-label={t('Proposed action','إجراء مقترح')}><small>{t('Approval required','يتطلب موافقتك')}</small><strong>{this.state.proposal.label}</strong><p>{this.state.proposal.rationale}</p><div className="lourex-ai-proposal-actions"><button type="button" onClick={this.dismissProposal}>{t('Dismiss','تجاهل')}</button><button type="button" className="primary" onClick={this.approveProposal}>{t('Approve','موافقة')}</button></div></section>:null}
          <footer className="lourex-ai-compose">{this.state.error?<div className="lourex-ai-error" role="alert">{this.state.error}</div>:null}<form onSubmit={(event:any)=>{event.preventDefault();void this.ask();}}><input value={this.state.input} maxLength={MAX_MESSAGE_CHARS} onChange={(event:any)=>this.setState({input:event.target.value})} placeholder={t('Ask LOUREX…','اسأل LOUREX…')} aria-label={t('Message LOUREX AI','رسالة إلى ذكاء LOUREX')}/><button type="submit" className="lourex-ai-send" disabled={this.state.busy||!this.state.input.trim()} aria-label={t('Send','إرسال')}>→</button></form><div className="lourex-ai-meta"><span>{t('No record changes without approval','لا تغييرات على السجلات دون موافقة')}</span><button type="button" onClick={()=>this.setState(state=>({auditOpen:!state.auditOpen}))}>{t('AI activity','نشاط AI')} · {this.state.audit.length}</button></div>{this.state.auditOpen?<div className="lourex-ai-audit">{this.state.audit.length?this.state.audit.map(entry=><div key={entry.id}><span>{entry.capability}</span><span>{entry.outcome}</span></div>):<div>{t('No AI activity yet','لا يوجد نشاط AI بعد')}</div>}</div>:null}</footer>
        </aside>
      </>:null}
    </>;
  }
}
