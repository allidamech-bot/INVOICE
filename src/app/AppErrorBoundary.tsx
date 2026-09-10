import { t, isArabic } from '../lib/i18n.js';

interface State {
  failed: boolean;
  message: string;
  copied: boolean;
}

export class AppErrorBoundary extends React.Component<{ children?: any }, State> {
  state: State = { failed: false, message: '', copied: false };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, message: error instanceof Error ? error.message : 'Unknown screen error', copied: false };
  }

  componentDidCatch(error: unknown, info: unknown): void {
    console.error('LOUREX Invoice UI error', error, info);
  }

  private diagnostics=():string=>{
    const runtime=(window as any).__LOUREX_RUNTIME__||{};
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
      `userAgent=${navigator.userAgent}`
    ].join('\n');
  };

  private copyDiagnostics=async()=>{
    const text=this.diagnostics();
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
    return <main className="app-recovery" dir={isArabic()?'rtl':'ltr'} style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:'24px',background:'#091218',color:'#EDF2F1',fontFamily:'Inter, Arial, sans-serif'}}>
      <section role="alert" style={{width:'min(620px,100%)',background:'#101D24',border:'1px solid #30434B',borderRadius:'18px',padding:'28px',boxShadow:'0 18px 45px rgba(15,35,50,.10)'}}>
        <strong style={{display:'block',fontSize:'22px',marginBottom:'10px'}}>LOUREX Invoice</strong>
        <p style={{margin:'0 0 20px',lineHeight:1.8}}>{t('An unexpected screen error occurred. Your saved invoice data remains stored on this device.','حدث خطأ غير متوقع في الشاشة. بيانات الفواتير المحفوظة تبقى محفوظة على هذا الجهاز.')}</p>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <button type="button" onClick={()=>window.location.reload()} style={{minHeight:'44px',padding:'0 18px',border:0,borderRadius:'10px',background:'#0b1d2d',color:'#fff',fontWeight:700,cursor:'pointer'}}>{t('Reload LOUREX','إعادة التحميل')}</button>
          <button type="button" onClick={()=>void this.copyDiagnostics()} style={{minHeight:'44px',padding:'0 18px',border:'1px solid #30434B',borderRadius:'10px',background:'#101D24',color:'#EDF2F1',fontWeight:700,cursor:'pointer'}}>{this.state.copied?t('Copied','تم النسخ'):t('Copy diagnostics','نسخ التشخيص')}</button>
          <button type="button" onClick={()=>{window.location.href='./health.html';}} style={{minHeight:'44px',padding:'0 18px',border:'1px solid #30434B',borderRadius:'10px',background:'#101D24',color:'#EDF2F1',fontWeight:700,cursor:'pointer'}}>{t('System health','صحة النظام')}</button>
        </div>
        <details style={{marginTop:'16px',paddingTop:'14px',borderTop:'1px solid #263840'}}>
          <summary style={{cursor:'pointer',fontSize:'14px',fontWeight:700,color:'#9AACB1'}}>{t('Technical details','التفاصيل التقنية')}</summary>
          <pre style={{margin:'10px 0 0',padding:'12px',overflow:'auto',whiteSpace:'pre-wrap',wordBreak:'break-word',borderRadius:'10px',background:'#0C171C',fontSize:'12px',lineHeight:1.55,color:'#9AACB1'}}>{this.diagnostics()}</pre>
        </details>
      </section>
    </main>;
  }
}
