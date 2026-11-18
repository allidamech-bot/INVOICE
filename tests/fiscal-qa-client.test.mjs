import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFiscalQaStatus,fiscalQaNextAction,fiscalQaClientEnabled} from '../dist/src/lib/fiscal-qa-client.js';
const base={environment:'simulation',workspaceId:'qa',unitActive:false,onboarding:null,capabilities:{enrollment:true,approval:false,preparation:false,submission:false}};
const check=(state,passed=0,required=6)=>({...base,onboarding:{state,passed,required,version:passed+1}});
test('registration UI follows server state, never offers duplicate or held requests',()=>{
 assert.equal(fiscalQaNextAction(base),'enroll');assert.equal(fiscalQaNextAction(check('checking',2)),'check');assert.equal(fiscalQaNextAction(check('checks-complete',6)),'operational');
 for(const state of ['operational-request-held','restart-required','operational-recorded'])assert.equal(fiscalQaNextAction(check(state,6)),null);
 assert.equal(fiscalQaNextAction({...base,unitActive:true}),null);
 assert.equal(fiscalQaNextAction({...base,capabilities:{...base.capabilities,enrollment:false}}),null);
});
test('projection refuses wrong workspace, production, invalid state and incomplete capabilities; strips secrets',()=>{
 const status=validateFiscalQaStatus({...base,secret:'private'},'qa');assert.deepEqual(status,base);
 for(const v of [{...base,environment:'production'},{...base,workspaceId:'other'},{...base,capabilities:{}},check('unknown'),check('checking',7),check('checking',0,4)])assert.throws(()=>validateFiscalQaStatus(v,'qa'));
});
test('no configured isolated Firebase app means no test commands',()=>{
 assert.equal(fiscalQaClientEnabled(),false);
});
