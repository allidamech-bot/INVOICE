import type { KernelScope } from './ai-conversation-kernel.js';
import { canonicalFoundationJson } from './ai-foundation-approval.js';
export type MissionStepStatus='completed'|'needs_approval'|'applying'|'uncertain'|'cancelled';
export interface MissionStep {id:string;dependencies:string[];status:MissionStepStatus;label:string;payload:string;approvalId:string;proposal?:any;resultRef?:string;startedAt?:string;completedAt?:string;}
export interface MissionEvidence {callId:string;toolId:string;state:'prepared'|'needs_approval'|'failed'|'blocked';data:unknown;evidenceRefs:string[];at:string;}
export interface MissionState {id:string;scope:KernelScope;goal:string;createdAt:string;steps:MissionStep[];interruptedReason?:string;evidence?:MissionEvidence[];}
export function createMission(scope:KernelScope,proposal:any,evidence:MissionEvidence[]=[]):MissionState {
  const proposals=proposal?.capability==='tool.plan'?proposal.steps:[proposal];
  if(!Array.isArray(proposals)||!proposals.length||proposals.length>5||scope.scope==='personal')throw new Error('Mission requires one to five scoped approval steps.');
  const ids=proposals.map(()=>crypto.randomUUID());
  const steps:MissionStep[]=proposals.map((p,i)=>{if(!p?.foundationApproval?.id)throw new Error('Mission step needs a reviewed approval envelope.');return{id:ids[i]!,dependencies:i?[ids[i-1]!]:[],status:'needs_approval',label:String(p.label||p.tool||p.capability),payload:canonicalFoundationJson(p),approvalId:p.foundationApproval.id,proposal:structuredClone(p)};});
  return {id:crypto.randomUUID(),scope:structuredClone(scope),goal:String(proposal.label||'Review action plan'),createdAt:new Date().toISOString(),steps,evidence:structuredClone(evidence)};
}
export function missionStep(missions:MissionState[],proposal:any){for(const mission of missions){const step=mission.steps.find(s=>s.approvalId===proposal?.foundationApproval?.id);if(step)return {mission,step};}return null;}
export function beginMissionStep(missions:MissionState[],proposal:any):MissionStep|undefined{
  const found=missionStep(missions,proposal);if(!found)return;
  const {mission,step}=found;
  if(step.status!=='needs_approval'||step.payload!==canonicalFoundationJson(proposal))throw new Error('Mission step cannot be replayed or changed. Review a new action.');
  if(step.dependencies.some(id=>mission.steps.find(s=>s.id===id)?.status!=='completed'))throw new Error('Complete the preceding reviewed step first.');
  step.status='applying';step.startedAt=new Date().toISOString();return step;
}
export function finishMissionStep(step:MissionStep|undefined,applied:boolean,resultRef=''){if(!step)return;step.status=applied?'completed':'uncertain';step.resultRef=resultRef;if(applied)step.completedAt=new Date().toISOString();}
export function cancelMission(mission:MissionState){if(mission.steps.some(s=>s.status==='applying'))throw new Error('Wait for the current approval to finish.');for(const step of mission.steps)if(step.status==='needs_approval')step.status='cancelled';mission.interruptedReason='Cancelled by user; completed and uncertain actions are retained.';}
/** A crash after a write started cannot make it safe to retry. */
export function recoverMissions(value:unknown,scope:KernelScope):MissionState[]{
  if(!Array.isArray(value))return[];
  return value.filter(m=>m&&JSON.stringify([m.scope?.accountId||'',m.scope?.scope,m.scope?.workspaceId,m.scope?.branchId,m.scope?.threadId])===JSON.stringify([scope.accountId||'',scope.scope,scope.workspaceId,scope.branchId,scope.threadId])&&typeof m.id==='string'&&Array.isArray(m.steps)&&m.steps.length<=5&&m.steps.every((s:any)=>s&&typeof s.id==='string'&&Array.isArray(s.dependencies)&&typeof s.payload==='string'&&typeof s.approvalId==='string'&&['needs_approval','completed','applying','uncertain','cancelled'].includes(s.status))).slice(-10).map(m=>({...structuredClone(m),steps:m.steps.map((s:MissionStep)=>({...s,status:s.status==='applying'?'uncertain':s.status})),interruptedReason:m.steps.some((s:MissionStep)=>s.status==='applying')?'Execution interrupted; verify records before preparing a new action.':m.interruptedReason}));
}

export function pendingMissionProposal(mission:MissionState):any|null {
 const steps=mission.steps.filter(s=>s.status==='needs_approval'&&s.proposal).map(s=>structuredClone(s.proposal));
 return steps.length===1?steps[0]:steps.length?{capability:'tool.plan',steps,label:mission.goal,rationale:'Resume reviewed mission; each step revalidates current records.'}:null;
}
