import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {isAiReceivablesRankingIntent,aiReceivablesRanking} from '../dist/src/lib/ai-receivables-ranking.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';

const today='2026-10-13';
function customer(id,name){return{id,workspaceId:'default',companyNameEn:name,companyNameAr:'',contactPerson:'',email:'',phone:''};}
function invoice(vault,id,name,amount,currency='USD',status='final',branch='main',due='2026-09-01'){
 const doc=createBlankDocument('invoice','INV-'+id,vault.company);
 doc.id=id;doc.workspaceId='default';doc.branchId=branch;doc.kind='invoice';doc.role='standard';
 doc.status=status;doc.lifecycleStatus='active';doc.issueDate='2026-09-01';doc.dueDate=due;doc.currency=currency;
 doc.customerSnapshot={sourceCustomerId:id,companyNameEn:name,companyNameAr:'',email:'',phone:''};
 doc.items=[{...doc.items[0],id:'line-'+id,descriptionEn:'Item',quantity:'1',unitPrice:amount}];
 doc.adjustments={discountEnabled:false,discountMode:'fixed',discountValue:'0.00',shippingEnabled:false,shipping:'0.00',otherChargesEnabled:false,otherCharges:'0.00',taxEnabled:false,taxPercent:'0'};
 return doc;
}
function fixture(){
 const vault=emptyVault();
 vault.customers=[customer('a','Buyer A'),customer('b','Buyer B'),customer('c','Buyer C'),customer('hidden','Hidden Branch Buyer')];
 vault.documents=[
  invoice(vault,'a','Buyer A','200.00'),
  invoice(vault,'b','Buyer B','500.00'),
  invoice(vault,'c','Buyer C','1000.00','USD','draft'),
  invoice(vault,'hidden','Hidden Branch Buyer','9999.00','USD','final','private-branch'),
  invoice(vault,'eur','EUR Buyer','700.00','EUR')
 ];
 return vault;
}
test('F19 detects customer receivables ranking but does not hijack ordinary general queries',()=>{
 for(const message of ['مين أعلى العملاء مديونية؟','من هم أكثر العملاء عليهم ذمم مستحقة؟','Which customers have the highest outstanding receivables?'])
  assert.equal(isAiReceivablesRankingIntent(message),true,message);
 for(const message of ['افتح العملاء','أنشئ فاتورة للعميل','كم المخزون؟','من أعلى صنف ربحية؟'])
  assert.equal(isAiReceivablesRankingIntent(message),false,message);
});
test('F19 real ledger ranks USD and EUR independently, excludes drafts/foreign branches',()=>{
 const vault=fixture(),before=structuredClone(vault);
 const text=aiReceivablesRanking(vault,'مين أعلى العملاء مديونية؟','ar',today);
 assert.match(text,/Buyer B — 500\.00 USD/);
 assert.match(text,/Buyer A — 200\.00 USD/);
 assert.ok(text.indexOf('Buyer B')<text.indexOf('Buyer A'));
 assert.match(text,/EUR Buyer — 700\.00 EUR/);
 assert.doesNotMatch(text,/Buyer C|Hidden Branch Buyer|1000\.00|9999\.00/);
 assert.match(text,/لم تُجمع العملات المختلفة ولم تُحتسب المسودات/);
 assert.deepEqual(vault,before,'read only');
});
test('F19 overdue uses overdue metric only, not all outstanding balances',()=>{
 const vault=fixture();
 vault.documents.push(invoice(vault,'future','Future Buyer','900.00','USD','final','main','2026-12-15'));
 const text=aiReceivablesRanking(vault,'من أعلى العملاء عليهم ذمم متأخرة؟','ar',today);
 assert.match(text,/Buyer B — 500\.00 USD/);
 assert.doesNotMatch(text,/Future Buyer/);
});
test('F19 Advisor keeps ranking read-only with zero proposals or vault writes',async()=>{
 const vault=fixture(),before=structuredClone(vault);
 const context={conversationMode:'advisor',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}};
 const result=await orchestrateAiToolRequest({message:'مين أعلى العملاء مديونية؟',vault,context,language:'ar'});
 assert.ok(result);
 assert.equal(result.proposal,null);
 assert.deepEqual(result.plan.calls,[]);
 assert.match(result.answer,/Buyer B — 500\.00 USD/);
 assert.deepEqual(vault,before);
});
test('F19 an unissued-only company cannot invent receivables or assert zero unverified balances',()=>{
 const vault=emptyVault();vault.documents=[invoice(vault,'unsaved','Draft Buyer','100000.00','USD','draft')];
 const message=aiReceivablesRanking(vault,'مين أعلى العملاء مديونية؟','ar',today);
 assert.match(message,/لا توجد مبالغ مستحقة مثبتة/);
 assert.doesNotMatch(message,/100000/);
});
