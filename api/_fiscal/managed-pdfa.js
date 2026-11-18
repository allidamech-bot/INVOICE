import {spawnSync} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {requireProtectedSigningSession} from './protected-signing.js';
import {verifySimplifiedQrReference} from './simplified-qr-reference.js';
import {hashCanonicalInvoice,hashArtifact} from './fiscal-artifacts.js';

// Internal offline reference only. Trusted caller resolves immutable reported
// record/snapshot and policy. No client route, production activation or signing
// a standard invoice with an EGS taxpayer certificate.
const CAP=48*1024*1024, PDF=32*1024*1024, DIGEST=/^[a-f0-9]{64}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const script=fileURLToPath(new URL('../../scripts/fiscal/pades_cli.py',import.meta.url));
const encoded=b=>b.toString('base64');
function decode(s,cap){if(typeof s!=='string'||s.length>Math.ceil(cap/3)*4)throw Error('PADES_IPC_INVALID');const b=Buffer.from(s,'base64');if(!b.length||b.length>cap||encoded(b)!==s)throw Error('PADES_IPC_INVALID');return b;}
function command(python,op,payload){
  const input=Buffer.from(JSON.stringify(payload));if(input.length>CAP)throw Error('PADES_IPC_TOO_LARGE');
  const r=spawnSync(python,[script,op],{input,timeout:290000,maxBuffer:CAP});
  if(r.error||r.status!==0)throw Error('PADES_PIPELINE_FAILED');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(r.stdout));
}
export async function buildManagedFiscalPdfReference({record,invoice,xml,session,policy,canonicalize,pythonExecutable,validator}){
  const s=requireProtectedSigningSession(session),chain=s.chainDer;
  if(!record||record.status!=='reported'||record.mode!=='reporting'||!DIGEST.test(record.resultDigest??'')||['accountUid','workspaceId','egsId'].some(k=>record[k]!==s.scope[k])||invoice?.mode!=='simplified'||invoice.seller?.vatNumber!==s.issuerVat||record.uuid!==invoice.uuid||record.icv!==invoice.icv||record.previousInvoiceHash!==invoice.previousInvoiceHash||typeof pythonExecutable!=='string'||!isAbsolute(pythonExecutable)||typeof validator!=='string'||!isAbsolute(validator)||typeof canonicalize!=='function')throw Error('PADES_SCOPE_MISMATCH');
  const original=Buffer.from(xml);if(hashArtifact(original)!==record.artifactDigest||hashCanonicalInvoice(canonicalize(original,'invoice'))!==record.invoiceHash||!verifySimplifiedQrReference({invoice,bytes:original,chain,at:record.generatedAt,policy,canonicalize}))throw Error('PADES_XML_NOT_VERIFIED');
  const common={xml:encoded(original),certs:chain.map(encoded),at:s.at,validator};
  const manifest={uuid:record.uuid,mode:'simplified',status:'reported',xmlDigest:record.artifactDigest,generatedAt:record.generatedAt,environment:'simulation'};
  const p=command(pythonExecutable,'prepare',{...common,manifest,issuerVat:s.issuerVat});
  const staged=decode(p.staged,PDF),attrs=decode(p.attrs,512*1024);
  if(!Number.isSafeInteger(p.originalSize)||p.originalSize<=0||p.originalSize>=staged.length||p.evidence?.status!=='offline-pdfa-package-candidate'||p.evidence.pdfDigest!==sha(staged.subarray(0,p.originalSize))||p.evidence.xmlDigest!==record.artifactDigest||!DIGEST.test(p.evidence.packageValidationDigest??''))throw Error('PADES_PREPARATION_INVALID');
  const signature=await s.sign('pades-signed-attributes',attrs);
  const f=command(pythonExecutable,'finish',{...common,staged:encoded(staged),originalSize:p.originalSize,evidence:p.evidence,signature:encoded(signature)});
  const bytes=decode(f.pdf,PDF);
  if(f.evidence?.status!=='offline-pades-reference'||f.evidence.pdfDigest!==sha(bytes)||f.evidence.unsignedPdfDigest!==p.evidence.pdfDigest||f.evidence.xmlDigest!==record.artifactDigest||!DIGEST.test(f.evidence.finalValidationDigest??''))throw Error('PADES_FINAL_INVALID');
  return {status:'offline-pades-reference',bytes,evidence:f.evidence};
}
