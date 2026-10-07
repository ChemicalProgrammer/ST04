import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';

test('Spatial DES conserves material and resolves sensors, queue packing and interruptions with real SimPy',()=>{
 const output=execFileSync('python3',[new URL('./spatial_des_test.py',import.meta.url).pathname,'-v'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.equal(output,'');
});
