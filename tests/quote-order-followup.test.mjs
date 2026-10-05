import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {approvedSapoPayload,saveOrderFollowup,applyOrderFollowup} from '../lib/quote-order-followup.mjs';
const quote={id:'q1',revision:2,approvalStatus:'approved',canEdit:true,data:{quoteNo:'BG001',type:'B2B',customer:'Customer',vat:8,rows:[{sku:'SP1',name:'Item',qty:10,price:100,discount:5,printFee:20}]}};
const input={revision:2,delivery_dates:['2026-10-20']};
test('Sapo requires approved accessible saved revision and every delivery date',()=>{
 for(const [changed,status] of [[{approvalStatus:'pending'},403],[{canEdit:false},403],[{revision:3},409]])assert.throws(()=>approvedSapoPayload({...quote,...changed},input),e=>e.status===status);
 assert.throws(()=>approvedSapoPayload(quote,{...input,delivery_dates:['2026-02-30']}),e=>e.status===400);
 const p=approvedSapoPayload(quote,{...input,total:1,items:[]});assert.equal(p.total,1242);assert.equal(p.items[0].quantity,10);assert.equal(p.items[0].delivery_date,'2026-10-20');
});
test('one web debt per quote, no deposit treated as received, delivery retained',async()=>{
 const sql=new DatabaseSync(':memory:');const db={prepare(q){const statement=sql.prepare(q);const bound=args=>({first:async()=>statement.get(...args),run:async()=>statement.run(...args)});return {...bound([]),bind:(...args)=>bound(args)};}};
 try{const p=approvedSapoPayload(quote,input),r={status:'created',sapoOrderId:1,sapoOrderCode:'BG001'};
 const a=await saveOrderFollowup(db,quote,p,r),b=await saveOrderFollowup(db,quote,{...p,total:9999},{...r,status:'existing'});
 assert.equal(a.balance,1242);assert.equal(a.paid,0);assert.equal(b.balance,1242);assert.equal(sql.prepare('SELECT COUNT(*) n FROM quote_order_followups').get().n,1);
 assert.equal(applyOrderFollowup(quote.data,a).rows[0].deliveryDate,'2026-10-20');
 await assert.rejects(saveOrderFollowup(db,quote,p,{status:'error'}),e=>e.status===502);
 }finally{sql.close();}
});
