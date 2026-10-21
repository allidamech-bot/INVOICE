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

export async function loadCompiledFinance(name){
  if(!Object.hasOwn(KNOWN,name))throw new Error('Unsupported server finance module');
  const modulePath=resolve(process.cwd(),'dist','src','lib',KNOWN[name]);
  return import(pathToFileURL(modulePath).href);
}
