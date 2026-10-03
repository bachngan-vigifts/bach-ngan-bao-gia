import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryAlerts,quotationDeliverySummary} from '../lib/quotation-delivery.mjs';
const record=(rows,extra={})=>({quote:{id:'q1',quoteNo:'BG1'},data:{contractDocument:{contractNumber:'HD1'},customer:'Khách A',rows,...extra}});
test('delivery alerts exclude drafts and delivered/cancelled lines; date priority and horizon are exact',()=>{
 const rows=[{sku:'late',qty:2,deliveryDate:'2026-09-30'},{sku:'today',qty:1,deliveryDate:'2026-10-02'},{sku:'next',qty:3,deliveryDate:'2026-10-09'},{sku:'far',qty:1,deliveryDate:'2026-10-10'},{qty:1,deliveryDate:'2026-10-02',status:'Đã giao hàng'},{qty:1,deliveryDate:'2026-10-02',status:'Đã hủy'},{qty:1}];
 const result=deliveryAlerts([record(rows),record(rows,{contractDocument:undefined})],'2026-10-01T17:10:00Z');
 assert.equal(result.contracts.length,1);assert.equal(result.products.length,3);assert.equal(result.contracts[0].deliveryDate,'2026-09-30');assert.deepEqual(result.products.map(p=>p.urgency),['overdue','today','upcoming']);
});
test('quote date fallback, CRM success, all-done and lost contracts',()=>{
 const records=[{...record([{qty:1}],{contractDocument:undefined,deliveryDate:'2026-10-02'}),crm:{status:'existing',contractNumber:'CRM1'}},record([{qty:1,status:'Đã giao hàng'}],{deliveryDate:'2026-10-02'}),record([{qty:1}],{deliveryDate:'2026-10-02',careStatus:'lost'})];
 const result=deliveryAlerts(records,'2026-10-02T10:00:00Z');assert.equal(result.products.length,1);assert.equal(result.contracts[0].contractNumber,'CRM1');
});
test('delivery endpoint rejects supplier and inactive viewer before querying',async()=>{
 await assert.rejects(()=>quotationDeliverySummary(null,null,{role:'supplier',active:1}),e=>e.status===403);await assert.rejects(()=>quotationDeliverySummary(null,null,{role:'employee',active:0}),e=>e.status===403);
});
