/**
 * Explicitly limited LIVE evaluation of AI Next language handling.
 * Authentication is via the existing requestAiJson Firebase helper.
 * This component never receives a vault, draft, financial callback or API.
 * R07M/R07P/R07D durable Controller execution remains disabled.
 */
import {requestAiJson} from '../../lib/ai-request.js';

type Role='user'|'assistant';
type Mode='advisor'|'controller';
type Turn={role:Role;text:string};
const messageStyle={
  whiteSpace:'pre-wrap' as const,overflowWrap:'anywhere' as const,
  fontSize:14,lineHeight:1.8,padding:'11px 13px',
  borderRadius:12,margin:'8px 0',
};

export function AiNextLiveReadOnlyChat():any{
  const [mode,setMode]=React.useState<Mode>('controller');
  const [messages,setMessages]=React.useState<Turn[]>([]);
  const [input,setInput]=React.useState('');
  const [pending,setPending]=React.useState('');
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  const [diagnostics,setDiagnostics]=React.useState('');
  const active=React.useState<{current:AbortController|null}>({current:null})[0];
  React.useEffect(()=>()=>{active.current?.abort();},[]);
  const submit=async()=>{
    const text=input.trim();
    if(busy||!text||text.length>2400)return;
    const controller=new AbortController();active.current=controller;
    const context=messages.slice(-4).map(row=>({...row}));
    setBusy(true);setError('');setPending(text);
    // Preserve the composer until the server confirms a valid response.
    try{
      const response=await requestAiJson('/api/ai-conversation-v3?nextLive=1',{
        message:text,history:context,mode,
      },controller.signal,48_000);
      if(controller.signal.aborted)return;
      if(response.readOnly!==true||response.realInference!==true||
        response.saved!==false||typeof response.answer!=='string'||
        !response.answer.trim()||response.answer.length>4000)
        throw Error('نتيجة الخادم لم تستوفِ شروط المحادثة الحقيقية للقراءة فقط.');
      setMessages(old=>[...old,{role:'user' as Role,text},
        {role:'assistant' as Role,text:response.answer}].slice(-30));
      setDiagnostics(
        'موجّه حقيقي · '+(typeof response.provider==='string'?response.provider:'مزوّد غير معروض')+
        (typeof response.model==='string'?' / '+response.model:'')+
        (Number.isSafeInteger(response.totalLatencyMs)?' · '+response.totalLatencyMs+'ms':'')
      );
      setInput(current=>current===text?'':current);
    }catch(e){
      if(!controller.signal.aborted)setError(e instanceof Error?e.message:
        'تعذّر الاتصال بالنموذج؛ لم يحدث حفظ أو تعديل.');
    }finally{
      if(active.current===controller){
        active.current=null;setPending('');setBusy(false);
      }
    }
  };
  return <section dir="rtl" aria-label="AI Next real model read-only evaluation"
    style={{display:'flex',flexDirection:'column',minHeight:0,flex:1,
      overflow:'hidden',background:'#f8faf8',color:'#18333a'}}>
    <div style={{padding:'10px 12px',background:'#fff7e7',
      borderBottom:'1px solid #ebd2aa',fontSize:12,lineHeight:1.7}}>
      <strong>AI Next — اختبار حقيقي للغة والسرعة</strong>
      <div>الرد يأتي من مزوّد AI فعلي عبر خادم LOUREX المصادق عليه.
        هذه المرحلة للقراءة والحوار فقط: لا ملفات، لا حفظ، لا تعديل أو إصدار مالي.
        لا تدخل معلومات عملاء سرية قبل اعتماد خصوصية المزوّد.</div>
    </div>
    <div style={{display:'flex',gap:7,padding:10,borderBottom:'1px solid #d7e3df'}}>
      <button type="button" onClick={()=>setMode('controller')} disabled={busy}
        aria-pressed={mode==='controller'}
        style={{padding:'7px 11px',borderRadius:9,
          background:mode==='controller'?'#d7e7fd':'white',
          border:'1px solid #a6bacb',fontSize:12}}>
        Controller (اقتراح فقط)
      </button>
      <button type="button" onClick={()=>setMode('advisor')} disabled={busy}
        aria-pressed={mode==='advisor'}
        style={{padding:'7px 11px',borderRadius:9,
          background:mode==='advisor'?'#d7e7fd':'white',
          border:'1px solid #a6bacb',fontSize:12}}>Advisor</button>
      <button type="button" disabled={busy} onClick={()=>{
        setMessages([]);setDiagnostics('');setError('');
      }} style={{marginRight:'auto',fontSize:12}}>محادثة جديدة</button>
    </div>
    <div role="log" aria-live="polite" style={{
      flex:1,minHeight:150,overflowY:'auto',padding:'12px 15px',
      overscrollBehavior:'contain'}}>
      {messages.length===0?<p style={{fontSize:13,lineHeight:1.8}}>
        اكتب سؤالاً حقيقياً مثل «افهم طلبي فقط ولا تحفظ أي شيء»،
        ثم اسأل سؤالاً تابعاً. هذه ليست محاكاة بردود ثابتة.
      </p>:null}
      {messages.map((row,i)=><div key={i} dir="auto"
        style={{...messageStyle,
          background:row.role==='user'?'#deebff':'#edf3ee',
          marginLeft:row.role==='user'?30:0,
          marginRight:row.role==='assistant'?30:0}}>
        <div style={{fontSize:11,opacity:.7}}>{row.role==='user'?'أنت':'LOUREX · رد نموذج حقيقي'}</div>
        {row.text}
      </div>)}
      {busy?<div style={{...messageStyle,background:'#edf3ee'}}>
        <div style={{fontSize:11}}>أنت · الطلب قيد المعالجة</div>{pending}
        <p style={{fontSize:12}}>يجري الاتصال بالمزوّد المؤهل...</p>
      </div>:null}
    </div>
    <div style={{borderTop:'1px solid #c6d8d4',padding:12}}>
      {error?<div role="alert" style={{padding:9,color:'#a22d2d',
        background:'#fff0ed',borderRadius:8,fontSize:12}}>{error}</div>:null}
      <form onSubmit={(e:any)=>{e.preventDefault();void submit();}}
        style={{display:'flex',gap:8,alignItems:'flex-end'}}>
        <textarea value={input} maxLength={2400} rows={2}
          disabled={busy} onChange={(e:any)=>setInput(e.currentTarget.value)}
          placeholder="اكتب طلبك بالعربي أو English..."
          aria-label="رسالة حقيقية إلى LOUREX AI Next" dir="auto"
          style={{fontFamily:'inherit',fontSize:16,flex:1,minWidth:0,
            border:'1px solid #a6beb8',borderRadius:11,padding:10,
            resize:'vertical',maxHeight:150}}/>
        <button type="submit" disabled={busy||!input.trim()}
          style={{padding:'12px 15px',background:'#196d63',border:0,
            borderRadius:10,color:'white',fontSize:13}}>
          {busy?'...':'إرسال'}
        </button>
      </form>
      {diagnostics?<div style={{fontSize:11,marginTop:8,color:'#48665e'}}>
        {diagnostics}</div>:null}
    </div>
  </section>;
}
