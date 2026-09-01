import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v116 provides practical commercial presets with custom fallback preserved',async()=>{
  const [presets,ui]=await Promise.all([read('src/lib/workflow-presets.ts'),read('src/components/UI.tsx')]);
  for(const value of ['EXW','FOB','CIF','DAP','DDP'])assert.ok(presets.includes(`'${value}'`),value);
  for(const value of ['100% Advance','L/C at Sight','Net 30 Days','Cash on Delivery'])assert.ok(presets.includes(value),value);
  for(const value of ['Ready Stock','7 Days','30 Days','4–6 Weeks'])assert.ok(presets.includes(value),value);
  assert.match(ui,/Other \/ Custom/);
  assert.match(ui,/deliveryTimeChoices, incotermChoices, paymentTermChoices/);
});

test('v116 shared Field maps recurring customer and settings fields to presets',async()=>{
  const ui=await read('src/components/UI.tsx');
  assert.match(ui,/Default Currency','العملة الافتراضية/);
  assert.match(ui,/Bank Currency','عملة البنك/);
  assert.match(ui,/Country','الدولة/);
  assert.match(ui,/Default Incoterm','شرط التجارة الافتراضي/);
  assert.match(ui,/Payment Terms','شروط الدفع/);
  assert.match(ui,/Default Payment Terms','شروط الدفع الافتراضية/);
  assert.match(ui,/Delivery Time','مدة التسليم/);
  assert.match(ui,/Default Delivery Time','مدة التسليم الافتراضية/);
});

test('v116 target screens keep semantic labels that activate the shared choices',async()=>{
  const [customers,settings,editor]=await Promise.all([
    read('src/components/CustomersPage.tsx'),
    read('src/components/SettingsModal.tsx'),
    read('src/components/EditorPageCore.tsx')
  ]);
  assert.match(customers,/Field label=\{t\('Country','الدولة'\)\}/);
  for(const label of ['Bank Currency','Default Currency','Default Payment Terms','Default Incoterm','Default Delivery Time'])assert.ok(settings.includes(label),label);
  assert.match(editor,/Field label="Incoterm"/);
  assert.ok(editor.includes("t('Payment Terms','شروط الدفع')"));
  assert.ok(editor.includes("t('Delivery Time','مدة التسليم')"));
});

test('v116 product library slash shortcut now matches the visible shortcut hint',async()=>{
  const page=await read('src/components/SavedItemsPage.tsx');
  assert.match(page,/document\.addEventListener\('keydown',this\.handleKeyDown\)/);
  assert.match(page,/event\.key!=='\/'/);
  assert.match(page,/\.product-library-search input/);
  assert.match(page,/input\.focus\(\)/);
});

test('v116 preserves the established users icon geometry while changing field behavior',async()=>{
  const ui=await read('src/components/UI.tsx');
  assert.match(ui,/users:<g><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"\/>/);
  assert.doesNotMatch(ui,/users:<g><path d="M16 21v-2a4 4 0 0 1 4-4H6/);
});

test('v116 workflow preset module is available offline without changing cache compatibility',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/v116/);
  assert.match(sw,/\.\/src\/lib\/workflow-presets\.js/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v101'/);
});
