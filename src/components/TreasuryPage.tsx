import type { CompanySettings, PaymentRecord, SupplierPaymentRecord, TreasuryAccountKind, TreasuryAccountRecord, TreasuryEntryType, TreasuryLedgerEntry } from '../types.js';
import { createTreasuryAccount, createTreasuryEntry, treasuryAccountBalance, treasuryLinkedSourceUsed } from '../lib/treasury-ledger.js';
import { todayIso } from '../lib/id.js';
import { t } from '../lib/i18n.js';
import { formatMoney } from '../lib/money.js';
import { Button, Input, Select, Textarea } from './UI.js';

interface Props{
  payments:PaymentRecord[];
  supplierPayments:SupplierPaymentRecord[];
  company:CompanySettings;
  defaultCurrency:string;
  accounts:TreasuryAccountRecord[];
  entries:TreasuryLedgerEntry[];
  workspaceId:string;
  branchId:string;
  onSaveAccount:(account:TreasuryAccountRecord)=>Promise<void>;
  onSaveEntry:(entry:TreasuryLedgerEntry)=>Promise<void>;
  onVoidEntry:(entry:TreasuryLedgerEntry,reason:string)=>Promise<void>;
  onReconcileEntry:(entry:TreasuryLedgerEntry,reconciled:boolean)=>Promise<void>;
}

type ReconciliationDirection='in'|'out';

function entryLabel(type:TreasuryEntryType):string{
  if(type==='opening-balance')return t('Opening balance','رصيد افتتاحي');
  if(type==='deposit')return t('Deposit','إيداع');
  if(type==='withdrawal')return t('Withdrawal','سحب');
  if(type==='transfer')return t('Transfer','تحويل');
  if(type==='collection')return t('Customer collection','تحصيل عميل');
  if(type==='supplier-payment')return t('Supplier payment','دفعة مورد');
  return t('Reconciliation adjustment','تسوية مطابقة');
}
function accountLabel(account:TreasuryAccountRecord|undefined):string{return account?`${account.label} · ${account.currency}`:'—';}

export function TreasuryPage(props:Props):any{
  const activeAccounts=props.accounts.filter(item=>item.active);
  const [accountLabelValue,setAccountLabelValue]=React.useState('');
  const [accountKind,setAccountKind]=React.useState<TreasuryAccountKind>('bank');
  const [accountCurrency,setAccountCurrency]=React.useState((props.defaultCurrency||'USD').toUpperCase());
  const [bankAccountId,setBankAccountId]=React.useState('');
  const [openingBalance,setOpeningBalance]=React.useState('');
  const [entryType,setEntryType]=React.useState<TreasuryEntryType>('deposit');
  const [entryDate,setEntryDate]=React.useState(todayIso());
  const [fromAccountId,setFromAccountId]=React.useState('');
  const [toAccountId,setToAccountId]=React.useState('');
  const [entryAmount,setEntryAmount]=React.useState('');
  const [reference,setReference]=React.useState('');
  const [notes,setNotes]=React.useState('');
  const [sourceId,setSourceId]=React.useState('');
  const [reconciliationDirection,setReconciliationDirection]=React.useState<ReconciliationDirection>('in');
  const [busy,setBusy]=React.useState('');
  const [error,setError]=React.useState('');
  const [voidReason,setVoidReason]=React.useState<Record<string,string>>({});

  const run=async(key:string,fn:()=>Promise<void>)=>{if(busy)return;setBusy(key);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:t('Unable to update the treasury ledger.','تعذر تحديث دفتر الخزينة.'));}finally{setBusy('');}};
  const banks=[{id:'primary',label:t('Primary bank metadata','بيانات البنك الرئيسي'),currency:props.company.bank.currency||props.company.defaultCurrency},...(props.company.bankAccounts||[]).map(account=>({id:account.id,label:account.label||account.bankName||account.id,currency:account.currency}))];
  const unallocatedPayments=props.payments.filter(payment=>!treasuryLinkedSourceUsed(props.entries,'customer-payment',payment.id));
  const unallocatedSupplierPayments=props.supplierPayments.filter(payment=>!treasuryLinkedSourceUsed(props.entries,'supplier-payment',payment.id));

  React.useEffect(()=>{
    if(entryType==='collection'){
      const source=unallocatedPayments.find(item=>item.id===sourceId)??unallocatedPayments[0];setSourceId(source?.id||'');setEntryAmount(source?.amount||'');setReference(source?.reference||source?.invoiceNumber||'');setFromAccountId('');
      const target=activeAccounts.find(account=>account.currency===source?.currency);setToAccountId(target?.id||'');
    }else if(entryType==='supplier-payment'){
      const source=unallocatedSupplierPayments.find(item=>item.id===sourceId)??unallocatedSupplierPayments[0];setSourceId(source?.id||'');setEntryAmount(source?.amount||'');setReference(source?.reference||source?.purchaseNumber||'');setToAccountId('');
      const target=activeAccounts.find(account=>account.currency===source?.currency);setFromAccountId(target?.id||'');
    }else{setSourceId('');}
  },[entryType]);

  const addAccount=()=>void run('account',async()=>{
    const account=createTreasuryAccount({label:accountLabelValue,kind:accountKind,currency:accountCurrency,bankAccountId:accountKind==='bank'?bankAccountId:'',workspaceId:props.workspaceId,branchId:props.branchId});
    await props.onSaveAccount(account);
    if(openingBalance.trim()&&Number(openingBalance.replace(/,/g,''))!==0){const opening=createTreasuryEntry({type:'opening-balance',date:todayIso(),amount:openingBalance,currency:account.currency,toAccountId:account.id,reference:t('Opening balance','رصيد افتتاحي'),workspaceId:props.workspaceId,branchId:props.branchId},[...props.accounts,account]);await props.onSaveEntry(opening);}
    setAccountLabelValue('');setOpeningBalance('');setBankAccountId('');
  });

  const saveEntry=()=>void run('entry',async()=>{
    let currency='';let from=fromAccountId,to=toAccountId,sourceType:'manual'|'customer-payment'|'supplier-payment'='manual',source='';let amount=entryAmount;
    if(entryType==='collection'){
      const payment=props.payments.find(item=>item.id===sourceId);if(!payment)throw new Error(t('Choose an unallocated customer payment.','اختر دفعة عميل غير مخصصة.'));currency=payment.currency;amount=payment.amount;sourceType='customer-payment';source=payment.id;from='';
    }else if(entryType==='supplier-payment'){
      const payment=props.supplierPayments.find(item=>item.id===sourceId);if(!payment)throw new Error(t('Choose an unallocated supplier payment.','اختر دفعة مورد غير مخصصة.'));currency=payment.currency;amount=payment.amount;sourceType='supplier-payment';source=payment.id;to='';
    }else if(entryType==='transfer'){
      const a=props.accounts.find(item=>item.id===from),b=props.accounts.find(item=>item.id===to);if(!a||!b||a.currency!==b.currency)throw new Error(t('Transfers require two accounts in the same currency. Use a dated FX rate for currency conversion decisions.','التحويلات تتطلب حسابين بنفس العملة. استخدم سعر صرف مؤرخ لقرارات تحويل العملات.'));currency=a.currency;
    }else if(entryType==='reconciliation'){
      if(reconciliationDirection==='in'){from='';const account=props.accounts.find(item=>item.id===to);currency=account?.currency||'';}else{to='';const account=props.accounts.find(item=>item.id===from);currency=account?.currency||'';}
    }else if(entryType==='deposit'||entryType==='opening-balance'){
      from='';const account=props.accounts.find(item=>item.id===to);currency=account?.currency||'';
    }else{to='';const account=props.accounts.find(item=>item.id===from);currency=account?.currency||'';}
    const entry=createTreasuryEntry({type:entryType,date:entryDate,amount,currency,fromAccountId:from,toAccountId:to,sourceType,sourceId:source,reference,notes,workspaceId:props.workspaceId,branchId:props.branchId},props.accounts);await props.onSaveEntry(entry);setEntryAmount('');setReference('');setNotes('');setSourceId('');
  });

  const currentSourceCurrency=entryType==='collection'?props.payments.find(item=>item.id===sourceId)?.currency:entryType==='supplier-payment'?props.supplierPayments.find(item=>item.id===sourceId)?.currency:'';
  const accountOptions=(side:'from'|'to')=>activeAccounts.filter(account=>!currentSourceCurrency||account.currency===currentSourceCurrency).filter(account=>side==='from'||account.id!==fromAccountId);
  const activeEntries=[...props.entries].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));

  return <section className="ta-finance-page lx-treasury-page">
    <header className="ta-page-header"><div><span className="ta-page-kicker">{t('Cash & Bank','النقد والبنوك')}</span><h2>{t('Real treasury ledger','دفتر الخزينة الفعلي')}</h2><p>{t('Balances below come only from explicit ledger entries. Company bank metadata never creates a balance by itself.','الأرصدة أدناه ناتجة فقط عن قيود دفتر الخزينة الصريحة. بيانات البنك في إعدادات الشركة لا تنشئ رصيدًا بحد ذاتها.')}</p></div><div className="ta-page-actions"><span className="ta-period-chip">{t('No hidden FX · no invented balances','لا تحويل خفي · لا أرصدة مختلقة')}</span></div></header>

    <div className="ta-finance-kpis lx-treasury-kpis">{activeAccounts.length?activeAccounts.map(account=><article className="ta-finance-kpi" key={account.id}><span>{account.label}</span><strong>{formatMoney(treasuryAccountBalance(account.id,props.entries),account.currency)}</strong><small>{account.kind==='bank'?t('Bank ledger account','حساب دفتر بنكي'):t('Cash ledger account','حساب دفتر نقدي')} · {account.currency}</small></article>):<article className="ta-finance-kpi"><span>{t('Treasury accounts','حسابات الخزينة')}</span><strong>0</strong><small>{t('Create an account before recording cash position.','أنشئ حسابًا قبل تسجيل المركز النقدي.')}</small></article>}</div>

    <div className="ta-finance-grid">
      <article className="ta-finance-card"><header><div><span className="ta-page-kicker">{t('Ledger account','حساب الدفتر')}</span><h3>{t('Add cash or bank account','إضافة حساب نقدي أو بنكي')}</h3></div></header><div className="ta-form-grid"><label className="ta-field"><span>{t('Label','الاسم')}</span><Input value={accountLabelValue} onChange={(e:any)=>setAccountLabelValue(e.target.value)}/></label><label className="ta-field"><span>{t('Type','النوع')}</span><Select value={accountKind} onChange={(e:any)=>setAccountKind(e.target.value)}><option value="bank">{t('Bank','بنك')}</option><option value="cash">{t('Cash','نقد')}</option></Select></label><label className="ta-field"><span>{t('Currency','العملة')}</span><Input dir="ltr" maxLength={3} value={accountCurrency} onChange={(e:any)=>setAccountCurrency(e.target.value.toUpperCase())}/></label>{accountKind==='bank'?<label className="ta-field"><span>{t('Bank metadata link (optional)','ربط بيانات البنك (اختياري)')}</span><Select value={bankAccountId} onChange={(e:any)=>setBankAccountId(e.target.value)}><option value="">{t('No metadata link','بدون ربط')}</option>{banks.map(bank=><option key={bank.id} value={bank.id}>{bank.label} · {bank.currency}</option>)}</Select></label>:null}<label className="ta-field"><span>{t('Opening balance (optional)','الرصيد الافتتاحي (اختياري)')}</span><Input inputMode="decimal" value={openingBalance} onChange={(e:any)=>setOpeningBalance(e.target.value)}/></label></div><Button variant="primary" disabled={Boolean(busy)} onClick={addAccount}>{t('Create ledger account','إنشاء حساب دفتر')}</Button></article>

      <article className="ta-finance-card"><header><div><span className="ta-page-kicker">{t('New movement','حركة جديدة')}</span><h3>{t('Record treasury entry','تسجيل قيد خزينة')}</h3></div></header><div className="ta-form-grid"><label className="ta-field"><span>{t('Entry type','نوع القيد')}</span><Select value={entryType} onChange={(e:any)=>setEntryType(e.target.value)}><option value="deposit">{t('Deposit','إيداع')}</option><option value="withdrawal">{t('Withdrawal','سحب')}</option><option value="transfer">{t('Transfer','تحويل')}</option><option value="collection">{t('Customer collection','تحصيل عميل')}</option><option value="supplier-payment">{t('Supplier payment','دفعة مورد')}</option><option value="reconciliation">{t('Reconciliation','مطابقة/تسوية')}</option></Select></label><label className="ta-field"><span>{t('Date','التاريخ')}</span><Input type="date" value={entryDate} onChange={(e:any)=>setEntryDate(e.target.value)}/></label>
      {entryType==='collection'?<label className="ta-field"><span>{t('Customer payment','دفعة العميل')}</span><Select value={sourceId} onChange={(e:any)=>{const id=e.target.value,p=props.payments.find(item=>item.id===id);setSourceId(id);setEntryAmount(p?.amount||'');setReference(p?.reference||p?.invoiceNumber||'');setToAccountId(activeAccounts.find(a=>a.currency===p?.currency)?.id||'');}}><option value="">{t('Choose payment','اختر دفعة')}</option>{unallocatedPayments.map(item=><option key={item.id} value={item.id}>{item.invoiceNumber} · {formatMoney(item.amount,item.currency)}</option>)}</Select></label>:entryType==='supplier-payment'?<label className="ta-field"><span>{t('Supplier payment','دفعة المورد')}</span><Select value={sourceId} onChange={(e:any)=>{const id=e.target.value,p=props.supplierPayments.find(item=>item.id===id);setSourceId(id);setEntryAmount(p?.amount||'');setReference(p?.reference||p?.purchaseNumber||'');setFromAccountId(activeAccounts.find(a=>a.currency===p?.currency)?.id||'');}}><option value="">{t('Choose payment','اختر دفعة')}</option>{unallocatedSupplierPayments.map(item=><option key={item.id} value={item.id}>{item.purchaseNumber} · {formatMoney(item.amount,item.currency)}</option>)}</Select></label>:null}
      {(entryType==='withdrawal'||entryType==='supplier-payment'||entryType==='transfer'||(entryType==='reconciliation'&&reconciliationDirection==='out'))?<label className="ta-field"><span>{t('From account','من حساب')}</span><Select value={fromAccountId} onChange={(e:any)=>setFromAccountId(e.target.value)}><option value="">{t('Choose account','اختر حسابًا')}</option>{accountOptions('from').map(account=><option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</Select></label>:null}
      {(entryType==='deposit'||entryType==='collection'||entryType==='transfer'||(entryType==='reconciliation'&&reconciliationDirection==='in'))?<label className="ta-field"><span>{t('To account','إلى حساب')}</span><Select value={toAccountId} onChange={(e:any)=>setToAccountId(e.target.value)}><option value="">{t('Choose account','اختر حسابًا')}</option>{accountOptions('to').map(account=><option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</Select></label>:null}
      {entryType==='reconciliation'?<label className="ta-field"><span>{t('Adjustment direction','اتجاه التسوية')}</span><Select value={reconciliationDirection} onChange={(e:any)=>setReconciliationDirection(e.target.value)}><option value="in">{t('Increase account','زيادة الحساب')}</option><option value="out">{t('Decrease account','تخفيض الحساب')}</option></Select></label>:null}
      <label className="ta-field"><span>{t('Amount','المبلغ')}</span><Input inputMode="decimal" disabled={entryType==='collection'||entryType==='supplier-payment'} value={entryAmount} onChange={(e:any)=>setEntryAmount(e.target.value)}/></label><label className="ta-field"><span>{t('Reference','المرجع')}</span><Input value={reference} onChange={(e:any)=>setReference(e.target.value)}/></label><label className="ta-field"><span>{t('Notes','ملاحظات')}</span><Textarea rows={2} value={notes} onChange={(e:any)=>setNotes(e.target.value)}/></label></div><Button variant="primary" disabled={Boolean(busy)||!activeAccounts.length} onClick={saveEntry}>{t('Record entry','تسجيل القيد')}</Button></article>
    </div>

    {error?<p className="form-error" role="alert">{error}</p>:null}
    <article className="ta-finance-card"><header><div><span className="ta-page-kicker">{t('Reconciliation & audit','المطابقة والتدقيق')}</span><h3>{t('Treasury ledger history','سجل دفتر الخزينة')}</h3><p>{t('Entries are immutable financially. Corrections void the original record instead of rewriting history.','القيود غير قابلة للتعديل ماليًا. التصحيحات تلغي السجل الأصلي بدل إعادة كتابة التاريخ.')}</p></div></header>{activeEntries.length?<div className="ta-finance-list">{activeEntries.map(entry=>{const from=props.accounts.find(item=>item.id===entry.fromAccountId),to=props.accounts.find(item=>item.id===entry.toAccountId);return <div className={`ta-finance-row ${entry.voidedAt?'is-muted':''}`} key={entry.id}><div><strong>{entryLabel(entry.type)} · {formatMoney(entry.amount,entry.currency)}</strong><small>{entry.date}{entry.reference?` · ${entry.reference}`:''} · {entry.fromAccountId?accountLabel(from):t('External','خارجي')} → {entry.toAccountId?accountLabel(to):t('External','خارجي')}</small>{entry.voidedAt?<small>{t('Voided','ملغى')}: {entry.voidReason}</small>:entry.reconciledAt?<small>{t('Reconciled','تمت المطابقة')}</small>:null}</div><div className="ta-page-actions">{!entry.voidedAt?<Button disabled={Boolean(busy)} onClick={()=>void run(`rec-${entry.id}`,()=>props.onReconcileEntry(entry,!entry.reconciledAt))}>{entry.reconciledAt?t('Unreconcile','إلغاء المطابقة'):t('Reconcile','مطابقة')}</Button>:null}{!entry.voidedAt?<><Input aria-label={t('Void reason','سبب الإلغاء')} value={voidReason[entry.id]||''} onChange={(e:any)=>setVoidReason(value=>({...value,[entry.id]:e.target.value}))}/><Button variant="danger" disabled={Boolean(busy)||!(voidReason[entry.id]||'').trim()} onClick={()=>void run(`void-${entry.id}`,()=>props.onVoidEntry(entry,voidReason[entry.id]||''))}>{t('Void','إلغاء')}</Button></>:null}</div></div>})}</div>:<div className="ta-empty-state"><strong>{t('No ledger entries yet','لا توجد قيود بعد')}</strong><p>{t('Create an account and record an opening balance, deposit, withdrawal, transfer, collection or supplier payment.','أنشئ حسابًا وسجّل رصيدًا افتتاحيًا أو إيداعًا أو سحبًا أو تحويلًا أو تحصيلًا أو دفعة مورد.')}</p></div>}</article>
  </section>;
}
