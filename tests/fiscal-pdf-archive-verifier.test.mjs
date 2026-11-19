import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createIndependentFiscalPdfVerifier} from '../api/_fiscal/pdf-archive-verifier.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const scope={environment:'simulation',accountUid:'owner',workspaceId:'company',egsId:'egs'},xml=Buffer.from('<synthetic/>'),pdf=Buffer.from('%PDF-synthetic');
const record={...scope,uuid:'f05b6c1e-2034-4f89-9181-69d1627b3c04',mode:'clearance',status:'cleared',resultDigest:'a'.repeat(64),generatedAt:'2026-11-19T10:00:00.000Z',clearedArtifactDigest:sha(xml)};
const evidence={...scope,uuid:record.uuid,mode:'standard',resultDigest:record.resultDigest,xmlDigest:sha(xml),pdfDigest:sha(pdf),interoperabilityDigest:'b'.repeat(64),authorityXmlValidationDigest:'c'.repeat(64),signaturePolicy:'authority-cleared-unsigned-container',valid:true};
const fixture=(patch={},options={})=>createIndependentFiscalPdfVerifier({pythonExecutable:'/missing/python',validator:'/missing/verapdf',resolveIndependentEvidence:async()=>({...evidence,...patch}),...options});
test('archive verifier rejects absent executable, unbound proof, wrong signature policy and modified accepted bytes',async()=>{
 const context={scope,record,xml,pdf};
 await assert.rejects(fixture()(context),/FISCAL_PDF_NOT_VERIFIED/);
 for(const patch of [{valid:false},{workspaceId:'wrong'},{pdfDigest:'d'.repeat(64)},{resultDigest:'d'.repeat(64)},{authorityXmlValidationDigest:''},{signaturePolicy:'pades-b-b'}])await assert.rejects(fixture(patch)(context),/FISCAL_PDF_NOT_VERIFIED/);
 await assert.rejects(fixture()({...context,xml:Buffer.from('different')}),/FISCAL_PDF_NOT_VERIFIED/);
 assert.throws(()=>createIndependentFiscalPdfVerifier({pythonExecutable:'python',validator:'verapdf',resolveIndependentEvidence:async()=>evidence}));
});
