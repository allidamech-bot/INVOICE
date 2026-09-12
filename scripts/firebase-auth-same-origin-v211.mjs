import {readFile,writeFile} from 'node:fs/promises';

const EXPECTED_PROJECT_ID='prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ';
const EXPECTED_PRODUCTION_HOST='invoice-three-puce.vercel.app';
const SOURCE_AUTH_DOMAIN='lourex-invoice.firebaseapp.com';
const firebaseRuntimePath='dist/src/cloud/firebase.js';

const vercelEnvironment=process.env.VERCEL_ENV||'local';
if(vercelEnvironment!=='production')process.exit(0);

const projectId=String(process.env.VERCEL_PROJECT_ID||'');
if(projectId!==EXPECTED_PROJECT_ID)throw new Error(`Refusing Google Auth same-origin patch for unexpected Vercel project ${projectId||'missing'}.`);

const productionHost=String(process.env.VERCEL_PROJECT_PRODUCTION_URL||EXPECTED_PRODUCTION_HOST).replace(/^https?:\/\//,'').replace(/\/$/,'');
if(productionHost!==EXPECTED_PRODUCTION_HOST)throw new Error(`Refusing Google Auth same-origin patch for unexpected production host ${productionHost}. Expected ${EXPECTED_PRODUCTION_HOST}.`);

let runtime=await readFile(firebaseRuntimePath,'utf8');
const authDomainPattern=/authDomain\s*:\s*['"]lourex-invoice\.firebaseapp\.com['"]/;
if(!authDomainPattern.test(runtime))throw new Error('Unable to locate Firebase authDomain in production runtime.');
runtime=runtime.replace(authDomainPattern,`authDomain: '${EXPECTED_PRODUCTION_HOST}'`);
if(!runtime.includes(`authDomain: '${EXPECTED_PRODUCTION_HOST}'`))throw new Error('Unable to apply same-origin Firebase authDomain.');
if(runtime.includes(`authDomain: '${SOURCE_AUTH_DOMAIN}'`))throw new Error('Production runtime still contains the cross-origin Firebase authDomain.');
await writeFile(firebaseRuntimePath,runtime);
console.log(`LOUREX Google Auth same-origin helper enabled for ${EXPECTED_PRODUCTION_HOST}.`);
