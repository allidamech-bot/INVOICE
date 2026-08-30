/* LOUREX iOS PDF bridge.
   iPhone Safari/PWA cannot be trusted to open a usable PDF flow through
   window.print(). PDF and Share therefore render the existing A4 portal into
   a real PDF file first, then hand that file to the native iOS share sheet from
   a fresh explicit tap. Print still uses the native print dialog. */
(() => {
  const isAppleTouch = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isAppleTouch) return;

  const HTML2CANVAS_URL = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  const JSPDF_URL = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
  let pendingInlineOverlay = null;
  let pendingMode = 'pdf';
  let readyProbeTimer = 0;
  let pendingPdfPromise = null;
  let pendingPdfFile = null;
  const nativePrint = window.print.bind(window);

  const normalizeMode = (mode) => mode === 'share' ? 'share' : mode === 'print' ? 'print' : 'pdf';
  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const safeFilename = (value) => String(value || 'LOUREX-Invoice')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'LOUREX-Invoice';

  const releaseParentPrintState = () => {
    try { window.dispatchEvent(new Event('afterprint')); } catch {}
  };

  const actionCopy = (mode) => mode === 'share'
    ? {
        label: 'Share PDF / مشاركة PDF',
        help: 'اضغط «مشاركة PDF» لفتح نافذة المشاركة في iPhone وإرسال ملف PDF مباشرة.'
      }
    : mode === 'print'
      ? {
          label: 'Print / طباعة',
          help: 'اضغط «طباعة» لفتح نافذة الطباعة في iPhone.'
        }
      : {
          label: 'Save PDF / حفظ PDF',
          help: 'اضغط «حفظ PDF» ثم اختر Save to Files من نافذة مشاركة iPhone.'
        };

  const clearReadyProbe = () => {
    if (readyProbeTimer) window.clearInterval(readyProbeTimer);
    readyProbeTimer = 0;
  };

  const resetPendingFile = () => {
    pendingPdfPromise = null;
    pendingPdfFile = null;
  };

  const removeInlineOverlay = (release = false) => {
    clearReadyProbe();
    const overlay = pendingInlineOverlay;
    pendingInlineOverlay = null;
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    resetPendingFile();
    if (release) releaseParentPrintState();
  };

  const ensureInlineOverlay = (mode = pendingMode) => {
    pendingMode = normalizeMode(mode);
    if (pendingInlineOverlay && pendingInlineOverlay.isConnected) return pendingInlineOverlay;

    const overlay = document.createElement('div');
    overlay.className = 'lourex-ios-output-fallback';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `<div class="lourex-ios-output-card"><div class="lourex-ios-output-spinner"></div><strong>Preparing PDF…</strong><span>جارٍ إنشاء ملف PDF الحقيقي…</span><button type="button" class="lourex-ios-output-cancel">Close / إغلاق</button></div>`;

    const style = document.createElement('style');
    style.textContent = `.lourex-ios-output-fallback{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:24px;background:rgba(7,20,30,.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.lourex-ios-output-card{width:min(360px,100%);padding:24px;border-radius:20px;background:#fffdf9;color:#17364a;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.28)}.lourex-ios-output-card strong{display:block;font-size:18px;margin:8px 0}.lourex-ios-output-card span{display:block;color:#667784;font-size:13px;line-height:1.55;margin-bottom:18px}.lourex-ios-output-spinner{width:42px;height:42px;margin:0 auto 14px;border:2px solid #d8c49d;border-top-color:#17364a;border-radius:50%;animation:lourexOutputSpin .8s linear infinite}.lourex-ios-output-card button{min-height:46px;border-radius:12px;border:1px solid #ccd8df;background:#fff;color:#27495f;padding:0 16px;font:700 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.lourex-ios-output-card .lourex-ios-output-primary{width:100%;background:#173f59;border-color:#173f59;color:#fff;margin-bottom:8px}.lourex-ios-output-card .lourex-ios-output-primary:disabled{opacity:.65}.lourex-ios-output-error{color:#9f3b32!important}@keyframes lourexOutputSpin{to{transform:rotate(360deg)}}@media print{.lourex-ios-output-fallback{display:none!important}}`;
    overlay.appendChild(style);
    overlay.querySelector('.lourex-ios-output-cancel')?.addEventListener('click', () => removeInlineOverlay(true));
    document.body.appendChild(overlay);
    pendingInlineOverlay = overlay;
    return overlay;
  };

  const loadScript = (src, ready) => new Promise((resolve, reject) => {
    if (ready()) { resolve(); return; }
    const existing = Array.from(document.scripts).find((script) => script.src === src);
    if (existing) {
      existing.addEventListener('load', () => ready() ? resolve() : reject(new Error('PDF library did not initialize.')), { once: true });
      existing.addEventListener('error', () => reject(new Error('Unable to load PDF library.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', () => ready() ? resolve() : reject(new Error('PDF library did not initialize.')), { once: true });
    script.addEventListener('error', () => reject(new Error('Unable to load PDF library.')), { once: true });
    document.head.appendChild(script);
  });

  const ensurePdfLibraries = async () => {
    await loadScript(HTML2CANVAS_URL, () => typeof window.html2canvas === 'function');
    await loadScript(JSPDF_URL, () => Boolean(window.jspdf && window.jspdf.jsPDF));
  };

  const waitForCloneAssets = async (stage) => {
    try {
      if (document.fonts) await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 1800))
      ]);
    } catch {}
    const images = Array.from(stage.querySelectorAll('img'));
    await Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => resolve();
        image.addEventListener('load', done, { once: true });
        image.addEventListener('error', done, { once: true });
        window.setTimeout(done, 1400);
      });
    }));
  };

  const buildPdfFile = async () => {
    if (pendingPdfFile) return pendingPdfFile;
    if (pendingPdfPromise) return pendingPdfPromise;

    pendingPdfPromise = (async () => {
      await ensurePdfLibraries();
      const sourcePages = Array.from(document.querySelectorAll('.print-portal .invoice-page'));
      if (!sourcePages.length) throw new Error('Printable document is not ready.');

      const stage = document.createElement('div');
      stage.className = 'lourex-ios-pdf-stage';
      stage.setAttribute('aria-hidden', 'true');
      stage.style.cssText = 'position:fixed;left:-12000px;top:0;width:210mm;display:block;background:#fff;pointer-events:none;z-index:-1;';
      for (const source of sourcePages) {
        const clone = source.cloneNode(true);
        clone.style.setProperty('width', '210mm', 'important');
        clone.style.setProperty('min-width', '210mm', 'important');
        clone.style.setProperty('max-width', '210mm', 'important');
        clone.style.setProperty('height', '297mm', 'important');
        clone.style.setProperty('min-height', '297mm', 'important');
        clone.style.setProperty('margin', '0', 'important');
        clone.style.setProperty('transform', 'none', 'important');
        stage.appendChild(clone);
      }
      document.body.appendChild(stage);

      try {
        await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
        await waitForCloneAssets(stage);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        const pages = Array.from(stage.querySelectorAll('.invoice-page'));
        const renderScale = Math.min(2, Math.max(1.45, window.devicePixelRatio || 1.5));

        for (let index = 0; index < pages.length; index += 1) {
          const page = pages[index];
          const canvas = await window.html2canvas(page, {
            scale: renderScale,
            useCORS: true,
            allowTaint: false,
            logging: false,
            backgroundColor: '#ffffff',
            imageTimeout: 1800,
            removeContainer: true
          });
          if (index > 0) pdf.addPage('a4', 'portrait');
          const image = canvas.toDataURL('image/jpeg', 0.96);
          pdf.addImage(image, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
          canvas.width = 1;
          canvas.height = 1;
        }

        const blob = pdf.output('blob');
        const file = new File([blob], `${safeFilename(document.title)}.pdf`, { type: 'application/pdf', lastModified: Date.now() });
        pendingPdfFile = file;
        return file;
      } finally {
        stage.remove();
      }
    })().catch((error) => {
      pendingPdfPromise = null;
      throw error;
    });

    return pendingPdfPromise;
  };

  const openFileFallback = (file) => {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const sharePreparedFile = (file, mode) => {
    const shareData = { files: [file], title: file.name, text: mode === 'share' ? 'LOUREX Invoice PDF' : undefined };
    const canShareFiles = typeof navigator.share === 'function' &&
      (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }));
    if (!canShareFiles) {
      openFileFallback(file);
      removeInlineOverlay(true);
      return;
    }

    navigator.share(shareData).then(() => {
      removeInlineOverlay(true);
    }).catch((error) => {
      if (error && error.name === 'AbortError') return;
      const overlay = ensureInlineOverlay(mode);
      const card = overlay.querySelector('.lourex-ios-output-card');
      const primary = card?.querySelector('.lourex-ios-output-primary');
      if (primary) {
        primary.disabled = false;
        primary.textContent = actionCopy(mode).label;
      }
      const help = card?.querySelector('span');
      if (help) {
        help.classList.add('lourex-ios-output-error');
        help.textContent = 'تعذر فتح مشاركة iPhone. اضغط الزر مرة أخرى أو استخدم «إغلاق» ثم أعد المحاولة.';
      }
    });
  };

  const hydrateInlineFallback = (overlay, mode, file) => {
    const copy = actionCopy(mode);
    const card = overlay.querySelector('.lourex-ios-output-card');
    if (!card) return;
    card.dataset.ready = 'true';
    card.innerHTML = `<strong>PDF Ready / ملف PDF جاهز</strong><span>${escapeHtml(copy.help)}</span><button type="button" class="lourex-ios-output-primary">${escapeHtml(copy.label)}</button><button type="button" class="lourex-ios-output-cancel">Close / إغلاق</button>`;

    const primary = card.querySelector('.lourex-ios-output-primary');
    primary?.addEventListener('click', () => {
      if (primary.disabled) return;
      primary.disabled = true;
      primary.textContent = mode === 'share' ? 'Opening Share… / جارٍ فتح المشاركة…' : mode === 'print' ? 'Opening Print… / جارٍ فتح الطباعة…' : 'Opening Files… / جارٍ فتح الحفظ…';
      if (mode === 'print') {
        try {
          nativePrint();
          removeInlineOverlay(true);
        } catch {
          primary.disabled = false;
          primary.textContent = copy.label;
        }
        return;
      }
      sharePreparedFile(file, mode);
    });
    card.querySelector('.lourex-ios-output-cancel')?.addEventListener('click', () => removeInlineOverlay(true));
  };

  const showPreparationError = (error) => {
    const overlay = ensureInlineOverlay(pendingMode);
    const card = overlay.querySelector('.lourex-ios-output-card');
    if (!card) return;
    const message = error instanceof Error ? error.message : 'Unable to create PDF.';
    card.innerHTML = `<strong>PDF failed / تعذر إنشاء PDF</strong><span class="lourex-ios-output-error">${escapeHtml(message)}<br>تحقق من الاتصال ثم أعد المحاولة.</span><button type="button" class="lourex-ios-output-cancel">Close / إغلاق</button>`;
    card.querySelector('.lourex-ios-output-cancel')?.addEventListener('click', () => removeInlineOverlay(true));
  };

  const portalIsReady = () => Boolean(document.querySelector('.print-portal .invoice-page'));

  const prepareCurrentOutput = () => {
    const overlay = ensureInlineOverlay(pendingMode);
    if (pendingMode === 'print') {
      hydrateInlineFallback(overlay, pendingMode, null);
      return;
    }
    void buildPdfFile().then((file) => {
      if (overlay.isConnected) hydrateInlineFallback(overlay, pendingMode, file);
    }).catch(showPreparationError);
  };

  const armReadyProbe = () => {
    clearReadyProbe();
    let attempts = 0;
    readyProbeTimer = window.setInterval(() => {
      attempts += 1;
      if (portalIsReady()) {
        clearReadyProbe();
        prepareCurrentOutput();
        return;
      }
      if (attempts >= 125) {
        clearReadyProbe();
        showPreparationError(new Error('Printable document timed out.'));
      }
    }, 80);
  };

  const preparePdfWindow = (mode = 'pdf') => {
    pendingMode = normalizeMode(mode);
    resetPendingFile();
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

  window.print = function lourexPrintBridge() {
    if (!portalIsReady()) {
      armReadyProbe();
      if (!document.body.classList.contains('printing')) nativePrint();
      return;
    }
    clearReadyProbe();
    prepareCurrentOutput();
  };
})();