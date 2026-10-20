import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
test('template download uses live IDs, imports all equipment and edits conveyor / unmatched notes',async()=>{
 const dom=new JSDOM('<!doctype html>'+fs.readFileSync(new URL('../apps-script/RealDataPanel.html',import.meta.url),'utf8'),{runScripts:'outside-only'});const w=dom.window,d=w.document;
 try{
  w.eval(fs.readFileSync(new URL('../apps-script/RealData.html',import.meta.url),'utf8').replace(/^<script>/,'').replace(/<\/script>\s*$/,''));
  const equipment=[{id:'filler',name:'Filler',type:'FILLER'},{id:'transfer',name:'Transfer conveyor',type:'CONVEYOR'}],sim={id:'s',name:'Baseline',equipment},c={id:'c',name:'Test case',metadata:{}},state={activeCase:c};let edits=0,blob;
  w.URL.createObjectURL=value=>{blob=value;return 'blob:template';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
  w.STRealData.init(state,{changed:()=>edits++});w.STRealData.render(c,sim);d.getElementById('real-data-template').click();
  const text=await new Promise(resolve=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blob);});const payload=JSON.parse(text);
  assert.equal(payload.records[0].equipment[1].equipmentId,'transfer');assert.equal(payload.records[0].downtimeSeconds,null);assert(payload._guide.equipmentFields.notes);
  payload.records[0].equipment.push({equipmentId:'old-machine',name:'Old machine',notes:'Not in current line'});
  const file=d.getElementById('real-data-file');Object.defineProperty(file,'files',{value:[{size:text.length,text:async()=>JSON.stringify(payload)}]});await file.onchange();assert.equal(c.metadata.realData.records[0].equipment.length,3);
  const notes=d.querySelector('[data-equipment-id=transfer][data-real-equipment-field=notes]');assert(notes);notes.value='Check the back-up sensor';notes.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(c.metadata.realData.records[0].equipment[1].notes,'Check the back-up sensor');assert(d.querySelector('[data-equipment-id=old-machine][data-real-equipment-field=notes]'));assert(edits>=2);
 }finally{dom.window.close();}
});
