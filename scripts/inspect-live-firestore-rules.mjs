/**
 * Read-only Firebase Cloud Shell gate for LOUREX INVOICE.
 *
 * Uses the operator's local gcloud session. No Firebase credentials are
 * requested, printed, persisted, or uploaded; the access token is kept in
 * memory only. Calls ONLY Firebase Security Rules release / ruleset GET.
 * Never deploys, modifies, merges, or automatically trusts live rules.
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {inspectPublishedRulesEvidence} from './_firestore-published-rule-evidence.mjs';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const PROJECT='lourex-invoice';
const BASE='https://firebaserules.googleapis.com/v1/';
const expectedProject=process.env.LOUREX_FIREBASE_PROJECT_ID||PROJECT;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const proposed=readFileSync(join(root,'firestore.rules'),'utf8');
const backupRoot=resolve(homedir(),'lourex-firestore-rules-backups');
function fail(message){console.error('LIVE_RULES_INSPECTION_BLOCKED: '+message);process.exitCode=2;}
function status(message){console.log('LOUREX FIRESTORE READ-ONLY: '+message);}
function targetValid(){
 return expectedProject===PROJECT
  && process.argv.length===2
  && process.env.CI!=='true'
  && process.env.VERCEL!=='1'
  && !process.env.VERCEL_ENV;
}
async function main(){
 if(!targetValid())return fail('Requires local operator session and exact Firebase project lourex-invoice.');
 // A copied or locally edited firestore.rules must never be described as
 // representing a reviewed GitHub commit. This check runs before any token.
 const gitOpts={cwd:root,encoding:'utf8',timeout:10000,maxBuffer:524288};
 const gitHead=spawnSync('git',['rev-parse','--verify','HEAD'],gitOpts);
 if(gitHead.status!==0||!/^[a-f0-9]{40}$/.test(String(gitHead.stdout).trim()))
   return fail('A genuine checked-out Git commit is required for published Rules evidence.');
 const checkoutCommitSha=gitHead.stdout.trim();
 const trackedRules=spawnSync('git',['show','HEAD:firestore.rules'],gitOpts);
 if(trackedRules.status!==0||trackedRules.stdout!==proposed)
   return fail('firestore.rules is not identical to the reviewed Git checkout; restore a clean tracked rules file.');
 // gcloud is authenticated through Cloud Shell interactive Google sign-in.
 const token=spawnSync('gcloud',['auth','print-access-token'],{
  encoding:'utf8',timeout:10000,maxBuffer:32768
 });
 if(token.status!==0||!String(token.stdout).trim())return fail('Google Cloud session unavailable; sign in to Google Cloud Shell.');
 const accessToken=token.stdout.trim();
 async function get(path){
  const url=BASE+path;
  // Never follow caller-selected URLs or redirected hosts, even with token.
  const response=await fetch(url,{
   method:'GET',redirect:'error',
   headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'},
   signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error('Firebase Rules read failed (HTTP '+response.status+'). Check project permissions.');
  return response.json();
 }
 // A project's Firestore default database release is cloud.firestore.
 const release=await get('projects/'+PROJECT+'/releases/cloud.firestore');
 // Validate release response before issuing a second API request.
 const rulesetName=release?.rulesetName;
 if(release?.name!=='projects/'+PROJECT+'/releases/cloud.firestore'
    ||typeof rulesetName!=='string'
    ||!/^projects\/lourex-invoice\/rulesets\/[A-Za-z0-9_-]+$/.test(rulesetName))
    return fail('Unexpected published Firebase release/ruleset identifier.');
 const ruleset=await get(rulesetName);
 // Read the published release again: a concurrent Rules publication must not
 // turn a formerly current ruleset into falsely described current evidence.
 const recheckedRelease=await get('projects/'+PROJECT+'/releases/cloud.firestore');
 if(recheckedRelease?.name!==release.name
    ||recheckedRelease?.rulesetName!==release.rulesetName
    ||recheckedRelease?.updateTime!==release.updateTime)
   return fail('Published Firestore release changed during read; discard this evidence and retry later.');
 const capturedAtUtc=new Date().toISOString();
 const {content:current,evidence}=inspectPublishedRulesEvidence({
  project:PROJECT,release,ruleset,checkoutSource:proposed,capturedAtUtc
 });
 mkdirSync(backupRoot,{recursive:true,mode:0o700});
 const timestamp=capturedAtUtc.replace(/[:.]/g,'-');
 const stem=PROJECT+'-'+timestamp+'-'+evidence.publishedSourceSha256.slice(0,12);
 const destination=join(backupRoot,stem+'.rules');
 const manifest=join(backupRoot,stem+'.evidence.json');
 const comparison=join(backupRoot,stem+'.review.diff');
 // Never print the published source or its diff to stdout or CI. The full
 // contextual diff is available only as an operator-local mode-0600 file.
 writeFileSync(destination,current,{mode:0o600,flag:'wx'});
 const diff=spawnSync('diff',[
   '-u','--label','published-firestore-rules','--label','checked-in-firestore-rules',
   destination,join(root,'firestore.rules')
 ],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
 if(diff.error||![0,1].includes(diff.status))
   return fail('Cannot create a complete private Rules diff; review source backups manually.');
 const reviewHeader=[
   '# PRIVATE REVIEW ONLY — 35-B published Firestore Rules',
   '# - means published rule source; + means this checked-in repository source.',
   '# Security reviewer must examine complete /users/{userId}, nested',
   '# collections, and /publicShares/{shareId}, including wildcard/overlap.',
   '# Identical bytes do not prove owner authorization or cross-UID isolation.',
   '# Any difference has UNASSESSED access-control risk until manual review.',
   ''
 ].join(String.fromCharCode(10));
 const reviewText=reviewHeader+(diff.status===1
   ?diff.stdout
   :'BYTE_IDENTICAL: no textual difference in the two captured files.\n');
 writeFileSync(comparison,reviewText,{mode:0o600,flag:'wx'});
 // The manifest contains fingerprints and review flags, NOT Rules source.
 evidence.checkoutCommitSha=checkoutCommitSha;
 evidence.releaseRecheckMatched=true;
 evidence.privateDiffSha256=createHash('sha256').update(reviewText).digest('hex');
 evidence.differenceStatus=diff.status===0
   ?'BYTE_IDENTICAL_SECURITY_REVIEW_REQUIRED'
   :'SOURCE_DIFFERENT_RISK_NOT_ASSESSED';
 evidence.riskDisposition='PENDING_INDEPENDENT_SECURITY_REVIEW';
 writeFileSync(manifest,JSON.stringify(evidence,null,2)+String.fromCharCode(10),{mode:0o600,flag:'wx'});
 status('Project: '+PROJECT);
 status('Reviewed Git checkout HEAD: '+checkoutCommitSha);
 status('Published Firestore release: '+evidence.releaseName);
 status('Release last updated: '+(evidence.releaseUpdatedAt||'UNAVAILABLE'));
 status('Current ruleset: '+evidence.rulesetName);
 status('Ruleset created: '+(evidence.rulesetCreatedAt||'UNAVAILABLE'));
 status('Live rules SHA-256: '+evidence.publishedSourceSha256);
 status('Checkout rules SHA-256: '+evidence.checkedInSourceSha256);
 status('Private rules backup: '+destination);
 status('Private provenance evidence: '+manifest);
 status('Private complete contextual comparison: '+comparison);
 status('Published release stability recheck: PASSED (two read-only observations).');
 status('35-B risk classification: '+evidence.differenceStatus+'; manual review mandatory.');
 status(evidence.byteExactMatch
  ? 'SOURCE_MATCH: downloaded published rules equal this checkout byte-for-byte.'
  : 'SOURCE_DIFFERENT: inspect the private backup and resolve differences; do NOT publish automatically.');
 if(!evidence.releaseMetadataComplete)status('EVIDENCE_INCOMPLETE: Firebase release time or ruleset creation time missing.');
 status('REVIEW_REQUIRED: source hash agreement is not cross-UID authorization or final 35-B acceptance.');
 status('READ_ONLY_COMPLETE: no Firebase write, deployment or Rules publish attempted.');
}
main().catch(error=>fail(String(error?.message||'Rules inspection failed.').slice(0,280)));
