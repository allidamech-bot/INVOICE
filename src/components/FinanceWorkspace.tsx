import type { CompanySettings, Customer, ExpenseRecord, FxRateRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, SavedItem, Supplier, SupplierPaymentRecord, TreasuryAccountRecord, TreasuryLedgerRecord, TreasuryReconciliationRecord } from '../types.js';
import { t } from '../lib/i18n.js';
import { confirmWorkspaceDeparture } from '../lib/workspace-dirty.js';
import { ReceivablesPage } from './ReceivablesPage.js';
import { SupplierPayablesPage } from './SupplierPayablesPage.js';
import { OperationsPage } from './OperationsPage.js';
import { TreasuryLedgerPage } from './TreasuryLedgerPage.js';
import { FxRatesPage } from './FxRatesPage.js';
import { DomainWorkspaceTabs } from './DomainWorkspaceTabs.js';

interface Props{
  customers:Customer[];documents:LourexDocument[];payments:PaymentRecord[];company:CompanySettings;
  suppliers:Supplier[];purchases:PurchaseRecord[];supplierPayments:SupplierPaymentRecord[];expenses:ExpenseRecord[];inventoryMovements:InventoryMovementRecord[];items:SavedItem[];defaultCurrency:string;
  treasuryAccounts:TreasuryAccountRecord[];treasuryEntries:TreasuryLedgerRecord[];treasuryReconciliations:TreasuryReconciliationRecord[];fxRates:FxRateRecord[];workspaceId:string;branchId:string;
  onSavePayment:(payment:PaymentRecord)=>Promise<void>;onDeletePayment:(payment:PaymentRecord)=>Promise<void>;
  onSaveSupplierPayment:(payment:SupplierPaymentRecord)=>Promise<void>;onDeleteSupplierPayment:(payment:SupplierPaymentRecord)=>Promise<void>;
  onSaveSupplier:(supplier:Supplier)=>Promise<void>;onDeleteSupplier:(supplier:Supplier)=>Promise<void>;
  onSavePurchase:(purchase:PurchaseRecord)=>Promise<void>;onDeletePurchase:(purchase:PurchaseRecord)=>Promise<void>;onPostPurchase:(purchase:PurchaseRecord)=>Promise<void>;onReversePurchase:(purchase:PurchaseRecord,reason:string)=>Promise<void>;
  onSaveExpense:(expense:ExpenseRecord)=>Promise<void>;onDeleteExpense:(expense:ExpenseRecord)=>Promise<void>;
  onSaveInventoryMovement:(movement:InventoryMovementRecord)=>Promise<void>;onDeleteInventoryMovement:(movement:InventoryMovementRecord)=>Promise<void>;
}
type Tab='treasury'|'fx'|'receivables'|'payables'|'expenses';

export function FinanceWorkspace(props:Props):any{
  const [tab,setTab]=React.useState<Tab>('treasury');
  const changeTab=(next:Tab)=>{if(next===tab)return;if(!confirmWorkspaceDeparture())return;setTab(next);};
  React.useEffect(()=>{
    const expense=()=>{if(!confirmWorkspaceDeparture())return;setTab('expenses');window.setTimeout(()=>window.dispatchEvent(new Event('lourex-open-expense-editor')),0);};
    const payment=(event:Event)=>{const detail=(event as CustomEvent).detail;if(!confirmWorkspaceDeparture())return;setTab('receivables');window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-finance-payment-open',{detail})),0);};
    const statement=(event:Event)=>{const detail=(event as CustomEvent).detail;if(!confirmWorkspaceDeparture())return;setTab('receivables');window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-finance-statement-open',{detail})),0);};
    const supplierPayables=(event:Event)=>{const detail=(event as CustomEvent).detail;if(!confirmWorkspaceDeparture())return;setTab('payables');window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-supplier-payables-open',{detail})),0);};
    window.addEventListener('lourex-create-expense',expense);window.addEventListener('lourex-finance-payment',payment as EventListener);window.addEventListener('lourex-finance-statement',statement as EventListener);window.addEventListener('lourex-finance-supplier-payables',supplierPayables as EventListener);
    return()=>{window.removeEventListener('lourex-create-expense',expense);window.removeEventListener('lourex-finance-payment',payment as EventListener);window.removeEventListener('lourex-finance-statement',statement as EventListener);window.removeEventListener('lourex-finance-supplier-payables',supplierPayables as EventListener);};
  },[]);
  return <section className="domain-workspace finance-workspace">
    <header className="ta-page-header lx-workspace-context lx-finance-context"><div><span className="ta-page-kicker">{t('Operational Finance','المالية التشغيلية')}</span><h1>{t('Cash & Bank, FX, receivables, payables & expenses','النقد والبنوك والعملات والمستحقات ومدفوعات الموردين والمصروفات')}</h1><p>{t('Treasury now uses a real ledger and reconciliation layer. FX rates are dated and source-labelled; operational balances remain in their canonical screens.','تستخدم الخزينة الآن دفترًا فعليًا وطبقة مطابقة. أسعار الصرف مؤرخة وموثقة بالمصدر، وتبقى الأرصدة التشغيلية في شاشاتها الأصلية.')}</p></div><div className="ta-page-actions"><span className="ta-period-chip">{t('Revenue ≠ collections ≠ cash position','الإيراد ≠ التحصيل ≠ المركز النقدي')}</span></div></header>
    <DomainWorkspaceTabs value={tab} onChange={changeTab} ariaLabel={t('Finance sections','أقسام المالية')} options={[
      {id:'treasury',label:t('Cash & Bank','النقد والبنوك'),description:t('Ledger movement & reconciliation','حركة الدفتر والمطابقة')},
      {id:'fx',label:t('FX','العملات'),description:t('Dated, source-labelled rates','أسعار مؤرخة مع مصدر')},
      {id:'receivables',label:t('Receivables','المستحقات'),description:t('Customer balances, collections & statements','أرصدة العملاء والتحصيل وكشوف الحساب')},
      {id:'payables',label:t('Supplier Payables','مستحقات الموردين'),description:t('Liabilities, aging, payments & supplier statements','الالتزامات والأعمار والمدفوعات وكشوف الموردين')},
      {id:'expenses',label:t('Expenses','المصروفات'),description:t('Operating expense records','سجلات المصروفات التشغيلية')}
    ]}/>
    {tab==='treasury'?<TreasuryLedgerPage payments={props.payments} supplierPayments={props.supplierPayments} expenses={props.expenses} treasuryAccounts={props.treasuryAccounts} treasuryEntries={props.treasuryEntries} treasuryReconciliations={props.treasuryReconciliations} company={props.company} workspaceId={props.workspaceId} branchId={props.branchId}/>:tab==='fx'?<FxRatesPage rates={props.fxRates} documents={props.documents} payments={props.payments} purchases={props.purchases} supplierPayments={props.supplierPayments} defaultCurrency={props.defaultCurrency}/>:tab==='receivables'?<ReceivablesPage customers={props.customers} documents={props.documents} payments={props.payments} company={props.company} onSavePayment={props.onSavePayment} onDeletePayment={props.onDeletePayment}/>:tab==='payables'?<SupplierPayablesPage suppliers={props.suppliers} purchases={props.purchases} supplierPayments={props.supplierPayments} company={props.company} onSaveSupplierPayment={props.onSaveSupplierPayment} onDeleteSupplierPayment={props.onDeleteSupplierPayment}/>:<OperationsPage mode="finance" suppliers={props.suppliers} purchases={props.purchases} expenses={props.expenses} inventoryMovements={props.inventoryMovements} items={props.items} defaultCurrency={props.defaultCurrency} onSaveSupplier={props.onSaveSupplier} onDeleteSupplier={props.onDeleteSupplier} onSavePurchase={props.onSavePurchase} onDeletePurchase={props.onDeletePurchase} onPostPurchase={props.onPostPurchase} onReversePurchase={props.onReversePurchase} onSaveExpense={props.onSaveExpense} onDeleteExpense={props.onDeleteExpense} onSaveInventoryMovement={props.onSaveInventoryMovement} onDeleteInventoryMovement={props.onDeleteInventoryMovement}/>} 
  </section>;
}
