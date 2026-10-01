;(function(){
  'use strict';

  var FIREBASE_CONFIG={apiKey:'AIzaSyAgakNDqcKlyAFiOyfm1ebA8PB-_HKM-go',authDomain:'lourex-invoice.firebaseapp.com',projectId:'lourex-invoice',storageBucket:'lourex-invoice.firebasestorage.app',messagingSenderId:'985119320046',appId:'1:985119320046:web:58798f19ad368a178510ff'};
  var TOKEN_RE=/^[A-Za-z0-9_-]{32}$/;
  var state={ref:null,data:null,snapshot:null,language:'en',busy:false};
  var byId=function(id){return document.getElementById(id);};
  var loading=byId('loading-state'),unavailable=byId('unavailable-state'),view=byId('document-view'),toast=byId('toast');

  function setText(id,value){var node=byId(id);if(node)node.textContent=String(value==null?'':value);}
  function appendText(parent,text,tag,className){var node=document.createElement(tag||'span');if(className)node.className=className;node.textContent=String(text==null?'':text);parent.appendChild(node);return node;}
  function clear(node){while(node&&node.firstChild)node.removeChild(node.firstChild);}
  function langText(en,ar){return state.language==='ar'?(ar||en):(en||ar);}
  function bilingual(en,ar){en=String(en||'').trim();ar=String(ar||'').trim();if(state.snapshot&&state.snapshot.language==='bilingual'&&en&&ar&&en!==ar)return en+' / '+ar;return langText(en,ar)||'—';}
  function money(value,currency){var number=Number(value);if(!Number.isFinite(number))return String(value||'—')+' '+String(currency||'');try{return new Intl.NumberFormat(state.language==='ar'?'ar-SA':'en-US',{style:'currency',currency:String(currency||'USD'),minimumFractionDigits:2,maximumFractionDigits:2}).format(number);}catch{return Number(number).toFixed(2)+' '+String(currency||'');}}
  function dateLabel(value){if(!value)return'—';var d=new Date(String(value)+'T00:00:00');if(Number.isNaN(d.getTime()))return String(value);try{return new Intl.DateTimeFormat(state.language==='ar'?'ar-SA':'en-US',{year:'numeric',month:'short',day:'numeric'}).format(d);}catch{return String(value);}}
  function timestampDate(value){try{return value&&typeof value.toDate==='function'?value.toDate():null;}catch{return null;}}
  function kindLabel(kind){var labels={proforma:['Quotation','عرض سعر'],'proforma-invoice':['Proforma Invoice','فاتورة أولية'],invoice:['Commercial Invoice','فاتورة تجارية'],'delivery-note':['Delivery Note','إشعار تسليم'],'payment-receipt':['Payment Receipt','إيصال دفع']};var pair=labels[kind]||['Document','مستند'];return langText(pair[0],pair[1]);}
  function showToast(message){toast.textContent=String(message||'');toast.hidden=false;window.clearTimeout(showToast.timer);showToast.timer=window.setTimeout(function(){toast.hidden=true;},3200);}
  function showUnavailable(){loading.hidden=true;view.hidden=true;unavailable.hidden=false;document.title='LOUREX Secure Share — Unavailable';}
  function activeResponse(status){return status!=='accepted'&&status!=='rejected';}

  function localizedLabels(){
    var ar=state.language==='ar';
    document.documentElement.lang=ar?'ar':'en';document.documentElement.dir=ar?'rtl':'ltr';
    setText('portal-subtitle',langText('Secure customer portal','بوابة العميل الآمنة'));
    setText('security-label',langText('🔒 Capability-protected link','🔒 رابط محمي بصلاحية خاصة'));
    setText('grand-total-label',langText('Grand Total','الإجمالي النهائي'));
    setText('parties-kicker',langText('Parties','الأطراف'));setText('parties-title',langText('Document parties','أطراف المستند'));
    setText('items-kicker',langText('Details','التفاصيل'));setText('items-title',langText('Items','الأصناف'));
    setText('th-item',langText('Item','الصنف'));setText('th-qty',langText('Qty','الكمية'));setText('th-unit',langText('Unit','الوحدة'));setText('th-price',langText('Price','السعر'));setText('th-total',langText('Total','الإجمالي'));
    setText('terms-kicker',langText('Commercial','تجاري'));setText('terms-title',langText('Terms','الشروط'));
    setText('notes-kicker',langText('Notes','ملاحظات'));setText('notes-title',langText('Document notes','ملاحظات المستند'));
    setText('actions-kicker',langText('Actions','الإجراءات'));setText('actions-title',langText('Customer actions','إجراءات العميل'));
    setText('print-btn',langText('Print / Save PDF','طباعة / حفظ PDF'));setText('accept-btn',langText('Accept','قبول'));setText('reject-btn',langText('Reject','رفض'));setText('comment-btn',langText('Send comment','إرسال تعليق'));
    byId('comment-input').placeholder=langText('Add a comment (optional)','أضف تعليقًا (اختياري)');byId('comment-input').setAttribute('aria-label',langText('Customer comment','تعليق العميل'));
    setText('portal-footer',langText('This page shows only the customer-facing snapshot shared by the sender. It does not provide access to the sender’s LOUREX workspace.','تعرض هذه الصفحة فقط النسخة المخصصة للعميل التي شاركها المرسل، ولا تمنح أي وصول إلى مساحة عمل LOUREX الخاصة بالمرسل.'));
  }

  function partyBlock(node,label,name,lines){clear(node);appendText(node,label,'small');appendText(node,name||'—','strong');(lines||[]).filter(Boolean).forEach(function(line){appendText(node,line,'span');});}
  function fact(parent,label,value){if(!value)return;var wrap=document.createElement('div');wrap.className='lx-share-fact';appendText(wrap,label,'small');appendText(wrap,value,'strong');parent.appendChild(wrap);}
  function totalRow(parent,label,value,grand){if(!value||Number(value)===0&&!grand)return;var row=document.createElement('div');row.className='lx-share-total-row'+(grand?' is-grand':'');appendText(row,label,'span');appendText(row,money(value,state.snapshot.currency),'strong');parent.appendChild(row);}

  function renderResponse(){
    var status=String(state.data.responseStatus||'pending'),comment=String(state.data.customerComment||''),box=byId('response-box'),statusNode=byId('response-status'),input=byId('comment-input'),decision=byId('decision-actions'),commentBtn=byId('comment-btn');
    box.hidden=false;statusNode.className='lx-share-response-status'+(status==='accepted'?' is-accepted':status==='rejected'?' is-rejected':'');
    var copy=status==='accepted'?langText('Accepted by customer.','تم القبول من العميل.'):status==='rejected'?langText('Rejected by customer.','تم الرفض من العميل.'):status==='commented'?langText('A customer comment has been sent.','تم إرسال تعليق من العميل.'):langText('No response has been sent yet.','لم يتم إرسال رد بعد.');
    statusNode.textContent=copy;input.value=comment;var open=activeResponse(status);input.disabled=!open;commentBtn.disabled=!open;decision.hidden=!state.snapshot.canRespond;Array.prototype.forEach.call(decision.querySelectorAll('button'),function(button){button.disabled=!open;});
  }

  function renderDocument(){
    var snap=state.snapshot,data=state.data;state.language=snap.language==='ar'?'ar':'en';localizedLabels();
    setText('document-kind',kindLabel(snap.kind));setText('document-number',snap.documentNumber);setText('document-date',dateLabel(snap.issueDate)+(snap.dueDate?' · '+langText('Due ','الاستحقاق ')+dateLabel(snap.dueDate):''));setText('grand-total',money(snap.totals.grandTotal,snap.currency));
    partyBlock(byId('company-party'),langText('From','من'),bilingual(snap.company.nameEn,snap.company.nameAr),[[snap.company.city,snap.company.country].filter(Boolean).join(', '),snap.company.phone,snap.company.email,snap.company.website].filter(Boolean));
    partyBlock(byId('customer-party'),langText('To','إلى'),bilingual(snap.customer.companyNameEn,snap.customer.companyNameAr),[snap.customer.contactPerson,[snap.customer.city,snap.customer.country].filter(Boolean).join(', ')].filter(Boolean));

    var body=byId('items-body');clear(body);snap.items.forEach(function(item){var tr=document.createElement('tr'),name=document.createElement('td'),nameWrap=document.createElement('div');nameWrap.className='lx-share-item-name';appendText(nameWrap,bilingual(item.descriptionEn,item.descriptionAr),'strong');var meta=[item.hsCode&&('HS '+item.hsCode),item.origin,item.packing].filter(Boolean).join(' · ');if(meta)appendText(nameWrap,meta,'small');name.appendChild(nameWrap);tr.appendChild(name);appendText(tr,item.quantity,'td');appendText(tr,item.unit,'td');var price=appendText(tr,money(item.unitPrice,snap.currency),'td','num');price.setAttribute('dir','ltr');var line=appendText(tr,money(item.lineTotal,snap.currency),'td','num');line.setAttribute('dir','ltr');body.appendChild(tr);});
    var totals=byId('totals-list');clear(totals);totalRow(totals,langText('Subtotal','المجموع الفرعي'),snap.totals.subtotal,false);totalRow(totals,langText('Discount','الخصم'),snap.totals.discount,false);totalRow(totals,langText('Shipping','الشحن'),snap.totals.shipping,false);totalRow(totals,langText('Other charges','رسوم أخرى'),snap.totals.other,false);totalRow(totals,langText('Tax / VAT','الضريبة / VAT'),snap.totals.tax,false);totalRow(totals,langText('Grand Total','الإجمالي النهائي'),snap.totals.grandTotal,true);

    var terms=byId('terms-list');clear(terms);fact(terms,langText('Incoterm','الإنكوترم'),snap.terms.incoterm);fact(terms,langText('Payment terms','شروط الدفع'),snap.terms.paymentTerms);fact(terms,langText('Delivery','التسليم'),snap.terms.deliveryTime);fact(terms,langText('Packing','التعبئة'),snap.terms.packing);fact(terms,langText('Port of loading','ميناء التحميل'),snap.terms.portOfLoading);fact(terms,langText('Destination','الوجهة'),snap.terms.finalDestination);fact(terms,langText('Country of origin','بلد المنشأ'),snap.terms.countryOfOrigin);fact(terms,langText('Validity','الصلاحية'),snap.terms.validity);var expiry=timestampDate(data.expiresAt);if(expiry)fact(terms,langText('Secure link valid until','الرابط صالح حتى'),new Intl.DateTimeFormat(state.language==='ar'?'ar-SA':'en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(expiry));
    if(snap.company.bank){fact(terms,langText('Bank','البنك'),snap.company.bank.bankName);fact(terms,'IBAN',snap.company.bank.iban);fact(terms,'SWIFT',snap.company.bank.swift);}
    var notes=String(snap.notes||'').trim()||String(snap.terms.remarks||'').trim();byId('notes-section').hidden=!notes;if(notes)setText('notes-copy',notes);
    renderResponse();loading.hidden=true;unavailable.hidden=true;view.hidden=false;document.title=snap.documentNumber+' — LOUREX Secure Share';
  }

  async function markViewed(){
    if(!state.ref||state.data.viewedAt)return;
    try{await state.ref.update({viewedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});}catch(error){/* Viewing remains available if the first-view audit write races another viewer. */}
  }

  async function submitResponse(status){
    if(state.busy||!state.ref||!activeResponse(String(state.data.responseStatus||'pending')))return;
    var comment=String(byId('comment-input').value||'').trim();if(comment.length>2000){showToast(langText('Comment is too long.','التعليق طويل جدًا.'));return;}if(status==='commented'&&!comment){showToast(langText('Write a comment first.','اكتب تعليقًا أولًا.'));return;}
    if((status==='accepted'||status==='rejected')&&!state.snapshot.canRespond)return;
    state.busy=true;Array.prototype.forEach.call(byId('response-box').querySelectorAll('button,textarea'),function(node){node.disabled=true;});
    try{
      await state.ref.update({responseStatus:status,customerComment:comment,respondedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      var fresh=await state.ref.get();if(!fresh.exists)throw new Error('Share unavailable');state.data=fresh.data();renderResponse();showToast(status==='accepted'?langText('Acceptance sent.','تم إرسال القبول.'):status==='rejected'?langText('Rejection sent.','تم إرسال الرفض.'):langText('Comment sent.','تم إرسال التعليق.'));
    }catch(error){showToast(langText('This secure link is no longer available for responses.','لم يعد هذا الرابط الآمن متاحًا للردود.'));}
    finally{state.busy=false;renderResponse();}
  }

  async function start(){
    var token=String(location.hash||'').slice(1).trim();if(!TOKEN_RE.test(token)){showUnavailable();return;}
    try{
      if(typeof firebase==='undefined'||typeof firebase.initializeApp!=='function'||typeof firebase.firestore!=='function')throw new Error('Firebase runtime unavailable');
      if(!firebase.apps||!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);
      state.ref=firebase.firestore().collection('secureShares').doc(token);var doc=await state.ref.get();if(!doc.exists){showUnavailable();return;}var data=doc.data();if(!data||data.format!=='LOUREX_SECURE_SHARE_V1'||data.version!==1||!data.snapshot||data.snapshot.version!==1){showUnavailable();return;}
      state.data=data;state.snapshot=data.snapshot;renderDocument();await markViewed();
    }catch(error){showUnavailable();}
  }

  byId('print-btn').addEventListener('click',function(){window.print();});
  byId('accept-btn').addEventListener('click',function(){void submitResponse('accepted');});
  byId('reject-btn').addEventListener('click',function(){void submitResponse('rejected');});
  byId('comment-btn').addEventListener('click',function(){void submitResponse('commented');});
  void start();
})();
