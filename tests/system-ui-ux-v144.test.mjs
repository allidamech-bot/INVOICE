import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('current application unifies documents, relationships, operations and finance without a parallel legacy stylesheet',async()=>{
  const [html,shell]=await Promise.all([read('index.html'),read('src/components/AppShell.tsx')]);
  assert.match(html,/product-os-v451\.css/);
  assert.match(html,/tailadmin-reliability-bridge-v320\.css/);
  assert.doesNotMatch(html,/system-ui-ux-v144\.css/);
  assert.equal((html.match(/product-os-v451\.css/g)||[]).length,1);
  for(const screen of ["'documents'","'customers'","'receivables'","'reports'","'items'","'operations'"]){
    assert.ok(shell.includes(screen),'canonical shell must expose '+screen);
  }
  assert.match(shell,/private navigate=/);
  assert.match(shell,/this\.props\.onNavigate\(screen\)/);
});

test('current TailAdmin product UX keeps app-only responsive, accessible and RTL-safe interaction layers',async()=>{
  const [detail,workspaces]=await Promise.all([
    read('src/styles/product-os-detail-v451.css'),
    read('src/styles/product-os-workspaces-v451.css')
  ]);
  assert.match(detail,/@media \(max-width:900px\)/);
  assert.match(detail,/min-height:44px/);
  assert.match(detail,/safe-area-inset-bottom/);
  assert.match(workspaces,/safe-area-inset-bottom/);
  assert.match(detail,/\[dir="rtl"\]/);
  assert.match(detail,/:focus-visible/);
  assert.match(detail,/prefers-reduced-motion:reduce/);
  assert.match(detail,/overscroll-behavior:contain/);
  assert.match(detail,/\.ta-settings-shell/);
  assert.match(detail,/\.ta-report-filterbar/);
});

test('financial workspaces preserve compact currency-scoped reporting and tabular scanning',async()=>{
  const [detail,ops,finance,reports]=await Promise.all([
    read('src/styles/product-os-detail-v451.css'),
    read('src/styles/tailadmin-operations-v320.css'),
    read('src/components/FinanceWorkspace.tsx'),
    read('src/components/ReportsPage.tsx')
  ]);
  assert.match(detail,/\.ta-table tbody tr:hover/);
  assert.match(ops,/font-variant-numeric:tabular-nums/);
  assert.match(finance,/DomainWorkspaceTabs/);
  assert.match(finance,/TreasuryLedgerPage/);
  assert.match(finance,/SupplierPayablesPage/);
  assert.match(reports,/ta-table/);
  assert.match(reports,/each currency kept separate/);
  assert.match(reports,/Profitability data is incomplete/);
});
