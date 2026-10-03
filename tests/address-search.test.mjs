import test from 'node:test';
import assert from 'node:assert/strict';
import {searchAddresses} from '../lib/address-search.mjs';
const feature=(name,coordinates=[106.69,10.77],countrycode='VN')=>({properties:{name,street:'Lê Lợi',city:'Thành phố Hồ Chí Minh',countrycode,country:'Việt Nam'},geometry:{type:'Point',coordinates}});
test('search filters Vietnam, normalizes labels and coordinates, deduplicates and caches',async()=>{
 let calls=0;const request=async(url,options)=>{calls++;const u=new URL(url);assert.equal(u.searchParams.get('q'),'Chợ Bến Thành');assert.equal(u.searchParams.get('countrycode'),'VN');assert.equal(u.searchParams.get('limit'),'8');assert.ok(options.signal);return Response.json({features:[feature('Chợ Bến Thành'),feature('Chợ Bến Thành'),feature('Wrong country',[106,10],'KH'),feature('Invalid',[NaN,10]),feature('<img onerror=alert(1)>')]});};
 const a=await searchAddresses('  Chợ  Bến Thành ',request);assert.equal(a.matches.length,2);assert.deepEqual(a.matches[0],{label:'Chợ Bến Thành, Lê Lợi, Thành phố Hồ Chí Minh, Việt Nam',lat:10.77,lng:106.69});assert.match(a.matches[1].label,/^<img/);assert.deepEqual(await searchAddresses('Chợ Bến Thành',request),a);assert.equal(calls,1);
});
test('invalid queries never call provider and upstream errors remain retryable',async()=>{
 for(const q of ['',null,'ab','x'.repeat(251)])await assert.rejects(searchAddresses(q,()=>{throw Error('must not call')}),/Nhập địa chỉ/);
 await assert.rejects(searchAddresses('provider failure',async()=>new Response('',{status:429})),/đang bận/);
 const retry=await searchAddresses('provider failure',async()=>Response.json({features:[]}));assert.deepEqual(retry,{matches:[]});
});
test('simultaneous identical requests share one provider call',async()=>{
 let resolve,calls=0;const request=()=>{calls++;return new Promise(r=>resolve=r)};
 const a=searchAddresses('same in flight',request),b=searchAddresses('same in flight',request);
 resolve(Response.json({features:[feature('Same')]}));assert.deepEqual(await a,await b);assert.equal(calls,1);
});
