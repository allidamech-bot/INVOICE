const { chromium, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const base = 'http://127.0.0.1:4173';
const outDir = path.resolve('visual-qa-output/v326-studio-security-overlays');
fs.mkdirSync(outDir, { recursive: true });

const engines = [
  ['chromium', chromium],
  ['webkit', webkit],
];
const viewports = [
  ['320x568', { width: 320, height: 568 }],
  ['390x844', { width: 390, height: 844 }],
  ['430x932', { width: 430, height: 932 }],
  ['desktop', { width: 1440, height: 900 }],
];
const langs = ['en', 'ar'];
const themes = ['light', 'dark'];
const surfaces = [
  { name: 'editor', url: '/tests/visual/obsidian-editor.html', selector: '.ta-editor-workspace' },
  { name: 'settings', url: '/tests/visual/obsidian-settings.html?scope=settings', selector: '.ta-settings-shell' },
  { name: 'account', url: '/tests/visual/obsidian-settings.html?scope=account', selector: '.ta-settings-shell' },
  { name: 'modal', url: '/tests/visual/obsidian-overlays.html', selector: '.modal' },
  { name: 'auth', url: '/tests/visual/premium-auth-gateway-v187.html?mode=signin', selector: '.ta-auth-page' },
];

const failures = [];
let scenarios = 0;

function assert(condition, label, detail) {
  if (!condition) failures.push(`${label}: ${detail}`);
}

async function metrics(page, surface) {
  return page.evaluate((surfaceName) => {
    const px = (value) => Number.parseFloat(String(value || '0')) || 0;
    const visible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const boxes = (selector) => [...document.querySelectorAll(selector)].filter(visible).map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, font: px(getComputedStyle(el).fontSize) };
    });
    const scrollProbe = (scrollerSelector, contentSelector) => {
      const scroller = document.querySelector(scrollerSelector);
      const content = document.querySelector(contentSelector) || scroller;
      if (!(scroller instanceof HTMLElement) || !(content instanceof Element)) return null;
      const style = getComputedStyle(scroller);
      const before = scroller.scrollTop;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = max;
      const after = scroller.scrollTop;
      const candidates = [...content.children].filter((el) => {
        if (!visible(el)) return false;
        const position = getComputedStyle(el).position;
        return position !== 'fixed' && position !== 'absolute';
      });
      const last = candidates.at(-1) || content;
      const sr = scroller.getBoundingClientRect();
      const lr = last.getBoundingClientRect();
      const result = {
        overflowY: style.overflowY,
        clientHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
        max,
        after,
        reachesEnd: max <= 2 || after >= max - 2,
        lastReachable: lr.bottom <= sr.bottom + 2,
        lastBottom: lr.bottom,
        scrollerBottom: sr.bottom,
        lastClass: String(last.className || last.tagName || ''),
      };
      scroller.scrollTop = before;
      return result;
    };
    const root = document.documentElement;
    const viewportWidth = window.innerWidth;
    const data = {
      viewportWidth,
      scrollWidth: Math.max(root.scrollWidth, document.body?.scrollWidth || 0),
      dir: root.dir || document.body?.dir || getComputedStyle(document.body).direction,
      surface: surfaceName,
    };
    if (surfaceName === 'editor') {
      data.targets = boxes('.ta-editor-step-list>button');
      data.labels = boxes('.ta-editor-step-label');
      data.micro = boxes('.ta-editor-step-nav-heading small,.ta-editor-convert-card small,.ta-editor-persistence-error span:last-child');
    } else if (surfaceName === 'settings' || surfaceName === 'account') {
      data.targets = boxes('.ta-settings-nav button,.ta-settings-segmented button,.ta-settings-link-action,.ta-settings-asset-trigger,.ta-recovery-status .btn');
      data.micro = boxes('.ta-settings-nav small,.ta-settings-card>header p,.ta-settings-note,.ta-account-summary span,.ta-account-access small,.ta-recovery-status small,.ta-account-access p,.ta-settings-toast');
      data.shell = boxes('.ta-settings-shell')[0] || null;
      data.reach = scrollProbe('.ta-settings-content','.ta-settings-page');
    } else if (surfaceName === 'modal') {
      data.targets = boxes('.modal-header button,.modal-footer .btn,.segmented button');
      data.micro = boxes('.modal-message,.toast,.global-search-result-copy small,.global-search-result-copy span,.global-search-footer');
      data.modal = boxes('.modal')[0] || null;
      data.reach = scrollProbe('.modal-body','.modal-body');
    } else if (surfaceName === 'auth') {
      data.targets = boxes('.ta-auth-language,.ta-auth-tabs button,.ta-google-button,.ta-auth-primary,.ta-auth-link,.ta-setup-logo-upload>b');
      data.micro = boxes('.ta-auth-divider,.ta-auth-note,.ta-auth-security small,.ta-auth-feature-list small,.ta-auth-aside footer,.ta-auth-account-chip small,.ta-auth-info-card small,.ta-setup-logo-upload small');
      data.frame = boxes('.ta-auth-frame')[0] || null;
    }
    return data;
  }, surface);
}

(async () => {
  for (const [engineName, engine] of engines) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const [viewportName, viewport] of viewports) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        for (const lang of langs) {
          for (const theme of themes) {
            for (const surface of surfaces) {
              scenarios += 1;
              const join = surface.url.includes('?') ? '&' : '?';
              const url = `${base}${surface.url}${join}lang=${lang}`;
              const label = `${engineName}/${viewportName}/${lang}/${theme}/${surface.name}`;
              try {
                await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
                await page.waitForSelector(surface.selector, { state: 'visible', timeout: 15000 });
                await page.evaluate((t) => { document.documentElement.dataset.uiTheme = t; }, theme);
                await page.waitForTimeout(80);
                const m = await metrics(page, surface.name);
                assert(m.scrollWidth <= m.viewportWidth + 1.5, label, `horizontal overflow ${m.scrollWidth}px > ${m.viewportWidth}px`);
                assert(m.dir === (lang === 'ar' ? 'rtl' : 'ltr'), label, `direction ${m.dir}`);
                for (const target of m.targets || []) assert(target.h >= 43.5, label, `touch target ${target.h.toFixed(1)}px < 44px`);
                for (const text of m.labels || []) assert(text.font >= 10.9, label, `editor label ${text.font}px < 11px`);
                for (const text of m.micro || []) assert(text.font >= 10.4, label, `microcopy ${text.font}px < 10.5px`);
                if (m.shell) assert(m.shell.w <= m.viewportWidth + 1.5, label, `settings shell ${m.shell.w}px too wide`);
                if (m.modal) assert(m.modal.w <= m.viewportWidth + 1.5 && m.modal.h <= viewport.height + 1.5, label, `modal out of viewport ${m.modal.w}x${m.modal.h}`);
                if (m.frame) assert(m.frame.w <= m.viewportWidth + 1.5, label, `auth frame ${m.frame.w}px too wide`);
                if (viewport.width <= 900 && m.reach) {
                  assert(['auto','scroll'].includes(m.reach.overflowY) || m.reach.max <= 2, label, `scroll owner overflow-y=${m.reach.overflowY} with ${m.reach.max}px hidden range`);
                  assert(m.reach.reachesEnd, label, `cannot reach scroll end ${m.reach.after}/${m.reach.max}`);
                  assert(m.reach.lastReachable, label, `last content ${m.reach.lastClass} remains clipped ${m.reach.lastBottom.toFixed(1)} > ${m.reach.scrollerBottom.toFixed(1)}`);
                }
                const file = `${engineName}-${viewportName}-${lang}-${theme}-${surface.name}.png`.replace(/[^a-z0-9_.-]/gi, '-');
                await page.screenshot({ path: path.join(outDir, file), fullPage: false });
              } catch (error) {
                failures.push(`${label}: ${error && error.message ? error.message : error}`);
              }
            }
          }
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }

  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ scenarios, failures }, null, 2));
  if (failures.length) {
    console.error(`v337 studio/security/overlays: ${failures.length} failures across ${scenarios} scenarios.`);
    failures.slice(0, 120).forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
  console.log(`v337 studio/security/overlays reachability: ${scenarios} Chromium/WebKit scenarios passed.`);
})();