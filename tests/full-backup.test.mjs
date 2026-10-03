import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { startFullBackup, advanceFullBackup } from '../lib/full-backup.mjs';

async function fixture() {
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['FILES']});
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');
  await db.prepare('CREATE TABLE staff_credentials (member_id TEXT PRIMARY KEY,password_hash TEXT)').run();
  await db.prepare('CREATE TABLE dynamic_settings (id TEXT PRIMARY KEY, data TEXT) WITHOUT ROWID').run();
  await db.prepare('INSERT INTO staff_credentials VALUES (?,?)').bind('fake','fake-hash').run();
  await db.prepare('INSERT INTO dynamic_settings VALUES (?,?)').bind('fake','test').run();
  await bucket.put('supplier/order.json','{"test":true}',{httpMetadata:{contentType:'application/json'},customMetadata:{test:'metadata'}});
  return {mf,db,bucket};
}
async function finish(db,bucket,job){for(let i=0;i<100&&job.stage!=='complete';i++)job=await advanceFullBackup(db,bucket,job.id);assert.equal(job.stage,'complete');return job;}
test('full backup preserves dynamic tables, credential hashes, rowids and arbitrary R2 bytes without claiming cutover readiness',async()=>{
  const {mf,db,bucket}=await fixture();try{
    let job=await startFullBackup(db,bucket);job=await finish(db,bucket,job);
    assert.equal(job.verifiedCopies,true);assert.equal(job.sourceChanged,false);assert.equal(job.cutoverReady,false);
    assert.equal(job.tableCount,2);assert.equal(job.rowCount,2);assert.equal(job.copiedObjects,1);
    assert.equal(JSON.stringify(job).includes('fake-hash'),false);
    const root='migration-backups/'+job.id+'/';
    const manifest=await (await bucket.get(root+'manifest.json')).json();
    const credentials=manifest.tables.find(t=>t.name==='staff_credentials');
    const data=await (await bucket.get(credentials.parts[0].key)).json();
    assert.equal(data[0].password_hash,'fake-hash');assert.equal(typeof data[0].__backup_rowid__,'number');
    const object=await bucket.get(root+'objects/0/0');assert.equal(await object.text(),'{"test":true}');
    assert.deepEqual(object.customMetadata,{test:'metadata'});
    assert.equal((await advanceFullBackup(db,bucket,job.id)).copiedObjects,1);
  }finally{await mf.dispose();}
});
test('concurrent database and R2 updates are detected and never treated as a safe cutover',async()=>{
  const {mf,db,bucket}=await fixture();try{
    let job=await startFullBackup(db,bucket);
    while(job.stage!=='verify-tables')job=await advanceFullBackup(db,bucket,job.id);
    await db.prepare('UPDATE staff_credentials SET password_hash=?').bind('fake-next-hash').run();
    await bucket.put('supplier/order.json','changed');await bucket.put('new-file','new');
    job=await finish(db,bucket,job);assert.equal(job.sourceChanged,true);assert.equal(job.cutoverReady,false);
    assert.equal(await (await bucket.get('supplier/order.json')).text(),'changed');
  }finally{await mf.dispose();}
});
