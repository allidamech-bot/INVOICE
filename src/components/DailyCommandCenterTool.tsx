import { whatMattersToday, type DailyCommandAlert } from '../lib/daily-command-center.js';
import { t } from '../lib/i18n.js';
import { resumeVaultSession } from '../storage/vault.js';
import { Button, Modal } from './UI.js';

interface Props{launcher?:boolean;}
interface State{open:boolean;busy:boolean;alerts:DailyCommandAlert[];ignored:string[];error:string;}
const KEY='lourex-ai-daily-ignored-v1';
const OPEN_EVENT='lourex-ai-open-daily';
function readIgnored():string[]{try{const parsed=JSON.parse(sessionStorage.getItem(KEY)||'[]');return Array.isArray(parsed)?parsed.filter(value=>typeof value==='string').slice(0,50):[];}catch{return[];}}
function writeIgnored(values:string[]):void{try{sessionStorage.setItem(KEY,JSON.stringify(values.slice(0,50)));}catch{}}
function openCanonical(query:string):void{window.dispatchEvent(new CustomEvent('lourex-global-search-open',{detail:{query,autoOpenUnique:true}}));}
function priorityLabel(priority:DailyCommandAlert['priority']):string{return priority==='critical'?t('Critical','حرج'):priority==='high'?t('High','عالٍ'):t('Medium','متوسط');}
export class DailyCommandCenterTool extends React.Component<Props,State>{
  state:State={open:false,busy:false,alerts:[],ignored:readIgnored(),error:''};
  componentDidMount():void{window.addEventListener(OPEN_EVENT,this.handleOpen);}
  componentWillUnmount():void{window.removeEventListener(OPEN_EVENT,this.handleOpen);}
  private handleOpen=()=>{void this.open();};
  private open=async()=>{if(this.state.busy)return;this.setState({open:true,busy:true,error:'',ignored:readIgnored()});try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before reading today’s priorities.','افتح قفل LOUREX قبل قراءة أولويات اليوم.'));this.setState({busy:false,alerts:whatMattersToday(resumed.vault,5)});}catch(error){this.setState({busy:false,error:error instanceof Error?error.message:String(error)});}};
  private ignore=(key:string)=>{const ignored=Array.from(new Set([...this.state.ignored,key]));writeIgnored(ignored);this.setState({ignored});};
  render():any{const visible=this.state.alerts.filter(alert=>!this.state.ignored.includes(alert.key));return <>{this.props.launcher===false?null:<Button icon="chart" onClick={()=>void this.open()}>{t('What matters today','ما المهم اليوم')}</Button>}<Modal open={this.state.open} title={t('What matters today','ما المهم اليوم')} size="lg" onClose={()=>{if(!this.state.busy)this.setState({open:false});}}>{this.state.busy?<p role="status">{t('Prioritizing current LOUREX records…','ترتيب أولويات سجلات LOUREX الحالية…')}</p>:this.state.error?<div role="alert">{this.state.error}</div>:visible.length?<div>{visible.map(alert=><article key={alert.key} style={{padding:'10px 0'}}><small>{priorityLabel(alert.priority)} · {alert.kind}</small><strong style={{display:'block'}}><bdi dir="auto">{alert.title}</bdi></strong><p><bdi dir="auto">{alert.detail}</bdi></p><div className="ta-customer-modal-actions"><Button variant={alert.priority==='critical'?'primary':'default'} onClick={()=>{this.setState({open:false});window.setTimeout(()=>openCanonical(alert.searchQuery),0);}}>{t(alert.actionLabel,alert.actionLabel)}</Button><Button onClick={()=>this.ignore(alert.key)}>{t('Ignore for this session','تجاهل لهذه الجلسة')}</Button></div></article>)}</div>:<p>{t('No high-value business alerts need attention right now.','لا توجد تنبيهات أعمال عالية القيمة تحتاج انتباهك الآن.')}</p>}<p><small>{t('Only the highest-value deterministic alerts are shown. Ignoring an alert here lasts for this browser session only.','يتم عرض أعلى التنبيهات الحتمية قيمة فقط. تجاهل التنبيه هنا يستمر لهذه الجلسة فقط.')}</small></p></Modal></>;}
}
