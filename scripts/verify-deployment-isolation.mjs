const EXPECTED_REPO_OWNER='allidamech-bot';
const EXPECTED_REPO_SLUG='INVOICE';
const FORBIDDEN_PROJECT_IDS=new Set([
  'prj_KgRgeJKQKIu2F2ElkrbfEEXDUtA3',
]);
const FORBIDDEN_PRODUCTION_HOSTS=new Set([
  'lou-rex.com',
  'www.lou-rex.com',
  'lourex-bf110a8a.vercel.app',
  'lourex-bf110a8a-alidaamishs-projects.vercel.app',
]);

const vercelEnvironment=process.env.VERCEL_ENV||'local';
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

if(projectId&&FORBIDDEN_PROJECT_IDS.has(projectId)){
  throw new Error(`Refusing LOUREX Invoice production build in forbidden Vercel project ${projectId}. This project belongs to the primary lou-rex.com platform.`);
}

if(productionHost&&FORBIDDEN_PRODUCTION_HOSTS.has(productionHost)){
  throw new Error(`Refusing LOUREX Invoice production build for forbidden production host ${productionHost}. lou-rex.com belongs to the primary LOUREX platform.`);
}

console.log(`LOUREX Invoice deployment isolation verified for ${sourceRepoOwner}/${sourceRepoSlug}${projectId?` on ${projectId}`:''}${productionHost?` (${productionHost})`:''}.`);
