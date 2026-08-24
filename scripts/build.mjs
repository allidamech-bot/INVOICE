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
  deploymentHost:process.env.VERCEL_URL||'',
  firebaseEnvFlags:{
    FIREBASE_API_KEY:Boolean(process.env.FIREBASE_API_KEY),
    VITE_FIREBASE_API_KEY:Boolean(process.env.VITE_FIREBASE_API_KEY),
    NEXT_PUBLIC_FIREBASE_API_KEY:Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    FIREBASE_PROJECT_ID:Boolean(process.env.FIREBASE_PROJECT_ID),
    VITE_FIREBASE_PROJECT_ID:Boolean(process.env.VITE_FIREBASE_PROJECT_ID),
    FIREBASE_APP_ID:Boolean(process.env.FIREBASE_APP_ID),
    VITE_FIREBASE_APP_ID:Boolean(process.env.VITE_FIREBASE_APP_ID)
  }
};
await writeFile('dist/runtime-config.js',`window.__LOUREX_RUNTIME__=${JSON.stringify(runtimeConfig)};\n`);
let html = await readFile('index.html','utf8');
await writeFile('dist/index.html',html);
console.log(`LOUREX Invoice production build ready in dist/ (${runtimeConfig.environment}${runtimeConfig.canonicalHost?`, canonical: ${runtimeConfig.canonicalHost}`:''})`);
