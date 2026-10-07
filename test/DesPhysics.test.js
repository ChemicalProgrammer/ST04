import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';

test('DES analytical physics checks use the bundled real SimPy library',()=>{
 const output=execFileSync('python3',[new URL('./des_physics_test.py',import.meta.url).pathname,'-v'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.equal(output,'');
});
