import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateQuotation} from '../lib/quotation-store.mjs';
import '../public/quote-math.js';
const ctx=vm.createContext({});vm.runInContext(readFileSync('public/shipping.js','utf8'),ctx);
test('partial cartons, per-carton volumetric charge, missing data and saved dimensions',()=>{
 const r={sku:'A',qty:81,perCarton:80,cartonWeight:19.8,cartonLength:51.5,cartonWidth:27.5,cartonHeight:34.5};
 const s={divisor:5000,rate:10000,extra:20000};const result=ctx.Shipping.calculate([r],s);
 assert.equal(result.cartons,1.0125);assert.equal(result.kg,20.0475);assert.equal(result.groups[0].note,'1 thùng x 80 cái + lẻ 1 cái');assert.equal(result.fee,220475);
 assert.equal(ctx.Shipping.calculate([{...r,cartonWeight:1}],s).billable,51.5*27.5*34.5/5000*1.0125);
 assert.equal(ctx.Shipping.calculate([{sku:'boxes-only',qty:100,perCarton:8,cartonWeight:0,cartonLength:39.2,cartonWidth:20.7,cartonHeight:31.5}],s).cartons,12.5);
 assert.equal(ctx.Shipping.calculate([r,{sku:'missing',qty:1}],s).fee,null);
 assert.equal(ctx.Shipping.calculate([{...r,qty:0}],s).cartons,0);
 const saved=validateQuotation({type:'HRC',quoteNo:'test',vat:8,rows:[r],shipping:s});assert.equal(saved.rows[0].cartonHeight,34.5);assert.equal(saved.shipping.rate,10000);
 assert.throws(()=>validateQuotation({type:'HRC',quoteNo:'test',vat:8,rows:[r],shipping:{divisor:0}}));
});


test('zero rate supports flat fees despite missing packing data and survives saving',()=>{
 const rows=[{sku:'flat',name:'Hàng giao trọn gói',qty:2,price:10000}];
 assert.equal(ctx.Shipping.calculate(rows,{rate:0,extra:100000}).fee,100000);
 assert.equal(ctx.Shipping.calculate(rows,{rate:0,extra:0}).fee,0);
 assert.equal(ctx.Shipping.calculate(rows,{extra:100000}).fee,100000);
 assert.equal(ctx.Shipping.calculate(rows,{}).fee,null);
 assert.equal(ctx.Shipping.calculate(rows,{rate:10000,extra:100000}).fee,null);
 const saved=validateQuotation({type:'HRC',quoteNo:'BG-FLAT',vat:8,rows,shipping:{rate:0,extra:100000}});
 assert.equal(saved.shipping.rate,0);assert.equal(saved.shipping.extra,100000);
 assert.equal(ctx.Shipping.calculate(saved.rows,saved.shipping).fee,100000);
});


test('sender shipping is deducted from gross profit, receiver shipping is not',()=>{
 const quote={type:'HRC',quoteNo:'BG-PROFIT',vat:8,rows:[{sku:'A',name:'Sản phẩm',qty:2,price:100000,costPrice:60000}],shipping:{rate:0,extra:100000,payer:'sender'}};
 const saved=validateQuotation(quote),fee=ctx.Shipping.calculate(saved.rows,saved.shipping).fee;
 assert.equal(saved.shipping.payer,'sender');
 const sender=QuoteMath.profit(saved,fee);
 assert.equal(sender.revenue,200000);assert.equal(sender.cost,120000);assert.equal(sender.shippingCost,100000);assert.equal(sender.gross,-20000);assert.equal(sender.margin,-10);
 const receiver=QuoteMath.profit({...saved,shipping:{...saved.shipping,payer:'receiver'}},fee);
 assert.equal(receiver.gross,80000);assert.equal(receiver.shippingCost,0);assert.equal(receiver.margin,40);
 assert.equal(QuoteMath.profit(saved,null).gross,80000);
 assert.equal(QuoteMath.profit({...saved,shipping:{...saved.shipping,payer:undefined}},fee).gross,80000);
 assert.equal(QuoteMath.totals(saved).total,216000);
 assert.throws(()=>validateQuotation({...quote,shipping:{...quote.shipping,payer:'invalid'}}));
});
