/**
 * Read-only Firebase Cloud Shell gate for LOUREX INVOICE.
 *
 * Uses the operator's local gcloud session. No Firebase credentials are
 * requested, printed, persisted, or uploaded; the access token is kept in
 * memory only. Calls ONLY Firebase Security Rules release / ruleset GET.
 * Never deploys, modifies, merges, or automatically trusts live rules.
 */
import {spawnSync} from 'node:child_process';
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
    ||!new RegExp('^projects/'+PROJECT+'/rulesets/[A-Za-z0-9_-]+
}
main().catch(error=>fail(String(error?.message||'Rules inspection failed.').slice(0,280)));
).test(rulesetName))
    return fail('Unexpected published Firebase release/ruleset identifier.');
 const ruleset=await get(rulesetName);
 const capturedAtUtc=new Date().toISOString();
 const {content:current,evidence}=inspectPublishedRulesEvidence({
  project:PROJECT,release,ruleset,checkoutSource:proposed,capturedAtUtc
 });
 mkdirSync(backupRoot,{recursive:true,mode:0o700});
 const timestamp=capturedAtUtc.replace(/[:.]/g,'-');
 const stem=PROJECT+'-'+timestamp+'-'+evidence.publishedSourceSha256.slice(0,12);
 const destination=join(backupRoot,stem+'.rules');
 const manifest=join(backupRoot,stem+'.evidence.json');
 // Both files are private and exclusively created; never store a token.
 writeFileSync(destination,current,{mode:0o600,flag:'wx'});
 writeFileSync(manifest,JSON.stringify(evidence,null,2)+'\\n',{mode:0o600,flag:'wx'});
 status('Project: '+PROJECT);
 status('Published Firestore release: '+evidence.releaseName);
 status('Release last updated: '+(evidence.releaseUpdatedAt||'UNAVAILABLE'));
 status('Current ruleset: '+evidence.rulesetName);
 status('Ruleset created: '+(evidence.rulesetCreatedAt||'UNAVAILABLE'));
 status('Live rules SHA-256: '+evidence.publishedSourceSha256);
 status('Checkout rules SHA-256: '+evidence.checkedInSourceSha256);
 status('Private rules backup: '+destination);
 status('Private provenance evidence: '+manifest);
 status(evidence.byteExactMatch
  ? 'SOURCE_MATCH: downloaded published rules equal this checkout byte-for-byte.'
  : 'SOURCE_DIFFERENT: inspect the private backup and resolve differences; do NOT publish automatically.');
 if(!evidence.releaseMetadataComplete)status('EVIDENCE_INCOMPLETE: Firebase release time or ruleset creation time missing.');
 status('REVIEW_REQUIRED: source hash agreement is not cross-UID authorization or final 35-B acceptance.');
 status('READ_ONLY_COMPLETE: no Firebase write, deployment or Rules publish attempted.');
}
main().catch(error=>fail(String(error?.message||'Rules inspection failed.').slice(0,280)));
