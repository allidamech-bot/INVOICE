import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v237 report customer and company identities follow the active UI language with fallback',async()=>{
  const page=await read('src/components/ReportsPage.tsx');
  assert.match(page,/function customerDisplay\(row:CustomerPerformanceRow,customers:Customer\[\]\):string/);
  assert.match(page,/getUiLanguage\(\)==='ar'\?\(customer\.companyNameAr\|\|customer\.companyNameEn\):\(customer\.companyNameEn\|\|customer\.companyNameAr\)/);
  assert.match(page,/function companyDisplayName\(company:CompanySettings\):string/);
  assert.match(page,/getUiLanguage\(\)==='ar'\?\(company\.nameAr\|\|company\.nameEn\):\(company\.nameEn\|\|company\.nameAr\)/);
  assert.match(page,/customerDisplay\(row,this\.props\.customers\)/);
  assert.match(page,/companyDisplayName\(this\.props\.company\)/);
});

test('v237 customer search stays bilingual without rendering both names at once',async()=>{
  const page=await read('src/components/ReportsPage.tsx');
  assert.match(page,/function customerSearchText\(row:CustomerPerformanceRow,customers:Customer\[\]\):string/);
  assert.match(page,/customer\?\.companyNameEn,customer\?\.companyNameAr/);
  assert.match(page,/customerSearchText\(row,this\.props\.customers\)\.includes\(query\)/);
});

test('v237 CSV headers names and boolean values use the active UI language',async()=>{
  const page=await read('src/components/ReportsPage.tsx');
  for(const pair of [
    "t('Currency','العملة')",
    "t('Customer','العميل')",
    "t('Net Sales','صافي المبيعات')",
    "t('Gross Profit','الربح الإجمالي')",
    "t('Profit Complete','اكتمال الربحية')",
    "t('Yes','نعم')",
    "t('No','لا')"
  ])assert.ok(page.includes(pair),pair);
  assert.match(page,/rows\.map\(row=>\[row\.currency,customerDisplay\(row,this\.props\.customers\)/);
  assert.doesNotMatch(page,/rows\.map\(row=>\[row\.currency,row\.customerName/);
});

test('v237 refreshes installed clients for report locale purity',async()=>{
  const pwa=await read('scripts/pwa-cache-v205.mjs');
  assert.match(pwa,/v237 keeps financial report identities and CSV exports in the active UI language/);
  assert.match(pwa,/lourex-invoice-v237: reports locale purity refresh/);
});
