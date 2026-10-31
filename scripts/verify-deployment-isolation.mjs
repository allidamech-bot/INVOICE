import {spawnSync} from 'node:child_process';

const EXPECTED_REPO_OWNER='allidamech-bot';
const EXPECTED_REPO_SLUG='INVOICE';
const EXPECTED_PROJECT_ID='prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ';
const FORBIDDEN_PRODUCTION_HOSTS=new Set([
  'lou-rex.com',
  'www.lou-rex.com',
  'lourex-bf110a8a.vercel.app',
  'lourex-bf110a8a-alidaamishs-projects.vercel.app',
]);

const vercelEnvironment=process.env.VERCEL_ENV||'local';
// On this AI release branch, an ordinary Preview Vercel build is NOT a safe
// authenticated sandbox: current Firebase client, JWT verifier and auth redirect
// all point to production. This gate runs as the FIRST build step and refuses
// to create an unsafe Preview until those three sources are independently QA
// configured. It never changes the production build path or runs for local CI.
const previewBranch=process.env.VERCEL_GIT_COMMIT_REF||'';
const guardedAiPreview=previewBranch==='fix/ai-audit-root-causes-20261017'||
  /^ai-legacy\/groq-[a-z0-9-]+$/u.test(previewBranch);
if(vercelEnvironment==='preview'&&guardedAiPreview){
  const qa=spawnSync(process.execPath,['scripts/verify-ai-staging-isolation.mjs'],{
    encoding:'utf8',env:process.env,timeout:10000
  });
  if(qa.status!==0){
    throw new Error('AI_PREVIEW_ISOLATION_BLOCKED: refusing to publish the AI test branch as a Preview while it can authenticate against production Firebase. Use a separately provisioned and verified QA Firebase project.');
  }
}
if(vercelEnvironment!=='production')process.exit(0);

const sourceRepoOwner=process.env.VERCEL_GIT_REPO_OWNER||'';
const sourceRepoSlug=process.env.VERCEL_GIT_REPO_SLUG||'';
const projectId=process.env.VERCEL_PROJECT_ID||'';
const productionHost=(process.env.VERCEL_PROJECT_PRODUCTION_URL||'')
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//,'')
  .replace(/\/$/,'');

if(!sourceRepoOwner||!sourceRepoSlug){
  throw new Error(`Refusing production build without Vercel Git source metadata. LOUREX Invoice production source must be ${EXPECTED_REPO_OWNER}/${EXPECTED_REPO_SLUG}.`);
}

if(sourceRepoOwner.toLowerCase()!==EXPECTED_REPO_OWNER.toLowerCase()||sourceRepoSlug.toLowerCase()!==EXPECTED_REPO_SLUG.toLowerCase()){
  throw new Error(`Refusing production build from ${sourceRepoOwner}/${sourceRepoSlug}. LOUREX Invoice production source must be ${EXPECTED_REPO_OWNER}/${EXPECTED_REPO_SLUG}.`);
}

if(!projectId){
  throw new Error(`Refusing LOUREX Invoice production build without VERCEL_PROJECT_ID. Expected isolated Invoice project ${EXPECTED_PROJECT_ID}.`);
}

if(projectId!==EXPECTED_PROJECT_ID){
  throw new Error(`Refusing LOUREX Invoice production build in unexpected Vercel project ${projectId}. Expected isolated Invoice project ${EXPECTED_PROJECT_ID}.`);
}

if(productionHost&&FORBIDDEN_PRODUCTION_HOSTS.has(productionHost)){
  throw new Error(`Refusing LOUREX Invoice production build for forbidden production host ${productionHost}. lou-rex.com belongs to the primary LOUREX platform.`);
}

console.log(`LOUREX Invoice deployment isolation verified for ${sourceRepoOwner}/${sourceRepoSlug} on ${projectId}${productionHost?` (${productionHost})`:''}.`);
