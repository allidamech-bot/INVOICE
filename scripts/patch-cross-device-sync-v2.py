from pathlib import Path
import re

app_path=Path('src/app/App.tsx')
app=app_path.read_text()

old="""      if(configured){
        const resumed=await resumeVaultSession();
        if(resumed){"""
new="""      if(configured){
        const resumed=await resumeVaultSession();
        let configuredCloudUser:CloudUser|null=null;
        try{configuredCloudUser=await waitForCloudUser();}catch{}
        if(!configuredCloudUser){
          setUiLanguage(uiLanguage);
          this.setState({loading:false,firstRun:false,unlocked:false,key:null,vault:null,uiLanguage,publicLogo,cloudUser:null,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:t('Sign in to continue syncing this device.','سجّل الدخول لمتابعة مزامنة هذا الجهاز.')});
          return;
        }
        if(resumed){"""
if old not in app: raise SystemExit('configured init anchor not found')
app=app.replace(old,new,1)
app=app.replace("cloudUser:null,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:''},()=>{this.resetAutoLock();void this.initializeConfiguredCloud();});","cloudUser:configuredCloudUser,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:''},()=>{this.resetAutoLock();void this.initializeConfiguredCloud();});",1)
app=app.replace("cloudUser:null,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:''},()=>void this.initializeConfiguredCloud());","cloudUser:configuredCloudUser,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:''},()=>void this.initializeConfiguredCloud());",1)

pattern=r"\s*if\(!linked\)\{\n\s*const remote=await getCloudVaultMeta\(cloudUser\.uid\);\n\s*if\(remote\)\{this\.setState\(\{cloudUser,cloudLinked:false,cloudSyncState:'error',cloudSyncMessage:t\('This cloud account already contains LOUREX data\.[\s\S]*?\}\);return;\}\n\s*await putCloudAccount\(cloudUser\.uid,cloudUser\.email\);\n\s*\}"
app,count=re.subn(pattern,"\n      if(!linked){await putCloudAccount(cloudUser.uid,cloudUser.email);}",app,count=1)
if count!=1: raise SystemExit('configured relink blocker not found')

old="private attachCloudUser=async(user:CloudUser)=>{const [linked,configured]=await Promise.all([getCloudAccount(),hasSecurity()]);"
if old not in app: raise SystemExit('attachCloudUser anchor not found')
app=app.replace(old,"private attachCloudUser=async(user:CloudUser)=>{const linked=await getCloudAccount();",1)
old_block="if(!linked&&configured){const remote=await getCloudVaultMeta(user.uid);if(remote){await signOutCloudUser();this.setState({cloudUser:null,cloudLinked:false});throw new Error(t('This cloud account already contains LOUREX data. Use an empty device to restore it, or sign in with the account originally linked to this device.','هذا الحساب السحابي يحتوي بالفعل على بيانات LOUREX. استخدم جهازًا فارغًا لاستعادتها أو سجّل بالحساب المرتبط أصلًا بهذا الجهاز.'));}}"
if old_block not in app: raise SystemExit('attachCloudUser remote blocker not found')
app=app.replace(old_block,"",1)

start=app.index('  private cloudSyncNow=async()=>{')
end=app.index('\n\n  private finishSetup=',start)
replacement="""  private cloudSyncNow=async()=>{
    this.editorMustBeClosed('syncing from the cloud','المزامنة من السحابة');
    if(this.cloudTimer){window.clearTimeout(this.cloudTimer);this.cloudTimer=undefined;}
    await this.drainVaultWrites();await this.waitForCloudIdle();
    const user=this.state.cloudUser;
    if(!user)throw new Error(t('Sign in to LOUREX Cloud first.','سجّل الدخول إلى سحابة LOUREX أولًا.'));
    const linked=await getCloudAccount();
    if(!linked){await this.attachCloudUser(user);return;}
    if(linked.uid!==user.uid)throw new Error(t('This device is linked to another cloud account.','هذا الجهاز مرتبط بحساب سحابي آخر.'));
    await this.beginProtectedOperation();
    try{
      this.setState({cloudSyncState:'syncing',cloudSyncMessage:t('Reconciling account data…','جارٍ توحيد بيانات الحساب…')});
      const result=await reconcileCloudVault(user.uid);
      if(result==='pulled'){window.location.reload();return;}
      const newest=this.latestEncryptedVault??await getEncryptedVault();
      if(newest)this.lastCloudSyncedAt=newest.updatedAt;
      this.setState({cloudSyncState:result==='empty'?'local':'synced',cloudSyncMessage:result==='empty'?t('No cloud data yet.','لا توجد بيانات سحابية بعد.'):t('Encrypted cloud data is up to date.','البيانات السحابية المشفّرة محدثة.')});
    }catch(e){
      const message=friendlyCloudError(e);
      this.setState({cloudSyncState:'error',cloudSyncMessage:message});
      throw new Error(message);
    }finally{this.endProtectedOperation();}
  };"""
app=app[:start]+replacement+app[end:]
if 'remote.updatedAt>local.updatedAt' in app: raise SystemExit('wall-clock winner logic still present')
if 'This cloud account already contains LOUREX data.' in app: raise SystemExit('stale account-link blocker still present')
app_path.write_text(app)

cloud_path=Path('src/cloud/firebase.ts')
cloud=cloud_path.read_text()
old="    if(!anchor){const installed=await installCloudVault(uid,true);if(!installed)throw new Error('Cloud account data is unavailable.');return;}"
new="""    if(!anchor){
      if(previous.deviceId===currentDeviceId()){await publishVault(uid,security,vault,previous);return;}
      const installed=await installCloudVault(uid,true);if(!installed)throw new Error('Cloud account data is unavailable.');return;
    }"""
if old not in cloud: raise SystemExit('push missing-anchor anchor not found')
cloud=cloud.replace(old,new,1)
old="  if(!anchor){await installCloudVault(uid);return 'pulled';}"
new="""  if(!anchor){
    if(remote.deviceId===currentDeviceId()){
      const security=await getSecurity();if(!security)throw new Error('Security settings are missing.');
      await publishVault(uid,security,local,remote);return 'pushed';
    }
    await installCloudVault(uid);return 'pulled';
  }"""
if old not in cloud: raise SystemExit('reconcile missing-anchor anchor not found')
cloud=cloud.replace(old,new,1)
cloud_path.write_text(cloud)

audit=Path('tests/audit-batch3.test.mjs')
text=audit.read_text()
old="assert.ok(initialize.indexOf('resumeVaultSession()')<initialize.indexOf('waitForCloudUser()'),'local encrypted session restore must precede background cloud reconciliation');"
new="assert.match(initialize,/configuredCloudUser=await waitForCloudUser\\(\\)/);\n  assert.match(initialize,/if\\(!configuredCloudUser\\)/);\n  assert.ok(initialize.indexOf('if(!configuredCloudUser)')<initialize.indexOf('loading:false,firstRun:false,unlocked:true'),'decrypted workspace must not open before the account session is present');"
if old not in text: raise SystemExit('audit expectation anchor not found')
audit.write_text(text.replace(old,new,1))

Path('tests/cross-device-account-sync.test.mjs').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('configured devices never silently operate outside the cloud account session',async()=>{
  const app=await read('src/app/App.tsx');
  const initialize=app.slice(app.indexOf('private initialize=async'),app.indexOf('private initializeConfiguredCloud'));
  assert.match(initialize,/configuredCloudUser=await waitForCloudUser\\(\\)/);
  assert.match(initialize,/if\\(!configuredCloudUser\\)/);
  assert.ok(initialize.indexOf('if(!configuredCloudUser)')<initialize.indexOf('loading:false,firstRun:false,unlocked:true'));
});

test('same-account devices re-link automatically even when cloud data already exists',async()=>{
  const app=await read('src/app/App.tsx');
  assert.doesNotMatch(app,/This cloud account already contains LOUREX data/);
  assert.match(app,/if\\(!linked\\)\\{await putCloudAccount\\(cloudUser\\.uid,cloudUser\\.email\\);\\}/);
  assert.match(app,/private attachCloudUser=async\\(user:CloudUser\\)=>\\{const linked=await getCloudAccount\\(\\);/);
  assert.match(app,/await putCloudAccount\\(user\\.uid,user\\.email\\);this\\.setState\\(\\{cloudUser:user,cloudLinked:true/);
});

test('account reconcile never chooses a winner from device wall-clock timestamps',async()=>{
  const app=await read('src/app/App.tsx');
  assert.doesNotMatch(app,/remote\\.updatedAt\\s*[><]=?\\s*local\\.updatedAt/);
  assert.match(app,/const result=await reconcileCloudVault\\(user\\.uid\\)/);
});

test('a publishing device can recover a lost anchor without discarding its new local changes',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/previous\\.deviceId===currentDeviceId\\(\\)/);
  assert.match(cloud,/remote\\.deviceId===currentDeviceId\\(\\)/);
  assert.match(cloud,/await publishVault\\(uid,security,vault,previous\\);return;/);
  assert.match(cloud,/await publishVault\\(uid,security,local,remote\\);return 'pushed';/);
});
""")
