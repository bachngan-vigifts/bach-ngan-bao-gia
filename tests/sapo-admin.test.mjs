import assert from 'node:assert/strict';
import test from 'node:test';
import {checkSapoAdminHealth,getSapoRuntimeSessionStatus,sapoAdminRequest,storeSapoRuntimeSession} from '../lib/sapo-admin.mjs';

class FakeD1 {
 constructor(){this.row=null;}
 prepare(sql){
  return {
   bind:(...args)=>({
    run:async()=>{
     if(/INSERT INTO sapo_runtime_sessions/i.test(sql)){
      this.row={id:args[0],encrypted_cookie:args[1],updated_at:args[2],updated_by:args[3]};
     }
     return {success:true};
    },
    first:async()=>/SELECT encrypted_cookie/i.test(sql)?(this.row?{encrypted_cookie:this.row.encrypted_cookie}:null):/SELECT updated_at/i.test(sql)?(this.row?{updated_at:this.row.updated_at,updated_by:this.row.updated_by}:null):null,
   }),
   run:async()=>({success:true}),
  };
 }
}

test('sapo admin accepts valid JSON containing last_login fields',async()=>{
 const request=async()=>new Response(JSON.stringify({accounts:[{id:1,full_name:'Nhân viên A',last_login:'2026-09-16T00:00:00Z'}]}),{status:200,headers:{'Content-Type':'application/json'}});
 const body=await sapoAdminRequest({SAPO_ADMIN_COOKIE:'session=ok'},'/accounts.json',{},request);
 assert.equal(body.accounts[0].last_login,'2026-09-16T00:00:00Z');
});

test('sapo admin still reports login pages as expired sessions',async()=>{
 const request=async()=>new Response('<html><form action="/admin/login">login</form></html>',{status:200,headers:{'Content-Type':'text/html'}});
 await assert.rejects(()=>sapoAdminRequest({SAPO_ADMIN_COOKIE:'session=old'},'/accounts.json',{},request),error=>error.code==='SAPO_SESSION_EXPIRED'&&error.status===503);
});

test('sapo admin separates expired, permission and upstream errors',async()=>{
 await assert.rejects(()=>sapoAdminRequest({SAPO_ADMIN_COOKIE:'session=old'},'/accounts.json',{},async()=>new Response('',{status:401})),error=>error.code==='SAPO_SESSION_EXPIRED'&&error.status===503);
 await assert.rejects(()=>sapoAdminRequest({SAPO_ADMIN_COOKIE:'session=limited'},'/accounts.json',{},async()=>new Response(JSON.stringify({errors:'forbidden'}),{status:403})),error=>error.code==='SAPO_PERMISSION_DENIED'&&error.status===403);
 await assert.rejects(()=>sapoAdminRequest({SAPO_ADMIN_COOKIE:'session=ok'},'/accounts.json',{},async()=>new Response('Sapo broke',{status:500})),error=>error.code==='SAPO_DIRECT_HTTP_ERROR'&&error.status===500);
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
 await assert.rejects(checkSapoConnection({SAPO_ADMIN_COOKIE:'session=test'},async()=>new Response('<html><form action="/admin/login">Sign in</form></html>',{headers:{'Content-Type':'text/html'}})),e=>e.code==='SAPO_SESSION_EXPIRED'&&e.status===503);
 await assert.rejects(checkSapoConnection({SAPO_ADMIN_COOKIE:'session=test'},async()=>new Response('{}')),e=>e.status===502);
});

test('sapo runtime session persists in DB and overrides deployment cookie',async()=>{
 const DB=new FakeD1(),env={DB,STAFF_ACTIVATION_SEEDS:'seed-for-tests',SAPO_ADMIN_COOKIE:'session=old'};
 await storeSapoRuntimeSession(DB,env,'_admin_session_id=runtime; sapo-admin=ok','manager');
 let receivedCookie='';
 const request=async(_url,options)=>{receivedCookie=options.headers.cookie;return new Response('{}',{status:200});};
 await sapoAdminRequest(env,'/accounts.json',{},request);
 assert.equal(receivedCookie,'_admin_session_id=runtime; sapo-admin=ok');
 const restartedEnv={DB,STAFF_ACTIVATION_SEEDS:'seed-for-tests',SAPO_ADMIN_COOKIE:'session=old'};
 await sapoAdminRequest(restartedEnv,'/accounts.json',{},request);
 assert.equal(receivedCookie,'_admin_session_id=runtime; sapo-admin=ok');
 const status=await getSapoRuntimeSessionStatus(DB,restartedEnv);
 assert.equal(status.configured,true);
 assert.equal(status.runtimeReadable,true);
 assert.equal(status.activeSource,'runtime_session');
});

test('sapo admin falls back to deployment cookie when runtime session expired',async()=>{
 const DB=new FakeD1(),env={DB,STAFF_ACTIVATION_SEEDS:'seed-for-tests',SAPO_ADMIN_COOKIE:'session=fresh-env'};
 await storeSapoRuntimeSession(DB,env,'_admin_session_id=expired-runtime; sapo-admin=old','manager');
 const cookies=[];
 const request=async(_url,options)=>{
  cookies.push(options.headers.cookie);
  if(options.headers.cookie.includes('expired-runtime'))return new Response('<html><form action="/admin/login">login</form></html>',{status:200,headers:{'Content-Type':'text/html'}});
  return new Response(JSON.stringify({accounts:[{id:1}]}),{status:200});
 };
 const body=await sapoAdminRequest(env,'/accounts.json',{},request);
 assert.deepEqual(cookies,['_admin_session_id=expired-runtime; sapo-admin=old','session=fresh-env']);
 assert.equal(body.__sapoActiveSource,'deployment_env');
 const health=await checkSapoAdminHealth(env,request);
 assert.equal(health.ok,true);
 assert.equal(health.activeSource,'deployment_env');
});

test('sapo health check returns safe status without exposing cookies',async()=>{
 const DB=new FakeD1(),env={DB,STAFF_ACTIVATION_SEEDS:'seed-for-tests',SAPO_ADMIN_COOKIE:'session=old',SAPO_COOKIE_REFRESH_WARN_HOURS:'0.000001'};
 await storeSapoRuntimeSession(DB,env,'_admin_session_id=runtime-health; sapo-admin=ok','manager');
 const health=await checkSapoAdminHealth(env,async()=>new Response(JSON.stringify({accounts:[{id:1}]}),{status:200}));
 assert.equal(health.ok,true);
 assert.equal(health.code,'SAPO_HEALTH_OK');
 assert.equal(health.activeSource,'runtime_session');
 assert.equal(JSON.stringify(health).includes('runtime-health'),false);
});
