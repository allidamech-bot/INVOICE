import { prepareSigningArtwork } from '../lib/signing-artwork.js';

export function SigningArtwork({source,kind,paper,dark}:{source:string;kind:'signature'|'stamp';paper:string;dark:boolean}):any{
  const [prepared,setPrepared]=React.useState({source,ready:!dark});
  React.useEffect(()=>{
    let active=true;
    if(dark)void prepareSigningArtwork(source,kind,paper).then(value=>{if(active)setPrepared({source:value,ready:true});});
    else setPrepared({source,ready:true});
    return ()=>{active=false;};
  },[source,kind,paper,dark]);
  return <span className="signing-artwork" data-signing-ready={prepared.ready?'true':'false'}>
    <img className={kind==='signature'?'signature-image':'stamp-image'} src={prepared.source} alt={kind==='signature'?'Signature':'Stamp'} style={{visibility:prepared.ready?'visible':'hidden'}}/>
  </span>;
}
