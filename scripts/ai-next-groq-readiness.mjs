#!/usr/bin/env node
/**
 * Non-network, non-credential Groq account preflight.
 * Run only with an operator's sanitized nonsecret console observations.
 * It never accepts or uses an API key, never makes an API request,
 * never edits environment values or upgrades runtime model eligibility.
 */
import {readFileSync,statSync} from 'node:fs';
import {assessR07VGroqOperatorEvidence}
  from '../dist/src/ai-next/router/groq-synthetic-readiness.js';

const template={
  schemaVersion:1,kind:'r07v_groq_operator_console_v1',
  provider:'groq',observedAt:'1970-01-01T00:00:00Z',
  plan:'unknown',modelId:'unknown-model',
  organizationZdr:'unknown',
  optionalRetentionFeatures:'unknown',
  modelListed:'unknown',modelAvailableOnFreePlan:'unknown',
  jsonSchemaSupport:'unknown',
  rpm:0,rpd:0,tpm:0,explicitNoBillableUsage:'unknown',
  syntheticOnly:true,evidenceType:'self_reported_unverified',
};
try{
  const mode=process.argv[2];
  if(mode==='template'&&process.argv.length===3){
    process.stdout.write(JSON.stringify(template,null,2)+'\n');
  }else if(mode==='review'&&process.argv.length===4){
    const file=process.argv[3],stat=statSync(file);
    if(!stat.isFile()||stat.size>4096)
      throw Error('R07V_INVALID_OPERATOR_EVIDENCE');
    const evidence=JSON.parse(readFileSync(file,'utf8'));
    const now=new Date().toISOString().replace(/\.\d{3}Z$/u,'Z');
    const readiness=assessR07VGroqOperatorEvidence(evidence,now);
    process.stdout.write(JSON.stringify(readiness,null,2)+'\n');
  }else{
    throw Error('R07V_INVALID_COMMAND');
  }
}catch(err){
  // Avoid dumping a private local path, arbitrary input, or a credential
  // accidentally pasted into the evidence file.
  const code=err instanceof Error&&/^R07V_[A-Z_]+$/.test(err.message)?
    err.message:'R07V_INVALID_OPERATOR_EVIDENCE';
  process.stderr.write(code+'\n');process.exitCode=1;
}
