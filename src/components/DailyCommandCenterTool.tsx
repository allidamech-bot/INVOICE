import { buildMorningBrief, conditionalTaskSignals, visibleProactiveSignals, type ProactiveSignal } from '../lib/ai-proactive-assistant.js';
import { t } from '../lib/i18n.js';
import { resumeVaultSession } from '../storage/vault.js';
import { loadAssistantTasks, scopedAssistantTasks } from '../storage/assistant-task-store.js';
import { loadProactiveState, dismissProactiveSignal, snoozeProactiveSignal, setProactiveCategoryMuted, setMorningBriefEnabled, proactiveSignalVisible, type ProactiveState, type ProactiveCategory } from '../storage/assistant-proactive-store.js';
import { Button, Modal } from './UI.js';

interface Props{launcher?:boolean;}
interface State{open:boolean;busy:boolean;signals:ProactiveSignal[];personalTasks:Array<{id:string;title:string;dueAt:string;recurrence:string}>;preferences:ProactiveState|null;error:string;}
const OPEN_EVENT='lourex-ai-open-daily';
const WEIGHT:Record<ProactiveCategory,number>={urgent:4,attention:3,opportunity:2,info:1};
function openCanonical(query:string):void{if(!query)return;window.dispatchEvent(new CustomEvent('lourex-global-search-open',{detail:{query,autoOpenUnique:true}}));}
function categoryLabel(value:ProactiveCategory):string{return value==='urgent'?t('URGENT','عاجل'):value==='attention'?t('ATTENTION','انتباه'):value==='opportunity'?t('OPPORTUNITY','فرصة'):t('INFO','معلومة');}
function tomorrowIso():string{const date=new Date();date.setDate(date.getDate()+1);date.setHours(9,0,0,0);return date.toISOString();}
function sortSignals(rows:ProactiveSignal[]):ProactiveSignal[]{return [...rows].sort((a,b)=>WEIGHT[b.category]-WEIGHT[a.category]||a.title.localeCompare(b.title));}

export class DailyCommandCenterTool extends React.Component<Props,State>{
  state:State={open:false,busy:false,signals:[],personalTasks:[],preferences:null,error:''};
  componentDidMount():void{window.addEventListener(OPEN_EVENT,this.handleOpen);}
  componentWillUnmount():void{window.removeEventListener(OPEN_EVENT,this.handleOpen);}
  private handleOpen=()=>{void this.open();};
  private load=async()=>{
    const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before reading today’s priorities.','افتح قفل LOUREX قبل قراءة أولويات اليوم.'));
    const [preferences,tasksState]=await Promise.all([loadProactiveState(resumed.key),loadAssistantTasks(resumed.key)]);
    const workspaceId=resumed.vault.appSettings.activeWorkspaceId,branchId=resumed.vault.appSettings.activeBranchId;
    const businessTasks=scopedAssistantTasks(tasksState,{scope:'business',workspaceId,branchId,status:'open'});
    const personalTasks=scopedAssistantTasks(tasksState,{scope:'personal',status:'open'});
    const base=visibleProactiveSignals(resumed.vault,preferences,undefined,12);
    const conditional=conditionalTaskSignals(resumed.vault,businessTasks).filter(signal=>proactiveSignalVisible(preferences,signal));
    const brief=buildMorningBrief(resumed.vault,preferences,personalTasks);
    return{resumed,preferences,signals:sortSignals([...base,...conditional]).slice(0,12),personalTasks:brief.personalTasks};
  };
  private open=async()=>{if(this.state.busy)return;this.setState({open:true,busy:true,error:''});try{const loaded=await this.load();this.setState({busy:false,preferences:loaded.preferences,signals:loaded.signals,personalTasks:loaded.personalTasks});}catch(error){this.setState({busy:false,error:error instanceof Error?error.message:String(error)});}};
  private refresh=async()=>{try{const loaded=await this.load();this.setState({preferences:loaded.preferences,signals:loaded.signals,personalTasks:loaded.personalTasks,error:''});}catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}};
  private dismiss=async(key:string)=>{try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX first.','افتح قفل LOUREX أولاً.'));await dismissProactiveSignal(resumed.key,key);await this.refresh();}catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}};
  private snooze=async(key:string)=>{try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX first.','افتح قفل LOUREX أولاً.'));await snoozeProactiveSignal(resumed.key,key,tomorrowIso());await this.refresh();}catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}};
  private mute=async(category:ProactiveCategory,muted:boolean)=>{try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX first.','افتح قفل LOUREX أولاً.'));await setProactiveCategoryMuted(resumed.key,category,muted);await this.refresh();}catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}};
  private toggleBrief=async()=>{try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX first.','افتح قفل LOUREX أولاً.'));const next=!(this.state.preferences?.morningBriefEnabled!==false);await setMorningBriefEnabled(resumed.key,next);await this.refresh();}catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}};
  private title=(signal:ProactiveSignal)=>document.documentElement.lang==='ar'?signal.titleAr:signal.title;
  private detail=(signal:ProactiveSignal)=>document.documentElement.lang==='ar'?signal.detailAr:signal.detail;
  private action=(signal:ProactiveSignal)=>document.documentElement.lang==='ar'?signal.actionLabelAr:signal.actionLabel;
  render():any{
    const muted=this.state.preferences?.mutedCategories??[],briefEnabled=this.state.preferences?.morningBriefEnabled!==false;
    const risks=this.state.signals.filter(row=>row.category==='urgent'||row.category==='attention'),opportunities=this.state.signals.filter(row=>row.category==='opportunity'),info=this.state.signals.filter(row=>row.category==='info');
    const renderSignal=(signal:ProactiveSignal)=><article key={signal.key} className={`lourex-proactive-card is-${signal.category}`}><small>{categoryLabel(signal.category)} · {signal.kind}</small><strong><bdi dir="auto">{this.title(signal)}</bdi></strong><p><bdi dir="auto">{this.detail(signal)}</bdi></p>{signal.evidence.length?<small className="lourex-proactive-evidence">{t('Evidence','الدليل')}: {signal.evidence.join(' · ')}</small>:null}<div className="ta-customer-modal-actions">{signal.searchQuery?<Button variant={signal.category==='urgent'?'primary':'default'} onClick={()=>{this.setState({open:false});window.setTimeout(()=>openCanonical(signal.searchQuery),0);}}>{this.action(signal)}</Button>:null}<Button onClick={()=>void this.snooze(signal.key)}>{t('Remind tomorrow','ذكّرني غداً')}</Button><Button onClick={()=>void this.dismiss(signal.key)}>{t('Dismiss','تجاهل')}</Button><Button onClick={()=>void this.mute(signal.category,true)}>{t('Mute category','كتم الفئة')}</Button></div></article>;
    return <>{this.props.launcher===false?null:<Button icon="chart" onClick={()=>void this.open()}>{t('Morning Brief','الموجز الصباحي')}</Button>}<Modal portal open={this.state.open} title={t('LOUREX Morning Brief','موجز LOUREX الصباحي')} size="lg" onClose={()=>{if(!this.state.busy)this.setState({open:false});}}>{this.state.busy?<p role="status">{t('Prioritizing current LOUREX records…','ترتيب أولويات سجلات LOUREX الحالية…')}</p>:this.state.error?<div role="alert">{this.state.error}</div>:<div className="lourex-morning-brief"><div className="lourex-proactive-settings"><span>{briefEnabled?t('Morning Brief enabled','الموجز الصباحي مفعّل'):t('Morning Brief disabled','الموجز الصباحي معطّل')}</span><Button onClick={()=>void this.toggleBrief()}>{briefEnabled?t('Turn off','إيقاف'):t('Turn on','تفعيل')}</Button></div>{risks.length?<section><h3>{t('Needs attention','يحتاج انتباهك')}</h3>{risks.map(renderSignal)}</section>:null}{opportunities.length?<section><h3>{t('Opportunities','الفرص')}</h3>{opportunities.map(renderSignal)}</section>:null}{info.length?<section><h3>{t('Information','معلومات')}</h3>{info.map(renderSignal)}</section>:null}{this.state.personalTasks.length?<section className="lourex-proactive-personal"><h3>{t('Personal','شخصي')}</h3>{this.state.personalTasks.map(task=><article key={task.id}><strong><bdi dir="auto">{task.title}</bdi></strong><small>{[task.dueAt,task.recurrence!=='none'?task.recurrence:''].filter(Boolean).join(' · ')}</small></article>)}</section>:null}{!this.state.signals.length&&!this.state.personalTasks.length?<p>{t('No high-value alerts or due Personal tasks need attention right now.','لا توجد تنبيهات عالية القيمة أو مهام شخصية مستحقة تحتاج انتباهك الآن.')}</p>:null}{muted.length?<div className="lourex-proactive-muted"><small>{t('Muted categories','الفئات المكتومة')}: {muted.map(category=><button key={category} type="button" onClick={()=>void this.mute(category,false)}>{categoryLabel(category)} · {t('Unmute','إلغاء الكتم')}</button>)}</small></div>:null}</div>}<p><small>{t('Signals are deterministic and use current LOUREX records. Dismiss, snooze and mute preferences are encrypted locally.','الإشارات حتمية وتعتمد على سجلات LOUREX الحالية. التجاهل والتأجيل والكتم محفوظة محلياً بشكل مشفر.')}</small></p></Modal></>;}
}
