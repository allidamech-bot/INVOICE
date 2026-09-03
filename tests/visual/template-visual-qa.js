import { TemplateRenderer } from '../../dist/src/templates/TemplateRenderer.js';

const templateIds=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];
const params=new URLSearchParams(location.search);
const template=templateIds.includes(params.get('template'))?params.get('template'):'midnight';
const language=['en','ar','bilingual'].includes(params.get('language'))?params.get('language'):'en';
const count=Math.max(1,Math.min(32,Number(params.get('items'))||10));
const mode=['desktop','tablet','mobile','print'].includes(params.get('mode'))?params.get('mode'):'desktop';
const scale=mode==='mobile'?.48:mode==='tablet'?.72:mode==='print'?1:.82;

const svg=(markup)=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
const logo=svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 72"><rect width="240" height="72" fill="#0a263b"/><path d="M20 18h10v27h29v9H20z" fill="#c19b59"/><text x="72" y="47" font-family="Arial" font-size="27" font-weight="700" letter-spacing="4" fill="white">LOUREX</text></svg>`);
const signature=svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 100"><path d="M15 70c35-64 28 33 58-14 24-37 22 40 52-5 17-25 20 24 52-4 20-18 31 5 82-18" fill="none" stroke="#162838" stroke-width="5" stroke-linecap="round"/><path d="M38 83h205" stroke="#a98148" stroke-width="2"/></svg>`);
const stamp=svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><circle cx="75" cy="75" r="61" fill="none" stroke="#8d2f35" stroke-width="7"/><circle cx="75" cy="75" r="46" fill="none" stroke="#8d2f35" stroke-width="2"/><text x="75" y="70" text-anchor="middle" font-family="Arial" font-size="15" font-weight="700" fill="#8d2f35">LOUREX</text><text x="75" y="92" text-anchor="middle" font-family="Arial" font-size="10" fill="#8d2f35">AUTHORIZED</text></svg>`);

const items=Array.from({length:count},(_,index)=>({
  id:`qa-item-${index+1}`,
  descriptionEn:index%5===0?'Industrial stainless-steel control assembly with calibrated fittings and extended factory documentation':`Precision trading component, commercial grade — series ${String(index+1).padStart(2,'0')}`,
  descriptionAr:index%5===0?'مجموعة تحكم صناعية من الفولاذ المقاوم للصدأ مع وصلات معايرة ووثائق مصنع موسعة':`مكوّن تجاري دقيق بدرجة صناعية — السلسلة ${index+1}`,
  hsCode:`84${String(7910+index).padStart(4,'0')}`,
  origin:index%3===0?'Germany':index%3===1?'UAE':'Italy',
  packing:index%2===0?'Export crate':'Pallet',
  quantity:String((index%7)+1),unit:index%2===0?'PCS':'SET',unitPrice:String(1175+(index*83)),unitCost:'0'
}));

const documentData={
  id:'visual-qa-document',kind:'proforma',role:'standard',status:'final',lifecycleStatus:'active',revision:2,creditForId:'',creditForNumber:'',voidedAt:'',voidReason:'',bankAccountId:'qa-bank',paymentTermPresetId:'qa-terms',number:'PI-2026-00847',issueDate:'2026-09-03',dueDate:'2026-09-24',currency:'USD',language,
  customerSnapshot:{sourceCustomerId:'qa-customer',companyNameEn:'Helvetia Advanced Industrial Procurement Corporation',companyNameAr:'شركة هلفيتيا المتقدمة للمشتريات الصناعية',contactPerson:'Nadia Al Mansoori',addressEn:'International Commerce Centre, Building 14, Logistics District, Jebel Ali Free Zone',addressAr:'مركز التجارة الدولي، المبنى 14، المنطقة اللوجستية، المنطقة الحرة بجبل علي',city:'Dubai',country:'United Arab Emirates',phone:'+971 4 555 0188',email:'procurement@helvetia-industrial.example',vatTaxNumber:'100498273600003',commercialRegistration:'DMCC-884731'},
  companySnapshot:{nameEn:'LOUREX International Trading & Industrial Solutions FZ-LLC',nameAr:'لوركس للتجارة الدولية والحلول الصناعية ذ.م.م',logoDataUrl:logo,addressEn:'Office 1804, Emirates Financial Tower, International Financial District',addressAr:'مكتب 1804، برج الإمارات المالي، الحي المالي الدولي',city:'Dubai',country:'United Arab Emirates',phone:'+971 4 555 0142',email:'commercial@lou-rex.com',website:'www.lou-rex.com',vatNumber:'100352948700003',taxNumber:'TRN-100352948700003',commercialRegistration:'CN-4982741',bank:{bankName:'Emirates International Commercial Bank',accountName:'LOUREX International Trading FZ-LLC',iban:'AE07 0331 0000 1839 2746 501',swift:'EICBAEADXXX',currency:'USD'},signatureDataUrl:signature,stampDataUrl:stamp,footerText:'LOUREX International Trading — Commercial Documents Department'},
  items,
  terms:{incoterm:'CIF Jebel Ali — Incoterms® 2020',paymentTerms:'30% advance, 70% against shipping documents',packing:'Seaworthy export packing with fumigated pallets',deliveryTime:'6–8 weeks from receipt of advance payment',portOfLoading:'Hamburg, Germany',finalDestination:'Jebel Ali Port, Dubai, UAE',countryOfOrigin:'Germany / European Union',validity:'21 calendar days from issue date',remarks:'Subject to final technical approval and vessel availability.'},
  adjustments:{discountEnabled:true,discountMode:'percent',discountValue:'3.5',shippingEnabled:true,shipping:'2650',otherChargesEnabled:true,otherCharges:'480',taxEnabled:true,taxPercent:'5'},internalCosts:{shippingCost:'0',otherCost:'0'},
  appearance:{templateId:template,paletteMode:'auto',accentColor:'#b08a4b',latinFont:'inter',arabicFont:'auto',showBank:true,showSignature:true,showStamp:true,showHsCode:true,showOrigin:true,showPacking:true},
  notes:'Please reference the document number on all correspondence. Certificates of origin, inspection records, and final packing lists will accompany the shipping documents.',convertedFromId:'',createdAt:'2026-09-03T09:00:00.000Z',updatedAt:'2026-09-03T09:00:00.000Z'
};

try{
  const rendered=React.createElement(TemplateRenderer,{document:documentData,scale,compact:false});
  const shell=React.createElement('div',{className:`qa-shell editor-screen ${mode==='mobile'?'mobile-preview-open':''}`},
    React.createElement('div',{className:'qa-caption'},React.createElement('span',null,`${template.toUpperCase()} · ${language.toUpperCase()} · ${count} items`),React.createElement('span',null,mode.toUpperCase())),
    React.createElement('div',{className:`qa-stage preview-stage ${mode==='mobile'?'mobile-preview-stage':''} mode-${mode}`},rendered)
  );
  ReactDOM.render(shell,document.getElementById('root'));
  document.documentElement.dataset.ready='true';
}catch(error){
  const pre=document.createElement('pre');pre.className='qa-error';pre.textContent=error?.stack||String(error);document.getElementById('root').append(pre);document.documentElement.dataset.ready='error';
}
