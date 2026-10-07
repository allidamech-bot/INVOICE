const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');

const url='http://127.0.0.1:4173/tests/visual/obsidian-editor.html';
(async()=>{
  const failures=[];
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch({headless:true});
    try{
      for(const language of ['ar','en']){
        for(const width of [390,430]){
          const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});
          try{
            await page.addInitScript(()=>{
              window.__templateFirstPaintSamples=[];
              const watchStarted=performance.now();
              let firstVisible=null;
              const observe=()=>{
                if(performance.now()-watchStarted>15000)return false;
                if(firstVisible!==null&&performance.now()-firstVisible>3000)return false;
                const gallery=document.querySelector('.template-selector');
                if(gallery instanceof HTMLElement){
                  const rect=gallery.getBoundingClientRect();
                  const style=getComputedStyle(gallery);
                  if(rect.width>0&&rect.height>0&&style.visibility!=='hidden'&&style.display==='grid'){
                    if(firstVisible===null)firstVisible=performance.now();
                    const next={
                      at:Math.round(performance.now()-firstVisible),
                      columns:style.gridTemplateColumns.trim().split(/\s+/).length,
                      width:Math.round(rect.width)
                    };
                    const last=window.__templateFirstPaintSamples.at(-1);
                    // Sample at independent time points, not duplicate same-frame observations.
                    if(!last||next.at-last.at>=45||next.columns!==last.columns){
                      window.__templateFirstPaintSamples.push(next);
                    }
                  }
                }
                return true;
              };
              // WebKit on CI sometimes throttles requestAnimationFrame during early
              // script/font loading. Sample periodically too, without reducing the
              // required observation count or relying on the final screenshot.
              const interval=setInterval(()=>{if(!observe())clearInterval(interval);},50);
              const frame=()=>{if(observe())requestAnimationFrame(frame);};
              requestAnimationFrame(frame);
            });
            await page.goto(`${url}?lang=${language}&kind=proforma`,{waitUntil:'domcontentloaded'});
            await page.locator('.template-selector').waitFor({state:'visible',timeout:10000});
            const gallery=page.locator('.template-selector');
            await gallery.scrollIntoViewIfNeeded();
            await page.waitForTimeout(2250);
            const samples=await page.evaluate(()=>window.__templateFirstPaintSamples);
            const duration=samples.length?samples.at(-1).at-samples[0].at:0;
            assert.ok(samples.length>15&&duration>=1300,
              `Must observe the first-paint gallery across >=1.3s with >15 separate samples; got ${samples.length}, duration=${duration}ms, samples=${JSON.stringify(samples.slice(0,12))}`);
            assert.ok(samples.every(item=>item.columns===2),
              `Legacy one-column layout flashed: ${JSON.stringify(samples.filter(item=>item.columns!==2).slice(0,15))}`);
            const initial=samples[0],final=samples.at(-1);
            assert.equal(initial.columns,final.columns);
          }catch(error){failures.push(`${engine.name()} ${language} ${width}: ${error?.stack||error}`);}
          finally{await page.close();}
        }
      }
    }finally{await browser.close();}
  }
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log('Mobile template first-paint stability PASS: 8 Chromium/WebKit AR/EN cases at 390/430, frame-sampled for 2.25s.');
})().catch(error=>{console.error(error);process.exitCode=1;});
