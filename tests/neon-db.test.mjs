import test from 'node:test';
import assert from 'node:assert/strict';
import { translateSql,createNeonDatabase } from '../lib/neon-db.mjs';

test('SQL translation preserves literals, aliases, row cursors and scoped JSON filters',()=>{
 const result=translateSql("SELECT q.rowid AS cursorRow,json_extract(q.data,'$.approvalStatus') AS approvalStatus,'LIKE ? rowid changes()' AS literal FROM staff_quotations q WHERE (? IS NULL OR q.rowid<?) AND customer LIKE ?");
 assert.equal(result.parameterCount,3);
 assert.match(result.text,/q.source_rowid AS "cursorRow"/);assert.match(result.text,/q.data::jsonb #>> '\{approvalStatus\}'/);
 assert.match(result.text,/\$1::text IS NULL/);assert.match(result.text,/customer ILIKE \$3/);
 assert.match(result.text,/'LIKE \? rowid changes\(\)' AS "literal"/);
 assert.equal(translateSql('SELECT id FROM staff_members WHERE email=? COLLATE NOCASE').text,'SELECT id FROM staff_members WHERE lower(email)=lower($1::text)');
 assert.throws(()=>translateSql('SELECT * FROM t WHERE other=? COLLATE NOCASE'));
});
test('replacement uses the exact composite identity and protects quoted parameters',()=>{
 const r=translateSql('INSERT OR REPLACE INTO vigifts_appsheet_rows (app_id,table_name,tuple_id,values_json) VALUES (?,?,?,?)');
 assert.match(r.text,/ON CONFLICT \("app_id","table_name","tuple_id"\) DO UPDATE SET "values_json"=excluded."values_json"$/);
 assert.equal(translateSql("SELECT '?' AS a,? AS b -- ?").parameterCount,1);
 assert.match(translateSql('INSERT OR IGNORE INTO staff_positions (id,name) VALUES (?,?)').text,/ON CONFLICT DO NOTHING$/);
 assert.throws(()=>translateSql('SELECT 1; SELECT 2'));
});
test('batch keeps audit and cash changes on one serializable transaction and observes failed revision guards',async()=>{
 const calls=[];const client={connect:async()=>{},end:async()=>{},query:async(text)=>{calls.push(text);return {command:text.startsWith('UPDATE')?'UPDATE':text.startsWith('INSERT')?'INSERT':'SELECT',rowCount:0,rows:[]};}};
 const db=createNeonDatabase('postgres://fake',{http:{query:async()=>{}},clientFactory:()=>client});
 const result=await db.batch([db.prepare('UPDATE work_shifts SET revision=revision+1 WHERE id=? AND revision=?').bind('fake',1),db.prepare("INSERT INTO work_audit (id,entity_id,actor_id,action,data,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1").bind('fake','fake','fake','test','{}','test')]);
 assert.equal(calls[0],'BEGIN ISOLATION LEVEL SERIALIZABLE');assert.match(calls[2],/WHERE 0=1$/);assert.equal(calls.at(-1),'COMMIT');assert.equal(result[0].meta.changes,0);
});
test('serialization conflicts roll back the whole batch before retrying',async()=>{
 const calls=[];let attempts=0;
 const db=createNeonDatabase('postgres://fake',{http:{query:async()=>{}},clientFactory:()=>{const attempt=++attempts;return {connect:async()=>{},end:async()=>{},query:async(text)=>{calls.push([attempt,text]);if(text.startsWith('UPDATE')&&attempt===1){const error=Error('private detail');error.code='40001';throw error;}return {command:'UPDATE',rowCount:1,rows:[]};}};}});
 const result=await db.batch([db.prepare('UPDATE staff_quotations SET revision=revision+1 WHERE id=? AND revision=?').bind('fake',1)]);
 assert.equal(attempts,2);assert.ok(calls.some(([n,t])=>n===1&&t==='ROLLBACK'));assert.equal(result[0].meta.changes,1);
});
