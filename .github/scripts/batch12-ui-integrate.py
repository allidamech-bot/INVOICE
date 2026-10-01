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
"this.setState({loading:false,firstRun:false,unlocked:true,key:resumed.key,vault,screen:'home',editorDoc:null,uiLanguage,publicLogo,cloudUser:null,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:''},()=>{this.resetAutoLock();void this.initializeConfiguredCloud();void this.processDueRecurringWorkflows(false);});")
replace(path,
"this.setState({unlocked:true,key:result.key,vault,screen:'home',editorDoc:null},()=>{this.resetAutoLock();this.scheduleCloudSync(220);});",
"this.setState({unlocked:true,key:result.key,vault,screen:'home',editorDoc:null},()=>{this.resetAutoLock();this.scheduleCloudSync(220);void this.processDueRecurringWorkflows(false);});")
replace(path,
"  private generateRecurringWorkflow=async(workflow:RecurringWorkflowRecord)=>{",
"  private generateRecurringWorkflow=async(workflow:RecurringWorkflowRecord,notify=true)=>{")
replace(path,
"this.showToast(t(`Recurring draft ${draft.number}.`,`تم إنشاء المسودة المتكررة ${draft.number}.`),'success');return;}",
"this.showToast(t(`Recurring draft ${draft.number}.`,`تم إنشاء المسودة المتكررة ${draft.number}.`),'success');return;}",0)
# Suppress the two existing success toasts during automatic catch-up while keeping manual feedback.
p=Path(path);text=p.read_text()
text=text.replace("this.showToast(t(`Recurring draft ${draft.number} created.`,`تم إنشاء المسودة المتكررة ${draft.number}.`),'success');return;}","if(notify)this.showToast(t(`Recurring draft ${draft.number} created.`,`تم إنشاء المسودة المتكررة ${draft.number}.`),'success');return;}")
text=text.replace("this.showToast(t(`Recurring purchase draft ${draft.number} created.`,`تم إنشاء مسودة الشراء المتكررة ${draft.number}.`),'success');};","if(notify)this.showToast(t(`Recurring purchase draft ${draft.number} created.`,`تم إنشاء مسودة الشراء المتكررة ${draft.number}.`),'success');};")
anchor="  private openRecurringGenerated=(target:RecurringTarget,id:string)=>{"
method="""  private processDueRecurringWorkflows=async(notify=true):Promise<number>=>{if(this.recurringProcessRunning||!this.state.unlocked||!this.state.vault)return 0;this.recurringProcessRunning=true;let generated=0;try{for(let guard=0;guard<24;guard+=1){const due=this.requireVault().recurringWorkflows.filter(item=>recurringWorkflowDue(item)).sort((a,b)=>a.nextRunDate.localeCompare(b.nextRunDate))[0];if(!due)break;await this.generateRecurringWorkflow(due,false);generated+=1;}if(notify&&generated)this.showToast(t(`${generated} recurring draft${generated===1?'':'s'} created for review.`,`تم إنشاء ${generated} مسودة متكررة للمراجعة.`),'success');return generated;}catch(error){if(notify)this.showToast(error instanceof Error?error.message:t('Unable to generate recurring drafts.','تعذر إنشاء المسودات المتكررة.'),'error');return generated;}finally{this.recurringProcessRunning=false;}};
"""
text=text.replace(anchor,method+anchor)
p.write_text(text)
