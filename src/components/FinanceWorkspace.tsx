import type { CompanySettings, Customer, ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, SavedItem, Supplier } from '../types.js';
import { t } from '../lib/i18n.js';
import { ReceivablesPage } from './ReceivablesPage.js';
import { OperationsPage } from './OperationsPage.js';
import { DomainWorkspaceTabs } from './DomainWorkspaceTabs.js';

interface Props{
  customers:Customer[];documents:LourexDocument[];payments:PaymentRecord[];company:CompanySettings;
  suppliers:Supplier[];purchases:PurchaseRecord[];expenses:ExpenseRecord[];inventoryMovements:InventoryMovementRecord[];items:SavedItem[];defaultCurrency:string;
  onSaveSupplier:(supplier:Supplier)=>Promise<void>;onDeleteSupplier:(supplier:Supplier)=>Promise<void>;
  onSavePurchase:(purchase:PurchaseRecord)=>Promise<void>;onDeletePurchase:(purchase:PurchaseRecord)=>Promise<void>;onPostPurchase:(purchase:PurchaseRecord)=>Promise<void>;onReversePurchase:(purchase:PurchaseRecord,reason:string)=>Promise<void>;
  onSaveExpense:(expense:ExpenseRecord)=>Promise<void>;onDeleteExpense:(expense:ExpenseRecord)=>Promise<void>;
  onSaveInventoryMovement:(movement:InventoryMovementRecord)=>Promise<void>;onDeleteInventoryMovement:(movement:InventoryMovementRecord)=>Promise<void>;
}
type Tab='receivables'|'expenses';

export function FinanceWorkspace(props:Props):any{
  const [tab,setTab]=React.useState<Tab>('receivables');
  return <section className="domain-workspace finance-workspace">
    <DomainWorkspaceTabs value={tab} onChange={setTab} ariaLabel={t('Finance sections','أقسام المالية')} options={[
      {id:'receivables',label:t('Receivables & Collections','المستحقات والتحصيل'),description:t('Balances, aging & statements','الأرصدة والأعمار وكشوف الحساب')},
      {id:'expenses',label:t('Expenses','المصروفات'),description:t('Operating cash out','المصروفات التشغيلية')}
    ]}/>
    {tab==='receivables'?<ReceivablesPage customers={props.customers} documents={props.documents} payments={props.payments} company={props.company}/>:<OperationsPage mode="finance" suppliers={props.suppliers} purchases={props.purchases} expenses={props.expenses} inventoryMovements={props.inventoryMovements} items={props.items} defaultCurrency={props.defaultCurrency} onSaveSupplier={props.onSaveSupplier} onDeleteSupplier={props.onDeleteSupplier} onSavePurchase={props.onSavePurchase} onDeletePurchase={props.onDeletePurchase} onPostPurchase={props.onPostPurchase} onReversePurchase={props.onReversePurchase} onSaveExpense={props.onSaveExpense} onDeleteExpense={props.onDeleteExpense} onSaveInventoryMovement={props.onSaveInventoryMovement} onDeleteInventoryMovement={props.onDeleteInventoryMovement}/>} 
  </section>;
}
