import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const AS_OF='2026-10-13';
const scope={scope:'business',workspaceId:'default',branchId:'main'};
async function fixture(){
  const [{emptyVault},{createBlankDocument},{buildAdvisorDocumentRegistry,buildAdvisorDataV2},{buildAiFinanceContext},{buildAiBusinessContext}]=await Promise.all([
    import('../dist/src/lib/defaults.js'),import('../dist/src/lib/documents.js'),
    import('../dist/src/lib/ai-advisor-v2.js'),import('../dist/src/lib/ai-finance.js'),
    import('../dist/src/lib/ai-business.js')
  ]);
  const vault=emptyVault();
  function make(number,state,kind='invoice',workspaceId='default',branchId='main',updated='2026-10-10'){
    const doc=createBlankDocument(kind,number,vault.company);
    doc.workspaceId=workspaceId;doc.branchId=branchId;doc.number=number;
    doc.status=state==='saved-draft'?'draft':'final';
    doc.lifecycleStatus=state==='voided'?'voided':'active';
    doc.issueDate=state==='saved-draft'?'':'2026-10-02';
    doc.createdAt='2026-10-01T08:00:00.000Z';
    doc.updatedAt=updated+'T10:00:00.000Z';
    return doc;
  }
  vault.documents=[
    make('INV-2026-0001','saved-draft'),
    make('INV-2026-0002','issued'),
    make('INV-2026-0003','voided'),
    make('PI-2026-0020','saved-draft','proforma'),
    make('INV-2026-SECRET','issued','invoice','other-company','main'),
    make('INV-2026-PRIVATE','issued','invoice','default','other-branch'),
  ];
  const finance=buildAiFinanceContext({documents:vault.documents,payments:vault.payments,customers:vault.customers,activeDocument:null},'');
  const business=buildAiBusinessContext(vault,AS_OF);
  return{vault,make,buildAdvisorDocumentRegistry,buildAdvisorDataV2,finance,business};
}
function gateway(model){
  const sourcePromise=readFile(new URL('../api/ai-advisor-v2.js',import.meta.url),'utf8');
  return sourcePromise.then(code=>{
    const source=code.replace(/^import .+;\s*$/gm,'').replace('export default async function handler','async function handler');
    let planned=0;
    const lib=vm.runInNewContext(source+'\n({handler,cleanAdvisor,documentNumberInRequest,deterministicDocumentAnswer})',{
      Buffer,URL,process:{env:{}},console,
      requireAiFirebaseAuth:async()=>true,
      sanitizeDialogueCatalog:()=>null,
      sanitizeReadEvidence:()=>[],
      naturalLourexDialogue:async()=>{planned++;return{success:true,answer:model?.answer||'Status is unavailable',proposal:null};},
      routeAiStructured:async()=>{planned++;return{success:true,data:model??{answer:'Status is unavailable',proposal:null}};},
      aiRouterPublicError:()=>({status:503,code:'AI_ERROR',message:'AI unavailable'})
    });
    const request=async(message,advisorV2,mode='advisor',language='ar')=>{
      const body={message,context:{version:5,screen:'home',language,conversationMode:mode,advisorV2}};
      const json=JSON.stringify(body);
      const req={method:'POST',aiVerifiedUid:'qa-f21',headers:{host:'invoice-three-puce.vercel.app',origin:'https://invoice-three-puce.vercel.app','x-requested-with':'LOUREX-Invoice','content-length':String(Buffer.byteLength(json))},async *[Symbol.asyncIterator](){yield Buffer.from(json);}};
      const res={statusCode:0,setHeader(){},end(t){this.body=JSON.parse(t);}};
      await lib.handler(req,res);
      return res;
    };
    return{...lib,request,get planned(){return planned}};
  });
}

test('F21 saved invoice drafts are distinct from issued sales and voided records',async()=>{
  const {vault,buildAdvisorDocumentRegistry,buildAdvisorDataV2,finance,business}=await fixture();
  const ledger=buildAdvisorDocumentRegistry(vault,AS_OF,'هل حفظت الفاتورة INV-2026-0001؟');
  assert.equal(ledger.total,4,'foreign branch/company documents must not enter the index');
  assert.deepEqual(ledger.invoices,{total:3,savedDrafts:1,issued:1,voided:1});
  assert.equal(ledger.matched.length,1);
  assert.equal(ledger.matched[0].number,'INV-2026-0001');
  assert.equal(ledger.matched[0].state,'saved-draft');
  const advisor=buildAdvisorDataV2(vault,finance,business,'business','هل حفظت الفاتورة INV-2026-0001؟');
  assert.equal(advisor.documents.matched[0].state,'saved-draft');
  assert.equal(advisor.documents.invoices.savedDrafts,1);
  assert.equal(advisor.sales.today.reduce((sum,row)=>sum+row.issuedInvoices,0),0,'draft should not become issued sales');
});

test('F21 exact number outside 16 recent rows is still found without truncated-record denial',async()=>{
  const {vault,make,buildAdvisorDocumentRegistry}=await fixture();
  for(let i=0;i<28;i++)vault.documents.push(make('INV-EXTRA-'+String(i).padStart(5,'0'),'issued','invoice','default','main','2026-10-12'));
  const evidence=buildAdvisorDocumentRegistry(vault,AS_OF,'هل INV-2026-0001 محفوظة؟');
  assert.equal(evidence.total,32);
  assert.equal(evidence.recent.length,16);
  assert.equal(evidence.recentTruncated,true);
  assert.ok(!evidence.recent.some(row=>row.number==='INV-2026-0001'));
  assert.equal(evidence.matched[0].number,'INV-2026-0001');
  assert.deepEqual(buildAdvisorDocumentRegistry(vault,AS_OF,'Status of INV-2026-SECRET').matched,[]);
  assert.deepEqual(buildAdvisorDocumentRegistry(vault,AS_OF,'Status of INV-2026-PRIVATE').matched,[]);
});

test('F21 server sanitized deterministic status says draft is saved but unissued without model',async()=>{
  const {vault,buildAdvisorDataV2,finance,business}=await fixture();
  const g=await gateway();
  for(const [number,phrase]of [['INV-2026-0001','مسودة غير صادرة'],['INV-2026-0002','صادر'],['INV-2026-0003','ملغى']]){
    const data=buildAdvisorDataV2(vault,finance,business,'business','هل الفاتورة '+number+' محفوظة؟');
    const res=await g.request('هل الفاتورة '+number+' محفوظة؟',data);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.model,'deterministic-documents');
    assert.match(res.body.answer,new RegExp(number));
    assert.match(res.body.answer,new RegExp(phrase));
    assert.equal(res.body.proposal,null);
  }
  assert.equal(g.planned,0,'exact status queries should not depend on unreliable model answers');
});

test('F21 an absent number is scoped uncertainty, not proof that an invoice never existed',async()=>{
  const {vault,buildAdvisorDataV2,finance,business}=await fixture();
  const g=await gateway();
  const data=buildAdvisorDataV2(vault,finance,business,'business','هل INV-2026-9999 محفوظة؟');
  const res=await g.request('هل فاتورة INV-2026-9999 محفوظة؟',data);
  assert.equal(res.statusCode,200);
  assert.match(res.body.answer,/لم أجد.*الشركة والفرع الحاليين/);
  assert.doesNotMatch(res.body.answer,/لم توجد في أي مكان/);
  assert.equal(g.planned,0);
});

test('F21 server strips mismatched client lookup rows and does not invent absent document index',async()=>{
  const {vault,buildAdvisorDataV2,finance,business}=await fixture();
  const g=await gateway();
  const data=buildAdvisorDataV2(vault,finance,business,'business','هل INV-2026-0001 محفوظة؟');
  const tampered=structuredClone(data);
  tampered.documents.matched[0].number='INV-2026-9999';
  const valid=g.cleanAdvisor(tampered,'هل فاتورة INV-2026-0001 محفوظة؟');
  assert.equal(valid.documents.matched.length,0);
  const noIndex=structuredClone(data);delete noIndex.documents;
  const notKnown=g.cleanAdvisor(noIndex,'هل فاتورة INV-2026-0001 محفوظة؟');
  assert.equal(notKnown.documents,null,'missing evidence must not become zero documents');
  const res=await g.request('هل فاتورة INV-2026-0001 محفوظة؟',noIndex);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.model,'lourex-dialogue','missing index should be discussed, not stated as a deterministic denial');
  assert.equal(g.planned,1);
});

test('F21 personal scope redacts all business document facts',async()=>{
  const {vault,buildAdvisorDataV2,finance,business}=await fixture();
  const personal=buildAdvisorDataV2(vault,finance,business,'personal','هل INV-2026-0001 محفوظة؟');
  assert.equal(personal.available,false);
  assert.equal(personal.documents.total,0);
  assert.deepEqual(personal.documents.matched,[]);
  const g=await gateway();
  assert.equal(g.cleanAdvisor(personal,'هل INV-2026-0001 محفوظة؟').documents,null);
});

test('F21 no content/price/customer payload is leaked to provider by the document index',async()=>{
  const {vault,buildAdvisorDocumentRegistry}=await fixture();
  const row=vault.documents[0];
  row.notes='PRIVATE ACCOUNT COMMENT';
  row.items=[{id:'one',descriptionEn:'PRIVATE PRODUCT',quantity:'1',unit:'CTN',unitPrice:'250'}];
  const index=buildAdvisorDocumentRegistry(vault,AS_OF,'هل فاتورة INV-2026-0001 محفوظة؟');
  assert.ok(!JSON.stringify(index).includes('PRIVATE'));
  for(const record of [...index.recent,...index.matched]){
    assert.equal('items' in record,false,'document line contents must never appear in the Advisor registry');
    assert.equal('unitPrice' in record,false,'product prices must never appear in the Advisor registry');
    assert.equal('customerSnapshot' in record,false,'customer identities must never appear in the Advisor registry');
    assert.equal('notes' in record,false,'private notes must never appear in the Advisor registry');
  }
  assert.ok(!JSON.stringify(index).includes('ACCOUNT'));
});

test('F21 hypothetical invoice and payment examples never hijack Advisor into saved-document counts',async()=>{
  const {vault,buildAdvisorDataV2,finance,business}=await fixture();
  const g=await gateway({answer:'Hypothetical scenario received; no stored-document count requested.'});
  const cases=[
    ['إذا عندي فاتورة افتراضية قيمتها 1500 دولار، دفعت 400 ثم 350، كم المتبقي؟','ar'],
    ['عندي فاتورة بمبلغ 1500 دولار دفعت منها 400 و350، كم الباقي؟','ar'],
    ['Suppose I have an invoice of 1500 USD, paid 400 and 350; what is remaining?','en']
  ];
  for(const [message,language] of cases){
    const data=buildAdvisorDataV2(vault,finance,business,'business',message);
    const result=await g.request(message,data,'advisor',language);
    assert.equal(result.statusCode,200);
    assert.equal(result.body.model,'lourex-dialogue','hypothetical examples must bypass saved-document status shortcut');
    assert.equal(result.body.proposal,null,'Advisor remains read-only');
    assert.doesNotMatch(result.body.answer,/سجل المستندات المحفوظة|saved invoice records/iu);
  }
  assert.equal(g.planned,cases.length,'each hypothetical scenario must reach conversation processing');
});
