import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createSdk4LocalValidator,normalizeSdk4Proof,SDK4_ARCHIVE_SHA256} from '../api/_fiscal/sdk4-local-validator.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const scope={environment:'simulation',accountUid:'owner',workspaceId:'company',egsId:'egs'},uuid='11111111-1111-4111-8111-111111111111';
const xml=(mode,kind)=>Buffer.from('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:UUID>'+uuid+'</cbc:UUID><cbc:InvoiceTypeCode name="'+(mode==='standard'?'01':'02')+'00000">'+({'invoice':'388','credit-note':'381','debit-note':'383','prepayment':'386'})[kind]+ '</cbc:InvoiceTypeCode>'+(mode==='simplified'?'<ext:UBLExtensions xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"><ext:UBLExtension><ext:ExtensionContent><sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2"><sac:SignatureInformation xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2"><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>Y2VydA==</ds:X509Certificate></ds:X509Data></ds:KeyInfo></ds:Signature></sac:SignatureInformation></sig:UBLDocumentSignatures></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>':'')+'</Invoice>');
function input(mode='standard',kind='invoice'){
 const bytes=xml(mode,kind);return {scope,mode:mode==='standard'?'clearance':'reporting',invoice:{mode,kind,uuid},bytes,invoiceHash:createHash('sha256').update(bytes).digest('base64')};
}
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'sdk4-validator-')),root=join(dir,'sdk'),javaHome=join(dir,'java'),manifestPath=join(dir,'manifest.json');
 mkdirSync(root);mkdirSync(join(javaHome,'bin'),{recursive:true});writeFileSync(join(javaHome,'bin',process.platform==='win32'?'java.exe':'java'),'fixture');
 const launcher=join(root,'fatoora'),jar=join(root,'fixture.jar'),sdkConfig=join(root,'config.json');writeFileSync(sdkConfig,'{}');
 const stages=['XSD','EN','KSA','PIH','QR','SIGNATURE'];
 const log='Welcome to ZATCA E-Invoice Java SDK 4.0.0\n'+stages.map(s=>'['+s+'] validation result : PASSED').join('\n')+'\nGLOBAL VALIDATION RESULT = PASSED\n';
 // Synthetic launcher tests IPC and fail-closed parsing, NOT an SDK pass.
 const script=(value=log,extra='')=>'#!/bin/sh\nset -eu\n[ "$1" = -validate ] && [ "$2" = -invoice ] && [ -f "$3" ]\n[ -z "${LOUREX_TEST_SECRET+x}" ] && [ -f "$SDK_CONFIG" ] && [ "$FATOORA_HOME" = "$PWD" ]\n'+extra+'\nprintf %s '+"'"+value+"'"+'\n';
 writeFileSync(launcher,script(),{mode:0o700});writeFileSync(jar,'synthetic jar');
 const pin=()=>{const manifest={sdkVersion:'4.0.0',sdkArchiveSha256:SDK4_ARCHIVE_SHA256,launcher:'fatoora',sdkConfig:'config.json',files:{'config.json':sha(readFileSync(sdkConfig)),fatoora:sha(readFileSync(launcher)),'fixture.jar':sha(readFileSync(jar))}};const raw=JSON.stringify(manifest);writeFileSync(manifestPath,raw);return sha(raw);};
 let pythonExecutable=process.env.LOUREX_FISCAL_PYTHON||(process.platform==='win32'?'python':'python3');const executable=spawnSync(pythonExecutable,['-c','import sys; print(sys.executable)'],{encoding:'utf8'});assert.equal(executable.status,0);pythonExecutable=executable.stdout.trim();
 const config={pythonExecutable,installationRoot:root,manifestPath,manifestSha256:pin(),javaHome,canonicalize:b=>b};
 return {dir,root,launcher,jar,script,log,pin,config,clean:()=>rmSync(dir,{recursive:true,force:true})};
}
test('stored SDK evidence binds version, exact XML, UUID and required stages',()=>{
 const i=input('simplified','credit-note'),r={uuid,mode:i.mode,artifactDigest:sha(i.bytes)},p={format:'LOUREX_SDK4_VALIDATION_V1',sdkVersion:'4.0.0',sdkArchiveSha256:SDK4_ARCHIVE_SHA256,installationManifestSha256:'a'.repeat(64),kind:'simplified-credit',uuid,xmlSha256:r.artifactDigest,logSha256:'b'.repeat(64),stages:['QR','SIGNATURE','XSD','EN','KSA','PIH']};
 assert.deepEqual(normalizeSdk4Proof(p,r).stages,['EN','KSA','PIH','QR','SIGNATURE','XSD']);
 for(const change of [{uuid:'wrong'},{xmlSha256:'c'.repeat(64)},{sdkVersion:'3.4.8'},{kind:'standard-credit'},{stages:['XSD','EN','KSA','PIH']},{stages:[...p.stages,'QR']},{privateKey:'injected'}])assert.throws(()=>normalizeSdk4Proof({...p,...change},r),/OFFICIAL_VALIDATION_REQUIRED/);
 assert.throws(()=>createSdk4LocalValidator({pythonExecutable:'python3'}));
});
test('actual Python IPC executes pinned synthetic runner and rejects mutation or partial SDK output',{skip:process.platform==='win32'?'POSIX synthetic launcher fixture':false},async()=>{
 const f=fixture();const prior=process.env.LOUREX_TEST_SECRET;process.env.LOUREX_TEST_SECRET='do not inherit';try{
 const validator=createSdk4LocalValidator(f.config);
 for(const mode of ['standard','simplified'])for(const kind of ['invoice','credit-note','debit-note','prepayment']){const i=input(mode,kind),p=await validator(i);assert.equal(p.xmlSha256,sha(i.bytes));assert.equal(p.uuid,uuid);assert.equal(p.sdkVersion,'4.0.0');}
 await assert.rejects(validator({...input(),scope:{...scope,environment:'production'}}));
 await assert.rejects(validator({...input(),invoiceHash:'wrong'}));
 await assert.rejects(validator({...input(),invoice:{...input().invoice,kind:'credit-note'}}));
 writeFileSync(f.jar,'modified');await assert.rejects(validator(input()));writeFileSync(f.jar,'synthetic jar');
 writeFileSync(join(f.root,'extra.jar'),'extra');await assert.rejects(validator(input()));rmSync(join(f.root,'extra.jar'));
 symlinkSync(f.jar,join(f.root,'link.jar'));await assert.rejects(validator(input()));rmSync(join(f.root,'link.jar'));
 const rejectRunner=async(log,extra='')=>{writeFileSync(f.launcher,f.script(log,extra),{mode:0o700});const v=createSdk4LocalValidator({...f.config,manifestSha256:f.pin()});await assert.rejects(v(input('simplified')));};
 await rejectRunner(f.log.replace('[SIGNATURE] validation result : PASSED',''));
 await rejectRunner(f.log+'[WARN] validation uncertain\n');
 await rejectRunner(f.log,'printf changed >> "$3"');
 await rejectRunner(f.log,'printf changed >> "$SDK_CONFIG"');
 const i=input('simplified'),missing=Buffer.from(i.bytes.toString().replace('Y2VydA==','!'));
 await assert.rejects(validator({...i,bytes:missing,invoiceHash:createHash('sha256').update(missing).digest('base64')}));
 await rejectRunner(f.log,'printf changed >> fixture.jar');
 await assert.rejects(createSdk4LocalValidator({...f.config,pythonExecutable:'/missing/python'})(input()));
 }finally{if(prior===undefined)delete process.env.LOUREX_TEST_SECRET;else process.env.LOUREX_TEST_SECRET=prior;f.clean();}
});
