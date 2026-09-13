'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { UpdateChecker, releaseInfo, newer, endpoint } = require('../src/updates.cjs');
test('stable release comparison is numeric and never downgrades or accepts remote URLs', () => {
  assert.equal(newer('v1.10.0', '1.9.9'), true);
  for (const tag of ['v1.0.6','v1.0.5','v1.0.7-beta','v01.9.0','../../evil']) assert.equal(newer(tag,'1.0.6'),false);
  assert.deepEqual(releaseInfo({tag_name:'v1.0.7',draft:false,prerelease:false,html_url:'https://evil.example/'},'1.0.6'),{version:'1.0.7',url:'https://github.com/asoming/rixu/releases/tag/v1.0.7'});
  assert.throws(()=>releaseInfo({tag_name:'v1.0.7',draft:true,prerelease:false},'1.0.6'));
  assert.throws(()=>releaseInfo({tag_name:'v1.0.7',draft:false,prerelease:true},'1.0.6'));
});
test('checks deduplicate, persist notification acknowledgement, and retry network errors', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rixu-updates-')),cacheFile=path.join(dir,'updates.json');
  let requests=0, finish;
  const checker=new UpdateChecker({version:'1.0.6',cacheFile,fetch:async(url,options)=>{
    requests++; assert.equal(url,endpoint);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
    return new Promise(resolve=>{finish=resolve;});
  }});
  try {
    const a=checker.check(),b=checker.check();assert.equal(a,b);assert.equal(requests,1);
    finish({ok:true,json:async()=>({tag_name:'v1.0.7',draft:false,prerelease:false})});
    assert.equal((await a).status,'available');assert.equal(checker.due(),false);
    checker.acknowledge('9.9.9');assert.equal(checker.state.notifiedVersion,'');
    checker.acknowledge('1.0.7');
    const reopened=new UpdateChecker({version:'1.0.6',cacheFile,fetch:async()=>{throw Error('offline');}});
    assert.equal(reopened.state.notifiedVersion,'1.0.7');assert.equal((await reopened.check()).status,'error');
    reopened.fetch=async()=>({ok:false,status:429});assert.match((await reopened.check()).error,/频繁/);
    reopened.fetch=async()=>({ok:true,json:async()=>({tag_name:'v1.0.6',draft:false,prerelease:false})});
    assert.equal((await reopened.check()).status,'current');assert.equal(reopened.state.release,null);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('API rate limits can use only the official stable-release redirect', async () => {
 const checker=new UpdateChecker({version:'1.0.6',fetch:async()=>({ok:false,status:403}),latestURL:async()=> 'https://github.com/asoming/rixu/releases/tag/v1.0.7'});
 assert.equal((await checker.check()).release.version,'1.0.7');
 for(const url of ['https://evil.example/releases/tag/v2.0.0','https://github.com/other/rixu/releases/tag/v2.0.0','https://github.com/asoming/rixu/releases/tag/v2.0.0-beta']) {
  checker.latestURL=async()=>url;assert.equal((await checker.check()).status,'error');
 }
});
