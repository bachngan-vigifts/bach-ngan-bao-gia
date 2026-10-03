import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('F6 and F7 focus the selected row, skip modals and select existing text',()=>{
 const source=readFileSync('public/app.js','utf8');let key,focus,selected,modal=false;const rowEvents={};
 const rows=['a','b'].map(id=>({dataset:{id},querySelector:selector=>({focus:()=>focus=id+selector,select:()=>selected=true,scrollIntoView(){}})}));
 const document={getElementById:()=>({addEventListener:(name,fn)=>rowEvents[name]=fn}),addEventListener:(name,fn)=>key=fn,querySelector:()=>modal,querySelectorAll:()=>rows};
 vm.runInNewContext(source.slice(source.indexOf('let selectedQuoteRow=')),{document,toast(){}});
 const press=k=>key({key:k,preventDefault(){}});press('F6');assert.match(focus,/a.*discount/);assert(selected);
 rowEvents.click({target:{closest:()=>rows[1]}});press('F7');assert.match(focus,/b.*printFee/);
 modal=true;focus='unchanged';press('F6');assert.equal(focus,'unchanged');
});
