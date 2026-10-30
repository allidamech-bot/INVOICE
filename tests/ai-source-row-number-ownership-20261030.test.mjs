import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExplicitQuoteTextEvidence} from '../api/_ai/source-lines.js';

const item=(sku,quantity,unitPrice,unit='CTN')=>({sku,quantity,unitPrice,unit});
const request=[
  'Currency: USD',
  'SKU A-1: Chocolate Qty 2 CTN Price 50 USD',
  'SKU B-2: Biscuits Qty 3 CTN Price 75 USD',
].join('\n');
const original=[item('A-1','2','50'),item('B-2','3','75')];

test('explicit row ownership preserves both source rows, quantities, prices and order',()=>{
  assert.equal(validateExplicitQuoteTextEvidence(request,original,'USD'),true);
  assert.equal(validateExplicitQuoteTextEvidence(request,[item('A-1','3','75'),item('B-2','2','50')],'USD'),false);
  assert.equal(validateExplicitQuoteTextEvidence(request,[item('A-1','2','75'),item('B-2','3','50')],'USD'),false);
  assert.equal(validateExplicitQuoteTextEvidence(request,[original[1],original[0]],'USD'),false);
  assert.equal(validateExplicitQuoteTextEvidence(request,[original[0]],'USD'),false);
  assert.equal(validateExplicitQuoteTextEvidence(request,[...original,item('C-3','1','1')],'USD'),false);
});

test('two product SKUs packed into one textual source segment are not trusted as independently owned rows',()=>{
  const merged='Currency: USD\nSKU A-1 Qty 2 Price 50 USD, SKU B-2 Qty 3 Price 75 USD';
  assert.equal(validateExplicitQuoteTextEvidence(merged,original,'USD'),false);
});

test('a later explicit SKU correction updates that SKU only; the latest unambiguous correction is authoritative',()=>{
  const source=request+'\nCorrection: SKU B-2 Price 80 USD\nCorrection: SKU B-2 Qty 4 CTN';
  assert.equal(validateExplicitQuoteTextEvidence(source,[item('A-1','2','50'),item('B-2','4','80')],'USD'),true);
  assert.equal(validateExplicitQuoteTextEvidence(source,[item('A-1','2','80'),item('B-2','4','75')],'USD'),false);
  assert.equal(validateExplicitQuoteTextEvidence(source,original,'USD'),false);
});

test('unbound correction and correction against repeated SKU rows fail closed',()=>{
  assert.equal(validateExplicitQuoteTextEvidence(request+'\nCorrection: Price 80 USD',original,'USD'),false);
  const repeated='Currency: USD\nSKU A-1 Qty 2 Price 50 USD\nSKU A-1 Qty 3 Price 60 USD\nCorrection: SKU A-1 Price 75 USD';
  assert.equal(validateExplicitQuoteTextEvidence(repeated,[item('A-1','2','50'),item('A-1','3','75')],'USD'),false);
});

test('textual currency and ambiguous amount separators are not reinterpreted',()=>{
  assert.equal(validateExplicitQuoteTextEvidence(request,original,'EUR'),false);
  assert.equal(validateExplicitQuoteTextEvidence(request+'\nCorrection: SKU B-2 Price 80 EUR',[original[0],item('B-2','3','80')],'USD'),false);
  assert.equal(validateExplicitQuoteTextEvidence('Currency: USD\nSKU A-1 Qty 2 Price 1,5 USD',[item('A-1','2','1.5')],'USD'),false);
  assert.equal(validateExplicitQuoteTextEvidence('Currency: USD\nSKU A-1 Qty 2 CTN Price 1,500.50 USD',[item('A-1','2','1500.50')],'USD'),true);
  assert.equal(validateExplicitQuoteTextEvidence('SKU A-1 Qty 2 Price 50',[item('A-1','2','50')],'USD'),false,'do not assume a money currency');
});

test('Arabic-script numerals and distinct repeated source rows retain exact numeric ownership',()=>{
  const text='Currency: USD\nSKU A-1 Qty ٢ CTN Price ١٢٫٥٠ USD\nSKU A-1 Qty ۳ CTN Price ２０ USD';
  assert.equal(validateExplicitQuoteTextEvidence(text,[item('A-1','2','12.5'),item('A-1','3','20')],'USD'),true);
  assert.equal(validateExplicitQuoteTextEvidence(text,[item('A-1','3','20'),item('A-1','2','12.5')],'USD'),false);
});

test('unstructured sources without provable SKU-based quantity rows do not gain invented price validation',()=>{
  assert.equal(validateExplicitQuoteTextEvidence('Customer request: please review attached handwritten PDF',[],''),true);
  assert.equal(validateExplicitQuoteTextEvidence('Currency: SAR\nCustomer request: review image',[], 'USD'),false);
});

test('unit is evidence-owned; selling price per carton cannot be relabeled as pieces or boxes',()=>{
  const text='Currency: USD\nSKU A-1 Qty 6 CTN Price 80 USD';
  assert.equal(validateExplicitQuoteTextEvidence(text,[item('A-1','6','80','Cartons')],'USD'),true);
  assert.equal(validateExplicitQuoteTextEvidence(text,[item('A-1','6','80','PCS')],'USD'),false);
  assert.equal(validateExplicitQuoteTextEvidence(text,[item('A-1','6','80','BOX')],'USD'),false);
  assert.equal(validateExplicitQuoteTextEvidence(text,[item('A-1','6','80','')],'USD'),false);
  assert.equal(validateExplicitQuoteTextEvidence(text,[item('A-1','6','80','CTN')],'USD'),true);
});

test('a missing source unit cannot become an invented order unit',()=>{
  const text='Currency: USD\nSKU A-1 Qty 2 Price 50 USD';
  assert.equal(validateExplicitQuoteTextEvidence(text,[item('A-1','2','50','PCS')],'USD'),false);
  assert.equal(validateExplicitQuoteTextEvidence(text,[item('A-1','2','50','')],'USD'),true);
});

test('quantity corrections cannot secretly change original order unit',()=>{
  const text='Currency: USD\nSKU A-1 Qty 2 CTN Price 50 USD\nCorrection: SKU A-1 Qty 3 PCS';
  assert.equal(validateExplicitQuoteTextEvidence(text,[item('A-1','3','50','CTN')],'USD'),false);
  const correct='Currency: USD\nSKU A-1 Qty 2 CTN Price 50 USD\nCorrection: SKU A-1 Qty 3 Cartons';
  assert.equal(validateExplicitQuoteTextEvidence(correct,[item('A-1','3','50','CTN')],'USD'),true);
});
