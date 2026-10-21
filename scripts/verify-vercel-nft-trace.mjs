import {nodeFileTrace} from '@vercel/nft';
import {readFile} from 'node:fs/promises';
import {verifyPeriodPackage} from './verify-vercel-period-package.mjs';

const entries=['api/ai-core.js'];
const variants=[
 {label:'full',ignore:[]},
 {label:'ignore-accounting-graph',ignore:['api/_accounting/**']},
 {label:'ignore-compiled-domain',ignore:['dist/src/**']},
 {label:'ignore-firebase-admin',ignore:['node_modules/firebase-admin/**']},
 {label:'ignore-google-cloud',ignore:['node_modules/@google-cloud/**']},
 {label:'ignore-protobuf',ignore:['node_modules/protobufjs/**']}
];
let fullPass=false;
for(const variant of variants){
 const start=Date.now(),recent=[];
 try{
   const result=await nodeFileTrace(entries,{
     base:process.cwd(),processCwd:process.cwd(),ignore:variant.ignore,
     fileIOConcurrency:8,
     readFile:async path=>{
       recent.push(path.replace(process.cwd()+'/',''));if(recent.length>45)recent.shift();
       // Match nft's readFile contract: a missing candidate returns null so
       // package resolution can continue to a hoisted parent dependency.
       try{return await readFile(path,'utf8');}
       catch(error){if(error.code==='ENOENT'||error.code==='EISDIR')return null;throw error;}
     },
     analysis:{emitGlobs:true,computeFileReferences:true,evaluatePureExpressions:true}
   });
   const files=[...result.fileList];
   console.log('VERCEL_NFT_PASS',JSON.stringify({variant:variant.label,count:files.length,domainFiles:files.filter(path=>path.startsWith('api/_accounting/')||path.startsWith('dist/src/')).slice(0,12),ms:Date.now()-start}));
   if(variant.label==='full'){
     await verifyPeriodPackage(files);
     fullPass=true;
   }
 }catch(error){
   console.error('VERCEL_NFT_FAIL',JSON.stringify({variant:variant.label,message:error instanceof Error?error.message:String(error),recentFiles:recent.slice(-22),ms:Date.now()-start}));
 }
}
if(!fullPass)process.exitCode=1;
