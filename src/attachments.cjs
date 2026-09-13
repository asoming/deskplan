'use strict';
const fs=require('node:fs'),path=require('node:path');
function inspectPaths(paths){
  if(!Array.isArray(paths)||!paths.length||paths.length>100)throw new Error('一次请选择 1–100 个文件或文件夹');
  return paths.map(value=>{
    if(typeof value!=='string'||!path.isAbsolute(value))throw new Error('请选择电脑上的文件或文件夹');
    const normalized=path.normalize(value),stats=fs.statSync(normalized);
    if(!stats.isFile()&&!stats.isDirectory())throw new Error('仅支持普通文件和文件夹');
    return {path:normalized,name:path.basename(normalized)||normalized,kind:stats.isDirectory()?'directory':'file'};
  });
}
async function inspectAttachment(file){
  try{const stat=await fs.promises.stat(file.path);return {id:file.id,available:file.kind==='directory'?stat.isDirectory():stat.isFile()};}
  catch{return {id:file.id,available:false};}
}
module.exports={inspectPaths,inspectAttachment};
