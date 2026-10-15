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
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const PROJECT='lourex-invoice';
const BASE='https://firebaserules.googleapis.com/v1/';
const expectedProject=process.env.LOUREX_FIREBASE_PROJECT_ID||PROJECT;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const proposed=readFileSync(join(root,'firestore.rules'),'utf8');
const digest=value=>createHash('sha256').update(value).digest('hex');
const candidateSha=digest(proposed);
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
 const rulesetName=release?.rulesetName;
 if(typeof rulesetName!=='string'
    ||!new RegExp('^projects/'+PROJECT+'/rulesets/[A-Za-z0-9_-]+$').test(rulesetName))
    return fail('Unexpected Firebase ruleset identifier, refusing untrusted URL.');
 const ruleset=await get(rulesetName);
 const files=ruleset?.source?.files;
 if(!Array.isArray(files)||files.length!==1||typeof files[0]?.content!=='string'
     ||files[0].content.length>262144)
     return fail('Unexpected live rules format; no backup or comparison performed.');
 const current=files[0].content;
 const liveSha=digest(current);
 mkdirSync(backupRoot,{recursive:true,mode:0o700});
 const timestamp=new Date().toISOString().replace(/[:.]/g,'-');
 const destination=join(backupRoot,PROJECT+'-'+timestamp+'-'+liveSha.slice(0,12)+'.rules');
 // Exclusive creation prevents silent backup overwrite.
 writeFileSync(destination,current,{mode:0o600,flag:'wx'});
 status('Project: '+PROJECT);
 status('Current ruleset: '+rulesetName);
 status('Live rules SHA-256: '+liveSha);
 status('Candidate rules SHA-256: '+candidateSha);
 status('Private backup: '+destination);
 status(liveSha===candidateSha
  ? 'MATCH: live Firebase rules already match this checkout; no change made.'
  : 'DIFFERENT: live rules do not match this checkout. Compare the backed-up text before any deploy.');
 status('READ_ONLY_COMPLETE: no production write or deployment was attempted.');
}
main().catch(error=>fail(String(error?.message||'Rules inspection failed.').slice(0,280)));
