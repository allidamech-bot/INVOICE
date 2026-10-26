import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/components/AiConversationWorkspace.tsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/styles/ai-conversation-workspace.css',import.meta.url),'utf8');
const pdfPreview=readFileSync(new URL('../src/lib/ai-pdf-preview.ts',import.meta.url),'utf8');
const preview=source.slice(source.indexOf('function InlineControllerPdfPreview('),source.indexOf('function ConversationDocumentCard('));

test('Controller uses the exact generated File for preview and download, without a second A4 renderer',()=>{
  assert.match(source,/setPdfResult\(\{url,name:\(file as File\)\.name\|\|'LOUREX-Preview.pdf',bytes:file\.size,file\}\);\s*setPdfPreviewOpen\(true\)/);
  assert.match(source,/viewPdf&&pdfPreviewOpen\?<InlineControllerPdfPreview key=\{pdfIdentity\} file=\{viewPdf\.file\}/);
  assert.match(source,/href=\{viewPdf\.url\} download=\{viewPdf\.name\}/);
  assert.match(preview,/file\.arrayBuffer\(\)/);
  assert.match(preview,/loadGeneratedAiPdfRenderer\(\)/);
  assert.match(pdfPreview,/vendor\/pdf\.mjs/);
  assert.match(pdfPreview,/vendor\/pdf\.worker\.mjs/);
  assert.match(preview,/pdf\.getPage\(page\)/);
  assert.match(preview,/selected\.render\(\{canvasContext:context,viewport:pixelViewport,canvas:target\}\)/);
  assert.doesNotMatch(preview,/TemplateRenderer|<Renderer|iframe|\.click\(\)/);
});

test('iPhone viewer is fullscreen, scrollable, safe-area aware, zoomable, and handles all PDF pages',()=>{
  assert.match(preview,/ReactDOM\.createPortal\(frame,document\.body\)/);
  assert.match(preview,/aria-modal="true"/);
  assert.match(preview,/setZoom\(0\)/);
  assert.match(preview,/setZoom\(1\)/);
  assert.match(preview,/setZoom\(value=>value===0\?1:/);
  assert.match(preview,/setPage\(next\)/);
  assert.match(preview,/page>=pages/);
  assert.match(preview,/job\?\.cancel\(\)/);
  assert.match(preview,/loaded\.numPages/);
  assert.match(styles,/\.lxw-pdf-screen\{/);
  assert.match(styles,/height:100dvh/);
  assert.match(styles,/env\(safe-area-inset-bottom/);
  assert.match(styles,/\.lxw-pdf-screen-scroll\{[\s\S]*?overflow:auto/);
  assert.match(styles,/-webkit-overflow-scrolling:touch/);
  assert.match(styles,/\.lxw-pdf-screen-page\{/);
});

test('Preview remains read-only and closes without changing the draft or invoking download',()=>{
  assert.match(source,/prepareAiPdfPreview\(kernel,vault/);
  assert.match(source,/__LOUREX_BUILD_CHAT_PDF__/);
  assert.match(source,/onClick=\{\(\)=>void saveIntelligenceDraft\(host,doc\.id,doc\.revision\)\}/);
  assert.match(source,/setPdfPreviewOpen\(false\);setPdfError\(''\)/);
  assert.match(preview,/onClick=\{onClose\}/);
  assert.match(preview,/document\.body\.style\.overflow=overflow/);
  assert.doesNotMatch(preview,/saveIntelligenceDraft|approveProposal|ensureDocumentElectronicCopy|print-portal|\.pdf\-download|createObjectURL|\.set\(/);
});
