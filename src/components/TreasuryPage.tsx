import type { CompanySettings, ExpenseRecord, PaymentRecord, SupplierPaymentRecord } from '../types.js';
import { t } from '../lib/i18n.js';

interface Props{
  payments:PaymentRecord[];
  supplierPayments:SupplierPaymentRecord[];
  expenses:ExpenseRecord[];
  company:CompanySettings;
  defaultCurrency:string;
}

type TreasuryMovement={
  id:string;
  date:string;
  createdAt:string;
  direction:'in'|'out';
  source:'customer'|'supplier'|'expense';
  label:string;
  reference:string;
  method:string;
  currency:string;
  amount:number;
};

function numberValue(value:string):number{
  const parsed=Number(String(value||'').replace(/,/g,''));
  return Number.isFinite(parsed)?Math.max(0,parsed):0;
}

function money(value:number,currency:string):string{
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency:currency||'USD',maximumFractionDigits:2}).format(value);}catch{return `${currency||'USD'} ${value.toFixed(2)}`;}
}

function dateLabel(value:string):string{
  if(!value)return '—';
  const parsed=new Date(`${value}T00:00:00`);
  if(Number.isNaN(parsed.getTime()))return value;
  return new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'}).format(parsed);
}

function sourceLabel(source:TreasuryMovement['source']):string{
  if(source==='customer')return t('Customer receipt','تحصيل عميل');
  if(source==='supplier')return t('Supplier payment','دفعة مورد');
  return t('Expense','مصروف');
}

function methodLabel(method:string):string{
  switch(method){
    case 'cash':return t('Cash','نقدي');
    case 'bank-transfer':return t('Bank transfer','تحويل بنكي');
    case 'card':return t('Card','بطاقة');
    case 'cheque':return t('Cheque','شيك');
    default:return t('Other','أخرى');
  }
}

export function TreasuryPage(props:Props):any{
  const movements=React.useMemo<TreasuryMovement[]>(()=>{
    const rows:TreasuryMovement[]=[];
    props.payments.forEach(payment=>rows.push({
      id:`customer:${payment.id}`,date:payment.date,createdAt:payment.createdAt,direction:'in',source:'customer',
      label:payment.customerNameEn||payment.customerNameAr||payment.invoiceNumber||t('Customer receipt','تحصيل عميل'),
      reference:payment.reference||payment.invoiceNumber,method:payment.method,currency:(payment.currency||props.defaultCurrency||'USD').toUpperCase(),amount:numberValue(payment.amount)
    }));
    props.supplierPayments.forEach(payment=>rows.push({
      id:`supplier:${payment.id}`,date:payment.date,createdAt:payment.createdAt,direction:'out',source:'supplier',
      label:payment.supplierNameEn||payment.supplierNameAr||payment.purchaseNumber||t('Supplier payment','دفعة مورد'),
      reference:payment.reference||payment.purchaseNumber,method:payment.method,currency:(payment.currency||props.defaultCurrency||'USD').toUpperCase(),amount:numberValue(payment.amount)
    }));
    props.expenses.forEach(expense=>rows.push({
      id:`expense:${expense.id}`,date:expense.date,createdAt:expense.createdAt,direction:'out',source:'expense',
      label:expense.description||expense.category||t('Operating expense','مصروف تشغيلي'),reference:expense.reference,method:'other',currency:(expense.currency||props.defaultCurrency||'USD').toUpperCase(),amount:numberValue(expense.amount)
    }));
    return rows.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||''));
  },[props.payments,props.supplierPayments,props.expenses,props.defaultCurrency]);

  const currencies=React.useMemo(()=>Array.from(new Set([props.defaultCurrency||props.company.defaultCurrency||'USD',...movements.map(item=>item.currency)].filter(Boolean).map(item=>item.toUpperCase()))),[props.defaultCurrency,props.company.defaultCurrency,movements]);
  const [currency,setCurrency]=React.useState<string>(currencies[0]||'USD');
  React.useEffect(()=>{if(!currencies.includes(currency))setCurrency(currencies[0]||'USD');},[currencies.join('|')]);

  const scoped=movements.filter(item=>item.currency===currency);
  const inflow=scoped.filter(item=>item.direction==='in').reduce((sum,item)=>sum+item.amount,0);
  const supplierOut=scoped.filter(item=>item.source==='supplier').reduce((sum,item)=>sum+item.amount,0);
  const expenseOut=scoped.filter(item=>item.source==='expense').reduce((sum,item)=>sum+item.amount,0);
  const outflow=supplierOut+expenseOut;
  const net=inflow-outflow;
  const cashIn=scoped.filter(item=>item.direction==='in'&&item.method==='cash').reduce((sum,item)=>sum+item.amount,0);
  const cashOut=scoped.filter(item=>item.direction==='out'&&item.method==='cash').reduce((sum,item)=>sum+item.amount,0);
  const bankIn=scoped.filter(item=>item.direction==='in'&&item.method==='bank-transfer').reduce((sum,item)=>sum+item.amount,0);
  const bankOut=scoped.filter(item=>item.direction==='out'&&item.method==='bank-transfer').reduce((sum,item)=>sum+item.amount,0);

  const banks=[
    {id:'primary',label:t('Primary bank','البنك الرئيسي'),bankName:props.company.bank.bankName,accountName:props.company.bank.accountName,iban:props.company.bank.iban,currency:props.company.bank.currency||props.company.defaultCurrency},
    ...(props.company.bankAccounts||[]).map(account=>({id:account.id,label:account.label||account.bankName||t('Bank account','حساب بنكي'),bankName:account.bankName,accountName:account.accountName,iban:account.iban,currency:account.currency}))
  ].filter(account=>account.bankName||account.accountName||account.iban);

  return <section className="ta-finance-page lx-treasury-page">
    <header className="ta-page-header">
      <div>
        <span className="ta-page-kicker">{t('Cash & Bank','النقد والبنوك')}</span>
        <h2>{t('Treasury control center','مركز إدارة الخزينة')}</h2>
        <p>{t('A single operational view of recorded customer receipts, supplier payments and expenses. Values remain separated by currency.','عرض تشغيلي موحّد لتحصيلات العملاء ودفعات الموردين والمصروفات المسجلة، مع فصل القيم حسب العملة.')}</p>
      </div>
      <div className="ta-page-actions">
        <label className="ta-field"><span>{t('Currency','العملة')}</span><select value={currency} onChange={event=>setCurrency(event.target.value)}>{currencies.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
      </div>
    </header>

    <div className="ta-finance-kpis lx-treasury-kpis">
      <article className="ta-finance-kpi"><span>{t('Recorded inflow','التدفقات الداخلة المسجلة')}</span><strong>{money(inflow,currency)}</strong><small>{t('Customer collections','تحصيلات العملاء')}</small></article>
      <article className="ta-finance-kpi"><span>{t('Recorded outflow','التدفقات الخارجة المسجلة')}</span><strong>{money(outflow,currency)}</strong><small>{t('Supplier payments + expenses','دفعات الموردين + المصروفات')}</small></article>
      <article className="ta-finance-kpi"><span>{t('Net recorded movement','صافي الحركة المسجلة')}</span><strong>{money(net,currency)}</strong><small>{t('Not an opening/closing bank balance','ليس رصيدًا افتتاحيًا أو ختاميًا للبنك')}</small></article>
      <article className="ta-finance-kpi"><span>{t('Activity count','عدد الحركات')}</span><strong>{scoped.length}</strong><small>{t('For selected currency','للعملة المحددة')}</small></article>
    </div>

    <div className="ta-finance-grid lx-treasury-grid">
      <article className="ta-finance-card">
        <header><div><span className="ta-page-kicker">{t('Cash channel','القناة النقدية')}</span><h3>{t('Cash movement','الحركة النقدية')}</h3></div></header>
        <div className="ta-finance-summary-row"><span>{t('Cash received','نقد مستلم')}</span><strong>{money(cashIn,currency)}</strong></div>
        <div className="ta-finance-summary-row"><span>{t('Cash paid','نقد مدفوع')}</span><strong>{money(cashOut,currency)}</strong></div>
        <div className="ta-finance-summary-row"><span>{t('Net cash movement','صافي الحركة النقدية')}</span><strong>{money(cashIn-cashOut,currency)}</strong></div>
      </article>
      <article className="ta-finance-card">
        <header><div><span className="ta-page-kicker">{t('Bank channel','القناة البنكية')}</span><h3>{t('Bank-transfer movement','حركة التحويلات البنكية')}</h3></div></header>
        <div className="ta-finance-summary-row"><span>{t('Bank transfers received','تحويلات بنكية واردة')}</span><strong>{money(bankIn,currency)}</strong></div>
        <div className="ta-finance-summary-row"><span>{t('Bank transfers paid','تحويلات بنكية صادرة')}</span><strong>{money(bankOut,currency)}</strong></div>
        <div className="ta-finance-summary-row"><span>{t('Net bank-transfer movement','صافي حركة التحويلات')}</span><strong>{money(bankIn-bankOut,currency)}</strong></div>
      </article>
    </div>

    <article className="ta-finance-card lx-treasury-bank-card">
      <header><div><span className="ta-page-kicker">{t('Configured accounts','الحسابات المهيأة')}</span><h3>{t('Company bank accounts','الحسابات البنكية للشركة')}</h3><p>{t('Account details come from Company Settings. Treasury does not invent balances for accounts without opening balance data.','تفاصيل الحسابات مأخوذة من إعدادات الشركة. لا تقوم الخزينة باختراع أرصدة لحسابات لا تحتوي على بيانات رصيد افتتاحي.')}</p></div></header>
      {banks.length?<div className="ta-finance-list">{banks.map(account=><div className="ta-finance-row" key={account.id}><div><strong>{account.label}</strong><small>{[account.bankName,account.accountName].filter(Boolean).join(' · ')||'—'}</small></div><div><strong>{(account.currency||'').toUpperCase()||'—'}</strong><small>{account.iban||t('No IBAN recorded','لا يوجد IBAN مسجل')}</small></div></div>)}</div>:<div className="ta-empty-state"><strong>{t('No bank accounts configured yet','لا توجد حسابات بنكية مهيأة بعد')}</strong><p>{t('Add bank details from Company Settings to expose them here.','أضف تفاصيل البنك من إعدادات الشركة لتظهر هنا.')}</p></div>}
    </article>

    <article className="ta-finance-card lx-treasury-activity-card">
      <header><div><span className="ta-page-kicker">{t('Treasury activity','نشاط الخزينة')}</span><h3>{t('Recent financial movements','أحدث الحركات المالية')}</h3></div></header>
      {scoped.length?<div className="ta-finance-list">{scoped.slice(0,40).map(item=><div className="ta-finance-row lx-treasury-row" key={item.id}><div><strong>{item.label}</strong><small>{sourceLabel(item.source)} · {methodLabel(item.method)} · {dateLabel(item.date)}{item.reference?` · ${item.reference}`:''}</small></div><strong className={item.direction==='in'?'is-positive':'is-negative'}>{item.direction==='in'?'+':'−'}{money(item.amount,item.currency)}</strong></div>)}</div>:<div className="ta-empty-state"><strong>{t('No treasury movements yet','لا توجد حركات خزينة بعد')}</strong><p>{t('Customer receipts, supplier payments and expenses will appear here automatically.','ستظهر هنا تحصيلات العملاء ودفعات الموردين والمصروفات تلقائيًا.')}</p></div>}
    </article>
  </section>;
}
