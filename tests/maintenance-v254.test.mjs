import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v254 ships strict report and receivable date validation',async()=>{
  const [reports,receivables]=await Promise.all([
    read('src/lib/reports.ts'),
    read('src/lib/receivables.ts')
  ]);
  assert.match(reports,/import \{ isIsoDate, todayIso \} from '\.\/id\.js'/);
  assert.doesNotMatch(reports,/function validIsoDate/);
  assert.match(receivables,/!isIsoDate\(dueDate\)\|\|!isIsoDate\(today\)/);
  assert.match(receivables,/isIsoDate\(asOf\)&&isIsoDate\(doc\.issueDate\)/);
});

test('v254 keeps report filters truthful and accessible',async()=>{
  const [reportsPage,receivablesPage]=await Promise.all([
    read('src/components/ReportsPage.tsx'),
    read('src/components/ReceivablesPage.tsx')
  ]);
  assert.match(reportsPage,/currencies\.includes\(requestedCurrency\)/);
  assert.match(reportsPage,/aria-label=\{t\('Search customer performance'/);
  assert.match(reportsPage,/alt=\{companyDisplayName\(this\.props\.company\)\}/);
  assert.match(receivablesPage,/aria-label=\{t\('Filter customer accounts'/);
  assert.match(receivablesPage,/label=\{t\('Clear customer search'/);
});

test('v254 refreshes installed PWA clients with the maintenance runtime',async()=>{
  const [sourceWorker,builtWorker]=await Promise.all([read('public/sw.js'),read('dist/sw.js')]);
  const marker='lourex-invoice-v254: strict accounting-date and report-accessibility maintenance refresh';
  assert.ok(sourceWorker.includes(marker));
  assert.ok(builtWorker.includes(marker));
  for(const asset of ['./src/components/ReportsPage.js','./src/components/ReceivablesPage.js','./src/lib/reports.js','./src/lib/receivables.js'])assert.ok(builtWorker.includes(asset),asset);
});
