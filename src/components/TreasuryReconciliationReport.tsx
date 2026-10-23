import type { CompanySettings } from '../types.js';
import { activeAccountStorageUid } from '../storage/db.js';
import { treasuryProjection } from '../lib/treasury-ledger.js';
import { todayIso } from '../lib/id.js';
import { getUiLanguage, t } from '../lib/i18n.js';
import { formatMoney } from '../lib/money.js';
import { treasuryPeriodReport, treasuryReportCsv, treasuryReportStatus, treasuryReportType, type TreasuryReportInput, type TreasuryPeriodReport } from '../lib/treasury-report.js';
import { Button, Input, Select } from './UI.js';

interface Props extends Omit<TreasuryReportInput,'from'|'to'|'currency'|'accountId'> {company:CompanySettings;onBack:()=>void;}
interface Snapshot {report:TreasuryPeriodReport;company:string;logo:string;generatedAt:string;sourceKey:string;storageUid:string|null;}
export function TreasuryReconciliationReport(props:Props):any {
  const [from,setFrom]=React.useState(todayIso().slice(0,7)+'-01'),[to,setTo]=React.useState(todayIso()),[currency,setCurrency]=React.useState('ALL'),[accountId,setAccountId]=React.useState('ALL'),[savedSnapshot,setSnapshot]=React.useState<Snapshot|null>(null),[error,setError]=React.useState('');
  const sourceKey=JSON.stringify([activeAccountStorageUid(),props.workspaceId,props.branchId,props.company,props.accounts,props.entries,props.payments,props.supplierPayments,props.expenses,props.reconciliations]);
  const snapshot=savedSnapshot?.sourceKey===sourceKey?savedSnapshot:null;
  const [timer]=React.useState<{current:number|undefined;sourceKey:string}>(()=>({current:undefined,sourceKey}));timer.sourceKey=sourceKey;
  const cleanup=()=>{if(timer.current!==undefined)window.clearTimeout(timer.current);timer.current=undefined;document.body.classList.remove('printing-treasury-report');};
  React.useEffect(()=>{window.addEventListener('afterprint',cleanup);return()=>{window.removeEventListener('afterprint',cleanup);cleanup();};},[]);
  React.useEffect(()=>{setSnapshot(null);cleanup();},[sourceKey]);
  const invalidate=()=>{setSnapshot(null);setError('');cleanup();};
  const generate=()=>{cleanup();try{const report=treasuryPeriodReport({...props,from,to,currency,accountId,defaultCurrency:props.company.defaultCurrency});setSnapshot({report,company:(getUiLanguage()==='ar'?props.company.nameAr||props.company.nameEn:props.company.nameEn||props.company.nameAr)||'LOUREX',logo:props.company.logoDataUrl||'',generatedAt:new Date().toISOString(),sourceKey,storageUid:activeAccountStorageUid()});setError('');}catch(e){setSnapshot(null);setError(e instanceof Error?e.message:t('Unable to generate report.','تعذر إعداد التقرير.'));}};
  const print=()=>{if(!snapshot||snapshot.storageUid!==activeAccountStorageUid()){invalidate();return;}cleanup();document.body.classList.add('printing-treasury-report');timer.current=window.setTimeout(()=>{timer.current=undefined;if(timer.sourceKey!==sourceKey||snapshot.storageUid!==activeAccountStorageUid()){cleanup();return;}try{window.print();}catch{cleanup();}},40);};
  const download=()=>{if(!snapshot||snapshot.storageUid!==activeAccountStorageUid()){invalidate();return;}const url=URL.createObjectURL(new Blob([treasuryReportCsv(snapshot.report)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`LOUREX-Treasury-${snapshot.report.from}-${snapshot.report.to}.csv`;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),500);};
  const inScope=(a:{workspaceId?:string;branchId?:string})=>(a.workspaceId||'default')===props.workspaceId&&(a.branchId||'main')===props.branchId;
  const scopedAccounts=props.accounts.filter(inScope),availableRows=treasuryProjection(props.payments.filter(inScope),props.supplierPayments.filter(inScope),props.expenses.filter(inScope),props.entries.filter(inScope),props.reconciliations.filter(inScope),props.company.defaultCurrency),currencies=Array.from(new Set([...scopedAccounts.map(a=>a.currency),...availableRows.map(r=>r.currency)])).sort();
  return <section className="lx-treasury-report ta-finance-page">
    <header className="ta-page-header lx-treasury-report-controls"><h2>{t('Treasury reconciliation report','تقرير مطابقة الخزينة')}</h2><Button onClick={props.onBack}>{t('Back to ledger','العودة إلى الدفتر')}</Button></header>
    <div className="lx-treasury-report-controls lx-treasury-report-filters">
      <label>{t('From','من')}<Input type="date" value={from} onChange={(e:any)=>{setFrom(e.target.value);invalidate();}}/></label>
      <label>{t('To','إلى')}<Input type="date" value={to} onChange={(e:any)=>{setTo(e.target.value);invalidate();}}/></label>
      <label>{t('Currency','العملة')}<Select value={currency} onChange={(e:any)=>{setCurrency(e.target.value);setAccountId('ALL');invalidate();}}><option value="ALL">{t('All currencies','كل العملات')}</option>{currencies.map(code=><option key={code}>{code}</option>)}</Select></label>
      <label>{t('Account','الحساب')}<Select value={accountId} onChange={(e:any)=>{setAccountId(e.target.value);invalidate();}}><option value="ALL">{t('All accounts','كل الحسابات')}</option>{scopedAccounts.filter(a=>currency==='ALL'||a.currency===currency).map(a=><option key={a.id} value={a.id}>{a.label} · {a.currency}</option>)}</Select></label>
      <Button variant="primary" onClick={generate}>{t('Generate report','إعداد التقرير')}</Button><Button disabled={!snapshot} onClick={download}>{t('Export CSV','تصدير CSV')}</Button><Button disabled={!snapshot} onClick={print}>{t('Print / Save PDF','طباعة / حفظ PDF')}</Button>
    </div>
    {error?<p role="alert">{error}</p>:null}
    {snapshot?<article className="lx-treasury-report-output" dir={getUiLanguage()==='ar'?'rtl':'ltr'}>
      <header className="lx-treasury-report-heading">{snapshot.logo?<img src={snapshot.logo} alt=""/>:null}<div><h2>{snapshot.company}</h2><h3>{t('Treasury reconciliation report','تقرير مطابقة الخزينة')}</h3><p>{snapshot.report.from} — {snapshot.report.to}</p><p>{t('Company / branch','الشركة / الفرع')}: {snapshot.report.workspaceId} / {snapshot.report.branchId}</p><p>{t('Currency / account','العملة / الحساب')}: {snapshot.report.currency==='ALL'?t('All currencies','كل العملات'):snapshot.report.currency} / {snapshot.report.accountId==='ALL'?t('All accounts','كل الحسابات'):snapshot.report.accounts[0]?.label}</p><small>{t('Generated','أُعد في')}: {snapshot.generatedAt}</small></div></header>
      <p>{t('Ledger balances only. Reconciled status records an application action; it is not independent bank verification.','أرصدة دفترية فقط. حالة المطابقة تسجل إجراءً في التطبيق ولا تمثل تحققًا بنكيًا مستقلًا.')}</p>
      {!snapshot.report.accounts.length?<p>{t('No ledger accounts match these filters.','لا توجد حسابات دفترية تطابق الفلاتر.')}</p>:null}
      {snapshot.report.accounts.map(a=><section key={a.id} className="lx-treasury-report-account" data-account={a.id}>
        <h3>{a.label} · {a.currency}{!a.active?' · '+t('Inactive','غير نشط'):''}</h3>
        <div className="lx-treasury-report-balances"><p>{t('Opening balance','رصيد افتتاحي')}<strong data-balance="opening">{formatMoney(a.opening,a.currency)}</strong></p><p>{t('Net account change','صافي تغير الحساب')}<strong data-balance="change">{formatMoney(a.change,a.currency)}</strong></p><p>{t('Closing balance','رصيد الإقفال')}<strong data-balance="closing">{formatMoney(a.closing,a.currency)}</strong></p></div>
        <div className="ta-table-wrap"><table className="ta-table"><thead><tr>{[t('Date','التاريخ'),t('Type','النوع'),t('Reference / description','المرجع / الوصف'),t('Signed change','التغير بإشارته'),t('Status at period end','الحالة عند نهاية الفترة')].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{a.movements.map(m=><tr key={m.key} data-movement={m.key}><td>{m.date}</td><td>{treasuryReportType(m.type)}</td><td><strong>{m.reference||'—'}</strong><small>{m.description}</small></td><td>{formatMoney(m.amount,a.currency)}</td><td>{treasuryReportStatus(m.status)}</td></tr>)}</tbody></table></div>
        {!a.movements.length?<p>{t('No effective account changes in this period.','لا توجد تغيرات فعلية للحساب ضمن الفترة.')}</p>:null}
      </section>)}
      <section className="lx-treasury-report-unallocated"><h3>{t('Unallocated movements — excluded from account balances','حركات غير مخصصة — مستبعدة من أرصدة الحسابات')}</h3><p>{snapshot.report.accountId==='ALL'?t('Shown separately; no cash account is inferred.','تُعرض منفصلة ولا يُفترض لها حساب نقدي.'):t('Select all accounts to include unallocated movements.','اختر كل الحسابات لعرض الحركات غير المخصصة.')}</p>
        <div className="ta-table-wrap"><table className="ta-table"><thead><tr>{[t('Date','التاريخ'),t('Type','النوع'),t('Reference / description','المرجع / الوصف'),t('Amount','المبلغ'),t('Status at period end','الحالة عند نهاية الفترة')].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{snapshot.report.unallocated.map(r=><tr key={r.key}><td>{r.date}</td><td>{treasuryReportType(r.source)}</td><td><strong>{r.reference||'—'}</strong><small>{r.label}</small></td><td>{formatMoney((r.direction==='out'?'-':'')+r.amount,r.currency)}</td><td>{treasuryReportStatus(r.reconciled?'reconciled':'open')}</td></tr>)}</tbody></table></div>
      </section>
      <footer>LOUREX · {t('Transfers affect individual accounts; currencies are never combined or converted. Void effects follow their effective dates.','تؤثر التحويلات على الحسابات الفردية ولا تُجمع العملات أو تُحوّل. يتبع أثر الإلغاء تاريخ سريانه.')}</footer>
    </article>:null}
  </section>;
}
