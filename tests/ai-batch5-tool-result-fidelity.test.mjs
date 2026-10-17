import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../scripts/ai-conversation-owner-stage4-tools.mjs',import.meta.url),'utf8');
const start=source.indexOf('function __lourexHumanKey('),end=source.indexOf('function __lourexToolStatus(',start);
assert.ok(start>=0&&end>start,'Tool-answer formatter disappeared from the build owner.');
const format=new Function(source.slice(start,end).replace(/\\n/g,'\n').replace(/\\\\s/g,'\\s')+'\nreturn __lourexCompactObject;')();

test('Supplier summary includes financial fields beyond first five keys',()=>{
 const supplier={
  id:'supp-1',name:'Anatolia Trading',city:'Istanbul',country:'Turkey',defaultCurrency:'USD',
  paymentTerms:'30 days',payables:[{currency:'USD',balance:'250.00'},{currency:'EUR',balance:'100.00'}],
  recentPurchases:[{number:'PO-1',total:'100'},{number:'PO-2',total:'200'},{number:'PO-3',total:'300'},{number:'PO-4',total:'400'}],
 };
 const en=format(supplier,0,false),ar=format(supplier,0,true);
 assert.match(en,/Payables: 2 records/);
 assert.match(en,/Recent purchases: 4 records/);
 assert.match(en,/\+1 additional rows not shown/);
 assert.match(ar,/الذمم المستحقة للموردين/);
 assert.match(ar,/المشتريات الأخيرة/);
 assert.match(ar,/سجلات أخرى غير معروضة/);
 assert.doesNotMatch(en,/supp-1/,'internal source identifiers stay out of a compact preview');
});

test('Unexpected data truncation is announced rather than displayed as a partial JSON record',()=>{
 const state={truncated:true,preview:'{"name":"Wrongly complete","credit":"unknown'};
 const en=format(state,0,false),ar=format(state,0,true);
 assert.match(en,/summary is incomplete/);
 assert.match(ar,/الملخص غير كامل/);
 assert.doesNotMatch(en,/Wrongly complete/);
 assert.doesNotMatch(ar,/Wrongly complete/);
});

test('Omitted extra fields and rows report the precise count, preserving zero values',()=>{
 const many={a:'1',b:'2',c:'3',d:'4',e:'5',f:'6',g:'7',h:'8',i:'9',j:'10',k:'11',l:'12'};
 assert.match(format(many,0,false),/\+2 additional fields not shown/);
 assert.match(format(many,0,true),/\+2 حقول أخرى غير معروضة/);
 assert.match(format({balance:0,creditLimit:null,quantity:'0'},0,false),/Balance: 0/);
 assert.match(format({balance:0,creditLimit:null,quantity:'0'},0,false),/Quantity: 0/);
 assert.doesNotMatch(format({balance:0,creditLimit:null},0,false),/Credit Limit: 0/);
 assert.match(format([{cost:'1'},{cost:'2'},{cost:'3'},{cost:'4'},{cost:'5'}],0,false),/\+2 additional rows not shown/);
});

test('User-facing summaries disclose the final length limit and localize section labels',()=>{
 assert.match(source,/const detail=__lourexCompactObject\(row.data,0,ar\)/);
 assert.match(source,/ar\?'ملخص':'Summary'/);
 assert.match(source,/ar\?'معلومات مسجلة':'Known'/);
 assert.match(source,/Additional information is not shown here/);
 assert.match(source,/توجد معلومات إضافية لم تُعرض هنا/);
 assert.match(source,/return answer\.slice\(0,4800\)\.trimEnd\(\)/);
});


test('Arabic treasury answer localizes account/activity labels without mixed English table keys',()=>{
  const treasury={accounts:[],activity:[]};
  const ar=format(treasury,0,true),en=format(treasury,0,false);
  assert.match(ar,/الحسابات: لا توجد سجلات معروضة/);
  assert.match(ar,/الحركة المالية: لا توجد سجلات معروضة/);
  assert.doesNotMatch(ar,/Accounts|Activity|No recorded rows/);
  assert.match(en,/Accounts: No recorded rows/);
  assert.match(en,/Activity: No recorded rows/);
});

test('Arabic inventory evidence localizes paging flags and does not expose internal IDs',()=>{
  const stock={total:75,shown:30,incomplete:true,rows:[
    {itemId:'internal-sku-row-1',sku:'SKU-QA-01',quantity:'0',state:'zero'},
    {itemId:'internal-sku-row-2',sku:'SKU-QA-02',quantity:'3',state:'positive'}
  ]};
  const ar=format(stock,0,true),en=format(stock,0,false);
  assert.match(ar,/الإجمالي: 75/);
  assert.match(ar,/المعروض: 30/);
  assert.match(ar,/غير مكتمل: نعم/);
  assert.doesNotMatch(ar,/\b(?:Accounts|Activity|Shown|Incomplete|Rows)\b/);
  assert.doesNotMatch(ar,/internal-sku-row/,'Internal database identifiers do not belong in a chat answer');
  assert.match(en,/Incomplete: Yes/);
});
