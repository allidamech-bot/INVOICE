// Live public iPhone/iPad WebKit acceptance for the signed-out gateway only.
// Fresh isolated browser contexts, no credentials, no requests to AI APIs,
// no Firebase writes, no production modifications, and no claims about editors.
import {webkit} from 'playwright';

const url='https://invoice-three-puce.vercel.app/';
const expectedCommit='de7809bbcdd096f91b9acd144de5179b81df575d';
const profiles=[
  {label:'iPhone-390',width:390,height:844,mobile:true},
  {label:'iPad-820',width:820,height:1180,mobile:true},
];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const browser=await webkit.launch({headless:true});
const findings=[];
let failed=false;
try {
  for(const profile of profiles){
    const context=await browser.newContext({
      viewport:{width:profile.width,height:profile.height},
      isMobile:profile.mobile,hasTouch:true,deviceScaleFactor:2,
      serviceWorkers:'block', // test uncached first paint, not PWA cache state
    });
    const page=await context.newPage();
    const jsErrors=[];
    page.on('pageerror',error=>jsErrors.push(String(error?.message||error).slice(0,220)));
    try{
      const navigation=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
      const code=navigation?.status()??0;
      if(code!==200)throw new Error('Public navigation returned '+code);
      await page.waitForFunction(()=>{
        const form=document.querySelector('.ta-auth-page');
        const root=document.getElementById('root');
        return Boolean(form&&root&&form.getBoundingClientRect().width>0&&root.querySelector('input[type=password]'));
      },null,{timeout:25000});
      const snapshots=[];
      for(const delay of [0,750,1000,1500]){
        if(delay)await sleep(delay);
        const state=await page.evaluate(()=>{
          const rect=(el)=>{if(!el)return null;const r=el.getBoundingClientRect();return {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)};};
          const auth=document.querySelector('.ta-auth-page');
          const card=document.querySelector('.ta-auth-card');
          const logo=document.querySelector('.ta-auth-mobile-brand .brand-mark img');
          const root=document.getElementById('root');
          const boot=document.getElementById('lourex-boot');
          const documentWidth=Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0);
          return {
            rootVisible:!!root&&!!root.getBoundingClientRect().height,
            authVisible:!!auth&&getComputedStyle(auth).visibility!=='hidden'&&auth.getBoundingClientRect().height>0,
            passwordVisible:[...document.querySelectorAll('input[type=password]')].some(el=>el.getBoundingClientRect().height>0),
            bootVisible:!!boot&&getComputedStyle(boot).display!=='none'&&boot.getBoundingClientRect().height>0,
            errorBoundary:/An unexpected screen error occurred|حدث خطأ غير متوقع/.test(root?.innerText||''),
            horizontalOverflow:Math.max(0,documentWidth-innerWidth),
            card:rect(card),logo:rect(logo),logoLoaded:!logo||!!(logo.complete&&logo.naturalWidth>0),
            viewport:innerWidth,
          };
        });
        snapshots.push(state);
      }
      // After auth has appeared, no return to the boot cover or legacy PIN is allowed.
      const valid=snapshots.every(s=>s.rootVisible&&s.authVisible&&s.passwordVisible&&!s.bootVisible&&!s.errorBoundary&&s.horizontalOverflow<=2&&s.logoLoaded);
      // Large card/layout jump *after* the sign-in is usable is a first-paint regression.
      const xs=snapshots.map(s=>s.card?.x).filter(Number.isFinite);
      const ys=snapshots.map(s=>s.card?.y).filter(Number.isFinite);
      const leftShift=xs.length?Math.max(...xs)-Math.min(...xs):0;
      const topShift=ys.length?Math.max(...ys)-Math.min(...ys):0;
      const stable=leftShift<=12&&topShift<=24;
      if(!valid||!stable||jsErrors.length)failed=true;
      findings.push({
        profile:profile.label,state:valid&&stable&&!jsErrors.length?'PASS':'FAIL_SIGNED_OUT_GATEWAY',
        http:code,authVisible:snapshots.at(-1)?.authVisible,
        horizontalOverflow:snapshots.map(s=>s.horizontalOverflow),
        cardJump:{x:leftShift,y:topShift},bootReappeared:snapshots.some(s=>s.bootVisible),
        jsErrors,geometry:snapshots.map(s=>({card:s.card,logo:s.logo}))
      });
    }catch(error){
      failed=true;
      findings.push({profile:profile.label,state:'INCONCLUSIVE_OR_FAIL_STARTUP',
        reason:String(error?.message||error).slice(0,500),jsErrors});
    }finally{
      await context.close();
    }
  }
}finally{await browser.close();}
console.log(JSON.stringify({type:'LOUREX_LIVE_SIGNED_OUT_WEBKIT',productionCommitPreviouslyVerified:expectedCommit,
  scope:'live public signed-out first paint only; not actual iOS Safari, PWA cache, editor or authenticated data',
  findings},null,2));
if(failed){console.error('FAIL/INCONCLUSIVE: signed-out WebKit production observation needs review; this is NOT proof of the authenticated editor flash.');process.exitCode=1;}
else console.log('PASS: live public signed-out iPhone/iPad WebKit geometry and startup stable in the sampled window. Authenticated screens untested.');
