import type { ExchangeRateRecord, ExpenseRecord, PaymentRecord, SupplierPaymentRecord } from '../types.js';
import { convertWithExchangeRate, createExchangeRate, latestExchangeRate } from '../lib/fx-rates.js';
import { todayIso } from '../lib/id.js';
import { t } from '../lib/i18n.js';
import { formatMoney } from '../lib/money.js';
import { Button, Input, Select, Textarea } from './UI.js';

interface Props{
  payments:PaymentRecord[];
  supplierPayments:SupplierPaymentRecord[];
  expenses:ExpenseRecord[];
  rates:ExchangeRateRecord[];
  workspaceId:string;
  defaultCurrency:string;
  onSaveRate:(rate:ExchangeRateRecord)=>Promise<void>;
  onDeleteRate:(rate:ExchangeRateRecord)=>Promise<void>;
}

function scaledActivity(value:string):number{const parsed=Number(String(value||'').replace(/,/g,''));return Number.isFinite(parsed)?Math.max(0,parsed):0;}

export function FxPage(props:Props):any{
  const currencyRows=React.useMemo(()=>{
    const map=new Map<string,{currency:string;inflow:number;outflow:number;count:number}>();
    const ensure=(currency:string)=>{const key=(currency||props.defaultCurrency||'USD').toUpperCase();if(!map.has(key))map.set(key,{currency:key,inflow:0,outflow:0,count:0});return map.get(key)!;};
    props.payments.forEach(item=>{const row=ensure(item.currency);row.inflow+=scaledActivity(item.amount);row.count+=1;});
    props.supplierPayments.forEach(item=>{const row=ensure(item.currency);row.outflow+=scaledActivity(item.amount);row.count+=1;});
    props.expenses.forEach(item=>{const row=ensure(item.currency);row.outflow+=scaledActivity(item.amount);row.count+=1;});
    if(!map.size)ensure(props.defaultCurrency||'USD');return Array.from(map.values()).sort((a,b)=>a.currency.localeCompare(b.currency));
  },[props.payments,props.supplierPayments,props.expenses,props.defaultCurrency]);
  const currencies=Array.from(new Set([props.defaultCurrency.toUpperCase(),...currencyRows.map(item=>item.currency),...props.rates.flatMap(rate=>[rate.baseCurrency,rate.quoteCurrency])])).filter(Boolean);
  const [date,setDate]=React.useState(todayIso()),[base,setBase]=React.useState((props.defaultCurrency||'USD').toUpperCase()),[quote,setQuote]=React.useState(currencies.find(item=>item!==base)||'EUR'),[rate,setRate]=React.useState(''),[source,setSource]=React.useState(''),[notes,setNotes]=React.useState('');
  const [amount,setAmount]=React.useState('1000'),[asOf,setAsOf]=React.useState(todayIso()),[from,setFrom]=React.useState(currencies[0]||'USD'),[to,setTo]=React.useState(currencies.find(item=>item!==from)||props.defaultCurrency.toUpperCase());
  const [busy,setBusy]=React.useState(''),[error,setError]=React.useState('');
  const run=async(key:string,fn:()=>Promise<void>)=>{if(busy)return;setBusy(key);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:t('Unable to update exchange rates.','تعذر تحديث أسعار الصرف.'));}finally{setBusy('');}};
  const save=()=>void run('save',async()=>{const record=createExchangeRate({date,baseCurrency:base,quoteCurrency:quote,rate,sourceLabel:source,notes,workspaceId:props.workspaceId});await props.onSaveRate(record);setRate('');setSource('');setNotes('');});
  const match=latestExchangeRate(props.rates,from,to,asOf);const converted=match?convertWithExchangeRate(amount,match):'';
  const sorted=[...props.rates].sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));

  return <section className="ta-finance-page lx-fx-page">
    <header className="ta-page-header"><div><span className="ta-page-kicker">{t('FX & Exchange Rates','العملات وأسعار الصرف')}</span><h2>{t('Dated exchange-rate register','سجل أسعار صرف مؤرخ')}</h2><p>{t('Every rate is manual and source-labeled. Original document and ledger currencies are never overwritten, and consolidated conversion is always explicit.','كل سعر يدوي ومربوط بمصدر. لا يتم استبدال عملة المستند أو دفتر الخزينة الأصلية، وأي تحويل موحّد يكون صريحًا دائمًا.')}</p></div><div className="ta-page-actions"><span className="ta-period-chip">{t('No silent conversion','لا تحويل صامت')}</span></div></header>

    <div className="ta-finance-kpis lx-fx-kpis"><article className="ta-finance-kpi"><span>{t('Saved rates','الأسعار المحفوظة')}</span><strong>{props.rates.length}</strong><small>{t('Dated and source-labeled','مؤرخة وموثقة المصدر')}</small></article><article className="ta-finance-kpi"><span>{t('Tracked currencies','العملات المتتبعة')}</span><strong>{currencies.length}</strong><small>{t('Native currencies remain separated','تبقى العملات الأصلية منفصلة')}</small></article><article className="ta-finance-kpi"><span>{t('Base reporting currency','عملة التقارير الأساسية')}</span><strong>{props.defaultCurrency.toUpperCase()}</strong><small>{t('Used only when you explicitly convert','تستخدم فقط عند طلب التحويل صراحة')}</small></article></div>

    <div className="ta-finance-grid">
      <article className="ta-finance-card"><header><div><span className="ta-page-kicker">{t('Rate management','إدارة الأسعار')}</span><h3>{t('Add dated exchange rate','إضافة سعر صرف مؤرخ')}</h3></div></header><div className="ta-form-grid"><label className="ta-field"><span>{t('Date','التاريخ')}</span><Input type="date" value={date} onChange={(e:any)=>setDate(e.target.value)}/></label><label className="ta-field"><span>{t('Base currency','العملة الأساس')}</span><Input dir="ltr" maxLength={3} value={base} onChange={(e:any)=>setBase(e.target.value.toUpperCase())}/></label><label className="ta-field"><span>{t('Quote currency','العملة المقابلة')}</span><Input dir="ltr" maxLength={3} value={quote} onChange={(e:any)=>setQuote(e.target.value.toUpperCase())}/></label><label className="ta-field"><span>{t('Rate','السعر')}</span><Input inputMode="decimal" value={rate} onChange={(e:any)=>setRate(e.target.value)}/><small>{t(`1 ${base||'—'} = ${rate||'—'} ${quote||'—'}`,`1 ${base||'—'} = ${rate||'—'} ${quote||'—'}`)}</small></label><label className="ta-field"><span>{t('Source','المصدر')}</span><Input value={source} placeholder={t('Bank / supplier / official source','البنك / المورد / مصدر رسمي')} onChange={(e:any)=>setSource(e.target.value)}/></label><label className="ta-field"><span>{t('Notes','ملاحظات')}</span><Textarea rows={2} value={notes} onChange={(e:any)=>setNotes(e.target.value)}/></label></div><Button variant="primary" disabled={Boolean(busy)} onClick={save}>{t('Save rate','حفظ السعر')}</Button></article>

      <article className="ta-finance-card"><header><div><span className="ta-page-kicker">{t('Explicit conversion','تحويل صريح')}</span><h3>{t('As-of FX calculator','حاسبة صرف حسب التاريخ')}</h3><p>{t('Uses the latest saved rate on or before the selected date. No rate means no conversion result.','تستخدم أحدث سعر محفوظ في التاريخ المحدد أو قبله. عدم وجود سعر يعني عدم عرض نتيجة تحويل.')}</p></div></header><div className="ta-form-grid"><label className="ta-field"><span>{t('As of','حتى تاريخ')}</span><Input type="date" value={asOf} onChange={(e:any)=>setAsOf(e.target.value)}/></label><label className="ta-field"><span>{t('From','من')}</span><Select value={from} onChange={(e:any)=>setFrom(e.target.value)}>{currencies.map(item=><option key={item}>{item}</option>)}</Select></label><label className="ta-field"><span>{t('Amount','المبلغ')}</span><Input inputMode="decimal" value={amount} onChange={(e:any)=>setAmount(e.target.value)}/></label><label className="ta-field"><span>{t('To','إلى')}</span><Select value={to} onChange={(e:any)=>setTo(e.target.value)}>{currencies.map(item=><option key={item}>{item}</option>)}</Select></label></div>{from===to?<div className="ta-period-chip">{formatMoney(amount||'0',to)}</div>:match?<div className="lx-fx-result"><strong>{formatMoney(converted,to)}</strong><small>{t('Rate','السعر')}: {match.record.rate} · {match.record.date} · {match.record.sourceLabel}{match.inverse?` · ${t('inverse','معكوس')}`:''}</small></div>:<div className="ta-empty-state"><strong>{t('No dated rate available','لا يوجد سعر مؤرخ متاح')}</strong><p>{t('Save a source-labeled rate for this currency pair before converting.','احفظ سعرًا موثق المصدر لزوج العملات هذا قبل التحويل.')}</p></div>}</article>
    </div>

    {error?<p className="form-error" role="alert">{error}</p>:null}
    <article className="ta-finance-card"><header><div><span className="ta-page-kicker">{t('Rate history','سجل الأسعار')}</span><h3>{t('Saved exchange rates','أسعار الصرف المحفوظة')}</h3></div></header>{sorted.length?<div className="ta-finance-list">{sorted.map(item=><div className="ta-finance-row" key={item.id}><div><strong>1 {item.baseCurrency} = {item.rate} {item.quoteCurrency}</strong><small>{item.date} · {item.sourceLabel}{item.notes?` · ${item.notes}`:''}</small></div><Button variant="danger" disabled={Boolean(busy)} onClick={()=>void run(`delete-${item.id}`,()=>props.onDeleteRate(item))}>{t('Delete','حذف')}</Button></div>)}</div>:<div className="ta-empty-state"><strong>{t('No saved rates yet','لا توجد أسعار محفوظة بعد')}</strong></div>}</article>

    <article className="ta-finance-card"><header><div><span className="ta-page-kicker">{t('Native currency exposure','الانكشاف بالعملة الأصلية')}</span><h3>{t('Activity remains separated by currency','يبقى النشاط مفصولًا حسب العملة')}</h3></div></header><div className="ta-finance-list">{currencyRows.map(row=><div className="ta-finance-row" key={row.currency}><div><strong>{row.currency}</strong><small>{row.count} {t('recorded movements','حركة مسجلة')}</small></div><div><strong>{t('In','داخل')}: {formatMoney(String(row.inflow.toFixed(2)),row.currency)}</strong><small>{t('Out','خارج')}: {formatMoney(String(row.outflow.toFixed(2)),row.currency)}</small></div></div>)}</div></article>
  </section>;
}
