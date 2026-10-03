import assert from 'node:assert/strict';
import test from 'node:test';
import {loadLalamoveHistory} from '../lib/lalamove-history.mjs';

test('Lalamove history uses the public GET filters',async()=>{
 const result=await loadLalamoveHistory({q:'BG-001',customer_phone:'0900000000',limit:99},async(url,options)=>{assert.equal(url,'https://n8nthai.moarchvn.com/webhook/lalamove-history-for-quote-web?limit=99&phone=0900000000&search=BG-001');assert.equal(options.method,'GET');return new Response('{"success":true,"ok":true,"addresses":[{"pickup_address":"Kho"}]}');});
 assert.equal(result.addresses.length,1);
});
