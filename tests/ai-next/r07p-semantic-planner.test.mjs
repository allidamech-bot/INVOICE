import test from 'node:test';
import assert from 'node:assert/strict';
import {R07PSemanticPlanner,R07P_SEMANTIC_PRODUCTION_ACTIVE}
  from '../../dist/src/ai-next/router/semantic-planner.js';
import {exactScopeKey} from '../../dist/src/ai-next/domain/turn-journal.js';

const NOW=new Date('2026-10-31T12:00:00.000Z');
const epoch=Math.floor(NOW.getTime()/1000);
const scope=(overrides={})=>({
  ownerUid:'actor-r07p',actorId:'actor-r07p',accountId:'account-r07p',
  companyId:'company-r07p',branchId:'branch-r07p',threadId:'thread-r07p',
  role:'owner',scopeType:'business',authorizationVersion:1,...overrides,
});
const request=(message,overrides={})=>({
  schemaVersion:1,accountId:'account-r07p',companyId:'company-r07p',
  branchId:'branch-r07p',threadId:'thread-r07p',scopeType:'business',
  requestId:'request-r07p',idempotencyKey:'key-r07p',
  userMessageId:'message-r07p',message,mode:'controller',...overrides,
});
const context=(s=scope(),changes={})=>({
  scopeKey:exactScopeKey(s),historyComplete:true,
  activeDraft:{id:'draft-verified',kind:'quotation',revision:4,
    lineIds:['line-verified']},
  references:[{kind:'document',id:'quote-verified',
    scopeKey:exactScopeKey(s),documentKind:'quotation'},
    {kind:'entity',id:'customer-verified',
      scopeKey:exactScopeKey(s),documentKind:null}],
  ...changes,
});
const proposal=(action,changes={})=>({
  action,subject:null,reference:'none',facts:[],sourceIds:[],missingFields:[],
  ...changes,
});
const one=(fixture,options={})=>{
  const counters={calls:0,auth:0,membership:0,loads:0};
  const role=options.role??'owner';
  const scoped=scope({role});
  const planner=new R07PSemanticPlanner({
    principal:{verify:async()=>{counters.auth++;return {
      uid:'actor-r07p',role,tokenIssuedAt:epoch-100,tokenExpiresAt:epoch+3600,
      authenticatedAt:epoch-200,anonymous:false,
    };}},
    membership:{readForActor:async()=>{counters.membership++;
      return options.revoked?null:{
        ownerUid:'actor-r07p',actorUid:'actor-r07p',
        accountId:'account-r07p',companyId:'company-r07p',
        branchId:'branch-r07p',active:true,authorizationVersion:1,
        permittedRoles:[role],
      };
    }},
    context:{load:async s=>{counters.loads++;
      return options.context??context(s);
    }},
    syntheticInterpreter:{interpret:async input=>{counters.calls++;
      if(options.onInterpret)options.onInterpret(input);
      return fixture;
    }},
    allowSyntheticInference:options.enabled??true,
    clock:()=>new Date(NOW),
  });
  return {planner,counters,scoped};
};
const plan=(h,msg,changes={})=>h.planner.plan(
  'synthetic-r07p-bearer-token-over-thirty-characters',request(msg,changes));

test('R07P explicitly remains off and has no production integration',()=>{
  assert.equal(R07P_SEMANTIC_PRODUCTION_ACTIVE,false);
});
test('greetings and exact unsaved quote start use zero inference calls',async()=>{
  const h=one(proposal('execute_approved'));
  const hi=await plan(h,'السلام عليكم');
  assert.equal(hi.status,'local_reply');
  assert.equal(hi.providerCalls,0);
  assert.match(hi.assistantReply,/وعليكم/);
  const draft=await plan(h,'أنشئ مسودة عرض سعر');
  assert.equal(draft.status,'proposed');
  assert.equal(draft.intent.action,'prepare_quote');
  assert.equal(draft.intent.executable,false);
  assert.equal(draft.financialSaved,false);
  assert.equal(h.counters.calls,0);
});
test('an unconfigured semantic model returns unsupported, never guessed success',async()=>{
  const h=one(proposal('edit_draft'),{enabled:false});
  const p=await plan(h,'خلي العميل شركة النور');
  assert.equal(p.status,'unsupported');
  assert.equal(p.providerCalls,0);
  assert.equal(p.intent.executable,false);
  assert.equal(h.counters.calls,0);
});
test('benchmark: 16 synthetic multilingual interpretations validate groundings, not model accuracy',async(t)=>{
  const fixtures=[
    ['Arabic customer follow-up','خلي العميل شركة النور',
      proposal('edit_draft',{reference:'active_draft',
        facts:[{name:'customer_name',value:'شركة النور'}]}),'proposed','draft'],
    ['Arabic colloquial customer','حط العميل النور',
      proposal('edit_draft',{reference:'active_draft',
        facts:[{name:'customer_name',value:'النور'}]}),'proposed','draft'],
    ['Arabic correction','لا، خلي الكمية 12 بدل 10',
      proposal('edit_draft',{reference:'active_draft',
        facts:[{name:'quantity',value:'12'}]}),'proposed','draft'],
    ['English correction','Change the quantity to twelve',
      proposal('edit_draft',{reference:'active_draft',
        facts:[{name:'quantity',value:'12'}]}),'proposed','draft'],
    ['Mixed price update','غير price إلى 15 USD',
      proposal('edit_draft',{reference:'active_draft',
        facts:[{name:'selling_unit_price',value:'15'},
          {name:'currency',value:'USD'}]}),'proposed','draft'],
    ['Unit follow-up','Please set the unit to box',
      proposal('edit_draft',{reference:'active_draft',
        facts:[{name:'unit',value:'box'}]}),'proposed','draft'],
    ['Missing item description','أضف 10 قطع بسعر 15 دولار للقطعة',
      proposal('edit_draft',{reference:'active_draft',
        facts:[{name:'quantity',value:'10'},{name:'selling_unit_price',value:'15'}],
        missingFields:['product_description']}),'needs_clarification','draft'],
    ['Read last quotation','اقرأ آخر عرض سعر عملناه',
      proposal('read_business',{reference:'last_quotation'}),'proposed','document'],
    ['English last quotation','Show our last quotation',
      proposal('read_business',{reference:'last_quotation'}),'proposed','document'],
    ['Preview active draft','اعرض معاينة المسودة',
      proposal('preview_draft',{reference:'active_draft'}),'proposed','draft'],
    ['Verified source read','اقرأ المستند الذي أرسلته',
      proposal('read_file',{sourceIds:['quote-verified']}),'proposed',null],
    ['Read business entity','شو رصيد العميل',
      proposal('read_business',{subject:{kind:'entity',id:'customer-verified'}}),
      'proposed','entity'],
    ['English analysis','Analyze this quote',
      proposal('analyze',{subject:{kind:'document',id:'quote-verified'}}),
      'proposed','document'],
    ['Arabic save ambiguous','احفظه',
      proposal('request_approval',{reference:'active_draft'}),
      'approval_required','draft'],
    ['Explicit financial execution','Post the invoice now',
      proposal('execute_approved'),'approval_required',null],
    ['Clarification','شو تقصد بالوثيقة؟',
      proposal('clarify',{missingFields:['document_reference']}),
      'needs_clarification',null],
  ];
  let success=0;
  for(const [category,message,fixture,status,target] of fixtures){
    await t.test(category,async()=>{
      const h=one(fixture);
      const p=await plan(h,message);
      assert.equal(p.status,status);
      assert.equal(p.intent.subjectRef?.kind??null,target);
      assert.equal(p.intent.executable,false);
      assert.equal(p.financialSaved,false);
      assert.equal(p.providerCalls,1);
      assert.equal(h.counters.calls,1);
      assert.ok(['ar','en','mixed','unknown'].includes(p.language));
      assert.ok(p.intent.argumentFacts.every(f=>f.provenanceStatus==='uncertain'));
      success++;
    });
  }
  assert.equal(success,fixtures.length);
});
test('foreign reference from model is not resolved and requires clarification',async()=>{
  const h=one(proposal('read_business',{
    subject:{kind:'document',id:'another-tenant-quote'}}));
  const p=await plan(h,'اقرأ فاتورة أخرى');
  assert.equal(p.status,'needs_clarification');
  assert.equal(p.intent.subjectRef,null);
  assert.equal(p.intent.unresolvedReferences[0].reason,
    'unverified_or_foreign_reference');
});
test('foreign-context scope is rejected before inference',async()=>{
  const h=one(proposal('edit_draft'),{
    context:context(scope({companyId:'another-company'})),
  });
  await assert.rejects(plan(h,'عدل'),/R07P_UNTRUSTED_CONTEXT_SCOPE/);
  assert.equal(h.counters.calls,0);
});
test('a forged context reference scope is rejected before inference',async()=>{
  const c=context();
  c.references[0].scopeKey='foreign-scope';
  const h=one(proposal('read_business'),{context:c});
  await assert.rejects(plan(h,'اقرأ العرض'),/R07P_UNTRUSTED_CONTEXT_SCOPE/);
  assert.equal(h.counters.calls,0);
});
test('revoked identity and forged branch are rejected before context or inference',async()=>{
  const h=one(proposal('edit_draft'),{revoked:true});
  await assert.rejects(plan(h,'غير السعر'),/AUTH_MEMBERSHIP_DENIED/);
  assert.equal(h.counters.loads,0);
  const x=one(proposal('edit_draft'));
  await assert.rejects(plan(x,'غير السعر',{branchId:'other-branch'}),
    /AUTH_MEMBERSHIP_DENIED/);
  assert.equal(x.counters.calls,0);
});
test('viewer and Advisor cannot stage even a draft creation',async()=>{
  const viewer=one(proposal('prepare_quote'),{role:'viewer'});
  const p=await plan(viewer,'أنشئ مسودة عرض سعر');
  assert.equal(p.status,'needs_clarification');
  assert.equal(p.intent.action,'clarify');
  assert.equal(viewer.counters.calls,0);
  const h=one(proposal('edit_draft',{reference:'active_draft'}));
  const result=await plan(h,'عدل المسودة',{mode:'advisor'});
  assert.equal(result.status,'needs_clarification');
  assert.equal(result.intent.executable,false);
  assert.deepEqual(result.intent.missingFields,['controller_permission']);
});
test('incomplete context fails closed on pronoun or last document',async()=>{
  const c=context(scope(),{historyComplete:false});
  const h=one(proposal('edit_draft',{reference:'active_draft',
    facts:[{name:'quantity',value:'12'}]}),{context:c});
  const p=await plan(h,'لا خلي الكمية 12');
  assert.equal(p.status,'needs_clarification');
  assert.equal(p.intent.subjectRef,null);
  assert.equal(p.intent.unresolvedReferences[0].reason,'incomplete_history');
});
test('multiple candidate last documents cannot be silently ordered or guessed',async()=>{
  const c=context();
  c.references.push({kind:'document',id:'another-quote',
    documentKind:'quotation',scopeKey:c.scopeKey});
  const h=one(proposal('read_business',{reference:'last_quotation'}),{context:c});
  const p=await plan(h,'اقرأ آخر عرض');
  assert.equal(p.status,'needs_clarification');
  assert.equal(p.intent.subjectRef,null);
  assert.deepEqual(p.intent.unresolvedReferences[0].candidateIds.sort(),
    ['another-quote','quote-verified']);
});
test('ambiguous line edit and forged line id cannot be applied',async()=>{
  const c=context();
  c.activeDraft.lineIds=['line-verified','second-line'];
  const p=await plan(one(proposal('edit_draft',{reference:'active_draft',
    facts:[{name:'quantity',value:'12'}]}),{context:c}),'الكمية 12');
  assert.equal(p.status,'needs_clarification');
  assert.equal(p.intent.unresolvedReferences[0].reason,'ambiguous_or_missing_line');
  const forged=await plan(one(proposal('edit_draft',{reference:'active_draft',
    facts:[{name:'quantity',value:'12'},{name:'line_id',value:'foreign-line'}]})),
    'الكمية 12 للصنف الآخر');
  assert.equal(forged.status,'needs_clarification');
  assert.equal(forged.intent.unresolvedReferences[0].reason,'unverified_line_reference');
});
test('unknown document source and source-less read fail safely',async()=>{
  const x=await plan(one(proposal('read_file',{sourceIds:['foreign-doc']})),
    'اقرأ الملف الآخر');
  assert.equal(x.status,'needs_clarification');
  assert.deepEqual(x.intent.referencedSourceIds,[]);
  const y=await plan(one(proposal('read_file')),'اقرأ الملف');
  assert.equal(y.status,'needs_clarification');
  assert.ok(y.intent.missingFields.includes('verified_source'));
});
test('strict schema rejects extra fields, malicious prototypes and forged output',async()=>{
  const invalid=[
    {...proposal('edit_draft'),executed:true},
    {...proposal('edit_draft'),facts:[{name:'quantity',value:'12',verified:true}]},
    {...proposal('edit_draft'),sourceIds:['same','same']},
    proposal('illegal_financial_writer'),
    Object.create({action:'edit_draft'}),
    'do the financial write',
  ];
  for(const value of invalid){
    const h=one(value);
    await assert.rejects(plan(h,'عدل'),/R07P_INVALID_STRUCTURED_CANDIDATE/);
    assert.equal(h.counters.calls,1);
  }
});
test('real execution claims are never emitted even for valid execute proposal',async()=>{
  const h=one(proposal('execute_approved',{
    subject:{kind:'draft',id:'draft-verified'},
  }));
  const p=await plan(h,'وافق واحفظه');
  assert.equal(p.status,'approval_required');
  assert.equal(p.intent.action,'clarify');
  assert.equal(p.intent.executable,false);
  assert.equal(p.financialSaved,false);
  assert.equal(p.assistantReply!==null,true);
});
test('single semantic call per planned turn; no retry or task creation',async()=>{
  const h=one(proposal('read_business',{reference:'last_quotation'}));
  const result=await plan(h,'اقرأ آخر عرض');
  assert.equal(result.providerCalls,1);
  assert.equal(h.counters.calls,1);
  assert.equal(result.intent.executable,false);
});
