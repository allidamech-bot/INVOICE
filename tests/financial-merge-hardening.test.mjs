import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';

function finalInvoice(base,{id='inv-fin',number='INV-2026-0900',amount='100.00'}={}){
  const invoice=createBlankDocument('invoice',number,base.company);
  invoice.id=id;invoice.status='final';invoice.lifecycleStatus='active';invoice.role='standard';
  invoice.customerSnapshot={sourceCustomerId:'cust-fin',companyNameEn:'Financial Buyer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  invoice.items=[{...invoice.items[0],descriptionEn:'Service',quantity:'1',unitPrice:amount}];
  return invoice;
}
function payment(invoice,{id='pay-fin',amount='40.00'}={}){
  const now='2026-09-05T12:00:00.000Z';
  return{id,invoiceId:invoice.id,invoiceNumber:invoice.number,customerId:'cust-fin',customerNameEn:'Financial Buyer',customerNameAr:'',currency:invoice.currency,amount,date:'2026-09-05',method:'bank-transfer',reference:id,notes:'',createdAt:now,updatedAt:now};
}

test('financial merge cannot leave a payment linked to a deleted source invoice',()=>{
  const base=emptyVault();const invoice=finalInvoice(base);const receipt=payment(invoice);
  base.documents=[invoice];base.payments=[receipt];
  const intent={...base,documents:[]};
  assert.throws(()=>mergeVaultIntent(base,intent,base),/missing source invoice/i);
});

test('deleting one payment preserves an unrelated payment added concurrently',()=>{
  const base=emptyVault();const invoice=finalInvoice(base);const first=payment(invoice,{id:'pay-first',amount:'40.00'});
  base.documents=[invoice];base.payments=[first];
  const second=payment(invoice,{id:'pay-second',amount:'20.00'});
  const latest=mergeVaultIntent(base,{...base,payments:[first,second]},base);
  const merged=mergeVaultIntent(base,{...base,payments:[]},latest);
  assert.deepEqual(merged.payments.map(item=>item.id),['pay-second']);
});
