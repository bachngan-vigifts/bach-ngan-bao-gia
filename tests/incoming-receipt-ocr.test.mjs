import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('receipt OCR retains a SKU when its quantity is moved onto the following line',()=>{
 const source=readFileSync('public/incoming-stock-ui.js','utf8');
 const start=source.indexOf(' const parseScannedReceipt='),end=source.indexOf(' function applyScannedReceipt',start);
 assert.ok(start>=0&&end>start);
 const context={};vm.runInNewContext(`${source.slice(start,end)};globalThis.parseScannedReceipt=parseScannedReceipt;`,context);
 const products=['190901000','591047000','01071138503'].map(sku=>({sku}));
 const text=['1 190901000 Gac dua JAS Trg 250 L1','2 591047000 Chen com TIMELESS Trg 240 L1','3 01071138503 Bo tra 0.7 L JAS ChimLac','Hoa van','230 / L1'].join('\n');
 assert.deepEqual(JSON.parse(JSON.stringify([...context.parseScannedReceipt(text,products)])),[['190901000',250],['591047000',240],['01071138503',230]]);
});
