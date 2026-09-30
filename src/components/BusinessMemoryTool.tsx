import { buildBusinessMemory, type BusinessMemoryEntry } from '../lib/business-memory.js';
import { isArabic, t } from '../lib/i18n.js';
import { resumeVaultSession } from '../storage/vault.js';
import { Button, Icon, Modal } from './UI.js';

interface Props{launcher?:boolean;}
interface State{open:boolean;busy:boolean;entries:BusinessMemoryEntry[];limitations:string[];error:string;}
const OPEN_EVENT='lourex-ai-open-memory';

function advisorInput(prompt:string):void{
  const input=document.querySelector<HTMLInputElement>('#lourex-ai-panel .lourex-ai-compose input');if(!input)return;
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(input,prompt.slice(0,1000));else input.value=prompt.slice(0,1000);
  input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();input.setSelectionRange(input.value.length,input.value.length);
}
function kindLabel(kind:BusinessMemoryEntry['kind']):string{
  if(kind==='opportunity')return t('Follow-up opportunity','فرصة متابعة');
  if(kind==='customer-pattern')return t('Customer pattern','نمط عميل');
  if(kind==='product-pattern')return t('Product pattern','نمط منتج');
  if(kind==='supplier-pattern')return t('Supplier pattern','نمط مورد');
  return t('Commercial pattern','نمط تجاري');
}
function askPrompt(entry:BusinessMemoryEntry):string{return isArabic()?`حلل هذه الإشارة المشتقة من سجلات LOUREX فقط، واعتبرها اقتراحًا وليس حقيقة رسمية. اشرح الخطوة المناسبة للمراجعة بدون تنفيذ تلقائي: ${entry.title} — ${entry.detail}. عدد الأدلة: ${entry.evidenceCount}. لا تخترع أي بيانات إضافية.`:`Analyze this derived LOUREX signal using LOUREX records only. Treat it as a suggestion, not official master data. Explain the appropriate review action without taking any automatic action: ${entry.title} — ${entry.detail}. Evidence count: ${entry.evidenceCount}. Do not invent missing facts.`;}

export class BusinessMemoryTool extends React.Component<Props,State>{
  state:State={open:false,busy:false,entries:[],limitations:[],error:''};
  componentDidMount():void{window.addEventListener(OPEN_EVENT,this.handleOpen);}
  componentWillUnmount():void{window.removeEventListener(OPEN_EVENT,this.handleOpen);}
  private handleOpen=()=>{void this.open();};
  private open=async()=>{if(this.state.busy)return;this.setState({open:true,busy:true,error:''});try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before reading Business Memory.','افتح قفل LOUREX قبل قراءة ذاكرة الأعمال.'));const memory=buildBusinessMemory(resumed.vault);this.setState({busy:false,entries:memory.entries,limitations:memory.limitations});}catch(error){this.setState({busy:false,error:error instanceof Error?error.message:String(error)});}};
  private ask=(entry:BusinessMemoryEntry)=>{advisorInput(askPrompt(entry));this.setState({open:false});};
  render():any{return <>{this.props.launcher===false?null:<Button icon="bot" onClick={()=>void this.open()}>{t('Business Memory','ذاكرة الأعمال')}</Button>}<Modal open={this.state.open} title={t('LOUREX Business Memory','ذاكرة أعمال LOUREX')} size="lg" onClose={()=>{if(!this.state.busy)this.setState({open:false});}}>{this.state.busy?<p role="status">{t('Deriving patterns from approved LOUREX records…','استخراج الأنماط من سجلات LOUREX المعتمدة…')}</p>:this.state.error?<div role="alert">{this.state.error}</div>:<div><div className="product-import-mapping-note"><Icon name="lock"/><span>{t('Read-only derived patterns and follow-up signals. They are never treated as official master data, are not stored in a new database, and never trigger contact or price changes automatically.','أنماط وإشارات متابعة مشتقة للقراءة فقط. لا تعامل كبيانات رئيسية رسمية، ولا تُحفظ في قاعدة بيانات جديدة، ولا تنفذ تواصلًا أو تغيير سعر تلقائيًا.')}</span></div>{this.state.entries.length?this.state.entries.map(entry=><article key={entry.key} style={{padding:'10px 0'}}><small>{kindLabel(entry.kind)} · {t('Based on','بناءً على')} {entry.evidenceCount} {t('records','سجلات')} · {entry.confidence}</small><strong style={{display:'block'}}><bdi dir="auto">{entry.title}</bdi></strong><p><bdi dir="auto">{entry.detail}</bdi></p><Button onClick={()=>this.ask(entry)}>{entry.kind==='opportunity'?t('Review with LOUREX','راجع مع LOUREX'):t('Ask LOUREX about this','اسأل LOUREX عن هذا')}</Button></article>):<p>{t('There is not enough approved history to infer stable business patterns yet.','لا يوجد تاريخ معتمد كافٍ بعد لاستخراج أنماط أعمال مستقرة.')}</p>}<p><small>{t('Patterns update automatically when approved business records change. Currencies are never combined.','تتحدث الأنماط تلقائيًا عند تغير سجلات الأعمال المعتمدة. لا يتم دمج العملات أبدًا.')}</small></p></div>}</Modal></>;}
}
