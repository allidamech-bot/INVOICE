#!/usr/bin/env node
/**
 * Local-only R07P scorer. It reads ONLY independently captured structured
 * predictions and the fixed synthetic gold corpus. It does not connect to
 * AI providers, Firebase, financial storage, or the production application.
 *
 * Usage: node scripts/ai-next-semantic-report.mjs <captured-predictions.json>
 * Capture schema: {schemaVersion:1,captureType:'external_predictions' |
 *   'synthetic_fixture',corpusSha256:'...',predictions:[{caseId,candidate}]}.
 *
 * The captureType is an UNVERIFIED caller assertion, never proof of real
 * inference, zero cost, privacy permission, or production acceptance.
 */
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scoreR07PMultilingualReport} from
  '../dist/src/ai-next/router/semantic-evaluation.js';

const reject=code=>{throw new Error(code);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.getPrototypeOf(v)===Object.prototype;
const exactKeys=(value,keys)=>object(value)&&
  Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const readBounded=(path,maxBytes)=>{
  if(!statSync(path).isFile()||statSync(path).size>maxBytes)
    reject('R07P_CAPTURE_FILE_REJECTED');
  return readFileSync(path);
};
try{
  if(process.argv.length!==3)
    reject('R07P_CAPTURE_PATH_REQUIRED');
  const bytes=readBounded(process.argv[2],256*1024);
  const capture=JSON.parse(bytes.toString('utf8'));
  if(!exactKeys(capture,[
    'schemaVersion','captureType','corpusSha256','predictions',
  ])||capture.schemaVersion!==1||
    !['external_predictions','synthetic_fixture'].includes(capture.captureType)||
    typeof capture.corpusSha256!=='string'||
    !/^[a-f0-9]{64}$/.test(capture.corpusSha256)||
    !Array.isArray(capture.predictions)||
    !capture.predictions.every(p=>exactKeys(p,['caseId','candidate'])))
    reject('R07P_CAPTURE_INVALID_SCHEMA');
  const goldBytes=readBounded(new URL(
    '../tests/ai-next/r07p-semantic-evaluation-gold.json',import.meta.url),256*1024);
  const actualHash=createHash('sha256').update(goldBytes).digest('hex');
  if(actualHash!==capture.corpusSha256)
    reject('R07P_CAPTURE_CORPUS_HASH_MISMATCH');
  const corpus=JSON.parse(goldBytes.toString('utf8'));
  if(!exactKeys(corpus,['schemaVersion','description','cases'])||
    corpus.schemaVersion!==1)
    reject('R07P_EVAL_INVALID_GOLD_CORPUS');
  const report=scoreR07PMultilingualReport(corpus.cases,capture.predictions);
  // Never print raw candidates, utterances, customer data, or secrets.
  process.stdout.write(JSON.stringify({
    schemaVersion:1,captureType:capture.captureType,
    captureTypeVerified:false,corpusSha256:actualHash,report,
  },null,2)+'\n');
}catch(error){
  // Never print the user-supplied path or JSON data in CI logs.
  const code=error instanceof Error&&/^R07P_[A-Z_]+$/.test(error.message)
    ?error.message:'R07P_CAPTURE_FAILED';
  process.stderr.write(code+'\n');
  process.exitCode=1;
}
