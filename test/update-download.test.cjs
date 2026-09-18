'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Readable}=require('node:stream'),{createHash}=require('node:crypto');
const {UpdateDownload,assetName,checksumFor}=require('../src/update-download.cjs');
const {trustedAssetURL}=require('../src/update-network.cjs');
const body=Buffer.from('fixture installer'),sum=createHash('sha256').update(body).digest('hex');
function fixture(t, options={}) {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rixu-download-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const request=async url=>({size:url.endsWith('.txt')?0:body.length,body:Readable.from([url.endsWith('.txt')?Buffer.from(`${sum}  ${assetName('9.8.7','local','x64')}\n`):body])});
 return new UpdateDownload({directory,version:'1.0.6',kind:'local',arch:'x64',request,...options});
}
test('update packages match platform and architecture; remote paths stay on GitHub release assets',()=>{
 assert.equal(assetName('1.0.7','mac','arm64'),'DeskPlan-1.0.7-mac-arm64.dmg');assert.match(assetName('1.0.7','nsis','x64'),/windows-x64-setup.exe$/);
 assert.throws(()=>assetName('../escape','local','x64'));assert.throws(()=>assetName('1.0.7','deb','arm64'));
 for(const url of ['file:///tmp/a','https://github.com/evil/repo/a','https://github.com.evil.test/asoming/deskplan/releases/download/a','https://user@github.com/asoming/deskplan/releases/download/a'])assert.equal(trustedAssetURL(url),false);
 assert.equal(trustedAssetURL('https://release-assets.githubusercontent.com/a?token=x'),true);
 assert.throws(()=>checksumFor(`${sum}  a\n${sum}  a`,'a'));assert.throws(()=>checksumFor('bad','a'));
});
test('download verifies checksum, survives restart and detects tampering before install',async t=>{
 const d=fixture(t),promise=d.download({version:'9.8.7'});assert.equal(d.download({version:'9.8.7'}),promise);await promise;
 assert.equal(d.state.status,'ready');assert.equal(d.state.transferred,body.length);assert.ok(!fs.existsSync(d.ready.file+'.part'));
 const restored=new UpdateDownload({...d,version:'1.0.6'});await restored.restore();assert.equal(restored.state.status,'ready');
 fs.writeFileSync(restored.ready.file,'tampered');await assert.rejects(restored.verifiedFile(),/校验失败/);assert.equal(restored.state.status,'error');assert.ok(!fs.existsSync(restored.manifest));
});
test('failed checksum leaves no ready/partial package and can retry',async t=>{
 const d=fixture(t),request=d.request;d.request=async url=>url.endsWith('.txt')?request(url):{size:3,body:Readable.from([Buffer.from('bad')])};
 await d.download({version:'9.8.7'});assert.equal(d.state.status,'error');assert.equal(fs.readdirSync(d.directory).length,0);
 d.request=request;await d.download({version:'9.8.7'});assert.equal(d.state.status,'ready');
});
test('cancellation stops download and permits retry',async t=>{
 const d=fixture(t),request=d.request;d.request=async(url,signal)=>url.endsWith('.txt')?request(url):{size:body.length,body:Readable.from((async function*(){d.cancel();yield body;})())};
 await d.download({version:'9.8.7'});assert.equal(d.state.error,'下载已取消');assert.equal(fs.readdirSync(d.directory).length,0);
 d.request=request;await d.download({version:'9.8.7'});assert.equal(d.state.status,'ready');
});
test('truncated response and corrupt restored cache cannot be installed',async t=>{
 const d=fixture(t),request=d.request;d.request=async url=>{const r=await request(url);if(!url.endsWith('.txt'))r.size+=10;return r;};
 await d.download({version:'9.8.7'});assert.equal(d.state.status,'error');await assert.rejects(d.verifiedFile());
 d.request=request;await d.download({version:'9.8.7'});fs.unlinkSync(d.ready.file);
 const restored=new UpdateDownload({...d});await restored.restore();assert.equal(restored.state.status,'error');
});
