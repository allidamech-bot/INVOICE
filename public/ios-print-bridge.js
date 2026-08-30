/* LOUREX iOS PDF bridge.
   iOS Safari/WebKit requires the destination surface to be prepared directly
   from the user's tap. Saving/finalizing the document happens asynchronously,
   so the app calls __LOUREX_PREPARE_PDF__ before that work begins.

   Primary path: open an about:blank PDF surface synchronously, then hydrate it.
   Fallback path: if iOS blocks/closes that window (common in installed PWAs),
   keep an in-app handoff sheet ready and let the user tap once more to invoke
   native print from a fresh gesture. Both PDF and Share use the system PDF
   preview so the result remains searchable/selectable and preserves A4 layout. */
(() => {
  const isAppleTouch = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isAppleTouch) return;

  let pendingPdfWindow = null;
  let pendingInlineOverlay = null;
  let pendingMode = 'pdf';
  const nativePrint = window.print.bind(window);

  const normalizeMode = (mode) => mode === 'share' ? 'share' : mode === 'print' ? 'print' : 'pdf';
  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const releaseParentPrintState = () => {
    /* The actual print dialog may run outside the parent application window.
       Dispatch the same event once a copied child handoff is safe, or when the
       user cancels an inline fallback, so the React app never stays hidden. */
    try { window.dispatchEvent(new Event('afterprint')); } catch {}
  };

  const actionCopy = (mode) => mode === 'share'
    ? { label: 'Share PDF / مشاركة PDF', help: 'اضغط «مشاركة PDF» ثم استخدم زر المشاركة في معاينة iPhone لإرسال الملف أو حفظه في Files.' }
    : mode === 'print'
      ? { label: 'Print / طباعة', help: 'اضغط «طباعة» لفتح معاينة الطباعة في iPhone.' }
      : { label: 'Save PDF / حفظ PDF', help: 'اضغط «حفظ PDF» ثم استخدم زر المشاركة في شاشة الطباعة لحفظ الملف في Files.' };

  const writePreparingScreen = (target, mode) => {
    const copy = actionCopy(mode);
    try {
      target.document.open();
      target.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>LOUREX PDF</title><style>html,body{margin:0;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;background:#f5f2eb;color:#17364a}.wait{min-height:100dvh;display:grid;place-items:center;padding:24px;text-align:center}.card{max-width:340px}.mark{width:46px;height:46px;margin:0 auto 16px;border:2px solid #d8c49d;border-top-color:#17364a;border-radius:50%;animation:spin .8s linear infinite}.card strong{display:block;font-size:18px;margin-bottom:8px}.card span{font-size:13px;line-height:1.55;color:#667784}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="wait"><div class="card"><div class="mark"></div><strong>Preparing PDF…</strong><span>جارٍ تجهيز ملف PDF…<br>${escapeHtml(copy.label)}</span></div></div></body></html>`);
      target.document.close();
    } catch {}
  };

  const removeInlineOverlay = (release = false) => {
    const overlay = pendingInlineOverlay;
    pendingInlineOverlay = null;
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (release) releaseParentPrintState();
  };

  const ensureInlineOverlay = (mode = pendingMode) => {
    pendingMode = normalizeMode(mode);
    if (pendingInlineOverlay && pendingInlineOverlay.isConnected) return pendingInlineOverlay;
    const overlay = document.createElement('div');
    overlay.className = 'lourex-ios-output-fallback';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `<div class="lourex-ios-output-card"><div class="lourex-ios-output-spinner"></div><strong>Preparing PDF…</strong><span>جارٍ تجهيز ملف PDF…</span><button type="button" class="lourex-ios-output-cancel">Close / إغلاق</button></div>`;
    const style = document.createElement('style');
    style.textContent = `.lourex-ios-output-fallback{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:24px;background:rgba(7,20,30,.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.lourex-ios-output-card{width:min(360px,100%);padding:24px;border-radius:20px;background:#fffdf9;color:#17364a;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.28)}.lourex-ios-output-card strong{display:block;font-size:18px;margin:8px 0}.lourex-ios-output-card span{display:block;color:#667784;font-size:13px;line-height:1.55;margin-bottom:18px}.lourex-ios-output-spinner{width:42px;height:42px;margin:0 auto 14px;border:2px solid #d8c49d;border-top-color:#17364a;border-radius:50%;animation:lourexOutputSpin .8s linear infinite}.lourex-ios-output-card button{min-height:44px;border-radius:12px;border:1px solid #ccd8df;background:#fff;color:#27495f;padding:0 16px;font:700 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.lourex-ios-output-card .lourex-ios-output-primary{width:100%;background:#173f59;border-color:#173f59;color:#fff;margin-bottom:8px}@keyframes lourexOutputSpin{to{transform:rotate(360deg)}}@media print{.lourex-ios-output-fallback{display:none!important}}`;
    overlay.appendChild(style);
    overlay.querySelector('.lourex-ios-output-cancel')?.addEventListener('click', () => removeInlineOverlay(true));
    document.body.appendChild(overlay);
    pendingInlineOverlay = overlay;
    return overlay;
  };

  const preparePdfWindow = (mode = 'pdf') => {
    pendingMode = normalizeMode(mode);
    /* Idempotent by design. Mobile document menus may reserve the gesture first
       and the document workflow may call this hook again after async finalization. */
    try {
      if (pendingPdfWindow && !pendingPdfWindow.closed) {
        try { pendingPdfWindow.focus(); } catch {}
        return true;
      }
    } catch { pendingPdfWindow = null; }

    if (pendingInlineOverlay && pendingInlineOverlay.isConnected) return true;

    try {
      pendingPdfWindow = window.open('about:blank', '_blank');
      if (pendingPdfWindow) {
        writePreparingScreen(pendingPdfWindow, pendingMode);
        try { pendingPdfWindow.focus(); } catch {}
        return true;
      }
    } catch {}

    pendingPdfWindow = null;
    ensureInlineOverlay(pendingMode);
    return true;
  };

  /* Public hook used by React output buttons. This assignment is intentionally
     kept direct and synchronous for older installed bundles as well. */
  window.__LOUREX_PREPARE_PDF__ = preparePdfWindow;

  /* Legacy capture fallback for clients that still have an older React bundle. */
  document.addEventListener('click', (event) => {
    const node = event.target;
    if (!(node instanceof Element)) return;
    const button = node.closest('.modal-footer-actions .btn-primary');
    if (!button || !button.closest('.modal')?.querySelector('.issue-review')) return;
    const text = button.textContent || '';
    if (!/PDF|Share|مشاركة|طباعة|Print/i.test(text)) return;
    const mode = /Share|مشاركة/i.test(text) ? 'share' : /Print|طباعة/i.test(text) ? 'print' : 'pdf';
    preparePdfWindow(mode);
  }, true);

  const styleLinks = () => Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => {
      const href = link.href;
      return href ? `<link rel="stylesheet" href="${escapeHtml(href)}">` : '';
    })
    .join('');

  const hydratePdfWindow = (target, portal, mode) => {
    const title = escapeHtml(document.title || 'LOUREX Invoice');
    const content = portal.innerHTML;
    const copy = actionCopy(mode);
    target.document.open();
    target.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title}</title>${styleLinks()}<style>
      html,body{margin:0;background:#dfe3e4;color:#17364a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{padding:68px 12px 28px;overflow-x:hidden;overflow-y:auto}
      .ios-pdf-toolbar{position:fixed;z-index:9999;top:0;left:0;right:0;min-height:56px;padding:max(8px,env(safe-area-inset-top)) 12px 8px;background:rgba(255,255,255,.97);border-bottom:1px solid #d8e1e7;display:flex;align-items:center;justify-content:space-between;gap:8px;box-shadow:0 3px 12px rgba(18,50,74,.08)}
      .ios-pdf-toolbar strong{font:700 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#17364a}
      .ios-pdf-actions{display:flex;gap:7px}.ios-pdf-actions button{min-height:40px;border-radius:11px;border:1px solid #ccd8df;background:#fff;color:#27495f;padding:0 13px;font:700 13px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.ios-pdf-actions .primary{background:#173f59;border-color:#173f59;color:#fff}
      .ios-pdf-help{position:fixed;z-index:9998;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));padding:10px 12px;border-radius:12px;background:rgba(11,29,45,.92);color:#fff;text-align:center;font:600 12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.18)}
      .print-portal{display:block!important;width:210mm!important;min-width:210mm!important;max-width:none!important;margin:0!important}
      .print-portal .invoice-pages{display:block!important;width:210mm!important;min-width:210mm!important;max-width:none!important;transform:none!important;margin:0!important;gap:18px!important}
      .print-portal .invoice-page{width:210mm!important;min-width:210mm!important;max-width:210mm!important;height:297mm!important;min-height:297mm!important;margin:0 0 18px!important}
      @media print{html,body{width:210mm!important;background:#fff!important;overflow:visible!important}body{padding:0!important}.ios-pdf-toolbar,.ios-pdf-help{display:none!important}.print-portal{transform:none!important;transform-origin:top left!important;margin:0!important}.print-portal .invoice-pages{gap:0!important}.print-portal .invoice-page{margin:0!important;box-shadow:none!important;break-after:page;page-break-after:always}.print-portal .invoice-page:last-child{break-after:auto;page-break-after:auto}}
    </style></head><body><div class="ios-pdf-toolbar"><strong>LOUREX PDF</strong><div class="ios-pdf-actions"><button type="button" onclick="window.close()">Close / إغلاق</button><button class="primary" type="button" onclick="window.print()">${escapeHtml(copy.label)}</button></div></div><div class="print-portal">${content}</div><div class="ios-pdf-help">${escapeHtml(copy.help)}</div></body></html>`);
    target.document.close();

    try {
      const preview = target.document.querySelector('.print-portal');
      if (preview) {
        const a4CssPixels = 210 * 96 / 25.4;
        const available = Math.max(280, target.innerWidth - 24);
        const fit = Math.min(1, available / a4CssPixels);
        preview.style.transform = `scale(${fit})`;
        preview.style.transformOrigin = 'top left';
      }
    } catch {}
  };

  const hydrateInlineFallback = (overlay, mode) => {
    const copy = actionCopy(mode);
    const card = overlay.querySelector('.lourex-ios-output-card');
    if (!card) return;
    card.innerHTML = `<strong>PDF Ready / ملف PDF جاهز</strong><span>${escapeHtml(copy.help)}</span><button type="button" class="lourex-ios-output-primary">${escapeHtml(copy.label)}</button><button type="button" class="lourex-ios-output-cancel">Close / إغلاق</button>`;
    card.querySelector('.lourex-ios-output-primary')?.addEventListener('click', () => {
      try { nativePrint(); } catch {}
    });
    card.querySelector('.lourex-ios-output-cancel')?.addEventListener('click', () => removeInlineOverlay(true));
  };

  const waitForTargetAssets = async (target) => {
    try {
      if (target.document.fonts) await Promise.race([
        target.document.fonts.ready,
        new Promise((resolve) => target.setTimeout(resolve, 1800))
      ]);
    } catch {}
    const images = Array.from(target.document.querySelectorAll('.print-portal img'));
    await Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => resolve();
        image.addEventListener('load', done, { once: true });
        image.addEventListener('error', done, { once: true });
        target.setTimeout(done, 1400);
      });
    }));
  };

  window.print = function lourexPrintBridge() {
    const mode = pendingMode;
    const portal = document.querySelector('.print-portal');
    const hasDocument = Boolean(portal && portal.querySelector('.invoice-page'));
    let target = pendingPdfWindow;
    pendingPdfWindow = null;

    if (target && !target.closed && hasDocument) {
      try {
        hydratePdfWindow(target, portal, mode);
        target.focus();
        removeInlineOverlay(false);
        releaseParentPrintState();
        /* Automatic asynchronous print is intentionally avoided on iOS. The
           handoff page keeps a direct button whose tap calls native print. */
        void waitForTargetAssets(target).then(() => {
          try { target.focus(); } catch {}
        });
        return;
      } catch {
        try { target.close(); } catch {}
        target = null;
      }
    }

    if (!hasDocument) {
      removeInlineOverlay(false);
      nativePrint();
      return;
    }

    /* Popup blocked/closed or installed PWA: keep the rendered A4 portal in the
       parent and require one fresh explicit tap. This avoids the iPhone gesture
       timeout that made PDF/Share appear to do nothing. */
    const overlay = ensureInlineOverlay(mode);
    hydrateInlineFallback(overlay, mode);
  };
})();