import assert from 'node:assert/strict';

// PR target branches are not push triggers. Keep direct push QA confined to
// explicit feature/fix branches; forbid unscoped push and tag triggers.
export function assertQaRunnerAndPushBranches(yaml,name){
  const runners=[...yaml.matchAll(/^\s*runs-on:[ \t]*([^\r\n#]+?)[ \t]*(?:#.*)?$/gm)];
  assert.ok(runners.length,name+': at least one runner required');
  for(const match of runners)assert.match(match[1].trim(),/^ubuntu-(?:latest|24\.04|22\.04)$/,name+' must use a standard Linux runner');
  const header=/^  push:[ \t]*(.*)$/m.exec(yaml);
  if(!header)return;
  assert.ok(!header[1].trim()||header[1].trim().startsWith('#'),name+' requires explicit push branch scope');
  const body=yaml.slice(header.index+header[0].length).split(/\r?\n/).slice(1);
  const block=[];
  for(const line of body){if(line.trim()&&!/^[ \t]{4,}/.test(line))break;block.push(line);}
  assert.doesNotMatch(block.join('\n'),/^\s*(?:branches-ignore|tags|tags-ignore):/m,name+' cannot trigger tag or unscoped branch pushes');
  const i=block.findIndex(l=>/^    branches:[ \t]*/.test(l));
  assert.ok(i>=0,name+' requires an explicit branch allowlist');
  const inline=block[i].replace(/^    branches:[ \t]*/,'').replace(/[ \t]+#.*$/,'').trim();
  let branches;
  if(inline){
    assert.match(inline,/^\[[^\[\]]+\]$/,name+' invalid inline branch allowlist');
    branches=inline.slice(1,-1).split(',').map(s=>s.trim());
  }else{
    branches=[];
    for(const line of block.slice(i+1)){
      if(!line.trim()||/^\s*#/.test(line))continue;
      const m=/^\s{6,}-[ \t]+(.+?)\s*$/.exec(line);if(!m)break;
      branches.push(m[1].replace(/[ \t]+#.*$/,'').trim());
    }
  }
  assert.ok(branches.length,name+' empty branch allowlist');
  for(const raw of branches){
    const value=raw.replace(/^(['"])(.*)\1$/,'$2');
    assert.match(value,/^(?:fix|feat)\/[A-Za-z0-9._/*?-]+$/,name+' must push only feature/fix branches: '+value);
  }
}
