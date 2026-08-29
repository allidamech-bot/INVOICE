/* LOUREX iOS PDF bridge.
   Mobile Safari can lose the user gesture while the app saves/finalizes and waits
   for fonts/images before calling window.print(). Pre-open a same-origin preview
   from the user's PDF confirmation tap, then hand the fully rendered A4 document
   to that window. The window also keeps an explicit Print / Save PDF button as a
   gesture-safe fallback if iOS declines the automatic print sheet. */
(() => {
  const isAppleTouch = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isAppleTouch) return;

  let pendingPdfWindow = null;
  const nativePrint = window.print.bind(window);

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const writePreparingScreen = (target) => {
    try {
      target.document.open();
      target.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>LOUREX PDF</title><style>html,body{margin:0;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;background:#f5f2eb;color:#17364a}.wait{min-height:100dvh;display:grid;place-items:center;padding:24px;text-align:center}.card{max-width:340px}.mark{width:46px;height:46px;margin:0 auto 16px;border:2px solid #d8c49d;border-top-color:#17364a;border-radius:50%;animation:spin .8s linear infinite}.card strong{display:block;font-size:18px;margin-bottom:8px}.card span{font-size:13px;line-height:1.55;color:#667784}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="wait"><div class="card"><div class="mark"></div><strong>Preparing PDF…</strong><span>جارٍ تجهيز ملف PDF…</span></div></div></body></html>`);
      target.document.close();
    } catch {}
  };

  /* Capture the final PDF confirmation while the browser still considers the
     action a direct user gesture. Do not pre-open on the first editor PDF button;
     only the review modal's primary PDF confirmation qualifies. */
  document.addEventListener('click', (event) => {
    const node = event.target;
    if (!(node instanceof Element)) return;
    const button = node.closest('.modal-footer-actions .btn-primary');
    if (!button || !button.closest('.modal')?.querySelector('.issue-review')) return;
    if (!/PDF/i.test(button.textContent || '')) return;

    try {
      if (pendingPdfWindow && !pendingPdfWindow.closed) pendingPdfWindow.close();
      pendingPdfWindow = window.open('', '_blank');
      if (pendingPdfWindow) writePreparingScreen(pendingPdfWindow);
    } catch {
      pendingPdfWindow = null;
    }
  }, true);

  const styleLinks = () => Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => {
      const href = link.href;
      return href ? `<link rel="stylesheet" href="${escapeHtml(href)}">` : '';
    })
    .join('');

  const hydratePdfWindow = (target, portal) => {
    const title = escapeHtml(document.title || 'LOUREX Invoice');
    const content = portal.innerHTML;
    target.document.open();
    target.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title}</title>${styleLinks()}<style>
      html,body{margin:0;background:#dfe3e4;color:#17364a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{padding:68px 12px 28px;overflow-x:hidden;overflow-y:auto}
      .ios-pdf-toolbar{position:fixed;z-index:9999;top:0;left:0;right:0;min-height:56px;padding:max(8px,env(safe-area-inset-top)) 12px 8px;background:rgba(255,255,255,.97);border-bottom:1px solid #d8e1e7;display:flex;align-items:center;justify-content:space-between;gap:8px;box-shadow:0 3px 12px rgba(18,50,74,.08)}
      .ios-pdf-toolbar strong{font:700 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#17364a}
      .ios-pdf-actions{display:flex;gap:7px}.ios-pdf-actions button{min-height:40px;border-radius:11px;border:1px solid #ccd8df;background:#fff;color:#27495f;padding:0 13px;font:700 13px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.ios-pdf-actions .primary{background:#173f59;border-color:#173f59;color:#fff}
      .print-portal{display:block!important;width:210mm!important;min-width:210mm!important;max-width:none!important;margin:0!important}
      .print-portal .invoice-pages{display:block!important;width:210mm!important;min-width:210mm!important;max-width:none!important;transform:none!important;margin:0!important;gap:18px!important}
      .print-portal .invoice-page{width:210mm!important;min-width:210mm!important;max-width:210mm!important;height:297mm!important;min-height:297mm!important;margin:0 0 18px!important}
      @media print{html,body{width:210mm!important;background:#fff!important;overflow:visible!important}body{padding:0!important}.ios-pdf-toolbar{display:none!important}.print-portal{transform:none!important;transform-origin:top left!important;margin:0!important}.print-portal .invoice-pages{gap:0!important}.print-portal .invoice-page{margin:0!important;box-shadow:none!important;break-after:page;page-break-after:always}.print-portal .invoice-page:last-child{break-after:auto;page-break-after:auto}}
    </style></head><body><div class="ios-pdf-toolbar"><strong>LOUREX PDF</strong><div class="ios-pdf-actions"><button type="button" onclick="window.close()">Close / إغلاق</button><button class="primary" type="button" onclick="window.print()">Save PDF / حفظ PDF</button></div></div><div class="print-portal">${content}</div></body></html>`);
    target.document.close();

    /* Screen preview only: keep the physical A4 DOM intact and scale the whole
       sheet to the available iPhone width. Print media resets this to 1:1 A4. */
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
    const target = pendingPdfWindow;
    pendingPdfWindow = null;
    if (!target || target.closed) {
      nativePrint();
      return;
    }

    const portal = document.querySelector('.print-portal');
    if (!portal || !portal.querySelector('.invoice-page')) {
      try { target.close(); } catch {}
      nativePrint();
      return;
    }

    try {
      hydratePdfWindow(target, portal);
      target.focus();
      void waitForTargetAssets(target).then(() => {
        try {
          target.focus();
          target.print();
        } catch {
          /* The visible Save PDF button remains available as a direct gesture. */
        }
      });
    } catch {
      try { target.close(); } catch {}
      nativePrint();
    }
  };
})();
