import { TemplateRenderer } from '../../dist/src/templates/TemplateRenderer.js';

const logoDataUrl='data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22160%22%20height=%2260%22%20viewBox=%220%200%20160%2060%22%3E%3Crect%20width=%22160%22%20height=%2260%22%20rx=%228%22%20fill=%22%23111111%22/%3E%3Ctext%20x=%2280%22%20y=%2237%22%20text-anchor=%22middle%22%20font-family=%22Arial%22%20font-size=%2224%22%20font-weight=%22700%22%20fill=%22%23c79b49%22%3ELOUREX%3C/text%3E%3C/svg%3E';
const items=[
  {id:'item-1',descriptionEn:'Monster 500 ml *24',descriptionAr:'مونستر 500 مل * 24',hsCode:'',origin:'South Africa',packing:'24 x 500 ml / Carton',quantity:'2000',unit:'Carton',unitPrice:'23',unitCost:'0'},
  {id:'item-2',descriptionEn:'Redbull classic',descriptionAr:'ريدبول كلاسيك',hsCode:'',origin:'South Africa',packing:'24 x 500 ml / Carton',quantity:'3800',unit:'Carton',unitPrice:'23.5',unitCost:'0'},
  {id:'item-3',descriptionEn:'Eti popkek 60 gr*24',descriptionAr:'إيتي بوب كيك',hsCode:'',origin:'Türkiye',packing:'24 PCS / Carton',quantity:'6800',unit:'Carton',unitPrice:'9.5',unitCost:'0'}
];

const documentData={
  id:'v542-quotation',kind:'proforma',role:'standard',status:'final',lifecycleStatus:'active',revision:2,creditForId:'',creditForNumber:'',voidedAt:'',voidReason:'',bankAccountId:'',paymentTermPresetId:'',number:'QUO-2026-0046',issueDate:'2026-10-04',dueDate:'2026-10-11',currency:'USD',language:'bilingual',
  customerSnapshot:{sourceCustomerId:'customer',companyNameEn:'Customer',companyNameAr:'العميل',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''},
  companySnapshot:{nameEn:'LOUREX',nameAr:'لوركس',logoDataUrl,addressEn:'Istanbul, Turkey',addressAr:'تركيا إسطنبول',city:'Istanbul',country:'Turkey',phone:'',email:'00905392411642 · lourexr@proton.me',website:'www.lou-rex.com',vatNumber:'',taxNumber:'',commercialRegistration:'',bank:{bankName:'',accountName:'',iban:'',swift:'',currency:'USD'},signatureDataUrl:'',stampDataUrl:'',footerText:'LOUREX - Import - Export - International Trade'},
  items,
  terms:{incoterm:'CIF',paymentTerms:'30% Advance / 70% Before Shipment',packing:'Export cartons on pallets',deliveryTime:'30 Days',portOfLoading:'Jeddah / supplier nominated port',finalDestination:'Amman',countryOfOrigin:'Mixed origins as stated per line item',validity:'Fresh',remarks:''},
  adjustments:{discountEnabled:false,discountMode:'percent',discountValue:'0',shippingEnabled:false,shipping:'0',otherChargesEnabled:false,otherCharges:'0',taxEnabled:false,taxPercent:'0'},
  internalCosts:{shippingCost:'0',otherCost:'0'},
  appearance:{templateId:'blackivory',paletteMode:'auto',accentColor:'#c79b49',headingTextColor:'',primaryTextColor:'',secondaryTextColor:'',textScale:'normal',documentTitleScale:'normal',sectionHeadingScale:'normal',bodyTextScale:'normal',tableTextScale:'normal',latinFont:'auto',arabicFont:'cairo',showBank:false,showSignature:false,showStamp:false,showHsCode:false,showOrigin:true,showPacking:true,watermark:{enabled:true,type:'logo',text:'',pattern:'repeat',opacity:.05,angle:-25,color:'#c79b49',size:72}},
  notes:'',convertedFromId:'',createdAt:'2026-10-04T10:00:00.000Z',updatedAt:'2026-10-04T10:00:00.000Z'
};

const preview=React.createElement('div',{className:'mobile-preview-stage'},React.createElement(TemplateRenderer,{document:documentData,scale:.48,compact:false}));
const output=React.createElement('div',{className:'print-portal'},React.createElement(TemplateRenderer,{document:documentData,scale:1,compact:false}));
const shell=React.createElement('div',{className:'app-ui qa-phone editor-screen mobile-preview-open'},preview,output);
ReactDOM.render(shell,document.getElementById('root'));
document.documentElement.dataset.ready='true';
