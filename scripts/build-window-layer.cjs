'use strict';
if(!['win32','linux','darwin'].includes(process.platform)) process.exit(0);
const path=require('node:path'),{spawnSync}=require('node:child_process');
const result=spawnSync(process.execPath,[require.resolve('node-gyp/bin/node-gyp.js'),'rebuild','--directory',path.resolve(__dirname,'../src/native'),`--target=${require('../package.json').devDependencies.electron}`,'--dist-url=https://electronjs.org/headers'],{stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
