import type { UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';
import { formatMoney } from '../lib/money.js';
import { todayIso } from '../lib/id.js';
import { buildAiFinanceContext, type AiFinanceSource } from '../lib/ai-finance.js';
import { advisorCalculation } from '../lib/advisor-calculator.js';
import { resumeVaultSession } from '../storage/vault.js';
import { buildAiContext } from './AiCopilot.js';
import { Icon } from './UI.js';

interface Props{language:UiLanguage;}
interface AdvisorMessage{id:string;role:'user'|'assistant';text:string;}
type AdvisorMode='chat'|'report';
type InsightTone='good'|'info'|'warn'|'danger';
interface AdvisorInsight{id:string;tone:InsightTone;title:string;detail:string;metric?:string;}
interface State{
  input:string;
  busy:boolean;
  error:string;
  messages:AdvisorMessage[];
  mode:AdvisorMode;
  reportBusy:boolean;
  reportError:string;
  reportItems:AdvisorInsight[];
  reportUpdatedAt:number;
}

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

function includesAny(value:string,tokens:string[]):boolean{return tokens.some(token=>value.includes(token));}

function localFinanceFallback(source:AiFinanceSource,message:string,language:UiLanguage):string{
  const query=message.normalize('NFKC').toLowerCase();
  const collectionIntent=includesAny(query,['collection','collect','follow up','overdue','تحصيل','أتابع','متأخر','المتأخر']);
  const comparisonIntent=includesAny(query,['compare','last month','previous month','قارن','الشهر الماضي','الشهر السابق']);
  const monthIntent=includesAny(query,['this month','business doing','month','هذا الشهر','وضعي','الأعمال']);
  if(!collectionIntent&&!comparisonIntent&&!monthIntent)return'';

  const finance=buildAiFinanceContext(source,message);
  const arabic=language==='ar';

  if(collectionIntent){
    const rows=finance.highestOverdueByCurrency.slice(0,3);
    if(!rows.length)return arabic?'لا توجد مبالغ متأخرة مسجلة حاليًا تحتاج متابعة تحصيل.':'There are no recorded overdue amounts that need collection follow-up right now.';
    const details=rows.map(row=>arabic
      ? `${row.customerName}: ${formatMoney(row.overdue,row.currency)} متأخر`
      : `${row.customerName}: ${formatMoney(row.overdue,row.currency)} overdue`);
    return arabic?`ابدأ بهذه المتابعات حسب أعلى مبلغ متأخر في كل عملة: ${details.join(' • ')}.`:`Start with these follow-ups by highest overdue amount in each currency: ${details.join(' • ')}.`;
  }

  if(comparisonIntent){
    const rows=finance.comparisons.monthToDateVsPreviousMonth.slice(0,3);
    if(!rows.length)return arabic?'لا توجد بيانات مالية كافية لمقارنة هذا الشهر بالشهر الماضي.':'There is not enough financial data to compare this month with last month.';
    const details=rows.map(row=>arabic
      ? `${row.currency}: المبيعات ${formatMoney(row.netSalesCurrent,row.currency)} مقابل ${formatMoney(row.netSalesPrevious,row.currency)}، والتحصيل ${formatMoney(row.collectedCurrent,row.currency)} مقابل ${formatMoney(row.collectedPrevious,row.currency)}`
      : `${row.currency}: sales ${formatMoney(row.netSalesCurrent,row.currency)} vs ${formatMoney(row.netSalesPrevious,row.currency)}, collections ${formatMoney(row.collectedCurrent,row.currency)} vs ${formatMoney(row.collectedPrevious,row.currency)}`);
    return arabic?`مقارنة هذا الشهر بالشهر الماضي: ${details.join(' • ')}.`:`This month versus last month: ${details.join(' • ')}.`;
  }

  const rows=finance.monthToDate.slice(0,3);
  if(!rows.length)return arabic?'لا توجد حركة مالية مسجلة لهذا الشهر حتى الآن.':'There is no recorded financial activity for this month yet.';
  const details=rows.map(row=>arabic
    ? `${row.currency}: مبيعات ${formatMoney(row.netSales,row.currency)}، تحصيل ${formatMoney(row.collected,row.currency)}، مستحق ${formatMoney(row.outstanding,row.currency)}، متأخر ${formatMoney(row.overdue,row.currency)}`
    : `${row.currency}: sales ${formatMoney(row.netSales,row.currency)}, collected ${formatMoney(row.collected,row.currency)}, outstanding ${formatMoney(row.outstanding,row.currency)}, overdue ${formatMoney(row.overdue,row.currency)}`);
  return arabic?`ملخص هذا الشهر: ${details.join(' • ')}.`:`This month's summary: ${details.join(' • ')}.`;
}

function reportAge(at:number,language:UiLanguage):string{
  if(!at)return'';
  const minutes=Math.max(0,Math.round((Date.now()-at)/60000));
  if(minutes<1)return language==='ar'?'الآن':'now';
  if(minutes<60)return language==='ar'?`منذ ${minutes} دقيقة`:`${minutes} min ago`;
  const hours=Math.max(1,Math.round(minutes/60));
  return language==='ar'?`منذ ${hours} ساعة`:`${hours}h ago`;
}

export class LourexAdvisorCard extends React.Component<Props,State>{
  state:State={input:'',busy:false,error:'',messages:[],mode:'chat',reportBusy:false,reportError:'',reportItems:[],reportUpdatedAt:0};

  componentDidMount():void{
    window.setTimeout(()=>void this.loadReport(false),900);
  }

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

    let financeSource:AiFinanceSource|null=null;
    try{
      const resumed=await resumeVaultSession();
      if(!resumed)throw new Error(t('Unlock LOUREX before using your financial advisor.','افتح قفل LOUREX قبل استخدام مستشارك المالي.'));
      financeSource={documents:resumed.vault.documents,payments:resumed.vault.payments,customers:resumed.vault.customers,activeDocument:null};
      const context=buildAiContext('home',this.props.language,financeSource,resumed.vault,message,null);
      const requestMessage=conversationRequest(message,previousMessages);
      const response=await fetch('/api/ai-core',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice'},body:JSON.stringify({message:requestMessage,context})});
      let payload:any={};
      try{payload=await response.json();}catch{}
      if(!response.ok)throw new Error(String(payload?.message||t('LOUREX Advisor is temporarily unavailable.','مستشار LOUREX غير متاح مؤقتًا.')));
      const answer=String(payload?.answer||'').trim().slice(0,4000)||t('I could not form a useful answer from this request.','لم أتمكن من تكوين إجابة مفيدة لهذا الطلب.');
      const assistantMessage:AdvisorMessage={id:messageId('advisor-answer'),role:'assistant',text:answer};
      this.setState(state=>({busy:false,messages:[...state.messages,assistantMessage]}));
    }catch(error){
      const fallback=financeSource?localFinanceFallback(financeSource,message,this.props.language):'';
      if(fallback){
        const assistantMessage:AdvisorMessage={id:messageId('advisor-local'),role:'assistant',text:fallback};
        this.setState(state=>({busy:false,error:'',messages:[...state.messages,assistantMessage]}));
        return;
      }
      this.setState({busy:false,error:error instanceof Error?error.message:t('LOUREX Advisor is temporarily unavailable.','مستشار LOUREX غير متاح مؤقتًا.')});
    }
  };

  private loadReport=async(showBusy=true)=>{
    if(this.state.reportBusy)return;
    if(showBusy)this.setState({reportBusy:true,reportError:''});
    try{
      const resumed=await resumeVaultSession();
      if(!resumed)throw new Error(t('Unlock LOUREX to build your AI report.','افتح قفل LOUREX لإنشاء تقرير الذكاء الاصطناعي.'));
      const vault=resumed.vault;
      const source:AiFinanceSource={documents:vault.documents,payments:vault.payments,customers:vault.customers,activeDocument:null};
      const finance=buildAiFinanceContext(source,'business report');
      const arabic=this.props.language==='ar';
      const items:AdvisorInsight[]=[];

      const monthRows=finance.monthToDate.slice(0,3);
      monthRows.forEach(row=>items.push({
        id:`month-${row.currency}`,
        tone:Number(row.overdue)>0?'warn':'good',
        title:arabic?`ملخص ${row.currency} هذا الشهر`:`${row.currency} month-to-date`,
        detail:arabic
          ? `مبيعات ${formatMoney(row.netSales,row.currency)} · تحصيل ${formatMoney(row.collected,row.currency)} · مستحق ${formatMoney(row.outstanding,row.currency)}`
          : `Sales ${formatMoney(row.netSales,row.currency)} · collected ${formatMoney(row.collected,row.currency)} · outstanding ${formatMoney(row.outstanding,row.currency)}`,
        metric:Number(row.overdue)>0?(arabic?`متأخر ${formatMoney(row.overdue,row.currency)}`:`Overdue ${formatMoney(row.overdue,row.currency)}`):undefined
      }));

      const overdue=finance.highestOverdueByCurrency.slice(0,2);
      overdue.forEach(row=>items.push({
        id:`overdue-${row.currency}-${row.customerName}`,
        tone:'danger',
        title:arabic?`تحصيل يحتاج متابعة · ${row.customerName}`:`Collection follow-up · ${row.customerName}`,
        detail:arabic?'هذا من أعلى الأرصدة المتأخرة المسجلة حاليًا.':'This is one of the highest overdue balances currently recorded.',
        metric:formatMoney(row.overdue,row.currency)
      }));

      const comparisons=finance.comparisons.monthToDateVsPreviousMonth.slice(0,2);
      comparisons.forEach(row=>{
        const current=Number(row.netSalesCurrent),previous=Number(row.netSalesPrevious);
        const tone:InsightTone=current>=previous?'good':'info';
        items.push({
          id:`compare-${row.currency}`,
          tone,
          title:arabic?`اتجاه المبيعات · ${row.currency}`:`Sales direction · ${row.currency}`,
          detail:arabic
            ? `هذا الشهر ${formatMoney(row.netSalesCurrent,row.currency)} مقابل ${formatMoney(row.netSalesPrevious,row.currency)} في الشهر السابق.`
            : `This month ${formatMoney(row.netSalesCurrent,row.currency)} versus ${formatMoney(row.netSalesPrevious,row.currency)} in the previous month.`
        });
      });

      const openDrafts=vault.documents.filter(doc=>doc.status==='draft').length;
      if(openDrafts)items.push({id:'drafts',tone:'warn',title:t('Open document work','عمل مستندي مفتوح'),detail:t('Draft documents are still waiting to be completed or issued.','هناك مستندات ما زالت بحاجة للإكمال أو الإصدار.'),metric:String(openDrafts)});
      const draftPurchases=vault.purchases.filter(purchase=>purchase.status==='draft').length;
      if(draftPurchases)items.push({id:'purchase-drafts',tone:'warn',title:t('Purchasing queue','قائمة المشتريات'),detail:t('Purchase drafts are waiting to be posted.','هناك مسودات مشتريات بانتظار الترحيل.'),metric:String(draftPurchases)});
      const missingCosts=vault.savedItems.filter(item=>!String(item.lastUnitCost||'').trim()).length;
      if(missingCosts)items.push({id:'costs',tone:'info',title:t('Cost coverage','تغطية التكاليف'),detail:t('Adding missing product costs will make profit analysis more complete.','إضافة تكاليف المنتجات الناقصة تجعل تحليل الربحية أدق.'),metric:String(missingCosts)});

      const latest=[...vault.documents].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
      if(latest)items.push({id:'latest-document',tone:'info',title:t('Latest workspace activity','آخر نشاط في مساحة العمل'),detail:`${latest.number} · ${latest.status==='final'?t('Issued','صادر'):t('Draft','مسودة')}`});
      if(!items.length)items.push({id:'clear',tone:'good',title:t('Business data looks calm','بيانات الأعمال مستقرة'),detail:t('No major exceptions are visible in the current LOUREX workspace.','لا توجد استثناءات كبيرة ظاهرة في مساحة LOUREX الحالية.'),metric:'✓'});

      this.setState({reportBusy:false,reportError:'',reportItems:items.slice(0,10),reportUpdatedAt:Date.now()});
    }catch(error){
      this.setState({reportBusy:false,reportError:error instanceof Error?error.message:t('Unable to build the AI report.','تعذر إنشاء تقرير الذكاء الاصطناعي.')});
    }
  };

  private openReport=()=>this.setState({mode:'report'},()=>{if(!this.state.reportItems.length||Date.now()-this.state.reportUpdatedAt>90_000)void this.loadReport(true);});
  private clear=()=>this.setState({messages:[],input:'',error:''});

  render():any{
    const starterPrompts=starters();
    const reportCount=this.state.reportItems.filter(item=>item.tone==='danger'||item.tone==='warn').length;
    return <section className="dashboard-panel lourex-advisor-card lourex-advisor-v319" aria-label={t('LOUREX Financial Advisor','مستشار LOUREX المالي')}>
      <div className="lourex-ai-aura" aria-hidden="true"><span/><span/><span/></div>
      <header className="lourex-advisor-head">
        <div className="lourex-advisor-identity">
          <span className="lourex-advisor-mark lourex-ai-core" aria-hidden="true"><span className="ai-core-eye left"/><span className="ai-core-eye right"/><span className="ai-core-pulse"/><Icon name="spark"/></span>
          <div><small>{t('LOUREX Intelligence','ذكاء LOUREX')}</small><h2>{t('Your financial advisor & accountant','مستشارك المالي والمحاسبي')}</h2><p>{t('A living intelligence layer for your sales, collections, profit, purchasing and business activity.','طبقة ذكاء حيّة تراقب المبيعات والتحصيل والربح والمشتريات ونشاط أعمالك.')}</p></div>
        </div>
        {this.state.mode==='chat'&&this.state.messages.length?<button type="button" className="lourex-advisor-clear" onClick={this.clear}>{t('New conversation','محادثة جديدة')}</button>:null}
      </header>

      <div className="lourex-advisor-tabs" role="tablist" aria-label={t('LOUREX Intelligence modes','أوضاع ذكاء LOUREX')}>
        <button type="button" role="tab" aria-selected={this.state.mode==='chat'} className={this.state.mode==='chat'?'active':''} onClick={()=>this.setState({mode:'chat'})}><Icon name="spark"/><span>{t('Advisor','المستشار')}</span></button>
        <button type="button" role="tab" aria-selected={this.state.mode==='report'} className={this.state.mode==='report'?'active':''} onClick={this.openReport}><Icon name="chart"/><span>{t('My AI report','تقريري الذكي')}</span>{reportCount?<b>{reportCount}</b>:null}</button>
      </div>

      {this.state.mode==='chat'?<>
        <div className={`lourex-advisor-body ${this.state.messages.length?'has-conversation':''}`} aria-live="polite">
          {!this.state.messages.length?<div className="lourex-advisor-welcome">
            <div className="lourex-advisor-welcome-copy"><strong>{t('Ask me about the business. I already know the LOUREX workspace.','اسألني عن أعمالك. أنا أقرأ مساحة LOUREX الموجودة أمامك.')}</strong><span>{t('Use natural language. Financial calculations stay deterministic and your business data remains the source of truth.','استخدم لغتك الطبيعية، والحسابات المالية تبقى حتمية وبيانات أعمالك هي مصدر الحقيقة.')}</span></div>
            <div className="lourex-advisor-starters">{starterPrompts.map(prompt=><button type="button" key={prompt} onClick={()=>void this.ask(prompt)}>{prompt}</button>)}</div>
          </div>:<div className="lourex-advisor-thread">{this.state.messages.map(message=><div key={message.id} className={`lourex-advisor-message ${message.role}`}><span>{message.role==='assistant'?<Icon name="spark"/>:null}</span><p>{message.text}</p></div>)}{this.state.busy?<div className="lourex-advisor-thinking"><span><Icon name="spark"/></span>{t('Reviewing your LOUREX data…','أراجع بيانات LOUREX…')}</div>:null}</div>}
        </div>

        <footer className="lourex-advisor-compose">
          {this.state.error?<div className="lourex-advisor-error" role="alert">{this.state.error}</div>:null}
          <form onSubmit={(event:any)=>{event.preventDefault();void this.ask();}}>
            <span className="lourex-advisor-input-icon"><Icon name="edit"/></span>
            <input value={this.state.input} maxLength={MAX_MESSAGE_CHARS} disabled={this.state.busy} onChange={(event:any)=>this.setState({input:event.target.value})} placeholder={t('Ask LOUREX about your business…','اسأل LOUREX عن أعمالك…')} aria-label={t('Ask your LOUREX financial advisor','اسأل مستشارك المالي في LOUREX')}/>
            <button type="submit" disabled={this.state.busy||!this.state.input.trim()} aria-label={t('Send','إرسال')}><Icon name="arrowLeft"/></button>
          </form>
          <div className="lourex-advisor-trust"><span className="lourex-advisor-status"/><span>{t('Answers use LOUREX data. Financial calculations use deterministic local math.','الإجابات تعتمد على بيانات LOUREX، والحسابات المالية تستخدم محركًا محليًا حتميًا.')}</span></div>
        </footer>
      </>:<div className="lourex-ai-report" role="tabpanel">
        <header className="lourex-ai-report-head"><div><small>{t('Whole-workspace intelligence','ذكاء مساحة العمل كاملة')}</small><strong>{t('Your AI business report','تقرير أعمالك الذكي')}</strong><span>{t('A concise reading of what changed, what needs attention and what the numbers are saying.','قراءة مختصرة لما تغيّر وما يحتاج انتباهك وما الذي تقوله الأرقام.')}</span></div><button type="button" disabled={this.state.reportBusy} onClick={()=>void this.loadReport(true)}><Icon name="refresh"/>{t('Refresh','تحديث')}</button></header>
        {this.state.reportError?<div className="lourex-advisor-error" role="alert">{this.state.reportError}</div>:null}
        {this.state.reportBusy&&!this.state.reportItems.length?<div className="lourex-ai-report-loading"><span/><span/><span/></div>:<div className="lourex-ai-report-grid">{this.state.reportItems.map(item=><article key={item.id} className={`lourex-ai-insight tone-${item.tone}`}><span className="lourex-ai-insight-signal"/><div><strong>{item.title}</strong><p>{item.detail}</p></div>{item.metric?<b>{item.metric}</b>:null}</article>)}</div>}
        <footer className="lourex-ai-report-foot"><span className="lourex-advisor-status"/><span>{t('Report updated','تم تحديث التقرير')} {reportAge(this.state.reportUpdatedAt,this.props.language)}</span><em>{todayIso()}</em></footer>
      </div>}
    </section>;
  }
}
