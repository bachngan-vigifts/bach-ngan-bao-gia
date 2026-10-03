import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {listPrintingWorkshops,createPrintingWorkshop} from '../lib/printing-workshops.mjs';
test('shared workshop directory validates details, prevents duplicates and restricts access',async()=>{
 const sql=new DatabaseSync(':memory:');
 const db={prepare(query){return {async run(){return {meta:sql.prepare(query).run()}},async all(){return {results:sql.prepare(query).all()}},bind(...args){return {async run(){return {meta:sql.prepare(query).run(...args)}}}}}}};
 const manager={id:'manager',role:'manager'},employee={id:'employee',role:'employee'};
 try{
  assert.equal((await listPrintingWorkshops(db,manager)).workshops.length,5);
  const body={name:'Xưởng mới',taxCode:'1801234567',address:'Cần Thơ',phone:'0901234567',email:'xuong@example.com'};
  const saved=await createPrintingWorkshop(db,body,manager);
  assert.deepEqual({...((await listPrintingWorkshops(db,manager)).workshops.at(-1))},saved.workshop);
  await assert.rejects(()=>createPrintingWorkshop(db,{...body,name:'  XƯỞNG MỚI  '},manager),error=>error.status===409);
  await assert.rejects(()=>createPrintingWorkshop(db,{name:'Minh Long'},manager),error=>error.status===409);
  await assert.rejects(()=>createPrintingWorkshop(db,{name:'Khác',email:'bad-email'},manager),error=>error.status===400);
  await assert.rejects(()=>createPrintingWorkshop(db,body,employee),error=>error.status===403);
  await assert.rejects(()=>listPrintingWorkshops(db,employee),error=>error.status===403);
 }finally{sql.close();}
});
