import type { UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';
import { buildAiBusinessContext } from '../lib/ai-business.js';
import { buildAiFinanceContext } from '../lib/ai-finance.js';
import { resumeVaultSession } from '../storage/vault.js';
import type { AiWorkspaceScreen } from './AiCopilot.js';

interface Props{screen:AiWorkspaceScreen;language:UiLanguage;}
interface State{visible:boolean;title:string;message:string;}

const SESSION_KEY='lourex-advisor-nudge-v276';
const NUDGE_CSS=`
.lourex-advisor-nudge{position:fixed;z-index:1176;right:22px;bottom:88px;width:min(360px,calc(100vw - 28px));display:grid;grid-template-columns:38px minmax(0,1fr);gap:11px;padding:14px 15px 14px 14px;border:1px solid #4b402f;border-radius:15px;background:#11110f;color:#f6f4ef;box-shadow:0 18px 52px rgba(0,0,0,.42);font-family:Inter,"Noto Sans Arabic",sans-serif;animation:lourexAdvisorNudgeIn .24s ease-out both}.lourex-advisor-nudge[dir="rtl"]{right:auto;left:22px}.lourex-advisor-nudge-mark{display:grid;place-items:center;width:36px;height:36px;border:1px solid #554a35;border-radius:10px;background:#1b1813;color:#d2bd91;font-size:16px}.lourex-advisor-nudge-copy{min-width:0}.lourex-advisor-nudge-copy small{display:block;padding-inline-end:24px;color:#b8a071;font-size:9px;font-weight:750;letter-spacing:.06em;text-transform:uppercase}.lourex-advisor-nudge[dir="rtl"] .lourex-advisor-nudge-copy small{letter-spacing:normal}.lourex-advisor-nudge-copy strong{display:block;margin-top:2px;padding-inline-end:22px;color:#f1ede4;font-size:12px;line-height:1.4}.lourex-advisor-nudge-copy p{margin:6px 0 10px;color:#aaa69e;font-size:10px;line-height:1.55}.lourex-advisor-nudge-copy>button{min-height:34px;padding:6px 9px;border:1px solid #4a4131;border-radius:8px;background:#1c1914;color:#d2bd91;font:700 10px/1.2 inherit;cursor:pointer}.lourex-advisor-nudge-copy>button:hover{background:#242019;color:#f3e6c9}.lourex-advisor-nudge-close{position:absolute;top:8px;right:8px;width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:#777;font:400 20px/1 inherit;cursor:pointer}.lourex-advisor-nudge[dir="rtl"] .lourex-advisor-nudge-close{right:auto;left:8px}.lourex-advisor-nudge-close:hover{background:#1b1b1b;color:#ccc}@keyframes lourexAdvisorNudgeIn{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}@media(max-width:720px){.lourex-advisor-nudge{right:12px;bottom:calc(96px + env(safe-area-inset-bottom));width:calc(100vw - 24px);grid-template-columns:34px minmax(0,1fr);padding:12px;border-radius:14px}.lourex-advisor-nudge[dir="rtl"]{right:auto;left:12px}.lourex-advisor-nudge-mark{width:32px;height:32px}.lourex-advisor-nudge-copy>button{min-height:40px}}@media(prefers-reduced-motion:reduce){.lourex-advisor-nudge{animation:none}}
`;

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
    return <><style data-lourex-advisor-nudge="v276">{NUDGE_CSS}</style>{this.state.visible?<aside className="lourex-advisor-nudge" role="status" dir={this.props.language==='ar'?'rtl':'ltr'}>
      <button type="button" className="lourex-advisor-nudge-close" aria-label={t('Dismiss advisor suggestion','إغلاق اقتراح المستشار')} onClick={this.dismiss}>×</button>
      <span className="lourex-advisor-nudge-mark" aria-hidden="true">✦</span>
      <div className="lourex-advisor-nudge-copy"><small>{t('LOUREX Advisor','مستشار LOUREX')}</small><strong>{this.state.title}</strong><p>{this.state.message}</p><button type="button" onClick={this.openAdvisor}>{t('Ask LOUREX','اسأل LOUREX')} <span aria-hidden="true">→</span></button></div>
    </aside>:null}</>;
  }
}
