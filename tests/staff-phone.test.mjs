import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {initialStaff} from '../lib/initial-staff.mjs';
import {validateQuotation} from '../lib/quotation-store.mjs';
test('phone migration fills all approved existing employees without changing their identity',()=>{
 const db=new DatabaseSync(':memory:');
 try{db.exec(readFileSync('drizzle/0000_thin_ozymandias.sql','utf8'));
 for(const m of initialStaff)db.prepare('INSERT INTO staff_members (id,name,email,created_at) VALUES (?,?,?,?)').run(m.id,m.name,m.email,'2026-09-06');
 db.exec(readFileSync('drizzle/0004_perfect_hiroim.sql','utf8'));
 for(const m of initialStaff)assert.equal(db.prepare('SELECT phone FROM staff_members WHERE id=?').get(m.id).phone,m.phone);
 assert.equal(initialStaff.find(m=>m.id==='NV10').phone,'0813290131');
 }finally{db.close();}
});
test('quote stores staff phone independently from customer and preserves manual blank',()=>{
 const q={type:'HRC',quoteNo:'PHONE',vat:8,rows:[],phone:'0901234567',ownerPhone:'0813290131'};
 const saved=validateQuotation(q);assert.equal(saved.phone,q.phone);assert.equal(saved.ownerPhone,q.ownerPhone);
 assert.equal(validateQuotation({...q,ownerPhone:''}).ownerPhone,'');
});
