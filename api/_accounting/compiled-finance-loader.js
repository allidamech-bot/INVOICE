import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

/**
 * Vercel's file tracer recursively evaluates import graphs while packaging
 * api/ai-core.js. The period-close accountant imports much of the compiled
 * finance engine, including precision-preserving BigInt arithmetic.
 *
 * Resolve ONLY these checked, deployed modules at runtime: Vercel includes
 * dist/src/** as function assets via vercel.json. Keep the server verification
 * logic and the original financial calculations intact. Never accept user
 * input or an external path here.
 */
const KNOWN=Object.freeze({
  defaults:'defaults.js',
  backup:'backup.js',
  id:'id.js',
  period:'period-close.js'
});

// Keep the module URL behind a runtime function call. @vercel/nft can
// otherwise partially evaluate an inline resolve(process.cwd(), 'dist', ...)
// and eagerly analyze every compiled client-side financial file during
// serverless packaging. The checked path is still deterministic at runtime.
function approvedCompiledModuleUrl(fileName){
  const parts=[process.cwd(),'dist','src','lib',fileName];
  return pathToFileURL(resolve(...parts)).href;
}

const runtimeImport=new Function('moduleUrl','return import(moduleUrl)');

export async function loadCompiledFinance(name){
  if(!Object.hasOwn(KNOWN,name))throw new Error('Unsupported server finance module');
  // This is a fixed, allowlisted server module URL, not user-supplied code.
  // Keeping import() behind a runtime factory prevents @vercel/nft from
  // statically walking the entire compiled finance/AI dependency directory;
  // Vercel includes those files as unchanged function assets.
  return runtimeImport(approvedCompiledModuleUrl(KNOWN[name]));
}
