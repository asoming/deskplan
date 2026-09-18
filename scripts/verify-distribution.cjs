'use strict';
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),version=require('../package.json').version;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rixu-install-')),evidence={platform:process.platform,arch:process.arch,version,checks:[]};
const run=(cmd,args,options={})=>execFileSync(cmd,args,{timeout:120000,...options});
const smoke=binary=>run(process.execPath,[path.join(__dirname,'package-smoke.cjs'),binary],{stdio:'inherit'});
(async()=>{
if(process.platform==='linux'){
 const deb=path.join(dist,`DeskPlan-${version}-linux-x64.deb`);
 assert.equal(run('dpkg-deb',['-f',deb,'Version']).toString().trim(),version);
 run('dpkg-deb',['-x',deb,dir]);
 const entry=fs.readFileSync(path.join(dir,'usr/share/applications/io.rixu.desktop'),'utf8');assert.match(entry,/Name\[en\]=DeskPlan/);assert.match(entry,/StartupWMClass=io.rixu/);assert.match(entry,/Icon=rixu/);
 assert.ok(fs.existsSync(path.join(dir,'usr/share/icons/hicolor/256x256/apps/rixu.png')));
 const binary=path.join(dir,'opt','日序','rixu');
 if(process.env.CI){const helper=path.join(path.dirname(binary),'chrome-sandbox');run('sudo',['chown','root:root',helper]);run('sudo',['chmod','4755',helper]);}
 smoke(binary);run('tar',['-tzf',path.join(dist,`DeskPlan-${version}-linux-x64.tar.gz`)]);
 evidence.checks.push(await require('./test-update-install.cjs').test(binary,path.join(dist,`DeskPlan-${version}-linux-x64.tar.gz`),'local'));
 evidence.checks.push('deb metadata','desktop association','standard icon sizes','extracted deb application','tar archive');
}else if(process.platform==='win32'){
 const installer=path.join(dist,`DeskPlan-${version}-windows-x64-setup.exe`),destination=path.join(dir,'installed');
 run(installer,['/S',`/D=${destination}`]);
 const binary=path.join(destination,'rixu.exe');assert.ok(fs.existsSync(binary));smoke(binary);
 evidence.checks.push(await require('./test-update-install.cjs').test(binary,installer,'nsis'));
 evidence.checks.push('NSIS silent installation','installed application');
}else if(process.platform==='darwin'){
 const dmg=path.join(dist,`DeskPlan-${version}-mac-${process.arch}.dmg`),mount=path.join(dir,'mount');fs.mkdirSync(mount);let sourceBinary;
 run('hdiutil',['attach',dmg,'-nobrowse','-readonly','-mountpoint',mount]);
 try{
   const bundle=path.join(mount,'日序.app');run('codesign',['--verify','--deep','--strict',bundle]);
   const binDir=path.join(bundle,'Contents','MacOS'),binary=path.join(binDir,fs.readdirSync(binDir).find(n=>!n.startsWith('.')));smoke(binary);
   const source=path.join(dir,'source.app');fs.cpSync(bundle,source,{recursive:true,verbatimSymlinks:true});sourceBinary=path.join(source,'Contents','MacOS',path.basename(binary));
 }finally{run('hdiutil',['detach',mount]);}
 evidence.checks.push(await require('./test-update-install.cjs').test(sourceBinary,dmg,'mac'));
 run('unzip',['-tqq',path.join(dist,`DeskPlan-${version}-mac-${process.arch}.zip`)]);
 evidence.checks.push('DMG mount','code signature integrity (not publisher trust/notarization)','mounted application','ZIP integrity');
}
evidence.passed=true;
if(process.env.RIXU_ARTIFACTS_DIR){fs.mkdirSync(process.env.RIXU_ARTIFACTS_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.RIXU_ARTIFACTS_DIR,'distribution-test.json'),JSON.stringify(evidence,null,2));}
console.log(JSON.stringify(evidence));

})().catch(error=>{console.error(error);process.exitCode=1;});
