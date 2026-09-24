import {readFile,stat} from 'node:fs/promises';

const html=await readFile('dist/index.html','utf8');

const forbiddenExternalRuntime=/https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)\/npm\/(?:react|react-dom)@/i;
if(forbiddenExternalRuntime.test(html)){
  throw new Error('v321 production contract: external React/ReactDOM runtime survived the production build.');
}

for(const runtime of [
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  './vendor/firebase-app-compat.js',
  './vendor/firebase-auth-compat.js',
  './vendor/firebase-firestore-compat.js'
]){
  if(!html.includes(runtime))throw new Error(`v321 production contract: missing local runtime reference ${runtime}.`);
}

if(!html.includes('./startup-watchdog-v321.js?v=321')){
  throw new Error('v321 production contract: startup watchdog is missing from dist/index.html.');
}

for(const file of [
  'dist/vendor/react.production.min.js',
  'dist/vendor/react-dom.production.min.js',
  'dist/startup-watchdog-v321.js'
]){
  const info=await stat(file);
  if(info.size<500)throw new Error(`v321 production contract: runtime file is unexpectedly small: ${file}.`);
}

console.log('LOUREX v321 production runtime contract: PASS');
