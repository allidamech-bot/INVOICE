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

  private diagnostics=():string=>[
    'LOUREX Invoice diagnostics',
    `time=${new Date().toISOString()}`,
    `path=${window.location.pathname}${window.location.search}${window.location.hash}`,
    `online=${navigator.onLine}`,
    `serviceWorker=${Boolean(navigator.serviceWorker?.controller)}`,
    `error=${this.state.message || 'Unknown screen error'}`,
    `userAgent=${navigator.userAgent}`
  ].join('\n');

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
    if (!this.state.failed) return this.props.children;
    return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:'24px',background:'#f7f3ea',color:'#132331',fontFamily:'Inter, Arial, sans-serif'}}>
      <section role="alert" style={{width:'min(620px,100%)',background:'#fff',border:'1px solid #d8d1c4',borderRadius:'18px',padding:'28px',boxShadow:'0 18px 45px rgba(15,35,50,.10)'}}>
        <strong style={{display:'block',fontSize:'22px',marginBottom:'10px'}}>LOUREX Invoice</strong>
        <p style={{margin:'0 0 8px',lineHeight:1.6}}>An unexpected screen error occurred. Your saved invoice data remains stored on this device.</p>
        <p dir="rtl" style={{margin:'0 0 20px',lineHeight:1.8,textAlign:'right'}}>حدث خطأ غير متوقع في الشاشة. بيانات الفواتير المحفوظة تبقى محفوظة على هذا الجهاز.</p>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <button type="button" onClick={()=>window.location.reload()} style={{minHeight:'44px',padding:'0 18px',border:0,borderRadius:'10px',background:'#0b1d2d',color:'#fff',fontWeight:700,cursor:'pointer'}}>Reload LOUREX / إعادة التحميل</button>
          <button type="button" onClick={()=>void this.copyDiagnostics()} style={{minHeight:'44px',padding:'0 18px',border:'1px solid #d8d1c4',borderRadius:'10px',background:'#fff',color:'#213846',fontWeight:700,cursor:'pointer'}}>{this.state.copied?'Copied / تم النسخ':'Copy diagnostics / نسخ التشخيص'}</button>
        </div>
        <details style={{marginTop:'16px',paddingTop:'14px',borderTop:'1px solid #ebe6dc'}}>
          <summary style={{cursor:'pointer',fontSize:'12px',fontWeight:700,color:'#60717b'}}>Technical details / التفاصيل التقنية</summary>
          <pre style={{margin:'10px 0 0',padding:'12px',overflow:'auto',whiteSpace:'pre-wrap',wordBreak:'break-word',borderRadius:'10px',background:'#f5f7f8',fontSize:'10.5px',lineHeight:1.55,color:'#445965'}}>{this.diagnostics()}</pre>
        </details>
      </section>
    </main>;
  }
}
