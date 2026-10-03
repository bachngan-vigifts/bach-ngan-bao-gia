import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFileSync,readdirSync} from 'node:fs';
import {replaceCatalog,saveProduct,readCatalog,catalogData,importPackaging,restoreMissingPackaging,inheritMinhLongPackaging,getIncomingStock,importIncomingStock,listIncomingStock,receiveIncomingStock,updateIncomingStockPayment,deleteIncomingStock,importStock} from '../lib/product-catalog.mjs';
import {makeBackup,exportBackup} from '../lib/quotation-backup.mjs';
test('product edits persist across sync, reject duplicate/concurrent writes and preserve warehouse restrictions',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['FILES']});
 try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const warehouses=['MINH LONG - LOCKNLOCK CẦN THƠ','KHO VIGIFTS','Hóa đơn 1','Hóa đơn 2'];
 const base={sku:'P1',name:'Original',unit:'Cái',brand:'Lock',pattern:'',image:'',taxBasis:'Giá chưa bao gồm thuế',taxable:true,taxIn:8,taxOut:8,prices:[100,200],stock:[10,20,30,40],perCarton:12,cartonWeight:5,cartonLength:30,cartonWidth:20,cartonHeight:10};
 const catalog={format:'sapo-catalog-v1',observedAt:new Date().toISOString(),warehouses,pricePolicies:['Retail','Wholesale'],products:[base]};await replaceCatalog(bucket,catalog);
 const member={id:'staff',role:'staff'},manager={id:'boss',role:'manager'};
 const input={ticketNumber:'PN-EDIT',warehouse:warehouses[0],arrivalDate:'2026-09-12',filename:'test.xlsx',paidAmount:1200000,rows:[{sku:'P1',quantity:12}]};
 const created=await importIncomingStock(db,bucket,input,manager,true);
 assert.equal(created.shipment.paidAmount,1200000);
 assert.equal((await catalogData(bucket,db)).products[0].stock[5],12);
 const paid=await updateIncomingStockPayment(bucket,{id:created.shipment.id,revision:created.shipment.updatedAt,paidAmount:2500000},manager);
 assert.equal(paid.shipment.paidAmount,2500000);
 const change={ticketNumber:'PN-UPDATED',warehouse:warehouses[0],arrivalDate:'2026-09-13',filename:'test.xlsx',id:created.shipment.id,revision:created.shipment.updatedAt,rows:[{sku:'P1',quantity:24}]};
 await assert.rejects(()=>importIncomingStock(db,bucket,change,member,true),e=>e.status===403);
 await importIncomingStock(db,bucket,{...change,revision:paid.shipment.updatedAt},manager,true);
 const saved=await getIncomingStock(db,bucket,change.id);
 assert.equal(saved.quantity,24);assert.equal(saved.cartons,2);assert.equal(saved.ticketNumber,'PN-UPDATED');assert.equal(saved.arrivalDate,'2026-09-13');assert.equal(saved.createdBy,manager.id);
 assert.equal(saved.paidAmount,2500000);
 assert.equal((await listIncomingStock(bucket)).shipments.length,1);
 await assert.rejects(()=>importIncomingStock(db,bucket,{...change,revision:'old'},manager,true),e=>e.status===409);
 await assert.rejects(()=>importIncomingStock(db,bucket,{...input,ticketNumber:'PN-UPDATED'},manager,true),e=>e.status===409);
 const product={...base,name:'Updated',prices:{Retail:150,Wholesale:null},stock:{[warehouses[0]]:11,[warehouses[1]]:null}};
 await assert.rejects(()=>saveProduct(db,bucket,{product:{...product,sku:'p1'}},member,true),e=>e.status===409);
 await assert.rejects(()=>saveProduct(db,bucket,{product:{...product,stock:{...product.stock,[warehouses[2]]:0}},revision:0},member,false),e=>e.status===400);
 await saveProduct(db,bucket,{product,revision:0},member,false);
 await assert.rejects(()=>saveProduct(db,bucket,{product,revision:0},member,false),e=>e.status===409);
 const sapoRefresh={...product,perCarton:0,cartonWeight:0,cartonLength:0,cartonWidth:0,cartonHeight:0};
 await saveProduct(db,bucket,{product:sapoRefresh,revision:1},member,false);
 let visible=await (await readCatalog(bucket,'staff',db)).json();assert.equal(visible.warehouses.length,4);assert.deepEqual(visible.products[0].stock,[11,null,null,24]);
 let full=await catalogData(bucket,db);assert.deepEqual(full.products[0].stock,[11,null,30,40,null,24]);assert.deepEqual(full.products[0].prices,[150,null]);assert.deepEqual([full.products[0].perCarton,full.products[0].cartonWeight,full.products[0].cartonLength],[12,5,30]);
 await replaceCatalog(bucket,{...catalog,products:[{...base,name:'Upstream',stock:[3,4,31,41]}]});
 full=await catalogData(bucket,db);assert.equal(full.products[0].name,'Updated');assert.deepEqual(full.products[0].stock,[11,null,31,41,null,24]);
 await saveProduct(db,bucket,{product:{...product,sku:'NEW',image:'data:image/png;base64,aGVsbG8=',brand:'MINH LONG - LYS'}},member,true);
 full=await catalogData(bucket,db);assert.equal(full.products.length,2);assert.deepEqual(full.products[1].stock,[11,null,null,null,null,null]);
 const mProduct={...product,stock:Object.fromEntries(warehouses.map((w,i)=>[w,i]))};
 await assert.rejects(()=>saveProduct(db,bucket,{product:mProduct,revision:2},manager,false),e=>e.status===400);
 await saveProduct(db,bucket,{product,revision:2},member,false);
 assert.deepEqual((await catalogData(bucket,db)).products[0].stock,[11,null,31,41,null,24]);
 const snap=await makeBackup(db,bucket);const backup=await (await exportBackup(bucket,snap.key)).json();assert.equal(backup.productEdits.length,2);
 }finally{await mf.dispose();}
});

test('Lock packaging import previews and persists only matching Lock products',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['FILES']});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const warehouse=['MINH LONG - LOCKNLOCK CẦN THƠ','KHO VIGIFTS','Hóa đơn 1','Hóa đơn 2'];
  const product={sku:'LOCK-1',name:'Lock product',unit:'Cái',brand:'Lock',pattern:'',image:'',taxBasis:'Giá chưa bao gồm thuế',taxable:true,taxIn:8,taxOut:8,prices:[100],stock:[0,0,0,0],perCarton:0,cartonWeight:0,cartonLength:0,cartonWidth:0,cartonHeight:0};
  const other={...product,sku:'OTHER-1',brand:'Khác'};
  await replaceCatalog(bucket,{format:'sapo-catalog-v1',observedAt:new Date().toISOString(),warehouses:warehouse,pricePolicies:['Retail'],products:[product,other]});
  const body={filename:'lock.xlsx',rows:[{sku:'LOCK-1',fields:{perCarton:12,cartonWeight:7.2,cartonLength:38.5,cartonWidth:28,cartonHeight:38.5}},{sku:'OTHER-1',fields:{perCarton:10}},{sku:'MISSING',fields:{perCarton:8}}]};
  const preview=await importPackaging(db,bucket,body,{id:'manager',role:'manager'});
  assert.equal(preview.matched,1);assert.equal(preview.notLockCount,1);assert.equal(preview.unknownCount,1);
  await importPackaging(db,bucket,{...body,version:preview.version},{id:'manager',role:'manager'},true);
  const recovered=await restoreMissingPackaging(db,bucket,{id:'manager',role:'manager'},[{sku:'OTHER-1',fields:{perCarton:6,cartonWeight:3,cartonLength:20,cartonWidth:15,cartonHeight:10}}]);
  assert.equal(recovered.restored,1);
  const data=await catalogData(bucket,db),saved=data.products.find(item=>item.sku==='LOCK-1'),restored=data.products.find(item=>item.sku==='OTHER-1');
  assert.deepEqual([saved.perCarton,saved.cartonWeight,saved.cartonLength,saved.cartonWidth,saved.cartonHeight],[12,7.2,38.5,28,38.5]);
  assert.deepEqual([restored.perCarton,restored.cartonWeight,restored.cartonLength,restored.cartonWidth,restored.cartonHeight],[6,3,20,15,10]);
 }finally{await mf.dispose();}
});

test('saved incoming shipment recalculates from restored carton specifications',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['FILES']});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const product={sku:'P1',name:'Product',unit:'Cái',brand:'MINH LONG',pattern:'',image:'',taxBasis:'Giá chưa bao gồm thuế',taxable:true,taxIn:8,taxOut:8,prices:[100],stock:[0,0,0,0],perCarton:0,cartonWeight:0,cartonLength:0,cartonWidth:0,cartonHeight:0};
  await replaceCatalog(bucket,{format:'sapo-catalog-v1',observedAt:new Date().toISOString(),warehouses:['MINH LONG - LOCKNLOCK CẦN THƠ','KHO VIGIFTS','Hóa đơn 1','Hóa đơn 2'],pricePolicies:['Retail'],products:[product]});
  const id='11111111-1111-4111-8111-111111111111',key=`incoming-stock/${id}.json`,shipment={id,key,ticketNumber:'PN1'};
  await bucket.put('incoming-stock/index.json',JSON.stringify({shipments:[shipment]}));await bucket.put(key,JSON.stringify({...shipment,rows:[{sku:'P1',name:'Product',quantity:13,perCarton:null,cartons:null,weightKg:null,volumeM3:null}]}));
  await restoreMissingPackaging(db,bucket,{id:'manager',role:'manager'},[{sku:'P1',fields:{perCarton:10,cartonWeight:3,cartonLength:20,cartonWidth:10,cartonHeight:10}}]);
  const result=await getIncomingStock(db,bucket,id);assert.equal(result.rows[0].cartons,1.3);assert.ok(Math.abs(result.rows[0].weightKg-3.9)<1e-9);assert.ok(Math.abs(result.rows[0].volumeM3-.0026)<1e-9);assert.equal(result.cartons,1.3);
  const catalog=await catalogData(bucket,db);assert.equal(catalog.products[0].stock[catalog.warehouses.indexOf('Hàng chờ về')],13);
 }finally{await mf.dispose();}
});

test('incoming stock adds per saved ticket, adjusts edits and survives inventory refresh without double counting',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['FILES']});
 try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const warehouses=['MINH LONG - LOCKNLOCK CẦN THƠ','KHO VIGIFTS','Hóa đơn 1','Hóa đơn 2','Hàng chờ về'];
 const base={sku:'A',name:'A',unit:'Cái',brand:'Lock',pattern:'',image:'',taxBasis:'Giá chưa bao gồm thuế',taxable:true,taxIn:8,taxOut:8,prices:[100],stock:[10,20,0,0,5]};
 const catalog={format:'sapo-catalog-v1',observedAt:new Date().toISOString(),warehouses,pricePolicies:['Retail'],products:[base,{...base,sku:'B',name:'B',stock:[1,2,0,0,0]}]};await replaceCatalog(bucket,catalog);
 const manager={id:'boss',role:'manager'},input={ticketNumber:'1',warehouse:warehouses[0],arrivalDate:'2026-09-12',filename:'test.xlsx',rows:[{sku:'A',quantity:12},{sku:'B',quantity:3}]};
 const stocks=async()=>{const data=await catalogData(bucket,db);return data.products.map(p=>p.stock[data.warehouses.indexOf('Hàng chờ về')]);};
 await importIncomingStock(db,bucket,input,manager,false);assert.deepEqual(await stocks(),[5,0]);
 const a=await importIncomingStock(db,bucket,input,manager,true);assert.deepEqual(await stocks(),[17,3]);
 await importIncomingStock(db,bucket,{...input,ticketNumber:'2',rows:[{sku:'A',quantity:8}]},manager,true);assert.deepEqual(await stocks(),[25,3]);
 const changed=await importIncomingStock(db,bucket,{...input,id:a.shipment.id,revision:a.shipment.updatedAt,rows:[{sku:'A',quantity:4}]},manager,true);assert.deepEqual(await stocks(),[17,0]);
 await importIncomingStock(db,bucket,{...input,id:a.shipment.id,revision:changed.shipment.updatedAt,rows:[{sku:'A',quantity:4}]},manager,true);assert.deepEqual(await stocks(),[17,0]);
 const stockInput={filename:'stock.xlsx',observedAt:new Date().toISOString(),rows:[{sku:'A',stock:{[warehouses[0]]:42}}]};
 const preview=await importStock(db,bucket,stockInput,manager,false);await importStock(db,bucket,{...stockInput,version:preview.version},manager,true);assert.deepEqual(await stocks(),[17,0]);
 const data=await catalogData(bucket,db),product=data.products[0];
 await saveProduct(db,bucket,{revision:product.revision||0,stockRevision:data.stockRevision,product:{...product,prices:{Retail:100},stock:Object.fromEntries(data.warehouses.filter(w=>['MINH LONG - LOCKNLOCK CẦN THƠ','KHO VIGIFTS','NCC','Hàng chờ về'].includes(w)).map(w=>[w,product.stock[data.warehouses.indexOf(w)]]))}},manager,false);assert.deepEqual(await stocks(),[17,0]);
 await replaceCatalog(bucket,catalog);assert.deepEqual(await stocks(),[17,0]);
 const latestChanged=await getIncomingStock(db,bucket,changed.shipment.id);
 await deleteIncomingStock(bucket,{id:changed.shipment.id,revision:latestChanged.updatedAt},manager);assert.deepEqual(await stocks(),[13,0]);assert.equal((await listIncomingStock(bucket)).shipments.some(item=>item.id===changed.shipment.id),false);
 await assert.rejects(()=>deleteIncomingStock(bucket,{id:a.shipment.id,revision:'old'},manager),e=>e.status===404);
 const before=await stocks();const failingBucket={get:key=>bucket.get(key),put:async(key,value,options)=>key==='incoming-stock/index.json'?null:bucket.put(key,value,options),delete:key=>bucket.delete(key)};
 await assert.rejects(()=>importIncomingStock(db,failingBucket,{...input,ticketNumber:'3'},manager,true),e=>e.status===409);assert.deepEqual(await stocks(),before);
 }finally{await mf.dispose();}
});

test('received incoming shipment moves stock from pending to its confirmed warehouse and is hidden',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['FILES']});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES'),warehouses=['MINH LONG - LOCKNLOCK CẦN THƠ','KHO VIGIFTS','Hóa đơn 1','Hóa đơn 2'];
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const product={sku:'P1',name:'Product',unit:'Cái',brand:'Lock',pattern:'',image:'',taxBasis:'Giá chưa bao gồm thuế',taxable:true,taxIn:8,taxOut:8,prices:[100],stock:[10,0,0,0],perCarton:10,cartonWeight:1,cartonLength:1,cartonWidth:1,cartonHeight:1};
  await replaceCatalog(bucket,{format:'sapo-catalog-v1',observedAt:new Date().toISOString(),warehouses,pricePolicies:['Retail'],products:[product]});
  const manager={id:'boss',role:'manager'},created=await importIncomingStock(db,bucket,{ticketNumber:'PN-RECEIVED',warehouse:warehouses[1],arrivalDate:'2026-09-12',filename:'test.xlsx',rows:[{sku:'P1',quantity:12}]},manager,true);
  let data=await catalogData(bucket,db);assert.deepEqual(data.products[0].stock,[10,0,0,0,null,12]);
  const result=await receiveIncomingStock(bucket,{id:created.shipment.id,warehouse:warehouses[1],sapoReceiptCode:'PN-SAPO-1'},manager);assert.equal(result.alreadyReceived,false);
  data=await catalogData(bucket,db);assert.deepEqual(data.products[0].stock,[10,12,0,0,null,null]);assert.equal((await listIncomingStock(bucket)).shipments.length,0);
  assert.equal((await receiveIncomingStock(bucket,{id:created.shipment.id,warehouse:warehouses[1]},manager)).alreadyReceived,true);
  await assert.rejects(()=>deleteIncomingStock(bucket,{id:created.shipment.id,revision:created.shipment.updatedAt},manager),e=>e.status===409);
 }finally{await mf.dispose();}
});

test('Minh Long packaging inheritance only fills an unambiguous same-shape family',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['FILES']});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const base={unit:'Cái',brand:'MINH LONG I',image:'',taxBasis:'Giá chưa bao gồm thuế',taxable:true,taxIn:8,taxOut:8,prices:[100],stock:[0,0,0,0],perCarton:0,cartonWeight:0,cartonLength:0,cartonWidth:0,cartonHeight:0};
  const donor={...base,sku:'JAS-GOLD',name:'Chén cơm 11.5 cm JAS Chỉ Vàng (JAS-GOLD)',pattern:'JAS Chỉ Vàng',perCarton:60,cartonWeight:12,cartonLength:40,cartonWidth:30,cartonHeight:25};
  const target={...base,sku:'JAS-BIRD',name:'Chén cơm 11.5 cm JAS Chim Lạc (JAS-BIRD)',pattern:'JAS Chim Lạc'};
  const alreadySet={...base,sku:'JAS-PLT',name:'Chén cơm 11.5 cm JAS PLT (JAS-PLT)',pattern:'JAS PLT',perCarton:72};
  const conflictA={...base,sku:'TEA-A',name:'Bộ trà 0.7 L Jasmine Trắng Ngà (TEA-A)',pattern:'Jasmine Trắng Ngà',perCarton:6,cartonWeight:10,cartonLength:40,cartonWidth:30,cartonHeight:20};
  const conflictB={...base,sku:'TEA-B',name:'Bộ trà 0.7 L Jasmine Chim Lạc (TEA-B)',pattern:'Jasmine Chim Lạc',perCarton:8,cartonWeight:12,cartonLength:42,cartonWidth:32,cartonHeight:22};
  const conflictTarget={...base,sku:'TEA-C',name:'Bộ trà 0.7 L Jasmine Chỉ Vàng (TEA-C)',pattern:'Jasmine Chỉ Vàng'};
  await replaceCatalog(bucket,{format:'sapo-catalog-v1',observedAt:new Date().toISOString(),warehouses:['MINH LONG - LOCKNLOCK CẦN THƠ','KHO VIGIFTS','Hóa đơn 1','Hóa đơn 2'],pricePolicies:['Retail'],products:[donor,target,alreadySet,conflictA,conflictB,conflictTarget]});
  const manager={id:'boss',role:'manager'},preview=await inheritMinhLongPackaging(db,bucket,manager);
  assert.equal(preview.matched,2);assert.equal(preview.conflictCount,1);
  await inheritMinhLongPackaging(db,bucket,manager,true,preview.version);
  const products=new Map((await catalogData(bucket,db)).products.map(product=>[product.sku,product]));
  assert.deepEqual([products.get('JAS-BIRD').perCarton,products.get('JAS-BIRD').cartonWeight,products.get('JAS-BIRD').cartonLength],[60,12,40]);
  assert.equal(products.get('JAS-PLT').perCarton,72);assert.equal(products.get('JAS-PLT').cartonWeight,12);
  assert.equal(products.get('TEA-C').perCarton,0);
 }finally{await mf.dispose();}
});
