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
