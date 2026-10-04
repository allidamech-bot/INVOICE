import { buildProactiveSnapshot, proactiveCategoryKey, type ProactiveSignal, type ProactiveSnapshot } from '../lib/proactive-assistant.js';
import { validatedNotificationStateEvent } from '../lib/notification-center.js';
import { scopeVault } from '../lib/workspaces.js';
import { t } from '../lib/i18n.js';
import { loadAssistantTasks, completeAssistantTask, snoozeAssistantTask } from '../storage/assistant-task-store.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { resumeVaultSession } from '../storage/vault.js';
import { Modal } from './UI.js';

interface State{snapshot:ProactiveSnapshot|null;busy:boolean;briefOpen:boolean;error:string;muted:string[];dismissed:string[];snoozed:Record<string,string>;}
const MUTED_KEY='lourex-ai-proactive-muted-v1';
const DISMISSED_KEY='lourex-ai-proactive-dismissed-v1';
const SNOOZE_KEY='lourex-ai-proactive-snooze-v1';
function readList(storage:Storage,key:string,max=80):string[]{try{const value=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(value)?value.filter(row=>typeof row==='string').slice(0,max):[];}catch{return[];}}
function writeList(storage:Storage,key:string,values:string[]):void{try{storage.setItem(key,JSON.stringify(Array.from(new Set(values)).slice(0,80)));}catch{}}
function readSnoozed():Record<string,string>{try{const value=JSON.parse(localStorage.getItem(SNOOZE_KEY)||'{}');if(!value||typeof value!=='object'||Array.isArray(value))return{};const result:Record<string,string>={};for(const [key,until] of Object.entries(value).slice(0,100)){if(typeof until==='string'&&Number.isFinite(Date.parse(until)))result[String(key).slice(0,180)]=until;}return result;}catch{return{};}}
function writeSnoozed(value:Record<string,string>):void{try{localStorage.setItem(SNOOZE_KEY,JSON.stringify(Object.fromEntries(Object.entries(value).slice(0,100))));}catch{}}
function tomorrowIso():string{const date=new Date();date.setDate(date.getDate()+1);return date.toISOString().slice(0,10);}
function tomorrowDateTime():string{const date=new Date();date.setHours(date.getHours()+24);return date.toISOString();}
function levelLabel(level:ProactiveSignal['level']):string{return level==='urgent'?t('URGENT','عاجل'):level==='attention'?t('ATTENTION','انتباه'):level==='opportunity'?t('OPPORTUNITY','فرصة'):t('INFO','معلومة');}
function allSignals(snapshot:ProactiveSnapshot|null):ProactiveSignal[]{return snapshot?[...snapshot.business.signals,...snapshot.personal.signals]:[];}
function openSignal(signal:ProactiveSignal):void{
  if(signal.target==='assistant-tasks'){
    const launcher=document.querySelector<HTMLButtonElement>('.lourex-ai-launcher');if(launcher&&!document.getElementById('lourex-ai-panel'))launcher.click();
    window.setTimeout(()=>document.querySelector<HTMLButtonElement>('#lourex-ai-panel .lourex-ai-manager-button')?.click(),80);return;
  }
  if(signal.target==='search'){
    window.dispatchEvent(new CustomEvent('lourex-global-search-open',{detail:{query:signal.entityNumber||signal.title,autoOpenUnique:true}}));return;
  }
  if(['receivables','documents','operations','items'].includes(signal.target))window.dispatchEvent(new CustomEvent('lourex-global-action',{detail:{action:'navigate',target:signal.target}}));
}
export class ProactiveAssistantTool extends React.Component<Record<string,never>,State>{
  state:State={snapshot:null,busy:false,briefOpen:false,error:'',muted:readList(localStorage,MUTED_KEY),dismissed:readList(sessionStorage,DISMISSED_KEY),snoozed:readSnoozed()};
  private timer:number|undefined;
  componentDidMount():void{void this.refresh();window.addEventListener('focus',this.onWake);document.addEventListener('visibilitychange',this.onVisibility);this.timer=window.setInterval(()=>void this.refresh(),5*60*1000);}
  componentWillUnmount():void{window.removeEventListener('focus',this.onWake);document.removeEventListener('visibilitychange',this.onVisibility);if(this.timer)window.clearInterval(this.timer);}
  private onWake=()=>{void this.refresh();};
  private onVisibility=()=>{if(document.visibilityState==='visible')void this.refresh();};
  private refresh=async()=>{if(this.state.busy)return;this.setState({busy:true});try{const resumed=await resumeVaultSession();if(!resumed){this.setState({busy:false,snapshot:null});return;}const vault=scopeVault(resumed.vault),tasks=await loadAssistantTasks(resumed.key);this.setState({busy:false,error:'',snapshot:buildProactiveSnapshot(vault,tasks.tasks,{mutedCategories:this.state.muted})});}catch(error){this.setState({busy:false,error:error instanceof Error?error.message:String(error)});}};
  private isSnoozed=(key:string)=>{const until=this.state.snoozed[key];return Boolean(until&&Date.parse(until)>Date.now());};
  private visibleSignals=()=>allSignals(this.state.snapshot).filter(row=>!this.state.dismissed.includes(row.key)&&!this.state.muted.includes(proactiveCategoryKey(row))&&!this.isSnoozed(row.key));
  private top=()=>this.visibleSignals().sort((a,b)=>({urgent:4,attention:3,opportunity:2,info:1}[b.level]-{urgent:4,attention:3,opportunity:2,info:1}[a.level]))[0]??null;
  private dismiss=(signal:ProactiveSignal)=>{const next=Array.from(new Set([...this.state.dismissed,signal.key]));writeList(sessionStorage,DISMISSED_KEY,next);this.setState({dismissed:next});};
  private mute=(signal:ProactiveSignal)=>{const key=proactiveCategoryKey(signal),next=Array.from(new Set([...this.state.muted,key]));writeList(localStorage,MUTED_KEY,next);this.setState({muted:next},()=>void this.refresh());};
  private unmute=(key:string)=>{const next=this.state.muted.filter(value=>value!==key);writeList(localStorage,MUTED_KEY,next);this.setState({muted:next},()=>void this.refresh());};
  private localSnooze=(signal:ProactiveSignal)=>{const next={...this.state.snoozed,[signal.key]:tomorrowDateTime()};writeSnoozed(next);this.setState({snoozed:next});};
  private snooze=async(signal:ProactiveSignal)=>{try{this.setState({busy:true,error:''});const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX first.','افتح قفل LOUREX أولاً.'));
    if(signal.source==='notification'&&signal.notificationKey)await mutateVaultSafely(vault=>({...vault,documentEvents:[...vault.documentEvents,validatedNotificationStateEvent(scopeVault(vault),signal.notificationKey,'snooze',tomorrowIso())]}));
    else if(signal.source==='assistant-task'&&signal.taskId)await snoozeAssistantTask(resumed.key,signal.taskId,tomorrowDateTime());
    else this.localSnooze(signal);
    this.setState({busy:false});await this.refresh();
  }catch(error){this.setState({busy:false,error:error instanceof Error?error.message:String(error)});}};
  private done=async(signal:ProactiveSignal)=>{try{this.setState({busy:true,error:''});const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX first.','افتح قفل LOUREX أولاً.'));
    if(signal.source==='notification'&&signal.notificationKey)await mutateVaultSafely(vault=>({...vault,documentEvents:[...vault.documentEvents,validatedNotificationStateEvent(scopeVault(vault),signal.notificationKey,'done')]}));
    else if(signal.source==='assistant-task'&&signal.taskId)await completeAssistantTask(resumed.key,signal.taskId);
    else this.dismiss(signal);
    this.setState({busy:false});await this.refresh();
  }catch(error){this.setState({busy:false,error:error instanceof Error?error.message:String(error)});}};
  private renderSignal=(signal:ProactiveSignal,compact=false):any=><article className={`lourex-proactive-signal is-${signal.level}`} key={signal.key}><div className="lourex-proactive-copy"><small>{levelLabel(signal.level)} · {signal.scope==='personal'?t('PERSONAL','شخصي'):t('BUSINESS','أعمال')}</small><strong><bdi dir="auto">{signal.title}</bdi></strong>{compact?null:<p><bdi dir="auto">{signal.detail}</bdi></p>}</div><div className="lourex-proactive-actions"><button type="button" onClick={()=>openSignal(signal)}>{t('Open','فتح')}</button><button type="button" onClick={()=>void this.snooze(signal)}>{t('Remind later','ذكرني لاحقًا')}</button><button type="button" onClick={()=>this.dismiss(signal)}>{t('Dismiss','إخفاء')}</button>{compact?null:<><button type="button" onClick={()=>void this.done(signal)}>{t('Done','تم')}</button><button type="button" onClick={()=>this.mute(signal)}>{t('Mute category','كتم الفئة')}</button></>}</div></article>;
  private renderBriefSection=(scope:'business'|'personal')=>{const section=this.state.snapshot?.[scope],signals=(section?.signals??[]).filter(row=>!this.state.dismissed.includes(row.key)&&!this.state.muted.includes(proactiveCategoryKey(row))&&!this.isSnoozed(row.key));return <section className="lourex-proactive-section"><div className="lourex-proactive-section-head"><strong>{scope==='business'?t('Business','الأعمال'):t('Personal','الشخصي')}</strong><small>{section?`${section.urgent} ${t('urgent','عاجل')} · ${section.attention} ${t('attention','انتباه')} · ${section.opportunities} ${t('opportunities','فرص')}`:''}</small></div>{signals.length?signals.map(row=>this.renderSignal(row)):<p>{scope==='business'?t('No high-value business follow-up right now.','لا توجد متابعة أعمال عالية القيمة الآن.'):t('No personal reminders are due right now.','لا توجد تذكيرات شخصية مستحقة الآن.')}</p>}</section>;};
  private renderMuted=()=>this.state.muted.length?<section className="lourex-proactive-section lourex-proactive-muted"><div className="lourex-proactive-section-head"><strong>{t('Muted categories','الفئات المكتومة')}</strong></div><div className="lourex-proactive-actions">{this.state.muted.map(key=><button type="button" key={key} onClick={()=>this.unmute(key)}>{t('Unmute','إلغاء الكتم')} · <bdi dir="auto">{key}</bdi></button>)}</div></section>:null;
  render():any{if(!this.state.snapshot)return null;const top=this.top();return <><div className={`lourex-proactive-dock${top?' has-signal':''}`}>{top?this.renderSignal(top,true):null}<button type="button" className="lourex-proactive-brief-button" onClick={()=>this.setState({briefOpen:true})}>{t('Morning Brief','ملخص اليوم')}</button></div><Modal portal open={this.state.briefOpen} title={t('LOUREX Morning Brief','ملخص LOUREX اليومي')} size="lg" onClose={()=>this.setState({briefOpen:false})}><div className="lourex-proactive-brief">{this.renderBriefSection('business')}{this.renderBriefSection('personal')}{this.renderMuted()}{this.state.error?<p role="alert">{this.state.error}</p>:null}<p className="lourex-proactive-note"><small>{t('Business and Personal scopes stay separate. Signals are deterministic; no financial value is invented or combined across currencies.','يبقى نطاق الأعمال والنطاق الشخصي منفصلين. الإشارات حتمية ولا يتم اختراع أي قيمة مالية أو جمع العملات المختلفة.')}</small></p></div></Modal></>;}
}
