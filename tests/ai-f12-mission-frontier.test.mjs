import test from 'node:test';
import assert from 'node:assert/strict';
import {createMission,readyMissionStep,missionProgress,pendingMissionProposal,beginMissionStep,finishMissionStep,recoverMissions} from '../dist/src/lib/ai-mission-runner.js';
import {readFile} from 'node:fs/promises';

const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'mission-f12',accountId:'qa'};
function proposal(index){return{capability:'tool.execute',tool:'customer.update',args:{customerId:'customer-'+index,city:'Homs'},label:'Step '+index,foundationApproval:{id:'approved-'+index}};}
function fixture(){const actions=[proposal(1),proposal(2),proposal(3)];return{actions,mission:createMission(scope,{capability:'tool.plan',label:'Three approvals',steps:actions})};}

test('F12 only offers first dependency-complete step, not all three risky approvals',()=>{
 const {actions,mission}=fixture();
 assert.equal(readyMissionStep(mission).approvalId,actions[0].foundationApproval.id);
 const offered=pendingMissionProposal(mission);
 assert.equal(offered.capability,'tool.execute');
 assert.equal(offered.foundationApproval.id,actions[0].foundationApproval.id);
 assert.deepEqual(missionProgress(mission),{completed:0,total:3,pending:3,blocked:false});
 assert.throws(()=>beginMissionStep([mission],actions[1]),/preceding/);
});
test('F12 each successful write exposes next step only with independent approval',()=>{
 const {actions,mission}=fixture();
 finishMissionStep(beginMissionStep([mission],actions[0]),true,'saved-1');
 assert.equal(pendingMissionProposal(mission).foundationApproval.id,'approved-2');
 assert.deepEqual(missionProgress(mission),{completed:1,total:3,pending:2,blocked:false});
 finishMissionStep(beginMissionStep([mission],actions[1]),true,'saved-2');
 assert.equal(pendingMissionProposal(mission).foundationApproval.id,'approved-3');
 finishMissionStep(beginMissionStep([mission],actions[2]),true,'saved-3');
 assert.equal(pendingMissionProposal(mission),null);
 assert.deepEqual(missionProgress(mission),{completed:3,total:3,pending:0,blocked:false});
});
test('F12 uncertainty or crash blocks every future approval without replay',()=>{
 const {actions,mission}=fixture();
 beginMissionStep([mission],actions[0]);
 assert.equal(pendingMissionProposal(mission),null);
 const reboot=recoverMissions([mission],scope)[0];
 assert.equal(reboot.steps[0].status,'uncertain');
 assert.equal(readyMissionStep(reboot),null);
 assert.equal(missionProgress(reboot).blocked,true);
 assert.throws(()=>beginMissionStep([reboot],actions[0]),/replayed/);
 assert.throws(()=>beginMissionStep([reboot],actions[1]),/preceding/);
});
test('F12 cancelled predecessor never makes dependent step actionable',()=>{
 const {mission}=fixture();
 mission.steps[0].status='cancelled';
 assert.equal(readyMissionStep(mission),null);
 assert.equal(pendingMissionProposal(mission),null);
 assert.equal(missionProgress(mission).blocked,true);
});
test('F12 UI and runtime never auto-execute successor and reset acknowledgement',async()=>{
 const [ui,runtime]=await Promise.all([
 readFile(new URL('../src/components/AiCommercialWorkspace.tsx',import.meta.url),'utf8'),
 readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8')
 ]);
 assert.match(ui,/missionProgress\(m\)\.completed/);
 assert.match(ui,/disabled=\{busy\|\|!pendingMissionProposal\(m\)\}/);
 assert.match(runtime,/const ready=mission\?pendingMissionProposal\(mission\):null/);
 assert.match(runtime,/__workspaceReviewedProposal:null/);
 assert.match(runtime,/Review and approve separately; it has NOT executed/);
 assert.match(runtime,/const rechecked=ready\?await resumeVaultSession\(\):null/);
 const before=runtime.indexOf('finishMissionStep(step,'),after=runtime.indexOf('const ready=mission?pendingMissionProposal',before);
 assert.ok(before>0&&after>before,'next step is never surfaced before previous result recorded');
});
