from pathlib import Path

# 1) App: editor navigation must go through the editor's save-and-close path.
p=Path('src/app/App.tsx'); s=p.read_text()
old="const navigate=(screen:'home'|'documents'|'customers'|'receivables'|'reports'|'items'|'operations')=>{if(screen===this.state.screen)return;if(!confirmWorkspaceDeparture())return;this.setState({screen,editorDoc:null,newMenu:false});};"
new="const navigate=(screen:'home'|'documents'|'customers'|'receivables'|'reports'|'items'|'operations')=>{if(screen===this.state.screen)return;if(this.state.screen==='editor'){this.showToast(t('Save and close the document with Back before navigating away.','احفظ وأغلق المستند بزر الرجوع قبل الانتقال إلى قسم آخر.'),'error');return;}if(!confirmWorkspaceDeparture())return;this.setState({screen,editorDoc:null,newMenu:false});};"
if old not in s: raise SystemExit('App navigate anchor missing')
p.write_text(s.replace(old,new,1))

# 2) Runtime mutation bridge: keep App.editorDoc aligned with the mutated vault.
p=Path('src/app/index.tsx'); s=p.read_text()
old="""        const next=mutation(latest);
        const encrypted=await saveVault(key,next);
        instance.latestEncryptedVault=encrypted;
        if(instance.state.unlocked&&instance.state.key===key)await new Promise<void>(resolve=>instance.setState({vault:next},resolve));
        instance.scheduleCloudSync();
        return next;"""
new="""        const next=mutation(latest);
        const encrypted=await saveVault(key,next);
        instance.latestEncryptedVault=encrypted;
        if(instance.state.unlocked&&instance.state.key===key){
          const currentEditor=instance.state.editorDoc;
          const refreshedEditor=currentEditor?next.documents.find((doc:any)=>doc.id===currentEditor.id):null;
          await new Promise<void>(resolve=>instance.setState(refreshedEditor?{vault:next,editorDoc:structuredClone(refreshedEditor)}:{vault:next},resolve));
        }
        instance.scheduleCloudSync();
        return next;"""
if old not in s: raise SystemExit('mutation bridge anchor missing')
p.write_text(s.replace(old,new,1))

# 3) Editor core: accept explicit, approved AI updates without a page reload.
p=Path('src/components/EditorPageCore.tsx'); s=p.read_text()
old="""  componentDidMount():void{
    document.addEventListener('visibilitychange',this.handleVisibilityChange);
    window.addEventListener('beforeunload',this.handleBeforeUnload);
    window.addEventListener('pagehide',this.handlePageHide);"""
new="""  componentDidMount():void{
    document.addEventListener('visibilitychange',this.handleVisibilityChange);
    window.addEventListener('beforeunload',this.handleBeforeUnload);
    window.addEventListener('pagehide',this.handlePageHide);
    window.addEventListener('lourex-ai-document-updated',this.handleAiDocumentUpdated as EventListener);"""
if old not in s: raise SystemExit('Editor mount anchor missing')
s=s.replace(old,new,1)
old="""  componentWillUnmount():void{this.flushPendingSnapshot();if(this.autosaveTimer)clearTimeout(this.autosaveTimer);if(this.previewTimer)clearTimeout(this.previewTimer);this.previewMedia?.removeEventListener?.('change',this.handlePreviewMedia);document.removeEventListener('visibilitychange',this.handleVisibilityChange);window.removeEventListener('beforeunload',this.handleBeforeUnload);window.removeEventListener('pagehide',this.handlePageHide);}"""
new="""  componentWillUnmount():void{this.flushPendingSnapshot();if(this.autosaveTimer)clearTimeout(this.autosaveTimer);if(this.previewTimer)clearTimeout(this.previewTimer);this.previewMedia?.removeEventListener?.('change',this.handlePreviewMedia);document.removeEventListener('visibilitychange',this.handleVisibilityChange);window.removeEventListener('beforeunload',this.handleBeforeUnload);window.removeEventListener('pagehide',this.handlePageHide);window.removeEventListener('lourex-ai-document-updated',this.handleAiDocumentUpdated as EventListener);}"""
if old not in s: raise SystemExit('Editor unmount anchor missing')
s=s.replace(old,new,1)
anchor="  private handlePreviewMedia=(event:MediaQueryListEvent)=>this.setState(state=>({desktopPreview:event.matches,previewDoc:event.matches?structuredClone(state.doc):state.previewDoc}));\n"
insert="""  private handlePreviewMedia=(event:MediaQueryListEvent)=>this.setState(state=>({desktopPreview:event.matches,previewDoc:event.matches?structuredClone(state.doc):state.previewDoc}));
  private handleAiDocumentUpdated=(event:Event)=>{
    const updated=(event as CustomEvent<LourexDocument>).detail;
    if(!updated||updated.id!==this.state.doc.id||this.state.doc.status==='final')return;
    if(this.autosaveTimer)window.clearTimeout(this.autosaveTimer);
    if(this.previewTimer)window.clearTimeout(this.previewTimer);
    this.departureFlushQueued=false;
    this.editRevision+=1;
    const doc=structuredClone(updated);
    this.setState({doc,previewDoc:structuredClone(doc),saving:false,saveState:'saved',errors:{}});
  };
"""
if anchor not in s: raise SystemExit('Editor AI handler insertion anchor missing')
s=s.replace(anchor,insert,1)
p.write_text(s)

# 4) AI: PO is a first-class active document; approved mutations no longer reload.
p=Path('src/components/AiCopilot.tsx'); s=p.read_text()
old="interface DraftActiveDocument {id:string;number:string;kind:'proforma'|'invoice';status:'draft'|'final';currency:string;language:DocumentLanguage;customerName:string;items:DraftActiveItem[];terms:{incoterm:string;paymentTerms:string;packing:string;deliveryTime:string;portOfLoading:string;finalDestination:string;countryOfOrigin:string;validity:string;remarks:string};notes:string;}"
new="interface DraftActiveDocument {id:string;number:string;kind:'proforma'|'invoice'|'purchase-order';status:'draft'|'final';currency:string;language:DocumentLanguage;customerName:string;supplierName:string;items:DraftActiveItem[];terms:{incoterm:string;paymentTerms:string;packing:string;deliveryTime:string;portOfLoading:string;finalDestination:string;countryOfOrigin:string;validity:string;remarks:string};notes:string;}"
if old not in s: raise SystemExit('AI active document interface anchor missing')
s=s.replace(old,new,1)
old="const active=activeDocument&&activeDocument.kind!=='purchase-order'&&activeDocument.kind!=='draft'?{id:activeDocument.id,number:activeDocument.number,kind:activeDocument.kind,status:activeDocument.status,currency:activeDocument.currency,language:activeDocument.language,customerName:activeDocument.customerSnapshot?.companyNameEn||activeDocument.customerSnapshot?.companyNameAr||'',items:activeDocument.items.slice(0,40).map(item=>({id:item.id,descriptionEn:item.descriptionEn,descriptionAr:item.descriptionAr,quantity:item.quantity,unit:item.unit,unitPrice:item.unitPrice,hsCode:item.hsCode,origin:item.origin,packing:item.packing})),terms:{incoterm:activeDocument.terms.incoterm,paymentTerms:activeDocument.terms.paymentTerms,packing:activeDocument.terms.packing,deliveryTime:activeDocument.terms.deliveryTime,portOfLoading:activeDocument.terms.portOfLoading,finalDestination:activeDocument.terms.finalDestination,countryOfOrigin:activeDocument.terms.countryOfOrigin,validity:activeDocument.terms.validity,remarks:activeDocument.terms.remarks},notes:activeDocument.notes}:null;"
new="const active=activeDocument&&activeDocument.kind!=='draft'?{id:activeDocument.id,number:activeDocument.number,kind:activeDocument.kind,status:activeDocument.status,currency:activeDocument.currency,language:activeDocument.language,customerName:activeDocument.kind==='purchase-order'?'':activeDocument.customerSnapshot?.companyNameEn||activeDocument.customerSnapshot?.companyNameAr||'',supplierName:activeDocument.kind==='purchase-order'?(activeDocument.supplierSnapshot?.nameEn||activeDocument.supplierSnapshot?.nameAr||''):'',items:activeDocument.items.slice(0,40).map(item=>({id:item.id,descriptionEn:item.descriptionEn,descriptionAr:item.descriptionAr,quantity:item.quantity,unit:item.unit,unitPrice:item.unitPrice,hsCode:item.hsCode,origin:item.origin,packing:item.packing})),terms:{incoterm:activeDocument.terms.incoterm,paymentTerms:activeDocument.terms.paymentTerms,packing:activeDocument.terms.packing,deliveryTime:activeDocument.terms.deliveryTime,portOfLoading:activeDocument.terms.portOfLoading,finalDestination:activeDocument.terms.finalDestination,countryOfOrigin:activeDocument.terms.countryOfOrigin,validity:activeDocument.terms.validity,remarks:activeDocument.terms.remarks},notes:activeDocument.notes}:null;"
if old not in s: raise SystemExit('AI active context anchor missing')
s=s.replace(old,new,1)
# Remove reload after item mutation and draft creation.
old="});window.location.reload();\n  };\n  private documentLine="
new="});\n  };\n  private documentLine="
if old not in s: raise SystemExit('AI item reload anchor missing')
s=s.replace(old,new,1)
old="});window.location.reload();\n  };\n  private executeDocumentUpdateProposal="
new="});\n  };\n  private executeDocumentUpdateProposal="
if old not in s: raise SystemExit('AI create reload anchor missing')
s=s.replace(old,new,1)
# Capture updated vault and notify the live editor after an approved document edit.
old="  private executeDocumentUpdateProposal=async(proposal:AiDocumentUpdateProposal)=>{\n    await mutateVaultSafely(vault=>"
new="  private executeDocumentUpdateProposal=async(proposal:AiDocumentUpdateProposal)=>{\n    const next=await mutateVaultSafely(vault=>"
if old not in s: raise SystemExit('AI update method head missing')
s=s.replace(old,new,1)
old="return{...vault,documents};});window.location.reload();\n  };"
new="return{...vault,documents};});const updated=next.documents.find(doc=>doc.id===proposal.documentId);if(updated)window.dispatchEvent(new CustomEvent('lourex-ai-document-updated',{detail:structuredClone(updated)}));\n  };"
if old not in s: raise SystemExit('AI update reload tail missing')
s=s.replace(old,new,1)
# Reload used to clear busy/proposal. Do that explicitly now.
old="else if(proposal.capability==='document.updateDraft')await this.executeDocumentUpdateProposal(proposal);else await this.executeItemProposal(proposal);}catch(error)"
new="else if(proposal.capability==='document.updateDraft')await this.executeDocumentUpdateProposal(proposal);else await this.executeItemProposal(proposal);this.setState({busy:false,proposal:null});}catch(error)"
if old not in s: raise SystemExit('AI approve success anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

print('v311 AI/editor coherence patch applied')
