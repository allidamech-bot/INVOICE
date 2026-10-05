import { buildMorningBrief, conditionalTaskSignals, visibleProactiveSignals, type ProactiveSignal } from '../lib/ai-proactive-assistant.js';
import { aiKindLabel, aiPriorityLabel, aiSignalDetail } from '../lib/ai-presentation.js';
import { t } from '../lib/i18n.js';
import { scopeVault } from '../lib/workspaces.js';
import { resumeVaultSession } from '../storage/vault.js';
import { loadAssistantTasks, scopedAssistantTasks, type AssistantTaskRecord } from '../storage/assistant-task-store.js';
import { loadProactiveState, dismissProactiveSignal, snoozeProactiveSignal, setProactiveCategoryMuted, setMorningBriefEnabled, proactiveSignalVisible, type ProactiveState, type ProactiveCategory } from '../storage/assistant-proactive-store.js';
import { Button, Modal } from './UI.js';

interface Props{launcher?:boolean;}
interface State{open:boolean;busy:boolean;signals:ProactiveSignal[];personalTasks:Array<{id:string;title:string;dueAt:string;recurrence:string}>;preferences:ProactiveState|null;error:string;}
const OPEN_EVENT='lourex-ai-open-daily';
const WEIGHT:Record<ProactiveCategory,number>={urgent:4,attention:3,opportunity:2,info:1};
function openCanonical(query:string):void{if(!query)return;window.dispatchEvent(new CustomEvent('lourex-global-search-open',{detail:{query,autoOpenUnique:true}}));}
function categoryLabel(value:ProactiveCategory):string{return value==='urgent'?t('URGENT','عاجل'):value==='attention'?t('ATTENTION','انتباه'):value==='opportunity'?t('OPPORTUNITY','فرصة'):t('INFO','معلومة');}
function language(): 'en'|'ar'{return document.documentElement.lang==='ar'?'ar':'en';}
function tomorrowIso():string{const date=new Date();date.setDate(date.getDate()+1);date.setHours(9,0,0,0);return date.toISOString();}
function sortSignals(rows:ProactiveSignal[]):ProactiveSignal[]{const seen=new Set<string>();return [...rows].filter(row=>{if(seen.has(row.key))return false;seen.add(row.key);return true;}).sort((a,b)=>(WEIGHT[b.category]??0)-(WEIGHT[a.category]??0)||a.title.localeCompare(b.title));}
function dueBusinessTaskSignals(tasks:AssistantTaskRecord[],preferences:ProactiveState,at=Date.now()):ProactiveSignal[]{return tasks.filter(task=>task.status==='open'&&task.conditionType==='none'&&(!task.dueAt||Date.parse(task.snoozedUntil||task.dueAt)<=at)).slice(0,8).map((task):ProactiveSignal=>({key:`task-reminder:${task.id}`,kind:'conditional-task',category:'attention',title:`Reminder — ${task.title}`,titleAr:`تذكير — ${task.title}`,detail:task.notes||'A saved business reminder is due.',detailAr:task.notes||'تذكير أعمال محفوظ مستحق الآن.',actionLabel:'Open tasks',actionLabelAr:'فتح المهام',searchQuery:'',evidence:[`assistant-task:${task.id}`]})).filter(signal=>proactiveSignalVisible(preferences,signal));}

export class DailyCommandCenterTool extends React.Component<Props,State>{
  state:State={open:false,busy:false,signals:[],personalTasks:[],preferences:null,error:''};
  componentDidMount():void{window.addEventListener(OPEN_EVENT,this.handleOpen);document.addEventListener('keydown',this.handleModalEscape,true);}
  componentWillUnmount():void{window.removeEventListener(OPEN_EVENT,this.handleOpen);document.removeEventListener('keydown',this.handleModalEscape,true);}
  private handleOpen=()=>{void this.open();};
  private handleModalEscape=(event:KeyboardEvent)=>{if(!this.state.open||event.key!=='Escape')return;event.preventDefault();event.stopPropagation();if(!this.state.busy)this.setState({open:false});};
  private load=async()=>{
    const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before reading today’s priorities.','افتح قفل LOUREX قبل قراءة أولويات اليوم.'));
    const [preferences,tasksState]=await Promise.all([loadProactiveState(resumed.key),loadAssistantTasks(resumed.key)]);
    const vault=scopeVault(resumed.vault),workspaceId=vault.appSettings.activeWorkspaceId,branchId=vault.appSettings.activeBranchId;
    const businessTasks=scopedAssistantTasks(tasksState,{scope:'business',workspaceId,branchId,status:'open'});
    const personalTasks=scopedAssistantTasks(tasksState,{scope:'personal',status:'open'});
    const base=visibleProactiveSignals(vault,preferences,undefined,12);
    const conditional=conditionalTaskSignals(vault,businessTasks).filter(signal=>proactiveSignalVisible(preferences,signal));
    const plain=dueBusinessTaskSignals(businessTasks,preferences);
    const brief=buildMorningBrief(vault,preferences,personalTasks);
    return{preferences,signals:sortSignals([...base,...conditional,...plain]).slice(0,12),personalTasks:brief.personalTasks};
  };
  private open=async()=>{if(this.state.busy)return;this.setState({open:true,busy:true,error:''});try{const loaded=await this.load();this.setState({busy:false,preferences:loaded.preferences,signals:loaded.signals,personalTasks:loaded.personalTasks});}catch(error){this.setState({busy:false,error:error instanceof Error?error.message:String(error)});}};
  private refresh=async()=>{try{const loaded=await this.load();this.setState({preferences:loaded.preferences,signals:loaded.signals,personalTasks:loaded.personalTasks,error:''});}catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}};
  private dismiss=async(key:string)=>{try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX first.','افتح قفل LOUREX أولاً.'));await dismissProactiveSignal(resumed.key,key);await this.refresh();}catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}};
  private snooze=async(key:string)=>{try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX first.','افتح قفل LOUREX أولاً.'));await snoozeProactiveSignal(resumed.key,key,tomorrowIso());await this.refresh();}catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}};
  private mute=async(category:ProactiveCategory,muted:boolean)=>{try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX first.','افتح قفل LOUREX أولاً.'));await setProactiveCategoryMuted(resumed.key,category,muted);await this.refresh();}catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}};
  private toggleBrief=async()=>{try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX first.','افتح قفل LOUREX أولاً.'));const next=!(this.state.preferences?.morningBriefEnabled!==false);await setMorningBriefEnabled(resumed.key,next);await this.refresh();}catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}};
  private title=(signal:ProactiveSignal)=>document.documentElement.lang==='ar'?signal.titleAr:signal.title;
  private detail=(signal:ProactiveSignal)=>{const lang=language();const raw=lang==='ar'?signal.detailAr:signal.detail;return aiSignalDetail(raw,signal.kind,lang);};
  private action=(signal:ProactiveSignal)=>document.documentElement.lang==='ar'?signal.actionLabelAr:signal.actionLabel;
  render():any{
    const muted=this.state.preferences?.mutedCategories??[],briefEnabled=this.state.preferences?.morningBriefEnabled!==false,lang=language();
    const renderSignal=(signal:ProactiveSignal)=><article key={signal.key} className={`lourex-proactive-card lourex-executive-signal is-${signal.category}`}>
      <div className="lourex-executive-signal-meta"><span className="lourex-executive-priority">{t('Priority','الأولوية')}: <b>{aiPriorityLabel(signal.category,lang)}</b></span><span>{aiKindLabel(signal.kind,lang)}</span></div>
      <div className="lourex-executive-signal-grid">
        <div className="lourex-executive-signal-block"><small>{t('Issue','المسألة')}</small><strong><bdi dir="auto">{this.title(signal)}</bdi></strong></div>
        <div className="lourex-executive-signal-block"><small>{t('Impact','الأثر')}</small><p><bdi dir="auto">{this.detail(signal)}</bdi></p></div>
        <div className="lourex-executive-signal-block is-action"><small>{t('Action','الإجراء')}</small><strong>{this.action(signal)}</strong></div>
      </div>
      <div className="ta-customer-modal-actions lourex-executive-actions">{signal.searchQuery?<Button variant={signal.category==='urgent'?'primary':'default'} onClick={()=>{this.setState({open:false});window.setTimeout(()=>openCanonical(signal.searchQuery),0);}}>{this.action(signal)}</Button>:null}<Button onClick={()=>void this.snooze(signal.key)}>{t('Remind tomorrow','ذكّرني غداً')}</Button><Button onClick={()=>void this.dismiss(signal.key)}>{t('Dismiss','تجاهل')}</Button><Button onClick={()=>void this.mute(signal.category,true)}>{t('Mute category','كتم الفئة')}</Button></div>
    </article>;
    return <>{this.props.launcher===false?null:<Button icon="chart" onClick={()=>void this.open()}>{t('Morning Brief','الموجز الصباحي')}</Button>}<Modal portal open={this.state.open} title={t('LOUREX Morning Brief','موجز LOUREX الصباحي')} size="lg" onClose={()=>{if(!this.state.busy)this.setState({open:false});}}>{this.state.busy?<p role="status">{t('Prioritizing current LOUREX records…','ترتيب أولويات سجلات LOUREX الحالية…')}</p>:this.state.error?<div role="alert">{this.state.error}</div>:<div className="lourex-morning-brief lourex-proactive-brief lourex-executive-brief"><section className="lourex-proactive-business"><div className="lourex-executive-brief-head"><div><h3>{t('Business priorities','أولويات الأعمال')}</h3><p>{t('What needs attention, why it matters, and the next action.','ما يحتاج انتباهك، أثره، والإجراء التالي.')}</p></div><small>{this.state.signals.length} {t('current','حالية')}</small></div>{this.state.signals.length?<div className="lourex-executive-signal-list">{this.state.signals.map(renderSignal)}</div>:<p>{t('No high-value business follow-up right now.','لا توجد متابعة أعمال عالية القيمة الآن.')}</p>}</section><section className="lourex-proactive-personal"><h3>{t('Personal reminders','التذكيرات الشخصية')}</h3>{this.state.personalTasks.length?<div className="lourex-executive-personal-list">{this.state.personalTasks.map(task=><article key={task.id}><strong><bdi dir="auto">{task.title}</bdi></strong><small>{[task.dueAt,task.recurrence!=='none'?task.recurrence:''].filter(Boolean).join(' · ')}</small></article>)}</div>:<p>{t('No personal reminders are due right now.','لا توجد تذكيرات شخصية مستحقة الآن.')}</p>}</section><div className="lourex-proactive-settings"><span>{briefEnabled?t('Morning Brief enabled','الموجز الصباحي مفعّل'):t('Morning Brief disabled','الموجز الصباحي معطّل')}</span><Button onClick={()=>void this.toggleBrief()}>{briefEnabled?t('Turn off','إيقاف'):t('Turn on','تفعيل')}</Button></div>{muted.length?<div className="lourex-proactive-muted"><small>{t('Muted categories','الفئات المكتومة')}: {muted.map(category=><button key={category} type="button" onClick={()=>void this.mute(category,false)}>{categoryLabel(category)} · {t('Unmute','إلغاء الكتم')}</button>)}</small></div>:null}<p className="lourex-proactive-boundary"><small>{t('Business and Personal scopes stay separate. Signals are deterministic and use current LOUREX records. Dismiss, snooze and mute preferences are encrypted locally.','يبقى نطاق الأعمال والنطاق الشخصي منفصلين. الإشارات حتمية وتعتمد على سجلات LOUREX الحالية. التجاهل والتأجيل والكتم محفوظة محلياً بشكل مشفر.')}</small></p></div>}</Modal></>;}
}
