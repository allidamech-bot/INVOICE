import { readFile, writeFile, unlink } from 'node:fs/promises';
const path='scripts/apply-hardening-v138.mjs';
let s=await readFile(path,'utf8');
const block=`  s=replaceOnce(s,\n\`  for(const invoice of activeInvoices(documents)){const id=customerIdFor(invoice);if(id)ids.add(id);}\`,\n\`  for(const invoice of activeInvoices(documents,today)){const id=customerIdFor(invoice);if(id)ids.add(id);}\`,'customer ids as-of');\n`;
if(!s.includes(block))throw new Error('Expected customer-ids helper block was not found.');
s=s.replace(block,'');
await writeFile(path,s);
await unlink('scripts/prepare-hardening-helper.mjs');
console.log('Hardening helper corrected for prior replaceAll behavior.');
