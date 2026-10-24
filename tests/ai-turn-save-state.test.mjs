import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {compiledReliabilityHarness} from './helpers/ai-reliability-runtime.mjs';
import {emptyVault} from '../dist/src/lib/defaults.js';

test('answered turn reports saving while preserving the pending guard and exact reply',async()=>{
 for(const fail of [false,true]){
  const {runtime,host,store,session}=await compiledReliabilityHarness(emptyVault());const h=host();
  let release,reject,calls=0;
  h.__lourexAssistantPersistQueue=new Promise((resolve,no)=>{release=resolve;reject=no;});
  h.ask=async()=>{calls++;h.setState({messages:[{id:'synthetic-answer',role:'assistant',text:'Synthetic answer 60.00%'}],busy:false});};
  runtime.installIntelligenceRuntime(h);
  const pending=h.ask('Explain this synthetic example.');
  for(let n=0;n<30&&!calls;n++)await setImmediate();
  await setImmediate();
  try{
   assert.equal(calls,1);assert.equal(h.state.__workspaceTurnSaving,true,'a finished reply must distinguish persistence from model processing');
   assert.equal(h.state.__workspaceTurnPending,true);assert.equal(h.__foundationTurnBusy,true);
   await h.ask('Must not double-send while saving');assert.equal(calls,1);
  }finally{if(fail)reject(new Error('Synthetic save failure'));else release();await pending;}
  assert.equal(h.state.__workspaceTurnSaving,false);assert.equal(h.state.__workspaceTurnPending,false);
  assert.equal(h.__foundationTurnBusy,false);assert.equal(h.state.messages[0].text,'Synthetic answer 60.00%');
  if(fail)assert.match(h.state.error,/Synthetic save failure/);
  else assert.ok((await store.loadAssistantState(session.key)).threads.some(t=>t.messages.some(m=>m.id==='synthetic-answer')));
 }
});
