import type { PresetChoice } from './product-presets.js';

const INCOTERMS=['EXW','FCA','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'];

const PAYMENT_TERMS:Array<{value:string;en:string;ar:string}>=[
  {value:'100% Advance',en:'100% Advance',ar:'100% دفعة مقدمة'},
  {value:'Before Shipment',en:'Before Shipment',ar:'قبل الشحن'},
  {value:'50% Advance / 50% Before Shipment',en:'50% Advance / 50% Before Shipment',ar:'50% مقدم / 50% قبل الشحن'},
  {value:'30% Advance / 70% Before Shipment',en:'30% Advance / 70% Before Shipment',ar:'30% مقدم / 70% قبل الشحن'},
  {value:'Cash Against Documents (CAD)',en:'Cash Against Documents (CAD)',ar:'الدفع مقابل المستندات (CAD)'},
  {value:'L/C at Sight',en:'L/C at Sight',ar:'اعتماد مستندي عند الاطلاع'},
  {value:'Net 7 Days',en:'Net 7 days',ar:'أجل 7 أيام'},
  {value:'Net 15 Days',en:'Net 15 days',ar:'أجل 15 يومًا'},
  {value:'Net 30 Days',en:'Net 30 days',ar:'أجل 30 يومًا'},
  {value:'Net 45 Days',en:'Net 45 days',ar:'أجل 45 يومًا'},
  {value:'Net 60 Days',en:'Net 60 days',ar:'أجل 60 يومًا'},
  {value:'Cash on Delivery',en:'Cash on Delivery',ar:'الدفع عند التسليم'}
];

const DELIVERY_TERMS:Array<{value:string;en:string;ar:string}>=[
  {value:'Ready Stock',en:'Ready stock',ar:'متوفر وجاهز'},
  {value:'Immediate',en:'Immediate',ar:'فوري'},
  {value:'3 Days',en:'3 days',ar:'3 أيام'},
  {value:'5 Days',en:'5 days',ar:'5 أيام'},
  {value:'7 Days',en:'7 days',ar:'7 أيام'},
  {value:'10 Days',en:'10 days',ar:'10 أيام'},
  {value:'15 Days',en:'15 days',ar:'15 يومًا'},
  {value:'20 Days',en:'20 days',ar:'20 يومًا'},
  {value:'30 Days',en:'30 days',ar:'30 يومًا'},
  {value:'45 Days',en:'45 days',ar:'45 يومًا'},
  {value:'60 Days',en:'60 days',ar:'60 يومًا'},
  {value:'4–6 Weeks',en:'4–6 weeks',ar:'4–6 أسابيع'},
  {value:'6–8 Weeks',en:'6–8 weeks',ar:'6–8 أسابيع'}
];

export function incotermChoices(_arabic:boolean):PresetChoice[]{
  return INCOTERMS.map(value=>({value,label:value}));
}

export function paymentTermChoices(arabic:boolean):PresetChoice[]{
  return PAYMENT_TERMS.map(item=>({value:item.value,label:arabic?`${item.ar} — ${item.value}`:item.en}));
}

export function deliveryTimeChoices(arabic:boolean):PresetChoice[]{
  return DELIVERY_TERMS.map(item=>({value:item.value,label:arabic?`${item.ar} — ${item.value}`:item.en}));
}
