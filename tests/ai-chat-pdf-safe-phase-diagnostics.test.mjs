import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=()=>readFile(new URL('../src/components/AiConversationWorkspace.tsx',import.meta.url),'utf8');
const card=async()=>{
  const all=await source();
  return all.slice(all.indexOf('function ConversationDocumentCard('),all.indexOf('function ArtifactWorkspace('));
};

test('Controller PDF stage logging records fixed outcomes, never data or raw errors',async()=>{
  const s=await card();
  assert.match(s,/type PdfStage='document'\|'qr'\|'template'\|'render'\|'validate'\|'identity'\|'complete'/);
  const start=s.indexOf('const markPdfStage=');
  const end=s.indexOf('  const pdfStage=react.useRef',start);
  assert.ok(start>=0&&end>start);
  const telemetry=s.slice(start,end);
  assert.match(telemetry,/__LOUREX_DIAGNOSTICS__\?\.mark\?\.\('ai-chat-pdf-stage','stage='\+stage\+' status='\+status\)/);
  assert.doesNotMatch(telemetry,/\buid\b|\.email|customerId|document\.number|pdfSource\.document|\bError\b|\berror\.message\b|\be\.message\b|\btoken\b/i);
  assert.match(telemetry,/status:'start'\|'ok'\|'failed'/);
});

test('PDF preparation, QR, template, renderer, bytes validation and stale identity have distinct stage boundaries',async()=>{
  const s=await card();
  const preparation=s.slice(s.indexOf('  const createPdf=async'),s.indexOf('  React.useEffect(()=>{\n    if(host.state.__workspacePdfAutoStart'));
  for(const step of ["let phase:PdfStage='document'","phase='qr'","phase='template'"])
    assert.ok(preparation.includes(step),'Missing preparation stage '+step);
  assert.ok(preparation.indexOf("markPdfStage(phase,'start')")<preparation.indexOf('prepareAiPdfPreview('));
  assert.ok(preparation.indexOf("phase='qr'")<preparation.indexOf('planAiChatPdfQr('));
  assert.ok(preparation.indexOf("phase='template'")<preparation.indexOf("await import('../templates/TemplateRenderer.js')"));
  assert.match(preparation,/markPdfStage\(phase,'failed'\);\s*setPdfError\(qrAttemptFailed\?aiChatQrFailureGuidance/);
  const output=s.slice(s.indexOf('  React.useEffect(()=>{\n    if(!pdfSource)return'),s.indexOf('  if(!doc)return approval'));
  assert.match(output,/let phase:PdfStage='render'/);
  assert.ok(output.indexOf("phase='validate'")>output.indexOf('const file=await build('));
  assert.ok(output.indexOf("phase='identity'")>output.indexOf('await assertGeneratedAiPdfFile(file)'));
  assert.ok(output.indexOf("phase='complete'")>output.indexOf('URL.createObjectURL(file)'));
  assert.match(output,/if\(!cancelled\)\{markPdfStage\(phase,'failed'\);setPdfError/);
});

test('PDF diagnosis does not change QR authorization, watermark consent, saved document, or PDF bytes',async()=>{
  const s=await card();
  assert.match(s,/allowOfflineCopy&&!pdfQrError\)return/);
  assert.match(s,/planAiChatPdfQr\(document,async\(\)=>/);
  assert.match(s,/if\(qrAttemptFailed\)setPdfQrError\('qr-unavailable'\)/);
  assert.match(s,/pdfQrError\?<button[^>]*onClick=\{\(\)=>void createPdf\(true\)\}/);
  assert.match(s,/const file=await build\(stage,'LOUREX-'\+pdfSource\.document\.number\)/);
  assert.match(s,/await assertGeneratedAiPdfFile\(file\)/);
  assert.doesNotMatch(s,/console\.(?:log|error|warn)\(/);
});
