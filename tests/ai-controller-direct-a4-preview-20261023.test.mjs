import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/components/AiConversationWorkspace.tsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/styles/ai-conversation-workspace.css',import.meta.url),'utf8');

test('Controller PDF preview is a visible A4 renderer, never a download-only or blank Safari blob iframe',()=>{
  assert.match(source,/function InlineControllerPdfPreview\(/);
  assert.match(source,/<Renderer document=\{source\.document\} scale=\{1\} electronicShareId=\{source\.electronicShareId\}\/>/);
  assert.match(source,/className="lxw-pdf-direct-viewport"/);
  assert.match(source,/className="lxw-pdf-direct-paper"/);
  assert.doesNotMatch(source,/<iframe title=\{label\(ar,'LOUREX PDF file preview'/);
  assert.match(styles,/\.lxw-pdf-direct-paper \[class~='invoice-pages'\]/);
  assert.match(styles,/\.lxw-pdf-direct-paper \[class~='invoice-page'\]/);
  assert.match(styles,/transform-origin:top left/);
  assert.match(source,/new ResizeObserver\(fit\)/);
  assert.match(source,/new MutationObserver\(fit\)/);
});

test('Successful generated PDF opens chat preview automatically and retains separate download',()=>{
  assert.match(source,/setPdfResult\(\{url,name:\(file as File\)\.name\|\|'LOUREX-Preview.pdf',bytes:file\.size\}\);\s*setPdfPreviewOpen\(true\)/);
  assert.match(source,/viewPdf&&pdfPreviewOpen&&PdfRenderer&&pdfSource\?<InlineControllerPdfPreview/);
  assert.match(source,/aria-expanded=\{pdfPreviewOpen\}/);
  assert.match(source,/setPdfPreviewOpen\(value=>!value\)/);
  assert.match(source,/setPdfPreviewOpen\(false\);setPdfError\(''\)/);
  assert.match(source,/href=\{viewPdf\.url\} download=\{viewPdf\.name\}/);
});

test('Preview does not alter approval or general PDF/print bridge',()=>{
  assert.match(source,/prepareAiPdfPreview\(kernel,vault/);
  assert.match(source,/__LOUREX_BUILD_CHAT_PDF__/);
  assert.match(source,/onClick=\{\(\)=>void saveIntelligenceDraft\(host,doc\.id,doc\.revision\)\}/);
  const preview=source.slice(source.indexOf('function InlineControllerPdfPreview('),source.indexOf('function ConversationDocumentCard('));
  assert.doesNotMatch(preview,/saveIntelligenceDraft|approveProposal|print-portal|\.pdf\-download/);
});
