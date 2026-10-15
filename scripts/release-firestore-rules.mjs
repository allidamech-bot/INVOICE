/**
 * Explicit owner-only Firebase Firestore rules release gate.
 *
 * NEVER runs in CI, tests, Vercel or during an npm build. Defaults to dry-run.
 * A deploy requires pre-review of the current live Firebase rules, a backup,
 * an approved exact Git commit and the exact SHA-256 of this rules file.
 * No firebase project or credentials are inferred from local defaults.
 */
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repo='allidamech-bot/INVOICE';
const project='lourex-invoice';
const rulesFile=resolve(root,'firestore.rules');
const configFile=resolve(root,'firebase.rules-release.json');
const approvedCli='14.12.1';
const isDeploy=process.argv.length===3&&process.argv[2]==='--deploy';
const isDryRun=process.argv.length===2||process.argv.length===3&&process.argv[2]==='--dry-run';
function stop(message){console.error('FIRESTORE_RELEASE_BLOCKED: '+message);process.exit(2);}
if(!isDeploy&&!isDryRun)stop('Choose --dry-run (default) or --deploy.');
const rules=readFileSync(rulesFile,'utf8');
const config=JSON.parse(readFileSync(configFile,'utf8'));
if(Object.keys(config).join(',')!=='firestore'||Object.keys(config.firestore||{}).join(',')!=='rules'
  ||config.firestore.rules!=='firestore.rules')
  stop('Rules-only config must target the repository rules file; indexes and other products are forbidden.');
if(!rules.includes("request.auth.token.lourexAiRole == 'owner'")
  ||!rules.includes("allow read, write: if false;")
  ||!rules.includes("function trustedWorkspaceWriter()"))
  stop('Owner-only deny-by-default rules contract is missing.');
const sha=createHash('sha256').update(rules).digest('hex');
const runGit=(args)=>{
 const result=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:5000});
 if(result.status!==0)stop('Cannot verify the repository Git identity.');
 return result.stdout.trim();
};
const commit=runGit(['rev-parse','HEAD']);
const fullPath=runGit(['remote','get-url','origin']);
if(!/^(?:https:\/\/github\.com\/|git@github\.com:)(?:allidamech-bot\/INVOICE)(?:\.git)?$/.test(fullPath))
 stop('Git origin is not '+repo+'.');
if(runGit(['status','--porcelain','--','firestore.rules','firebase.rules-release.json','scripts/release-firestore-rules.mjs']))
 stop('Rules release files are not clean; commit and retest before deployment.');
console.log('Firestore rules release candidate — target project: '+project);
console.log('Git commit: '+commit);
console.log('Rules SHA-256: '+sha);
if(isDryRun){
 console.log('DRY_RUN_ONLY: no Firebase operation, credentials, database access or deployment.');
 console.log('Review current production rules in Firebase Console; back them up externally before approving.');
 process.exit(0);
}
if(process.env.CI==='true'||process.env.VERCEL==='1'||process.env.VERCEL_ENV)
 stop('Deployment forbidden inside CI/Vercel.');
if(process.env.LOUREX_FIRESTORE_DEPLOY_APPROVED!=='deploy-owner-only-rules-after-live-backup'
 ||process.env.LOUREX_FIRESTORE_LIVE_BACKUP_REVIEWED!=='yes-reviewed-current-live-rules'
 ||process.env.LOUREX_FIRESTORE_APPROVED_COMMIT!==commit
 ||process.env.LOUREX_FIRESTORE_APPROVED_SHA256!==sha)
 stop('Explicit live-rules backup/approval and matching Git commit + rules checksum are required.');
const version=spawnSync('firebase',['--version'],{cwd:root,encoding:'utf8',timeout:10000});
if(version.status!==0||version.stdout.trim()!==approvedCli)
 stop('Firebase CLI version must be pinned to '+approvedCli+'.');
const args=['deploy','--only','firestore:rules','--config','firebase.rules-release.json','--project',project];
console.log('Starting explicitly authorized rules-only deployment to Firebase '+project+'.');
const result=spawnSync('firebase',args,{cwd:root,stdio:'inherit',timeout:120000});
if(result.status!==0)stop('Firebase rules deployment failed; check Firebase Console before retrying.');
console.log('FIRESTORE_RULES_DEPLOYED: confirm the active rules and test owner login/customer share before app release.');
