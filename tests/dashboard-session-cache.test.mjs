import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardCached,clearDashboardCache,DASHBOARD_CACHE_MS} from '../lib/dashboard-session-cache.mjs';
function storage(){const data=new Map();return {get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
test('repeat opens reuse successful report; TTL and explicit refresh fetch again',async()=>{
 const s=storage();let calls=0,time=1000;const run=(force=false)=>dashboardCached(s,'manager-A/day','profit',async()=>({value:++calls}),{force,now:()=>time});
 assert.deepEqual(await run(),{value:1});assert.deepEqual(await run(),{value:1});assert.equal(calls,1);
 time+=DASHBOARD_CACHE_MS;assert.deepEqual(await run(),{value:2});assert.deepEqual(await run(true),{value:3});
});
test('accounts, roles and date scopes never reuse each other’s report',async()=>{
 const s=storage();for(const scope of ['A/manager/day1','B/manager/day1','A/staff/day1','A/manager/day2'])assert.equal(await dashboardCached(s,scope,'profit',async()=>scope),scope);
 s.setItem('other','keep');clearDashboardCache(s);assert.equal(s.length,1);assert.equal(s.getItem('other'),'keep');
});
test('failed requests are retried and unavailable storage does not block reports',async()=>{
 const s=storage();await assert.rejects(dashboardCached(s,'A','profit',async()=>{throw Error('offline');}));assert.equal(s.length,0);
 assert.equal(await dashboardCached(s,'A','profit',async()=>42),42);
 assert.equal(await dashboardCached(null,'A','profit',async()=>43),43);
});
