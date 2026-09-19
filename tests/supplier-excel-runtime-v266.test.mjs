import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v266 supplier Excel import uses the locally vendored SheetJS runtime',async()=>{
  const [component,build,sw]=await Promise.all([
    read('src/components/SupplierDocumentImport.tsx'),
    read('scripts/build.mjs'),
    read('dist/sw.js')
  ]);
  assert.match(component,/const XLSX_RUNTIME='\.\/vendor\/xlsx\.full\.min\.js'/);
  assert.ok(!component.includes('cdn.jsdelivr.net/npm/xlsx@0.18.5'));
  assert.match(build,/name:'xlsx\.full\.min\.js'/);
  assert.ok(sw.includes('./vendor/xlsx.full.min.js'));
});
