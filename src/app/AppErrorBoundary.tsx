import { t, isArabic } from '../lib/i18n.js';

interface State {
  failed: boolean;
  message: string;
  copied: boolean;
}

function diag(type:string,detail=''):void{try{(window as any).__LOUREX_DIAGNOSTICS__?.mark?.(type,detail);}catch{}}
function markNavigation(reason:string,detail=''):void{try{(window as any).__LOUREX_MARK_NAVIGATION__?.(reason,detail);}catch{}}

export class AppErrorBoundary extends React.Component<{ children?: any }, State> {
  state: State = { failed: false, message: '', copied: false };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, message: error instanceof Error ? error.message : 'Unknown screen error', copied: false };
  }

  componentDidCatch(error: unknown, info: unknown): void {
    const name=error instanceof Error?error.name:'UnknownError';
    diag('react-error-boundary',`name=${name}`);
    console.error('LOUREX Invoice UI error', error, info);
  }

  private diagnostics=():string=>{
    const runtime=(window as any).__LOUREX_RUNTIME__||{};
    const unified=(window as any).__LOUREX_DIAGNOSTICS__;
    return [
      'LOUREX Invoice diagnostics',
      `time=${new Date().toISOString()}`,
      `path=${window.location.pathname}${window.location.search}${window.location.hash}`,
      `environment=${runtime.environment||'unknown'}`,
      `source=${runtime.sourceRepoOwner||'unknown'}/${runtime.sourceRepoSlug||'unknown'}`,
      `commit=${runtime.commitSha||'n/a'}`,
      `buildTime=${runtime.buildTime||'n/a'}`,
      `online=${navigator.onLine}`,
      `secureContext=${window.isSecureContext}`,
      `serviceWorker=${Boolean(navigator.serviceWorker?.controller)}`,
      `error=${this.state.message || 'Unknown screen error'}`,
      `unifiedDiagnostics=${unified?.version||'unavailable'}`,
      `userAgent=${navigator.userAgent}`
    ].join('\n');
  };

  private copyDiagnostics=async()=>{
    const unified=(window as any).__LOUREX_DIAGNOSTICS__;
    const text=[this.diagnostics(),'',typeof unified?.exportText==='function'?unified.exportText():''].filter(Boolean).join('\n');
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
      else{
        const area=document.createElement('textarea');
        area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';
        document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
      }
      this.setState({copied:true});
    }catch{this.setState({copied:false});}
  };

  render(): any {
    if (!this.state.failed) return this.props.children ?? null;
    const primary={minHeight:'46px',padding:'0 18px',border:'1px solid var(--ft-accent,#129da1)',borderRadius:'12px',background:'var(--ft-accent,#129da1)',color:'var(--ft-on-accent,#ffffff)',fontWeight:800,cursor:'pointer',boxShadow:'none'} as const;
    const secondary={minHeight:'46px',padding:'0 18px',border:'1px solid var(--ft-line-strong,#c3d1dc)',borderRadius:'12px',background:'var(--ft-surface-2,#eef4f7)',color:'var(--ft-text-strong,#102235)',fontWeight:750,cursor:'pointer',boxShadow:'none'} as const;
    return <main className="app-recovery" dir={isArabic()?'rtl':'ltr'} style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:'24px',background:'var(--ft-workspace,#081321)',color:'var(--ft-text,#d7e2ef)',fontFamily:'Outfit, Inter, Arial, sans-serif'}}>
      <section role="alert" style={{width:'min(640px,100%)',background:'var(--ft-surface,#0f1c2d)',border:'1px solid var(--ft-line,#263a52)',borderRadius:'22px',padding:'28px',boxShadow:'0 24px 80px rgba(0,0,0,.28)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'14px'}}><span aria-hidden="true" style={{width:'12px',height:'12px',borderRadius:'50%',background:'var(--ft-accent,#4ed4d0)',boxShadow:'0 0 0 6px var(--ft-accent-soft,rgba(78,212,208,.14))'}}/><strong style={{display:'block',fontSize:'22px',letterSpacing:'.02em',color:'var(--ft-text-strong,#f7fbff)'}}>LOUREX Invoice</strong></div>
        <p style={{margin:'0 0 20px',lineHeight:1.8,color:'var(--ft-text-soft,#a8b8ca)'}}>{t('An unexpected screen error occurred. Your saved invoice data remains stored on this device.','حدث خطأ غير متوقع في الشاشة. بيانات الفواتير المحفوظة تبقى محفوظة على هذا الجهاز.')}</p>
        <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
          <button type="button" onClick={()=>{markNavigation('error-boundary-user-reload','mode=reload');window.location.reload();}} style={primary}>{t('Reload LOUREX','إعادة تحميل LOUREX')}</button>
          <button type="button" onClick={()=>void this.copyDiagnostics()} style={secondary}>{this.state.copied?t('Copied','تم النسخ'):t('Copy diagnostics','نسخ التشخيص')}</button>
          <button type="button" onClick={()=>{markNavigation('error-boundary-health-open','mode=href');window.location.href='./health.html';}} style={secondary}>{t('System health','صحة النظام')}</button>
        </div>
        <details style={{marginTop:'18px',paddingTop:'16px',borderTop:'1px solid var(--ft-line,#263a52)'}}>
          <summary style={{cursor:'pointer',fontSize:'14px',fontWeight:750,color:'var(--ft-muted,#8799ae)'}}>{t('Technical details','التفاصيل التقنية')}</summary>
          <pre style={{margin:'12px 0 0',padding:'14px',overflow:'auto',whiteSpace:'pre-wrap',wordBreak:'break-word',borderRadius:'12px',background:'var(--ft-workspace,#081321)',border:'1px solid var(--ft-line,#263a52)',fontSize:'12px',lineHeight:1.55,color:'var(--ft-text-soft,#a8b8ca)'}}>{this.diagnostics()}</pre>
        </details>
      </section>
    </main>;
  }
}
