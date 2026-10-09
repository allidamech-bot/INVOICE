import { generateKeyPairSync, sign } from 'node:crypto';

// Runtime-only RSA keypair. No checked-in test private key or production secret.
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:0x10001});
const jwk={...publicKey.export({format:'jwk'}),kid:'lourex-test-key',alg:'RS256',use:'sig'};

export function testFirebaseBearer(){
  const now=Math.floor(Date.now()/1000);
  const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:jwk.kid})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({
    aud:'lourex-invoice',iss:'https://securetoken.google.com/lourex-invoice',
    sub:'lourex-test-user',iat:now-30,exp:now+3600,auth_time:now-60
  })).toString('base64url');
  const signed=header+'.'+payload;
  const signature=sign('RSA-SHA256',Buffer.from(signed),privateKey).toString('base64url');
  return 'Bearer '+signed+'.'+signature;
}

export function withTestFirebaseKeys(baseFetch){
  return async (url,options)=>{
    if(String(url).includes('/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')){
      return {ok:true,headers:new Headers({'cache-control':'max-age=300'}),json:async()=>({keys:[jwk]})};
    }
    return baseFetch(url,options);
  };
}
