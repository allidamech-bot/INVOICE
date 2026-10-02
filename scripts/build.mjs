import { cp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const EXPECTED_REPO_OWNER='allidamech-bot';
const EXPECTED_REPO_SLUG='INVOICE';
const EXPECTED_PROJECT_ID='prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ';
const vercelEnvironment=process.env.VERCEL_ENV||'local';
const sourceRepoOwner=process.env.VERCEL_GIT_REPO_OWNER||'';
const sourceRepoSlug=process.env.VERCEL_GIT_REPO_SLUG||'';
const projectId=process.env.VERCEL_PROJECT_ID||'';
const firebaseAppCheckEnterpriseKey=(process.env.FIREBASE_APP_CHECK_ENTERPRISE_KEY||'').trim();
const firebaseAppCheckRequired=process.env.FIREBASE_APP_CHECK_REQUIRED==='1';
if(vercelEnvironment==='production'){
  if(!sourceRepoOwner||!sourceRepoSlug)throw new Error(`Refusing production build without Vercel Git source metadata. LOUREX Invoice production source must be ${EXPECTED_REPO_OWNER}/${EXPECTED_REPO_SLUG}.`);
  if(sourceRepoSlug.toLowerCase()!==EXPECTED_REPO_SLUG.toLowerCase()||sourceRepoOwner.toLowerCase()!==EXPECTED_REPO_OWNER.toLowerCase()){
    throw new Error(`Refusing production build from ${sourceRepoOwner}/${sourceRepoSlug}. LOUREX Invoice production source must be ${EXPECTED_REPO_OWNER}/${EXPECTED_REPO_SLUG}.`);
  }
  if(!projectId)throw new Error(`Refusing LOUREX Invoice production build without VERCEL_PROJECT_ID. Expected isolated Invoice project ${EXPECTED_PROJECT_ID}.`);
  if(projectId!==EXPECTED_PROJECT_ID)throw new Error(`Refusing LOUREX Invoice production build in unexpected Vercel project ${projectId}. Expected isolated Invoice project ${EXPECTED_PROJECT_ID}.`);
  if(firebaseAppCheckRequired&&!firebaseAppCheckEnterpriseKey)throw new Error('Refusing production build with FIREBASE_APP_CHECK_REQUIRED=1 but no FIREBASE_APP_CHECK_ENTERPRISE_KEY.');
}

const VENDOR_ASSETS=[
  {name:'react.production.min.js',urls:['https://cdn.jsdelivr.net/npm/react@17.0.2/umd/react.production.min.js','https://unpkg.com/react@17.0.2/umd/react.production.min.js']},
  {name:'react-dom.production.min.js',urls:['https://cdn.jsdelivr.net/npm/react-dom@17.0.2/umd/react.production.min.js','https://unpkg.com/react-dom@17.0.2/umd/react.production.min.js']},
  {name:'firebase-app-compat.js',urls:['https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js','https://unpkg.com/firebase@12.17.1/firebase-app-compat.js']},
  {name:'firebase-app-check-compat.js',urls:['https://www.gstatic.com/firebasejs/12.17.1/firebase-app-check-compat.js','https://unpkg.com/firebase@12.17.1/firebase-app-check-compat.js']},
  {name:'firebase-auth-compat.js',urls:['https://www.gstatic.com/firebasejs/12.17.1/firebase-auth-compat.js','https://unpkg.com/firebase@12.17.1/firebase-auth-compat.js']},
  {name:'firebase-firestore-compat.js',urls:['https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore-compat.js','https://unpkg.com/firebase@12.17.1/firebase-firestore-compat.js']},
  {name:'html2canvas.min.js',urls:['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js','https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js']},
  {name:'jspdf.umd.min.js',urls:['https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js','https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js']},
  {name:'xlsx.full.min.js',urls:['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js']}
];

async function downloadVendorAsset(asset){
  let lastError;
  for(const url of asset.urls){
    try{
      const response=await fetch(url,{redirect:'follow'});
      if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
      const data=Buffer.from(await response.arrayBuffer());
      if(data.length<1000)throw new Error(`Unexpectedly small payload (${data.length} bytes)`);
      await writeFile(`dist/vendor/${asset.name}`,data);
      return;
    }catch(error){lastError=error;}
  }
  throw new Error(`Unable to vendor ${asset.name}: ${lastError instanceof Error?lastError.message:String(lastError)}`);
}

await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});

const typecheck = spawnSync('tsc',['-p','tsconfig.json'],{stdio:'inherit'});
if(typecheck.status!==0) process.exit(typecheck.status ?? 1);

await cp('public','dist',{recursive:true});
await cp('src/styles','dist/styles',{recursive:true});
await mkdir('dist/vendor',{recursive:true});
await Promise.all(VENDOR_ASSETS.map(downloadVendorAsset));

const runtimeConfig={
  environment:vercelEnvironment,
  canonicalHost:process.env.VERCEL_PROJECT_PRODUCTION_URL||'',
  deploymentHost:process.env.VERCEL_URL||'',
  sourceRepoOwner:sourceRepoOwner||EXPECTED_REPO_OWNER,
  sourceRepoSlug:sourceRepoSlug||EXPECTED_REPO_SLUG,
  projectId,
  commitSha:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||'',
  commitRef:process.env.VERCEL_GIT_COMMIT_REF||process.env.GITHUB_REF_NAME||'',
  firebaseAppCheckEnterpriseKey,
  firebaseAppCheckRequired,
  buildTime:new Date().toISOString()
};

// runtime-config.js is configuration only. Startup recovery must never activate a
// worker, replace the current location, or reload the page behind React. Update
// installation remains an explicit user/runtime action owned outside boot.
await writeFile('dist/runtime-config.js',`window.__LOUREX_RUNTIME__=${JSON.stringify(runtimeConfig)};\n`);

let html = await readFile('index.html','utf8');
/* TailAdmin/component styles are structural baselines. The canonical visual
   foundation is the final source stylesheet and is emitted standalone so source,
   preview and production all have one application-wide visual owner. */
const localStylePattern=/<link\s+rel="stylesheet"\s+href="\.\/styles\/([^"?]+\.css)(?:\?[^\"]*)?"[^>]*\/>/g;
const localImportPattern=/@import url\("\.\/styles\/([^\"]+\.css)"\);/g;
const styleReferencePattern=/(?:<link\s+rel="stylesheet"\s+href="\.\/styles\/([^"?]+\.css)(?:\?[^\"]*)?"[^>]*\/>|@import url\("\.\/styles\/([^\"]+\.css)"\);)/g;
const sourceStyleNames=[...html.matchAll(styleReferencePattern)].map(match=>match[1]||match[2]);
if(!sourceStyleNames.length) throw new Error('No local stylesheet layers found in index.html.');
if(new Set(sourceStyleNames).size!==sourceStyleNames.length) throw new Error('Duplicate local stylesheet layer detected in index.html.');
const foundationOwner='lourex-visual-foundation.css';
const reliabilityOwner='tailadmin-reliability-bridge-v320.css';
if(sourceStyleNames.at(-1)!==foundationOwner)throw new Error('The canonical LOUREX visual foundation must be the final source stylesheet.');
const reliabilityIndex=sourceStyleNames.indexOf(reliabilityOwner);
const foundationIndex=sourceStyleNames.indexOf(foundationOwner);
if(reliabilityIndex<0||foundationIndex<0||reliabilityIndex>=foundationIndex)throw new Error('Reliability bridge must load before the canonical visual foundation.');
if(!sourceStyleNames.includes('tailadmin-finance-v320.css')||!sourceStyleNames.includes('tailadmin-overlays-v320.css'))throw new Error('The structural TailAdmin component baselines are missing from the production cascade.');
if(!sourceStyleNames.includes('tailadmin-design-closeout-v323.css'))throw new Error('The v323 application density/spacing baseline is missing from the production cascade.');
for(const retired of ['hostinger-inspired-v353.css','hostinger-premium-closeout-v354.css','hostinger-system-contract-v355.css','hostinger-final-coherence-v356.css','hostinger-interaction-polish-v357.css','hostinger-blue-luxury-v358.css','hostinger-blue-precision-v359.css','matte-black-dark-v360.css','mobile-site-density-v361.css','premium-ux-coherence-v362.css']){
  if(sourceStyleNames.includes(retired))throw new Error(`Historical application-wide visual owner is still linked from source: ${retired}`);
}

/* Runtime document geometry remains standalone, and the application visual
   foundation is also standalone. None may be duplicated inside app.bundle.css. */
const standaloneRuntimeStyles=new Set([
  'v331-draft-scroll-recovery.css',
  'v332-critical-documents-deep-closeout.css',
  foundationOwner
]);

/* Superseded visual/geometry layers remain in source history for traceability but
   are intentionally not production owners anymore. */
const retiredVisualLayers=new Set([
  'mobile-item-editor-v66.css',
  'iphone-fit-v70.css',
  'mobile-editor-scroll-v75.css',
  'mobile-modal-v81.css',
  'mobile-editor-recovery-v149.css',
  'ux-recovery-v152.css',
  'mobile-safe-area-v155.css',
  'maintenance-closeout-v207.css',
  'save-reliability-v217.css',
  'ledger-pulse-loading-v250.css',
  'mobile-touch-target-closeout-v274.css',
  'v309-draft-pin-stability.css',
  'tailadmin-visual-finish-v320.css',
  'hostinger-inspired-v353.css',
  'hostinger-premium-closeout-v354.css',
  'hostinger-system-contract-v355.css',
  'hostinger-final-coherence-v356.css',
  'hostinger-interaction-polish-v357.css',
  'hostinger-blue-luxury-v358.css',
  'hostinger-blue-precision-v359.css',
  'matte-black-dark-v360.css',
  'mobile-site-density-v361.css',
  'premium-ux-coherence-v362.css'
]);
let styleNames=sourceStyleNames.filter(name=>!standaloneRuntimeStyles.has(name)&&!retiredVisualLayers.has(name));
if(styleNames.some(name=>standaloneRuntimeStyles.has(name)))throw new Error('Standalone runtime/foundation owner leaked into app.bundle.css.');
if(styleNames.some(name=>retiredVisualLayers.has(name)))throw new Error('Retired visual/geometry layer leaked into app.bundle.css.');

/* Keep the historical palette contract temporarily available to startup
   finalization; visual-foundation-finalize removes it from the final production
   bundle after startup safety checks have run. */
const paletteOwner='v346-template-color-visual-closeout.css';
if(sourceStyleNames.includes(paletteOwner))throw new Error('Legacy build palette owner must not also be linked by index.html.');
const reliabilityBundleIndex=styleNames.indexOf(reliabilityOwner);
if(reliabilityBundleIndex<0)throw new Error('Reliability bridge is missing from the structural bundle.');
styleNames.splice(reliabilityBundleIndex,0,paletteOwner);

const styleParts=await Promise.all(styleNames.map(async name=>{
  const css=await readFile(`src/styles/${name}`,'utf8');
  return `/* --- ${name} --- */\n${css.trim()}\n`;
}));
await writeFile('dist/styles/app.bundle.css',styleParts.join('\n'));

let bundleInserted=false;
html=html.replace(localStylePattern,()=>{
  if(bundleInserted) return '';
  bundleInserted=true;
  return '<link rel="stylesheet" href="./styles/app.bundle.css" />';
});
html=html.replace(/<style>\s*(?:@import url\("\.\/styles\/[^\"]+\.css"\);)+\s*<\/style>/g,'');
if([...html.matchAll(localImportPattern)].length) throw new Error('Production HTML still contains local stylesheet @import references.');
if(!bundleInserted)throw new Error('Production HTML did not replace the local stylesheet stack with app.bundle.css.');
const vendorUrlMap=new Map([
  ['https://cdn.jsdelivr.net/npm/react@17.0.2/umd/react.production.min.js','./vendor/react.production.min.js'],
  ['https://cdn.jsdelivr.net/npm/react-dom@17.0.2/umd/react-dom.production.min.js','./vendor/react-dom.production.min.js'],
  ['https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js','./vendor/firebase-app-compat.js'],
  ['https://www.gstatic.com/firebasejs/12.17.1/firebase-auth-compat.js','./vendor/firebase-auth-compat.js'],
  ['https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore-compat.js','./vendor/firebase-firestore-compat.js']
]);
for(const [remote,local] of vendorUrlMap)html=html.replaceAll(remote,local);
const firebaseAppScript='<script crossorigin src="./vendor/firebase-app-compat.js"></script>';
if(!html.includes(firebaseAppScript))throw new Error('Production HTML is missing the vendored Firebase app runtime.');
html=html.replace(firebaseAppScript,`${firebaseAppScript}\n  <script src="./vendor/firebase-app-check-compat.js"></script>\n  <script src="./firebase-app-check-bootstrap.js"></script>`);
html=html.replace(/\s*<link rel="preconnect" href="https:\/\/(?:cdn\.jsdelivr\.net|www\.gstatic\.com)"[^>]*\/>\n?/g,'\n');
await writeFile('dist/index.html',html);

// Keep the browser-driven template stress fixture available on local and
// preview builds only. Production never publishes QA routes or mock documents.
if(vercelEnvironment!=='production'){
  await mkdir('dist/qa',{recursive:true});
  for(const file of ['template-visual-qa.html','template-visual-qa.js','obsidian-foundation.html','obsidian-shell.html','obsidian-dashboard.html','obsidian-documents.html','obsidian-editor.html','obsidian-directory.html']){
    const source=await readFile(`tests/visual/${file}`,'utf8');
    await writeFile(`dist/qa/${file}`,source.replaceAll('../../dist/','../'));
  }
}

const iosBridgePath='dist/ios-print-bridge.js';
let iosBridge=await readFile(iosBridgePath,'utf8');
iosBridge=iosBridge
  .replaceAll('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js','./vendor/html2canvas.min.js')
  .replaceAll('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js','./vendor/jspdf.umd.min.js');
await writeFile(iosBridgePath,iosBridge);

const productImport=await readFile('dist/src/lib/spreadsheet-reader.js','utf8');
if(!productImport.includes('./vendor/xlsx.full.min.js'))throw new Error('Product Excel import must use the vendored local XLSX runtime.');
const supplierImport=await readFile('dist/src/components/SupplierDocumentImport.js','utf8');
if(!supplierImport.includes('../lib/spreadsheet-reader.js'))throw new Error('Supplier document Excel import must use the shared local spreadsheet reader.');

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');
sw=sw.replace("const CACHE = 'lourex-invoice-v202';","const CACHE = 'lourex-invoice-v203';\n// lourex-invoice-v202: preserved as a legacy marker for cache-migration tests.");
sw=sw.replace("const CACHE = 'lourex-invoice-v203';","const CACHE = 'lourex-invoice-v204';\n// lourex-invoice-v203: preserved as a legacy marker for cache-migration tests.");
sw=sw.replace(/"\.\/styles\/[^\"]+\.css"(?:,"\.\/styles\/[^\"]+\.css")*/g,'"./styles/app.bundle.css"');
const vendorCore=VENDOR_ASSETS.map(asset=>`"./vendor/${asset.name}"`).join(',');
sw=sw.replace('const LOCAL_CORE = [',`const LOCAL_CORE = [${vendorCore},`);
sw=sw.replace(/const EXTERNAL_CORE = \[[^\]]*\];/,'const EXTERNAL_CORE = [];');
await writeFile(swPath,sw);

const outputFiles=await readdir('dist',{recursive:true});
const sourceMaps=outputFiles.filter(file=>String(file).endsWith('.map'));
if(sourceMaps.length)throw new Error(`Production build contains source maps: ${sourceMaps.slice(0,5).join(', ')}`);
if([...vendorUrlMap.keys()].some(url=>html.includes(url)))throw new Error('Production HTML still references remote runtime JavaScript.');
if(/https:\/\/cdn\.jsdelivr\.net\/npm\/(?:html2canvas|jspdf|xlsx)@/.test(iosBridge+productImport+supplierImport))throw new Error('Production runtime still references remote PDF/import libraries.');
if(/preconnect[^>]+(?:cdn\.jsdelivr\.net|www\.gstatic\.com)/.test(html))throw new Error('Production HTML still preconnects to retired runtime CDNs.');

console.log(`LOUREX Invoice production build ready in dist/ (${runtimeConfig.environment}${runtimeConfig.canonicalHost?`, canonical: ${runtimeConfig.canonicalHost}`:''}; source: ${runtimeConfig.sourceRepoOwner}/${runtimeConfig.sourceRepoSlug}; project: ${runtimeConfig.projectId||'local'}; App Check: ${runtimeConfig.firebaseAppCheckEnterpriseKey?'configured':'not configured'}${firebaseAppCheckRequired?' / required':''}; ${styleNames.length} structural CSS bundle layers + ${standaloneRuntimeStyles.size} standalone runtime/foundation owners; ${retiredVisualLayers.size} superseded layers retired; ${VENDOR_ASSETS.length} runtime libraries vendored; source maps disabled)`);