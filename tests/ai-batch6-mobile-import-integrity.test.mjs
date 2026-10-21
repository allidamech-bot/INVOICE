import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const supplier=read('src/components/SupplierAiProposalReview.tsx');
const product=read('src/components/ProductAiSourceReview.tsx');
const css=read('src/styles/ai-conversation-workspace.css');

test('AI supplier extracted field review remains complete on desktop and labelled on mobile',()=>{
  assert.match(supplier,/product-import-table-wrap lxw-ai-supplier-review/);
  assert.match(supplier,/data-label=\{t\('Field','الحقل'\)\}/);
  assert.match(supplier,/data-label=\{t\('Extracted value','القيمة المستخرجة'\)\}/);
  assert.match(supplier,/data-label=\{t\('Confidence','الثقة'\)\}/);
  assert.match(supplier,/data-label=\{t\('Source','المصدر'\)\}/);
  assert.match(supplier,/supplierAiFieldLabel\(key as any,isArabic\(\)\)/);
  assert.match(supplier,/field\.value/);
  assert.match(supplier,/field\.sourceExcerpt/);
  assert.match(supplier,/field\.sourceFile/);
  assert.match(supplier,/field\.sourcePage/);
  assert.match(supplier,/findSupplierDuplicateCandidates/);
  assert.match(supplier,/this\.state\.choice==='new'/);
  assert.match(supplier,/validateSupplier\(candidate\)/);
  assert.match(supplier,/this\.state\.currencyOverride/);
});

test('AI extracted product review preserves all diffs, source currencies and explicit selection guard',()=>{
  assert.match(product,/product-import-table-wrap lxw-ai-product-review/);
  for(const label of [
    "t('Select','تحديد')","t('Classification','التصنيف')",
    "t('Product','الصنف')","t('Match / confidence','المطابقة / الثقة')",
    "t('Commercial','تجاري')","t('Changes','التغييرات')"
  ])assert.ok(product.includes('data-label={'+label+'}'),'missing accessible mobile label: '+label);
  assert.match(product,/data-label="SKU"/);
  assert.match(product,/disabled=\{blocked\} checked=\{Boolean\(this\.state\.selected\[index\]\)\}/);
  assert.match(product,/review\.diff\.map\(diff=>/,'every diff must remain visible');
  assert.doesNotMatch(product,/review\.diff\.slice\(0,8\)/,'silent change omissions forbidden');
  assert.match(product,/row\.saleCurrency\|\|draft\.sourceCurrency\|\|t\('currency missing'/);
  assert.match(product,/row\.costCurrency\|\|draft\.sourceCurrency\|\|t\('currency missing'/);
  assert.match(product,/review\.classification==='duplicate-candidate'\|\|review\.classification==='needs-review'/);
  assert.match(product,/mutateVaultSafely\(vault=>\{/);
   assert.match(product,/return applyDraft\(vault,draft,this\.state\.selected,fresh\)/);
  assert.match(product,/selectedCount/);
});

test('Phone stylesheet affects only the two AI import review tables, not global site tables',()=>{
  const fragment=css.slice(css.indexOf('Batch 6 QA — compact extracted'));
  assert.ok(fragment.startsWith('Batch 6 QA — compact extracted'));
  assert.match(fragment,/@media \(max-width:720px\)/);
  assert.match(fragment,/\.modal\.modal-assistant\[role='dialog'\]/);
  assert.match(fragment,/\.lxw-ai-supplier-review/);
  assert.match(fragment,/\.lxw-ai-product-review/);
  assert.match(fragment,/content:attr\(data-label\)/);
  assert.match(fragment,/overflow-wrap:anywhere/);
  assert.match(fragment,/font-size:14px/);
  assert.match(fragment,/min-height:44px/);
  assert.doesNotMatch(fragment,/\.app-ui\s+\.product-import-table-wrap/);
  assert.doesNotMatch(fragment,/\.modal:not\(\.modal-assistant\)/);
});

test('AI visual improvements do not change model data or bypass approval workflows',()=>{
  assert.match(supplier,/supplierFromAiProposal\(proposal,existing\)/);
  assert.match(supplier,/if\(errors\.length\)throw new Error/);
  assert.match(product,/this\.state\.stage==='review'&&draft/);
  assert.match(product,/this\.state\.selected\.filter\(Boolean\)\.length/);
  assert.match(product,/this\.state\.stage==='saving'/);
  assert.match(product,/checked=\{Boolean\(this\.state\.selected\[index\]\)\}/);
});
