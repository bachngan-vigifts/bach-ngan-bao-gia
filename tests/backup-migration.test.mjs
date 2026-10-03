import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFileSync,readdirSync} from 'node:fs';
import {createQuotationStore} from '../lib/quotation-store.mjs';
import {makeBackup,exportBackup,migrateQuotePayloads} from '../lib/quotation-backup.mjs';
test('legacy migration preserves images; portable snapshots survive edit and delete',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['FILES']});
 try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await db.prepare("INSERT INTO staff_members (id,email,name,role,active,created_at) VALUES ('test','test@example.invalid','Test','manager',1,'2026-09-06')").run();
 const image='data:image/png;base64,iVBORw0KGgo=';
 const quote={type:'HRC',quoteNo:'TEST',date:'2026-09-06',customer:'Original',vat:8,rows:[{image,sku:'LYS-001',qty:1,price:100}]};
 const old=createQuotationStore(db),created=await old.save('test',quote);
 const before=await makeBackup(db,bucket);
 assert.equal((await migrateQuotePayloads(db,bucket)).changed,1);
 assert.equal((await migrateQuotePayloads(db,bucket)).changed,0);
 const store=createQuotationStore(db,bucket),read=await store.get('test',created.id);
 assert.equal(read.data.rows[0].image,image);assert.equal(read.revision,1);
 assert.equal((await store.list('test',null,{product:'lys-001',from:'2026-09-06'})).records[0].id,created.id);
 const snapshot=await makeBackup(db,bucket);
 await store.save('test',{...quote,customer:'Changed'},created.id,1);
 const fast=createQuotationStore(db,{get(){throw Error('Indexed search should not read R2');}});
 assert.equal((await fast.list('test',null,{product:'lys-001',to:'2026-09-06'})).records[0].id,created.id);
 await store.remove('test',created.id,2);
 for(const key of [before.key,snapshot.key]){
 const exported=await (await exportBackup(bucket,key)).json();
 assert.equal(exported.quotes[0].data.customer,'Original');
 assert.equal(exported.quotes[0].data.rows[0].image,image);
 }
 await assert.rejects(createQuotationStore(db,{put:async()=>{throw Error('R2 down')}}).save('test',quote));
 assert.equal((await db.prepare('SELECT count(*) AS count FROM staff_quotations').first()).count,0);
 }finally{await mf.dispose();}
});
