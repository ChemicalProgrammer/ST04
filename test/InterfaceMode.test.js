import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('interface mode defaults to Basic and only the deployment property enables Advance',()=>{
 let value=null;
 const runtime=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:key=>{assert.equal(key,'ST_UI_MODE');return value;}})}});
 vm.runInContext(fs.readFileSync('apps-script/InterfaceMode.gs','utf8'),runtime);
 for(const candidate of [null,'','BASIC','typo']){value=candidate;assert.equal(runtime.getInterfaceMode_(),'BASIC');}
 for(const candidate of ['ADVANCE','advanced',' Advance ']){value=candidate;assert.equal(runtime.getInterfaceMode_(),'ADVANCE');}
});
