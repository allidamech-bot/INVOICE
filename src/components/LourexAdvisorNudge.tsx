import type { UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';
import { buildAiBusinessContext } from '../lib/ai-business.js';
import { buildAiFinanceContext } from '../lib/ai-finance.js';
import { resumeVaultSession } from '../storage/vault.js';
import type { AiWorkspaceScreen } from './AiCopilot.js';

interface Props{screen:AiWorkspaceScreen;language:UiLanguage;}
interface State{visible:boolean;title:string;message:string;}

const SESSION_KEY='lourex-advisor-nudge-v276';

function contextualHelp(screen:AiWorkspaceScreen):string{
  switch(screen){
    case'home':return t('Ask me about sales, profit, collections, costs or any financial calculation.','اسألني عن المبيعات والربح والتحصيل والتكاليف أو أي حسبة مالية.');
    case'documents':return t('I can review a document, explain profitability or help prepare a safe draft.','أقدر أراجع المستند وأشرح ربحيته أو أساعدك بتجهيز مسودة آمنة.');
    case'customers':return t('I can explain customer balances, payment behavior and follow-up priorities.','أقدر أشرح أرصدة العملاء وسلوك الدفع وأولوية المتابعة.');
    case'receivables':return t('I can help you understand overdue balances and who needs collection follow-up first.','أقدر أساعدك تفهم المتأخرات ومين يحتاج متابعة تحصيل أولًا.');
    case'reports':return t('Ask me what changed, why the numbers moved, or how this period compares.','اسألني شو تغيّر وليش تحركت الأرقام وكيف تقارن هذه الفترة.');
    case'items':return t('I can review pricing, margins, cost changes and product data gaps.','أقدر أراجع التسعير والهوامش وتغيّر التكلفة ونواقص بيانات الأصناف.');
    case'operations':return t('I can compare supplier costs and explain purchase and landed-cost signals.','أقدر أقارن تكاليف الموردين وأشرح إشارات المشتريات وتكلفة الوصول.');
    case'editor':return t('I can review this draft before you finalize it.','أقدر أراجع هذه المسودة معك قبل اعتمادها.');
  }
}

export class LourexAdvisorNudge extends React.Component<Props,State>{
  state:State={visible:false,title:'',message:''};
  private cancelled=false;

  componentDidMount():void{void this.prepare();}
  componentWillUnmount():void{this.cancelled=true;}

  private prepare=async()=>{
    try{
      if(sessionStorage.getItem(SESSION_KEY)==='dismissed')return;
      const resumed=await resumeVaultSession();
      if(!resumed||this.cancelled)return;
      const vault=resumed.vault;
      const finance=buildAiFinanceContext({documents:vault.documents,payments:vault.payments,customers:vault.customers,activeDocument:null},'');
      const business=buildAiBusinessContext(vault);
      let title=t('Your LOUREX advisor is here','مستشار LOUREX معك');
      let message=contextualHelp(this.props.screen);

      const overdueInvoices=finance.receivables.reduce((sum,row)=>sum+row.overdueInvoices,0);
      const missingCosts=business.daily.missingCostItems;
      const invalidOperations=business.daily.invalidOperations;
      const purchaseDrafts=business.daily.draftPurchases;
      const costAlert=business.suppliers.costAlerts[0];

      if(overdueInvoices>0){
        title=t('Collection needs attention','التحصيل يحتاج انتباهك');
        message=t(`You have ${overdueInvoices} overdue invoices. I can review the collection priorities with you.`,`عندك ${overdueInvoices} فواتير متأخرة. أقدر أراجع معك أولويات التحصيل.`);
      }else if(missingCosts>0||invalidOperations>0){
        title=t('Accounting data needs review','بيانات محاسبية تحتاج مراجعة');
        message=missingCosts>0?t(`${missingCosts} product cost entries are missing, so some profit analysis is incomplete. Ask me what this affects.`,`في ${missingCosts} تكاليف أصناف مفقودة، لذلك جزء من تحليل الربحية غير مكتمل. اسألني شو تأثيرها.`):t(`${invalidOperations} operation records need accounting review. I can explain what LOUREX detected.`,`في ${invalidOperations} سجلات عمليات تحتاج مراجعة محاسبية. أقدر أشرح لك شو اكتشف LOUREX.`);
      }else if(purchaseDrafts>0){
        title=t('You have unfinished purchasing work','عندك مشتريات غير مكتملة');
        message=t(`${purchaseDrafts} purchase drafts are still open. I can help you understand the purchasing picture before you continue.`,`عندك ${purchaseDrafts} مسودات مشتريات ما زالت مفتوحة. أقدر أساعدك تفهم وضع المشتريات قبل ما تكمل.`);
      }else if(costAlert){
        title=t('A cost movement stands out','في تغير تكلفة لافت');
        message=t(`${costAlert.itemName} changed ${costAlert.changePercent}% in the latest comparable purchase. Ask me to explain the supplier and cost context.`,`${costAlert.itemName} تغيرت تكلفته ${costAlert.changePercent}% في آخر شراء قابل للمقارنة. اسألني لأشرح لك سياق المورد والتكلفة.`);
      }

      if(this.cancelled)return;
      this.setState({visible:true,title,message});
    }catch{}
  };

  private dismiss=()=>{
    try{sessionStorage.setItem(SESSION_KEY,'dismissed');}catch{}
    this.setState({visible:false});
  };

  private openAdvisor=()=>{
    this.dismiss();
    if(this.props.screen==='home'){
      const card=document.querySelector<HTMLElement>('.lourex-advisor-card');
      card?.scrollIntoView({behavior:'smooth',block:'center'});
      window.setTimeout(()=>card?.querySelector<HTMLInputElement>('input')?.focus(),180);
      return;
    }
    document.querySelector<HTMLButtonElement>('.lourex-ai-launcher')?.click();
    window.setTimeout(()=>document.querySelector<HTMLInputElement>('#lourex-ai-panel input')?.focus(),120);
  };

  render():any{
    if(!this.state.visible)return null;
    return <aside className="lourex-advisor-nudge" role="status" dir={this.props.language==='ar'?'rtl':'ltr'}>
      <button type="button" className="lourex-advisor-nudge-close" aria-label={t('Dismiss advisor suggestion','إغلاق اقتراح المستشار')} onClick={this.dismiss}>×</button>
      <span className="lourex-advisor-nudge-mark" aria-hidden="true">✦</span>
      <div className="lourex-advisor-nudge-copy"><small>{t('LOUREX Advisor','مستشار LOUREX')}</small><strong>{this.state.title}</strong><p>{this.state.message}</p><button type="button" onClick={this.openAdvisor}>{t('Ask LOUREX','اسأل LOUREX')} <span aria-hidden="true">→</span></button></div>
    </aside>;
  }
}
