import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/supplier-progress.js';
import {supplierQuoteLinks} from '../lib/supplier-quote-links.mjs';
const {progress,receiptSummary}=globalThis.SupplierProgress;
test('partial deliveries, receipts and outstanding quantities remain distinct',()=>{
 const order={supplierDeliveredRows:[{sku:'ML1',quantity:40}],supplierReceivedRows:[{sku:'ml1',quantity:25}]};
 assert.deepEqual(progress(order,{sku:'ML1',quantity:100}),{ordered:100,delivered:40,received:25,remaining:60,awaitingReceipt:15});
 assert.equal(progress({...order,receivedAt:'2026-10-02'},{sku:'ML1',quantity:100}).remaining,0);
 assert.equal(progress(order,{sku:'other',quantity:20}).remaining,20);
});
test('receipt aggregation assigns quantities to original orders across multiple received delivery notes',async()=>{
 const notes=[{id:'n1',key:'one',source:'supplier-delivery-note',receivedAt:'2026-10-01'},{id:'n2',key:'two',source:'supplier-delivery-note',receivedAt:'2026-10-02'},{id:'n3',key:'three',source:'supplier-delivery-note'}];
 const bucket={get:async key=>({json:async()=>({rows:[{sku:'ML1',sourceOrders:[{orderId:'a',quantity:key==='one'?10:20},{orderId:'b',quantity:5}]}]})})};
 const result=await receiptSummary(bucket,notes);assert.equal(result.received.get('a').get('ml1').quantity,30);assert.equal(result.received.get('b').get('ml1').quantity,10);assert.equal(result.history.get('a').length,2);
 await assert.rejects(()=>receiptSummary({get:async()=>null},notes),/Chưa tải/);
});
test('external supplier receives no internal quote data and employee scope is applied',async()=>{
 const input={orders:[{quoteNumber:'BG1'}]};assert.equal(await supplierQuoteLinks(null,null,input,{role:'supplier'}),input);
 const queries=[];const db={prepare(sql){queries.push(sql);return {bind(){return {first:async()=>sql.includes('position_id AS')?{id:'e',role:'employee',active:1,positionId:'p'}:null}}}}};
 const result=await supplierQuoteLinks(db,null,input,{id:'e',role:'employee'});assert.equal(result.orders[0].quoteLink,undefined);assert.ok(queries.some(q=>q.includes('q.creator_id = ?')&&q.includes('m.position_id = ?')));
});
