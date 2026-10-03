import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {forceMergeStaffIdentity,sameStaffIdentity,reconcileStaffIdentities} from '../lib/staff-identity.mjs';
import {isActiveSapoStaff} from '../lib/sapo-staff-status.mjs';
import {syncStaffMembers} from '../lib/staff-sync.mjs';
test('inactive flags are normalized consistently',()=>{
 for(const value of [false,0,'false','0','inactive',' INACTIVE ','disabled','terminated','resigned'])assert.equal(isActiveSapoStaff({status:value}),false);
 assert.equal(isActiveSapoStaff({active:true,status:'inactive'}),false);
 assert.equal(isActiveSapoStaff({active:true,status:'active'}),true);
});
test('identity matching requires corroborating contact, not name alone',()=>{
 const a={name:'Lê Thị Kim Ngân',email:'ngan@example.com',phone:'0763901390'};
 assert.equal(sameStaffIdentity(a,{name:a.name,phone:'0123456789'}),false);
 assert.equal(sameStaffIdentity(a,{name:'LE THI KIM NGAN',phone:'+84763901390'}),true);
 assert.equal(sameStaffIdentity(a,{name:'Người khác',phone:a.phone}),false);
});
test('safe duplicate merge keeps web identity and positions, transfers mappings, and cannot resurrect on sync',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB']});
 try{const db=await mf.getD1Database('DB');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 for(const p of ['sales-ml','sale'])await db.prepare('INSERT OR IGNORE INTO staff_positions(id,name) VALUES(?,?)').bind(p,p).run();
 for(const [id,email,position,name,phone] of [['NV-a','a@example.com','sales-ml','Kim Ngân','0763901390'],['SAPO-1','sapo-1@sapo.local.invalid','sale','Kim Ngân','0763901390'],['NV-b','b@example.com','sales-ml','Người B','0901234567'],['SAPO-2','sapo-2@sapo.local.invalid','sale','Người B','0901234567']])await db.prepare('INSERT INTO staff_members(id,email,name,phone,role,position_id,active,created_at) VALUES(?,?,?,?,?,?,1,?)').bind(id,email,name,phone,'employee',position,'now').run();
 await db.prepare("INSERT INTO staff_credentials(member_id,password_hash,version) VALUES('NV-a','keep-password',3),('SAPO-1',NULL,0),('SAPO-2','existing-login',1)").run();
 await db.prepare("INSERT INTO work_branches(id,name,updated_at) VALUES('10','Chi nhánh','now')").run();await db.prepare("INSERT INTO work_assignments(member_id,branch_id,sapo_account_id,updated_at) VALUES('SAPO-1','10','1','now')").run();
 const result=await reconcileStaffIdentities(db);assert.deepEqual(result.merged.map(m=>m.id),['NV-a']);assert.equal(result.review.length,1);
 assert.equal((await db.prepare("SELECT active FROM staff_members WHERE id='SAPO-1'").first()).active,0);assert.equal((await db.prepare("SELECT position_id FROM staff_members WHERE id='NV-a'").first()).position_id,'sales-ml');assert.equal((await db.prepare("SELECT password_hash FROM staff_credentials WHERE member_id='NV-a'").first()).password_hash,'keep-password');assert.equal((await db.prepare("SELECT member_id FROM work_assignments WHERE branch_id='10'").first()).member_id,'NV-a');
 await syncStaffMembers(db,{observedAt:new Date().toISOString(),members:[{id:'1',name:'Kim Ngân',email:'a@example.com',phone:'0763901390',active:true}]});assert.equal((await db.prepare("SELECT active FROM staff_members WHERE id='SAPO-1'").first()).active,0);
 assert.equal((await reconcileStaffIdentities(db)).merged.length,0);
 // This specific pair was confirmed by the owner despite different phone numbers.
 for(const [id,email,phone] of [['NV-2f7239bd-79b8-41a3-915c-1c4805c60ece','quan@example.com','0907198234'],['SAPO-1253649','sapo-quan@sapo.local.invalid','0907948703']])await db.prepare("INSERT INTO staff_members(id,email,name,phone,role,position_id,active,created_at) VALUES(?,?,'Huỳnh Châu Quan',?,'employee','sales-ml',1,'now')").bind(id,email,phone).run();
 const quan=await reconcileStaffIdentities(db);assert.equal(quan.merged[0].sapoId,'SAPO-1253649');
 assert.equal((await db.prepare("SELECT evidence FROM staff_sapo_links WHERE sapo_id='SAPO-1253649'").first()).evidence,'owner_confirmed_2026_09_29');
 // Departed accounts are not created or linked, even when their contact matches.
 await syncStaffMembers(db,{observedAt:new Date().toISOString(),members:[{id:'departed',name:'Người B',phone:'0901234567',status:'inactive'},{id:'2',name:'Người B',active:'false'}]});
 assert.equal(await db.prepare("SELECT id FROM staff_members WHERE id='SAPO-departed'").first(),null);
 assert.equal(await db.prepare("SELECT member_id FROM staff_credentials WHERE member_id='SAPO-departed'").first(),null);
 assert.equal(await db.prepare("SELECT sapo_id FROM staff_sapo_links WHERE sapo_id='SAPO-departed'").first(),null);
 assert.equal((await db.prepare("SELECT active FROM staff_members WHERE id='SAPO-2'").first()).active,0);
 assert.equal((await db.prepare("SELECT password_hash FROM staff_credentials WHERE member_id='SAPO-2'").first()).password_hash,'existing-login');
 }finally{await mf.dispose();}
});
test('manager-confirmed merge transfers history without overwriting a duplicate report',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB']});
 try{const db=await mf.getD1Database('DB');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await db.prepare("INSERT INTO staff_positions(id,name) VALUES('manager','Manager')").run();
 for(const [id,email] of [['NV002','manager@example.com'],['SAPO-62545','thai@sapo.local.invalid']])await db.prepare("INSERT INTO staff_members(id,email,name,phone,role,position_id,active,created_at) VALUES(?,?, 'Lê Minh Thái','0939961969','manager','manager',1,'now')").bind(id,email).run();
 await db.prepare("INSERT INTO staff_credentials(member_id,password_hash,version) VALUES('NV002','keep',1),('SAPO-62545','discard',1)").run();
 await db.prepare("INSERT INTO staff_sessions(hash,member_id,version,expires) VALUES('source-session','SAPO-62545',1,9999999999)").run();
 await db.prepare("INSERT INTO work_branches(id,name,updated_at) VALUES('b1','Kho','now')").run();
 await db.prepare("INSERT INTO work_assignments(member_id,branch_id,sapo_account_id,updated_at) VALUES('SAPO-62545','b1','7','now')").run();
 await db.prepare("INSERT INTO work_shifts(id,branch_id,work_date,starts_at,ends_at,label,cash_status,data,revision,updated_at) VALUES('s1','b1','2026-09-30','a','b','Ca','not_opened','{}',1,'now')").run();
 await db.prepare("INSERT INTO work_reports(id,shift_id,member_id,position_id,phase,status,data,snapshot,revision,updated_at) VALUES('r-source','s1','SAPO-62545','manager','end','draft','{}','{}',1,'now'),('r-target','s1','NV002','manager','end','draft','{}','{}',1,'now')").run();
 await db.prepare("INSERT INTO crm_tasks(id,title,assigned_to,status,created_by,created_at,updated_at) VALUES('task','Task','SAPO-62545','open','SAPO-62545','now','now')").run();
 const result=await forceMergeStaffIdentity(db,{sapoId:'SAPO-62545',targetId:'NV002',actorId:'NV002'});
 assert.equal(result.ok,true);assert.equal(result.reportConflicts,1);assert.equal((await db.prepare("SELECT active FROM staff_members WHERE id='SAPO-62545'").first()).active,0);assert.equal((await db.prepare("SELECT member_id FROM staff_sapo_links WHERE sapo_id='SAPO-62545'").first()).member_id,'NV002');assert.equal((await db.prepare("SELECT password_hash FROM staff_credentials WHERE member_id='NV002'").first()).password_hash,'keep');assert.equal(await db.prepare("SELECT hash FROM staff_sessions WHERE member_id='SAPO-62545'").first(),null);assert.equal((await db.prepare("SELECT member_id FROM work_assignments WHERE branch_id='b1'").first()).member_id,'NV002');assert.equal((await db.prepare("SELECT assigned_to FROM crm_tasks WHERE id='task'").first()).assigned_to,'NV002');assert.equal((await db.prepare("SELECT member_id FROM work_reports WHERE id='r-source'").first()).member_id,'SAPO-62545');
 }finally{await mf.dispose();}
});
