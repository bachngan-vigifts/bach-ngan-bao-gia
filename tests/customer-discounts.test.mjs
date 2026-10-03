import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/quote-math.js';
import {validateQuotation} from '../lib/quotation-store.mjs';
test('brand discounts distinguish Lys, retain zero, and convert money mode',()=>{
 const d={minhLong:35,lys:42.5,lock:0},f=QuoteMath.customerDiscount;
 assert.equal(f('MINH LONG - LYS',d),42.5);
 assert.equal(f('MINH LONG I',d),35);
 assert.equal(f('Minh Long',d,'amount',100000),35000);
 assert.equal(f('Lock',d),0);
 assert.equal(f('Khác',d),0);
 assert.equal(f('MINH LONG',{}),0);
 assert.equal(f('Lock',{lock:101}),0);
});
test('saved quotations preserve customer tax code and discount snapshot',()=>{
 const q={type:'HRC',quoteNo:'TEST',vat:8,rows:[{sku:'TEST-SP',name:'Sản phẩm mẫu',qty:1,price:100000}],customerCode:'KH001',customerTaxCode:'0012345678',customerDiscounts:{minhLong:35,lys:42.5,lock:0}};
 const saved=validateQuotation(q);
 assert.deepEqual(saved.customerDiscounts,q.customerDiscounts);
 assert.equal(saved.customerTaxCode,'0012345678');assert.equal(saved.customerCode,'KH001');
 for(const value of [-1,101,'35',Infinity])assert.throws(()=>validateQuotation({...q,customerDiscounts:{lys:value}}));
 assert.equal(validateQuotation({type:'B2B',quoteNo:'OLD',vat:0,rows:[{sku:'TEST-SP',name:'Sản phẩm mẫu',qty:1,price:100000}]}).customerDiscounts,undefined);
});
