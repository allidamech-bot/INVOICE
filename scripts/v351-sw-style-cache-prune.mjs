import {readFile,writeFile} from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

/* Source sw.js intentionally retains historical cache markers for old regression
   coverage. Production must not precache every historical stylesheet after the
   application has already been consolidated into app.bundle.css. Remove only
   active standalone style pushes here; v303 immediately restores the small set of
   current standalone document dependencies (v333/v337/v331/v332). */
const activeStylePush=/^LOCAL_CORE\.push\((['"])\.\/styles\/[^'"\r\n]+\.css(?:\?[^'"\r\n]*)?\1\);\s*$/gm;
const retiredPushes=[...sw.matchAll(activeStylePush)].map(match=>match[0].trim());
sw=sw.replace(activeStylePush,'');

if(/LOCAL_CORE\.push\((['"])\.\/styles\/[^'"\r\n]+\.css(?:\?[^'"\r\n]*)?\1\);/.test(sw)){
  throw new Error('v351: a historical standalone stylesheet push survived the production cache prune.');
}

await writeFile(swPath,sw);
console.log(`[LOUREX PWA] removed ${retiredPushes.length} historical standalone stylesheet precache pushes before v351 active owners are restored.`);
