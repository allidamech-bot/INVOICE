from pathlib import Path

def rep(path,old,new):
 p=Path(path);s=p.read_text()
 if old not in s: raise SystemExit(f'missing {path}: {old[:80]}')
 p.write_text(s.replace(old,new,1))

p='src/components/ProductsInventoryWorkspace.tsx'
rep(p,"import type { ExpenseRecord, InventoryMovementRecord, PurchaseRecord, SavedItem, Supplier } from '../types.js';","import type { ExpenseRecord, InventoryMovementRecord, PurchaseRecord, SavedItem, Supplier, WarehouseRecord } from '../types.js';")
rep(p,"import { StockLocationsPage } from './StockLocationsPage.js';","import { WarehouseLocationsPage } from './WarehouseLocationsPage.js';")
rep(p,"suppliers:Supplier[];purchases:PurchaseRecord[];expenses:ExpenseRecord[];inventoryMovements:InventoryMovementRecord[];defaultCurrency:string;","suppliers:Supplier[];purchases:PurchaseRecord[];expenses:ExpenseRecord[];inventoryMovements:InventoryMovementRecord[];warehouses:WarehouseRecord[];workspaceId:string;branchId:string;defaultCurrency:string;")
rep(p,"description:t('Branch-scoped stock visibility','رؤية المخزون حسب الفرع')","description:t('Warehouses, balances & transfers','المستودعات والأرصدة والتحويلات')")
rep(p,"<StockLocationsPage items={props.items} inventoryMovements={props.inventoryMovements}/>","<WarehouseLocationsPage items={props.items} inventoryMovements={props.inventoryMovements} warehouses={props.warehouses} workspaceId={props.workspaceId} branchId={props.branchId}/>")

p='src/app/App.tsx'
rep(p,"const operationsProps={suppliers:vault.suppliers,purchases:vault.purchases,supplierPayments:vault.supplierPayments,expenses:vault.expenses,inventoryMovements:vault.inventoryMovements,items:vault.savedItems,defaultCurrency,recurringWorkflows:vault.recurringWorkflows","const operationsProps={suppliers:vault.suppliers,purchases:vault.purchases,supplierPayments:vault.supplierPayments,expenses:vault.expenses,inventoryMovements:vault.inventoryMovements,treasuryEntries:vault.treasuryEntries,treasuryReconciliations:vault.treasuryReconciliations,fxRates:vault.fxRates,warehouses:vault.warehouses,workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId,items:vault.savedItems,defaultCurrency,recurringWorkflows:vault.recurringWorkflows")
rep(p,"<ReportsPage company={vault.company} customers={vault.customers} documents={vault.documents} payments={vault.payments}/>","<ReportsPage company={vault.company} customers={vault.customers} documents={vault.documents} payments={vault.payments} suppliers={vault.suppliers} purchases={vault.purchases} items={vault.savedItems}/>")

p='index.html'
a='  <link rel="stylesheet" href="./styles/workspaces-batch15.css?v=467-1" data-lourex-workspaces-batch15="true" />'
rep(p,a,a+'\n  <link rel="stylesheet" href="./styles/roadmap-hardening-final.css?v=473-1" data-lourex-roadmap-hardening-final="true" />')
print('core wiring applied')
