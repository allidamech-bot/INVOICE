import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v238 renders one active-language customer identity while indexing both stored names',async()=>{
  const page=await read('src/components/ReceivablesPage.tsx');
  assert.match(page,/function customerName\(account:CustomerReceivableSummary,documents:LourexDocument\[\]\):string/);
  assert.match(page,/isArabic\(\)\?\(account\.customer\.companyNameAr\|\|account\.customer\.companyNameEn\):\(account\.customer\.companyNameEn\|\|account\.customer\.companyNameAr\)/);
  assert.match(page,/function customerSearchNames\(account:CustomerReceivableSummary,documents:LourexDocument\[\]\):string/);
  assert.match(page,/account\.customer\?\.companyNameEn,account\.customer\?\.companyNameAr,snapshot\?\.companyNameEn,snapshot\?\.companyNameAr,customerName\(account,documents\)/);
  assert.match(page,/const names=customerSearchNames\(account,this\.props\.documents\)/);
  assert.match(page,/const matchesSearch=!q\|\|names\.includes\(q\)\|\|email\.includes\(q\)\|\|phone\.includes\(q\)/);
});

test('v238 keeps deleted-customer snapshots searchable in either language',async()=>{
  const page=await read('src/components/ReceivablesPage.tsx');
  assert.match(page,/const snapshot=accountSnapshot\(account,documents\)/);
  assert.match(page,/snapshot\?\.companyNameEn,snapshot\?\.companyNameAr/);
  assert.match(page,/const snapshot=account\.customer\?undefined:accountSnapshot\(account,this\.props\.documents\)/);
});

test('v238 refreshes installed clients for bilingual receivables search',async()=>{
  const pwa=await read('scripts/pwa-cache-v205.mjs');
  assert.match(pwa,/v238 keeps receivables search bilingual while rendering only the active-language customer identity/);
  assert.match(pwa,/lourex-invoice-v238: receivables bilingual search refresh/);
});
