import { writeFile } from 'node:fs/promises';

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

console.log(`LOUREX Firebase browser runtime upgraded to ${FIREBASE_VERSION} (${ASSETS.length} compat bundles).`);
