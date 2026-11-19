import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSpecialFiscalContext as resolve} from '../api/_fiscal/special-fiscal-context.js';
const input={uuid:'11111111-1111-4111-8111-111111111111',mode:'standard',kind:'invoice',currency:'SAR',issueDate:'2026-11-18',supplyDate:'2026-11-01',seller:{vatNumber:'300000000000003'},buyer:{name:'synthetic buyer',vatNumber:'311111111111113',country:'SA'},lines:[{category:'S',rate:'15'}]};
const digest='a'.repeat(64),ctx=(o={})=>({uuid:input.uuid,...o});
const summary={start:input.supplyDate,end:input.issueDate,evidenceDigest:digest},agency={kind:'third-party',approvalDigest:digest,agreementDigest:digest,issuerRef:'synthetic-agent'};
test('ordinary and export flags remain unchanged; summary and agency flags use official positions',()=>{
  assert.equal(resolve(input).subtype,'0100000');assert.equal(resolve(input,undefined,'VATEX-SA-32').subtype,'0100100');assert.equal(resolve(input,ctx({summary})).subtype,'0100010');assert.equal(resolve({...input,mode:'simplified'},ctx({summary})).subtype,'0200010');
  assert.equal(resolve(input,ctx({agency})).subtype,'0110000');assert.equal(resolve(input,ctx({agency:{...agency,kind:'self-billed'}})).subtype,'0100001');assert.equal(resolve(input,ctx({summary,agency})).subtype,'0110010');
});
test('summary and agency require evidence, valid dates and eligible parties',()=>{
  for(const patch of [{start:'2026-10-01'},{end:'2026-11-19'},{end:'2026-10-31'},{end:'2026-11-31'},{evidenceDigest:'bad'}])assert.throws(()=>resolve(input,ctx({summary:{...summary,...patch}})));
  for(const patch of [{approvalDigest:'bad'},{agreementDigest:undefined},{issuerRef:'/'},{kind:'nominal'}])assert.throws(()=>resolve(input,ctx({agency:{...agency,...patch}})));
  assert.throws(()=>resolve({...input,buyer:null},ctx({summary})));assert.throws(()=>resolve({...input,kind:'credit-note'},ctx({summary})));assert.throws(()=>resolve(input,ctx({summary}),'VATEX-SA-32'));assert.throws(()=>resolve({...input,mode:'simplified'},ctx({agency:{...agency,kind:'self-billed'}})));
});
test('all additional zero-rate classes require explicit matching evidence',()=>{
  for(const reasonCode of ['VATEX-SA-34-1','VATEX-SA-34-2','VATEX-SA-34-3','VATEX-SA-34-4','VATEX-SA-34-5','VATEX-SA-MLTRY']){
    const q={...input,lines:[{reasonCode,category:'Z',rate:'0'}]};assert.throws(()=>resolve(q));assert.deepEqual(resolve(q,ctx({exemptions:[{reasonCode,evidenceDigest:digest}]})).exemptionCodes,[reasonCode]);assert.throws(()=>resolve(q,ctx({exemptions:[{reasonCode,evidenceDigest:'bad'}]})));
  }
  assert.throws(()=>resolve(input,ctx({exemptions:[{reasonCode:'VATEX-SA-34-1',evidenceDigest:digest}]})));
});
test('citizen exemptions require named Saudi national ID, never a fabricated VAT number',()=>{
  for(const reasonCode of ['VATEX-SA-EDU','VATEX-SA-HEA']){
    const q={...input,mode:'simplified',buyer:{country:'SA',name:'Synthetic Citizen',nationalId:'1000000000'},lines:[{category:'Z',rate:'0',reasonCode}]},context=ctx({exemptions:[{reasonCode,evidenceDigest:digest}]});assert.equal(resolve(q,context).citizen,true);
    for(const patch of [{nationalId:'2000000000'},{nationalId:'bad'},{name:' '},{country:'TR'},{vatNumber:'300000000000003'}])assert.throws(()=>resolve({...q,buyer:{...q.buyer,...patch}},context));
  }
});
