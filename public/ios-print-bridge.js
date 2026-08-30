/* LOUREX iOS PDF bridge.
   Safari on iPhone can expose computed CSS colors as CSS Color 4 `color(...)`
   values (especially display-p3). html2canvas 1.4.1 does not parse that syntax.
   This bridge normalizes those computed colors to rgba() before capture, then
   creates a real PDF file for Save/Share while keeping native Print available. */
(() => {
  const isAppleTouch = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isAppleTouch) return;

  const HTML2CANVAS_URL = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  const JSPDF_URL = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
  const COLOR_PROPS = [
    'color','background-color','border-top-color','border-right-color','border-bottom-color','border-left-color',
    'outline-color','text-decoration-color','column-rule-color','caret-color','fill','stroke','flood-color',
    'lighting-color','stop-color','box-shadow','text-shadow','background-image'
  ];

  let pendingInlineOverlay = null;
  let pendingMode = 'pdf';
  let readyProbeTimer = 0;
  let shareWatchdogTimer = 0;
  let pendingPdfPromise = null;
  let pendingPdfFile = null;
  let pendingPdfUrl = '';
  const nativePrint = window.print.bind(window);

  const normalizeMode = (mode) => mode === 'share' ? 'share' : mode === 'print' ? 'print' : 'pdf';
  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeFilename = (value) => String(value || 'LOUREX-Invoice')
    .replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'LOUREX-Invoice';
  const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const colorComponent = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    return raw.endsWith('%') ? clamp01(parseFloat(raw) / 100) : clamp01(parseFloat(raw));
  };
  const alphaComponent = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return 1;
    return raw.endsWith('%') ? clamp01(parseFloat(raw) / 100) : clamp01(parseFloat(raw));
  };
  const linearize = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const encodeSrgb = (v) => {
    const x = Math.min(1, Math.max(0, v));
    return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  };
  const p3ToSrgb = (r, g, b) => {
    const lr = linearize(r), lg = linearize(g), lb = linearize(b);
    const x = lr * 0.4865709486 + lg * 0.2656676932 + lb * 0.1982172852;
    const y = lr * 0.2289745641 + lg * 0.6917385218 + lb * 0.0792869141;
    const z = lg * 0.0451133819 + lb * 1.0439443689;
    return [
      encodeSrgb(x * 3.2409699419 + y * -1.5373831776 + z * -0.4986107603),
      encodeSrgb(x * -0.9692436363 + y * 1.8759675015 + z * 0.0415550574),
      encodeSrgb(x * 0.0556300797 + y * -0.2039769589 + z * 1.0569715142)
    ];
  };
  const rgbaText = (r, g, b, a) => `rgba(${Math.round(clamp01(r) * 255)},${Math.round(clamp01(g) * 255)},${Math.round(clamp01(b) * 255)},${clamp01(a)})`;

  const replaceColorFunction = (value) => String(value || '').replace(/color\(\s*([\w-]+)\s+([^)]*)\)/gi, (_match, space, body) => {
    const parts = String(body).split('/');
    const channels = parts[0].trim().split(/\s+/).filter(Boolean);
    if (channels.length < 3) return 'rgba(0,0,0,0)';
    let rgb = channels.slice(0, 3).map(colorComponent);
    const alpha = alphaComponent(parts[1]);
    const normalizedSpace = String(space).toLowerCase();
    if (normalizedSpace === 'display-p3') rgb = p3ToSrgb(rgb[0], rgb[1], rgb[2]);
    else if (normalizedSpace === 'srgb-linear') rgb = rgb.map(encodeSrgb);
    return rgbaText(rgb[0], rgb[1], rgb[2], alpha);
  });

  const normalizeUnsupportedColors = (root) => {
    const nodes = [root, ...Array.from(root.querySelectorAll('*'))];
    for (const node of nodes) {
      if (!(node instanceof Element)) continue;
      const computed = getComputedStyle(node);
      for (const prop of COLOR_PROPS) {
        const value = computed.getPropertyValue(prop);
        if (!value || !/color\(/i.test(value)) continue;
        node.style.setProperty(prop, replaceColorFunction(value), 'important');
      }
    }
  };

  const releaseParentPrintState = () => {
    try { window.dispatchEvent(new Event('afterprint')); } catch {}
  };
  const actionCopy = (mode) => mode === 'share'
    ? { label:'Share PDF / مشاركة PDF', help:'اضغط «مشاركة PDF» لإرسال الملف مباشرة. وإذا لم تظهر نافذة iPhone استخدم «فتح PDF».' }
    : mode === 'print'
      ? { label:'Print / طباعة', help:'اضغط «طباعة» لفتح نافذة الطباعة في iPhone.' }
      : { label:'Save PDF / حفظ PDF', help:'اضغط «حفظ PDF». سيفتح Safari الملف أو ينزله ويمكنك حفظه في Files.' };

  const clearReadyProbe = () => { if (readyProbeTimer) clearInterval(readyProbeTimer); readyProbeTimer = 0; };
  const clearShareWatchdog = () => { if (shareWatchdogTimer) clearTimeout(shareWatchdogTimer); shareWatchdogTimer = 0; };
  const releasePdfUrlLater = () => {
    if (!pendingPdfUrl) return;
    const url = pendingPdfUrl; pendingPdfUrl = '';
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 120000);
  };
  const resetPendingFile = () => { clearShareWatchdog(); releasePdfUrlLater(); pendingPdfPromise = null; pendingPdfFile = null; };
  const removeInlineOverlay = (release = false) => {
    clearReadyProbe(); clearShareWatchdog();
    const overlay = pendingInlineOverlay; pendingInlineOverlay = null;
    if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
    resetPendingFile();
    if (release) releaseParentPrintState();
  };

  const ensureInlineOverlay = (mode = pendingMode) => {
    pendingMode = normalizeMode(mode);
    if (pendingInlineOverlay?.isConnected) return pendingInlineOverlay;
    const overlay = document.createElement('div');
    overlay.className = 'lourex-ios-output-fallback';
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
    overlay.innerHTML = '<div class="lourex-ios-output-card"><div class="lourex-ios-output-spinner"></div><strong>Preparing PDF…</strong><span>جارٍ إنشاء ملف PDF…</span><button type="button" class="lourex-ios-output-cancel">Close / إغلاق</button></div>';
    const style = document.createElement('style');
    style.textContent = '.lourex-ios-output-fallback{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:24px;background:rgba(7,20,30,.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.lourex-ios-output-card{width:min(360px,100%);padding:24px;border-radius:20px;background:#fffdf9;color:#17364a;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.28)}.lourex-ios-output-card strong{display:block;font-size:18px;margin:8px 0}.lourex-ios-output-card span{display:block;color:#667784;font-size:13px;line-height:1.55;margin-bottom:18px}.lourex-ios-output-spinner{width:42px;height:42px;margin:0 auto 14px;border:2px solid #d8c49d;border-top-color:#17364a;border-radius:50%;animation:lourexOutputSpin .8s linear infinite}.lourex-ios-output-card button,.lourex-ios-output-card a{min-height:46px;border-radius:12px;border:1px solid #ccd8df;background:#fff;color:#27495f;padding:0 16px;font:700 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.lourex-ios-output-card a{display:flex;align-items:center;justify-content:center;text-decoration:none}.lourex-ios-output-primary{width:100%;background:#173f59!important;border-color:#173f59!important;color:#fff!important;margin-bottom:8px}.lourex-ios-output-secondary{width:100%;margin-bottom:8px}.lourex-ios-output-error{color:#9f3b32!important}@keyframes lourexOutputSpin{to{transform:rotate(360deg)}}@media print{.lourex-ios-output-fallback{display:none!important}}';
    overlay.appendChild(style);
    overlay.querySelector('.lourex-ios-output-cancel')?.addEventListener('click',()=>removeInlineOverlay(true));
    document.body.appendChild(overlay); pendingInlineOverlay = overlay; return overlay;
  };

  const loadScript = (src, ready) => new Promise((resolve,reject) => {
    if (ready()) { resolve(); return; }
    const existing = Array.from(document.scripts).find(script => script.src === src);
    if (existing) {
      existing.addEventListener('load',()=>ready()?resolve():reject(new Error('PDF library did not initialize.')),{once:true});
      existing.addEventListener('error',()=>reject(new Error('Unable to load PDF library.')),{once:true});
      return;
    }
    const script = document.createElement('script'); script.src = src; script.async = true; script.crossOrigin = 'anonymous';
    script.addEventListener('load',()=>ready()?resolve():reject(new Error('PDF library did not initialize.')),{once:true});
    script.addEventListener('error',()=>reject(new Error('Unable to load PDF library.')),{once:true});
    document.head.appendChild(script);
  });
  const ensurePdfLibraries = async () => {
    await loadScript(HTML2CANVAS_URL,()=>typeof window.html2canvas === 'function');
    await loadScript(JSPDF_URL,()=>Boolean(window.jspdf?.jsPDF));
  };
  const waitForCloneAssets = async (stage) => {
    try { if (document.fonts) await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1800))]); } catch {}
    await Promise.all(Array.from(stage.querySelectorAll('img')).map(image => {
      if (image.complete) return Promise.resolve();
      return new Promise(resolve => {
        const done = () => resolve(); image.addEventListener('load',done,{once:true}); image.addEventListener('error',done,{once:true}); setTimeout(done,1400);
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
      stage.className = 'lourex-ios-pdf-stage'; stage.setAttribute('aria-hidden','true');
      stage.style.cssText = 'position:fixed;left:-12000px;top:0;width:210mm;display:block;background:#fff;pointer-events:none;z-index:-1;';
      for (const source of sourcePages) {
        const clone = source.cloneNode(true);
        clone.style.setProperty('width','210mm','important'); clone.style.setProperty('min-width','210mm','important'); clone.style.setProperty('max-width','210mm','important');
        clone.style.setProperty('height','297mm','important'); clone.style.setProperty('min-height','297mm','important'); clone.style.setProperty('margin','0','important'); clone.style.setProperty('transform','none','important');
        stage.appendChild(clone);
      }
      document.body.appendChild(stage);
      try {
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        await waitForCloneAssets(stage);
        normalizeUnsupportedColors(stage);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
        const pages = Array.from(stage.querySelectorAll('.invoice-page'));
        const renderScale = Math.min(2,Math.max(1.45,window.devicePixelRatio||1.5));
        for (let index=0; index<pages.length; index+=1) {
          const page = pages[index];
          const canvas = await window.html2canvas(page,{scale:renderScale,useCORS:true,allowTaint:false,logging:false,backgroundColor:'#ffffff',imageTimeout:1800,removeContainer:true});
          if (index>0) pdf.addPage('a4','portrait');
          pdf.addImage(canvas.toDataURL('image/jpeg',0.94),'JPEG',0,0,210,297,undefined,'FAST');
          canvas.width=1; canvas.height=1;
        }
        const blob = pdf.output('blob');
        const file = new File([blob],`${safeFilename(document.title)}.pdf`,{type:'application/pdf',lastModified:Date.now()});
        pendingPdfFile = file; return file;
      } finally { stage.remove(); }
    })().catch(error=>{ pendingPdfPromise=null; throw error; });
    return pendingPdfPromise;
  };

  const pdfUrlFor = (file) => { if (!pendingPdfUrl) pendingPdfUrl = URL.createObjectURL(file); return pendingPdfUrl; };
  const resetShareButton = (overlay, mode, message) => {
    const card = overlay?.querySelector('.lourex-ios-output-card'); const primary = card?.querySelector('.lourex-ios-output-primary');
    if (primary?.tagName === 'BUTTON') { primary.disabled=false; primary.textContent=actionCopy(mode).label; }
    const help = card?.querySelector('span'); if (help && message) help.textContent=message;
  };
  const sharePreparedFile = (file, mode, overlay) => {
    const canShareFiles = typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare({files:[file]}));
    if (!canShareFiles) { resetShareButton(overlay,mode,'مشاركة الملفات غير متاحة هنا. استخدم «فتح PDF» ثم زر مشاركة Safari.'); return; }
    clearShareWatchdog();
    shareWatchdogTimer=setTimeout(()=>{ resetShareButton(overlay,mode,'إذا لم تظهر نافذة المشاركة، استخدم «فتح PDF» ثم زر مشاركة Safari.'); shareWatchdogTimer=0; },2500);
    try {
      navigator.share({ files: [file] }).then(()=>{ clearShareWatchdog(); removeInlineOverlay(true); }).catch(error=>{
        clearShareWatchdog();
        resetShareButton(overlay,mode,error?.name==='AbortError'?'تم إلغاء المشاركة. يمكنك المحاولة مرة أخرى.':'تعذر فتح مشاركة iPhone. استخدم «فتح PDF» ثم زر مشاركة Safari.');
      });
    } catch { clearShareWatchdog(); resetShareButton(overlay,mode,'تعذر فتح مشاركة iPhone. استخدم «فتح PDF» ثم زر مشاركة Safari.'); }
  };

  const hydrateInlineFallback = (overlay, mode, file) => {
    const copy=actionCopy(mode); const card=overlay.querySelector('.lourex-ios-output-card'); if(!card)return; card.dataset.ready='true';
    if (mode==='print') {
      card.innerHTML=`<strong>Print Ready / الطباعة جاهزة</strong><span>${escapeHtml(copy.help)}</span><button type="button" class="lourex-ios-output-primary">${escapeHtml(copy.label)}</button><button type="button" class="lourex-ios-output-cancel">Close / إغلاق</button>`;
      card.querySelector('.lourex-ios-output-primary')?.addEventListener('click',()=>{ try{nativePrint();}finally{removeInlineOverlay(true);} });
    } else if (mode==='pdf' && file) {
      const url=pdfUrlFor(file);
      card.innerHTML=`<strong>PDF Ready / ملف PDF جاهز</strong><span>${escapeHtml(copy.help)}</span><a class="lourex-ios-output-primary" href="${escapeHtml(url)}" download="${escapeHtml(file.name)}" target="_blank" rel="noopener" type="application/pdf">${escapeHtml(copy.label)}</a><a class="lourex-ios-output-secondary" href="${escapeHtml(url)}" target="_blank" rel="noopener" type="application/pdf">Open PDF / فتح PDF</a><button type="button" class="lourex-ios-output-cancel">Close / إغلاق</button>`;
    } else if (mode==='share' && file) {
      const url=pdfUrlFor(file);
      card.innerHTML=`<strong>PDF Ready / ملف PDF جاهز</strong><span>${escapeHtml(copy.help)}</span><button type="button" class="lourex-ios-output-primary">${escapeHtml(copy.label)}</button><a class="lourex-ios-output-secondary" href="${escapeHtml(url)}" target="_blank" rel="noopener" type="application/pdf">Open PDF / فتح PDF</a><button type="button" class="lourex-ios-output-cancel">Close / إغلاق</button>`;
      card.querySelector('.lourex-ios-output-primary')?.addEventListener('click',event=>{ const button=event.currentTarget; if(button.disabled)return; button.disabled=true; button.textContent='Opening Share… / جارٍ فتح المشاركة…'; sharePreparedFile(file,mode,overlay); });
    }
    card.querySelector('.lourex-ios-output-cancel')?.addEventListener('click',()=>removeInlineOverlay(true));
  };
  const showPreparationError = (error) => {
    const overlay=ensureInlineOverlay(pendingMode); const card=overlay.querySelector('.lourex-ios-output-card'); if(!card)return;
    const message=error instanceof Error?error.message:'Unable to create PDF.';
    card.innerHTML=`<strong>PDF failed / تعذر إنشاء PDF</strong><span class="lourex-ios-output-error">${escapeHtml(message)}</span><button type="button" class="lourex-ios-output-cancel">Close / إغلاق</button>`;
    card.querySelector('.lourex-ios-output-cancel')?.addEventListener('click',()=>removeInlineOverlay(true));
  };

  const portalIsReady = () => Boolean(document.querySelector('.print-portal .invoice-page'));
  const prepareCurrentOutput = () => {
    const overlay=ensureInlineOverlay(pendingMode);
    if (pendingMode==='print') { hydrateInlineFallback(overlay,pendingMode,null); return; }
    void buildPdfFile().then(file=>{ if(overlay.isConnected)hydrateInlineFallback(overlay,pendingMode,file); }).catch(showPreparationError);
  };
  const armReadyProbe = () => {
    clearReadyProbe(); let attempts=0;
    readyProbeTimer=setInterval(()=>{ attempts+=1; if(portalIsReady()){clearReadyProbe();prepareCurrentOutput();} else if(attempts>=125){clearReadyProbe();showPreparationError(new Error('Printable document timed out.'));}},80);
  };
  const preparePdfWindow = (mode='pdf') => { pendingMode=normalizeMode(mode); resetPendingFile(); ensureInlineOverlay(pendingMode); armReadyProbe(); return true; };
  window.__LOUREX_PREPARE_PDF__ = preparePdfWindow;

  document.addEventListener('click',event=>{
    const node=event.target; if(!(node instanceof Element))return;
    const button=node.closest('.modal-footer-actions .btn-primary'); if(!button||!button.closest('.modal')?.querySelector('.issue-review'))return;
    const text=button.textContent||''; if(!/PDF|Share|مشاركة|طباعة|Print/i.test(text))return;
    preparePdfWindow(/Share|مشاركة/i.test(text)?'share':/Print|طباعة/i.test(text)?'print':'pdf');
  },true);

  window.print=function lourexPrintBridge(){
    if(!portalIsReady()){armReadyProbe();if(!document.body.classList.contains('printing'))nativePrint();return;}
    clearReadyProbe();prepareCurrentOutput();
  };
})();
