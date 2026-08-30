import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});

const typecheck = spawnSync('tsc',['-p','tsconfig.json'],{stdio:'inherit'});
if(typecheck.status!==0) process.exit(typecheck.status ?? 1);

await cp('public','dist',{recursive:true});
await cp('src/styles','dist/styles',{recursive:true});

const runtimeConfig={
  environment:process.env.VERCEL_ENV||'local',
  canonicalHost:process.env.VERCEL_PROJECT_PRODUCTION_URL||'',
  deploymentHost:process.env.VERCEL_URL||''
};
await writeFile('dist/runtime-config.js',`window.__LOUREX_RUNTIME__=${JSON.stringify(runtimeConfig)};\n`);

let html = await readFile('index.html','utf8');
const localStylePattern=/<link rel="stylesheet" href="\.\/styles\/([^\"]+\.css)" \/>/g;
const styleNames=[...html.matchAll(localStylePattern)].map(match=>match[1]);
if(!styleNames.length) throw new Error('No local stylesheet layers found in index.html.');

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
await writeFile('dist/index.html',html);

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');
sw=sw.replace(/"\.\/styles\/[^\"]+\.css"(?:,"\.\/styles\/[^\"]+\.css")*/g,'"./styles/app.bundle.css"');
await writeFile(swPath,sw);

console.log(`LOUREX Invoice production build ready in dist/ (${runtimeConfig.environment}${runtimeConfig.canonicalHost?`, canonical: ${runtimeConfig.canonicalHost}`:''}; ${styleNames.length} CSS layers -> 1 bundle)`);
