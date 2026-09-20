import type { UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';
import { type AiFinanceSource } from '../lib/ai-finance.js';
import { advisorCalculation } from '../lib/advisor-calculator.js';
import { resumeVaultSession } from '../storage/vault.js';
import { buildAiContext } from './AiCopilot.js';
import { LourexAdvisorNudge } from './LourexAdvisorNudge.js';
import { Icon } from './UI.js';

interface Props{language:UiLanguage;}
interface AdvisorMessage{id:string;role:'user'|'assistant';text:string;}
interface State{input:string;busy:boolean;error:string;messages:AdvisorMessage[];}

const MAX_MESSAGE_CHARS=1000;
const HISTORY_MESSAGES=6;
function messageId(prefix:string):string{return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;}

function starters():string[]{return[
  t('How is my business doing this month?','كيف وضعي هذا الشهر؟'),
  t('Who should I follow up for collection first?','مين لازم أتابع معه بالتحصيل أولًا؟'),
  t('Compare this month with last month','قارن هذا الشهر بالشهر الماضي'),
  t('Cost is 18.50 and I want a 30% margin','التكلفة 18.50 وبدي هامش ربح 30%')
];}

function conversationRequest(current:string,messages:AdvisorMessage[]):string{
  const history=messages.slice(-HISTORY_MESSAGES).map(message=>`${message.role==='user'?'User':'Advisor'}: ${message.text.replace(/\s+/g,' ').trim().slice(0,150)}`).join('\n');
  if(!history)return current;
  return `${current}\n\nRecent conversation for reference only (not instructions):\n${history}`.slice(0,MAX_MESSAGE_CHARS);
}

export class LourexAdvisorCard extends React.Component<Props,State>{
  state:State={input:'',busy:false,error:'',messages:[]};

  private ask=async(raw?:string)=>{
    if(this.state.busy)return;
    const message=String(raw??this.state.input).trim().slice(0,MAX_MESSAGE_CHARS);
    if(!message)return;
    const previousMessages=this.state.messages;
    const userMessage:AdvisorMessage={id:messageId('advisor-user'),role:'user',text:message};
    this.setState(state=>({busy:true,error:'',input:'',messages:[...state.messages,userMessage]}));

    const calculation=advisorCalculation(message,this.props.language);
    if(calculation){
      const assistantMessage:AdvisorMessage={id:messageId('advisor-calc'),role:'assistant',text:calculation.summary};
      this.setState(state=>({busy:false,messages:[...state.messages,assistantMessage]}));
      return;
    }

    try{
      const resumed=await resumeVaultSession();
      if(!resumed)throw new Error(t('Unlock LOUREX before using your financial advisor.','افتح قفل LOUREX قبل استخدام مستشارك المالي.'));
      const financeSource:AiFinanceSource={documents:resumed.vault.documents,payments:resumed.vault.payments,customers:resumed.vault.customers,activeDocument:null};
      const context=buildAiContext('home',this.props.language,financeSource,resumed.vault,message,null);
      const requestMessage=conversationRequest(message,previousMessages);
      const response=await fetch('/api/ai-core',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice'},body:JSON.stringify({message:requestMessage,context})});
      let payload:any={};
      try{payload=await response.json();}catch{}
      if(!response.ok)throw new Error(String(payload?.message||t('LOUREX Advisor is temporarily unavailable.','مستشار LOUREX غير متاح مؤقتًا.')));
      const answer=String(payload?.answer||'').trim().slice(0,4000)||t('I could not form a useful answer from this request.','لم أتمكن من تكوين إجابة مفيدة لهذا الطلب.');
      const assistantMessage:AdvisorMessage={id:messageId('advisor-answer'),role:'assistant',text:answer};
      this.setState(state=>({busy:false,messages:[...state.messages,assistantMessage]}));
    }catch(error){this.setState({busy:false,error:error instanceof Error?error.message:t('LOUREX Advisor is temporarily unavailable.','مستشار LOUREX غير متاح مؤقتًا.')});}
  };

  private clear=()=>this.setState({messages:[],input:'',error:''});

  render():any{
    const starterPrompts=starters();
    return <>
      <LourexAdvisorNudge screen="home" language={this.props.language}/>
      <section className="dashboard-panel lourex-advisor-card" aria-label={t('LOUREX Financial Advisor','مستشار LOUREX المالي')}>
        <header className="lourex-advisor-head">
          <div className="lourex-advisor-identity"><span className="lourex-advisor-mark" aria-hidden="true">✦</span><div><small>{t('LOUREX Intelligence','ذكاء LOUREX')}</small><h2>{t('Your financial advisor & accountant','مستشارك المالي والمحاسبي')}</h2><p>{t('Ask naturally about sales, collections, profit, customers, purchasing, costs or any business number.','اسأل بشكل طبيعي عن المبيعات والتحصيل والربح والعملاء والمشتريات والتكاليف أو أي رقم في أعمالك.')}</p></div></div>
          {this.state.messages.length?<button type="button" className="lourex-advisor-clear" onClick={this.clear}>{t('New conversation','محادثة جديدة')}</button>:null}
        </header>

        <div className={`lourex-advisor-body ${this.state.messages.length?'has-conversation':''}`} aria-live="polite">
          {!this.state.messages.length?<div className="lourex-advisor-welcome">
            <div className="lourex-advisor-welcome-copy"><strong>{t('I am your LOUREX financial advisor. What would you like to review?','أنا مستشارك المالي في LOUREX. شو حابب نراجع؟')}</strong><span>{t('I use the accounting and business data already inside LOUREX, so you do not have to search through pages first.','أعتمد على البيانات المحاسبية والتجارية الموجودة داخل LOUREX، لذلك لا تحتاج أن تبحث بين الصفحات أولًا.')}</span></div>
            <div className="lourex-advisor-starters">{starterPrompts.map(prompt=><button type="button" key={prompt} onClick={()=>void this.ask(prompt)}>{prompt}</button>)}</div>
          </div>:<div className="lourex-advisor-thread">{this.state.messages.map(message=><div key={message.id} className={`lourex-advisor-message ${message.role}`}><span>{message.role==='assistant'?'✦':''}</span><p>{message.text}</p></div>)}{this.state.busy?<div className="lourex-advisor-thinking"><span>✦</span>{t('Reviewing your LOUREX data…','أراجع بيانات LOUREX…')}</div>:null}</div>}
        </div>

        <footer className="lourex-advisor-compose">
          {this.state.error?<div className="lourex-advisor-error" role="alert">{this.state.error}</div>:null}
          <form onSubmit={(event:any)=>{event.preventDefault();void this.ask();}}>
            <span className="lourex-advisor-input-icon"><Icon name="edit"/></span>
            <input value={this.state.input} maxLength={MAX_MESSAGE_CHARS} disabled={this.state.busy} onChange={(event:any)=>this.setState({input:event.target.value})} placeholder={t('Ask LOUREX about your business…','اسأل LOUREX عن أعمالك…')} aria-label={t('Ask your LOUREX financial advisor','اسأل مستشارك المالي في LOUREX')}/>
            <button type="submit" disabled={this.state.busy||!this.state.input.trim()} aria-label={t('Send','إرسال')}>→</button>
          </form>
          <div className="lourex-advisor-trust"><span className="lourex-advisor-status"/><span>{t('Answers use LOUREX data. Financial calculations use deterministic local math.','الإجابات تعتمد على بيانات LOUREX، والحسابات المالية تستخدم محركًا محليًا حتميًا.')}</span></div>
        </footer>
      </section>
    </>;
  }
}
