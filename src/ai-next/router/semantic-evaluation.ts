/**
 * R07P offline evaluation contract. No model, provider, database, finance
 * or production integration: compares independently labelled user intents
 * against separately collected structured predictions.
 *
 * The harness itself never supplies model predictions. All coverage and
 * scores are zero/unavailable without actual candidate data.
 */
import {parseR07PSemanticCandidate,
  type R07PSemanticCandidate} from './semantic-planner.js';

type CandidateAction=R07PSemanticCandidate['action'];
type Reference=R07PSemanticCandidate['reference'];
type Subject=R07PSemanticCandidate['subject'];
type Fact=R07PSemanticCandidate['facts'][number];

export interface R07PEvaluationGold {
  id:string;
  utterance:string;
  language:'ar'|'en'|'mixed';
  expected:{
    action:CandidateAction;
    reference:Reference;
    subject:Subject;
    facts:Fact[];
    missingFields:string[];
    sourceIds:string[];
  };
}
export interface R07PEvaluationPrediction {
  caseId:string;
  /** Untrusted raw structured model output (never test-injected ground truth). */
  candidate:unknown;
}
export interface R07PEvaluationCaseResult {
  caseId:string;
  provided:boolean;
  valid:boolean;
  actionCorrect:boolean;
  referenceCorrect:boolean;
  subjectCorrect:boolean;
  factsExact:boolean;
  missingFieldsExact:boolean;
  sourceIdsExact:boolean;
  unexpectedFinancialExecutionIntent:boolean;
  errors:string[];
}
export interface R07PEvaluationScore {
  total:number;provided:number;valid:number;
  /** All percentages use the TOTAL independently labelled cases, not only successes. */
  coverage:number;
  schemaValidity:number;
  actionAccuracy:number;
  referenceAccuracy:number;
  subjectAccuracy:number;
  factsExactMatch:number;
  missingFieldsExactMatch:number;
  sourceIdsExactMatch:number;
  fullExactMatch:number;
  unexpectedFinancialExecutionIntents:number;
  details:R07PEvaluationCaseResult[];
}

const id=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=160;
const unique=(v:readonly string[])=>new Set(v).size===v.length;
const canonical=(value:unknown):string=>{
  if(value===null||typeof value==='string'||typeof value==='boolean')
    return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)
    return '{'+Object.keys(value).sort().map(k=>
      JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])
    ).join(',')+'}';
  throw Error('R07P_EVAL_NON_CANONICAL_VALUE');
};
function sortedFacts(facts:readonly Fact[]):string[]{
  return facts.map(x=>canonical({name:x.name,value:x.value})).sort();
}
function normalizedStrings(v:readonly string[]):string[]{return [...v].sort();}
function equals(a:unknown,b:unknown):boolean{return canonical(a)===canonical(b);}
function validateGold(cases:readonly R07PEvaluationGold[]):void{
  if(!Array.isArray(cases)||!cases.length||cases.length>1000||
    !unique(cases.map(x=>x.id)))
    throw Error('R07P_EVAL_INVALID_GOLD_CORPUS');
  for(const c of cases){
    if(!c||!id(c.id)||!id(c.utterance)||
      !['ar','en','mixed'].includes(c.language)||
      !c.expected||
      !Array.isArray(c.expected.facts)||
      !Array.isArray(c.expected.missingFields)||
      !Array.isArray(c.expected.sourceIds)||
      !unique(c.expected.facts.map(f=>f.name))||
      !unique(c.expected.missingFields)||!unique(c.expected.sourceIds)){
      throw Error('R07P_EVAL_INVALID_GOLD_CORPUS');
    }
    try{parseR07PSemanticCandidate({
      action:c.expected.action,reference:c.expected.reference,
      subject:c.expected.subject,facts:c.expected.facts,
      missingFields:c.expected.missingFields,sourceIds:c.expected.sourceIds,
    });}catch{throw Error('R07P_EVAL_INVALID_GOLD_CORPUS');}
  }
}
function percent(n:number,total:number):number{
  return total?Math.round(10000*n/total)/100:0;
}
/** Missing predictions are included in the denominator, never silently dropped. */
export function scoreR07PSemanticCandidates(
  cases:readonly R07PEvaluationGold[],
  predictions:readonly R07PEvaluationPrediction[],
):R07PEvaluationScore{
  validateGold(cases);
  if(!Array.isArray(predictions)||predictions.length>cases.length||
    !predictions.every(x=>x&&id(x.caseId))||
    !unique(predictions.map(x=>x.caseId)))
    throw Error('R07P_EVAL_INVALID_PREDICTIONS');
  const byCase=new Map(cases.map(c=>[c.id,c]));
  if(predictions.some(p=>!byCase.has(p.caseId)))
    throw Error('R07P_EVAL_UNKNOWN_CASE');
  const byPrediction=new Map(predictions.map(p=>[p.caseId,p]));
  const details:R07PEvaluationCaseResult[]=[];
  let valid=0,action=0,reference=0,subject=0,facts=0,
    missing=0,sources=0,full=0,financial=0;
  for(const c of cases){
    const prediction=byPrediction.get(c.id);
    let candidate:R07PSemanticCandidate|null=null;
    const errors:string[]=[];
    if(prediction){
      try{candidate=parseR07PSemanticCandidate(prediction.candidate);}
      catch{errors.push('invalid_structured_candidate');}
    }else{errors.push('missing_prediction');}
    const ok=Boolean(candidate);
    if(ok)valid++;
    const a=Boolean(candidate&&candidate.action===c.expected.action);
    const r=Boolean(candidate&&candidate.reference===c.expected.reference);
    const s=Boolean(candidate&&equals(candidate.subject,c.expected.subject));
    const f=Boolean(candidate&&
      equals(sortedFacts(candidate.facts),sortedFacts(c.expected.facts))&&
      unique(candidate.facts.map(x=>x.name)));
    const m=Boolean(candidate&&equals(
      normalizedStrings(candidate.missingFields),
      normalizedStrings(c.expected.missingFields)));
    const x=Boolean(candidate&&equals(
      normalizedStrings(candidate.sourceIds),
      normalizedStrings(c.expected.sourceIds)));
    const unintended=Boolean(candidate&&
      candidate.action==='execute_approved'&&
      c.expected.action!=='execute_approved');
    if(a)action++;else errors.push('action_mismatch');
    if(r)reference++;else errors.push('reference_mismatch');
    if(s)subject++;else errors.push('subject_mismatch');
    if(f)facts++;else errors.push('facts_mismatch');
    if(m)missing++;else errors.push('missing_fields_mismatch');
    if(x)sources++;else errors.push('source_ids_mismatch');
    if(a&&r&&s&&f&&m&&x)full++;
    if(unintended){financial++;errors.push('unexpected_financial_execution_intent');}
    details.push({caseId:c.id,provided:Boolean(prediction),valid:ok,
      actionCorrect:a,referenceCorrect:r,subjectCorrect:s,
      factsExact:f,missingFieldsExact:m,sourceIdsExact:x,
      unexpectedFinancialExecutionIntent:unintended,errors});
  }
  return {
    total:cases.length,provided:predictions.length,valid,
    coverage:percent(predictions.length,cases.length),
    schemaValidity:percent(valid,cases.length),
    actionAccuracy:percent(action,cases.length),
    referenceAccuracy:percent(reference,cases.length),
    subjectAccuracy:percent(subject,cases.length),
    factsExactMatch:percent(facts,cases.length),
    missingFieldsExactMatch:percent(missing,cases.length),
    sourceIdsExactMatch:percent(sources,cases.length),
    fullExactMatch:percent(full,cases.length),
    unexpectedFinancialExecutionIntents:financial,
    details,
  };
}
