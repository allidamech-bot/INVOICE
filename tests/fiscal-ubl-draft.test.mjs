import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDomesticStandardInvoiceCandidate,buildDomesticFiscalCandidate,buildFiscalCandidate} from '../api/_fiscal/ubl-draft.js';
import {FIRST_PREVIOUS_INVOICE_HASH} from '../dist/src/lib/fiscal-issuance.js';

const party={country:'SA',vatNumber:'300000000000003',crn:'1000000000',building:'1234',postal:'12345',street:'شارع اختبار',district:'حي اختبار',city:'الرياض',name:'شركة & اختبار'};
const line={id:'qa-line',name:'عبوة <اختبار>',quantity:'2',unitNetPrice:'50',unitCode:'PCE',category:'S',rate:'15'};
const input={currency:'SAR',mode:'standard',kind:'invoice',uuid:'11111111-1111-4111-8111-111111111111',icv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH,number:'QA-1',issueDate:'2026-11-18',issueTime:'10:00:00',supplyDate:'2026-11-18',paymentMeans:'30',seller:party,buyer:{...party,name:'مشتري اختبار',vatNumber:'311111111111113'},lines:[line]};
test('XML candidate includes shared tax engine totals and correct standard type',()=>{
  const out=buildDomesticStandardInvoiceCandidate(input),xml=out.bytes.toString('utf8');
  assert.equal(out.status,'unsigned-candidate');
  assert.equal(out.totals.taxExclusiveTotal,'100.00');
  assert.equal(out.totals.vatTotal,'15.00');
  assert.equal(out.totals.taxInclusiveTotal,'115.00');
  assert.match(xml,/<cbc:InvoiceTypeCode name="0100000">388<\/cbc:InvoiceTypeCode>/);
  assert.match(xml,/<cbc:PayableAmount currencyID="SAR">115.00<\/cbc:PayableAmount>/);
  assert.match(xml,/<cbc:ID>ICV<\/cbc:ID><cbc:UUID>1<\/cbc:UUID>/);
  assert.ok(xml.includes(FIRST_PREVIOUS_INVOICE_HASH));
  assert.match(xml,/<cbc:Name>عبوة &lt;اختبار&gt;<\/cbc:Name>/);
  assert.ok(xml.includes('شركة &amp; اختبار'));
  assert.doesNotMatch(xml,/SignatureValue|<cbc:ID>QR<\/cbc:ID>/);
});
test('unsupported fiscal scenarios are rejected rather than silently dropped',()=>{
  for(const patch of [{mode:'simplified'},{kind:'credit-note'},{currency:'USD'},{discount:'10.00'},{prepaid:'10.00'},{adjustments:[]},{paymentMeans:undefined},{supplyDate:'2026-11-19'},{issueDate:'2026-02-30'},{issueTime:'25:00:00'},{previousInvoiceHash:'invalid'},{buyer:{...input.buyer,country:'TR'}}])
    assert.throws(()=>buildDomesticStandardInvoiceCandidate({...input,...patch}));
  for(const patch of [{allowance:'1.00'},{rate:'0'},{category:'Z'},{quantity:'0'},{unitCode:'"><x>'},{name:'bad\u0000text'},{unknown:'ignored'}])
    assert.throws(()=>buildDomesticStandardInvoiceCandidate({...input,lines:[{...line,...patch}]}));
});
test('subsequent invoice chain, multiple lines and immutable caller inputs',()=>{
  const request=Object.freeze({...input,icv:'2',previousInvoiceHash:Buffer.alloc(32,1).toString('base64'),lines:Object.freeze([Object.freeze(line),Object.freeze({...line,id:'qa-line2',quantity:'1',unitNetPrice:'25'})])});
  const a=buildDomesticStandardInvoiceCandidate(request),b=buildDomesticStandardInvoiceCandidate(request);
  assert.deepEqual(a,b);assert.equal(a.totals.taxInclusiveTotal,'143.75');assert.equal(request.lines.length,2);
  assert.throws(()=>buildDomesticStandardInvoiceCandidate({...request,lines:[line,line]}));
});

test('all six domestic fiscal types have the required subtype, document code and correction fields',()=>{
  for(const mode of ['standard','simplified']){
    for(const [kind,code] of [['invoice','388'],['credit-note','381'],['debit-note','383']]){
      const buyer=mode==='standard'?input.buyer:null;
      const request={...input,mode,kind,buyer};
      if(kind!=='invoice')Object.assign(request,{original:{number:'QA-ORIGINAL',uuid:'22222222-2222-4222-8222-222222222222',issueDate:'2026-11-17',mode,sellerVat:party.vatNumber,buyerVat:buyer?.vatNumber??null},correctionReason:'تصحيح كمية'});
      const out=buildDomesticFiscalCandidate(request),xml=out.bytes.toString();
      assert.equal(out.status,'unsigned-candidate');
      assert.ok(xml.includes('name="'+(mode==='standard'?'0100000':'0200000')+'">'+code+'</cbc:InvoiceTypeCode>'));
      assert.equal(out.totals.taxInclusiveTotal,'115.00');
      if(kind==='invoice')assert.doesNotMatch(xml,/BillingReference|InstructionNote/);
      else{
        assert.match(xml,/<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>QA-ORIGINAL<\/cbc:ID>/);
        assert.match(xml,/<cbc:InstructionNote>تصحيح كمية<\/cbc:InstructionNote>/);
        assert.ok(xml.indexOf('BillingReference')<xml.indexOf('AdditionalDocumentReference'));
      }
      if(mode==='simplified')assert.ok(xml.includes('<cac:AccountingCustomerParty><cac:Party/></cac:AccountingCustomerParty>'));
    }
  }
});
test('correction rejects mismatched references, future originals, missing reason and self-reference',()=>{
  const original={number:'QA-ORIGINAL',uuid:'22222222-2222-4222-8222-222222222222',issueDate:'2026-11-17',mode:'standard',sellerVat:party.vatNumber,buyerVat:input.buyer.vatNumber};
  const request={...input,kind:'credit-note',original,correctionReason:'تصحيح'};
  for(const patch of [{mode:'simplified'},{sellerVat:'311111111111113'},{buyerVat:null},{number:input.number},{uuid:input.uuid},{issueDate:'2026-11-19'},{issueDate:'2026-02-30'},{number:''}]){
    assert.throws(()=>buildDomesticFiscalCandidate({...request,original:{...original,...patch}}));
  }
  for(const patch of [{original:undefined},{correctionReason:''},{correctionReason:undefined},{kind:'invoice'},{buyer:null}]){
    assert.throws(()=>buildDomesticFiscalCandidate({...request,...patch}));
  }
});
test('simplified supports anonymous retail or a complete domestic party, without coercing other cases',()=>{
  const q={...input,mode:'simplified',buyer:null};
  assert.equal(buildDomesticFiscalCandidate(q).status,'unsigned-candidate');
  assert.match(buildDomesticFiscalCandidate({...q,buyer:input.buyer}).bytes.toString(),/مشتري اختبار/);
  for(const patch of [{buyer:undefined},{buyer:{}},{buyer:{...input.buyer,country:'TR'}},{mode:'standard'},{kind:'prepayment'},{currency:'USD'}]){
    assert.throws(()=>buildDomesticFiscalCandidate({...q,...patch}));
  }
});

test('mixed domestic VAT categories and adjustments reconcile without double-counting',()=>{
  const req={...input,lines:[{...line,allowance:'10.00',allowanceReasonCode:'95',allowanceReasonText:'Discount'},{...line,id:'medical',name:'Medical',quantity:'1',unitNetPrice:'40',category:'Z',rate:'0',reasonCode:'VATEX-SA-35',reasonText:'Eligible medical equipment'},{...line,id:'insurance',name:'Insurance',quantity:'1',unitNetPrice:'30',category:'E',rate:'0',reasonCode:'VATEX-SA-29-7',reasonText:'Life insurance'}],adjustments:[{kind:'allowance',amount:'5',category:'S',rate:'15',adjustmentReasonCode:'95',adjustmentReasonText:'Discount'},{kind:'charge',amount:'15',category:'S',rate:'15',adjustmentReasonCode:'FC',adjustmentReasonText:'Freight'}]};
  const out=buildDomesticFiscalCandidate(req),xml=out.bytes.toString();
  assert.equal(out.totals.lineNetTotal,'160.00');assert.equal(out.totals.documentAllowances,'5.00');assert.equal(out.totals.documentCharges,'15.00');assert.equal(out.totals.taxExclusiveTotal,'170.00');assert.equal(out.totals.vatTotal,'15.00');assert.equal(out.totals.taxInclusiveTotal,'185.00');
  assert.equal((xml.match(/<cac:TaxSubtotal>/g)||[]).length,3);
  for(const token of ['<cbc:TaxExemptionReasonCode>VATEX-SA-35','<cbc:TaxExemptionReasonCode>VATEX-SA-29-7','<cbc:AllowanceTotalAmount currencyID="SAR">5.00','<cbc:ChargeTotalAmount currencyID="SAR">15.00','<cbc:PayableAmount currencyID="SAR">185.00','<cbc:AllowanceChargeReasonCode>95','<cbc:AllowanceChargeReasonCode>FC'])assert.ok(xml.includes(token),token);
  assert.ok(xml.indexOf('<cac:AllowanceCharge>')<xml.indexOf('<cac:TaxTotal>'));
  assert.ok(xml.includes('<cbc:LineExtensionAmount currencyID="SAR">90.00</cbc:LineExtensionAmount><cac:AllowanceCharge>'));
  assert.equal(out.status,'unsigned-candidate');
});
test('out-of-scope candidate requires explicit reason and stays separate from taxable categories',()=>{
  const o={...line,category:'O',rate:'0',reasonCode:'VATEX-SA-OOS',reasonText:'Synthetic outside-scope reason'};
  const out=buildDomesticFiscalCandidate({...input,lines:[o]});
  assert.equal(out.totals.vatTotal,'0.00');assert.ok(out.bytes.toString().includes('<cbc:TaxExemptionReason>Synthetic outside-scope reason'));
  assert.throws(()=>buildDomesticFiscalCandidate({...input,lines:[o,line].map((v,i)=>({...v,id:String(i)}))}),/UNSUPPORTED_MIXED_OUT_OF_SCOPE/);
  assert.throws(()=>buildDomesticFiscalCandidate({...input,lines:[{...o,reasonText:''}]}));
});
test('explicit classification, adjustment amounts and unsupported special cases fail closed',()=>{
  const z={...line,category:'Z',rate:'0',reasonCode:'VATEX-SA-35',reasonText:'Medical'};
  for(const patch of [{reasonCode:'VATEX-SA-32'},{reasonCode:'VATEX-SA-29'},{rate:'15'},{reasonText:undefined},{reasonText:' '},{allowance:'1.00'},{allowanceReasonCode:'95'}])assert.throws(()=>buildDomesticFiscalCandidate({...input,lines:[{...z,...patch}]}));
  assert.throws(()=>buildDomesticFiscalCandidate({...input,lines:[z,{...z,id:'second',reasonText:'Different'}]}),/CONFLICTING_VAT_REASONS/);
  const a={kind:'allowance',amount:'5.00',category:'S',rate:'15',adjustmentReasonCode:'95',adjustmentReasonText:'Discount'};
  for(const patch of [{amount:'0'},{amount:'1000'},{amount:'1.001'},{amount:'-1'},{adjustmentReasonCode:'FC'},{unknown:'ignored'},{adjustmentReasonText:undefined}])assert.throws(()=>buildDomesticFiscalCandidate({...input,adjustments:[{...a,...patch}]}));
});

test('foreign-currency XML keeps commercial amounts in USD and separate VAT in SAR',()=>{
  const req={...input,currency:'USD',adjustments:[{kind:'charge',amount:'10',category:'S',rate:'15',adjustmentReasonCode:'FC',adjustmentReasonText:'Freight'}]};
  const rate={uuid:input.uuid,currency:'USD',sarPerUnit:'3.75',taxDueDate:input.issueDate,rateDate:input.issueDate,source:'SAMA',evidenceDigest:'a'.repeat(64)};
  const out=buildFiscalCandidate(req,{rate}),xml=out.bytes.toString();
  assert.equal(out.totals.taxInclusiveTotal,'126.50');assert.equal(out.fiscalContext.vatSar,'61.88');
  assert.ok(xml.includes('<cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode><cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>'));
  assert.ok(xml.includes('<cac:TaxTotal><cbc:TaxAmount currencyID="SAR">61.88</cbc:TaxAmount></cac:TaxTotal>'));
  assert.ok(xml.includes('<cbc:TaxAmount currencyID="USD">16.50</cbc:TaxAmount><cac:TaxSubtotal>'));
  assert.ok(xml.includes('<cbc:PayableAmount currencyID="USD">126.50</cbc:PayableAmount>'));
  assert.equal((xml.match(/currencyID="SAR"/g)||[]).length,1);
  assert.throws(()=>buildFiscalCandidate(req));
  assert.throws(()=>buildDomesticFiscalCandidate(req));
});
test('explicit standard export classification emits legal subtype and non-Saudi buyer identity',()=>{
  const buyer={country:'TR',otherId:'1234567890',otherIdScheme:'TIN',street:'Test street',city:'Istanbul',name:'Test buyer'};
  for(const [kind,reasonCode,reasonText] of [['goods','VATEX-SA-32','Export of goods'],['services','VATEX-SA-33','Export of services']]){
    const req={...input,buyer,lines:[{...line,category:'Z',rate:'0',reasonCode,reasonText}]};
    const exportClassification={uuid:input.uuid,kind,buyerCountry:'TR',evidenceDigest:'b'.repeat(64)};
    const out=buildFiscalCandidate(req,{exportClassification}),xml=out.bytes.toString();
    assert.equal(out.totals.vatTotal,'0.00');assert.equal(out.fiscalContext.vatSar,'0.00');
    assert.ok(xml.includes('<cbc:InvoiceTypeCode name="0100100">388</cbc:InvoiceTypeCode>'));
    assert.ok(xml.includes('<cbc:ID schemeID="TIN">1234567890</cbc:ID>'));
    assert.ok(xml.includes('<cbc:IdentificationCode>TR</cbc:IdentificationCode>'));
    assert.ok(xml.includes('<cbc:TaxExemptionReasonCode>'+reasonCode+'</cbc:TaxExemptionReasonCode>'));
    assert.equal((xml.match(/<cbc:CompanyID>/g)||[]).length,1);
    assert.throws(()=>buildFiscalCandidate(req));
    assert.throws(()=>buildFiscalCandidate({...req,buyer:{...buyer,vatNumber:party.vatNumber}},{exportClassification}));
    assert.throws(()=>buildFiscalCandidate({...req,lines:[line]},{exportClassification}));
    assert.throws(()=>buildFiscalCandidate({...req,mode:'simplified'},{exportClassification}));
  }
});
