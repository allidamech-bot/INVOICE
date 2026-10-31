/**
 * R07P offline, blind 43-case evaluation protocol. This module NEVER performs
 * inference, network access, financial operations or credential discovery.
 * All capture metadata and provider identity are UNVERIFIED external claims.
 */
import {
  scoreR07PMultilingualReport,
  type R07PEvaluationGold,
  type R07PEvaluationPrediction,
  type R07PMultilingualReport,
} from './semantic-evaluation.js';

const kind='r07p_provider_capture_v1' as const;
const outcomes=['ok','timeout','provider_error','rate_limited',
  'privacy_denied','not_attempted'] as const;
type Outcome=typeof outcomes[number];
const record=(x:unknown):x is Record<string,unknown>=>x!==null&&
  typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;
const exact=(x:unknown,keys:readonly string[]):x is Record<string,unknown>=>
  record(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');
const token=(x:unknown):x is string=>typeof x==='string'&&
  x.length>0&&x.length<=160&&!/[\u0000-\u001f\u007f]/u.test(x);
const hash=(x:unknown):x is string=>typeof x==='string'&&
  /^[a-f0-9]{64}$/.test(x);
const safeInteger=(x:unknown):x is number=>Number.isSafeInteger(x)&&
  (x as number)>=0&&(x as number)<=50_000;
const reject=(code:string):never=>{throw new Error(code);};
const percentile=(xs:number[],p:number):number|null=>{
  if(!xs.length)return null;
  const sorted=[...xs].sort((a,b)=>a-b);
  return sorted[Math.ceil(p*sorted.length)-1]??null;
};
export interface R07PBlindPrompt {
  caseId:string;
  language:'ar'|'en'|'mixed';
  utterance:string;
}
export interface R07PBlindPromptSet {
  schemaVersion:1;
  kind:'r07p_blind_prompts_v1';
  corpusSha256:string;
  prompts:R07PBlindPrompt[];
  containsExpectedLabels:false;
  source:'synthetic_test_corpus';
}
export interface R07PBenchmarkSummary {
  schemaVersion:1;
  kind:'r07p_unverified_benchmark_report_v1';
  corpusSha256:string;
  providerId:string;
  modelId:string;
  runId:string;
  totalCases:number;
  attempted:number;
  responses:number;
  outcomes:Record<Outcome,number>;
  latencyMs:{attemptedP50:number|null;attemptedP95:number|null;max:number|null};
  semantic:R07PMultilingualReport;
  provenanceVerified:false;
  accountFreeVerified:false;
  privacyPermissionVerified:false;
  productionAcceptance:'not_assessed';
}

/** Export only messages, language and case IDs. Never serialize gold labels. */
export function makeR07PBlindPromptSet(
  cases:readonly R07PEvaluationGold[],corpusSha256:string,
):R07PBlindPromptSet{
  if(!hash(corpusSha256))return reject('R07P_BENCH_INVALID_HASH');
  scoreR07PMultilingualReport(cases,[]);
  return {schemaVersion:1,kind:'r07p_blind_prompts_v1',corpusSha256,
    prompts:cases.map(c=>({caseId:c.id,language:c.language,utterance:c.utterance})),
    containsExpectedLabels:false,source:'synthetic_test_corpus'};
}

/** Fail closed on duplicates, omissions, unknown IDs, or oracle labels. */
export function scoreR07PBenchmarkCapture(
  cases:readonly R07PEvaluationGold[],raw:unknown,corpusSha256:string,
):R07PBenchmarkSummary{
  if(!hash(corpusSha256))return reject('R07P_BENCH_INVALID_HASH');
  if(!exact(raw,['schemaVersion','kind','corpusSha256',
    'providerId','modelId','runId','observations'])||
    raw.schemaVersion!==1||raw.kind!==kind||
    raw.corpusSha256!==corpusSha256||
    !token(raw.providerId)||!token(raw.modelId)||!token(raw.runId)||
    !Array.isArray(raw.observations))
    return reject('R07P_BENCH_INVALID_CAPTURE');
  const casesById=new Map(cases.map(c=>[c.id,c]));
  const observations=raw.observations;
  if(observations.length!==cases.length||casesById.size!==cases.length)
    return reject('R07P_BENCH_INCOMPLETE_CAPTURE');
  const found=new Set<string>();
  const counts=Object.fromEntries(outcomes.map(o=>[o,0])) as Record<Outcome,number>;
  const durations:number[]=[];
  const predictions:R07PEvaluationPrediction[]=[];
  for(const item of observations){
    if(!record(item)||!['ok',...outcomes.slice(1)].includes(
      item.outcome as Outcome)||!token(item.caseId)||
      !casesById.has(item.caseId)||found.has(item.caseId)||
      !safeInteger(item.latencyMs)||
      !exact(item,item.outcome==='ok'?
        ['caseId','outcome','latencyMs','candidate']:
        ['caseId','outcome','latencyMs']))
      return reject('R07P_BENCH_INVALID_OBSERVATION');
    if(item.outcome==='not_attempted'&&item.latencyMs!==0)
      return reject('R07P_BENCH_INVALID_OBSERVATION');
    const outcome=item.outcome as Outcome;
    found.add(item.caseId as string);
    counts[outcome]++;
    if(outcome!=='not_attempted')durations.push(item.latencyMs as number);
    if(outcome==='ok')predictions.push({
      caseId:item.caseId as string,candidate:item.candidate,
    });
  }
  if(found.size!==cases.length)
    return reject('R07P_BENCH_INCOMPLETE_CAPTURE');
  const semantic=scoreR07PMultilingualReport(cases,predictions);
  return {
    schemaVersion:1,kind:'r07p_unverified_benchmark_report_v1',
    corpusSha256,providerId:raw.providerId as string,
    modelId:raw.modelId as string,runId:raw.runId as string,
    totalCases:cases.length,attempted:cases.length-counts.not_attempted,
    responses:counts.ok,outcomes:counts,
    latencyMs:{attemptedP50:percentile(durations,0.5),
      attemptedP95:percentile(durations,0.95),
      max:durations.length?Math.max(...durations):null},
    semantic,provenanceVerified:false,accountFreeVerified:false,
    privacyPermissionVerified:false,productionAcceptance:'not_assessed',
  };
}
