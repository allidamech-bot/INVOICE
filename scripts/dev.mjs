import { spawn, spawnSync } from 'node:child_process';

const initial = spawnSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
if (initial.status !== 0) process.exit(initial.status ?? 1);

const tsc = spawn('tsc',['-p','tsconfig.json','--watch','--preserveWatchOutput'],{stdio:'inherit'});
const server = spawn('http-server',['dist','-p','5173','-c-1'],{stdio:'inherit'});
process.on('SIGINT',()=>{tsc.kill();server.kill();process.exit();});
