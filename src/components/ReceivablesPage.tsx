import type { CompanySettings, Customer, LourexDocument, PaymentRecord } from '../types.js';
import { displayDate, todayIso } from '../lib/id.js';
import { formatMoney } from '../lib/money.js';
import { getUiLanguage, isArabic, t } from '../lib/i18n.js';
import { customerReceivables, customerStatement, receivableCustomerId, receivablesByCurrency, type CustomerReceivableSummary } from '../lib/receivables.js';
import { Button, Icon, IconButton, Input, Modal, Select } from './UI.js';

type ReceivablesFilter='open'|'overdue'|'all';
interface Props{customers:Customer[];documents:LourexDocument[];payments:PaymentRecord[];company:CompanySettings;}
interface State{query:string;filter:ReceivablesFilter;statementCustomerId:string;}

function accountSnapshot(account:CustomerReceivableSummary,documents:LourexDocument[]){return documents.find(doc=>receivableCustomerId(doc)===account.customerId)?.customerSnapshot;}
function customerName(account:CustomerReceivableSummary,documents:LourexDocument[]):string{
  if(account.customer)return (isArabic()?(account.customer.companyNameAr||account.customer.companyNameEn):(account.customer.companyNameEn||account.customer.companyNameAr)).trim();
  const snapshot=accountSnapshot(account,documents);
  const value=isArabic()?(snapshot?.companyNameAr||snapshot?.companyNameEn):(snapshot?.companyNameEn||snapshot?.companyNameAr);
  return (value||t('Deleted customer','عميل محذوف')).trim();
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
    return <Modal open={this.props.open} title={t('Customer Statement','كشف حساب العميل')} size="xl" onClose={this.props.onClose} footer={<div className="modal-footer-actions"><Button onClick={this.props.onClose}>{t('Close','إغلاق')}</Button><Button icon="printer" variant="primary" onClick={this.print}>{t('Print / Save PDF','طباعة / حفظ PDF')}</Button></div>}>
      <div className="customer-statement-print">
        <header className="statement-header"><div className="statement-brand">{this.props.company.logoDataUrl?<img src={this.props.company.logoDataUrl} alt=""/>:null}<div><strong>{companyName}</strong><span>{t('Customer Statement','كشف حساب العميل')}</span></div></div><div className="statement-date"><span>{t('Statement date','تاريخ الكشف')}</span><strong>{displayDate(todayIso(),getUiLanguage())}</strong></div></header>
        <section className="statement-customer"><div><span>{t('Customer','العميل')}</span><strong>{displayName}</strong></div>{address?<small>{address}</small>:null}{contactEmail||contactPhone?<small>{[contactEmail,contactPhone].filter(Boolean).join(' · ')}</small>:null}</section>
        {statements.length?statements.map(section=><section className="statement-currency" key={section.currency}>
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
  state:State={query:'',filter:'open',statementCustomerId:''};
  private filteredAccounts():CustomerReceivableSummary[]{
    const accounts=customerReceivables(this.props.customers,this.props.documents,this.props.payments);
    const q=this.state.query.trim().toLocaleLowerCase();
    return accounts.filter(account=>{
      const name=customerName(account,this.props.documents).toLocaleLowerCase();
      const snapshot=account.customer?undefined:accountSnapshot(account,this.props.documents);
      const email=(account.customer?.email||snapshot?.email||'').toLocaleLowerCase();
      const phone=account.customer?.phone||snapshot?.phone||'';
      const matchesSearch=!q||name.includes(q)||email.includes(q)||phone.includes(q);
      if(!matchesSearch)return false;
      if(this.state.filter==='overdue')return account.hasOverdue;
      if(this.state.filter==='open')return account.openInvoices>0;
      return true;
    });
  }
  render():any{
    const currencies=receivablesByCurrency(this.props.documents,this.props.payments);
    const accounts=this.filteredAccounts();
    const overdueAccounts=accounts.filter(account=>account.hasOverdue).length;
    return <section className="page receivables-page">
      <div className="page-heading receivables-heading"><div><p className="eyebrow">{t('Accounts receivable','الذمم المدينة')}</p><h1>{t('Receivables','المستحقات')}</h1><p className="page-subtitle">{t('See what is due, what is overdue, and each customer statement without mixing currencies.','تابع المستحق والمتأخر وكشف حساب كل عميل دون خلط العملات.')}</p></div></div>
      {currencies.length?<div className="receivable-currency-cards">{currencies.map(row=><article key={row.currency} className="receivable-currency-card"><div className="receivable-card-top"><strong>{row.currency}</strong>{row.overdueInvoices?<span className="aging-alert">{row.overdueInvoices} {t('overdue','متأخرة')}</span>:<span className="aging-ok">{t('Current','جاري')}</span>}</div><div className="receivable-primary"><span>{t('Outstanding','المستحق')}</span><strong>{formatMoney(row.outstanding,row.currency)}</strong></div><div className="receivable-card-stats"><span>{t('Billed','الفواتير')} <b>{formatMoney(row.billed,row.currency)}</b></span><span>{t('Credits','الدائن')} <b>{formatMoney(row.credits,row.currency)}</b></span><span>{t('Paid','المدفوع')} <b>{formatMoney(row.paid,row.currency)}</b></span><span className={row.overdue!=='0.00'?'is-overdue':''}>{t('Overdue','المتأخر')} <b>{formatMoney(row.overdue,row.currency)}</b></span></div></article>)}</div>:<div className="receivables-empty-summary"><Icon name="invoice" size={24}/><span>{t('No finalized invoice receivables yet.','لا توجد ذمم لفواتير نهائية بعد.')}</span></div>}
      {currencies.length?<section className="aging-panel"><div className="aging-panel-heading"><div><p className="eyebrow">{t('Aging','أعمار الذمم')}</p><h2>{t('Receivables Aging','تحليل أعمار المستحقات')}</h2></div><span>{overdueAccounts} {t('customers overdue','عملاء لديهم تأخير')}</span></div><div className="aging-table-wrap"><table className="aging-table"><thead><tr><th>{t('Currency','العملة')}</th><th>{t('Current','جاري')}</th><th>1–30</th><th>31–60</th><th>61–90</th><th>+90</th><th>{t('Outstanding','المستحق')}</th></tr></thead><tbody>{currencies.map(row=><tr key={row.currency}><td><strong>{row.currency}</strong></td><td>{formatMoney(row.aging.current,row.currency)}</td><td className={row.aging.days1to30!=='0.00'?'aging-warn':''}>{formatMoney(row.aging.days1to30,row.currency)}</td><td className={row.aging.days31to60!=='0.00'?'aging-warn':''}>{formatMoney(row.aging.days31to60,row.currency)}</td><td className={row.aging.days61to90!=='0.00'?'aging-danger':''}>{formatMoney(row.aging.days61to90,row.currency)}</td><td className={row.aging.days90plus!=='0.00'?'aging-danger':''}>{formatMoney(row.aging.days90plus,row.currency)}</td><td><strong>{formatMoney(row.outstanding,row.currency)}</strong></td></tr>)}</tbody></table></div></section>:null}
      <section className="receivable-accounts-panel"><div className="receivable-accounts-toolbar"><div><h2>{t('Customer Accounts','حسابات العملاء')}</h2><p>{t('Open a statement to see invoices, payments, credits and running balances.','افتح كشف الحساب لرؤية الفواتير والمدفوعات والإشعارات الدائنة والرصيد المتحرك.')}</p></div><div className="receivable-controls"><div className="search-box"><Icon name="search"/><Input aria-label={t('Search customer accounts','بحث حسابات العملاء')} placeholder={t('Search customer','ابحث عن عميل')} value={this.state.query} onChange={(e:any)=>this.setState({query:e.target.value})}/>{this.state.query?<IconButton icon="x" label={t('Clear','مسح')} onClick={()=>this.setState({query:''})}/>:null}</div><Select value={this.state.filter} onChange={(e:any)=>this.setState({filter:e.target.value as ReceivablesFilter})}><option value="open">{t('Open balances','الأرصدة المفتوحة')}</option><option value="overdue">{t('Overdue only','المتأخرة فقط')}</option><option value="all">{t('All accounts','كل الحسابات')}</option></Select></div></div>
        {accounts.length?<div className="receivable-account-list">{accounts.map(account=>{const name=customerName(account,this.props.documents);return <article className={`receivable-account-row ${account.hasOverdue?'has-overdue':''}`} key={account.customerId}><div className="receivable-account-main"><span className="customer-avatar">{name.charAt(0).toUpperCase()||'C'}</span><div><strong>{name}</strong><small>{account.openInvoices} {t('open invoices','فواتير مفتوحة')}</small></div></div><div className="receivable-account-amount"><span>{t('Outstanding','المستحق')}</span><strong>{moneyList(account.currencies)}</strong></div><div className="receivable-account-amount"><span>{t('Overdue','المتأخر')}</span><strong className={account.hasOverdue?'is-overdue':''}>{overdueList(account.currencies)}</strong></div><Button icon="file" onClick={()=>this.setState({statementCustomerId:account.customerId})}>{t('Statement','كشف حساب')}</Button></article>;})}</div>:<div className="empty-state receivable-empty"><Icon name="users" size={28}/><h2>{t('No matching accounts','لا توجد حسابات مطابقة')}</h2><p>{t('Try another filter or customer name.','جرّب فلترًا آخر أو اسم عميل مختلفًا.')}</p></div>}
      </section>
      <CustomerStatementModal open={Boolean(this.state.statementCustomerId)} customerId={this.state.statementCustomerId} customers={this.props.customers} documents={this.props.documents} payments={this.props.payments} company={this.props.company} onClose={()=>this.setState({statementCustomerId:''})}/>
    </section>;
  }
}
