import test from 'node:test';
import assert from 'node:assert/strict';
import {validateQuotation} from '../lib/quotation-store.mjs';

const quote={type:'HRC',quoteNo:'BG-CARE-001',vat:8,customer:'Khách mẫu',rows:[{sku:'SP-01',name:'Sản phẩm mẫu',unit:'Cái',qty:1,price:100000,discount:0,printFee:0,perCarton:0,cartonWeight:0,cartonLength:0,cartonWidth:0,cartonHeight:0}]};

test('quotation keeps handover care date, assignee, and note',()=>{
 const saved=validateQuotation({...quote,careStatus:'active',careDueDate:'2026-10-01',careAssigneeId:'NV-CARE',careNote:'Gọi lại xác nhận thời gian giao.'});
 assert.equal(saved.careStatus,'active');
 assert.equal(saved.careDueDate,'2026-10-01');
 assert.equal(saved.careAssigneeId,'NV-CARE');
 assert.equal(saved.careNote,'Gọi lại xác nhận thời gian giao.');
});
