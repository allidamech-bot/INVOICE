import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectOfflineFinanceOpening as inspect} from '../scripts/finance-alif-opening-preflight.mjs';

const hash=n=>n.toString(16).padStart(64,'0');
const rows=[
 ['bank','asset','debit','100.00', 'treasury'],
 ['inventory','asset','debit','1200.00','inventory'],
 ['receivables','asset','debit','150.00','customerReceivable'],
 ['payables','liability','credit','1170.00','supplierPayable'],
 ['openingEquity','equity','credit','280.00',null]
];
function fictionalOpening(){
 return{
  schema:'LOUREX_ALIF_OPENING_V1',
  scope:{
   legalEntityId:'QA-LEGAL-ENTITY',workspaceId:'qa-workspace',
   branchId:'main',functionalCurrency:'USD',
   cutoffDate:'2026-10-28',minorDigits:2,policyVersion:'DRAFT-ALIF-22-NOT-APPROVED'
  },
  chartOfAccounts:rows.map(([accountId,type],i)=>({
   accountId,name:'Fictional account '+i,type
  })),
  balances:rows.map(([accountId,,side,amount],i)=>({
   accountId,side,amount,sourceAsOfDate:'2026-10-28',evidenceSha256:hash(i+1)
  })),
  sourceControls:rows.filter(r=>r[4]).map(([accountId,, ,amount,kind],i)=>({
   accountId,kind,amount,sourceAsOfDate:'2026-10-28',evidenceSha256:hash(i+11)
  }))
 };
}
function rejects(change,expected){
 const draft=fictionalOpening();
 change(draft);
 const response=inspect(draft);
 assert.equal(response.status,'INCOMPLETE_NO_POSTING');
 assert.ok(response.missing.includes(expected),JSON.stringify(response.missing));
 assert.equal(response.journalPosted,false);
 assert.equal(response.productionReady,false);
 return response;
}
test('a complete made-up opening book balances structurally, but is NEVER approved or posted',()=>{
 const result=inspect(fictionalOpening());
 assert.equal(result.status,'STRUCTURALLY_READY_FOR_HUMAN_REVIEW_ONLY');
 assert.deepEqual(result.missing,[]);
 for(const key of ['sourceAuthenticated','chartApproved','openingApproved','journalPosted','productionReady'])
  assert.equal(result[key],false);
 assert.doesNotMatch(result.status,/^GO$/);
});
test('missing and wrong-schema opening books fail closed',()=>{
 for(const input of [null,{},[],{schema:'fake'}])
  assert.equal(inspect(input).status,'INCOMPLETE_NO_POSTING');
});
test('bank mismatch is rejected even when total debits and credits still balance',()=>{
 rejects(x=>{x.sourceControls[0].amount='100.01'},'sourceControls[0].sourceMatchesBook');
});
test('unbalanced opening equity is rejected',()=>{
 rejects(x=>{x.balances[4].amount='279.99'},'balances.balanced');
});
test('wrong normal account side is rejected',()=>{
 rejects(x=>{x.balances[3].side='debit'},'balances[3].side');
});
test('duplicate ledger account IDs and duplicate balances are rejected',()=>{
 rejects(x=>{x.chartOfAccounts[1].accountId=x.chartOfAccounts[0].accountId},
  'chartOfAccounts[1].unique');
 rejects(x=>{x.balances[1].accountId=x.balances[0].accountId},
  'balances[1].unique');
});
test('control cannot be mapped to the wrong account kind even if amounts match',()=>{
 rejects(x=>{x.sourceControls[3].kind='treasury'},
  'sourceControls[3].sourceMatchesBook');
});
test('all four required source control categories are mandatory',()=>{
 rejects(x=>{x.sourceControls=x.sourceControls.filter(row=>row.kind!=='inventory')},
  'sourceControls.required.inventory');
});
test('a control may not reuse the same asset account',()=>{
 rejects(x=>{
  x.sourceControls[2].accountId='bank';x.sourceControls[2].amount='100.00';
 },'sourceControls[2].unique');
});
test('invalid, missing, or future-dated provenance is rejected',()=>{
 rejects(x=>{x.balances[0].evidenceSha256='unknown'},
  'balances[0].evidenceSha256');
 rejects(x=>{x.sourceControls[0].sourceAsOfDate='2026-10-29'},
  'sourceControls[0].sourceAsOfDate');
 rejects(x=>{x.scope.cutoffDate='2026-02-30'},'scope.cutoffDate');
 rejects(x=>{delete x.balances[1].sourceAsOfDate},'balances[1].sourceAsOfDate');
});
test('no guess about a legal entity functional currency or fiat minor digits',()=>{
 rejects(x=>{x.scope.functionalCurrency='??'},'scope.functionalCurrency');
 rejects(x=>{x.scope.minorDigits=9},'scope.minorDigits');
 rejects(x=>{x.balances[0].amount='100.001'},'balances[0].amount');
 rejects(x=>{x.scope.policyVersion=''},'scope.policyVersion');
});
test('negative, exponential, or noncanonical monetary amounts are rejected',()=>{
 for(const amount of ['-100.00','1e2','000.00','NaN','100.0000'])
  rejects(x=>{x.balances[0].amount=amount},'balances[0].amount');
});
test('missing documented chart coverage and insufficient control coverage fail',()=>{
 rejects(x=>{x.balances.pop()},'balances.accountCoverage');
 rejects(x=>{x.chartOfAccounts.push({accountId:'missing',name:'Other account',type:'asset'})},
  'balances.accountCoverage');
});
test('valid 0-digit and 3-digit precision books preserve exact arithmetic',()=>{
 const a=fictionalOpening();a.scope.minorDigits=0;
 for(const row of [...a.balances,...a.sourceControls])row.amount=row.amount.split('.')[0];
 assert.equal(inspect(a).status,'STRUCTURALLY_READY_FOR_HUMAN_REVIEW_ONLY');
 const b=fictionalOpening();b.scope.minorDigits=3;
 for(const row of [...b.balances,...b.sourceControls])row.amount=row.amount+'0';
 assert.equal(inspect(b).status,'STRUCTURALLY_READY_FOR_HUMAN_REVIEW_ONLY');
});
test('output never leaks source financial data, names or evidence hashes',()=>{
 const input=fictionalOpening();
 input.scope.legalEntityId='CONFIDENTIAL-ENTITY';
 input.balances[0].amount='9999999.99';
 input.balances[0].evidenceSha256=hash(30);
 input.chartOfAccounts[0].name='Secret owner bank';
 const rendered=JSON.stringify(inspect(input));
 assert.doesNotMatch(rendered,/CONFIDENTIAL|9999999|Secret owner|000000000000000000000000000000000000000000000000000000000000001e/);
});
test('structural preflight never alters the source dossier',()=>{
 const input=fictionalOpening(),before=JSON.stringify(input);
 inspect(input);
 assert.equal(JSON.stringify(input),before);
});
