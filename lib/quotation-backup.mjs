import {resolveQuotationData, QuotationError} from './quotation-store.mjs';

export async function makeBackup(db,bucket) {
  if(!bucket)throw new QuotationError(503,'Kho sao lưu chưa sẵn sàng.');
  // D1 batch is transactional: all metadata is from the same database snapshot.
  // R2 payloads are immutable and are never removed when a quote is edited/deleted.
  const [positions,members,quotes,customers,productEdits,stockImports,workBranches,workAssignments,workShifts,workReports,workAudit]=await db.batch([
    db.prepare('SELECT * FROM staff_positions ORDER BY id'),
    db.prepare('SELECT id,email,name,phone,role,position_id,active,created_at FROM staff_members ORDER BY id'),
    db.prepare('SELECT * FROM staff_quotations ORDER BY id'),
    db.prepare('SELECT * FROM sapo_customers ORDER BY id'),
    db.prepare('SELECT * FROM product_edits ORDER BY sku'),
    db.prepare('SELECT * FROM stock_imports ORDER BY revision DESC LIMIT 1'),
    db.prepare('SELECT * FROM work_branches ORDER BY id'),
    db.prepare('SELECT * FROM work_assignments ORDER BY branch_id,member_id'),
    db.prepare('SELECT * FROM work_shifts ORDER BY starts_at'),
    db.prepare('SELECT * FROM work_reports ORDER BY updated_at'),
    db.prepare('SELECT * FROM work_audit ORDER BY created_at'),
  ]);
  const createdAt=new Date().toISOString();
  const catalogPointer=await bucket.get('catalogs/current.json');
  const catalog=catalogPointer?await catalogPointer.json():null;
  const workReportsBackup={branches:workBranches.results,assignments:workAssignments.results,shifts:workShifts.results,reports:workReports.results,audit:workAudit.results};
  const manifest={workReports:workReportsBackup,format:'bach-ngan-backup-v1',createdAt,positions:positions.results,members:members.results,quotes:quotes.results,customers:customers.results,productEdits:productEdits.results,stockImport:stockImports.results[0]||null,catalog};
  const key=`backups/${createdAt.replaceAll(':','-')}-${crypto.randomUUID()}.json`;
  await bucket.put(key,JSON.stringify(manifest),{httpMetadata:{contentType:'application/json'}});
  return {key,createdAt,quoteCount:manifest.quotes.length,memberCount:manifest.members.length};
}

export async function exportBackup(bucket,key) {
  if(!/^backups\/[a-zA-Z0-9T:.\-]+\.json$/.test(key||''))throw new QuotationError(400,'Bản sao lưu không hợp lệ.');
  const object=await bucket.get(key);
  if(!object)throw new QuotationError(404,'Không tìm thấy bản sao lưu.');
  const manifest=await object.json();
  async function* chunks(){
    yield JSON.stringify({format:'bach-ngan-portable-v1',createdAt:manifest.createdAt,workReports:manifest.workReports||null,positions:manifest.positions,members:manifest.members,customers:manifest.customers||[],productEdits:manifest.productEdits||[]}).slice(0,-1)+',"quotes":[';
    let first=true;
    for(const row of manifest.quotes){
      const data=await resolveQuotationData(bucket,row.data),meta=JSON.parse(row.data);
      let pdf=null;
      if(meta.pdfKey){const obj=await bucket.get(meta.pdfKey);if(!obj)throw Error('Backup PDF is missing');pdf=Buffer.from(await obj.arrayBuffer()).toString('base64');}
      yield (first?'':',')+JSON.stringify({...row,data,pdfBase64:pdf});first=false;
    }
    yield '],"stockImport":'+JSON.stringify(manifest.stockImport||null)+',"inventory":';
    if(manifest.stockImport){const inventory=await bucket.get(manifest.stockImport.key);if(!inventory)throw Error('Missing inventory backup');yield await inventory.text();}else yield 'null';
    yield ',"catalog":';
    if(manifest.catalog){const catalog=await bucket.get(manifest.catalog.key);if(!catalog)throw Error('Backup catalog is missing');yield await catalog.text();}else yield 'null';
    yield '}';
  }
  const iterator=chunks(),encoder=new TextEncoder();
  return new Response(new ReadableStream({async pull(controller){try{const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(encoder.encode(next.value));}catch(e){controller.error(e);}},async cancel(){await iterator.return();}}),{
    headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="bach-ngan-backup-${manifest.createdAt.slice(0,10)}.json"`,'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'},
  });
}

export async function migrateQuotePayloads(db,bucket) {
  const rows=await db.prepare("SELECT id,data FROM staff_quotations WHERE json_extract(data,'$.r2Key') IS NULL LIMIT 10").all();
  let changed=0;
  for(const row of rows.results){
    const key=`quotations/migrated/${crypto.randomUUID()}.json`;
    await bucket.put(key,row.data,{httpMetadata:{contentType:'application/json'}});
    const result=await db.prepare('UPDATE staff_quotations SET data=? WHERE id=? AND data=?').bind(JSON.stringify({r2Key:key}),row.id,row.data).run();
    changed+=result.meta.changes;
  }
  return {changed,hasMore:rows.results.length===10};
}
