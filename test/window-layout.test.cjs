'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {panelBounds}=require('../src/window-layout.cjs');
const {DEFAULT_SETTINGS,validateState,emptyState,validateSettings}=require('../src/domain.cjs');
test('top right docking respects work area, reserved space and negative monitor origins',()=>{
 const area={x:-1920,y:40,width:1920,height:1040};
 assert.deepEqual(panelBounds(DEFAULT_SETTINGS,area,area),{x:-760,y:40,width:760,height:540});
 const inset=panelBounds({...DEFAULT_SETTINGS,desktopInset:240},area,area);assert.equal(inset.x,-1000);
 const small=panelBounds({...DEFAULT_SETTINGS,compactMode:true},area,area);assert.equal(small.x,-390);assert.equal(small.y,40);
});
test('small displays and removed monitors keep the panel within the available area',()=>{
 const area={x:10,y:20,width:600,height:400};
 for(const windowPosition of ['manual','top-right']){
  const b=panelBounds({...DEFAULT_SETTINGS,windowPosition,desktopInset:480},{x:-2000,y:3000},area);
  assert.ok(b.x>=area.x&&b.y>=area.y);assert.ok(b.x+b.width<=610&&b.y+b.height<=420);
 }
});
test('manual position stays unchanged on unrelated settings updates',()=>{
 const area={x:0,y:0,width:1920,height:1080},current={x:123,y:78};
 const settings={...DEFAULT_SETTINGS,windowPosition:'manual'};
 const before=panelBounds(settings,current,area);
 assert.deepEqual(panelBounds({...settings,language:'en',transparency:100},before,area),before);
});
test('legacy topmost preference is disabled while tasks and manual placement preferences survive reload',()=>{
 const old=emptyState();delete old.settings.positionFixed;delete old.settings.windowPosition;old.settings.alwaysOnTop=true;
 const migrated=validateState(old);assert.equal(migrated.settings.alwaysOnTop,false);assert.equal(migrated.settings.positionFixed,true);assert.equal(migrated.settings.windowPosition,'top-right');
 assert.equal(validateSettings({alwaysOnTop:true}).alwaysOnTop,false);
 assert.throws(()=>validateSettings({desktopInset:481}));assert.throws(()=>validateSettings({desktopInset:-1}));
 assert.throws(()=>validateSettings({windowPosition:'nowhere'}));
 const changed=validateState({...migrated,settings:{...migrated.settings,positionFixed:false,windowPosition:'manual'}});
 assert.equal(changed.settings.positionFixed,false);assert.equal(changed.settings.windowPosition,'manual');
});
