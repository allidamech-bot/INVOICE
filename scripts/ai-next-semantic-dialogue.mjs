#!/usr/bin/env node
/**
 * OFFLINE ONLY: synthetic blind 27-turn conversation challenge.
 *
 * export:  no gold answers and no provider calls.
 * baseline: evaluates the existing LOCAL single-turn recognizer honestly.
 * score:   scores a supplied, unverified external capture from disk.
 * Never treats local fixtures as proven model accuracy or production consent.
 */
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeR07TBlindDialogueSet,scoreR07TDialogueCapture}
  from '../dist/src/ai-next/router/semantic-dialogue-benchmark.js';
import {recognizeR07PLocalStructuredIntent}
  from '../dist/src/ai-next/router/local-structured-intents.js';

const fail=code=>{throw Error(code);};
const bounded=(filename,max)=>{
  const stat=statSync(filename);
  if(!stat.isFile()||stat.size>max)return fail('R07T_INVALID_FILE');
  return readFileSync(filename);
};
try{
  const mode=process.argv[2];
  if(!['export','baseline','score'].includes(mode)||
    (mode==='score'?process.argv.length!==4:process.argv.length!==3))
    fail('R07T_INVALID_COMMAND');
  const bytes=bounded(new URL(
    '../tests/ai-next/r07t-dialogue-gold.json',import.meta.url),256*1024);
  const corpus=JSON.parse(bytes.toString('utf8'));
  if(corpus.schemaVersion!==1||!Array.isArray(corpus.scenarios))
    fail('R07T_INVALID_GOLD');
  const sha=createHash('sha256').update(bytes).digest('hex');
  let result;
  if(mode==='export'){
    result=makeR07TBlindDialogueSet(corpus.scenarios,sha);
  }else{
    const capture=mode==='score'?
      JSON.parse(bounded(process.argv[3],512*1024).toString('utf8')):
      {
        schemaVersion:1,kind:'r07t_dialogue_capture_v1',
        corpusSha256:sha,runId:'local-rule-baseline',
        observations:corpus.scenarios.flatMap(s=>s.turns.map(t=>{
          const candidate=recognizeR07PLocalStructuredIntent(t.message);
          return candidate?{scenarioId:s.scenarioId,turnId:t.turnId,
            outcome:'ok',latencyMs:0,candidate}:
            {scenarioId:s.scenarioId,turnId:t.turnId,
              outcome:'not_attempted',latencyMs:0};
        })),
      };
    const scored=scoreR07TDialogueCapture(corpus.scenarios,capture,sha);
    // Flag the baseline clearly. The real provider path may only be evaluated
    // by an independently captured and privacy-approved separate process.
    result=mode==='baseline'?{
      ...scored,ruleBasedOnly:true,modelCalls:0,
      contextUsedForInference:false,
    }:scored;
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(e){
  const code=e instanceof Error&&/^R07T_[A-Z_]+$/.test(e.message)?
    e.message:'R07T_EVALUATION_FAILED';
  process.stderr.write(code+'\n');
  process.exitCode=1;
}
