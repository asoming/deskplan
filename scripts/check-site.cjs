'use strict';
// Dependency-free checks for the static GitHub Pages artifact.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../site');
for(const [file,lang] of [['index.html','en'],['zh-CN/index.html','zh-CN']]){
 const filename=path.join(root,file),html=fs.readFileSync(filename,'utf8');
 assert(html.includes(`<html lang="${lang}">`));assert.equal((html.match(/<h1[ >]/g)||[]).length,1);
 assert(html.includes('rel="canonical"'));assert(html.includes('hreflang="zh-CN"'));assert(html.includes('property="og:image"'));
 const structured=/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);assert.equal(JSON.parse(structured[1]).name,'DeskPlan');
 for(const [,value] of html.matchAll(/(?:href|src|data-animation|data-poster)="([^"]+)"/g)){
  if(/^(https?:|mailto:|data:)/.test(value))continue;
  const [local,hash]=value.split('#');
  if(local){const resolved=path.resolve(path.dirname(filename),local);assert(resolved.startsWith(root+path.sep)||resolved===root);assert(fs.existsSync(resolved),`${file}: ${local}`);}
  else if(hash)assert(html.includes(`id="${hash}"`),`${file}: missing #${hash}`);
 }
 assert.equal((html.match(/releases\/download\/v[^"]+/g)||[]).length,5);
}
assert(fs.statSync(path.join(root,'assets/social-preview.png')).size<1_000_000);
for(const file of ['robots.txt','sitemap.xml','site.js','style.css'])assert(fs.statSync(path.join(root,file)).size>0);
console.log('Site metadata, local links, assets and download entries verified.');
