import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Lalamove history shows only the 20 latest trips',()=>{
 const source=readFileSync('public/lalamove-ui.js','utf8');
 assert.equal((source.match(/limit: 20/g)||[]).length,2);
 assert.match(source,/const recent = \(allData\.addresses \|\| \[\]\)\.slice\(0, 20\)/);
 assert.match(source,/renderHistory\(recent\)/);
});
