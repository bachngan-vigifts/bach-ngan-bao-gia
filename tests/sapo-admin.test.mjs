import assert from 'node:assert/strict';
import test from 'node:test';
import {sapoAdminRequest} from '../lib/sapo-admin.mjs';

test('sapo admin accepts valid JSON containing last_login fields',async()=>{
 const request=async()=>new Response(JSON.stringify({accounts:[{id:1,full_name:'Nhân viên A',last_login:'2026-09-16T00:00:00Z'}]}),{status:200,headers:{'Content-Type':'application/json'}});
 const body=await sapoAdminRequest({SAPO_ADMIN_COOKIE:'session=ok'},'/accounts.json',{},request);
 assert.equal(body.accounts[0].last_login,'2026-09-16T00:00:00Z');
});

test('sapo admin still reports login pages as expired sessions',async()=>{
 const request=async()=>new Response('<html><form action="/admin/login">login</form></html>',{status:200,headers:{'Content-Type':'text/html'}});
 await assert.rejects(()=>sapoAdminRequest({SAPO_ADMIN_COOKIE:'session=old'},'/accounts.json',{},request),/Phiên Sapo direct hết hạn/);
});

test('sapo admin falls back to the deployment cookie when no runtime session exists',async()=>{
 let receivedCookie='';
 const request=async(_url,options)=>{receivedCookie=options.headers.cookie;return new Response('{}',{status:200});};
 await sapoAdminRequest({SAPO_ADMIN_COOKIE:'session=fallback'},'/accounts.json',{},request);
 assert.equal(receivedCookie,'session=fallback');
});

test('connection probe only reads orders and rejects a login response',async()=>{
 const {checkSapoConnection}=await import('../lib/sapo-admin.mjs');
 const calls=[];
 const result=await checkSapoConnection({SAPO_ADMIN_COOKIE:'session=test'},async(url,options)=>{calls.push({url,method:options.method||'GET'});return new Response('{"orders":[]}');});
 assert.equal(result.ok,true);assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');
 await assert.rejects(checkSapoConnection({SAPO_ADMIN_COOKIE:'session=test'},async()=>new Response('<html>Sign in</html>')),e=>e.status===502);
 await assert.rejects(checkSapoConnection({SAPO_ADMIN_COOKIE:'session=test'},async()=>new Response('{}')),e=>e.status===502);
});
