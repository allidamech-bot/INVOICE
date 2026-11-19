import test from 'node:test';
import assert from 'node:assert/strict';
import {fiscalVatPreview} from '../dist/src/lib/fiscal-vat-report.js';
const scope={accountUid:'qa',workspaceId:'company',vatNumber:'300000000000003'};
const row=(id,patch={})=>({...scope,id,documentNumber:id,counterpartyVat:'311111111111113',evidenceDigest:Buffer.from(id).toString('hex').padEnd(64,'0'),source:'sale',kind:'invoice',issueDate:'2026-11-01',taxDate:'2026-11-01',currency:'SAR',net:'100.00',vat:'15.00',deductibleVat:'0.00',review:'recognized',...patch});
const purchase=(id,patch={})=>row(id,{source:'purchase',deductibleVat:'12.00',...patch});
const report=entries=>fiscalVatPreview(scope,entries,'2026-11-01','2026-11-30');
test('recognized sale and partially deductible purchase reconcile exactly',()=>{
  const out=report([row('s'),purchase('p')]);
  assert.equal(out.outputVat,'15.00');assert.equal(out.inputVat,'15.00');assert.equal(out.deductibleVat,'12.00');assert.equal(out.nonDeductibleVat,'3.00');assert.equal(out.netVat,'3.00');assert.equal(out.readyForFiling,false);
});
test('pending and excluded purchases do not create tax deductions',()=>{
  const out=report([row('s'),purchase('p',{review:'pending',deductibleVat:'0.00'}),purchase('q',{review:'excluded',deductibleVat:'0.00'})]);
  assert.equal(out.pendingCount,1);assert.equal(out.excludedCount,1);assert.equal(out.netVat,'15.00');assert.equal(out.inputVat,'0.00');
  assert.throws(()=>report([purchase('p',{review:'pending'})]));
});
test('credit and debit corrections recognized in current period retain prior-period originals',()=>{
  const p=purchase('p',{issueDate:'2026-10-01',taxDate:'2026-10-01'});
  const out=report([p,purchase('credit',{kind:'credit-note',originalId:'p',net:'20.00',vat:'3.00',deductibleVat:'2.40'}),purchase('debit',{kind:'debit-note',originalId:'p',net:'10.00',vat:'1.50',deductibleVat:'1.20'})]);
  assert.equal(out.rows.length,2);assert.equal(out.inputVat,'-1.50');assert.equal(out.deductibleVat,'-1.20');assert.equal(out.netVat,'1.20');
});
test('mixed scope, foreign currency, duplicate evidence or supplier document rejected',()=>{
  for(const patch of [{workspaceId:'other'},{vatNumber:'311111111111113'},{currency:'USD'},{evidenceDigest:'bad'},{taxDate:'2026-02-30'}])assert.throws(()=>report([row('s',patch)]));
  assert.throws(()=>report([purchase('p'),purchase('q',{documentNumber:'p'})]));assert.throws(()=>report([row('s'),row('q',{evidenceDigest:row('s').evidenceDigest})]));
  assert.equal(report([purchase('p'),purchase('q',{documentNumber:'p',counterpartyVat:'322222222222223'})]).rows.length,2);
});
test('correction cannot exceed cumulative original VAT or deductible capacity',()=>{
  const p=purchase('p'),c=(id,patch={})=>purchase(id,{kind:'credit-note',originalId:'p',net:'60.00',vat:'9.00',deductibleVat:'7.20',...patch});
  assert.throws(()=>report([p,c('c1'),c('c2')]));
  assert.throws(()=>report([p,c('c1',{net:'100.00',vat:'15.00',deductibleVat:'13.00'})]));
  assert.throws(()=>report([p,c('c1',{net:'60.00',vat:'9.00',deductibleVat:'1.00'})]));
  assert.throws(()=>report([c('c1')]));
  assert.throws(()=>report([p,c('c1',{counterpartyVat:'322222222222223'})]));
});
test('no silent rounding, implicit deductions or mutable historical data',()=>{
  for(const patch of [{vat:'15.001'},{deductibleVat:'1.00'},{vat:'-1.00'},{net:'1e2'},{kind:'credit-note'}])assert.throws(()=>report([row('s',patch)]));
  const p=Object.freeze(purchase('p')),entries=Object.freeze([p]);const out=report(entries);out.rows[0].net='1.00';assert.equal(p.net,'100.00');assert.equal(out.netVat,'-12.00');
  assert.throws(()=>fiscalVatPreview(scope,[],'2026-12-01','2026-11-01'));
});
