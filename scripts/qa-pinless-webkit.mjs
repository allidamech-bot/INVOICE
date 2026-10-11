// Actual WebKit engine smoke for the PIN-free Firebase login gateway.
// Runs in GitHub Actions with ephemeral Playwright: no production credentials,
// no new app dependency, and no authentication data is created remotely.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {webkit} from 'playwright';

const port=4267,url='http://127.0.0.1:'+port+'/';
const app=spawn(process.execPath,['./node_modules/http-server/bin/http-server','dist','-a','127.0.0.1','-p',String(port),'-c-1'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(){
  for(let i=0;i<75;i++){
    if(app.exitCode!==null)throw new Error('Static preview exited: '+app.exitCode);
    try{if((await fetch(url)).ok)return;}catch{}
    await sleep(160);
  }
  throw new Error('Preview server did not start');
}
let browser;
try{
  await ready();
  browser=await webkit.launch({headless:true});
  const scenarios=[
    {name:'iPhone 390',width:390,height:844,mobile:true,ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'},
    {name:'iPad 820',width:820,height:1180,mobile:true,ua:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'},
    {name:'desktop Safari 1440',width:1440,height:900,mobile:false,ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'}
  ];
  for(const scenario of scenarios){
    const ctx=await browser.newContext({
      viewport:{width:scenario.width,height:scenario.height},
      userAgent:scenario.ua,isMobile:scenario.mobile,hasTouch:scenario.mobile,
      deviceScaleFactor:2
    });
    const page=await ctx.newPage(),fatal=[];
    page.on('pageerror',error=>fatal.push(String(error.stack??error)));
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>{
      const root=document.getElementById('root');
      return !!root&&!!root.innerText&&
        (!document.querySelector('.loading-screen'))&&
        (document.querySelector('.ta-auth-page')||
          root.innerText.includes('An unexpected screen error occurred'));
    },{timeout:30000});
    const state=await page.evaluate(()=>({
      text:(document.getElementById('root')?.innerText??'').slice(0,450),
      passwordFields:document.querySelectorAll('input[type="password"]').length,
      googleButtons:document.querySelectorAll('.ta-google-button').length,
      pinFields:document.querySelectorAll('input[autocomplete="one-time-code"],[data-pin-setup],[data-pin-unlock]').length,
      isAuth:!!document.querySelector('.ta-auth-page'),
      overflow:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth??0)-
        document.documentElement.clientWidth
    }));
    assert.equal(fatal.length,0,scenario.name+' JavaScript errors: '+fatal.join('\n'));
    assert.ok(state.isAuth,scenario.name+' did not open Firebase gateway: '+state.text);
    assert.ok(state.passwordFields>=1,scenario.name+' lacks email/password login');
    assert.ok(state.googleButtons>=1,scenario.name+' lacks Google login');
    assert.equal(state.pinFields,0,scenario.name+' accidentally displayed PIN unlock UI');
    assert.ok(state.overflow<=3,scenario.name+' horizontal overflow '+state.overflow);
    console.log('PASS WebKit '+scenario.name+': Firebase login, Google entry, zero PIN and no viewport overflow');
    await ctx.close();
  }
}finally{
  try{await browser?.close();}catch{}
  app.kill('SIGTERM');
}
