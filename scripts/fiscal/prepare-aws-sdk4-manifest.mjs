// Offline ZATCA SDK4 installation attestation. Requires the exact independently
// obtained official archive; it cannot infer archive provenance from a JAR.
// No authority calls, key access, dispatch, service start or production changes.
import {createHash} from 'node:crypto';
import {lstatSync,readdirSync,openSync,closeSync,readSync,writeFileSync,unlinkSync,fsyncSync,linkSync,constants} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export const SDK4_ARCHIVE_SHA256='0e6f62f85c4f5d5da78dba7a9ec90566721e7efeef05dfb4514a159a8e66b1b9';
export const SDK4_ROOT='/opt/lourex-fiscal/sdk4-R4.0.0';
export const MANIFEST_PATH='/etc/lourex-staging/sdk4-installation-manifest.json';
const HEX=/^[a-f0-9]{64}$/;
const fail=(code)=>{throw Error('LOUREX_SDK4_MANIFEST_'+code);};
function node(path,kind){
 let s;try{s=lstatSync(path);}catch{fail('MISSING_FILE');}
 if(s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o022)!==0)fail('UNTRUSTED_PATH');
 if(kind==='file'&&!s.isFile()||kind==='dir'&&!s.isDirectory())fail('INVALID_TYPE');
 return s;
}
function fileHash(path,maximum,sourceArchive=false){
 let s;
 if(sourceArchive){try{s=lstatSync(path);}catch{fail('MISSING_ARCHIVE');}if(s.isSymbolicLink()||!s.isFile())fail('INVALID_ARCHIVE');}
 else s=node(path,'file');
 if(s.nlink!==1||(sourceArchive&&s.size<1)||s.size>maximum)fail('INVALID_SIZE_OR_LINK');
 const h=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{let count=0,n;while((n=readSync(fd,buffer,0,buffer.length,null))>0){count+=n;if(count>maximum)fail('LIMIT_EXCEEDED');h.update(buffer.subarray(0,n));}
 if(count!==s.size)fail('CHANGED_WHILE_HASHING');
 }finally{closeSync(fd);}
 return h.digest('hex');
}
export function buildSdk4Manifest({root,archive,expectedArchiveSha256=SDK4_ARCHIVE_SHA256}){
 if(!HEX.test(expectedArchiveSha256)||typeof root!=='string'||typeof archive!=='string'||resolve(root)!==root||resolve(archive)!==archive)fail('INVALID_ARGUMENT');
 node(root,'dir');
 // Archive proof is mandatory: the extracted folder alone cannot prove origin.
 if(fileHash(archive,1024*1024*1024,true)!==expectedArchiveSha256)fail('ARCHIVE_SHA_MISMATCH');
 const files={},walk=(dir)=>{
  node(dir,'dir');
  for(const entry of readdirSync(dir,{withFileTypes:true})){
   const path=join(dir,entry.name),rel=relative(root,path).split('\\').join('/');
   if(!rel||rel.startsWith('../')||rel.includes('\0'))fail('INVALID_PATH');
   if(entry.isDirectory())walk(path);
   else if(entry.isFile()){
    if(Object.keys(files).length>=4096)fail('TOO_MANY_FILES');
    files[rel]=fileHash(path,1024*1024*1024);
   }else fail('UNSUPPORTED_FILE');
  }
 };
 walk(root);
 const launcher='Apps/fatoora',sdkConfig='Configuration/config.json';
 if(!files[launcher]||!files[sdkConfig]||!files['Apps/zatca-einvoicing-sdk-238-R4.0.0.jar'])fail('REQUIRED_SDK_FILE_MISSING');
 if((node(join(root,launcher),'file').mode&0o111)===0)fail('LAUNCHER_NOT_EXECUTABLE');
 let settings;try{
  const fd=openSync(join(root,sdkConfig),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{let s='';const b=Buffer.alloc(4096);let n;while((n=readSync(fd,b,0,b.length,null))>0){s+=b.subarray(0,n).toString('utf8');if(s.length>131072)fail('CONFIG_TOO_LARGE');}settings=JSON.parse(s);}finally{closeSync(fd);}
 }catch{fail('INVALID_CONFIG');}
 if(!settings||typeof settings!=='object'||Array.isArray(settings))fail('INVALID_CONFIG');
 const helper=fileURLToPath(new URL('./verify-sdk4-archive.py',import.meta.url));
 const check=spawnSync('/usr/bin/python3',['-I',helper,archive],{encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'}});
 if(check.error||check.status!==0)fail('ZIP_CONTENT_NOT_VERIFIED');
 let archived;try{archived=JSON.parse(check.stdout);}catch{fail('ZIP_CONTENT_NOT_VERIFIED');}
 if(JSON.stringify(Object.keys(archived).sort())!==JSON.stringify(Object.keys(files).sort())||Object.keys(files).some(k=>archived[k]!==files[k]))fail('ZIP_EXTRACTED_FILES_MISMATCH');
 return {sdkVersion:'4.0.0',sdkArchiveSha256:expectedArchiveSha256,launcher,sdkConfig,files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b,'en')))};
}
export function encodeManifest(manifest){return Buffer.from(JSON.stringify(manifest,null,2)+'\n','utf8');}
function storeExclusive(path,bytes){
 if(path!==MANIFEST_PATH)fail('INVALID_DESTINATION');
 node('/etc/lourex-staging','dir');
 const tmp=path+'.pending-'+process.pid;
 let fd;
 try{
  fd=openSync(tmp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;
  // Existing pinned manifests must not be replaced by automated execution.
  try{node(path,'file');fail('ALREADY_INSTALLED');}catch(e){if(e.message!=='LOUREX_SDK4_MANIFEST_MISSING_FILE')throw e;}
  linkSync(tmp,path);unlinkSync(tmp);
 }finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(tmp);}catch{}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.getuid()!==0||process.argv.length!==4||process.argv[2]!=='--archive')fail('USAGE');
  const bytes=encodeManifest(buildSdk4Manifest({root:SDK4_ROOT,archive:process.argv[3]}));
  storeExclusive(MANIFEST_PATH,bytes);
  process.stdout.write('LOUREX_SDK4_ARCHIVE_AND_MANIFEST_VERIFIED\nMANIFEST_SHA256 '+createHash('sha256').update(bytes).digest('hex')+'\n');
 }catch(e){process.stderr.write((/^LOUREX_SDK4_MANIFEST_[A-Z_]+$/.test(e?.message)?e.message:'LOUREX_SDK4_MANIFEST_FAILED_CLOSED')+'\n');process.exitCode=2;}
}
