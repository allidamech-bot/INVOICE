import {X509Certificate,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

// Offline CRL-only PKIX verifier. Trust pins and policy MUST come from a
// separately authorized environment configuration, never returned XML or a browser.
const digest=b=>createHash('sha256').update(b).digest('hex');
const HEX=/^[a-f0-9]{64}$/;
const OID=/^[012](?:\.(?:0|[1-9][0-9]{0,9})){2,20}$/;
const DAY=86400000;
function date(s){if(typeof s!=='string'||!Number.isFinite(Date.parse(s))||new Date(s).toISOString()!==s)throw Error('INVALID_TIME');return Date.parse(s);}
function der(b,max){if(!Buffer.isBuffer(b)||!b.length||b.length>max)throw Error('INVALID_DER');return b;}
function openssl(args,input){
  const r=spawnSync('openssl',args,{input,timeout:5000,maxBuffer:512*1024,env:{...process.env,LC_ALL:'C'}});
  if(r.status!==0||r.error)throw Error('PKIX_REJECTED');return r.stdout;
}
function crlPem(bytes,at){
  der(bytes,256*1024);
  const roundtrip=openssl(['crl','-inform','DER','-outform','DER'],bytes);
  if(!roundtrip.equals(bytes))throw Error('INVALID_CRL');
  const dates=openssl(['crl','-inform','DER','-noout','-lastupdate','-nextupdate'],bytes).toString('ascii');
  const m=/^lastUpdate=(.+)\r?\nnextUpdate=(.+)\r?\n$/.exec(dates);
  if(!m)throw Error('INVALID_CRL_TIME');
  const from=Date.parse(m[1]),to=Date.parse(m[2]);
  if(!Number.isFinite(from)||!Number.isFinite(to)||from>at||at>=to||to-from>7*DAY)throw Error('INVALID_CRL_TIME');
  return openssl(['crl','-inform','DER','-outform','PEM'],bytes);
}
function verifyInEnvironment({environment,chainDer,crlsDer,trust,signedAt,observedAt},expected){
  let dir;
  try{
    if(environment!==expected||trust?.environment!==environment||!HEX.test(trust.rootDigest??'')||!Array.isArray(trust.authoritySignerDigests)||!trust.authoritySignerDigests.length||trust.authoritySignerDigests.length>32||trust.authoritySignerDigests.some(x=>typeof x!=='string'||!HEX.test(x))||typeof trust.policyOid!=='string'||!OID.test(trust.policyOid)||!['secp256k1','prime256v1'].includes(trust.curve))return false;
    const at=date(signedAt),observed=date(observedAt);if(at>observed)return false;
    if(!Array.isArray(chainDer)||chainDer.length<2||chainDer.length>8||!Array.isArray(crlsDer)||crlsDer.length!==chainDer.length-1)return false;
    const chain=chainDer.map(b=>{const c=new X509Certificate(der(b,32768));if(!c.raw.equals(b))throw Error('INVALID_CERT');return c;});
    const pins=chain.map(c=>digest(c.raw));
    if(new Set(pins).size!==chain.length||pins.at(-1)!==trust.rootDigest||!trust.authoritySignerDigests.includes(pins[0]))return false;
    const leaf=chain[0],root=chain.at(-1);
    if(leaf.ca||leaf.publicKey.asymmetricKeyType!=='ec'||leaf.publicKey.asymmetricKeyDetails?.namedCurve!==trust.curve||!root.ca||!root.checkIssued(root)||!root.verify(root.publicKey))return false;
    for(let i=0;i<chain.length;i++){
      const c=chain[i];if(at<Date.parse(c.validFrom)||at>Date.parse(c.validTo))return false;
      if(i<chain.length-1){const issuer=chain[i+1];if(!issuer.ca||!c.checkIssued(issuer)||!c.verify(issuer.publicKey))return false;}
    }
    // Require digitalSignature explicitly; PKIX purpose 'any' alone is insufficient.
    const usage=openssl(['x509','-inform','DER','-noout','-ext','keyUsage'],leaf.raw).toString('ascii');
    if(!/^X509v3 Key Usage:(?: critical)?\r?\n[ \t]+[^\r\n]+\r?\n$/.test(usage)||!usage.split(/[:,\n]/).some(v=>v.trim()==='Digital Signature'))return false;
    const crls=crlsDer.map(b=>crlPem(b,at));
    dir=mkdtempSync(join(tmpdir(),'fiscal-pkix-'));
    const file=(name,content)=>{const path=join(dir,name);writeFileSync(path,content,{mode:0o600,flag:'wx'});return path;};
    const rootFile=file('root.pem',root.toString()),leafFile=file('leaf.pem',leaf.toString()),crlFile=file('crls.pem',Buffer.concat(crls));
    const intermediate=chain.length>2?['-untrusted',file('intermediates.pem',chain.slice(1,-1).map(c=>c.toString()).join('\n'))]:[];
    openssl(['verify','-trusted',rootFile,'-no-CAfile','-no-CApath','-no-CAstore',...intermediate,'-CRLfile',crlFile,'-crl_check_all','-x509_strict','-check_ss_sig','-auth_level','2','-attime',String(Math.floor(at/1000)),'-policy',trust.policyOid,'-policy_check','-explicit_policy','-inhibit_any','-inhibit_map',leafFile]);
    return true;
  }catch{return false;}finally{if(dir)rmSync(dir,{recursive:true,force:true});}
}

export const verifyAuthorityCertificate=input=>verifyInEnvironment(input,'simulation');
export const verifyProductionAuthorityCertificate=input=>verifyInEnvironment(input,'production');
