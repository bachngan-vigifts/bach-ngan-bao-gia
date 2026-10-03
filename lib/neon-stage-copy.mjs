import { createHash } from 'node:crypto';
import { neonTestRuntime } from './neon-runtime.mjs';
import { neonTableContract } from './neon-table-contract.mjs';
import { QuotationError } from './quotation-store.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const q=v=>'"'+v.replaceAll('"','""')+'"';
const root=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw new QuotationError(400,'Mã sao lưu không hợp lệ.');return 'migration-backups/'+id+'/';};
const read=async(bucket,key)=>{const o=await bucket.get(key);if(!o)throw new QuotationError(503,'Thiếu thành phần sao lưu.');return o.json();};
const save=async(bucket,key,data)=>{await bucket.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});};
const status=job=>({id:job.id,stage:job.stage,tablesCopied:job.tablesCopied,rowsCopied:job.rowsCopied,objectsCopied:job.objectsCopied,bytesCopied:job.bytesCopied,verified:job.stage==='complete',branch:'migration-web-20261002',productionChanged:false});
export async function neonStageStatus(env,id){return status(await read(env.FILES,root(id)+'neon-stage.json'));}
export async function startNeonStageCopy(env,id){
  const path=root(id),snapshot=await read(env.FILES,path+'manifest.json');
  if(snapshot.stage!=='complete')throw new QuotationError(409,'Bản sao lưu chưa hoàn tất.');
  const existing=await env.FILES.get(path+'neon-stage.json');if(existing)return status(await existing.json());
  const {DB:db}=neonTestRuntime(env);
  await db.native('CREATE TABLE IF NOT EXISTS migration_preserved_tables (name TEXT PRIMARY KEY,schema_json JSONB NOT NULL,rows_json JSONB NOT NULL)');
  const fks=(await db.native("SELECT source.relname AS source,target.relname AS target FROM pg_constraint c JOIN pg_class source ON source.oid=c.conrelid JOIN pg_class target ON target.oid=c.confrelid WHERE c.contype='f' AND source.relnamespace='public'::regnamespace")).rows;
  const ordered=[],pending=[...snapshot.tables];
  while(pending.length){const index=pending.findIndex(t=>fks.filter(f=>f.source===t.name).every(f=>ordered.some(t=>t.name===f.target)||!snapshot.tables.some(t=>t.name===f.target)));if(index<0)throw new QuotationError(503,'Cần xử lý phụ thuộc vòng trước khi nhập dữ liệu.');ordered.push(...pending.splice(index,1));}
  const job={id,stage:'tables',ordered,table:0,part:0,tablesCopied:0,rowsCopied:0,objectsCopied:0,bytesCopied:0,inventoryPart:0,object:0,createdAt:new Date().toISOString()};
  await save(env.FILES,path+'neon-stage.json',job);return status(job);
}
export async function advanceNeonStageCopy(env,id){
  const path=root(id),snapshot=await read(env.FILES,path+'manifest.json'),job=await read(env.FILES,path+'neon-stage.json');
  const {DB:db,FILES:target}=neonTestRuntime(env);
  if(job.stage==='complete')return status(job);
  if(job.stage==='tables'){
    const table=job.ordered[job.table];
    if(!table){job.stage='objects';await save(env.FILES,path+'neon-stage.json',job);return status(job);}
    const contract=neonTableContract[table.name];
    if(!contract){
      const data=[];for(const part of table.parts)data.push(...await read(env.FILES,part.key));
      await db.native('INSERT INTO migration_preserved_tables (name,schema_json,rows_json) VALUES ($1,$2::jsonb,$3::jsonb) ON CONFLICT(name) DO UPDATE SET schema_json=excluded.schema_json,rows_json=excluded.rows_json',[table.name,JSON.stringify(table),JSON.stringify(data)]);
      const saved=(await db.native('SELECT rows_json FROM migration_preserved_tables WHERE name=$1',[table.name])).rows[0]?.rows_json;
      if(JSON.stringify(canonical(saved))!==JSON.stringify(canonical(data)))throw new QuotationError(503,'Dữ liệu metadata chưa khớp.');
      job.rowsCopied+=data.length;job.tablesCopied++;job.table++;job.part=0;
    }else{
      const part=table.parts[job.part],data=await read(env.FILES,part.key);
      if(hash(JSON.stringify(data))!==part.hash)throw new QuotationError(503,'Checksum bảng nguồn không khớp.');
      const columns=table.columns.map(c=>c.name),hasRowid=!table.withoutRowid,insertColumns=hasRowid?['source_rowid',...columns]:columns;
      if(data.length){
        const values=data.flatMap(row=>insertColumns.map(c=>c==='source_rowid'?row.__backup_rowid__:row[c]));
        const placeholders=data.map((row,i)=>'('+insertColumns.map((c,j)=>'$'+(i*insertColumns.length+j+1)).join(',')+')').join(',');
        const primary=contract.primary.length?contract.primary:['source_rowid'];
        const updates=insertColumns.filter(c=>!primary.includes(c));
        await db.native('INSERT INTO '+q(table.name)+' ('+insertColumns.map(q).join(',')+') VALUES '+placeholders+' ON CONFLICT ('+primary.map(q).join(',')+') DO UPDATE SET '+updates.map(c=>q(c)+'=excluded.'+q(c)).join(','),values);
      }
      const order=hasRowid?'source_rowid':contract.primary.map(q).join(',');
      const selected=(hasRowid?'source_rowid AS "__backup_rowid__",':'')+columns.map(q).join(',');
      const saved=(await db.native('SELECT '+selected+' FROM '+q(table.name)+' ORDER BY '+order+' LIMIT $1 OFFSET $2',[500,part.offset])).rows;
      if(hash(JSON.stringify(saved))!==part.hash)throw new QuotationError(503,'Dữ liệu Neon chưa khớp với bản sao nguồn.');
      job.rowsCopied+=data.length;job.part++;
      if(job.part>=table.parts.length){
        const count=Number((await db.native('SELECT count(*) AS count FROM '+q(table.name))).rows[0].count);
        if(count!==table.rowCount)throw new QuotationError(503,'Số dòng trên Neon chưa khớp.');
        await db.native('SELECT setval(pg_get_serial_sequence($1,$2),COALESCE(MAX(source_rowid),1),MAX(source_rowid) IS NOT NULL) FROM '+q(table.name),[table.name,'source_rowid']);
        job.tablesCopied++;job.table++;job.part=0;
      }
    }
  }else if(job.stage==='objects'){
    const inventory=snapshot.inventoryParts[job.inventoryPart];
    if(!inventory){job.stage='complete';job.completedAt=new Date().toISOString();await save(env.FILES,path+'neon-stage.json',job);return status(job);}
    const entries=await read(env.FILES,inventory.key);
    let batch=entries.slice(job.object,job.object+5);if(batch.reduce((n,e)=>n+e.size,0)>8*1024*1024)batch=batch.slice(0,1);
    const results=await Promise.allSettled(batch.map(async(entry,i)=>{
      const copyKey=path+'objects/'+job.inventoryPart+'/'+(job.object+i),meta=await read(env.FILES,copyKey+'.json'),object=await env.FILES.get(copyKey);
      if(!object)throw new QuotationError(503,'Thiếu file sao lưu.');
      const bytes=Buffer.from(await object.arrayBuffer());if(hash(bytes)!==meta.sha256)throw new QuotationError(503,'Checksum file nguồn không khớp.');
      await target.put(entry.key,bytes,{httpMetadata:meta.httpMetadata,customMetadata:meta.customMetadata});
      const saved=await target.get(entry.key);if(!saved||hash(Buffer.from(await saved.arrayBuffer()))!==meta.sha256)throw new QuotationError(503,'Checksum file Neon không khớp.');
      if(JSON.stringify(saved.customMetadata)!==JSON.stringify(meta.customMetadata||{}))throw new QuotationError(503,'Metadata file Neon chưa khớp.');
      return bytes.byteLength;
    }));
    for(const result of results)if(result.status==='rejected')throw result.reason;
    job.objectsCopied+=results.length;job.bytesCopied+=results.reduce((n,r)=>n+r.value,0);job.object+=results.length;
    if(job.object>=entries.length){job.inventoryPart++;job.object=0;}
  }
  await save(env.FILES,path+'neon-stage.json',job);return status(job);
}
