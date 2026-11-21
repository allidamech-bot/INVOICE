import {initializeApp,getApps,applicationDefault,cert} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createPeriodService} from './period-store.js';
import {fail} from './period-format.js';
import {prepareVercelFederatedCredential} from './vercel-federated-credential.js';
import {createProductionPeriodGuard} from '../_fiscal/production-period-guard.js';

export function getProductionPeriodService(request){
  // Activation is a release operation after rules and client compatibility QA.
  // Missing credentials or a rules-ack flag never falls back to browser writes.
  if(process.env.LOUREX_PERIOD_SERVER_ENABLED!=='true'||process.env.LOUREX_PERIOD_RULES_VERSION!=='1'
    ||process.env.FIRESTORE_EMULATOR_HOST)fail(503,'PERIOD_SERVICE_UNAVAILABLE');
  const federated=process.env.LOUREX_FIREBASE_AUTH_MODE==='vercel-oidc';
  if(federated)prepareVercelFederatedCredential(request);
  else if(process.env.LOUREX_FIREBASE_AUTH_MODE!==undefined)fail(503,'PERIOD_SERVICE_UNAVAILABLE');
  const name=federated?'lourex-period-writer-oidc':'lourex-period-writer';
  let app=getApps().find(a=>a.name===name);
  if(!app){
    let credential;
    if(federated)credential=applicationDefault();
    else if(process.env.LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON){
      let account;try{account=JSON.parse(process.env.LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON);}catch{fail(503,'PERIOD_SERVICE_UNAVAILABLE');}
      if(account?.project_id!=='lourex-invoice'||typeof account.client_email!=='string'||typeof account.private_key!=='string')fail(503,'PERIOD_SERVICE_UNAVAILABLE');
      credential=cert(account);
    }else{
      if(!process.env.GOOGLE_APPLICATION_CREDENTIALS)fail(503,'PERIOD_SERVICE_UNAVAILABLE');
      credential=applicationDefault();
    }
    app=initializeApp({projectId:'lourex-invoice',credential},name);
  }
  const db=getFirestore(app);
  return createPeriodService(db,{fiscalGuard:createProductionPeriodGuard(db)});
}
