import { readFile, writeFile } from 'node:fs/promises';

const path='scripts/apply-operations-batch8.mjs';
let source=await readFile(path,'utf8');
const from="  [`const CACHE = 'lourex-invoice-v136';`, `const CACHE = 'lourex-invoice-v137';`],";
const to="  [`\\nconst CACHE = 'lourex-invoice-v136';\\n`, `\\nconst CACHE = 'lourex-invoice-v137';\\n`],";
if(!source.includes(from))throw new Error('Expected service-worker cache patch was not found.');
source=source.replace(from,to);
await writeFile(path,source);
await import('./apply-operations-batch8.mjs?fixed=1');
