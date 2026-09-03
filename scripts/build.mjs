import { cp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const EXPECTED_REPO_OWNER='allidamech-bot';
const EXPECTED_REPO_SLUG='INVOICE';
const vercelEnvironment=process.env.VERCEL_ENV||'local';
const sourceRepoOwner=process.env.VERCEL_GIT_REPO_OWNER||'';
const sourceRepoSlug=process.env.VERCEL_GIT_REPO_SLUG||'';
if(vercelEnvironment==='production'){
  if(!sourceRepoOwner||!sourceRepoSlug)throw new Error(`Refusing production build without Vercel Git source metadata. LOUREX Invoice production source must be ${EXPECTED_REPO_OWNER}/${EXPECTED_REPO_SLUG}.`);
  if(sourceRepoSlug.toLowerCase()!==EXPECTED_REPO_SLUG.toLowerCase()||sourceRepoOwner.toLowerCase()!==EXPECTED_REPO_OWNER.toLowerCase()){
    throw new Error(`Refusing production build from ${sourceRepoOwner}/${sourceRepoSlug}. LOUREX Invoice production source must be ${EXPECTED_REPO_OWNER}/${EXPECTED_REPO_SLUG}.`);
  }
}

const VENDOR_ASSETS=[
  {name:'react.production.min.js',urls:['https://cdn.jsdelivr.net/npm/react@17.0.2/umd/react.production.min.js','https://unpkg.com/react@17.0.2/umd/react.production.min.js']},
  {name:'react-dom.production.min.js',urls:['https://cdn.jsdelivr.net/npm/react-dom@17.0.2/umd/react-dom.production.min.js','https://unpkg.com/react-dom@17.0.2/umd/react-dom.production.min.js']},
  {name:'firebase-app-compat.js',urls:['https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js','https://unpkg.com/firebase@12.17.1/firebase-app-compat.js']},
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
  commitSha:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||'',
  commitRef:process.env.VERCEL_GIT_COMMIT_REF||process.env.GITHUB_REF_NAME||'',
  buildTime:new Date().toISOString()
};
await writeFile('dist/runtime-config.js',`window.__LOUREX_RUNTIME__=${JSON.stringify(runtimeConfig)};\n`);

let html = await readFile('index.html','utf8');
const localStylePattern=/<link rel="stylesheet" href="\.\/styles\/([^\"]+\.css)" \/>/g;
const localImportPattern=/@import url\("\.\/styles\/([^\"]+\.css)"\);/g;
const styleReferencePattern=/(?:<link rel="stylesheet" href="\.\/styles\/([^\"]+\.css)" \/>|@import url\("\.\/styles\/([^\"]+\.css)"\);)/g;
const styleNames=[...html.matchAll(styleReferencePattern)].map(match=>match[1]||match[2]);
if(!styleNames.length) throw new Error('No local stylesheet layers found in index.html.');
if(new Set(styleNames).size!==styleNames.length) throw new Error('Duplicate local stylesheet layer detected in index.html.');
if(styleNames.at(-1)!=='document-premium-redesign-v141.css') throw new Error('v141 premium document redesign must remain the final local stylesheet in the production cascade.');

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
const vendorUrlMap=new Map([
  ['https://cdn.jsdelivr.net/npm/react@17.0.2/umd/react.production.min.js','./vendor/react.production.min.js'],
  ['https://cdn.jsdelivr.net/npm/react-dom@17.0.2/umd/react-dom.production.min.js','./vendor/react-dom.production.min.js'],
  ['https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js','./vendor/firebase-app-compat.js'],
  ['https://www.gstatic.com/firebasejs/12.17.1/firebase-auth-compat.js','./vendor/firebase-auth-compat.js'],
  ['https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore-compat.js','./vendor/firebase-firestore-compat.js']
]);
for(const [remote,local] of vendorUrlMap)html=html.replaceAll(remote,local);
await writeFile('dist/index.html',html);

const iosBridgePath='dist/ios-print-bridge.js';
let iosBridge=await readFile(iosBridgePath,'utf8');
iosBridge=iosBridge
  .replaceAll('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js','./vendor/html2canvas.min.js')
  .replaceAll('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js','./vendor/jspdf.umd.min.js');
await writeFile(iosBridgePath,iosBridge);

const productImportPath='dist/src/components/ProductImportModal.js';
let productImport=await readFile(productImportPath,'utf8');
productImport=productImport.replaceAll('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','./vendor/xlsx.full.min.js');
await writeFile(productImportPath,productImport);

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');
sw=sw.replace(/"\.\/styles\/[^\"]+\.css"(?:,"\.\/styles\/[^\"]+\.css")*/g,'"./styles/app.bundle.css"');
const vendorCore=VENDOR_ASSETS.map(asset=>`"./vendor/${asset.name}"`).join(',');
sw=sw.replace('const LOCAL_CORE = [',`const LOCAL_CORE = [${vendorCore},`);
sw=sw.replace(/const EXTERNAL_CORE = \[[^\]]*\];/,'const EXTERNAL_CORE = [];');
await writeFile(swPath,sw);

const outputFiles=await readdir('dist',{recursive:true});
const sourceMaps=outputFiles.filter(file=>String(file).endsWith('.map'));
if(sourceMaps.length)throw new Error(`Production build contains source maps: ${sourceMaps.slice(0,5).join(', ')}`);
if([...vendorUrlMap.keys()].some(url=>html.includes(url)))throw new Error('Production HTML still references remote runtime JavaScript.');
if(/https:\/\/cdn\.jsdelivr\.net\/npm\/(?:html2canvas|jspdf|xlsx)@/.test(iosBridge+productImport))throw new Error('Production runtime still references remote PDF/import libraries.');

console.log(`LOUREX Invoice production build ready in dist/ (${runtimeConfig.environment}${runtimeConfig.canonicalHost?`, canonical: ${runtimeConfig.canonicalHost}`:''}; source: ${runtimeConfig.sourceRepoOwner}/${runtimeConfig.sourceRepoSlug}; ${styleNames.length} CSS layers -> 1 bundle; ${VENDOR_ASSETS.length} runtime libraries vendored; source maps disabled)`);
