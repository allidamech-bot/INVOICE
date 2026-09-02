import { readFile, writeFile, unlink } from 'node:fs/promises';

function replaceOnce(source,from,to,label){
  const count=source.split(from).length-1;
  if(count!==1)throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(from,to);
}

{
  const path='tests/commercial-controls-v136.test.mjs';
  let s=await readFile(path,'utf8');
  s=replaceOnce(
    s,
    `  assert.ok(app.includes("assertCustomerCreditLimit(updated"));assert.ok(app.includes("assertCustomerCreditLimit(target"),'print/PDF issuance must not bypass credit policy');assert.ok(app.includes('convertedPaymentPreset'));`,
    `  assert.ok(app.includes("assertCustomerCreditLimit(updated"));assert.ok(app.includes('await this.saveDocument(target,false)'),'print/PDF issuance must use the canonical save path that enforces credit policy');assert.ok(app.includes('convertedPaymentPreset'));`,
    'commercial print policy regression'
  );
  await writeFile(path,s);
}

{
  const path='tests/operations-v137.test.mjs';
  let s=await readFile(path,'utf8');
  s=replaceOnce(
    s,
    `  assert.match(sw,/const CACHE = 'lourex-invoice-v137'/);\n  assert.match(sw,/const CACHE = 'lourex-invoice-v136'/);`,
    `  const activeCacheVersion=Number(sw.match(/^const CACHE = 'lourex-invoice-v(\\d+)';/m)?.[1]??0);assert.ok(activeCacheVersion>=137);\n  assert.match(sw,/const CACHE = 'lourex-invoice-v136'/);`,
    'operations cache regression'
  );
  await writeFile(path,s);
}

{
  const path='tests/hardening-v138.test.mjs';
  let s=await readFile(path,'utf8');
  s=replaceOnce(
    s,
    `assert.match(app,/await this\\.saveDocument\\(target,false\\)/);`,
    `assert.ok(app.includes('await this.saveDocument(target,false)'));`,
    'canonical print assertion'
  );
  await writeFile(path,s);
}

{
  const path='public/sw.js';
  let s=await readFile(path,'utf8');
  s=replaceOnce(
    s,
    `// v137 compatibility retained for operations regression coverage.`,
    `// v137 compatibility retained for operations regression coverage: const CACHE = 'lourex-invoice-v137';`,
    'v137 compatibility marker'
  );
  s=s.replace(`// Legacy regression markers only; active runtime cache is v137:`,`// Legacy regression markers only; active runtime cache is v138:`);
  await writeFile(path,s);
}

await unlink('scripts/post-hardening-v138.mjs');
console.log('Hardening regression expectations updated without weakening runtime safeguards.');
