import type { CompanySettings, Customer, LourexDocument, PaymentRecord } from '../types.js';
import { displayDate, todayIso } from '../lib/id.js';
import { formatMoney } from '../lib/money.js';
import { getUiLanguage, isArabic, t } from '../lib/i18n.js';
import { customerReceivables, customerStatement, receivableCustomerId, receivablesByCurrency, type CustomerReceivableSummary } from '../lib/receivables.js';
import { invoicePaymentSummary } from '../lib/payments.js';
import { Button, Icon, IconButton, Input, Modal, Select } from './UI.js';
import { InvoicePaymentsPanel } from './InvoicePaymentsPanel.js';

type ReceivablesFilter='open'|'overdue'|'all';
interface Props{customers:Customer[];documents:LourexDocument[];payments:PaymentRecord[];company:CompanySettings;onSavePayment:(payment:PaymentRecord)=>Promise<void>;onDeletePayment:(payment:PaymentRecord)=>Promise<void>;}
interface State{query:string;filter:ReceivablesFilter;statementCustomerId:string;paymentInvoiceId:string;}

function accountSnapshot(account:CustomerReceivableSummary,documents:LourexDocument[]){return documents.find(doc=>receivableCustomerId(doc)===account.customerId)?.customerSnapshot;}
function customerName(account:CustomerReceivableSummary,documents:LourexDocument[]):string{
  if(account.customer)return (isArabic()?(account.customer.companyNameAr||account.customer.companyNameEn):(account.customer.companyNameEn||account.customer.companyNameAr)).trim();
  const snapshot=accountSnapshot(account,documents);
  const value=isArabic()?(snapshot?.companyNameAr||snapshot?.companyNameEn):(snapshot?.companyNameEn||snapshot?.companyNameAr);
  return (value||t('Deleted customer','عميل محذوف')).trim();
}
function customerSearchNames(account:CustomerReceivableSummary,documents:LourexDocument[]):string{
  const snapshot=accountSnapshot(account,documents);
  return [account.customer?.companyNameEn,account.customer?.companyNameAr,snapshot?.companyNameEn,snapshot?.companyNameAr,customerName(account,documents)].filter(Boolean).join(' ').toLowerCase();
}
function moneyList(rows:{currency:string;outstanding:string}[]):string{return rows.filter(row=>row.outstanding!=='0.00').map(row=>formatMoney(row.outstanding,row.currency)).join(' · ')||'—';}
function overdueList(rows:{currency:string;overdue:string}[]):string{return rows.filter(row=>row.overdue!=='0.00').map(row=>formatMoney(row.overdue,row.currency)).join(' · ')||'—';}

class CustomerStatementModal extends React.Component<{open:boolean;customerId:string;customers:Customer[];documents:LourexDocument[];payments:PaymentRecord[];company:CompanySettings;onClose:()=>void}>{
  componentDidMount():void{window.addEventListener('afterprint',this.afterPrint);}
  componentWillUnmount():void{window.removeEventListener('afterprint',this.afterPrint);document.body.classList.remove('printing-customer-statement');}
  private afterPrint=()=>document.body.classList.remove('printing-customer-statement');
  private print=()=>{document.body.classList.add('printing-customer-statement');window.setTimeout(()=>window.print(),40);};
  render():any{
    if(!this.props.open||!this.props.customerId)return null;
    const customer=this.props.customers.find(item=>item.id===this.props.customerId)??null;
    const fallback=this.props.documents.find(doc=>receivableCustomerId(doc)===this.props.customerId)?.customerSnapshot;
    const arabic=isArabic();
    const displayNameValue=arabic?(customer?.companyNameAr||customer?.companyNameEn||fallback?.companyNameAr||fallback?.companyNameEn):(customer?.companyNameEn||customer?.companyNameAr||fallback?.companyNameEn||fallback?.companyNameAr);
    const displayName=(displayNameValue||t('Customer','عميل')).trim();
    const addressValue=arabic?(customer?.addressAr||customer?.addressEn||fallback?.addressAr||fallback?.addressEn):(customer?.addressEn||customer?.addressAr||fallback?.addressEn||fallback?.addressAr);
    const address=[addressValue,customer?.city||fallback?.city,customer?.country||fallback?.country].filter(Boolean).join(', ');
    const contactEmail=customer?.email||fallback?.email||'';
    const contactPhone=customer?.phone||fallback?.phone||'';
    const statements=customerStatement(this.props.customerId,this.props.documents,this.props.payments);
    const companyName=(arabic?(this.props.company.nameAr||this.props.company.nameEn):(this.props.company.nameEn||this.props.company.nameAr)||'LOUREX').trim();
    return <Modal open={this.props.open} title={t('Customer Statement','كشف حساب العميل')} size="xl" onClose={this.props.onClose} footer={<div className="ta-modal-actions"><Button onClick={this.props.onClose}>{t('Close','إغلاق')}</Button><Button icon="printer" variant="primary" onClick={this.print}>{t('Print / Save PDF','طباعة / حفظ PDF')}</Button></div>}>
      <div className="customer-statement-print ta-statement-shell">
        <header className="statement-header ta-statement-header"><div className="statement-brand">{this.props.company.logoDataUrl?<img src={this.props.company.logoDataUrl} alt=""/>:null}<div><strong>{companyName}</strong><span>{t('Customer Statement','كشف حساب العميل')}</span></div></div><div className="statement-date"><span>{t('Statement date','تاريخ الكشف')}</span><strong>{displayDate(todayIso(),getUiLanguage())}</strong></div></header>
        <section className="statement-customer ta-statement-customer"><div><span>{t('Customer','العميل')}</span><strong>{displayName}</strong></div>{address?<small>{address}</small>:null}{contactEmail||contactPhone?<small>{[contactEmail,contactPhone].filter(Boolean).join(' · ')}</small>:null}</section>
        {statements.length?statements.map(section=><section className="statement-currency ta-statement-currency" key={section.currency}>
          <div className="statement-currency-heading"><h3>{section.currency}</h3><div><span>{t('Outstanding','المستحق')} <strong>{formatMoney(section.outstanding,section.currency)}</strong></span><span className={section.overdue!=='0.00'?'is-overdue':''}>{t('Overdue','المتأخر')} <strong>{formatMoney(section.overdue,section.currency)}</strong></span></div></div>
          <div className="statement-summary-grid"><div><span>{t('Billed','الفواتير')}</span><strong>{formatMoney(section.billed,section.currency)}</strong></div><div><span>{t('Credit Notes','الإشعارات الدائنة')}</span><strong>{formatMoney(section.credits,section.currency)}</strong></div><div><span>{t('Paid','المدفوع')}</span><strong>{formatMoney(section.paid,section.currency)}</strong></div><div><span>{t('Balance','الرصيد')}</span><strong>{formatMoney(section.outstanding,section.currency)}</strong></div></div>
          <div className="statement-table-wrap"><table className="statement-table"><thead><tr><th>{t('Date','التاريخ')}</th><th>{t('Reference','المرجع')}</th><th>{t('Type','النوع')}</th><th>{t('Debit','مدين')}</th><th>{t('Credit','دائن')}</th><th>{t('Balance','الرصيد')}</th></tr></thead><tbody>{section.entries.map((entry,index)=><tr key={`${entry.type}-${entry.reference}-${index}`}><td>{displayDate(entry.date,getUiLanguage())}</td><td><strong>{entry.reference}</strong>{entry.relatedInvoiceNumber!==entry.reference?<small>↳ {entry.relatedInvoiceNumber}</small>:null}</td><td>{entry.type==='invoice'?t('Invoice','فاتورة'):entry.type==='payment'?t('Payment','دفعة'):t('Credit Note','إشعار دائن')}</td><td>{entry.debit!=='0.00'?formatMoney(entry.debit,section.currency):'—'}</td><td>{entry.credit!=='0.00'?formatMoney(entry.credit,section.currency):'—'}</td><td><strong>{formatMoney(entry.balance,section.currency)}</strong></td></tr>)}</tbody></table></div>
        </section>):<div className="statement-empty">{t('No financial activity for this customer.','لا توجد حركة مالية لهذا العميل.')}</div>}
        <footer className="statement-footer">{t('This statement is generated from finalized invoices, active credit notes and recorded payments in LOUREX Invoice.','تم إنشاء هذا الكشف من الفواتير النهائية والإشعارات الدائنة الفعالة والمدفوعات المسجلة في LOUREX Invoice.')}</footer>
      </div>
    </Modal>;
  }
}

export class ReceivablesPage extends React.Component<Props,State>{
  state:State={query:'',filter:'open',statementCustomerId:'',paymentInvoiceId:''};
  componentDidMount():void{window.addEventListener('lourex-finance-payment-open',this.handlePaymentOpen as EventListener);window.addEventListener('lourex-finance-statement-open',this.handleStatementOpen as EventListener);}
  componentWillUnmount():void{window.removeEventListener('lourex-finance-payment-open',this.handlePaymentOpen as EventListener);window.removeEventListener('lourex-finance-statement-open',this.handleStatementOpen as EventListener);}
  private collectibleInvoices=(customerId='')=>this.props.documents.filter(doc=>doc.kind==='invoice'&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&(!customerId||receivableCustomerId(doc)===customerId)&&invoicePaymentSummary(doc,this.props.payments,undefined,this.props.documents).status!=='paid').sort((a,b)=>a.issueDate.localeCompare(b.issueDate)||a.number.localeCompare(b.number));
  private handlePaymentOpen=(event:Event)=>{const invoiceId=(event as CustomEvent<{invoiceId?:string}>).detail?.invoiceId||'';const candidate=this.collectibleInvoices().find(doc=>doc.id===invoiceId)||this.collectibleInvoices()[0];if(candidate)this.setState({paymentInvoiceId:candidate.id});};
  private handleStatementOpen=(event:Event)=>{const customerId=(event as CustomEvent<{customerId?:string}>).detail?.customerId||'';if(customerId)this.setState({statementCustomerId:customerId});};
  private filteredAccounts():CustomerReceivableSummary[]{
    const accounts=customerReceivables(this.props.customers,this.props.documents,this.props.payments);
    const q=this.state.query.trim().toLowerCase();
    return accounts.filter(account=>{
      const names=customerSearchNames(account,this.props.documents);
      const snapshot=account.customer?undefined:accountSnapshot(account,this.props.documents);
      const email=(account.customer?.email||snapshot?.email||'').toLowerCase();
      const phone=account.customer?.phone||snapshot?.phone||'';
      const matchesSearch=!q||names.includes(q)||email.includes(q)||phone.includes(q);
      if(!matchesSearch)return false;
      if(this.state.filter==='overdue')return account.hasOverdue;
      if(this.state.filter==='open')return account.openInvoices>0;
      return true;
    });
  }
  render():any{
    const currencies=receivablesByCurrency(this.props.documents,this.props.payments);
    const accounts=this.filteredAccounts();
    const allAccounts=customerReceivables(this.props.customers,this.props.documents,this.props.payments);
    const overdueAccounts=allAccounts.filter(account=>account.hasOverdue).length;
    const openAccounts=allAccounts.filter(account=>account.openInvoices>0).length;
    const paymentDocument=this.props.documents.find(doc=>doc.id===this.state.paymentInvoiceId)||null;
    return <section className="ta-finance-page ta-receivables-page">
      <header className="ta-page-header ta-finance-header">
        <div><span className="ta-page-kicker">{t('Finance','المالية')}</span><h1>{t('Receivables','المستحقات')}</h1><p>{t('Track open balances, overdue exposure, collections and customer statements without mixing currencies.','تابع الأرصدة المفتوحة والتأخير والتحصيل وكشوف العملاء دون خلط العملات.')}</p></div>
        <div className="ta-header-badges"><span><b>{openAccounts}</b>{t('Open accounts','حساب مفتوح')}</span><span className={overdueAccounts?'is-danger':''}><b>{overdueAccounts}</b>{t('Overdue','متأخر')}</span></div>
      </header>

      {currencies.length?<section className="ta-finance-kpi-grid" aria-label={t('Receivables by currency','المستحقات حسب العملة')}>
        {currencies.map(row=><article key={row.currency} className={`ta-finance-kpi ${row.overdueInvoices?'has-alert':''}`}>
          <div className="ta-finance-kpi-top"><span className="ta-finance-kpi-icon"><Icon name="invoice"/></span><span className={`ta-finance-status ${row.overdueInvoices?'danger':'ok'}`}>{row.overdueInvoices?`${row.overdueInvoices} ${t('overdue','متأخرة')}`:t('Current','جاري')}</span></div>
          <small>{row.currency} · {t('Outstanding','المستحق')}</small><strong>{formatMoney(row.outstanding,row.currency)}</strong>
          <div className="ta-finance-kpi-meta"><span>{t('Billed','الفواتير')} <b>{formatMoney(row.billed,row.currency)}</b></span><span>{t('Paid','المدفوع')} <b>{formatMoney(row.paid,row.currency)}</b></span><span>{t('Credits','الدائن')} <b>{formatMoney(row.credits,row.currency)}</b></span></div>
        </article>)}
      </section>:<section className="ta-empty-card"><span><Icon name="invoice"/></span><div><strong>{t('No finalized invoice receivables yet','لا توجد مستحقات لفواتير نهائية بعد')}</strong><p>{t('Finalized invoices will appear here automatically.','ستظهر الفواتير النهائية هنا تلقائيًا.')}</p></div></section>}

      {currencies.length?<section className="ta-panel ta-aging-panel">
        <header className="ta-panel-header"><div><span>{t('Aging','أعمار الذمم')}</span><h2>{t('Receivables Aging','تحليل أعمار المستحقات')}</h2></div><div className="ta-panel-status">{overdueAccounts} {t('customers overdue','عملاء لديهم تأخير')}</div></header>
        <div className="ta-table-wrap"><table className="ta-table ta-aging-table"><thead><tr><th>{t('Currency','العملة')}</th><th>{t('Current','جاري')}</th><th>1–30</th><th>31–60</th><th>61–90</th><th>+90</th><th>{t('Outstanding','المستحق')}</th></tr></thead><tbody>{currencies.map(row=><tr key={row.currency}><td><strong>{row.currency}</strong></td><td>{formatMoney(row.aging.current,row.currency)}</td><td className={row.aging.days1to30!=='0.00'?'is-warning':''}>{formatMoney(row.aging.days1to30,row.currency)}</td><td className={row.aging.days31to60!=='0.00'?'is-warning':''}>{formatMoney(row.aging.days31to60,row.currency)}</td><td className={row.aging.days61to90!=='0.00'?'is-danger':''}>{formatMoney(row.aging.days61to90,row.currency)}</td><td className={row.aging.days90plus!=='0.00'?'is-danger':''}>{formatMoney(row.aging.days90plus,row.currency)}</td><td><strong>{formatMoney(row.outstanding,row.currency)}</strong></td></tr>)}</tbody></table></div>
      </section>:null}

      <section className="ta-panel ta-account-register">
        <header className="ta-panel-header ta-account-register-header"><div><span>{t('Accounts receivable','الذمم المدينة')}</span><h2>{t('Customer Accounts','حسابات العملاء')}</h2><p>{t('Open statements, review balances and record collections from one register.','افتح كشوف الحساب وراجع الأرصدة وسجّل التحصيل من سجل واحد.')}</p></div><div className="ta-account-controls"><div className="ta-search-field"><Icon name="search"/><Input aria-label={t('Search customer accounts','بحث حسابات العملاء')} placeholder={t('Search customer','ابحث عن عميل')} value={this.state.query} onChange={(e:any)=>this.setState({query:e.target.value})}/>{this.state.query?<IconButton className="ta-search-clear" icon="x" label={t('Clear customer search','مسح بحث العملاء')} onClick={()=>this.setState({query:''})}/>:null}</div><Select aria-label={t('Filter customer accounts','تصفية حسابات العملاء')} value={this.state.filter} onChange={(e:any)=>this.setState({filter:e.target.value as ReceivablesFilter})}><option value="open">{t('Open balances','الأرصدة المفتوحة')}</option><option value="overdue">{t('Overdue only','المتأخرة فقط')}</option><option value="all">{t('All accounts','كل الحسابات')}</option></Select></div></header>
        {accounts.length?<div className="ta-account-list">{accounts.map(account=>{const name=customerName(account,this.props.documents);const collectible=this.collectibleInvoices(account.customerId);return <article className={`ta-account-row ${account.hasOverdue?'has-overdue':''}`} key={account.customerId}>
          <div className="ta-account-party"><span className="ta-avatar">{name.charAt(0).toUpperCase()||'C'}</span><div><strong>{name}</strong><small>{account.openInvoices} {t('open invoices','فواتير مفتوحة')}</small></div></div>
          <div className="ta-account-value"><span>{t('Outstanding','المستحق')}</span><strong>{moneyList(account.currencies)}</strong></div>
          <div className="ta-account-value"><span>{t('Overdue','المتأخر')}</span><strong className={account.hasOverdue?'is-danger':''}>{overdueList(account.currencies)}</strong></div>
          <div className="ta-account-actions">{collectible.length?<Button icon="invoice" variant="primary" onClick={()=>this.setState({paymentInvoiceId:collectible[0]!.id})}>{t('Record Payment','تسجيل دفعة')}</Button>:null}<Button icon="file" onClick={()=>this.setState({statementCustomerId:account.customerId})}>{t('Statement','كشف حساب')}</Button></div>
        </article>;})}</div>:<div className="ta-panel-empty"><span><Icon name="users"/></span><strong>{t('No matching accounts','لا توجد حسابات مطابقة')}</strong><p>{t('Try another filter or customer name.','جرّب فلترًا آخر أو اسم عميل مختلفًا.')}</p></div>}
      </section>

      <Modal open={Boolean(paymentDocument)} title={paymentDocument?t(`Collect ${paymentDocument.number}`,`تحصيل ${paymentDocument.number}`):t('Record Payment','تسجيل دفعة')} size="lg" onClose={()=>this.setState({paymentInvoiceId:''})}>{paymentDocument?<InvoicePaymentsPanel document={paymentDocument} documents={this.props.documents} payments={this.props.payments} onSave={this.props.onSavePayment} onDelete={this.props.onDeletePayment}/>:null}</Modal>
      <CustomerStatementModal open={Boolean(this.state.statementCustomerId)} customerId={this.state.statementCustomerId} customers={this.props.customers} documents={this.props.documents} payments={this.props.payments} company={this.props.company} onClose={()=>this.setState({statementCustomerId:''})}/>
    </section>;
  }
}
