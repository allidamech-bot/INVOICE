const EXPECTED_REQUESTED_WITH='LOUREX-Invoice';

function headerValues(value){
  return String(value||'').split(',').map(item=>item.trim().toLowerCase()).filter(Boolean);
}

export function requestHostCandidates(request){
  const headers=request?.headers||{};
  return new Set([
    ...headerValues(headers.host),
    ...headerValues(headers['x-forwarded-host'])
  ]);
}

export function sameOriginRequest(request){
  const headers=request?.headers||{};
  const origin=String(headers.origin||'').trim();
  const requestedWith=String(headers['x-requested-with']||'').trim();
  if(!origin||requestedWith!==EXPECTED_REQUESTED_WITH)return false;
  const hosts=requestHostCandidates(request);
  if(!hosts.size)return false;
  try{
    const parsed=new URL(origin);
    return parsed.protocol==='https:'&&hosts.has(parsed.host.toLowerCase());
  }catch{
    return false;
  }
}
