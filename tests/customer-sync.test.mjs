import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {searchCustomersWithSapoFallback,syncCustomers,searchCustomers} from '../lib/customer-sync.mjs';
test('customer receiver requires dedicated token; idempotent updates and staff-only search',async()=>{
 const modules=[{type:'ESModule',path:resolve('customer-test.mjs'),contents:"import {staffApi} from './lib/staff-api.mjs';export default {fetch:staffApi};"}];
 for(const file of ['quote-math.js','shipping.js','supplier-progress.js'])modules.push({type:'ESModule',path:resolve('public/'+file),contents:readFileSync('public/'+file,'utf8')});
 for(const name of readdirSync('lib').filter(file=>file.endsWith('.mjs')).map(file=>file.slice(0,-4)))modules.push({type:'ESModule',path:resolve('lib/'+name+'.mjs'),contents:readFileSync('lib/'+name+'.mjs','utf8').replaceAll("'@noble/hashes/","'../node_modules/@noble/hashes/").replaceAll("'@neondatabase/serverless'", "'../node_modules/@neondatabase/serverless/index.mjs'")});
 modules.push({type:'ESModule',path:resolve('node_modules/@neondatabase/serverless/index.mjs'),contents:readFileSync('node_modules/@neondatabase/serverless/index.mjs','utf8')});
 for(const file of readdirSync('node_modules/@noble/hashes').filter(f=>f.endsWith('.js')))modules.push({type:'ESModule',path:resolve('node_modules/@noble/hashes/'+file),contents:readFileSync('node_modules/@noble/hashes/'+file,'utf8')});
 const mf=new Miniflare({modules,modulesRoot:process.cwd(),compatibilityDate:'2026-05-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['FILES'],bindings:{SAPO_SYNC_TOKEN:'test-sync'}});
 try{
 const db=await mf.getD1Database('DB');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await db.prepare("INSERT INTO staff_setup VALUES ('initial-roster-v1')").run();
 await db.prepare("INSERT INTO staff_members (id,email,name,active,created_at) VALUES ('a','a@example.invalid','A',1,'2026-09-06')").run();
 await db.prepare("INSERT INTO staff_credentials (member_id,version) VALUES ('a',0)").run();
 const raw='a'.repeat(64);await db.prepare("INSERT INTO staff_sessions (hash,member_id,version,expires) VALUES (?,'a',0,?)").bind(createHash('sha256').update(raw).digest('hex'),Math.floor(Date.now()/1000)+3600).run();
 const send=async(body,token='test-sync')=>{const r=await mf.dispatchFetch('https://test/api/staff/integrations/sapo/customers',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const observedAt=new Date().toISOString(),customer={id:'123',name:'Đặng Thị Ánh',taxCode:'1801234567',phone:'0901234567',email:'anh@example.invalid',updatedAt:'2026-01-02T00:00:00Z'};
 assert.equal((await send({observedAt,customers:[customer]},'wrong')).status,401);
 assert.equal((await send({observedAt,customers:[customer]})).status,200);
 assert.equal((await send({observedAt,customers:[customer]})).status,200);
 assert.equal((await db.prepare('SELECT count(*) AS count FROM sapo_customers').first()).count,1);
 const old=await send({observedAt,customers:[{...customer,name:'Old',updatedAt:'2026-01-01T00:00:00Z'}]});assert.equal(old.data.applied,0);
 assert.equal((await send({observedAt,customers:[customer,{...customer,id:'bad/id'}]})).status,400);
 const anon=await mf.dispatchFetch('https://test/api/staff/customers?q=dang');assert.equal(anon.status,401);
 const found=await mf.dispatchFetch('https://test/api/staff/customers?q=dang%20anh',{headers:{Cookie:'__Host-bn-session='+raw}});assert.equal(found.status,200);assert.equal((await found.json()).customers[0].name,customer.name);
 await db.prepare("UPDATE staff_members SET active=0 WHERE id='a'").run();
 const catalog={format:'sapo-catalog-v1',observedAt,warehouses:['MINH LONG - LOCKNLOCK CẦN THƠ','KHO VIGIFTS','BÁCH NGÂN (HÓA ĐƠN)','LOCKNLOCK ( HÓA ĐƠN)'],pricePolicies:['Retail'],products:[{sku:'P1',name:'Product',unit:'Each',brand:'',pattern:'',image:'',taxBasis:'Excluded',taxable:true,taxIn:8,taxOut:8,prices:[100],stock:[0,-2,3,null]}]};
 const sendCatalog=body=>mf.dispatchFetch('https://test/api/staff/integrations/sapo/catalog',{method:'POST',headers:{Authorization:'Bearer test-sync','Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await sendCatalog(catalog)).status,200);
 assert.equal((await mf.dispatchFetch('https://test/api/staff/catalog')).status,401);
 assert.equal((await mf.dispatchFetch('https://test/api/staff/catalog',{headers:{Cookie:'__Host-bn-session='+raw}})).status,401);
 assert.equal((await sendCatalog({...catalog,products:[...catalog.products,...catalog.products]})).status,400);
 await db.prepare("UPDATE staff_members SET active=1 WHERE id='a'").run();
 const post=async(path,body,cookie=raw,origin='https://test')=>mf.dispatchFetch('https://test/api/staff'+path,{method:'POST',headers:{Cookie:'__Host-bn-session='+cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const local={id:'local_11111111-1111-4111-8111-111111111111',name:'Khách ngoài Sapo',phone:'0900000011',email:'local@example.invalid',address:'Cần Thơ'};
 assert.equal((await post('/customers',local,'invalid')).status,401);
 assert.equal((await post('/customers',local,raw,'https://evil.test')).status,403);
 assert.equal((await post('/customers',local)).status,201);
 assert.equal((await post('/customers',local)).status,201);
 assert.equal((await db.prepare('SELECT count(*) AS count FROM sapo_customers WHERE id=?').bind(local.id).first()).count,1);
 assert.equal((await post('/customers',{...local,name:'Changed'})).status,409);
 assert.equal((await send({observedAt,customers:[local]})).status,400);
 const localSearch=await mf.dispatchFetch('https://test/api/staff/customers?q=ngoai',{headers:{Cookie:'__Host-bn-session='+raw}});assert.equal((await localSearch.json()).customers[0].source,'local');
 const withCk={...local,id:'local_22222222-2222-4222-8222-222222222222',customerCode:'KH-CK',taxCode:'0012345678',discounts:{minhLong:35,lys:42.5,lock:0}};
 const ckResponse=await post('/customers',withCk);assert.equal(ckResponse.status,201);assert.deepEqual((await ckResponse.json()).customer.discounts,withCk.discounts);
 assert.equal((await post('/customers',withCk)).status,201);
 assert.equal((await post('/customers',{...withCk,discounts:{lys:12}})).status,409);
 for(const value of [-1,101,'35'])assert.equal((await post('/customers',{...withCk,discounts:{lys:value}})).status,400);
 const byTax=await mf.dispatchFetch('https://test/api/staff/customers?q=0012345678',{headers:{Cookie:'__Host-bn-session='+raw}});const matched=(await byTax.json()).customers[0];assert.equal(matched.customerCode,'KH-CK');assert.deepEqual(matched.discounts,withCk.discounts);
 const updateCustomer=(body,cookie=raw,origin='https://test')=>mf.dispatchFetch('https://test/api/staff/customers',{method:'PUT',headers:{Cookie:'__Host-bn-session='+cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const edited={...matched,name:'Khách đã sửa',phone:'0900555666',discounts:{minhLong:40,lys:0,lock:15},taxCode:'0099887766'};
 assert.equal((await updateCustomer(edited,'invalid')).status,401);
 assert.equal((await updateCustomer(edited,raw,'https://evil.test')).status,403);
 assert.equal((await updateCustomer({...edited,discounts:{lock:101}})).status,400);
 const updated=await updateCustomer(edited);assert.equal(updated.status,200);const updatedCustomer=(await updated.json()).customer;assert.equal(updatedCustomer.id,matched.id);assert.deepEqual(updatedCustomer.discounts,edited.discounts);
 assert.equal((await updateCustomer(edited)).status,409);
 const editedSearch=await mf.dispatchFetch('https://test/api/staff/customers?q=0099887766',{headers:{Cookie:'__Host-bn-session='+raw}});assert.equal((await editedSearch.json()).customers[0].name,edited.name);
 const sapoRow=await db.prepare('SELECT synced_at AS syncedAt FROM sapo_customers WHERE id=?').bind(customer.id).first();
 assert.equal((await updateCustomer({...customer,...sapoRow,taxCode:'1234567890',discounts:{lys:20}})).status,200);
 assert.equal((await db.prepare('SELECT count(*) AS count FROM sapo_customers WHERE id=?').bind(customer.id).first()).count,1);
 const employee={phone:'0900123456',name:'Nhân viên mới',email:' NEW@quatangvigifts.com ',positionId:'sale'};
 assert.equal((await post('/admin/members',employee)).status,403);
 const putPhone=(id,phone)=>mf.dispatchFetch('https://test/api/staff/admin/member-phone',{method:'PUT',headers:{Cookie:'__Host-bn-session='+raw,Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({id,phone})});
 assert.equal((await putPhone('a','0900111222')).status,403);
 const catalogRead=await mf.dispatchFetch('https://test/api/staff/catalog',{headers:{Cookie:'__Host-bn-session='+raw}});
 assert.equal(catalogRead.status,200);assert.match(catalogRead.headers.get('cache-control'),/private/);assert.deepEqual(await catalogRead.json(),{...catalog,stockRevision:0,warehouses:[...catalog.warehouses.slice(0,2),'NCC','Hàng chờ về'],products:catalog.products.map(p=>({...p,stock:[...p.stock.slice(0,2),null,null],incomingQuantity:0}))});
 await db.prepare("UPDATE staff_members SET role='manager' WHERE id='a'").run();
 assert.equal((await putPhone('a','0900111222')).status,200);
 const me=await mf.dispatchFetch('https://test/api/staff/me',{headers:{Cookie:'__Host-bn-session='+raw}});assert.equal((await me.json()).user.phone,'0900111222');
 assert.equal((await putPhone('a','x'.repeat(41))).status,400);
 await db.prepare("INSERT INTO staff_positions (id,name) VALUES ('sale','Sale')").run();
 assert.equal((await post('/admin/members',{...employee,email:'email-khong-hop-le'})).status,400);
 const externalCreated=await post('/admin/members',{...employee,email:' LOCKNLOCKCANTHO@GMAIL.COM '});assert.equal(externalCreated.status,201);assert.equal((await externalCreated.json()).member.email,'locknlockcantho@gmail.com');
 assert.equal((await post('/admin/members',{...employee,positionId:'missing'})).status,400);
 const created=await post('/admin/members',{...employee,role:'manager'});assert.equal(created.status,201);const createdData=await created.json();assert.equal(createdData.member.phone,employee.phone);assert.equal((await db.prepare('SELECT phone FROM staff_members WHERE id=?').bind(createdData.member.id).first()).phone,employee.phone);assert.equal(createdData.member.role,'employee');assert.equal(createdData.member.email,'new@quatangvigifts.com');
 const activation=new URLSearchParams(new URL(createdData.url).hash.slice(1)).get('token');
 const credentials=await db.prepare('SELECT * FROM staff_credentials WHERE member_id=?').bind(createdData.member.id).first();assert.equal(credentials.password_hash,null);assert.equal(credentials.activation_hash,createHash('sha256').update(activation).digest('hex'));assert(credentials.activation_expires>Date.now()/1000);
 assert.equal((await post('/admin/members',employee)).status,409);
 assert.equal((await db.prepare("SELECT count(*) AS count FROM staff_members WHERE email='new@quatangvigifts.com'").first()).count,1);
 const managerRead=await mf.dispatchFetch('https://test/api/staff/catalog',{headers:{Cookie:'__Host-bn-session='+raw}});assert.deepEqual(await managerRead.json(),{...catalog,stockRevision:0,warehouses:[...catalog.warehouses.slice(0,2),'NCC','Hàng chờ về'],products:catalog.products.map(p=>({...p,stock:[...p.stock.slice(0,2),null,null],incomingQuantity:0}))});
 await db.prepare("UPDATE staff_members SET active=0 WHERE id='a'").run();
 assert.equal((await mf.dispatchFetch('https://test/api/staff/customers',{headers:{Cookie:'__Host-bn-session='+raw}})).status,401);
 }finally{await mf.dispose();}
});

test('staff customer search imports missing customers from Sapo direct fallback',async()=>{
 const mf=new Miniflare({modules:[{type:'ESModule',path:resolve('empty-customer-fallback-test.mjs'),contents:'export default {};'}],modulesRoot:process.cwd(),compatibilityDate:'2026-05-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const result=await searchCustomersWithSapoFallback(db,'Ngoc Phuong Dong',{SAPO_ADMIN_COOKIE:'sid=test'},async(url,options)=>{
    const parsed=new URL(url);
    assert.equal(parsed.pathname,'/admin/customers.json');
    assert.equal(parsed.searchParams.get('query'),'Ngoc Phuong Dong');
    assert.equal(options.headers.cookie,'sid=test');
    return new Response(JSON.stringify({customers:[{id:99,name:'CÔNG TY TNHH TRUYỀN THÔNG VÀ DU LỊCH NGỌC PHƯƠNG ĐÔNG',code:'CUZN99999',tax_code:'1800000000',phone:'0900000000',default_address:{address1:'Cần Thơ'},updated_at:'2024-01-01T00:00:00Z'}]}));
  });
  assert.equal(result.sapoDirect.imported,1);
  assert.equal(result.customers[0].name,'CÔNG TY TNHH TRUYỀN THÔNG VÀ DU LỊCH NGỌC PHƯƠNG ĐÔNG');
  assert.equal(result.customers[0].source,'sapo');
  assert.equal((await db.prepare('SELECT count(*) AS count FROM sapo_customers WHERE id=?').bind('99').first()).count,1);
 }finally{await mf.dispose();}
});

test('customer search ranks name matches ahead of incidental code matches',async()=>{
 const mf=new Miniflare({modules:[{type:'ESModule',path:resolve('customer-rank-test.mjs'),contents:'export default {};'}],modulesRoot:process.cwd(),compatibilityDate:'2026-05-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const observedAt=new Date().toISOString();
  await syncCustomers(db,{observedAt,customers:[
    {id:'1',customerCode:'CCTHCTST21A',name:'CHI CỤC THUẾ HUYỆN CHÂU THÀNH',taxCode:'0',updatedAt:'2020-01-01T00:00:00Z'},
    {id:'2',customerCode:'CUZN08188',name:'Công Ty Cổ Phần Đầu Tư Kinh Doanh Và Thương Mại Dịch Vụ THC',taxCode:'0110067180',updatedAt:'2026-09-22T01:24:06Z'},
    {id:'3',customerCode:'CTTKNHTHCM28A',name:'CÔNG TY TNHH KIM NGÂN HÀ',taxCode:'0309780940',updatedAt:'2020-01-01T00:00:00Z'},
  ]});
  const result=await searchCustomers(db,'THC');
  assert.equal(result.customers[0].customerCode,'CUZN08188');
 }finally{await mf.dispose();}
});


test('Sapo excludes retail and missing tax IDs, including old imports and direct fallback',async()=>{
 const mf=new Miniflare({modules:[{type:'ESModule',path:resolve('customer-filter-test.mjs'),contents:'export default {};'}],modulesRoot:process.cwd(),compatibilityDate:'2026-05-01',d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const observedAt=new Date().toISOString(),valid={id:'valid',name:'Công ty hợp lệ',taxCode:'1801234567',updatedAt:'2026-01-02T00:00:00Z'};
  const result=await syncCustomers(db,{observedAt,customers:[valid,{id:'retail',name:'KHÁCH HÀNG LẺ',taxCode:'1801234567'},{id:'missing',name:'Công ty chưa có MST'},{id:'zero',name:'Công ty MST chưa nhập',taxCode:'0000000000'}]});
  assert.deepEqual(result,{received:4,applied:1,skipped:3});
  assert.equal((await db.prepare('SELECT count(*) AS n FROM sapo_customers').first()).n,1);
  // Existing ineligible rows must be hidden before LIMIT, without deleting history.
  for(let i=0;i<30;i++)await db.prepare("INSERT INTO sapo_customers (id,name,contact,phone,email,address,search,source_version,synced_at,tax_code) VALUES (?,?,'','','','',?,0,'2026-01-01',?)").bind('old'+i,'A old customer','old'+i+' a old customer','').run();
  await db.prepare("INSERT INTO sapo_customers (id,name,contact,phone,email,address,search,source_version,synced_at,tax_code) VALUES ('oldretail','Khách lẻ','','','','','oldretail khach le    1801234567 ',0,'2026-01-01','1801234567')").run();
  assert.deepEqual((await searchCustomers(db,'')).customers.map(c=>c.id),['valid']);
  await syncCustomers(db,{observedAt,customers:[{...valid,taxCode:'',updatedAt:'2026-01-01T00:00:00Z'}]});
  assert.equal((await searchCustomers(db,'hop le')).customers.length,1);
  await syncCustomers(db,{observedAt,customers:[{...valid,taxCode:'',updatedAt:'2026-01-03T00:00:00Z'}]});
  assert.equal((await searchCustomers(db,'hop le')).customers.length,0);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM sapo_customers WHERE id=?').bind('valid').first()).n,1);
  const direct=await searchCustomersWithSapoFallback(db,'khach',{SAPO_ADMIN_COOKIE:'sid=test'},async()=>new Response(JSON.stringify({customers:[{id:999,name:'Khách lẻ',tax_code:'1801234567'},{id:998,name:'Khách không MST'}]})));
  assert.equal(direct.sapoDirect.imported,0);assert.equal(direct.sapoDirect.skipped,2);assert.equal(direct.customers.length,0);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM sapo_customers WHERE id IN ('998','999')").first()).n,0);
 }finally{await mf.dispose();}
});
