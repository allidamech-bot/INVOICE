interface State {
  failed: boolean;
}

export class AppErrorBoundary extends React.Component<{ children?: any }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: unknown): void {
    console.error('LOUREX Invoice UI error', error, info);
  }

  render(): any {
    if (!this.state.failed) return this.props.children;
    return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:'24px',background:'#f7f3ea',color:'#132331',fontFamily:'Inter, Arial, sans-serif'}}>
      <section role="alert" style={{width:'min(560px,100%)',background:'#fff',border:'1px solid #d8d1c4',borderRadius:'18px',padding:'28px',boxShadow:'0 18px 45px rgba(15,35,50,.10)'}}>
        <strong style={{display:'block',fontSize:'22px',marginBottom:'10px'}}>LOUREX Invoice</strong>
        <p style={{margin:'0 0 8px',lineHeight:1.6}}>An unexpected screen error occurred. Your saved invoice data remains stored on this device.</p>
        <p dir="rtl" style={{margin:'0 0 20px',lineHeight:1.8,textAlign:'right'}}>حدث خطأ غير متوقع في الشاشة. بيانات الفواتير المحفوظة تبقى محفوظة على هذا الجهاز.</p>
        <button type="button" onClick={()=>window.location.reload()} style={{minHeight:'44px',padding:'0 18px',border:0,borderRadius:'10px',background:'#0b1d2d',color:'#fff',fontWeight:700,cursor:'pointer'}}>Reload LOUREX / إعادة التحميل</button>
      </section>
    </main>;
  }
}
