import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('daily controller is deterministic and currency-separated',async()=>{
  const source=await read('src/lib/daily-brief.ts');
  for(const token of [
    'financialReportByCurrency',
    'purchaseAccountingIsValid',
    'expenseAccountingIsValid',
    'inventoryMovementAccountingIsValid',
    'operationsIntegritySummary',
    'purchaseTotals',
    "purchase.date!==today",
    "expense.date!==today",
    "movement.date===today",
    "row.currency",
    "moneyMap"
  ])assert.ok(source.includes(token),token);
  assert.ok(!source.includes('fetch('),'daily controller must not call AI or remote services');
  assert.ok(!source.includes('GEMINI'),'daily controller must not depend on Gemini');
});

test('daily controller exposes today activity, data quality and bounded comparison signals',async()=>{
  const source=await read('src/lib/daily-brief.ts');
  for(const field of [
    'issuedInvoices',
    'postedPurchases',
    'expenses',
    'inventoryMovements',
    'productsUsedToday',
    'dormantProducts',
    'missingCostItems',
    'invalidOperations',
    'draftPurchases',
    'changes'
  ])assert.ok(source.includes(field),field);
  assert.ok(source.includes('shiftIsoDate(today,-90)'),'dormant products use an explicit 90-day rule');
  assert.ok(source.includes('absolute*2n'),'notable changes use a deterministic 50% threshold');
  assert.ok(source.includes('changes.length>=4'),'comparison signals are bounded');
});

test('home receives scoped operational data and presents actionable daily exceptions',async()=>{
  const [home,app]=await Promise.all([read('src/components/WorkspaceHome.tsx'),read('src/app/App.tsx')]);
  for(const token of [
    'dailyBusinessBrief(documents,payments,purchases,expenses,inventoryMovements,items,today)',
    "className=\"ta-finance-dashboard\"",
    "t('Purchase drafts','مسودات المشتريات')",
    "t('Dormant products · 90+ days','أصناف خاملة · أكثر من 90 يوم')",
    "t('Incomplete accounting data','بيانات محاسبية غير مكتملة')",
    "t('Inventory health','حالة المخزون')",
    'LourexAdvisorCard','BusinessHealthCard'
  ])assert.ok(home.includes(token),token);
  for(const prop of ['purchases={vault.purchases}','expenses={vault.expenses}','inventoryMovements={vault.inventoryMovements}','items={vault.savedItems}'])assert.ok(app.includes(prop),prop);
  assert.ok(home.includes("onNavigate(daily.invalidOperations?'operations':'reports')"));
  assert.ok(home.includes('const attentionCount='));
  assert.ok(home.includes('daily.draftPurchases')&&home.includes('daily.dormantProducts')&&home.includes('daily.missingCostItems'));
  assert.ok(home.includes("t('No urgent issues','لا توجد أمور عاجلة')"),'empty state must not invent pending exceptions');
  assert.ok(!home.includes('LOUREX Daily Brief'),'no duplicate retired dashboard');
});

test('daily brief does not add navigation or mutate accounting records',async()=>{
  const [home,source]=await Promise.all([read('src/components/WorkspaceHome.tsx'),read('src/lib/daily-brief.ts')]);
  assert.ok(!source.includes('saveVault'));
  assert.ok(!source.includes('persist('));
  assert.ok(!source.includes('localStorage'));
  assert.ok(!source.includes('indexedDB'));
  assert.ok(!home.includes("onNavigate('daily"));
  assert.ok(!home.includes('DailyBriefPage'));
});
