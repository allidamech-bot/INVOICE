import { readFile, writeFile } from 'node:fs/promises';

const path='scripts/apply-operations-batch8.mjs';
let source=await readFile(path,'utf8');
const from="  [`const CACHE = 'lourex-invoice-v136';`, `const CACHE = 'lourex-invoice-v137';`],";
const to="  [`\\nconst CACHE = 'lourex-invoice-v136';\\n`, `\\nconst CACHE = 'lourex-invoice-v137';\\n`],";
if(!source.includes(from))throw new Error('Expected service-worker cache patch was not found.');
source=source.replace(from,to);
await writeFile(path,source);

const operationsPage='src/components/OperationsPage.tsx';
let page=await readFile(operationsPage,'utf8');
const validationToken='error:errors[0]';
const matches=page.split(validationToken).length-1;
if(matches!==4)throw new Error(`Expected four strict validation fallbacks, found ${matches}.`);
page=page.split(validationToken).join("error:errors[0]??t('Validation failed.','فشل التحقق.')");
await writeFile(operationsPage,page);

await import('./apply-operations-batch8.mjs?fixed=2');
