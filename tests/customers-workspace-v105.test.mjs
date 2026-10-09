import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFile(path,'utf8');

function extractCustomerMethods(source,start,end,context){
  const first=source.indexOf(start),last=source.indexOf(end,first);
  assert.ok(first>=0&&last>first,'production customer method exists');
  const isolated='class CustomerHarness { constructor(props,state){this.props=props;this.state=state;this.updates=[];} setState(change){this.updates.push(change);this.state={...this.state,...change};} '+source.slice(first,last)+' }';
  const js=ts.transpileModule(isolated,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const sandbox={...context};
  vm.runInNewContext(js+';this.CustomerHarness=CustomerHarness;',sandbox);
  return sandbox.CustomerHarness;
}

const customer=(id,name,changes={})=>({id,companyNameEn:name,companyNameAr:'',contactPerson:'',phone:'',email:'',city:'',country:'',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'',creditCurrency:'',paymentTerms:'',notes:'',updatedAt:'2026-10-03T00:00:00.000Z',...changes});

test('v105 customer search executes multi-field discovery, all-term matching and stable sorting',async()=>{
  const src=await read('src/components/CustomersPage.tsx');
  const Harness=extractCustomerMethods(src,'private filtered():Customer[]{','private beginEdit=',{
    customerDisplayName:value=>value.companyNameEn||value.companyNameAr,isArabic:()=>false
  });
  const rows=[
    customer('1','Meridian Trading',{phone:'0532223333',country:'Saudi Arabia',preferredCurrency:'SAR',notes:'Wholesale FMCG',updatedAt:'2026-10-08T00:00:00.000Z'}),
    customer('2','Atlas Foods',{email:'atlas@example.test',creditCurrency:'USD',paymentTerms:'30 days',updatedAt:'2026-10-01T00:00:00.000Z'}),
    customer('3','Meridian Logistics',{phone:'0539999999',country:'Turkey',updatedAt:'2026-10-06T00:00:00.000Z'})
  ];
  const find=(query,sort='recent')=>Array.from(new Harness({customers:rows},{query,sort}).filtered()).map(row=>row.id);
  assert.deepEqual(find('Meridian Saudi'),['1'],'all tokens must match within the same customer');
  assert.deepEqual(find('FMCG SAR'),['1'],'credit/payment/notes search must remain enabled');
  assert.deepEqual(find('atlas@example.test'),['2'],'email lookup must remain enabled');
  assert.deepEqual(find('0539999999'),['3'],'phone lookup must remain enabled');
  assert.deepEqual(find('','recent'),['1','3','2'],'recent sort must be deterministic');
  assert.deepEqual(find('','alphabetical'),['2','3','1'],'alphabetical sort must use the visible customer name');
  assert.match(src,/Recently updated/);
  assert.match(src,/customers-search-clear/);
});

test('v105 customer save blocks probable duplicates and invalid email before persistence',async()=>{
  const src=await read('src/components/CustomersPage.tsx');
  const Harness=extractCustomerMethods(src,'private duplicateCustomer=','private createDocument=',{
    findCustomerDuplicateCandidates:(all,candidate)=>all.filter(row=>row.email&&row.email===candidate.email).map(row=>({customer:row})),
    customerDisplayName:value=>value.companyNameEn||value.companyNameAr,
    validateCustomerCommercial:()=>'',t:english=>english
  });
  const existing=customer('original','Atlas Foods',{email:'sales@atlas.test'});
  const writes=[];
  const props={customers:[existing],onSave:async value=>writes.push(value)};
  const duplicate=new Harness(props,{editing:customer('new','Atlas Duplicate',{email:'sales@atlas.test'}),allowKnownDuplicate:false});
  await duplicate.save();
  assert.equal(writes.length,0,'possible duplicate must require explicit confirmation');
  assert.match(duplicate.state.error,/already exists/);
  const invalid=new Harness(props,{editing:customer('new','New Customer',{email:'invalid@'}),allowKnownDuplicate:false});
  await invalid.save();
  assert.equal(writes.length,0,'invalid email cannot be saved');
  assert.match(invalid.state.error,/valid email/);
  const valid=new Harness(props,{editing:customer('new','New Customer',{email:'new@example.test'}),allowKnownDuplicate:false});
  await valid.save();
  assert.equal(writes.length,1,'validated customer can be persisted');
  assert.equal(writes[0].id,'new');
});

test('v105 gives the customer editor a clear progressive hierarchy',async()=>{
  const [page,css]=await Promise.all([
    read('src/components/CustomersPage.tsx'),
    read('src/styles/workspace-mobile-v94.css')
  ]);
  assert.match(page,/customer-form-section/);
  assert.match(page,/Core identity used on quotes and invoices/);
  assert.match(page,/Business details/);
  assert.match(css,/v105 — customer workspace clarity/);
  assert.match(css,/premium-customer-card/);
  assert.match(css,/customer-form-grid/);
  assert.match(css,/@media \(max-width:430px\)/);
});
