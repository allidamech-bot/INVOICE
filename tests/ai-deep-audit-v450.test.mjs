import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeAiDate,normalizeAiDecimal} from '../api/_ai/normalization.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('AI numeric normalization preserves locale decimals without comma deletion corruption',()=>{
  assert.equal(normalizeAiDecimal('12,50'),'12.50');
  assert.equal(normalizeAiDecimal('1.234,50'),'1234.50');
  assert.equal(normalizeAiDecimal('1,234.50'),'1234.50');
  assert.equal(normalizeAiDecimal('١٢٫٥٠'),'12.50');
  assert.equal(normalizeAiDecimal('۱۲٫۵۰'),'12.50');
  assert.equal(normalizeAiDecimal('1,234'),'','a lone three-digit comma group is intentionally ambiguous');
  assert.equal(normalizeAiDecimal('1,234,567'),'1234567');
  assert.equal(normalizeAiDecimal('12.345.678'),'12345678');
  assert.equal(normalizeAiDecimal('USD 12.50'),'');
});

test('AI date normalization rejects impossible calendar dates',()=>{
  assert.equal(normalizeAiDate('2026-02-28'),'2026-02-28');
  assert.equal(normalizeAiDate('٢٠٢٨-٠٢-٢٩'),'2028-02-29');
  assert.equal(normalizeAiDate('2026-02-30'),'');
  assert.equal(normalizeAiDate('2026-13-01'),'');
});

test('financial extraction endpoints share strict decimal normalization',async()=>{
  for(const path of ['api/quote-source-ai.js','api/product-source-ai.js','api/supplier-document-ai.js']){
    const source=await read(path);
    assert.match(source,/normalizeAiDecimal/);
    assert.doesNotMatch(source,/cleanMoney\([^)]*\)\{[^}]*replace\(\/,\/g,''\)/s);
    assert.match(source,/dot decimal separator and no thousands separators/);
  }
  assert.match(await read('api/supplier-document-ai.js'),/normalizeAiDate/);
  assert.match(await read('api/quote-pricing-intent.js'),/normalizeAiDecimal/);
});

test('Accounting Guardian keeps the 25 percent discount threshold exact instead of rounding 24.x up',async()=>{
  const source=await read('src/lib/accounting-guardian.ts');
  assert.match(source,/const PERCENT_SCALE=4/);
  assert.match(source,/EXTREME_DISCOUNT_PERCENT=25n\*10_000n/);
  assert.match(source,/decimalToScaled\(doc\.adjustments\.discountValue,PERCENT_SCALE\)/);
});

test('business search refuses ambiguous product/customer identity and uses calendar-safe month windows',async()=>{
  const source=await read('src/lib/business-search-ai.ts');
  assert.match(source,/import \{ todayIso \} from '\.\/id\.js'/);
  assert.match(source,/first\.score-second\.score>=3/);
  assert.match(source,/No product identity was guessed when the query was ambiguous/);
  assert.match(source,/No customer identity was guessed when the query was ambiguous/);
  assert.match(source,/new Date\(Date\.UTC\(targetYear,targetMonth,0\)\)\.getUTCDate\(\)/);
  assert.match(source,/EASTERN_ARABIC|۰۱۲۳۴۵۶۷۸۹/);
});

test('daily command center can surface more than one urgent collection customer',async()=>{
  const source=await read('src/lib/daily-command-center.ts');
  assert.match(source,/buildCollectionTasks\(vault\)\.filter\(task=>task\.priority!=='normal'\)\.slice\(0,2\)/);
  assert.match(source,/for\(const collection of collections\)/);
  assert.match(source,/EASTERN_ARABIC_DIGITS|۰۱۲۳۴۵۶۷۸۹/);
});

test('collections exposure stays decimal-safe instead of using JavaScript Number',async()=>{
  const source=await read('src/lib/collections-workflow.ts');
  assert.match(source,/function positiveMoney\(value:string\)/);
  assert.match(source,/decimalToScaled\(value,2\)>0n/);
  assert.doesNotMatch(source,/Number\(currency\.outstanding\)/);
  assert.doesNotMatch(source,/Number\(row\.remaining\)/);
});

test('customer and supplier duplicate matching canonicalizes Arabic and Persian digits',async()=>{
  for(const path of ['src/lib/customer-ai-capture.ts','src/lib/supplier-ai-capture.ts']){
    const source=await read(path);
    assert.match(source,/ARABIC_DIGITS='٠١٢٣٤٥٦٧٨٩'/);
    assert.match(source,/EASTERN_ARABIC_DIGITS='۰۱۲۳۴۵۶۷۸۹'/);
    assert.match(source,/latinDigits\(value\)\.replace\(\/\\D\/g,''\)/);
  }
  const quote=await read('src/lib/quote-ai-review.ts');
  assert.match(quote,/EASTERN_ARABIC_DIGITS='۰۱۲۳۴۵۶۷۸۹'/);
  assert.match(quote,/replace\(\/\[\\u0640\\u064b-\\u065f\\u0670\]\/g,''\)/);
});

test('Business Memory follows active quote-to-invoice lifecycle including proforma invoices',async()=>{
  const source=await read('src/lib/business-memory.ts');
  assert.match(source,/doc\.kind==='invoice'&&doc\.lifecycleStatus!=='voided'&&doc\.convertedFromId/);
  assert.match(source,/\['proforma','proforma-invoice'\]\.includes\(doc\.kind\)/);
  assert.match(source,/no active linked invoice/);
});

test('Procurement AI never fuzzy-merges incoming explicit identifiers and is order-stabilized',async()=>{
  const source=await read('src/lib/procurement-ai.ts');
  assert.match(source,/if\(incomingExplicit\)return\{key:identity\.key/);
  assert.match(source,/Process explicit item\/SKU identities first/);
  assert.match(source,/best\.score-secondScore>=\.08/);
});

test('Universal AI Inbox supports safe cancellation instead of trapping mobile users',async()=>{
  const source=await read('src/components/AiWorkflowTools.tsx');
  assert.match(source,/private cancelAnalysis=/);
  assert.match(source,/status:'cancelled',note:t\('Cancelled by user','ألغاه المستخدم'\)/);
  assert.match(source,/if\(this\.state\.stage==='saving'\)return/);
  assert.match(source,/Cancel analysis','إلغاء التحليل/);
  assert.match(source,/\?\.name==='AbortError'/);
});

test('secondary AI workflow voice path preserves interim Safari speech and manual-stop abort semantics',async()=>{
  const source=await read('src/components/AiWorkflowTools.tsx');
  assert.match(source,/recognition\.interimResults=true/);
  assert.match(source,/this\.voiceManualStop&&\(code==='aborted'\|\|code==='no-speech'\)/);
  assert.match(source,/this\.voiceTranscript=text;this\.applyVoiceTranscript\(\)/);
  assert.match(source,/this\.voiceStopTimer=window\.setTimeout/);
  assert.match(source,/Safari could not reach the speech-recognition service/);
});

test('Customer and Product AI review modals can cancel analysis but keep saving protected',async()=>{
  const customer=await read('src/components/CustomerAiCapture.tsx');
  const product=await read('src/components/ProductAiSourceReview.tsx');
  assert.match(customer,/private close=\(\)=>\{this\.cancel\(\);this\.setState\(\{open:false,stage:'idle'\}\);\}/);
  assert.match(customer,/Cancel analysis','إلغاء التحليل/);
  assert.match(product,/if\(this\.state\.stage==='saving'\)return/);
  assert.match(product,/this\.abort\?\.abort\(\)/);
  assert.match(product,/Cancel analysis','إلغاء التحليل/);
});
