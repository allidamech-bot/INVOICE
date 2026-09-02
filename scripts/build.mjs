import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
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

await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});

const typecheck = spawnSync('tsc',['-p','tsconfig.json'],{stdio:'inherit'});
if(typecheck.status!==0) process.exit(typecheck.status ?? 1);

await cp('public','dist',{recursive:true});
await cp('src/styles','dist/styles',{recursive:true});

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
if(styleNames.at(-1)!=='document-final-qa-v130.css') throw new Error('Final document QA layer must remain the last local stylesheet in the production cascade.');

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
await writeFile('dist/index.html',html);

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');
sw=sw.replace(/"\.\/styles\/[^\"]+\.css"(?:,"\.\/styles\/[^\"]+\.css")*/g,'"./styles/app.bundle.css"');
await writeFile(swPath,sw);

console.log(`LOUREX Invoice production build ready in dist/ (${runtimeConfig.environment}${runtimeConfig.canonicalHost?`, canonical: ${runtimeConfig.canonicalHost}`:''}; source: ${runtimeConfig.sourceRepoOwner}/${runtimeConfig.sourceRepoSlug}; ${styleNames.length} CSS layers -> 1 bundle)`);
