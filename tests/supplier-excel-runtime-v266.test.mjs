import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v266 supplier Excel import uses the shared locally vendored SheetJS runtime',async()=>{
  const [component,reader,build,sw]=await Promise.all([
    read('src/components/SupplierDocumentImport.tsx'),
    read('src/lib/spreadsheet-reader.ts'),
    read('scripts/build.mjs'),
    read('dist/sw.js')
  ]);
  assert.match(component,/readSpreadsheetFile/);
  assert.match(reader,/XLSX_RUNTIME='\.\/vendor\/xlsx\.full\.min\.js'/);
  assert.ok(!component.includes('cdn.jsdelivr.net/npm/xlsx@0.18.5'));
  assert.ok(!reader.includes('cdn.jsdelivr.net/npm/xlsx@0.18.5'));
  assert.match(build,/name:'xlsx\.full\.min\.js'/);
  assert.ok(sw.includes('./vendor/xlsx.full.min.js'));
});
