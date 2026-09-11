;(function(){
  'use strict';

  var runtime=window.__LOUREX_RUNTIME__||{};
  var enterpriseKey=String(runtime.firebaseAppCheckEnterpriseKey||'').trim();
  var required=runtime.firebaseAppCheckRequired===true;
  var state={configured:Boolean(enterpriseKey),required:required,active:false,error:''};
  window.__LOUREX_APP_CHECK__=state;

  if(!enterpriseKey){
    if(required)state.error='Firebase App Check is required but no reCAPTCHA Enterprise key is configured.';
    return;
  }

  if(typeof window.firebase==='undefined'||typeof window.firebase.initializeApp!=='function'||typeof window.firebase.appCheck!=='function'){
    state.error='Firebase App Check runtime is unavailable.';
    if(required)throw new Error(state.error);
    return;
  }

  var originalInitializeApp=window.firebase.initializeApp.bind(window.firebase);
  var activating=false;

  function activateAppCheck(){
    if(state.active||activating)return;
    activating=true;
    try{
      var Provider=window.firebase.appCheck.ReCaptchaEnterpriseProvider;
      if(typeof Provider!=='function')throw new Error('reCAPTCHA Enterprise App Check provider is unavailable.');
      var provider=new Provider(enterpriseKey);
      window.firebase.appCheck().activate(provider,true);
      state.active=true;
      state.error='';
    }catch(error){
      state.error=error instanceof Error?error.message:String(error||'Unable to initialize Firebase App Check.');
      if(required)throw error;
    }finally{
      activating=false;
    }
  }

  if(Array.isArray(window.firebase.apps)&&window.firebase.apps.length)activateAppCheck();

  window.firebase.initializeApp=function(){
    var app=originalInitializeApp.apply(window.firebase,arguments);
    activateAppCheck();
    return app;
  };
})();
