import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {triggerSapoStaffSync} from '../lib/sapo-staff-sync.mjs';

async function testDb(){
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB']});
 const db=await mf.getD1Database('DB');
 for(const file of readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await db.prepare("INSERT OR IGNORE INTO staff_positions(id,name) VALUES('sale','Sales')").run();
 return {mf,db};
}

test('falls back to Sapo direct when the staff webhook returns HTTP 530',async()=>{
 const {mf,db}=await testDb();
 try{
  const fetchImpl=async url=>{
   if(url==='https://sync.example.test/webhook')return new Response('',{status:530});
   if(url==='https://sapo.example.test/admin/accounts.json?limit=100')return Response.json({accounts:[{id:12,full_name:'Nhân viên Sapo',email:'staff@example.com',phone:'0900000000',status:'active'}]});
   throw new Error('Unexpected request: '+url);
  };
  const result=await triggerSapoStaffSync({DB:db,SAPO_STAFF_SYNC_WEBHOOK_URL:'https://sync.example.test/webhook',SAPO_ADMIN_BASE:'https://sapo.example.test/admin',SAPO_ADMIN_COOKIE:'session=ok'},fetchImpl);
  assert.equal(result.source,'sapo-direct');
  assert.equal(result.received,1);
  assert.equal((await db.prepare("SELECT name FROM staff_members WHERE id='SAPO-12'").first()).name,'Nhân viên Sapo');
 }finally{await mf.dispose();}
});

test('reports an expired direct Sapo session after a webhook HTTP 530',async()=>{
 const {mf,db}=await testDb();
 try{
  const fetchImpl=async url=>url==='https://sync.example.test/webhook'
   ?new Response('',{status:530})
   :new Response('<form action="/admin/login">', {status:200,headers:{'content-type':'text/html'}});
  await assert.rejects(()=>triggerSapoStaffSync({DB:db,SAPO_STAFF_SYNC_WEBHOOK_URL:'https://sync.example.test/webhook',SAPO_ADMIN_BASE:'https://sapo.example.test/admin',SAPO_ADMIN_COOKIE:'session=old'},fetchImpl),/Phiên Sapo direct hết hạn/);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM staff_members').first()).count,0);
 }finally{await mf.dispose();}
});
