/**
 * R07T: OFFLINE, disabled, multi-turn language QUALITY gate.
 *
 * This is a blind synthetic evaluation contract, not a conversation
 * coordinator, provider caller, memory authority, or financial writer.
 * It cannot attest actual provider identity, consent, zero cost or readiness.
 */
import {
  scoreR07PMultilingualReport,
  type R07PEvaluationGold,
  type R07PEvaluationPrediction,
  type R07PMultilingualReport,
} from './semantic-evaluation.js';

const record=(v:unknown):v is Record<string,unknown>=>v!==null&&
  typeof v==='object'&&!Array.isArray(v)&&
  Object.getPrototypeOf(v)===Object.prototype;
const keys=(v:Record<string,unknown>,required:string[])=>{
  const actual=Object.keys(v).sort(),expected=[...required].sort();
  return actual.length===expected.length&&
    actual.every((x,i)=>x===expected[i]);
};
const id=(v:unknown):v is string=>typeof v==='string'&&
  /^[a-z][a-z0-9_-]{1,63}$/u.test(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&
  v.length<=2000&&!/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/u.test(v);
const sha256=(v:unknown):v is string=>typeof v==='string'&&
  /^[a-f0-9]{64}$/u.test(v);
const err=(code:string):never=>{throw Error(code);};
const statuses=['ok','not_attempted','timeout','rate_limited',
  'provider_error','privacy_denied'] as const;
type Status=typeof statuses[number];
const percentile=(values:number[],p:number):number|null=>
  values.length?[...values].sort((a,b)=>a-b)[
    Math.ceil(p*values.length)-1]??null:null;

export interface R07TDialogueTurn{
  turnId:string;
  message:string;
  history:{role:'user'|'assistant';text:string}[];
  expected:R07PEvaluationGold['expected'];
}
export interface R07TDialogue{
  scenarioId:string;
  language:'ar'|'en'|'mixed';
  turns:R07TDialogueTurn[];
}
export interface R07TDialogueObservation{
  scenarioId:string;
  turnId:string;
  outcome:Status;
  latencyMs:number;
  candidate?:unknown;
}
export interface R07TDialogueCapture{
  schemaVersion:1;
  kind:'r07t_dialogue_capture_v1';
  corpusSha256:string;
  runId:string;
  observations:R07TDialogueObservation[];
}
export interface R07TDialogueScore{
  schemaVersion:1;
  kind:'r07t_unverified_dialogue_report_v1';
  corpusSha256:string;
  runId:string;
  scenarios:number;
  totalTurns:number;
  attempted:number;
  observations:Record<Status,number>;
  latencyMs:{p50:number|null;p95:number|null};
  semantic:R07PMultilingualReport;
  dialogueFullyExact:number;
  dialogueFullyExactPercent:number;
  failedScenarios:string[];
  /** A command to issue/post financially, when NOT requested by the user. */
  unexpectedFinancialExecutionIntents:number;
  modelOriginVerified:false;
  accountFreeVerified:false;
  privacyPermissionVerified:false;
  productionAcceptance:'not_assessed';
}
function validate(cases:readonly R07TDialogue[]):R07PEvaluationGold[]{
  if(!Array.isArray(cases)||cases.length<3||cases.length>100)
    return err('R07T_INVALID_GOLD');
  const scenarios=new Set<string>(),turns=new Set<string>();
  const flattened:R07PEvaluationGold[]=[];
  for(const scenario of cases){
    if(!record(scenario)||!keys(scenario,['scenarioId','language','turns'])||
      !id(scenario.scenarioId)||scenarios.has(scenario.scenarioId)||
      !['ar','en','mixed'].includes(scenario.language)||
      !Array.isArray(scenario.turns)||scenario.turns.length<2||
      scenario.turns.length>10)return err('R07T_INVALID_GOLD');
    scenarios.add(scenario.scenarioId);
    for(const turn of scenario.turns){
      if(!record(turn)||!keys(turn,['turnId','message','history','expected'])||
        !id(turn.turnId)||!text(turn.message)||
        !Array.isArray(turn.history)||turn.history.length>16||
        !turn.history.every(m=>record(m)&&keys(m,['role','text'])&&
          ['user','assistant'].includes(m.role as string)&&text(m.text))||
        !record(turn.expected))return err('R07T_INVALID_GOLD');
      const pair=scenario.scenarioId+':'+turn.turnId;
      if(turns.has(pair))return err('R07T_INVALID_GOLD');
      turns.add(pair);
      flattened.push({
        id:pair,language:scenario.language,utterance:turn.message,
        expected:turn.expected as R07PEvaluationGold['expected'],
      });
    }
  }
  try{scoreR07PMultilingualReport(flattened,[]);}
  catch{return err('R07T_INVALID_GOLD');}
  return flattened;
}
/** Exports only user messages and prior conversation snippets. NO gold labels. */
export function makeR07TBlindDialogueSet(cases:readonly R07TDialogue[],
  corpusSha256:string){
  if(!sha256(corpusSha256))return err('R07T_INVALID_HASH');
  validate(cases);
  return {
    schemaVersion:1 as const,kind:'r07t_blind_dialogues_v1' as const,
    corpusSha256,source:'synthetic_test_only' as const,
    containsExpectedLabels:false as const,
    scenarios:cases.map(s=>({
      scenarioId:s.scenarioId,language:s.language,
      turns:s.turns.map(t=>({
        turnId:t.turnId,message:t.message,history:t.history,
      })),
    })),
  };
}
/**
 * Every turn is REQUIRED even on provider failure/skips. The overall
 * denominator is all turns, and a dialogue passes only when ALL turns
 * are exactly correct. This is NOT accuracy proof without real observations.
 */
export function scoreR07TDialogueCapture(cases:readonly R07TDialogue[],
  raw:unknown,corpusSha256:string):R07TDialogueScore{
  if(!sha256(corpusSha256))return err('R07T_INVALID_HASH');
  const gold=validate(cases);
  if(!record(raw)||!keys(raw,['schemaVersion','kind','corpusSha256',
    'runId','observations'])||raw.schemaVersion!==1||
    raw.kind!=='r07t_dialogue_capture_v1'||
    raw.corpusSha256!==corpusSha256||!id(raw.runId)||
    !Array.isArray(raw.observations)||raw.observations.length!==gold.length)
    return err('R07T_INVALID_CAPTURE');
  const refs=new Set(gold.map(c=>c.id)),seen=new Set<string>(),
    predictions:R07PEvaluationPrediction[]=[];
  const counts=Object.fromEntries(statuses.map(x=>[x,0])) as
    Record<Status,number>;
  const latencies:number[]=[];
  for(const o of raw.observations){
    if(!record(o)||!id(o.scenarioId)||!id(o.turnId)||
      !statuses.includes(o.outcome as Status)||
      !Number.isSafeInteger(o.latencyMs)||o.latencyMs<0||
      o.latencyMs>50_000||!keys(o,o.outcome==='ok'?
        ['scenarioId','turnId','outcome','latencyMs','candidate']:
        ['scenarioId','turnId','outcome','latencyMs']))
      return err('R07T_INVALID_OBSERVATION');
    const key=o.scenarioId+':'+o.turnId;
    if(!refs.has(key)||seen.has(key)||
      o.outcome==='not_attempted'&&o.latencyMs!==0)
      return err('R07T_INVALID_OBSERVATION');
    seen.add(key);
    const outcome=o.outcome as Status;
    counts[outcome]++;
    if(outcome!=='not_attempted')latencies.push(o.latencyMs as number);
    if(outcome==='ok')predictions.push({caseId:key,candidate:o.candidate});
  }
  if(seen.size!==refs.size)return err('R07T_INVALID_CAPTURE');
  const semantic=scoreR07PMultilingualReport(gold,predictions);
  const byId=new Map(semantic.overall.details.map(x=>[x.caseId,x]));
  const failedScenarios=cases.filter(s=>!s.turns.every(t=>{
    const d=byId.get(s.scenarioId+':'+t.turnId);
    return d?.provided&&d.valid&&d.errors.length===0;
  })).map(s=>s.scenarioId);
  const dialogueFullyExact=cases.length-failedScenarios.length;
  return {
    schemaVersion:1,kind:'r07t_unverified_dialogue_report_v1',
    corpusSha256,runId:raw.runId as string,scenarios:cases.length,
    totalTurns:gold.length,attempted:gold.length-counts.not_attempted,
    observations:counts,
    latencyMs:{p50:percentile(latencies,0.5),p95:percentile(latencies,0.95)},
    semantic,dialogueFullyExact,
    dialogueFullyExactPercent:Math.round(10000*dialogueFullyExact/cases.length)/100,
    failedScenarios,
    unexpectedFinancialExecutionIntents:
      semantic.overall.unexpectedFinancialExecutionIntents,
    modelOriginVerified:false,accountFreeVerified:false,
    privacyPermissionVerified:false,productionAcceptance:'not_assessed',
  };
}
