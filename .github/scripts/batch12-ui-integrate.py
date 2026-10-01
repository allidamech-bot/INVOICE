from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1):
    p=Path(path);text=p.read_text();found=text.count(old)
    if found!=count: raise SystemExit(f'{path}: expected {count} anchors, found {found}: {old[:120]!r}')
    p.write_text(text.replace(old,new))

path='src/app/App.tsx'
replace(path,
"  private accountTransitionRunning=false;",
"  private accountTransitionRunning=false;\n  private recurringProcessRunning=false;")
replace(path,
"this.setState({loading:false,firstRun:false,unlocked:true,key:resumed.key,vault,screen:'home',editorDoc:null,uiLanguage,publicLogo,cloudUser:null,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:''},()=>{this.resetAutoLock();void this.initializeConfiguredCloud();});",
"this.setState({loading:false,firstRun:false,unlocked:true,key:resumed.key,vault,screen:'home',editorDoc:null,uiLanguage,publicLogo,cloudUser:null,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:''},()=>{this.resetAutoLock();void this.initializeConfiguredCloud();void this.processDueRecurringWorkflows(true);});")
replace(path,
"this.setState({unlocked:true,key:result.key,vault,screen:'home',editorDoc:null},()=>{this.resetAutoLock();this.scheduleCloudSync(220);});",
"this.setState({unlocked:true,key:result.key,vault,screen:'home',editorDoc:null},()=>{this.resetAutoLock();this.scheduleCloudSync(220);void this.processDueRecurringWorkflows(true);});")
replace(path,
"  private generateRecurringWorkflow=async(workflow:RecurringWorkflowRecord)=>{",
"  private generateRecurringWorkflow=async(workflow:RecurringWorkflowRecord,notify=true)=>{")
p=Path(path);text=p.read_text()
old="this.showToast(t(`Recurring draft ${draft.number} created.`,`تم إنشاء المسودة المتكررة ${draft.number}.`),'success');return;}"
if text.count(old)!=1: raise SystemExit('document recurring toast anchor missing')
text=text.replace(old,"if(notify)this.showToast(t(`Recurring draft ${draft.number} created.`,`تم إنشاء المسودة المتكررة ${draft.number}.`),'success');return;}")
old="this.showToast(t(`Recurring purchase draft ${draft.number} created.`,`تم إنشاء مسودة الشراء المتكررة ${draft.number}.`),'success');};"
if text.count(old)!=1: raise SystemExit('purchase recurring toast anchor missing')
text=text.replace(old,"if(notify)this.showToast(t(`Recurring purchase draft ${draft.number} created.`,`تم إنشاء مسودة الشراء المتكررة ${draft.number}.`),'success');};")
anchor="  private openRecurringGenerated=(target:RecurringTarget,id:string)=>{"
if text.count(anchor)!=1: raise SystemExit('open generated anchor missing')
method="""  private processDueRecurringWorkflows=async(notify=true):Promise<number>=>{if(this.recurringProcessRunning||!this.state.unlocked||!this.state.vault)return 0;this.recurringProcessRunning=true;let generated=0;try{for(let guard=0;guard<24;guard+=1){const due=this.requireVault().recurringWorkflows.filter(item=>recurringWorkflowDue(item)).sort((a,b)=>a.nextRunDate.localeCompare(b.nextRunDate))[0];if(!due)break;await this.generateRecurringWorkflow(due,false);generated+=1;}if(notify&&generated)this.showToast(t(`${generated} recurring draft${generated===1?'':'s'} created for review.`,`تم إنشاء ${generated} مسودة متكررة للمراجعة.`),'success');return generated;}catch(error){if(notify)this.showToast(error instanceof Error?error.message:t('Unable to generate recurring drafts.','تعذر إنشاء المسودات المتكررة.'),'error');return generated;}finally{this.recurringProcessRunning=false;}};
"""
text=text.replace(anchor,method+anchor)
p.write_text(text)
