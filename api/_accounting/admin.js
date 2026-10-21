import {initializeApp,getApps,applicationDefault,cert} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createPeriodService} from './period-store.js';
import {fail} from './period-format.js';

export function getProductionPeriodService(){
  // Activation is a release operation after rules and client compatibility QA.
  // Missing credentials or a rules-ack flag never falls back to browser writes.
  if(process.env.LOUREX_PERIOD_SERVER_ENABLED!=='true'||process.env.LOUREX_PERIOD_RULES_VERSION!=='1'
    ||process.env.FIRESTORE_EMULATOR_HOST)fail(503,'PERIOD_SERVICE_UNAVAILABLE');
  let app=getApps().find(a=>a.name==='lourex-period-writer');
  if(!app){
    let credential;
    if(process.env.LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON){
      let account;try{account=JSON.parse(process.env.LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON);}catch{fail(503,'PERIOD_SERVICE_UNAVAILABLE');}
      if(account?.project_id!=='lourex-invoice'||typeof account.client_email!=='string'||typeof account.private_key!=='string')fail(503,'PERIOD_SERVICE_UNAVAILABLE');
      credential=cert(account);
    }else{
      if(!process.env.GOOGLE_APPLICATION_CREDENTIALS)fail(503,'PERIOD_SERVICE_UNAVAILABLE');
      credential=applicationDefault();
    }
    app=initializeApp({projectId:'lourex-invoice',credential},'lourex-period-writer');
  }
  return createPeriodService(getFirestore(app));
}
