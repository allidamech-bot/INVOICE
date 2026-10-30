/**
 * R04 default-deny tool policy. Never pass a model-generated tool to
 * a financial persistence API. Execute and high-impact tools are OFF.
 */
import type {AuthenticatedScope,ConversationMode,ToolCall} from '../domain/contracts.js';
import {assertCoreContract} from '../domain/validation.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import {R04_LIVE_WRITES_ENABLED} from './drafts.js';

export const R04_SAFE_TOOLS=Object.freeze({
  'document.get':{operationType:'read',permission:'document.read'},
  'customer.getSummary':{operationType:'read',permission:'customer.read'},
  'product.getSummary':{operationType:'read',permission:'product.read'},
  'finance.getSummary':{operationType:'read',permission:'finance.read'},
  'pricing.margin':{operationType:'calculate',permission:'pricing.calculate'},
  'quotation.prepare':{operationType:'prepare',permission:'draft.prepare'},
} as const);
export type R04SafeToolId=keyof typeof R04_SAFE_TOOLS;
export interface ToolDecision {
  permitted:boolean;
  reason:string;
  needsHumanReview:boolean;
  liveFinancialWritesEnabled:false;
}
export function decideToolCall(input:{
  scope:AuthenticatedScope;
  mode:ConversationMode;
  call:ToolCall;
  authoritativePermissions:ReadonlySet<string>;
  trustedSourceStatuses:ReadonlyArray<{sourceId:string;complete:boolean}>;
}):ToolDecision{
  const deny=(reason:string):ToolDecision=>({
    permitted:false,reason,needsHumanReview:false,liveFinancialWritesEnabled:false,
  });
  const {scope,call}=input;
  if(!R04_LIVE_WRITES_ENABLED){
    // False for all outcomes, including otherwise authorized read/prepare.
  }
  try{exactScopeKey(scope);assertCoreContract('ToolCall',call);}
  catch{return deny('INVALID_TOOL_ENVELOPE');}
  if(exactScopeKey(scope)!==exactScopeKey(call.scope))
    return deny('TOOL_SCOPE_MISMATCH');
  if(call.operationType==='execute')return deny('FINANCIAL_EXECUTION_DISABLED');
  if(!(call.toolId in R04_SAFE_TOOLS))return deny('TOOL_NOT_ALLOWLISTED');
  const config=R04_SAFE_TOOLS[call.toolId as R04SafeToolId];
  if(config.operationType!==call.operationType)return deny('TOOL_OPERATION_MISMATCH');
  if(!input.authoritativePermissions.has(config.permission))
    return deny('MISSING_SERVER_PERMISSION');
  if(call.state!=='proposed'&&call.state!=='validated')
    return deny('TOOL_NOT_AT_SAFE_STAGE');
  if(input.mode==='advisor'&&call.operationType==='prepare')
    return deny('ADVISOR_READ_ONLY');
  if(scope.scopeType!=='business'&&call.operationType==='prepare')
    return deny('NO_BUSINESS_PREPARATION_IN_PERSONAL_SCOPE');
  if(scope.role==='viewer'&&call.operationType==='prepare')
    return deny('VIEWER_CANNOT_PREPARE_DRAFT');
  if(call.operationType==='prepare'){
    if(call.sourceCompletenessStatus!=='complete')
      return deny('UNVERIFIED_SOURCE_COVERAGE');
    if(new Set(call.evidenceIds).size!==call.evidenceIds.length)
      return deny('DUPLICATE_EVIDENCE');
    // Every source must be verified by the server; an empty source set is
    // valid only for a human-composed proposal, not for extracted claims.
    if(input.trustedSourceStatuses.some(s=>!s.complete))
      return deny('UNVERIFIED_SOURCE_COVERAGE');
  }
  return {permitted:true,reason:'SAFE_NON_EXECUTING_TOOL',
    needsHumanReview:call.operationType==='prepare',liveFinancialWritesEnabled:false};
}
