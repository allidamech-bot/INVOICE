import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root=process.cwd();
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};
const read=path=>readFile(join(root,path),'utf8');

const [gitignore,defaults,session,entry,modal,passwordPolicy,api,vercel,build,appCheckBootstrap]=await Promise.all([
  read('.gitignore'),read('src/lib/defaults.ts'),read('src/storage/session.ts'),read('src/components/AccountEntryScreen.tsx'),
  read('src/components/CloudAccountModal.tsx'),read('src/lib/account-security.ts'),read('api/remove-background.js'),read('vercel.json'),
  read('scripts/build.mjs'),read('public/firebase-app-check-bootstrap.js')
]);

check(/^\.env$/m.test(gitignore)&&/^\.env\.\*$/m.test(gitignore),'gitignore must block .env and .env.*');
check(/^\.vercel\/$/m.test(gitignore),'gitignore must block .vercel metadata');
check(/autoLockMinutes:\s*15/.test(defaults),'fresh workspaces must default to a 15-minute auto-lock');
check(/suspendSession[\s\S]*deleteRecord\('session-key'\)/.test(session),'sign out must delete the persisted CryptoKey');
check(/MIN_ACCOUNT_PASSWORD_LENGTH=12/.test(passwordPolicy),'account password minimum must be 12 characters');
check(/accountPasswordIssue/.test(entry)&&/accountPasswordIssue/.test(modal),'all account creation surfaces must use the shared password policy');
check(/firebase-app-check-compat\.js/.test(build),'production build must vendor the Firebase App Check runtime');
check(/FIREBASE_APP_CHECK_ENTERPRISE_KEY/.test(build)&&/FIREBASE_APP_CHECK_REQUIRED/.test(build),'production build must expose explicit App Check configuration gates');
check(/firebaseAppCheckRequired&&!firebaseAppCheckEnterpriseKey/.test(build),'production build must fail closed when App Check is required without a key');
check(/ReCaptchaEnterpriseProvider/.test(appCheckBootstrap),'Firebase App Check must use the reCAPTCHA Enterprise provider');
check(/firebase\.appCheck\(\)\.activate\(provider,true\)/.test(appCheckBootstrap),'Firebase App Check token auto-refresh must be enabled');
check(/firebase\.initializeApp=function/.test(appCheckBootstrap),'App Check bootstrap must activate inside Firebase initialization before cloud services are used');
check(!/FIREBASE_APPCHECK_DEBUG_TOKEN/.test(appCheckBootstrap+build),'production App Check wiring must not enable the debug-token bypass');
check(/if\(!origin\|\|requestedWith!==['"]LOUREX-Invoice['"]\)return false/.test(api),'AI proxy must reject missing/spoofed browser intent headers');
check(/RATE_MAX=12/.test(api)&&/RATE_WINDOW_MS=5\*60\*1000/.test(api),'AI proxy must have an abuse limiter');
check(/validImageSignature/.test(api),'AI proxy must validate image magic bytes');
check(/Content-Security-Policy/.test(vercel)&&/script-src 'self';/.test(vercel),'production CSP must keep script execution self-only');
check(!/script-src [^;]*'unsafe-inline'/.test(vercel),'production script-src must not allow unsafe-inline');
check(/Cross-Origin-Opener-Policy/.test(vercel)&&/Cross-Origin-Resource-Policy/.test(vercel),'production must set cross-origin isolation headers');
check(/Strict-Transport-Security[\s\S]*63072000; includeSubDomains/.test(vercel),'HSTS must be at least two years and include subdomains');

async function collectFiles(dir){
  const out=[];
  for(const entry of await readdir(join(root,dir),{withFileTypes:true})){
    const path=join(dir,entry.name);
    if(entry.isDirectory())out.push(...await collectFiles(path));
    else out.push(path);
  }
  return out;
}

// Do not scan this scanner itself for key-signature literals: its detection
// patterns necessarily contain those signatures and would self-trigger.
const sourceFiles=(await Promise.all(['src','api','scripts'].map(collectFiles))).flat()
  .filter(path=>/\.(?:ts|tsx|js|mjs|cjs)$/.test(path)&&path!=='scripts/security-check.mjs');
const privateKeyPattern=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const serviceAccountPattern=/"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/;
const hardcodedSecretPattern=/(?:REMOVE_BG_API_KEY|FIREBASE_ADMIN_PRIVATE_KEY|GOOGLE_APPLICATION_CREDENTIALS)\s*=\s*['"][^'"]+['"]/;
for(const file of sourceFiles){
  const text=await read(file);
  check(!privateKeyPattern.test(text),`${file}: private key material must never be committed`);
  check(!serviceAccountPattern.test(text),`${file}: Firebase service-account material must never be committed`);
  check(!hardcodedSecretPattern.test(text),`${file}: server secrets must come from environment variables`);
  if(file.startsWith('src/')){
    check(!/dangerouslySetInnerHTML/.test(text),`${file}: dangerouslySetInnerHTML requires an explicit security review`);
    check(!/\beval\s*\(/.test(text)&&!/new\s+Function\s*\(/.test(text),`${file}: dynamic code execution is forbidden`);
  }
}

const rootEntries=await readdir(root);
check(!rootEntries.some(name=>name==='.env'||(/^\.env\./.test(name)&&name!=='.env.example')),'.env files must not be committed');

if(failures.length){
  console.error('LOUREX security check failed:');
  failures.forEach(message=>console.error(`- ${message}`));
  process.exit(1);
}
console.log(`LOUREX security check passed (${sourceFiles.length} source files scanned).`);
