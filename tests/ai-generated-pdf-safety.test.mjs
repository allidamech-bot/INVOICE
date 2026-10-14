import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertGeneratedAiPdfFile} from '../dist/src/lib/ai-pdf-file-validation.js';

const create=(prefix='%PDF-1.7\n',ending='\n%%EOF\n',type='application/pdf')=>{
  const middle='0'.repeat(450);
  return new Blob([prefix,middle,ending],{type});
};
test('Generated PDFs must contain a canonical header, EOF, correct type and nontrivial bytes',async()=>{
  const real=create();
  assert.equal(await assertGeneratedAiPdfFile(real),real);
  await assert.rejects(assertGeneratedAiPdfFile(create('Not a PDF!\n')),/header/);
  await assert.rejects(assertGeneratedAiPdfFile(create('%PDF-1.7\n','\ntruncated')),/incomplete/);
  await assert.rejects(assertGeneratedAiPdfFile(create('%PDF-1.7\n','\n%%EOF\n','text/plain')),/bytes/);
  await assert.rejects(assertGeneratedAiPdfFile(new Blob(['%PDF-1.7\n%%EOF'],{type:'application/pdf'})),/bytes/);
  await assert.rejects(assertGeneratedAiPdfFile({size:999,type:'application/pdf'}),/bytes/);
  assert.equal((await assertGeneratedAiPdfFile(create('%PDF-2.0\n','\n%%EOF\r\n'))).type,'application/pdf');
});
test('A fake PDF must never reach the viewer or download from an AI success card',async()=>{
  const source=await readFile(new URL('../src/components/AiConversationWorkspace.tsx',import.meta.url),'utf8');
  assert.match(source,/await assertGeneratedAiPdfFile\(file\)/);
  const checked=source.indexOf('await assertGeneratedAiPdfFile(file)');
  assert.ok(checked>0&&checked<source.indexOf('URL.createObjectURL(file)',checked),
    'validate header and EOF before exposing a browser object URL');
  assert.match(source,/const pdfStarting=react\.useRef\(false\)/);
  assert.match(source,/const pdfSequence=react\.useRef\(0\)/);
  assert.match(source,/if\(identity!==latestPdfIdentity\.current\|\|request!==pdfSequence\.current\)return/);
  assert.match(source,/setPdfBusy\(true\);setPdfError\(''\);setPdfResult\(null\)/,
    'the busy indicator begins before the asynchronous renderer import');
  assert.match(source,/URL\.revokeObjectURL\(pdfResult\.url\)/,
    'created blob URLs are released when the preview changes');
});
