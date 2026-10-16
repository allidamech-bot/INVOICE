import { qrcodegen } from './vendor/qrcodegen.js';
import { secureShareUrl } from './secure-share.js';

/** Generated locally: the private customer link never goes to a QR service. */
export function documentQrImage(token:string,origin?:string):string{
  const url=secureShareUrl(token,origin);
  if(!/^https?:\/\//.test(url)||url.length>400)throw new Error('A valid website origin is required for document QR.');
  const qr=qrcodegen.QrCode.encodeText(url,qrcodegen.QrCode.Ecc.MEDIUM);
  const border=4,size=qr.size+border*2,segments:string[]=[];
  for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++){
    if(qr.getModule(x,y))segments.push(`M${x+border},${y+border}h1v1h-1z`);
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size*8}" height="${size*8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${segments.join('')}" fill="#000"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
