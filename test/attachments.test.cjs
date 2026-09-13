'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {inspectPaths,inspectAttachment}=require('../src/attachments.cjs'),{Store}=require('../src/store.cjs');
test('folders and editor workspace files retain their kind and original contents through storage, completion, deletion and relinking',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rixu-folders-'));
 try{
  const folder=path.join(root,'project.v2');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'draft.txt'),'keep me');
  const workspace=path.join(root,'project.code-workspace');fs.writeFileSync(workspace,'{"folders":[{"path":"project.v2"}]}');
  const s=new Store(path.join(root,'data')),items=inspectPaths([folder,workspace]),ids=s.createFromFiles(2,items);
  assert.equal(items[0].kind,'directory');assert.equal(items[1].kind,'file');assert.equal(s.state.tasks[0].title,'project.v2');
  const reopened=new Store(s.directory);assert.equal(reopened.state.tasks[0].files[0].kind,'directory');
  assert.equal((await inspectAttachment(reopened.state.tasks[0].files[0])).available,true);
  s.status(ids[0],'delete');s.purge(ids[0]);assert.equal(fs.readFileSync(path.join(folder,'draft.txt'),'utf8'),'keep me');
  const moved=folder+'-moved';fs.renameSync(folder,moved);assert.equal((await inspectAttachment(items[0])).available,false);
  s.attach(ids[1],inspectPaths([moved]));const file=s.state.tasks[0].files.at(-1);s.relink(ids[1],file.id,inspectPaths([moved])[0]);assert.equal(s.state.tasks[0].files.at(-1).kind,'directory');
  assert.throws(()=>inspectPaths(['relative/path']));assert.throws(()=>inspectPaths([]));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
