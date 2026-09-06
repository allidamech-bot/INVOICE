const { chromium } = require('playwright');

const baseUrl = 'http://127.0.0.1:4173/tests/visual/mobile-final-quote-stack.html';
const cases = [
  { width:390, height:844, kind:'phone' },
  { width:430, height:932, kind:'phone' },
  { width:720, height:900, kind:'phone' },
  { width:768, height:1024, kind:'tablet' },
  { width:820, height:1180, kind:'tablet' },
  { width:1024, height:1366, kind:'tablet' },
  { width:1280, height:800, kind:'desktop' },
  { width:1440, height:900, kind:'desktop' }
];

function overlaps(a, b, tolerance=0.5) {
  return a.left < b.right - tolerance && a.right > b.left + tolerance && a.top < b.bottom - tolerance && a.bottom > b.top + tolerance;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    for (const scenario of cases) {
      const { width, height, kind } = scenario;
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(80);

      const result = await page.evaluate(() => {
        const measure = selector => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const style = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            top:r.top, right:r.right, bottom:r.bottom, left:r.left,
            width:r.width, height:r.height,
            display:style.display, visibility:style.visibility, opacity:Number(style.opacity || '1'),
            position:style.position
          };
        };
        return {
          lock:measure('.final-lock-banner'),
          layout:measure('.editor-layout'),
          conversion:measure('.final-quote-convert-bar'),
          nav:measure('.editor-section-nav-slot'),
          actions:measure('.mobile-editor-actionbar'),
          cta:measure('[data-convert-cta]'),
          viewport:{ width:innerWidth, height:innerHeight }
        };
      });

      const label=`${kind} ${width}x${height}`;
      const { lock, layout, conversion, nav, actions, cta, viewport }=result;
      if(!lock||!layout||!conversion||!nav||!actions||!cta){
        failures.push(`${label}: missing required editor geometry element`);
        await page.close();
        continue;
      }

      const visible = box => box.display !== 'none' && box.visibility !== 'hidden' && box.opacity > 0 && box.width > 0 && box.height > 0;
      if(!visible(conversion))failures.push(`${label}: conversion panel is not visible`);
      if(conversion.position==='fixed')failures.push(`${label}: conversion panel regressed to fixed positioning`);
      if(!visible(cta)||cta.height<44)failures.push(`${label}: Create Invoice CTA is hidden or below the 44px touch target`);
      if(cta.top<conversion.top-0.5||cta.bottom>conversion.bottom+0.5)failures.push(`${label}: Create Invoice CTA clips outside its panel`);
      if(conversion.left<0||conversion.right>viewport.width+0.5||conversion.top<0||conversion.bottom>viewport.height+0.5)failures.push(`${label}: conversion panel escapes the viewport`);

      if(width<=720){
        if(!visible(nav)||!visible(actions))failures.push(`${label}: phone bottom navigator/actions are not visible`);
        if(overlaps(conversion,nav))failures.push(`${label}: conversion overlaps 01–06 navigator`);
        if(overlaps(conversion,actions))failures.push(`${label}: conversion overlaps document actions`);
        if(overlaps(nav,actions))failures.push(`${label}: 01–06 navigator overlaps document actions`);
        if(conversion.bottom>nav.top+0.75)failures.push(`${label}: phone order must be conversion -> navigator -> actions`);
        if(nav.bottom>actions.top+0.75)failures.push(`${label}: phone navigator must remain above document actions`);
      }else{
        if(overlaps(lock,conversion))failures.push(`${label}: inline conversion overlaps the Final banner`);
        if(overlaps(conversion,layout))failures.push(`${label}: inline conversion overlaps editor content`);
        if(lock.bottom>conversion.top+0.75)failures.push(`${label}: inline conversion must follow the Final banner`);
        if(conversion.bottom>layout.top+0.75)failures.push(`${label}: tablet/desktop conversion must stay above editor content`);
        if(width<=900){
          if(!visible(actions))failures.push(`${label}: tablet document action bar should remain available`);
          if(overlaps(conversion,nav)||overlaps(conversion,actions))failures.push(`${label}: inline tablet conversion overlaps bottom navigation/actions`);
        }else if(visible(actions)){
          failures.push(`${label}: desktop should not render the mobile action bar`);
        }
      }

      await page.close();
    }
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.error(JSON.stringify({ caseCount:cases.length, failures }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ caseCount:cases.length, failures:0 }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
