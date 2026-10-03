import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/quote-math.js';
import {validateQuotation} from '../lib/quotation-store.mjs';
test('amount discounts persist and reduce each unit before printing fees and VAT',()=>{
 const q={type:'B2B',quoteNo:'amount',vat:8,notes:'',notesVersion:2,rows:[{price:100000,qty:3,discount:12000,discountType:'amount',printFee:2000}]};
 const saved=validateQuotation(q);
 assert.equal(saved.rows[0].discountType,'amount');assert.equal(saved.notesVersion,2);assert.equal(saved.notes,'');
 assert.equal(QuoteMath.after(saved.rows[0],saved),90000);assert.equal(QuoteMath.totals(saved).total,291600);
 assert.throws(()=>validateQuotation({...q,rows:[{...q.rows[0],discount:100001}]}));
 assert.throws(()=>validateQuotation({...q,rows:[{...q.rows[0],discountType:'percent',discount:101}]}));
});
test('price after CK includes print fee for B2B and Vigifts only',()=>{
 const row={price:100000,discount:10,discountType:'percent',printFee:5000,qty:1};
 assert.equal(QuoteMath.after(row,{type:'HRC'}),90000);
 assert.equal(QuoteMath.after(row,{type:'B2B'}),95000);
 assert.equal(QuoteMath.after(row,{type:'VIGIFTS'}),95000);
});
test('legacy quotes and mixed Sapo VAT preserve correct totals',()=>{
 const old={type:'HRC',vat:8,rows:[{price:100,qty:2,discount:10}]};
 assert.deepEqual(QuoteMath.totals(old),{subtotal:180,tax:14.4,total:194.4,label:'Thuế VAT 8%'});
 const mixed={type:'B2B',vat:8,rows:[{price:100,qty:2,discount:0,printFee:10,taxRate:8},{price:200,qty:1,discount:0,taxRate:5}]};
 assert.equal(QuoteMath.totals(mixed).tax,27.6);
 assert.equal(QuoteMath.totals(mixed).label,'Thuế VAT theo sản phẩm');
 assert.equal(QuoteMath.netPrice(108,8,true),100);
 const saved=validateQuotation({...mixed,quoteNo:'Test',rows:mixed.rows.map(r=>({...r,pricePolicy:'Retail'}))});
 assert.deepEqual(QuoteMath.totals(saved),QuoteMath.totals(mixed));
 assert.equal(saved.rows[1].pricePolicy,'Retail');
});
test('Vigifts keeps exact discounted unit price, printing fee and persisted description',()=>{
 const quote={type:'VIGIFTS',quoteNo:'VIGIFTS-TEST',vat:8,rows:[{price:690741,discount:53,printFee:25000,qty:500,taxRate:8,printDescription:'in logo màu tại 01 vị trí'}]};
 const stored=validateQuotation(quote);
 assert.equal(stored.type,'VIGIFTS');assert.equal(stored.rows[0].printDescription,quote.rows[0].printDescription);
 assert.equal(QuoteMath.after(stored.rows[0],stored),349648.27);
 assert.equal(QuoteMath.totals(stored).subtotal,174824135);
 assert.equal(QuoteMath.totals(stored).total,188810065.8);
});
test('default cost price follows purchase discounts by brand',()=>{
 assert.equal(QuoteMath.purchasePrice(100000,58),42000);
 assert.equal(QuoteMath.defaultCostPrice({brand:'LocknLock'},100000),42000);
 assert.equal(QuoteMath.defaultCostPrice({brand:'MINH LONG'},100000),75000);
 assert.equal(QuoteMath.defaultCostPrice({brand:'MINH LONG - LYS'},100000),81000);
 assert.equal(QuoteMath.defaultCostPrice({name:'Nồi Healthy Cook'},100000),85000);
 assert.equal(QuoteMath.defaultCostPrice({brand:'Khác'},100000),0);
});

test('printing workshop defaults follow printed products and processing cost reduces only internal profit',()=>{
 const quote={type:'B2B',quoteNo:'PRINT-TEST',vat:8,rows:[{brand:'Minh Long - LYS',qty:10,price:100000,costPrice:75000,printFee:10000}],printing:{workshop:'Xưởng mới',totalCost:60000,workshopExplicit:true}};
 assert.deepEqual(QuoteMath.printingInfo(quote),{enabled:true,defaultWorkshop:'Xưởng in Tiến phát'});
 const stored=validateQuotation(quote);
 assert.deepEqual(stored.printing,quote.printing);
 assert.equal(QuoteMath.profit(stored).printingCost,60000);
 assert.equal(QuoteMath.profit(stored).gross,290000);
 assert.equal(QuoteMath.totals(stored).subtotal,1100000);
 assert.equal(QuoteMath.printingInfo({...quote,type:'VIGIFTS',rows:[{brand:'LocknLock',qty:1,printFee:10}]}).defaultWorkshop,'Thương Bé Ba');
 assert.equal(QuoteMath.printingInfo({...quote,rows:[{brand:'Khác',qty:1,printFee:10}]}).defaultWorkshop,'Thương Bé Ba');
 assert.equal(QuoteMath.profit({...quote,type:'HRC'}).printingCost,0);
 assert.equal(QuoteMath.printingInfo({...quote,rows:[{...quote.rows[0],printFee:0}]}).enabled,false);
 assert.equal(QuoteMath.profit({...quote,rows:[{...quote.rows[0],printFee:0}]}).printingCost,0);
 assert.throws(()=>validateQuotation({...quote,printing:{totalCost:-1}}));
});

test('per-product printing unit costs multiply by quote quantities and persist independently',()=>{
 const quote={type:'B2B',quoteNo:'PRINT-LINES',vat:8,rows:[{sku:'ML',brand:'Minh Long',qty:10,price:100000,printFee:10000,printing:{workshop:'Tiến phát',unitPrice:6000,workshopExplicit:true}},{sku:'LOCK',brand:'LocknLock',qty:4,price:50000,printFee:2000,printing:{workshop:'Thương Bé Ba',unitPrice:1000,workshopExplicit:true}}],printing:{totalCost:999999}};
 const saved=validateQuotation(quote);
 assert.equal(QuoteMath.profit(saved).printingCost,64000);
 assert.deepEqual(saved.rows.map(row=>row.printing),quote.rows.map(row=>row.printing));
 saved.rows[0].qty=20;assert.equal(QuoteMath.profit(saved).printingCost,124000);
 saved.rows.splice(0,1);assert.equal(QuoteMath.profit(saved).printingCost,4000);
 assert.equal(QuoteMath.profit({...saved,type:'HRC'}).printingCost,0);
 assert.throws(()=>validateQuotation({...quote,rows:[{...quote.rows[0],printing:{unitPrice:-1}}]}));
});
