const { chromium } = require('playwright');

const baseUrl = 'http://127.0.0.1:4173/tests/visual/mobile-final-quote-stack.html';
const widths = [390, 430, 500, 720];

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(80);

      const result = await page.evaluate(() => {
        const rect = selector => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { top:r.top, right:r.right, bottom:r.bottom, left:r.left, width:r.width, height:r.height };
        };
        const cta = document.querySelector('[data-convert-cta]');
        const style = cta ? getComputedStyle(cta) : null;
        return {
          nav: rect('.editor-section-nav-slot'),
          conversion: rect('.final-quote-convert-bar'),
          actions: rect('.mobile-editor-actionbar'),
          cta: rect('[data-convert-cta]'),
          ctaVisible: Boolean(cta && style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0),
          viewportHeight: innerHeight
        };
      });

      const { nav, conversion, actions, cta, ctaVisible, viewportHeight } = result;
      if (!nav || !conversion || !actions || !cta) failures.push(`${width}px: missing required stack element`);
      else {
        if (overlaps(nav, conversion)) failures.push(`${width}px: conversion overlaps 01–06 step navigator`);
        if (overlaps(conversion, actions)) failures.push(`${width}px: conversion overlaps mobile action bar`);
        if (!ctaVisible || cta.height < 44) failures.push(`${width}px: Create Invoice CTA is hidden or clipped below 44px`);
        if (cta.top < conversion.top - 0.5 || cta.bottom > conversion.bottom + 0.5) failures.push(`${width}px: Create Invoice CTA escapes/clips outside conversion sheet`);
        if (conversion.top < 0 || conversion.bottom > viewportHeight) failures.push(`${width}px: conversion sheet is outside viewport`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.error(JSON.stringify({ failures }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ caseCount: widths.length, failures: 0 }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
