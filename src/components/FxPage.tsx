import type { ExpenseRecord, PaymentRecord, SupplierPaymentRecord } from '../types.js';
import { t } from '../lib/i18n.js';

interface Props{
  payments:PaymentRecord[];
  supplierPayments:SupplierPaymentRecord[];
  expenses:ExpenseRecord[];
  defaultCurrency:string;
}

function amount(value:string):number{
  const parsed=Number(String(value||'').replace(/,/g,''));
  return Number.isFinite(parsed)?Math.max(0,parsed):0;
}

function money(value:number,currency:string):string{
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(value);}catch{return `${currency} ${value.toFixed(2)}`;}
}

export function FxPage(props:Props):any{
  const currencyRows=React.useMemo(()=>{
    const map=new Map<string,{currency:string,inflow:number,outflow:number,count:number}>();
    const ensure=(currency:string)=>{const key=(currency||props.defaultCurrency||'USD').toUpperCase();if(!map.has(key))map.set(key,{currency:key,inflow:0,outflow:0,count:0});return map.get(key)!;};
    props.payments.forEach(item=>{const row=ensure(item.currency);row.inflow+=amount(item.amount);row.count+=1;});
    props.supplierPayments.forEach(item=>{const row=ensure(item.currency);row.outflow+=amount(item.amount);row.count+=1;});
    props.expenses.forEach(item=>{const row=ensure(item.currency);row.outflow+=amount(item.amount);row.count+=1;});
    if(!map.size)ensure(props.defaultCurrency||'USD');
    return Array.from(map.values()).sort((a,b)=>a.currency.localeCompare(b.currency));
  },[props.payments,props.supplierPayments,props.expenses,props.defaultCurrency]);

  const currencies=currencyRows.map(item=>item.currency);
  const [fromCurrency,setFromCurrency]=React.useState(currencies[0]||'USD');
  const [toCurrency,setToCurrency]=React.useState((currencies.find(item=>item!==fromCurrency)||props.defaultCurrency||'USD').toUpperCase());
  const [rate,setRate]=React.useState('1');
  const [sourceAmount,setSourceAmount]=React.useState('1000');

  React.useEffect(()=>{
    if(!currencies.includes(fromCurrency))setFromCurrency(currencies[0]||'USD');
    if(!currencies.includes(toCurrency)&&toCurrency!==props.defaultCurrency.toUpperCase())setToCurrency(currencies.find(item=>item!==fromCurrency)||currencies[0]||'USD');
  },[currencies.join('|')]);

  const numericRate=Number(rate.replace(/,/g,''));
  const numericAmount=Number(sourceAmount.replace(/,/g,''));
  const converted=Number.isFinite(numericRate)&&numericRate>=0&&Number.isFinite(numericAmount)&&numericAmount>=0?numericRate*numericAmount:0;

  const swap=()=>{
    const nextFrom=toCurrency,nextTo=fromCurrency;
    const currentRate=Number(rate.replace(/,/g,''));
    setFromCurrency(nextFrom);setToCurrency(nextTo);
    if(Number.isFinite(currentRate)&&currentRate>0)setRate(String(1/currentRate));
  };

  return <section className="ta-finance-page lx-fx-page">
    <header className="ta-page-header">
      <div>
        <span className="ta-page-kicker">{t('FX & Exchange Rates','العملات وأسعار الصرف')}</span>
        <h2>{t('Currency exposure & conversion','انكشاف العملات والتحويل')}</h2>
        <p>{t('See which currencies are moving through the business and calculate controlled conversions without merging unlike currencies into one misleading total.','شاهد العملات المتداولة في النشاط واحسب التحويلات بشكل منضبط دون دمج العملات المختلفة في إجمالي مضلل.')}</p>
      </div>
    </header>

    <div className="ta-finance-kpis lx-fx-kpis">
      <article className="ta-finance-kpi"><span>{t('Tracked currencies','العملات المتتبعة')}</span><strong>{currencyRows.length}</strong><small>{t('From recorded finance activity','من النشاط المالي المسجل')}</small></article>
      <article className="ta-finance-kpi"><span>{t('Base currency','العملة الأساسية')}</span><strong>{(props.defaultCurrency||'USD').toUpperCase()}</strong><small>{t('Company default','الافتراضية للشركة')}</small></article>
      <article className="ta-finance-kpi"><span>{t('Largest activity currency','أكبر عملة نشاطًا')}</span><strong>{[...currencyRows].sort((a,b)=>(b.inflow+b.outflow)-(a.inflow+a.outflow))[0]?.currency||'—'}</strong><small>{t('By recorded movement','حسب الحركة المسجلة')}</small></article>
    </div>

    <article className="ta-finance-card lx-fx-converter">
      <header><div><span className="ta-page-kicker">{t('Manual rate','سعر يدوي')}</span><h3>{t('FX calculator','حاسبة العملات')}</h3><p>{t('Enter the rate supplied by your bank, supplier, customer or market source. LOUREX does not invent or silently fetch a rate.','أدخل السعر الوارد من البنك أو المورد أو العميل أو مصدر السوق. لا يقوم LOUREX باختراع سعر أو جلبه بصمت.')}</p></div></header>
      <div className="ta-form-grid">
        <label className="ta-field"><span>{t('From','من')}</span><select value={fromCurrency} onChange={(event:any)=>setFromCurrency(event.target.value)}>{currencies.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
        <label className="ta-field"><span>{t('Amount','المبلغ')}</span><input inputMode="decimal" value={sourceAmount} onChange={(event:any)=>setSourceAmount(event.target.value)} /></label>
        <label className="ta-field"><span>{t('Rate','السعر')}</span><input inputMode="decimal" value={rate} onChange={(event:any)=>setRate(event.target.value)} /><small>{t(`1 ${fromCurrency} = ${rate||'0'} ${toCurrency}`,`1 ${fromCurrency} = ${rate||'0'} ${toCurrency}`)}</small></label>
        <label className="ta-field"><span>{t('To','إلى')}</span><select value={toCurrency} onChange={(event:any)=>setToCurrency(event.target.value)}>{Array.from(new Set([...currencies,(props.defaultCurrency||'USD').toUpperCase()])).map(item=><option key={item} value={item}>{item}</option>)}</select></label>
      </div>
      <div className="ta-page-actions"><button type="button" className="btn" onClick={swap}>{t('Swap currencies','تبديل العملات')}</button><span className="ta-period-chip">{money(converted,toCurrency)}</span></div>
    </article>

    <article className="ta-finance-card lx-fx-exposure">
      <header><div><span className="ta-page-kicker">{t('Recorded exposure','الانكشاف المسجل')}</span><h3>{t('Activity by currency','النشاط حسب العملة')}</h3><p>{t('Inflow and outflow remain in their native currencies. No synthetic consolidated total is shown.','تبقى التدفقات الداخلة والخارجة بعملاتها الأصلية، ولا يتم عرض إجمالي موحّد مصطنع.')}</p></div></header>
      <div className="ta-finance-list">{currencyRows.map(row=><div className="ta-finance-row" key={row.currency}><div><strong>{row.currency}</strong><small>{row.count} {t('recorded movements','حركة مسجلة')}</small></div><div><strong>{t('In','داخل')}: {money(row.inflow,row.currency)}</strong><small>{t('Out','خارج')}: {money(row.outflow,row.currency)} · {t('Net','صافي')}: {money(row.inflow-row.outflow,row.currency)}</small></div></div>)}</div>
    </article>
  </section>;
}
