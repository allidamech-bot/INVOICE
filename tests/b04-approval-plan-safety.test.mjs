import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const script=await readFile('scripts/ai-conversation-owner-stage4-tools.mjs','utf8');

function functionSource(name){
  const start=script.indexOf('function '+name+'(');
  assert.ok(start>=0,'Missing generated runtime function '+name);
  const boundaries=[script.indexOf('\\nfunction ',start),script.indexOf('\\nasync function ',start)].filter(position=>position>start);
  const end=Math.min(...boundaries);
  assert.ok(Number.isFinite(end),'Missing function boundary for '+name);
  return script.slice(script.slice(start-6,start)==='async '?start-6:start,end);
}
function harness(executor=async()=>({summary:'Applied',id:'rec-1'})){
  const names=[
    '__lourexOrderedPlanSteps',
    '__lourexAdvanceToolPresentation',
    '__lourexRemainingPlan',
    '__lourexStopToolPlan',
    '__lourexApplyGenericToolStep',
    '__lourexApplyLegacyPlanStep',
    '__lourexApprovePlanStep',
    '__lourexDismissToolProposal'
  ];
  const events=[];
  const window={setTimeout:callback=>callback(),dispatchEvent:event=>{events.push(event);}};
  const CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
  const f=new Function('applyApprovedToolExecution','window','CustomEvent','capabilityRequiresApproval',
    names.map(functionSource).join('\n')+'\nreturn {'+names.join(',')+'};');
  return{...f(executor,window,CustomEvent,()=>true),events};
}
function instanceFor(plan){
  const audits=[];
  const instance={
    props:{language:'en'},mounted:true,applying:false,
    state:{proposal:plan,busy:false,error:'',messages:[],open:true},
    __lourexToolPresentation:{steps:(plan.steps||[plan]).map((step,i)=>({id:String(i),status:'approval'}))},
    setState(change,callback){this.state={...this.state,...(typeof change==='function'?change(this.state):change)};callback?.();},
    addAudit:(capability,outcome)=>audits.push(outcome)
  };
  return{instance,audits};
}

test('B04 approval plan: invalid, nested or oversized plans fail closed, without truncation',()=>{
  const {__lourexOrderedPlanSteps:order}=harness();
  const update={capability:'tool.execute',tool:'customer.update'};
  const nav={capability:'workspace.navigate',target:'documents'};
  assert.deepEqual(order({steps:[nav,update]}),[update,nav]);
  assert.equal(order({steps:[update,update,update,update,update,update]}).length,0);
  assert.equal(order({steps:[update,{capability:'tool.plan',steps:[update]}]}).length,0);
  assert.equal(order({steps:[update,null]}).length,0);
  assert.equal(order({steps:[]}).length,0);
});

test('B04 approval plan: a confirmed step advances one approval and tracks prior saves',()=>{
  const next={capability:'tool.execute',tool:'supplier.update'};
  const plan={capability:'tool.plan',steps:[{capability:'tool.execute',tool:'customer.update'},next]};
  const {instance}=instanceFor(plan);
  const api=harness();
  return api.__lourexApplyGenericToolStep(instance,plan.steps[0],plan,[next]).then(()=>{
    assert.equal(instance.state.proposal.capability,'tool.plan');
    assert.deepEqual(instance.state.proposal.steps,[next]);
    assert.equal(instance.state.proposal.completedSteps,1);
    assert.equal(instance.state.messages.length,1);
    assert.equal(api.events.length,1);
  });
});

test('B04 approval plan: a failed later step halts, preserves earlier completion and cancels remaining',async()=>{
  const failed={capability:'tool.execute',tool:'supplier.update'};
  const plan={capability:'tool.plan',steps:[failed,{capability:'tool.execute'}],completedSteps:2};
  const {instance,audits}=instanceFor(plan);
  instance.__lourexToolPresentation.steps.unshift({status:'done'});
  const api=harness(async()=>{throw new Error('Record changed in another session');});
  await api.__lourexApplyGenericToolStep(instance,failed,plan,plan.steps.slice(1));
  assert.equal(instance.state.proposal,null);
  assert.match(instance.state.error,/Record changed/);
  assert.match(instance.state.error,/2 earlier approved step/);
  assert.match(instance.state.messages.at(-1).text,/Remaining steps were not executed/);
  assert.equal(instance.__lourexToolPresentation.steps[0].status,'done');
  assert.equal(instance.__lourexToolPresentation.steps[1].status,'failed');
  assert.equal(instance.__lourexToolPresentation.steps[2].status,'dismissed');
  assert.ok(audits.includes('failed'));
});

test('B04 approval plan: legacy executor failure never advances to the next action',async()=>{
  const first={capability:'document.createDraft'};
  const plan={capability:'tool.plan',steps:[first,{capability:'item.updateMetadata'}],completedSteps:1};
  const {instance}=instanceFor(plan);
  instance.approveProposal=async()=>instance.setState({busy:false,error:'Document changed',proposal:first});
  const api=harness();
  api.__lourexApplyLegacyPlanStep(instance,first,plan,plan.steps.slice(1));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(instance.state.proposal,null);
  assert.match(instance.state.error,/Document changed/);
  assert.match(instance.state.error,/1 earlier approved step/);
  assert.equal(instance.__lourexPlanApprovalPending,false);
});

test('B04 approval plan: legacy approval confirms success before exposing next step',async()=>{
  const first={capability:'document.updateDraft'};
  const next={capability:'item.updateMetadata'};
  const plan={capability:'tool.plan',steps:[first,next]};
  const {instance}=instanceFor(plan);
  instance.approveProposal=async()=>instance.setState({busy:false,error:'',proposal:null});
  const api=harness();
  api.__lourexApplyLegacyPlanStep(instance,first,plan,[next]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(instance.state.proposal.steps,[next]);
  assert.equal(instance.state.proposal.completedSteps,1);
  assert.equal(instance.__lourexPlanApprovalPending,false);
});

test('B04 approval plan: stale approvals and cancellation do not execute pending actions',()=>{
  const proposal={capability:'tool.plan',steps:[{capability:'tool.execute'}],completedSteps:1};
  const {instance}=instanceFor(proposal);
  const api=harness();
  api.__lourexApprovePlanStep(instance,{...proposal});
  assert.equal(instance.state.proposal,proposal);
  api.__lourexDismissToolProposal(instance);
  assert.equal(instance.state.proposal,null);
  assert.match(instance.state.messages.at(-1).text,/remain saved/);
  assert.equal(instance.__lourexToolPresentation.steps[0].status,'dismissed');
});

test('B04 approval UX describes individual approval and non-rollback behavior',()=>{
  assert.match(script,/Each step requires approval/);
  assert.match(script,/Earlier saved steps are not rolled back/);
  assert.match(script,/الخطوات المحفوظة سابقًا لا تُلغى تلقائيًا/);
  assert.match(script,/instance\.state\.proposal!==plan/);
  assert.match(script,/__lourexStopToolPlan/);
});
