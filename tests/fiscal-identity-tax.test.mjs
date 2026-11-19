import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFiscalIssuerIdentity,isSaudiVatNumber} from '../dist/src/lib/fiscal-issuer.js';
import {calculateFiscalTax} from '../dist/src/lib/fiscal-tax.js';

const scope={accountUid:'synthetic-owner',workspaceId:'synthetic-company'};
const issuer={...scope,issuerCountry:'SA',saRegime:'phase-2',legalName:'Synthetic QA',vatNumber:'300000000000003',effectiveFrom:'2026-01-01',profileVersion:1};
test('issuer identity binds verified account and company independently',()=>{
  assert.doesNotThrow(()=>assertFiscalIssuerIdentity(issuer,scope,'2026-11-18'));
  for(const expected of [{...scope,accountUid:'different'},{...scope,workspaceId:'different'}])
    assert.throws(()=>assertFiscalIssuerIdentity(issuer,expected,'2026-11-18'),/scope mismatch/);
});
test('issuer dates, profile revision and VAT shape are validated, without claiming registration verification',()=>{
  assert.equal(isSaudiVatNumber(issuer.vatNumber),true);
  for(const value of [null,123456789012345,'300000000000004','400000000000003','3 00000000000003'])
    assert.equal(isSaudiVatNumber(value),false);
  for(const patch of [{effectiveFrom:'2026-02-30'},{profileVersion:0},{issuerCountry:'sa'},{legalName:' '},{saRegime:'unknown'},{vatNumber:'123'}])
    assert.throws(()=>assertFiscalIssuerIdentity({...issuer,...patch},scope,'2026-11-18'));
  assert.throws(()=>assertFiscalIssuerIdentity(issuer,scope,'2025-12-31'));
  assert.doesNotThrow(()=>assertFiscalIssuerIdentity({...issuer,issuerCountry:'TR',saRegime:'out-of-scope',vatNumber:undefined},scope,'2026-11-18'));
});
const line=(patch={})=>({id:'line-1',quantity:'2',unitNetPrice:'50',category:'S',rate:'15',...patch});
const calc=(lines,adjustments)=>calculateFiscalTax({lines,adjustments});
test('standard Saudi VAT example remains exact',()=>{
  const out=calc([line()]);
  assert.equal(out.taxExclusiveTotal,'100.00');
  assert.equal(out.vatTotal,'15.00');
  assert.equal(out.taxInclusiveTotal,'115.00');
});
test('mixed VAT classifications do not tax zero-rated or exempt items at the standard rate',()=>{
  const out=calc([line(),line({id:'zero',category:'Z',rate:'0',reasonCode:'QA-ZERO'}),line({id:'exempt',category:'E',rate:'0',reasonCode:'QA-EXEMPT'})]);
  assert.equal(out.taxExclusiveTotal,'300.00');
  assert.equal(out.vatTotal,'15.00');
  assert.equal(out.breakdown.length,3);
});
test('discount and charge adjust only the explicitly classified category',()=>{
  const out=calc([line({allowance:'10.00'}),line({id:'zero',category:'Z',rate:'0',reasonCode:'QA-ZERO'})],[
    {kind:'allowance',amount:'10.00',category:'S',rate:'15'},
    {kind:'charge',amount:'20.00',category:'S',rate:'15'}
  ]);
  assert.equal(out.lineNetTotal,'190.00');
  assert.equal(out.documentAllowances,'10.00');
  assert.equal(out.documentCharges,'20.00');
  assert.equal(out.taxExclusiveTotal,'200.00');
  assert.equal(out.vatTotal,'15.00');
});
test('category-level rounding is not a sum of rounded line VAT',()=>{
  const out=calc([line({quantity:'1',unitNetPrice:'0.03'}),line({id:'line-2',quantity:'1',unitNetPrice:'0.03'})]);
  assert.deepEqual(out.lines.map(l=>l.vat),['0.00','0.00']);
  assert.equal(out.vatTotal,'0.01');
  assert.equal(out.taxInclusiveTotal,'0.07');
});
test('quantities and unit prices use exact six-decimal arithmetic',()=>{
  const out=calc([line({quantity:'0.125001',unitNetPrice:'80.000001'})]);
  assert.equal(out.taxExclusiveTotal,'10.00');
  assert.equal(out.vatTotal,'1.50');
});
test('invalid precision, IDs, categories, reasons and negative bases fail closed',()=>{
  for(const patch of [{quantity:'0'},{quantity:'-1'},{unitNetPrice:'1e2'},{unitNetPrice:'1.0000001'},{allowance:'100.01'},{category:'X'},{category:'Z',rate:'15'},{category:'Z',rate:'0'},{category:'S',rate:'0'},{rate:'101'},{id:''}])
    assert.throws(()=>calc([line(patch)]));
  assert.throws(()=>calc([line(),line()]));
  assert.throws(()=>calc([line()],[{kind:'allowance',amount:'100.01',category:'S',rate:'15'}]));
  assert.throws(()=>calc([line({category:'Z',rate:'0',reasonCode:'QA-ONE'}),line({id:'2',category:'Z',rate:'0',reasonCode:'QA-TWO'})]));
  assert.throws(()=>calc([]));
});
test('calculation does not mutate original document data',()=>{
  const input=Object.freeze({lines:Object.freeze([Object.freeze(line())])});
  assert.deepEqual(calculateFiscalTax(input),calculateFiscalTax(input));
  assert.equal(input.lines[0].unitNetPrice,'50');
});
