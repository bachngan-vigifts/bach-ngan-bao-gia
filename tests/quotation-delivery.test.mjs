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

test('contract terms resolve literal dates, relative calendar days and flag missing anchors',async()=>{
 const {contractDeliveryDate,validDeliveryDate}=await import('../lib/contract-delivery-date.mjs');
 const data=terms=>({contractDocument:{details:{deliveryTime:terms}}});
 assert.equal(validDeliveryDate('31/02/2026'),'');assert.equal(validDeliveryDate('5/10/2026'),'2026-10-05');
 assert.equal(contractDeliveryDate(data('Giao hàng ngày 05/10/2026')).date,'2026-10-05');
 assert.equal(contractDeliveryDate(data('10 ngày kể từ ngày ký 01/10/2026')).date,'2026-10-11');
 const relative=data('10-15 ngày sau khi nhận tạm ứng');assert.equal(contractDeliveryDate(relative).date,'');relative.contractDocument.details.depositReceivedDate='2026-10-01';assert.equal(contractDeliveryDate(relative).date,'2026-10-16');
 assert.equal(contractDeliveryDate(data('10 ngày làm việc sau khi ký hợp đồng')).date,'');
 const edited=data('Ngày 02/10/2026');edited.contractDocument.wordEdits=[{text:'Thời gian giao hàng: 06/10/2026'}];assert.equal(contractDeliveryDate(edited).date,'2026-10-06');
 assert.equal(contractDeliveryDate(edited,{deliveryDate:'2026-10-07'}).date,'2026-10-07');
 const summary=deliveryAlerts([record([{qty:1}],{contractDocument:{contractNumber:'HD2',details:{deliveryTime:'Giao ngày 03/10/2026'}}})],'2026-10-03T00:00:00Z');assert.equal(summary.contracts[0].deliveryDate,'2026-10-03');
});
