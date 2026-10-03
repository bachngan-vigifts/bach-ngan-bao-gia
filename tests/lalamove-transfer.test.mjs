import assert from 'node:assert/strict';
import test from 'node:test';
import {sendLalamoveRequest} from '../lib/lalamove-transfer.mjs';

const payload={action:'quote',quote_number:'BG-001',pickup_address:'Điểm lấy',pickup_lat:10.76,pickup_lng:106.68,dropoff_address:'Điểm giao',dropoff_lat:10.8,dropoff_lng:106.7,sender_name:'Bách Ngân',sender_phone:'0900000000',recipient_name:'Khách hàng',recipient_phone:'0911111111'};

test('Lalamove quote forwards complete coordinates to the fixed workflow',async()=>{
 const result=await sendLalamoveRequest(payload,async(url,options)=>{assert.equal(url,'https://n8nthai.moarchvn.com/webhook/lalamove-order-from-quote-web-to-claw');const body=JSON.parse(options.body);assert.equal(body.source,'quote_web');assert.equal(body.action,'quote');assert.equal(body.language,'vi_VN');return new Response('{"ok":true,"price":125000}');});
 assert.equal(result.price,125000);
});

test('Lalamove never places an order before confirmation details exist',async()=>{
 await assert.rejects(sendLalamoveRequest({...payload,action:'place_order',confirmed:true},async()=>{throw Error('Must not send');}),error=>error.status===400);
 await assert.rejects(sendLalamoveRequest({...payload,pickup_lat:''},async()=>{throw Error('Must not send');}),error=>error.status===400);
});
