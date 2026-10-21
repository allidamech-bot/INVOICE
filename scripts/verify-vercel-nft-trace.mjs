import {nodeFileTrace} from '@vercel/nft';

const entries=['api/ai-core.js'];
const start=Date.now();
try{
 const result=await nodeFileTrace(entries,{base:process.cwd(),processCwd:process.cwd(),analysis:{emitGlobs:true,computeFileReferences:true,evaluatePureExpressions:true}});
 const files=[...result.fileList];
 const traced=files.filter(path=>path.startsWith('dist/src/')||path.startsWith('api/_accounting/'));
 console.log('VERCEL_NFT_TRACE_PASS',JSON.stringify({entry:entries[0],count:files.length,domainTraced:traced.length,elapsedMs:Date.now()-start,domainFiles:traced.slice(0,24)}));
}catch(error){
 console.error('VERCEL_NFT_TRACE_FAILED',error instanceof Error?error.stack:String(error));
 process.exitCode=1;
}
