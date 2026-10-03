import test from 'node:test';
import assert from 'node:assert/strict';
import {revalidatedList,clearListCache} from '../lib/list-session-cache.mjs';
import {immutableJson} from '../lib/immutable-json-cache.mjs';
const storage=()=>{const s={};Object.defineProperties(s,{getItem:{value:k=>s[k]||null},setItem:{value:(k,v)=>s[k]=v},removeItem:{value:k=>delete s[k]}});return s;};
test('snapshot renders first but every visit checks new data, isolated by account and query',async()=>{
 const s=storage(),seen=[];let calls=0;
 await revalidatedList(s,'a','/customers?q=a',async()=>{calls++;return [1];},()=>{});
 await revalidatedList(s,'a','/customers?q=a',async()=>{calls++;return [2];},v=>seen.push(v));
 assert.deepEqual(seen,[[1],[2]]);assert.equal(calls,2);
 const other=[];await revalidatedList(s,'b','/customers?q=a',async()=>[3],v=>other.push(v));assert.deepEqual(other,[[3]]);
 const query=[];await revalidatedList(s,'a','/customers?q=b',async()=>[4],v=>query.push(v));assert.deepEqual(query,[[4]]);
 clearListCache(s);assert.equal(Object.keys(s).length,0);
});
test('forced refresh, expiration, read errors, unavailable storage',async()=>{
 const s=storage();await revalidatedList(s,'a','/quotes',async()=>[1],()=>{});
 const seen=[];await revalidatedList(s,'a','/quotes',async()=>[2],v=>seen.push(v),{force:true});assert.deepEqual(seen,[[2]]);
 const expired=[];await revalidatedList(s,'a','/quotes',async()=>[3],v=>expired.push(v),{now:Date.now()+5*3600000});assert.deepEqual(expired,[[3]]);
 await assert.rejects(revalidatedList(s,'a','/quotes',async()=>{throw Error('403');},()=>{}));assert.equal(Object.keys(s).length,0);
 await revalidatedList(null,'a','/catalog',async()=>[],()=>{});
});
test('immutable catalog cache avoids reads and never shares mutable objects',async()=>{
 let reads=0;const bucket={get:async k=>{reads++;return {json:async()=>({key:k,products:[{stock:1}]})};}};
 const first=await immutableJson(bucket,'catalogs/a',{now:1});first.products[0].stock=99;
 assert.equal((await immutableJson(bucket,'catalogs/a',{now:2})).products[0].stock,1);assert.equal(reads,1);
 await immutableJson(bucket,'catalogs/b',{now:2});assert.equal(reads,2);
 await immutableJson(bucket,'catalogs/a',{now:5*3600000});assert.equal(reads,3);
});
