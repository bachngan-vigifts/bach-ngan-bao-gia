import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateContractProfit,profitPeriods,quotationProfitSummary} from '../lib/quotation-profit.mjs';
const data=(generatedAt,extra={})=>({type:'B2B',date:'2026-09-01',contractDocument:{contractNumber:'HD1',generatedAt},rows:[{qty:2,price:100000,costPrice:60000,printFee:10000,printing:{unitPrice:5000}}],shipping:{rate:0,extra:10000,payer:'sender'},...extra});
test('Vietnam midnight, Monday week and year boundaries',()=>{
 assert.deepEqual(profitPeriods('2026-10-01T17:01:00Z'),{today:'2026-10-02',starts:{day:'2026-10-02',week:'2026-09-28',month:'2026-10-01',year:'2026-01-01'}});
 assert.equal(profitPeriods('2025-12-31T17:00:00Z').starts.week,'2025-12-29');
});
test('only generated contracts; profit excludes VAT, purchase, printing and sender freight',()=>{
 const rows=[{data:data('2026-10-01T17:10:00Z')},{data:data('2026-09-28T01:00:00Z')},{data:data('2026-01-01T01:00:00Z')},{data:data('',{contractDocument:undefined})},{data:data('',{contractDocument:undefined}),crm:{status:'error',contractNumber:'failed'}},{data:data('2026-10-03T01:00:00Z')}];
 const p=aggregateContractProfit(rows,'2026-10-02T10:00:00Z').periods;
 assert.equal(p.day.profit,80000);assert.equal(p.day.count,1);assert.equal(p.week.count,2);assert.equal(p.month.count,1);assert.equal(p.year.count,3);assert.equal(p.day.incompleteCount,0);
 const receiver=aggregateContractProfit([{data:data('2026-10-02',{shipping:{payer:'receiver'}})}],'2026-10-02T10:00:00Z');assert.equal(receiver.periods.day.profit,90000);
});
test('CRM success counts once alongside document; legacy dates and missing costs are visible',()=>{
 const rows=[{data:data('',{contractDocument:undefined}),crm:{status:'created',contractNumber:'CRM',createdAt:'2026-10-02T01:00:00Z'}},{data:data('',{date:'2026-10-02',rows:[{qty:1,price:10}]})}];
 const p=aggregateContractProfit(rows,'2026-10-02T10:00:00Z').periods.day;assert.equal(p.count,2);assert.equal(p.legacyDateCount,1);assert.equal(p.incompleteCount,1);
});
test('aggregate reads all pages including old unindexed R2 payloads; failures do not return false zero',async()=>{
 const rows=Array.from({length:161},(_,i)=>({cursorRow:i+1,quoteNo:String(i),data:JSON.stringify(data('2026-10-02'))}));
 const db={prepare(sql){if(sql.includes('contract_statuses'))return {all:async()=>({results:[]})};return {bind(n){return {all:async()=>({results:rows.filter(r=>r.cursorRow>n).slice(0,80)})}}}}};
 assert.equal((await quotationProfitSummary(db,null,{role:'manager'},'2026-10-02T10:00:00Z')).periods.day.count,161);
 await assert.rejects(()=>quotationProfitSummary(db,null,{role:'employee'}),e=>e.status===403);
 rows[0].data=JSON.stringify({r2Key:'quotations/missing.json'});
 await assert.rejects(()=>quotationProfitSummary(db,{get:async()=>null},{role:'manager'}),e=>e.status===503);
});
