import test from 'node:test';import assert from 'node:assert/strict';import {Miniflare} from 'miniflare';import{readFileSync,readdirSync}from'node:fs';
import{replaceCatalog,catalogData,importStock,saveProduct,readCatalog,applySapoInventoryWebhook,importIncomingStock,receiveIncomingStock,auditCatalog}from'../lib/product-catalog.mjs';
import{makeBackup,exportBackup}from'../lib/quotation-backup.mjs';
import '../public/stock-file.js';
test('stock parser keeps zero and negative stock, skips blanks and keeps the largest stock for duplicate SKUs',()=>{
 assert.deepEqual(StockFile.parse([['SKU','Kho'],['A',49.7],['B',49.5],['C',124.6],['D',-2.5]],0,0,{Kho:1}).rows.map(r=>r.stock.Kho),[50,50,125,-3]);
 const rows=[['SKU','Kho'],['0001',0],['P2',null],['P3',-3]];assert.deepEqual(StockFile.parse(rows,0,0,{Kho:1}).rows,[{sku:'0001',stock:{Kho:0}},{sku:'P3',stock:{Kho:-3}}]);
 const duplicates=StockFile.parse([...rows,['0001',1],['0001',8]],0,0,{Kho:1});assert.deepEqual(duplicates.rows.find(row=>row.sku==='0001'),{sku:'0001',stock:{Kho:8}});assert.equal(duplicates.duplicates,2);assert.throws(()=>StockFile.parse([rows[0],['P','abc']],0,0,{Kho:1}));
});
test('stock preview and atomic import preserve metadata, partial stocks, permissions and backup',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['FILES']});
 try{const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const warehouses=['MINH LONG - LOCKNLOCK CẦN THƠ','KHO VIGIFTS','Hóa đơn 1','Hóa đơn 2'];const product={sku:'P1',name:'Keep name',unit:'Cái',brand:'Lock',pattern:'',image:'',taxBasis:'Excluded',taxable:true,taxIn:8,taxOut:8,prices:[100],stock:[10,20,30,40]};
 await replaceCatalog(bucket,{format:'sapo-catalog-v1',observedAt:'2026-01-01T00:00:00Z',warehouses,pricePolicies:['Retail'],products:[product]});
 const manager={id:'m',role:'manager'},employee={id:'e',role:'employee'},body={filename:'daily.xlsx',observedAt:new Date().toISOString(),rows:[{sku:'P1',stock:{[warehouses[0]]:0,[warehouses[2]]:-1}},{sku:'unknown',stock:{[warehouses[0]]:3}}]};
 await assert.rejects(()=>importStock(db,bucket,body,employee),e=>e.status===403);
 const preview=await importStock(db,bucket,body,manager);assert.equal(preview.matched,1);assert.equal(preview.unknownCount,1);assert.equal((await catalogData(bucket,db)).products[0].stock[0],10);
 await importStock(db,bucket,{...body,version:preview.version},manager,true);
 await assert.rejects(()=>importStock(db,bucket,{...body,version:preview.version},manager,true),e=>e.status===409);
 const data=await catalogData(bucket,db);assert.deepEqual(data.products[0].stock,[0,20,-1,40,null,null]);assert.equal(data.products[0].name,'Keep name');assert.deepEqual(data.products[0].prices,[100]);
 assert.deepEqual((await(await readCatalog(bucket,'employee',db)).json()).products[0].stock,[0,20,null,null]);
 await assert.rejects(()=>saveProduct(db,bucket,{product:{...product,prices:{Retail:100},stock:Object.fromEntries(warehouses.map((w,i)=>[w,i]))},revision:0},manager,false),e=>e.status===409);
 const snap=await makeBackup(db,bucket),backup=await(await exportBackup(bucket,snap.key)).json();assert.equal(backup.stockImport.count,1);assert.equal(backup.inventory.rows[0].stock[warehouses[0]],0);
 const nccBody={filename:'ncc.xlsx',observedAt:body.observedAt,rows:[{sku:'P1',stock:{NCC:124.6}}]};
 const nccPreview=await importStock(db,bucket,nccBody,manager);await importStock(db,bucket,{...nccBody,version:nccPreview.version},manager,true);
 assert.deepEqual((await catalogData(bucket,db)).products[0].stock,[0,20,-1,40,125,null]);
 await replaceCatalog(bucket,{format:'sapo-catalog-v1',observedAt:'2026-01-01T00:00:00Z',warehouses,pricePolicies:['Retail'],products:[product]});
 assert.equal((await catalogData(bucket,db)).products[0].stock[4],125);
 const incoming={...nccBody,rows:[{sku:'P1',stock:{'Hàng chờ về':35}}]};const incomingPreview=await importStock(db,bucket,incoming,manager);await importStock(db,bucket,{...incoming,version:incomingPreview.version},manager,true);assert.equal((await catalogData(bucket,db)).products[0].stock[5],35);
 const duplicateRows={filename:'duplicate.xlsx',observedAt:body.observedAt,rows:[{sku:'P1',stock:{[warehouses[0]]:5}},{sku:'P1',stock:{[warehouses[0]]:12}}]};
 const duplicatePreview=await importStock(db,bucket,duplicateRows,manager);assert.equal(duplicatePreview.matched,1);assert.equal(duplicatePreview.duplicates,1);await importStock(db,bucket,{...duplicateRows,version:duplicatePreview.version},manager,true);assert.equal((await catalogData(bucket,db)).products[0].stock[0],12);
 assert.deepEqual((await(await readCatalog(bucket,'employee',db)).json()).products[0].stock,[12,20,125,35]);
 }finally{await mf.dispose();}
});

test('direct Sapo inventory webhook updates quote web stock without n8n',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['FILES']});
 try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const warehouses=['MINH LONG - LOCKNLOCK CẦN THƠ','KHO VIGIFTS','Hóa đơn 1','Hóa đơn 2'];
 const product={sku:'P1',name:'Product',unit:'Cái',brand:'Minh Long',pattern:'',image:'',taxBasis:'Giá chưa bao gồm thuế',taxable:true,taxIn:8,taxOut:8,prices:[100],stock:[10,20,30,40]};
 await replaceCatalog(bucket,{format:'sapo-catalog-v1',observedAt:'2026-01-01T00:00:00Z',warehouses,pricePolicies:['Retail'],products:[product]});
 const result=await applySapoInventoryWebhook(db,bucket,{inventory_level:{sku:'P1',location_id:51380,available:77},updated_at:'2026-09-12T00:00:00Z'});
 assert.equal(result.matched,1);assert.equal(result.updated,1);assert.deepEqual(result.warehouses,['MINH LONG - LOCKNLOCK CẦN THƠ']);
 assert.equal((await catalogData(bucket,db)).products[0].stock[0],77);
 const byName=await applySapoInventoryWebhook(db,bucket,{sku:'P1',location_name:'KHO VIGIFTS',on_hand:18});
 assert.equal(byName.updated,1);assert.equal((await catalogData(bucket,db)).products[0].stock[1],18);
	 }finally{await mf.dispose();}
	});

test('direct inventory webhook reconciles received incoming stock per SKU',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['FILES']});
 try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const warehouses=['MINH LONG - LOCKNLOCK CẦN THƠ','KHO VIGIFTS','Hóa đơn 1','Hóa đơn 2'];
 const products=[
  {sku:'P1',name:'Product 1',unit:'Cái',brand:'Minh Long',pattern:'',image:'',taxBasis:'Giá chưa bao gồm thuế',taxable:true,taxIn:8,taxOut:8,prices:[100],stock:[10,20,30,40]},
  {sku:'P2',name:'Product 2',unit:'Cái',brand:'Minh Long',pattern:'',image:'',taxBasis:'Giá chưa bao gồm thuế',taxable:true,taxIn:8,taxOut:8,prices:[100],stock:[3,4,5,6]},
 ];
 await replaceCatalog(bucket,{format:'sapo-catalog-v1',observedAt:'2026-01-01T00:00:00Z',warehouses,pricePolicies:['Retail'],products});
 const manager={id:'m',role:'manager'};
 const incoming=await importIncomingStock(db,bucket,{filename:'incoming.xlsx',ticketNumber:'PN-1',warehouse:warehouses[0],arrivalDate:'2026-09-13',supplierName:'NCC',rows:[{sku:'P1',quantity:5},{sku:'P2',quantity:7}]},manager,true);
 assert.equal((await catalogData(bucket,db)).products.find(product=>product.sku==='P1').stock[0],10);
 await receiveIncomingStock(bucket,{id:incoming.shipment.id,warehouse:warehouses[0]},manager);
 let data=await catalogData(bucket,db);
 assert.equal(data.products.find(product=>product.sku==='P1').stock[0],15);
 assert.equal(data.products.find(product=>product.sku==='P2').stock[0],10);
 await applySapoInventoryWebhook(db,bucket,{inventory_level:{sku:'P1',location_id:51380,available:15},updated_at:new Date(Date.now()+1000).toISOString()});
 data=await catalogData(bucket,db);
 assert.equal(data.products.find(product=>product.sku==='P1').stock[0],15);
 assert.equal(data.products.find(product=>product.sku==='P2').stock[0],10);
 await applySapoInventoryWebhook(db,bucket,{inventory_level:{sku:'P2',location_id:51380,available:10},updated_at:new Date(Date.now()+2000).toISOString()});
 data=await catalogData(bucket,db);
 assert.equal(data.products.find(product=>product.sku==='P1').stock[0],15);
 assert.equal(data.products.find(product=>product.sku==='P2').stock[0],10);
 }finally{await mf.dispose();}
});

test('catalog audit reports data health and SKU history',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['FILES']});
 try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const warehouses=['MINH LONG - LOCKNLOCK CẦN THƠ','KHO VIGIFTS','Hóa đơn 1','Hóa đơn 2'],product={sku:'AUDIT-1',name:'Audit item',unit:'Cái',brand:'Minh Long',pattern:'',image:'',taxBasis:'',taxable:true,taxIn:8,taxOut:8,prices:[0],stock:[1,0,0,0]};
 await replaceCatalog(bucket,{format:'sapo-catalog-v1',observedAt:'2026-01-01T00:00:00Z',warehouses,pricePolicies:['Retail'],products:[product]});
 const manager={id:'m',role:'manager'},preview=await importStock(db,bucket,{filename:'audit.xlsx',observedAt:'2026-09-13T00:00:00Z',rows:[{sku:'AUDIT-1',stock:{[warehouses[0]]:5}}]},manager);
 await importStock(db,bucket,{filename:'audit.xlsx',observedAt:'2026-09-13T00:00:00Z',rows:[{sku:'AUDIT-1',stock:{[warehouses[0]]:5}}],version:preview.version},manager,true);
 const audit=await auditCatalog(db,bucket,{sku:'AUDIT-1'});
 assert.equal(audit.summary.products,1);
 assert.equal(audit.summary.missingPackagingCount,1);
 assert.equal(audit.summary.missingPriceCount,1);
 assert.equal(audit.sku.product.sku,'AUDIT-1');
 assert.equal(audit.sku.stockHistory[0].stock[warehouses[0]],5);
 }finally{await mf.dispose();}
});
