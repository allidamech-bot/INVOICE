import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../deploy/fiscal/lourex-aws-staging.service',import.meta.url),'utf8');
test('restricted systemd worker never reads the owner home directory',()=>{
 assert.match(source,/WorkingDirectory=\/opt\/lourex-fiscal\/current/);
 assert.match(source,/ExecStart=\/usr\/bin\/node \/opt\/lourex-fiscal\/current\/scripts\/fiscal\/run-aws-staging-worker\.mjs/);
 assert.match(source,/ProtectHome=true/);
 assert.match(source,/ReadOnlyPaths=\/opt\/lourex-fiscal\/current/);
 assert.doesNotMatch(source,/\/home\/ubuntu/);
 assert.match(source,/User=lourex-staging/);
 assert.match(source,/NoNewPrivileges=true/);
});
