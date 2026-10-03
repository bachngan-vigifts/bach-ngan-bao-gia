import { createHash } from 'node:crypto';
import { QuotationError } from './quotation-store.mjs';

// Online preservation snapshot. Never use this alone as a cutover fence:
// D1 and R2 do not share a transaction, and live writers may still be active.
const PAGE = 500;
const ROOT = 'migration-backups/';
const hash = value => createHash('sha256').update(value).digest('hex');
const encoded = value => JSON.stringify(value);
const ident = name => '"' + String(name).replaceAll('"', '""') + '"';
const prefix = id => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new QuotationError(400, 'Mã sao lưu không hợp lệ.');
  return ROOT + id + '/';
};
const schemaSql = "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name";
const rows = async statement => (await statement.all()).results || [];
const putJson = (bucket, key, value) => bucket.put(key, encoded(value), { httpMetadata: { contentType: 'application/json' } });
const getJson = async (bucket, key) => {
  const object = await bucket.get(key);
  if (!object) throw new QuotationError(503, 'Thiếu thành phần sao lưu.');
  return object.json();
};
function publicStatus(job) {
  return { id: job.id, stage: job.stage, createdAt: job.createdAt, completedAt: job.completedAt || null,
    tableCount: job.tables.length, rowCount: job.tables.reduce((n,t) => n+t.rowCount,0),
    objectCount: job.objectCount, copiedObjects: job.copiedObjects, copiedBytes: job.copiedBytes,
    verifiedCopies: job.stage === 'complete', sourceChanged: job.sourceChanged,
    // This value intentionally remains false even when both verification passes match.
    cutoverReady: false };
}
async function save(bucket, job) {
  await putJson(bucket, prefix(job.id)+'job.json', job);
  return publicStatus(job);
}
export async function startFullBackup(db, bucket) {
  if (!db || !bucket) throw new QuotationError(503, 'Kho dữ liệu chưa sẵn sàng.');
  const schema = await rows(db.prepare(schemaSql));
  const tables = schema.filter(s => s.type === 'table' && !s.name.startsWith('_cf_')).map(s => ({ name:s.name,
    withoutRowid:/\bWITHOUT\s+ROWID\b/i.test(s.sql), columns:null, parts:[], rowCount:0 }));
  const job = { format:'bach-ngan-full-backup-v2', id:crypto.randomUUID(), createdAt:new Date().toISOString(),
    stage:'inventory', schema, schemaHash:hash(encoded(schema)), tables, tableIndex:0, offset:0,
    inventoryParts:[], inventoryCursor:null, inventoryComplete:false, objectCount:0,
    copyPart:0, copyIndex:0, copiedObjects:0, copiedBytes:0, sourceChanged:false,
    verifyTable:0, verifyPart:0, verifyInventoryPart:0, verifyCursor:null,
    consistency:'online snapshot; no cross-store transaction or write fence' };
  return save(bucket,job);
}
export async function fullBackupStatus(bucket,id) { return publicStatus(await getJson(bucket,prefix(id)+'job.json')); }

function selectPage(db,t,offset,limit=PAGE) {
  const columns = t.columns.map(c => ident(c.name));
  const order = t.withoutRowid ? t.columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>ident(c.name)).join(',') : 'rowid';
  if (!order) throw new QuotationError(503,'Không xác định được khóa bảng sao lưu.');
  const select = t.withoutRowid ? columns.join(',') : 'rowid AS "__backup_rowid__",'+columns.join(',');
  return db.prepare(`SELECT ${select} FROM ${ident(t.name)} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(limit,offset);
}
function listEntries(result, ownPrefix) {
  return (result.objects || []).filter(o=>!o.key.startsWith(ownPrefix)).map(o => ({key:o.key, size:o.size, etag:o.etag,
    uploaded:o.uploaded?.toISOString?.() || o.uploaded || null}));
}
export async function advanceFullBackup(db,bucket,id) {
  const root=prefix(id),job=await getJson(bucket,root+'job.json');
  if(job.stage==='complete')return publicStatus(job);
  if(job.stage==='inventory') {
    const page=await bucket.list({limit:500,...(job.inventoryCursor?{cursor:job.inventoryCursor}:{})});
    const entries=listEntries(page,root),key=root+`inventory/${job.inventoryParts.length}.json`;
    await putJson(bucket,key,entries);job.inventoryParts.push({key,hash:hash(encoded(entries)),count:entries.length});
    job.objectCount+=entries.length;job.inventoryCursor=page.truncated?page.cursor:null;
    if(!page.truncated){job.inventoryComplete=true;job.stage='tables';}
  } else if(job.stage==='tables') {
    const t=job.tables[job.tableIndex];
    if(!t){job.stage='objects';return save(bucket,job);}
    if(!t.columns)t.columns=await rows(db.prepare(`PRAGMA table_info(${ident(t.name)})`));
    const data=await rows(selectPage(db,t,job.offset));
    const key=root+`tables/${job.tableIndex}/${t.parts.length}.json`;
    const bytes=encoded(data);await bucket.put(key,bytes,{httpMetadata:{contentType:'application/json'}});
    // Re-read the written bytes, not just the input, before counting the part.
    const stored=await bucket.get(key);
    if(!stored || hash(await stored.text())!==hash(bytes))throw new QuotationError(503,'Kiểm tra bản sao bảng thất bại.');
    t.parts.push({key,offset:job.offset,count:data.length,hash:hash(bytes)});t.rowCount+=data.length;job.offset+=data.length;
    if(data.length<PAGE){job.tableIndex++;job.offset=0;}
  } else if(job.stage==='objects') {
    const part=job.inventoryParts[job.copyPart];
    if(!part){job.stage='verify-tables';return save(bucket,job);}
    const entries=await getJson(bucket,part.key);
    if(hash(encoded(entries))!==part.hash)throw new QuotationError(503,'Danh mục sao lưu bị thay đổi.');
    // Keep each request bounded. All objects, including historical files, are copied.
    let batch=entries.slice(job.copyIndex,job.copyIndex+5);
    if(batch.reduce((n,e)=>n+e.size,0)>8*1024*1024)batch=batch.slice(0,1);
    const copied=await Promise.allSettled(batch.map(async(entry,i)=>{
      const object=await bucket.get(entry.key);
      if(!object)throw new QuotationError(503,'File nguồn thay đổi hoặc không đọc được.');
      if(object.size>48*1024*1024)throw new QuotationError(503,'Có file vượt giới hạn sao lưu của phiên này; chưa hoàn tất.');
      if(batch.length>1 && object.size>entry.size+8*1024*1024)throw new QuotationError(503,'File nguồn tăng dung lượng trong lúc sao lưu; cần kiểm tra lại.');
      if(object.etag!==entry.etag || object.size!==entry.size)job.sourceChanged=true;
      const bytes=await object.arrayBuffer(),checksum=hash(Buffer.from(bytes));
      const snapshotKey=root+`objects/${job.copyPart}/${job.copyIndex+i}`;
      await bucket.put(snapshotKey,bytes,{httpMetadata:object.httpMetadata,customMetadata:object.customMetadata});
      const copy=await bucket.get(snapshotKey);
      if(!copy || hash(Buffer.from(await copy.arrayBuffer()))!==checksum)throw new QuotationError(503,'Checksum bản sao file không khớp.');
      await putJson(bucket,snapshotKey+'.json',{...entry,snapshotKey,sha256:checksum,copiedEtag:object.etag,
        copiedSize:object.size,httpMetadata:object.httpMetadata,customMetadata:object.customMetadata});
      return bytes.byteLength;
    }));
    for(const result of copied)if(result.status==='rejected')throw result.reason;
    job.copiedObjects+=copied.length;job.copyIndex+=copied.length;
    job.copiedBytes+=copied.reduce((n,result)=>n+result.value,0);
    if(job.copyIndex>=entries.length){job.copyPart++;job.copyIndex=0;}
  } else if(job.stage==='verify-tables') {
    const t=job.tables[job.verifyTable];
    if(!t){
      const current=await rows(db.prepare(schemaSql));
      if(hash(encoded(current))!==job.schemaHash)job.sourceChanged=true;
      job.stage='verify-inventory';return save(bucket,job);
    }
    const part=t.parts[job.verifyPart];
    const current=await rows(selectPage(db,t,part.offset));
    if(hash(encoded(current))!==part.hash)job.sourceChanged=true;
    job.verifyPart++;
    if(job.verifyPart>=t.parts.length){job.verifyTable++;job.verifyPart=0;}
  } else if(job.stage==='verify-inventory') {
    // Inventory pagination may move while the private snapshot is being written.
    // Compare by key, not page boundary, and mark any concurrent change.
    const page=await bucket.list({limit:500,...(job.verifyCursor?{cursor:job.verifyCursor}:{})});
    const entries=listEntries(page,root);
    const key=root+`verification/${job.verifyInventoryPart++}.json`;
    await putJson(bucket,key,entries);job.verifyCursor=page.truncated?page.cursor:null;
    if(!page.truncated)job.stage='verify-inventory-final';
  } else if(job.stage==='verify-inventory-final') {
    const before=[],after=[];
    for(const part of job.inventoryParts)before.push(...await getJson(bucket,part.key));
    for(let i=0;i<job.verifyInventoryPart;i++)after.push(...await getJson(bucket,root+`verification/${i}.json`));
    const sort=a=>a.sort((x,y)=>x.key.localeCompare(y.key));
    if(hash(encoded(sort(before)))!==hash(encoded(sort(after))))job.sourceChanged=true;
    job.stage='complete';job.completedAt=new Date().toISOString();
    await putJson(bucket,root+'manifest.json',job);
  } else throw new QuotationError(503,'Trạng thái sao lưu không hợp lệ.');
  return save(bucket,job);
}
