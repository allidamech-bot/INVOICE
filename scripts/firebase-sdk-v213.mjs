import { readFile, writeFile } from 'node:fs/promises';

const FIREBASE_VERSION='12.19.0';
const ASSETS=[
  'firebase-app-compat.js',
  'firebase-app-check-compat.js',
  'firebase-auth-compat.js',
  'firebase-firestore-compat.js',
];

async function fetchAsset(name){
  const urls=[
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/${name}`,
    `https://unpkg.com/firebase@${FIREBASE_VERSION}/${name}`,
  ];
  let lastError;
  for(const url of urls){
    try{
      const response=await fetch(url,{redirect:'follow'});
      if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
      const data=Buffer.from(await response.arrayBuffer());
      if(data.length<5_000)throw new Error(`Unexpectedly small Firebase payload for ${name} (${data.length} bytes)`);
      return data;
    }catch(error){lastError=error;}
  }
  throw new Error(`Unable to fetch Firebase ${FIREBASE_VERSION} ${name}: ${lastError instanceof Error?lastError.message:String(lastError)}`);
}

for(const name of ASSETS){
  const data=await fetchAsset(name);
  await writeFile(`dist/vendor/${name}`,data);
}

// The vendored file names predate the v213 Firebase upgrade. Add an explicit
// version query to every Firebase runtime request so normal Safari/Chrome
// profiles cannot reuse an older HTTP-cache entry at the same /vendor path.
// Installed PWA caches remain generation-isolated as a second protection.
const htmlPath='dist/index.html';
let html=await readFile(htmlPath,'utf8');
for(const name of ASSETS){
  const local=`./vendor/${name}`;
  if(!html.includes(local))continue;
  html=html.replaceAll(local,`${local}?v=${FIREBASE_VERSION}`);
}
if(!html.includes(`./vendor/firebase-auth-compat.js?v=${FIREBASE_VERSION}`))throw new Error('Production HTML did not receive the versioned Firebase Auth runtime URL.');
await writeFile(htmlPath,html);

console.log(`LOUREX Firebase browser runtime upgraded to ${FIREBASE_VERSION} (${ASSETS.length} compat bundles, versioned browser URLs).`);
