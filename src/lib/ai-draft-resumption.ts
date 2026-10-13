import type {ConversationKernel} from './ai-conversation-kernel.js';
import {kernelScopeKey} from './ai-conversation-kernel.js';
import {assertFoundationApproval} from './ai-foundation-approval.js';
import {readyMissionStep} from './ai-mission-runner.js';
import type {VaultPayload} from '../types.js';

/** A working artifact is NOT a pending approval.
 * Restore a save/issue proposal into the clickable review UI only after its
 * real approval envelope is verified against current account, company, actor,
 * branch, exact payload and vault baseline. An ordinary unsaved review returns
 * null and keeps its editable source rows in the conversation kernel. */
/** Any edit to a reviewed draft invalidates the prior approval; re-review is
 * required explicitly. Do not turn an edit into an automatic save request. */
export function retireWorkingApproval(kernel:ConversationKernel,id:string):void{
  if(!id)return;
  kernel.cancelledApprovals=[...new Set([...(kernel.cancelledApprovals||[]),id])].slice(-100);
  for(const mission of kernel.missions||[]){
    if(mission.steps.some(step=>step.approvalId===id&&step.status==='needs_approval')){
      for(const step of mission.steps)if(step.status==='needs_approval')step.status='cancelled';
      mission.interruptedReason='Previous reviewed approval is no longer current. Review a fresh proposal before saving.';
    }
  }
}
export function resumableWorkingApproval(kernel:ConversationKernel,vault:VaultPayload):any|null{
  if(kernel.scope.scope!=='business'||!kernel.artifact)return null;
  const proposal=kernel.artifact.proposal as any;
  const approval=proposal?.foundationApproval;
  if(!approval)return null;
  try{
    if(!approval.scope||kernelScopeKey(approval.scope)!==kernelScopeKey(kernel.scope))
      throw new Error('Approval belongs to a different account, company, branch or conversation.');
    if(kernel.cancelledApprovals?.includes(approval.id))throw new Error('Declined approval cannot resume.');
    // An orphan approval with no mission receipt could have been applied
    // before a crash. Never resurrect a clickable save from that alone.
    const recordedMission=(kernel.missions||[]).find(m=>m.steps.some(step=>step.approvalId===approval.id));
    const recorded=recordedMission?.steps.find(step=>step.approvalId===approval.id);
    if(!recorded||recorded.status!=='needs_approval'||readyMissionStep(recordedMission!)?.id!==recorded.id)
      throw new Error('Only the next unattempted, dependency-ready mission approval may resume.');
    if(recorded.payload!==approval.payload)
      throw new Error('Approval payload and recorded mission differ.');
    assertFoundationApproval(vault,proposal);
    return proposal;
  }catch{
    // Preserve the unsaved document content; invalidate ONLY its old approval.
    const next=structuredClone(proposal);
    delete next.foundationApproval;
    kernel.artifact.proposal=next;
    const id=typeof approval.id==='string'?approval.id:'';
    retireWorkingApproval(kernel,id);
    return null;
  }
}
