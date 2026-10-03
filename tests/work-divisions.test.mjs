import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {splitRetailBranches,workContext,openReportShift,syncWorkOrders,workHistory,saveWorkReport,saveWorkConfiguration,workCashLedger} from '../lib/work-reports.mjs';
test('ML and Lock split reporting, orders and cash while preserving one Sapo location',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB']});
 try{const db=await mf.getD1Database('DB'),env={DB:db,SAPO_ADMIN_COOKIE:'test'},ml={id:'ml',role:'employee',position_id:'sales-ml'},lock={id:'lock',role:'employee',position_id:'sales-lock'},boss={id:'boss',role:'manager',position_id:'manager'},name='MINH LONG - LOCKNLOCK CẦN THƠ';
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 for(const m of [ml,lock,boss]){await db.prepare('INSERT OR IGNORE INTO staff_positions(id,name) VALUES(?,?)').bind(m.position_id,m.position_id).run();await db.prepare('INSERT INTO staff_members(id,email,name,role,position_id,created_at) VALUES(?,?,?,?,?,?)').bind(m.id,m.id+'@test.vn',m.id,m.role,m.position_id,'2026-09-28').run();}
 await db.prepare('INSERT INTO work_branches(id,name,keeper_id,updated_at) VALUES(?,?,?,?)').bind('10',name,'ml','now').run();
 for(const [m,a] of [[ml,'11'],[lock,'12']])await db.prepare('INSERT INTO work_assignments(member_id,branch_id,sapo_account_id,updated_at) VALUES(?,?,?,?)').bind(m.id,'10',a,'now').run();
 assert.equal(splitRetailBranches([{id:'10',name}]).length,2);
 assert.deepEqual((await workContext(env,boss)).branches.map(b=>b.id),['10~sales-ml','10~sales-lock']);
 assert.equal((await workContext(env,ml)).branches[0].name,'Minh Long Cần Thơ');
 assert.equal((await workContext(env,lock)).branches[0].name,'LocknLock Cần Thơ');
 const period={date:'2026-09-28',start:'08:00',end:'12:00'};
 const ms=await openReportShift(env,ml,{...period,branchId:'10~sales-ml'}),ls=await openReportShift(env,lock,{...period,branchId:'10~sales-lock'});
 assert.notEqual(ms.shift.id,ls.shift.id);assert.match(ms.shift.id,/10~sales-ml/);assert.match(ls.shift.id,/10~sales-lock/);assert.equal((await workCashLedger(env,ml,ms.shift.id)).branch.id,'10~sales-ml');assert.equal((await workCashLedger(env,lock,ls.shift.id)).branch.id,'10~sales-lock');
 await assert.rejects(()=>openReportShift(env,ml,{...period,branchId:'10~sales-lock'}));
 const mock=async url=>{const u=new URL(url);if(u.pathname.endsWith('/locations.json'))return Response.json({locations:[{id:10,label:name}]});if(u.pathname.endsWith('/accounts.json'))return Response.json({accounts:[{id:11,name:'ML'},{id:12,name:'Lock'},{id:13,name:'ML mới'}]});if(u.pathname.endsWith('/orders.json')){assert.equal(u.searchParams.get('location_ids'),'10');const account=u.searchParams.get('assignee_id');return Response.json({orders:[{id:account,location_id:10,assignee_id:account,created_on:'2026-09-28T02:00:00Z',modified_on:'2026-09-28T02:30:00Z',status:'completed',total:100}]});}return Response.json({receipts:[],payments:[]});};
 const mOrders=await syncWorkOrders(env,ml,{shiftId:ms.shift.id,branchId:'10~sales-ml'},mock);assert.deepEqual(mOrders.orders.map(o=>o.accountId),['11']);assert.equal(mOrders.orders[0].salesName,'ml');
 const lOrders=await syncWorkOrders(env,boss,{shiftId:ls.shift.id,branchId:'10~sales-lock'},mock);assert.deepEqual(lOrders.orders.map(o=>o.accountId),['12']);
 const allOrders=await syncWorkOrders(env,boss,{shiftId:ms.shift.id},mock);assert.deepEqual(allOrders.orders.map(o=>o.accountId),['11']);
 await saveWorkReport(env,ml,{shiftId:ms.shift.id,phase:'start',submit:true,data:{tasks:[{title:'Việc ML'}]}});await saveWorkReport(env,lock,{shiftId:ls.shift.id,phase:'start',submit:true,data:{tasks:[{title:'Việc Lock'}]}});
 const h=await workHistory(env,boss,new URLSearchParams({date:period.date,branchId:'10~sales-lock'}));assert.equal(h.reports.length,1);assert.equal(h.reports[0].member_id,'lock');assert.equal(h.missing.length,1);
 // A shared manager assignment must not be erased by either retail group's save.
 await db.prepare("INSERT INTO work_assignments(member_id,branch_id,sapo_account_id,updated_at) VALUES('boss','10','99','now')").run();
 await assert.rejects(()=>saveWorkConfiguration(env,boss,{branchId:'10~sales-ml',keeperId:'lock',assignments:[{memberId:'boss',accountId:'13'}]},mock));
 await assert.rejects(()=>saveWorkConfiguration(env,boss,{branchId:'10~sales-ml',keeperId:'lock',assignments:[{memberId:'ml',accountId:'13'}]},mock));
 await saveWorkConfiguration(env,boss,{branchId:'10~sales-ml',keeperId:'ml',assignments:[{memberId:'ml',accountId:'13'}]},mock);
 assert.equal((await db.prepare("SELECT sapo_account_id FROM work_assignments WHERE member_id='boss'").first()).sapo_account_id,'99');
 assert.equal((await db.prepare("SELECT sapo_account_id FROM work_assignments WHERE member_id='lock' AND branch_id='10'").first()).sapo_account_id,'12');
 await assert.rejects(()=>saveWorkConfiguration(env,boss,{branchId:'10~sales-ml',keeperId:'lock',assignments:[{memberId:'ml',accountId:'12'}]},mock));
 await saveWorkConfiguration(env,boss,{branchId:'10~sales-lock',keeperId:'lock',assignments:[{memberId:'lock',accountId:'12'}]},mock);
 assert.deepEqual(JSON.parse((await db.prepare("SELECT keeper_id FROM work_branches WHERE id='10'").first()).keeper_id),{'sales-ml':'ml','sales-lock':'lock'});
 const splitContext=await workContext(env,boss);
 assert.equal(splitContext.branches.find(b=>b.id==='10~sales-ml').keeper_id,'ml');
 assert.equal(splitContext.branches.find(b=>b.id==='10~sales-lock').keeper_id,'lock');
 const responseFor=payload=>async url=>new URL(url).pathname.endsWith('/orders.json')?Response.json(payload):mock(url);
 const empty=await syncWorkOrders(env,ml,{shiftId:ms.shift.id,branchId:'10~sales-ml'},responseFor({orders:[],metadata:{total:0}}));
 assert.equal(empty.orderComplete,true);assert.deepEqual(empty.orders,[]);assert.equal(empty.orderMessage,'');
 const broken=await syncWorkOrders(env,ml,{shiftId:ms.shift.id,branchId:'10~sales-ml'},responseFor({error:'bad response'}));assert.equal(broken.orderComplete,false);assert.match(broken.orderMessage,/Đơn hàng:/);
 const missing=await syncWorkOrders(env,ml,{shiftId:ms.shift.id,branchId:'10~sales-ml'},responseFor({orders:[],metadata:{total:2}}));assert.equal(missing.orderComplete,false);
 const failed=await syncWorkOrders(env,ml,{shiftId:ms.shift.id,branchId:'10~sales-ml'},async()=>new Response('unavailable',{status:502}));assert.equal(failed.orderComplete,false);assert.match(failed.orderMessage,/HTTP 502/);
 const ignoredDateFilter=await syncWorkOrders(env,ml,{shiftId:ms.shift.id,branchId:'10~sales-ml'},async url=>{
  const u=new URL(url);
  if(!u.pathname.endsWith('/orders.json'))return mock(url);
  assert.equal(u.searchParams.has('modified_on_min'),false);
  assert.equal(u.searchParams.get('location_ids'),'10');
  assert.equal(u.searchParams.get('assignee_id'),'13');
  return Response.json({orders:[
   {id:'new',location_id:10,assignee_id:13,created_on:'2026-09-28T02:10:00Z',modified_on:'2026-09-28T02:20:00Z',status:'completed',total:100},
   {id:'old',location_id:10,assignee_id:13,created_on:'2026-09-20T02:10:00Z',modified_on:'2026-09-20T02:20:00Z',status:'completed',total:100},
  ]});
 });
 assert.deepEqual(ignoredDateFilter.orders.map(o=>o.id),['new']);
 }finally{await mf.dispose();}
});
