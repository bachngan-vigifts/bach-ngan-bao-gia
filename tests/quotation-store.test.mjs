import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createQuotationStore } from '../lib/quotation-store.mjs';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file, import.meta.url), 'utf8'));
  sql.exec("INSERT INTO staff_positions VALUES ('sales', 'Sales'), ('admin', 'Admin')");
  for (const [id, role, position, active] of [['a','employee','sales',1],['b','employee','sales',1],['c','employee','admin',1],['m','manager',null,1],['x','employee','sales',0]]) {
    sql.prepare('INSERT INTO staff_members (id,email,name,role,position_id,active,created_at) VALUES (?,?,?,?,?,?,?)').run(id,`${id}@example.com`,id,role,position,active,'2026-09-06');
  }
  const db = { prepare(query) {
    return { bind(...args) {
      const statement = sql.prepare(query);
      return {
        async first() { return statement.get(...args) ?? null; },
        async all() { return { results: statement.all(...args) }; },
        async run() { return { meta: statement.run(...args) }; },
      };
    }};
  }};
  return { sql, db, store: createQuotationStore(db) };
}
const quote = { type:'HRC', quoteNo:'BG001', customer:'Khách hàng', vat:8, rows:[{sku:'SP-BASE',name:'Sản phẩm mẫu',qty:1,price:100000,discount:0,discountType:'percent',taxRate:8}] };

test('combined quote filters match date, unaccented customer, product SKU and creator without crossing scope',async()=>{
 const {sql,store}=fixture();try{
 const data={...quote,date:'2026-09-06',customer:'Công ty Ánh Dương',rows:[{sku:'LYS-123',name:'Chén sứ trắng',qty:1,price:100}]};
 const a=await store.save('a',data);await store.save('c',data);await store.save('a',{...data,quoteNo:'BG002',date:'2026-09-05'});
 const filters={from:'2026-09-06',to:'2026-09-06',customer:'anh duong',product:'chen su',employee:'a@example.com'};
 assert.deepEqual((await store.list('b',null,filters)).records.map(r=>r.id),[a.id]);
 assert.deepEqual((await store.list('b',null,{customer:'bg001'})).records.map(r=>r.id),[a.id]);
 assert.equal((await store.list('b',null,{product:'LYS-123'})).records.length,2);
 assert.equal((await store.list('b',null,{employee:'c@example.com'})).records.length,0);
 assert.equal((await store.list('m',null,{employee:'c@example.com'})).records.length,1);
 await assert.rejects(store.list('a',null,{from:'2026-09-07',to:'2026-09-01'}),e=>e.status===400);
 }finally{sql.close();}
});

test('filtered pagination scans past unmatched quotes without losing or duplicating matches',async()=>{
 const {sql,store}=fixture();try{
 for(let i=0;i<160;i++)await store.save('a',{...quote,customer:i%3===0?'Find':'Other'});
 const ids=[];let cursor=null;do{const page=await store.list('a',cursor,{customer:'find'});ids.push(...page.records.map(r=>r.id));cursor=page.nextCursor;}while(cursor);
 assert.equal(ids.length,54);assert.equal(new Set(ids).size,54);
 }finally{sql.close();}
});

test('B2B bundle contents are retained with the saved quote',async()=>{
 const {sql,store}=fixture();try{
  const saved=await store.save('a',{...quote,type:'B2B',rows:[{sku:'B2B-1',name:'Bộ ly',qty:1,price:100,bundleContents:'01 ly + 01 nắp',packagingDescription:'Hộp quà riêng'}]});
  assert.equal((await store.get('a',saved.id)).data.rows[0].bundleContents,'01 ly + 01 nắp');
  assert.equal((await store.get('a',saved.id)).data.rows[0].packagingDescription,'Hộp quà riêng');
 }finally{sql.close();}
});

test('saved quote list includes successful Sapo order details and PDF availability',async()=>{
 const {sql,store}=fixture();try{
  const saved=await store.save('a',quote);
  sql.prepare(`INSERT INTO sapo_order_statuses
    (quote_number,status,sapo_order_id,sapo_order_code,customer_name,message,payload_json,updated_at,sapo_order_url)
    VALUES (?,?,?,?,?,?,?,?,?)`).run('BG001','created','123','SO-123','Khách hàng','Đã tạo','{}','2026-09-07','https://sapo.example/orders/123');
  const record=(await store.list('a')).records.find(item=>item.id===saved.id);
  assert.equal(record.sapoStatus,'created');
  assert.equal(record.sapoOrderCode,'SO-123');
  assert.equal(record.sapoOrderUrl,'https://sapo.example/orders/123');
  assert.equal(record.hasPdf,0);
 }finally{sql.close();}
});

test('saved quotations preserve the selected customer address for CRM contracts',async()=>{
 const {sql,store}=fixture();try{
  const saved=await store.save('a',{...quote,customerAddress:'123 Đường A, Cần Thơ'});
  assert.equal((await store.get('a',saved.id)).data.customerAddress,'123 Đường A, Cần Thơ');
 }finally{sql.close();}
});

test('saved quotations preserve generated contract document details',async()=>{
 const {sql,store}=fixture();try{
  const contractDocument={contractNumber:'09-01/26092026/HĐKT/BN-KH001',quoteNo:'BG001',generatedAt:'2026-09-26T08:46:00.000Z',details:{name:'Khách hàng',customerCode:'KH001',taxCode:'1800000000',representativeName:'Anh A',representativeTitle:'Giám đốc',address:'Cần Thơ',legalEntity:'Bách Ngân',collectionAccountName:'VCB Bách Ngân',deliveryAddress:'Kho khách',deliveryTime:'7 ngày',paymentMethod:'Chuyển khoản',depositRate:30,paymentDays:7}};
  const saved=await store.save('a',{...quote,contractDocument});
  assert.deepEqual((await store.get('a',saved.id)).data.contractDocument,contractDocument);
 }finally{sql.close();}
});

test('saved quote list can filter and display generated contract documents',async()=>{
 const {sql,store}=fixture();try{
  const contractDocument={contractNumber:'09-01/26092026/HĐKT/BN-KH001',quoteNo:'BG001',generatedAt:'2026-09-26T08:46:00.000Z',details:{name:'Khách hàng',customerCode:'KH001',taxCode:'1800000000',representativeName:'Anh A',representativeTitle:'Giám đốc',address:'Cần Thơ',legalEntity:'Bách Ngân',collectionAccountName:'VCB Bách Ngân',deliveryAddress:'Kho khách',deliveryTime:'7 ngày',paymentMethod:'Chuyển khoản',depositRate:30,paymentDays:7}};
  const saved=await store.save('a',{...quote,contractDocument});
  await store.save('a',{...quote,quoteNo:'BG002',customer:'Khách khác'});
  const byContract=await store.list('a',null,{contract:'BN-KH001'});
  assert.deepEqual(byContract.records.map(item=>item.id),[saved.id]);
  assert.equal(byContract.records[0].contractNumber,contractDocument.contractNumber);
  assert.equal(byContract.records[0].hasContract,1);
  const onlyContracts=await store.list('a',null,{hasContract:'1'});
  assert.deepEqual(onlyContracts.records.map(item=>item.id),[saved.id]);
  sql.prepare("UPDATE staff_quotations SET has_contract=1 WHERE quote_no='BG002'").run();
  assert.deepEqual((await store.list('a',null,{hasContract:'1'})).records.map(item=>item.id),[saved.id]);
  assert.equal((await store.list('c',null,{hasContract:'1'})).records.length,0);
 }finally{sql.close();}
});

test('stored quotations enforce scope, ownership, account revocation and current position', async () => {
  const { sql, store } = fixture();
  try {
    const a = await store.save('a', {...quote, creatorId:'c', role:'manager'});
    const c = await store.save('c', {...quote, type:'B2B'});
    assert.equal((await store.get('b', a.id)).canEdit, true);
    assert.equal((await store.list('b')).records.length, 1);
    assert.equal((await store.list('m')).records.length, 2);
    await assert.rejects(store.get('b', c.id), e=>e.status===404);
    await assert.rejects(store.get('b', 'unknown'), e=>e.status===404);
    const peerUpdated=await store.save('b', {...quote, customer:'Peer updated'}, a.id, 1);
    assert.equal(peerUpdated.revision, 2);
    await assert.rejects(store.remove('b', a.id, peerUpdated.revision), e=>e.status===409);
    await assert.rejects(store.list('x'), e=>e.status===403);
    const updated = await store.save('a', {...quote, customer:'Updated'}, a.id, peerUpdated.revision);
    assert.equal(updated.revision, 3);
    await assert.rejects(store.save('a', quote, a.id, 1), e=>e.status===409);
    await assert.rejects(store.remove('a', a.id, 1), e=>e.status===409);
    sql.prepare("UPDATE staff_members SET position_id='admin' WHERE id='b'").run();
    await assert.rejects(store.get('b', a.id), e=>e.status===404);
    assert.equal((await store.get('b', c.id)).canEdit, true);
    sql.prepare("UPDATE staff_members SET active=0 WHERE id='a'").run();
    await assert.rejects(store.save('a', quote), e=>e.status===403);
  } finally { sql.close(); }
});

test('invalid records are rejected and pagination does not expose another position', async () => {
  const { sql, store } = fixture();
  try {
    await assert.rejects(store.save('a', {...quote, rows:[{qty:-1}]}), e=>e.status===400);
    await assert.rejects(store.save('a', {...quote, rows:[{image:'javascript:alert(1)'}]}), e=>e.status===400);
    for (let i=0;i<53;i++) await store.save('a', {...quote, quoteNo:`BG${i}`});
    await store.save('c', quote);
    const first = await store.list('b');
    assert.equal(first.records.length, 50);
    assert.equal(first.records[0].quoteNo, 'BG52');
    const second = await store.list('b', first.nextCursor);
    assert.equal(second.records.length, 3);
    assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.records,...second.records].map(q=>q.id)).size, 53);
  } finally { sql.close(); }
});

test('manager updates an employee quote in place without taking ownership', async () => {
 const {sql,store}=fixture();
 try {
  const saved=await store.save('a',{...quote,owner:'Nhân viên A'});
  assert.equal((await store.get('m',saved.id)).canEdit,true);
  const updated=await store.save('m',{...quote,owner:'Nhân viên A',customer:'Manager updated'},saved.id,1);
  assert.equal(updated.id,saved.id);
  assert.equal(updated.revision,2);
  assert.equal(sql.prepare('SELECT creator_id FROM staff_quotations WHERE id=?').get(saved.id).creator_id,'a');
  assert.equal((await store.get('a',saved.id)).data.owner,'Nhân viên A');
  assert.equal((await store.get('a',saved.id)).canEdit,true);
  await assert.rejects(store.save('m',quote,saved.id,1),e=>e.status===409);
  sql.prepare("UPDATE staff_members SET role='employee' WHERE id='m'").run();
  await assert.rejects(store.save('m',quote,saved.id,2),e=>e.status===409);
 }finally{sql.close();}
});

test('manager saved quotations are approved immediately', async () => {
 const {sql,store}=fixture();
 try {
  const data={...quote,rows:[{sku:'SP-01',name:'Sản phẩm',qty:2,price:100000,discount:0,discountType:'percent',taxRate:8}]};
  const created=await store.save('m',data);
  assert.equal(created.approvalStatus,'approved');
  const createdRecord=await store.get('m',created.id);
  assert.equal(createdRecord.approvalStatus,'approved');
  assert.equal(createdRecord.approvedBy,'m');
  assert.ok(createdRecord.approvedAt);

  const employeeQuote=await store.save('a',data);
  assert.equal(employeeQuote.approvalStatus,'pending');
  const managerEdit=await store.save('m',{...data,rows:[{...data.rows[0],price:120000}]},employeeQuote.id,employeeQuote.revision);
  assert.equal(managerEdit.approvalStatus,'approved');
  const editedRecord=await store.get('m',employeeQuote.id);
  assert.equal(editedRecord.approvalStatus,'approved');
  assert.equal(editedRecord.approvedBy,'m');
 }finally{sql.close();}
});

test('customer care reminders stay active until closed or lost', async () => {
 const {sql,store}=fixture();
 try {
  const saved=await store.save('a',{...quote,customer:'Khách chăm sóc',contact:'Anh A',phone:'0909',careStatus:'active',careDueDate:'2026-10-02'});
  let lines=await store.productLines('a');
  assert.equal(lines.careCards.length,1);
  assert.equal(lines.careCards[0].customer,'Khách chăm sóc');
  assert.equal(lines.careCards[0].careDueDate,'2026-10-02');
  const result=await store.updateCare('a',saved.id,{status:'lost'});
  assert.equal(result.careStatus,'lost');
  assert.equal(result.careDueDate,'');
  lines=await store.productLines('a');
  assert.equal(lines.careCards.length,0);
 }finally{sql.close();}
});

test('purchase discount and cost price are visible only to managers and survive employee edits', async () => {
 const {sql,store}=fixture();
 try {
  const base={...quote,printing:{workshop:'Xưởng riêng',totalCost:25000,workshopExplicit:true},rows:[{sku:'SP-01',name:'Sản phẩm',qty:2,price:100000,purchaseDiscount:50,costPrice:50000,printing:{workshop:'Tiến phát',unitPrice:1000,workshopExplicit:true}}]};
  const saved=await store.save('a',base);
  assert.equal((await store.get('m',saved.id)).data.rows[0].costPrice,undefined);
  assert.equal((await store.get('m',saved.id)).data.rows[0].purchaseDiscount,undefined);

  const withCost=await store.save('m',base,saved.id,saved.revision);
  assert.equal((await store.get('m',saved.id)).data.rows[0].costPrice,50000);
  assert.equal((await store.get('m',saved.id)).data.rows[0].purchaseDiscount,50);
  assert.equal((await store.get('a',saved.id)).data.rows[0].costPrice,undefined);
  assert.equal((await store.get('a',saved.id)).data.rows[0].purchaseDiscount,undefined);
  assert.equal((await store.get('b',saved.id)).data.rows[0].costPrice,undefined);
  assert.equal((await store.get('b',saved.id)).data.rows[0].purchaseDiscount,undefined);

  assert.deepEqual((await store.get('m',saved.id)).data.printing,base.printing);
  assert.deepEqual((await store.get('m',saved.id)).data.rows[0].printing,base.rows[0].printing);
  assert.equal((await store.get('a',saved.id)).data.rows[0].printing,undefined);
  assert.equal((await store.get('a',saved.id)).data.printing,undefined);
  const employeeView=await store.get('a',saved.id);
  const edited=await store.save('a',{...employeeView.data,customer:'Khách hàng sửa'},saved.id,employeeView.revision);
  assert.equal((await store.get('m',saved.id)).data.rows[0].costPrice,50000);
  assert.equal((await store.get('m',saved.id)).data.rows[0].purchaseDiscount,50);
  assert.equal((await store.get('a',saved.id)).data.rows[0].costPrice,undefined);
  assert.equal((await store.get('a',saved.id)).data.rows[0].purchaseDiscount,undefined);
  assert.deepEqual((await store.get('m',saved.id)).data.printing,base.printing);
  assert.deepEqual((await store.get('m',saved.id)).data.rows[0].printing,base.rows[0].printing);
  assert.equal((await store.get('a',saved.id)).data.rows[0].printing,undefined);
  assert.equal(edited.revision,withCost.revision+1);
 }finally{sql.close();}
});

test('approved quotations only require reapproval when total or notes change', async () => {
 const {sql,store}=fixture();
 try {
  const data={...quote,notes:'- Giao hàng theo thỏa thuận.',rows:[{sku:'SP-01',name:'Sản phẩm',qty:2,price:100000,discount:0,discountType:'percent',taxRate:8}]};
  const saved=await store.save('a',data);
  const approved=await store.approve('m',saved.id);
  const cosmetic=await store.save('a',{...data,customer:'Khách hàng cập nhật',owner:'Nhân viên mới'},saved.id,approved.revision);
  assert.equal(cosmetic.approvalStatus,'approved');
  assert.equal((await store.get('a',saved.id)).approvalStatus,'approved');
  const noteChange=await store.save('a',{...data,customer:'Khách hàng cập nhật',owner:'Nhân viên mới',notes:'- Giao hàng trong 10 ngày.'},saved.id,cosmetic.revision);
  assert.equal(noteChange.approvalStatus,'pending');

  const another=await store.save('a',data);
  const anotherApproved=await store.approve('m',another.id);
  const totalChange=await store.save('a',{...data,rows:[{...data.rows[0],price:120000}]},another.id,anotherApproved.revision);
  assert.equal(totalChange.approvalStatus,'pending');
 } finally { sql.close(); }
});

test('approval is retained for cosmetic updates when quotation data is stored in R2', async () => {
 const {sql,db}=fixture(),objects=new Map();
 const bucket={
  async put(key,value){objects.set(key,String(value));},
  async get(key){const value=objects.get(key);return value===undefined?null:{json:async()=>JSON.parse(value)};},
 };
 const store=createQuotationStore(db,bucket);
 try {
  const data={...quote,notes:'- Ghi chú cũ.',rows:[{sku:'SP-01',name:'Sản phẩm',qty:1,price:100000,discount:0,discountType:'percent',taxRate:8}]};
  const saved=await store.save('a',data),approved=await store.approve('m',saved.id);
  const updated=await store.save('a',{...data,contact:'Người liên hệ mới'},saved.id,approved.revision);
  assert.equal(updated.approvalStatus,'approved');
  assert.equal((await store.get('a',saved.id)).approvalStatus,'approved');
 } finally { sql.close(); }
});

test('configured quote shares are visible without edit permission', async () => {
 const {sql}=fixture(), store=createQuotationStore({prepare(query){return {bind(...args){const statement=sql.prepare(query);return {async first(){return statement.get(...args)??null},async all(){return {results:statement.all(...args)}},async run(){return {meta:statement.run(...args)}}};}};}},null,{quoteShareOverrides:'BG001:admin'});
 try {
  const saved=await store.save('a',quote);
  const shared=await store.get('c',saved.id);
  assert.equal(shared.data.quoteNo,'BG001');
  assert.equal(shared.canEdit,false);
  assert.equal((await store.list('c')).records.some(record=>record.id===saved.id),true);
  await assert.rejects(store.save('c',{...quote,customer:'No'},saved.id,1),e=>e.status===409);
 }finally{sql.close();}
});

test('configured PDF hide overrides suppress stale stored PDFs', async () => {
 const {sql}=fixture(), db={prepare(query){return {bind(...args){const statement=sql.prepare(query);return {async first(){return statement.get(...args)??null},async all(){return {results:statement.all(...args)}},async run(){return {meta:statement.run(...args)}}};}};}}, store=createQuotationStore(db,null,{hidePdfOverrides:'BG001'});
 try {
  const saved=await store.save('a',quote);
  sql.prepare("UPDATE staff_quotations SET data=? WHERE id=?").run(JSON.stringify({pdfKey:'pdf/wrong.pdf'}),saved.id);
  const record=(await store.list('a')).records.find(item=>item.id===saved.id);
  assert.equal(record.approvalStatus,'approved');
  assert.equal(record.hasPdf,0);
 }finally{sql.close();}
});

test('workspace summaries use saved totals and never cross quotation visibility scope',async()=>{
 const {sql,store}=fixture();try{
  const own=await store.save('a',{...quote,date:'2026-10-01',careStatus:'active'});
  await store.save('c',{...quote,quoteNo:'PRIVATE',rows:[{sku:'SECRET',name:'Other position',qty:1,price:999999}]});
  const page=await store.list('b',null,{summary:'1'});
  assert.deepEqual(page.records.map(r=>r.id),[own.id]);
  assert.equal(page.records[0].total,108000);
  assert.equal(page.records[0].itemCount,1);
  assert.equal(page.records[0].quoteDate,'2026-10-01');
  assert.equal(Object.hasOwn(page.records[0],'data'),false);
  assert.equal(Object.hasOwn((await store.list('b')).records[0],'total'),false);
 }finally{sql.close();}
});

test('full quotation number searches legacy R2 records without opening payloads',async()=>{
 const {sql,db,store}=fixture();const saved=await store.save('a',{...quote,quoteNo:'BGHRC-20261002-1234'});
 sql.prepare("UPDATE staff_quotations SET data=?,search_text=NULL WHERE id=?").run(JSON.stringify({r2Key:'quotations/legacy.json'}),saved.id);
 let reads=0;const fast=createQuotationStore(db,{get:async()=>{reads++;throw Error('should not read');}});
 const result=await fast.list('a',null,{customer:'bghrc-20261002-1234'});assert.equal(result.records[0].id,saved.id);assert.equal(reads,0);
 assert.equal((await fast.list('c',null,{customer:'BGHRC-20261002-1234'})).records.length,0);sql.close();
});

test('list cache reuses unchanged summaries, recomputes changed payloads and honors live permissions',async()=>{
 const {sql,db}=fixture(),objects=new Map();let reads=0;
 const bucket={put:async(k,v)=>objects.set(k,String(v)),get:async k=>{if(k.startsWith('quotations/'))reads++;const v=objects.get(k);return v===undefined?null:{json:async()=>JSON.parse(v)};}};
 const store=createQuotationStore(db,bucket);
 try{
  const saved=await store.save('a',quote);
  await store.list('b',null,{summary:'1'});reads=0;
  assert.equal((await store.list('b',null,{summary:'1'})).records[0].total,108000);assert.equal(reads,0);
  await store.save('a',{...quote,rows:[{...quote.rows[0],qty:2}]},saved.id,saved.revision);reads=0;
  assert.equal((await store.list('b',null,{summary:'1'})).records[0].total,216000);assert.equal(reads,1);
  reads=0;await store.list('b',null,{summary:'1',refresh:'1'});assert.equal(reads,1);
  sql.prepare("UPDATE staff_members SET position_id='admin' WHERE id='b'").run();
  assert.equal((await store.list('b',null,{summary:'1'})).records.length,0);
  sql.prepare('DELETE FROM staff_quotations WHERE id=?').run(saved.id);
  assert.equal((await store.list('a',null,{summary:'1'})).records.length,0);
 }finally{sql.close();}
});

test('editing saved contract details preserves quotation and rejects stale revisions',async()=>{
 const {sql,store}=fixture();try{
 const details={name:'Bên mua',taxCode:'1800',representativeName:'A',depositRate:30,paymentDays:15};
 const saved=await store.save('a',{...quote,contractDocument:{contractNumber:'HD-TEST',quoteNo:quote.quoteNo,generatedAt:'2026-10-03',details}});
 const loaded=await store.get('a',saved.id);const next=structuredClone(loaded.data);next.contractDocument.details.deliveryAddress='Kho mới';next.contractDocument.details.depositRate=50;
 const result=await store.updateContractDetails('a',saved.id,{details:next.contractDocument.details,revision:loaded.revision});
 const actual=await store.get('a',saved.id);assert.equal(actual.data.contractDocument.details.deliveryAddress,'Kho mới');assert.equal(actual.data.contractDocument.details.depositRate,50);assert.equal(actual.data.contractDocument.contractNumber,'HD-TEST');assert.deepEqual(actual.data.rows,loaded.data.rows);
 await assert.rejects(store.updateContractDetails('a',saved.id,{details:next.contractDocument.details,revision:loaded.revision}),e=>e.status===409);assert.equal(actual.revision,result.revision);
 await assert.rejects(store.updateContractDetails('c',saved.id,{details:next.contractDocument.details,revision:actual.revision}),e=>e.status===403);
 }finally{sql.close();}
});

test('contract-only edit retains immutable R2 payload fields and approval metadata',async()=>{
 const {sql,db}=fixture(),objects=new Map(),bucket={put:async(k,v)=>objects.set(k,String(v)),get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null};const store=createQuotationStore(db,bucket);
 try{const saved=await store.save('m',{...quote,rows:[{...quote.rows[0],costPrice:12345}],contractDocument:{contractNumber:'HD-R2',generatedAt:'2026-10-03',details:{depositRate:0,paymentDays:10}}});
 const before=await store.get('m',saved.id);await store.updateContractDetails('m',saved.id,{revision:before.revision,details:{...before.data.contractDocument.details,representativeName:'Đại diện mới'}});const after=await store.get('m',saved.id);
 assert.deepEqual(after.data.rows,before.data.rows);assert.equal(after.approvalStatus,before.approvalStatus);assert.equal(after.approvedAt,before.approvedAt);assert.equal(after.data.contractDocument.generatedAt,before.data.contractDocument.generatedAt);assert.equal(after.data.contractDocument.details.representativeName,'Đại diện mới');
 await assert.rejects(store.updateContractDetails('m',saved.id,{revision:after.revision,details:{depositRate:101,paymentDays:1}}),e=>e.status===400);
 }finally{sql.close();}
});
