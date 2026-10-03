import test from 'node:test';
import assert from 'node:assert/strict';
import {quotationProfitSummary,aggregateContractProfit} from '../lib/quotation-profit.mjs';
import {derivedReportCache,REPORT_CACHE_MS} from '../lib/report-derived-cache.mjs';
import {quotationDeliverySummary,deliveryAlerts} from '../lib/quotation-delivery.mjs';
function fixture(){
 const objects=new Map(),reads=[];let rows=[],statuses=[];
 const bucket={get:async key=>{reads.push(key);const value=objects.get(key);return value===undefined?null:{json:async()=>JSON.parse(value)};},put:async(key,value)=>objects.set(key,value)};
 const db={prepare(sql){if(sql.includes('contract_statuses'))return {all:async()=>({results:statuses})};return {bind(cursor){return {all:async()=>({results:rows.filter(r=>r.cursorRow>cursor).slice(0,80)})};}};}};
 const data=(cost=5)=>({date:'2026-10-02',contractDocument:{contractNumber:'HD',generatedAt:'2026-10-02'},rows:[{qty:2,price:10,costPrice:cost}],shipping:{payer:'receiver'}});
 const add=(id,payload=data())=>{const key=`quotations/u/q${id}.json`;objects.set(key,JSON.stringify(payload));rows.push({cursorRow:id,quoteNo:'BG'+id,data:JSON.stringify({r2Key:key})});};
 return {bucket,db,objects,reads,data,add,get rows(){return rows;},set rows(value){rows=value;},set statuses(value){statuses=value;}};
}
test('unchanged reports skip payload reads; edits, new and deleted quotes reconcile exactly',async()=>{
 const f=fixture();f.add(1);f.add(2);const now='2026-10-02T10:00:00Z',viewer={role:'manager'};
 const run=()=>quotationProfitSummary(f.db,f.bucket,viewer,now);
 const first=await run();assert.equal(f.reads.filter(k=>k.startsWith('quotations/')).length,2);
 f.reads.length=0;assert.deepEqual(await run(),first);assert.equal(f.reads.filter(k=>k.startsWith('quotations/')).length,0);
 const updated=f.data(7);f.objects.set('quotations/u/changed.json',JSON.stringify(updated));f.rows[0].data=JSON.stringify({r2Key:'quotations/u/changed.json'});
 f.add(3);f.reads.length=0;const changed=await run();assert.equal(f.reads.filter(k=>k.startsWith('quotations/')).length,2);
 assert.deepEqual(changed,aggregateContractProfit([{data:updated},{data:f.data()},{data:f.data()}],now));
 f.rows=f.rows.filter(r=>r.cursorRow!==2);f.reads.length=0;
 assert.equal((await run()).periods.day.count,2);assert.equal(f.reads.filter(k=>k.startsWith('quotations/')).length,0);
});
test('CRM changes invalidate unchanged quote; force and four-hour TTL recheck payloads',async()=>{
 const f=fixture();const payload=f.data();delete payload.contractDocument;f.add(1,payload);
 const now='2026-10-02T10:00:00Z',viewer={role:'manager'};
 assert.equal((await quotationProfitSummary(f.db,f.bucket,viewer,now)).periods.day.count,0);
 f.statuses=[{quoteNumber:'BG1',contractNumber:'CRM1',status:'created',createdAt:'2026-10-02'}];
 assert.equal((await quotationProfitSummary(f.db,f.bucket,viewer,now)).periods.day.count,1);
 f.reads.length=0;await quotationProfitSummary(f.db,f.bucket,viewer,now,{force:true});assert.equal(f.reads.filter(k=>k.startsWith('quotations/')).length,1);
 f.reads.length=0;await quotationProfitSummary(f.db,f.bucket,viewer,new Date(Date.parse(now)+REPORT_CACHE_MS));assert.equal(f.reads.filter(k=>k.startsWith('quotations/')).length,1);
});
test('cached contributions use current Vietnam periods at midnight',async()=>{
 const f=fixture();f.add(1);const viewer={role:'manager'};
 assert.equal((await quotationProfitSummary(f.db,f.bucket,viewer,'2026-10-02T16:59:00Z')).periods.day.count,1);
 f.reads.length=0;const after=await quotationProfitSummary(f.db,f.bucket,viewer,'2026-10-02T17:01:00Z');assert.equal(after.periods.day.count,0);assert.equal(after.periods.month.count,1);assert.equal(f.reads.filter(k=>k.startsWith('quotations/')).length,0);
});
test('cache unavailable falls back and failed calculations are not saved',async()=>{
 const cache=await derivedReportCache({get:async()=>{throw Error('unavailable');},put:async()=>{throw Error('unavailable');}},'test');
 assert.equal(await cache.get('q','v',async()=>42),42);await cache.save();
 await assert.rejects(cache.get('bad','v',async()=>{throw Error('source unavailable');}));
});
test('delivery reuse still drops removed rows and reacts to completion and owner metadata',async()=>{
 const f=fixture(),payload=f.data();payload.deliveryDate='2026-01-01';f.add(1,payload);f.add(2,payload);
 f.rows.forEach(r=>{r.id='q'+r.cursorRow;r.creatorName='Owner';});
 const viewer={role:'manager',active:1};
 const first=await quotationDeliverySummary(f.db,f.bucket,viewer);assert.equal(first.products.length,2);
 f.reads.length=0;assert.deepEqual(await quotationDeliverySummary(f.db,f.bucket,viewer),first);assert.equal(f.reads.filter(k=>k.startsWith('quotations/')).length,0);
 f.rows=f.rows.slice(0,1);f.rows[0].creatorName='New owner';
 let next=await quotationDeliverySummary(f.db,f.bucket,viewer);assert.equal(next.products.length,1);assert.equal(next.products[0].owner,'New owner');
 const finished={...payload,rows:payload.rows.map(r=>({...r,status:'Đã giao hàng'}))};f.objects.set('quotations/u/completed.json',JSON.stringify(finished));f.rows[0].data=JSON.stringify({r2Key:'quotations/u/completed.json'});
 next=await quotationDeliverySummary(f.db,f.bucket,viewer);assert.equal(next.products.length,0);
});
