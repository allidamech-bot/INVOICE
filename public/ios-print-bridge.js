/* LOUREX iOS PDF bridge.
   iPhone Safari/PWA output must stay on the current page while React prepares
   the printable A4 portal. Opening about:blank first can background the parent
   tab and suspend requestAnimationFrame/font work, leaving users forever on a
   “Preparing PDF…” page. This bridge therefore uses an in-app two-tap handoff:
   tap PDF/Share -> prepare the portal -> tap the ready action -> native print.
   The second tap is a fresh iOS user gesture, so Save to Files and Share work
   reliably from the native print/PDF preview. */
(() => {
  const isAppleTouch = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isAppleTouch) return;

  let pendingInlineOverlay = null;
  let pendingMode = 'pdf';
  let readyProbeTimer = 0;
  const nativePrint = window.print.bind(window);

  const normalizeMode = (mode) => mode === 'share' ? 'share' : mode === 'print' ? 'print' : 'pdf';
  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const releaseParentPrintState = () => {
    try { window.dispatchEvent(new Event('afterprint')); } catch {}
  };

  const actionCopy = (mode) => mode === 'share'
    ? {
        label: 'Share PDF / مشاركة PDF',
        help: 'اضغط «مشاركة PDF»، ثم استخدم زر المشاركة في معاينة iPhone لإرسال الملف أو حفظه في Files.'
      }
    : mode === 'print'
      ? {
          label: 'Print / طباعة',
          help: 'اضغط «طباعة» لفتح معاينة الطباعة في iPhone.'
        }
      : {
          label: 'Save PDF / حفظ PDF',
          help: 'اضغط «حفظ PDF»، ثم استخدم زر المشاركة في معاينة iPhone واختر Save to Files.'
        };

  const clearReadyProbe = () => {
    if (readyProbeTimer) window.clearInterval(readyProbeTimer);
    readyProbeTimer = 0;
  };

  const removeInlineOverlay = (release = false) => {
    clearReadyProbe();
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
    style.textContent = `.lourex-ios-output-fallback{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:24px;background:rgba(7,20,30,.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.lourex-ios-output-card{width:min(360px,100%);padding:24px;border-radius:20px;background:#fffdf9;color:#17364a;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.28)}.lourex-ios-output-card strong{display:block;font-size:18px;margin:8px 0}.lourex-ios-output-card span{display:block;color:#667784;font-size:13px;line-height:1.55;margin-bottom:18px}.lourex-ios-output-spinner{width:42px;height:42px;margin:0 auto 14px;border:2px solid #d8c49d;border-top-color:#17364a;border-radius:50%;animation:lourexOutputSpin .8s linear infinite}.lourex-ios-output-card button{min-height:46px;border-radius:12px;border:1px solid #ccd8df;background:#fff;color:#27495f;padding:0 16px;font:700 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.lourex-ios-output-card .lourex-ios-output-primary{width:100%;background:#173f59;border-color:#173f59;color:#fff;margin-bottom:8px}.lourex-ios-output-card .lourex-ios-output-primary:disabled{opacity:.65}@keyframes lourexOutputSpin{to{transform:rotate(360deg)}}@media print{.lourex-ios-output-fallback{display:none!important}}`;
    overlay.appendChild(style);
    overlay.querySelector('.lourex-ios-output-cancel')?.addEventListener('click', () => removeInlineOverlay(true));
    document.body.appendChild(overlay);
    pendingInlineOverlay = overlay;
    return overlay;
  };

  const hydrateInlineFallback = (overlay, mode) => {
    const copy = actionCopy(mode);
    const card = overlay.querySelector('.lourex-ios-output-card');
    if (!card || card.dataset.ready === 'true') return;
    card.dataset.ready = 'true';
    card.innerHTML = `<strong>PDF Ready / ملف PDF جاهز</strong><span>${escapeHtml(copy.help)}</span><button type="button" class="lourex-ios-output-primary">${escapeHtml(copy.label)}</button><button type="button" class="lourex-ios-output-cancel">Close / إغلاق</button>`;

    const primary = card.querySelector('.lourex-ios-output-primary');
    primary?.addEventListener('click', () => {
      if (primary.disabled) return;
      primary.disabled = true;
      primary.textContent = mode === 'share' ? 'Opening Share… / جارٍ فتح المشاركة…' : mode === 'print' ? 'Opening Print… / جارٍ فتح الطباعة…' : 'Opening PDF… / جارٍ فتح PDF…';
      try {
        nativePrint();
      } catch {
        primary.disabled = false;
        primary.textContent = copy.label;
        const help = card.querySelector('span');
        if (help) help.textContent = 'تعذر فتح معاينة iPhone. أغلق هذه النافذة وحاول مرة أخرى.';
      }
    });
    card.querySelector('.lourex-ios-output-cancel')?.addEventListener('click', () => removeInlineOverlay(true));
  };

  const portalIsReady = () => Boolean(document.querySelector('.print-portal .invoice-page'));

  const armReadyProbe = () => {
    clearReadyProbe();
    let attempts = 0;
    readyProbeTimer = window.setInterval(() => {
      attempts += 1;
      if (portalIsReady()) {
        clearReadyProbe();
        const overlay = ensureInlineOverlay(pendingMode);
        window.setTimeout(() => {
          if (overlay.isConnected) hydrateInlineFallback(overlay, pendingMode);
        }, 120);
        return;
      }
      if (attempts >= 100) {
        clearReadyProbe();
        const overlay = ensureInlineOverlay(pendingMode);
        const card = overlay.querySelector('.lourex-ios-output-card');
        if (card) card.innerHTML = `<strong>PDF preparation delayed</strong><span>تأخر تجهيز الملف. أغلق النافذة وحاول مرة أخرى.</span><button type="button" class="lourex-ios-output-cancel">Close / إغلاق</button>`;
        card?.querySelector('.lourex-ios-output-cancel')?.addEventListener('click', () => removeInlineOverlay(true));
      }
    }, 80);
  };

  const preparePdfWindow = (mode = 'pdf') => {
    pendingMode = normalizeMode(mode);
    ensureInlineOverlay(pendingMode);
    armReadyProbe();
    return true;
  };

  window.__LOUREX_PREPARE_PDF__ = preparePdfWindow;

  /* Legacy capture fallback for older installed React bundles. */
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

  /* Compatibility helper retained for regression coverage and old cached code. */
  const styleLinks = () => Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => link.href ? `<link rel="stylesheet" href="${escapeHtml(link.href)}">` : '')
    .join('');
  void styleLinks;

  window.print = function lourexPrintBridge() {
    const hasDocument = portalIsReady();
    if (!hasDocument) {
      const overlay = ensureInlineOverlay(pendingMode);
      armReadyProbe();
      if (!document.body.classList.contains('printing')) {
        removeInlineOverlay(false);
        nativePrint();
      }
      return;
    }

    clearReadyProbe();
    const overlay = ensureInlineOverlay(pendingMode);
    hydrateInlineFallback(overlay, pendingMode);
  };

  window.addEventListener('afterprint', () => {
    if (pendingInlineOverlay) removeInlineOverlay(false);
  });
})();