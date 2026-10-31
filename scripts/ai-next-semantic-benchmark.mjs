#!/usr/bin/env node
/**
 * No-network benchmark data preparation and scoring.
 *   node scripts/ai-next-semantic-benchmark.mjs export
 *   node scripts/ai-next-semantic-benchmark.mjs score <local-capture.json>
 * Does NOT invoke any AI provider or verify a pricing/permission claim.
 */
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeR07PBlindPromptSet,scoreR07PBenchmarkCapture} from
  '../dist/src/ai-next/router/semantic-benchmark.js';

const reject=code=>{throw new Error(code);};
const readBounded=(path,max)=>{
  const stat=statSync(path);
  if(!stat.isFile()||stat.size>max)return reject('R07P_BENCH_INVALID_FILE');
  return readFileSync(path);
};
try{
  const mode=process.argv[2];
  if(!['export','score'].includes(mode)||
    (mode==='export'&&process.argv.length!==3)||
    (mode==='score'&&process.argv.length!==4))
    reject('R07P_BENCH_INVALID_COMMAND');
  const bytes=readBounded(new URL(
    '../tests/ai-next/r07p-semantic-evaluation-gold.json',import.meta.url),256*1024);
  const gold=JSON.parse(bytes.toString('utf8'));
  const sha=createHash('sha256').update(bytes).digest('hex');
  if(gold.schemaVersion!==1||!Array.isArray(gold.cases))
    reject('R07P_BENCH_INVALID_GOLD');
  const result=mode==='export'?
    makeR07PBlindPromptSet(gold.cases,sha):
    scoreR07PBenchmarkCapture(gold.cases,
      JSON.parse(readBounded(process.argv[3],512*1024).toString('utf8')),sha);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){
  // Do not expose raw captures, credentials, or local paths in diagnostics.
  const code=error instanceof Error&&/^R07P_[A-Z_]+$/.test(error.message)
    ?error.message:'R07P_BENCH_FAILED';
  process.stderr.write(code+'\n');
  process.exitCode=1;
}
