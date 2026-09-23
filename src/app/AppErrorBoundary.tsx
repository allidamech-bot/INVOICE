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
    const primary={minHeight:'46px',padding:'0 18px',border:'1px solid #27d8df',borderRadius:'12px',background:'#27d8df',color:'#042229',fontWeight:800,cursor:'pointer',boxShadow:'none'} as const;
    const secondary={minHeight:'46px',padding:'0 18px',border:'1px solid #2a5964',borderRadius:'12px',background:'#102f37',color:'#eefbfd',fontWeight:750,cursor:'pointer',boxShadow:'none'} as const;
    return <main className="app-recovery" dir={isArabic()?'rtl':'ltr'} style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:'24px',background:'#061820',color:'#eefbfd',fontFamily:'Inter, Arial, sans-serif'}}>
      <section role="alert" style={{width:'min(640px,100%)',background:'#0b2830',border:'1px solid #1f4d58',borderRadius:'22px',padding:'28px',boxShadow:'0 24px 80px rgba(0,0,0,.28)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'14px'}}><span aria-hidden="true" style={{width:'12px',height:'12px',borderRadius:'50%',background:'#27d8df',boxShadow:'0 0 0 6px rgba(39,216,223,.1)'}}/><strong style={{display:'block',fontSize:'22px',letterSpacing:'.02em'}}>LOUREX Invoice</strong></div>
        <p style={{margin:'0 0 20px',lineHeight:1.8,color:'#c6d9dd'}}>{t('An unexpected screen error occurred. Your saved invoice data remains stored on this device.','حدث خطأ غير متوقع في الشاشة. بيانات الفواتير المحفوظة تبقى محفوظة على هذا الجهاز.')}</p>
        <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
          <button type="button" onClick={()=>window.location.reload()} style={primary}>{t('Reload LOUREX','إعادة تحميل LOUREX')}</button>
          <button type="button" onClick={()=>void this.copyDiagnostics()} style={secondary}>{this.state.copied?t('Copied','تم النسخ'):t('Copy diagnostics','نسخ التشخيص')}</button>
          <button type="button" onClick={()=>{window.location.href='./health.html';}} style={secondary}>{t('System health','صحة النظام')}</button>
        </div>
        <details style={{marginTop:'18px',paddingTop:'16px',borderTop:'1px solid #1d4650'}}>
          <summary style={{cursor:'pointer',fontSize:'14px',fontWeight:750,color:'#9fc1c8'}}>{t('Technical details','التفاصيل التقنية')}</summary>
          <pre style={{margin:'12px 0 0',padding:'14px',overflow:'auto',whiteSpace:'pre-wrap',wordBreak:'break-word',borderRadius:'12px',background:'#061c22',border:'1px solid #173c45',fontSize:'12px',lineHeight:1.55,color:'#a8c0c5'}}>{this.diagnostics()}</pre>
        </details>
      </section>
    </main>;
  }
}