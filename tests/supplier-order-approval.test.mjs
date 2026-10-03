import assert from 'node:assert/strict';
import test from 'node:test';
import {approveSupplierOrder,confirmSupplierDeliveryNote,confirmSupplierOrder,countPendingSupplierOrders,createSupplierStockRequest,deleteIncomingStock,deleteSupplierOrderSignature,getSupplierOrder,listApprovedSupplierOrders,listIncomingStock,listSupplierOrders,listSupplierPaymentRequests,listSupplierStockRequests,markSupplierDeliveryReady,paySupplierDeposit,requestSupplierDeposit,respondSupplierStockRequest,updateSupplierInternalOrderNumber,uploadSupplierOrderSignature} from '../lib/product-catalog.mjs';
import {notifySupplierOrder} from '../lib/supplier-order-notify.mjs';

const id='11111111-1111-4111-8111-111111111111';
const createBucket=()=>{
 let index={shipments:[
  {id,key:'incoming-stock/order-a.json',source:'supplier-order',approvalStatus:'pending',createdBy:'staff-a',supplierInternalOrderNumber:'NCC-PO-123',arrivalDate:'2026-09-20',stockRows:[{sku:'ML-1',quantity:10},{sku:'LOCK-2',quantity:5}]},
  {id:'22222222-2222-4222-8222-222222222222',key:'incoming-stock/order-b.json',source:'supplier-order',approvalStatus:'pending',createdBy:'staff-b',stockRows:[{sku:'OTHER',quantity:1}]},
  {id:'33333333-3333-4333-8333-333333333333',source:'incoming-stock',approvalStatus:'approved',createdBy:'boss'}
 ]};
 const saved={'incoming-stock/order-a.json':{id,key:'incoming-stock/order-a.json',source:'supplier-order',approvalStatus:'pending',createdBy:'staff-a',supplierInternalOrderNumber:'NCC-PO-123',rows:[{sku:'ML-1',name:'Minh Long',unit:'Cái',quantity:10,price:100000,manualPrice:true,taxRate:10,perCarton:8,cartonWeight:4,cartonLength:40,cartonWidth:30,cartonHeight:20,cartons:1.25,weightKg:5,volumeM3:.03},{sku:'LOCK-2',name:'Lock',quantity:5,price:200000,taxRate:0},{type:'print-logo',sku:'IN-LOGO',name:'In ấn logo theo thiết kế được duyệt',quantity:1,price:0,taxRate:0,description:'NCC in logo theo file thiết kế.',sourceSkus:['ML-1'],designImage:'https://example.com/logo.jpg'}]},'incoming-stock/order-b.json':{id:'22222222-2222-4222-8222-222222222222',key:'incoming-stock/order-b.json',source:'supplier-order',approvalStatus:'pending',createdBy:'staff-b',rows:[{sku:'OTHER',name:'Bộ trà khác',unit:'Bộ',quantity:1,price:300000,taxRate:8}]}};
 return {bucket:{get:async key=>key==='incoming-stock/index.json'?{etag:'revision-1',json:async()=>structuredClone(index)}:saved[key]?{json:async()=>structuredClone(saved[key])}:null,put:async(key,value)=>{if(key==='incoming-stock/index.json')index=JSON.parse(value);else if(typeof value==='string')saved[key]=JSON.parse(value);else saved[key]=value;return {};},delete:async key=>{delete saved[key];return {}; }},read:()=>index,readSaved:()=>saved};
};
const signatureFile={fileName:'ky-xac-nhan.jpg',mimeType:'image/jpeg',dataBase64:Buffer.from('signed').toString('base64')};

test('pending badge count is personal for staff and global for managers',async()=>{
 const {bucket}=createBucket();
 assert.equal(await countPendingSupplierOrders(bucket,{id:'staff-a',role:'staff'}),1);
 assert.equal(await countPendingSupplierOrders(bucket,{id:'staff-b',role:'staff'}),1);
 assert.equal(await countPendingSupplierOrders(bucket,{id:'boss',role:'manager'}),2);
 assert.equal((await listSupplierOrders(bucket,{id:'staff-a',role:'staff'})).orders.length,1);
 assert.equal((await listSupplierOrders(bucket,{id:'boss',role:'manager'})).orders.length,2);
 assert.equal((await listIncomingStock(bucket)).shipments.length,1);
 const order=await getSupplierOrder(bucket,id,{id:'staff-a',role:'staff'});
 assert.equal(order.rows.length,2);
 assert.ok(order.rows.every(row=>row.sku!=='IN-LOGO'));
 assert.equal(order.rows[0].printDescription,'In ấn logo theo thiết kế được duyệt');
 assert.equal(order.rows[0].manualPrice,true);
 assert.equal(order.supplierInternalOrderNumber,'NCC-PO-123');
 await assert.rejects(()=>getSupplierOrder(bucket,id,{id:'staff-b',role:'staff'}),error=>error.status===404);
});

test('manager approves only after entering a discount for every SKU',async()=>{
 const {bucket,read}=createBucket(),manager={id:'boss',role:'manager'};
 await assert.rejects(()=>approveSupplierOrder(bucket,{id,supplierEmail:'ncc@example.com',itemDiscounts:[{sku:'ML-1',purchaseDiscount:10}]},manager),error=>error.status===400);
 const result=await approveSupplierOrder(bucket,{id,supplierEmail:'ncc@example.com',ccEmail:'',itemDiscounts:[{sku:'ML-1',purchaseDiscount:10},{sku:'LOCK-2',purchaseDiscount:17.5}]},manager);
 assert.equal(result.order.approvalStatus,'approved');
 assert.equal(result.order.rows[0].manualPrice,true);
 assert.deepEqual(result.order.itemDiscounts,[{sku:'ML-1',purchaseDiscount:10},{sku:'LOCK-2',purchaseDiscount:17.5}]);
 assert.equal(read().shipments[0].approvedBy,'boss');
 assert.equal(await countPendingSupplierOrders(bucket,manager),1);
 assert.equal((await listSupplierOrders(bucket,manager)).orders.length,1);
 assert.equal((await listIncomingStock(bucket)).shipments.length,1);
 await uploadSupplierOrderSignature(bucket,{id,...signatureFile},{id:'ncc',role:'supplier',email:'ncc@example.com'});
 await confirmSupplierOrder(bucket,{id,rows:[{sku:'ML-1',quantity:10,purchaseDiscount:10,promisedDate:'2026-09-20',confirmed:true},{sku:'LOCK-2',quantity:5,purchaseDiscount:17.5,promisedDate:'2026-09-21',confirmed:true}]},{id:'ncc',role:'supplier',email:'ncc@example.com'});
 assert.equal((await listIncomingStock(bucket)).shipments.length,2);
});

test('deleting an approved supplier order removes it from the supplier portal',async()=>{
 const {bucket}=createBucket(),manager={id:'boss',role:'manager'},supplier={id:'ncc',role:'supplier',email:'ncc@example.com'};
 const result=await approveSupplierOrder(bucket,{id,supplierEmail:'ncc@example.com',ccEmail:'',itemDiscounts:[{sku:'ML-1',purchaseDiscount:10},{sku:'LOCK-2',purchaseDiscount:17.5}]},manager);
 assert.equal((await listApprovedSupplierOrders(bucket,supplier)).orders.length,1);
 const deleted=await deleteIncomingStock(bucket,{id,revision:result.order.updatedAt||result.order.createdAt},manager);
 assert.equal(deleted.shipment.source,'supplier-order');
 assert.equal(deleted.shipment.supplierPortalRemoved,true);
 assert.equal(deleted.shipment.rows.length,3);
 assert.equal((await listApprovedSupplierOrders(bucket,supplier)).orders.length,0);
});

for(const email of ['bachngankg@gmail.com','sales.bachngankg@gmail.com'])test(`${email} supplier account can view Minh Long supplier orders`,async()=>{
 const {bucket}=createBucket(),manager={id:'boss',role:'manager'},supplier={id:'minh-long-demo',role:'supplier',email};
 await approveSupplierOrder(bucket,{id,supplierEmail:'sales01.cantho@minhlong.com',ccEmail:'linh.vo@minhlong.com',itemDiscounts:[{sku:'ML-1',purchaseDiscount:10},{sku:'LOCK-2',purchaseDiscount:17.5}]},manager);
 const index=await bucket.get('incoming-stock/index.json').then(object=>object.json());
 index.shipments[0].supplierName='CÔNG TY TNHH MINH LONG I';
 await bucket.put('incoming-stock/index.json',JSON.stringify(index));
 const portal=await listApprovedSupplierOrders(bucket,supplier);
 assert.equal(portal.orders.length,1);
 assert.equal(portal.orders[0].supplierEmail,'sales01.cantho@minhlong.com');
 assert.equal(portal.orders[0].rows[0].perCarton,8);
 assert.equal(portal.orders[0].rows[0].cartons,1.25);
 assert.equal(portal.orders[0].rows[0].weightKg,5);
 await requestSupplierDeposit(bucket,{id,rows:[{sku:'ML-1',quantity:10,confirmed:true},{sku:'LOCK-2',quantity:5,confirmed:true}]},supplier);
});

test('Minh Long group does not grant access to other suppliers or unapproved orders',async()=>{
 const {bucket}=createBucket(),manager={id:'boss',role:'manager'},supplier={id:'minh-long-demo',role:'supplier',email:'sales.bachngankg@gmail.com'};
 let index=await bucket.get('incoming-stock/index.json').then(object=>object.json());
 index.shipments[0].supplierName='CÔNG TY TNHH MINH LONG I';
 await bucket.put('incoming-stock/index.json',JSON.stringify(index));
 assert.equal((await listApprovedSupplierOrders(bucket,supplier)).orders.length,0);
 await approveSupplierOrder(bucket,{id,supplierEmail:'lock@example.com',itemDiscounts:[{sku:'ML-1',purchaseDiscount:10},{sku:'LOCK-2',purchaseDiscount:17.5}]},manager);
 index=await bucket.get('incoming-stock/index.json').then(object=>object.json());
 index.shipments[0].supplierName='LocknLock HCM';
 await bucket.put('incoming-stock/index.json',JSON.stringify(index));
 assert.equal((await listApprovedSupplierOrders(bucket,supplier)).orders.length,0);
 await assert.rejects(()=>getSupplierOrder(bucket,id,supplier),error=>error.status===404);
 await assert.rejects(()=>requestSupplierDeposit(bucket,{id,rows:[{sku:'ML-1',quantity:10,confirmed:true},{sku:'LOCK-2',quantity:5,confirmed:true}]},supplier),error=>error.status===404);
});

test('supplier orders allow a zero percent deposit rate',async()=>{
 const {bucket}=createBucket(),manager={id:'boss',role:'manager'},supplier={id:'ncc',role:'supplier',email:'ncc@example.com'};
 await approveSupplierOrder(bucket,{id,supplierEmail:'ncc@example.com',itemDiscounts:[{sku:'ML-1',purchaseDiscount:10},{sku:'LOCK-2',purchaseDiscount:17.5}]},manager);
 const deposit=await requestSupplierDeposit(bucket,{id,depositRate:0,rows:[{sku:'ML-1',quantity:10,confirmed:true},{sku:'LOCK-2',quantity:5,confirmed:true}]},supplier);
 assert.equal(deposit.order.depositRate,0);
 assert.equal(deposit.order.depositAmount,0);
 assert.equal((await listSupplierPaymentRequests(bucket,manager)).count,0);
});

test('supplier confirms each approved line before the order is marked approved for supplier',async()=>{
 const {bucket}=createBucket(),manager={id:'boss',role:'manager'},supplier={id:'ncc',role:'supplier',email:'ncc@example.com'};
 await approveSupplierOrder(bucket,{id,supplierEmail:'ncc@example.com',itemDiscounts:[{sku:'ML-1',purchaseDiscount:10},{sku:'LOCK-2',purchaseDiscount:17.5}]},manager);
 let portal=await listApprovedSupplierOrders(bucket,supplier);
 assert.equal(portal.orders[0].supplierStatus,'pending');
 assert.equal(portal.orders[0].depositRate,30);
 await assert.rejects(()=>requestSupplierDeposit(bucket,{id,rows:[{sku:'ML-1',quantity:10,confirmed:true}]},supplier),error=>error.status===400);
 const deposit=await requestSupplierDeposit(bucket,{id,supplierInternalOrderNumber:'PO-NCC-456',depositRate:42.5,rows:[{sku:'ML-1',quantity:10,confirmed:true},{sku:'LOCK-2',quantity:5,confirmed:true}]},supplier);
 assert.ok(deposit.order.depositRequestedAt);
 assert.equal(deposit.order.supplierInternalOrderNumber,'PO-NCC-456');
 assert.equal(deposit.order.depositRate,42.5);
 const requests=await listSupplierPaymentRequests(bucket,manager);
 assert.equal(requests.count,1);
 assert.equal(requests.requests[0].depositAmount,771375);
 assert.equal(requests.totalDeposit,771375);
 await assert.rejects(()=>requestSupplierDeposit(bucket,{id,depositRate:101,rows:[{sku:'ML-1',quantity:10,confirmed:true},{sku:'LOCK-2',quantity:5,confirmed:true}]},supplier),error=>error.status===400&&/Tỷ lệ cọc/.test(error.message));
 const paid=await paySupplierDeposit(bucket,{id},manager);
 assert.ok(paid.order.depositPaidAt);
 assert.equal(paid.order.depositPaidAmount,771375);
 assert.equal(paid.order.remainingAmount,1043625);
 assert.equal((await listSupplierPaymentRequests(bucket,manager)).count,0);
 await assert.rejects(()=>requestSupplierDeposit(bucket,{id,depositRate:30,rows:[{sku:'ML-1',quantity:10,confirmed:true},{sku:'LOCK-2',quantity:5,confirmed:true}]},supplier),error=>error.status===409&&/nhận tiền cọc/.test(error.message));
 await assert.rejects(()=>confirmSupplierOrder(bucket,{id,rows:[{sku:'ML-1',quantity:10,purchaseDiscount:10,promisedDate:'2026-09-20',confirmed:true},{sku:'LOCK-2',quantity:5,purchaseDiscount:17.5,promisedDate:'2026-09-22',confirmed:true}]},supplier),error=>error.status===400&&/upload/i.test(error.message));
 const signed=await uploadSupplierOrderSignature(bucket,{id,...signatureFile},supplier);
 assert.ok(signed.order.supplierSignatureUploadedAt);
 assert.equal(signed.order.supplierSignatureFile.name,'ky-xac-nhan.jpg');
 const removed=await deleteSupplierOrderSignature(bucket,{id},supplier);
 assert.ok(!removed.order.supplierSignatureUploadedAt);
 assert.ok(!removed.order.supplierSignatureFile);
 await assert.rejects(()=>confirmSupplierOrder(bucket,{id,rows:[{sku:'ML-1',quantity:10,purchaseDiscount:10,promisedDate:'2026-09-20',confirmed:true},{sku:'LOCK-2',quantity:5,purchaseDiscount:17.5,promisedDate:'2026-09-22',confirmed:true}]},supplier),error=>error.status===400&&/upload/i.test(error.message));
 await uploadSupplierOrderSignature(bucket,{id,fileName:'ky-moi.pdf',mimeType:'application/pdf',dataBase64:Buffer.from('signed-again').toString('base64')},supplier);
 await assert.rejects(()=>confirmSupplierOrder(bucket,{id,rows:[{sku:'ML-1',quantity:10,purchaseDiscount:10,promisedDate:'2026-09-20',confirmed:true}]},supplier),error=>error.status===400);
 const confirmed=await confirmSupplierOrder(bucket,{id,supplierInternalOrderNumber:'PO-NCC-789',rows:[{sku:'ML-1',quantity:10,purchaseDiscount:12,promisedDate:'2026-09-20',supplierNote:'Giao trước 10h',confirmed:true},{sku:'LOCK-2',quantity:5,purchaseDiscount:17.5,promisedDate:'2026-09-22',confirmed:true}]},supplier);
 assert.equal(confirmed.order.supplierStatus,'confirmed');
 assert.equal(confirmed.order.supplierInternalOrderNumber,'PO-NCC-789');
 assert.equal(confirmed.order.rows[0].supplierNote,'Giao trước 10h');
 assert.equal(confirmed.order.rows[0].purchaseDiscount,12);
 assert.equal(confirmed.order.supplierDateChanges.length,1);
 assert.equal(confirmed.order.supplierDiscountChanges.length,1);
 portal=await listApprovedSupplierOrders(bucket,supplier);
 assert.equal(portal.orders[0].supplierInternalOrderNumber,'PO-NCC-789');
 assert.equal(portal.orders[0].rows[1].promisedDate,'2026-09-22');
});

test('supplier marks confirmed orders ready for full or partial delivery',async()=>{
 const {bucket}=createBucket(),manager={id:'boss',role:'manager'},supplier={id:'ncc',role:'supplier',email:'ncc@example.com'};
 await approveSupplierOrder(bucket,{id,supplierEmail:'ncc@example.com',itemDiscounts:[{sku:'ML-1',purchaseDiscount:10},{sku:'LOCK-2',purchaseDiscount:17.5}]},manager);
 await assert.rejects(()=>markSupplierDeliveryReady(bucket,{id,mode:'full',deliveryDate:'2026-09-18'},supplier),error=>error.status===409&&/đã duyệt/.test(error.message));
 await uploadSupplierOrderSignature(bucket,{id,...signatureFile},supplier);
 await confirmSupplierOrder(bucket,{id,rows:[{sku:'ML-1',quantity:10,purchaseDiscount:10,promisedDate:'2026-09-20',confirmed:true},{sku:'LOCK-2',quantity:5,purchaseDiscount:17.5,promisedDate:'2026-09-22',confirmed:true}]},supplier);
 await assert.rejects(()=>markSupplierDeliveryReady(bucket,{id,mode:'partial',deliveryDate:'2026-09-18',rows:[{sku:'ML-1',quantity:11}]},supplier),error=>error.status===400&&/Số lượng/.test(error.message));
 const partial=await markSupplierDeliveryReady(bucket,{id,mode:'partial',deliveryDate:'2026-09-18',rows:[{sku:'ML-1',quantity:4}]},supplier);
 assert.equal(partial.order.supplierDeliveryReadyMode,'partial');
 assert.equal(partial.order.supplierDeliveryReadyDate,'2026-09-18');
 assert.deepEqual(partial.order.supplierDeliveryReadyRows,[{sku:'ML-1',name:'',quantity:4}]);
 const full=await markSupplierDeliveryReady(bucket,{id,mode:'full',deliveryDate:'2026-09-19'},supplier);
 assert.equal(full.order.supplierDeliveryReadyMode,'full');
 assert.equal(full.order.supplierDeliveryReadyRows.length,2);
});

test('delivery confirmation creates an incoming shipment and keeps delivered quantities',async()=>{
 const {bucket,read,readSaved}=createBucket(),manager={id:'boss',role:'manager'},supplier={id:'ncc',role:'supplier',email:'ncc@example.com'};
 await approveSupplierOrder(bucket,{id,supplierEmail:'ncc@example.com',itemDiscounts:[{sku:'ML-1',purchaseDiscount:10},{sku:'LOCK-2',purchaseDiscount:17.5}]},manager);
 await uploadSupplierOrderSignature(bucket,{id,...signatureFile},supplier);
 await confirmSupplierOrder(bucket,{id,rows:[{sku:'ML-1',quantity:10,purchaseDiscount:10,promisedDate:'2026-09-20',confirmed:true},{sku:'LOCK-2',quantity:5,purchaseDiscount:17.5,promisedDate:'2026-09-22',confirmed:true}]},supplier);
 const result=await confirmSupplierDeliveryNote(bucket,{deliveryNoteId:'delivery-note-test-1',fileName:'phieu-giao-test.pdf',ticketNumber:'PGH-TEST-1',dateKey:'2026-09-18',deliveryTime:'09:30',deliveryWarehouse:'Nhà máy',vehicleNumber:'65C-12345',rows:[{orderId:id,sku:'ML-1',quantity:4}]},manager);
 assert.equal(result.incomingShipment.ticketNumber,'PGH-TEST-1');
 assert.equal(result.orders[0].supplierDeliveredRows[0].quantity,4);
 const shipment=read().shipments.find(item=>item.id===result.incomingShipment.id);
 assert.equal(shipment.source,'supplier-delivery-note');
 assert.deepEqual(shipment.stockRows,[{sku:'ML-1',quantity:4}]);
 assert.equal((await listIncomingStock(bucket)).shipments.some(item=>item.id===shipment.id),true);
 const detail=readSaved()[shipment.key];
 assert.equal(detail.rows[0].quantity,4);
 assert.equal(detail.rows[0].sourceOrders[0].orderId,id);
 const duplicate=await confirmSupplierDeliveryNote(bucket,{deliveryNoteId:'delivery-note-test-1',fileName:'phieu-giao-test.pdf',ticketNumber:'PGH-TEST-1',dateKey:'2026-09-18',rows:[{orderId:id,sku:'LOCK-2',quantity:1}]},manager);
 assert.equal(duplicate.incomingShipment.alreadyCreated,true);
 assert.equal(read().shipments.filter(item=>item.source==='supplier-delivery-note').length,1);
 assert.equal(duplicate.orders[0].supplierDeliveredRows.some(row=>row.sku==='LOCK-2'),false);
});

test('company staff requests stock from selected lines across supplier-confirmed orders',async()=>{
 const {bucket}=createBucket(),manager={id:'boss',name:'Boss',role:'manager'},employee={id:'sales-a',name:'Sales',role:'employee'},supplier={id:'ncc',role:'supplier',email:'ncc@example.com'};
 await approveSupplierOrder(bucket,{id,supplierEmail:'ncc@example.com',itemDiscounts:[{sku:'ML-1',purchaseDiscount:10},{sku:'LOCK-2',purchaseDiscount:17.5}]},manager);
 await approveSupplierOrder(bucket,{id:'22222222-2222-4222-8222-222222222222',supplierEmail:'ncc@example.com',itemDiscounts:[{sku:'OTHER',purchaseDiscount:5}]},manager);
 await uploadSupplierOrderSignature(bucket,{id,...signatureFile},supplier);
 await uploadSupplierOrderSignature(bucket,{id:'22222222-2222-4222-8222-222222222222',...signatureFile},supplier);
 await confirmSupplierOrder(bucket,{id,rows:[{sku:'ML-1',quantity:10,purchaseDiscount:10,promisedDate:'2026-09-20',confirmed:true},{sku:'LOCK-2',quantity:5,purchaseDiscount:17.5,promisedDate:'2026-09-22',confirmed:true}]},supplier);
 await confirmSupplierOrder(bucket,{id:'22222222-2222-4222-8222-222222222222',rows:[{sku:'OTHER',quantity:1,purchaseDiscount:5,promisedDate:'2026-09-21',confirmed:true}]},supplier);
 const created=await createSupplierStockRequest(bucket,{rows:[{orderId:id,sku:'ML-1',quantity:3},{orderId:'22222222-2222-4222-8222-222222222222',sku:'OTHER',quantity:1}]},employee);
 assert.equal(created.request.status,'pending');
 assert.equal(created.request.lines.length,2);
 assert.equal(created.request.supplierEmail,'ncc@example.com');
 let requests=await listSupplierStockRequests(bucket,supplier);
 assert.equal(requests.count,1);
 assert.equal(requests.requests[0].lines[0].ticketNumber,'');
 const responded=await respondSupplierStockRequest(bucket,{id:created.request.id,decision:'accepted'},supplier);
 assert.equal(responded.request.status,'accepted');
 requests=await listSupplierStockRequests(bucket,supplier);
 assert.equal(requests.count,0);
});

test('supplier portal can autosave the supplier internal order number before deposit request',async()=>{
 const {bucket}=createBucket(),manager={id:'boss',role:'manager'},supplier={id:'ncc',role:'supplier',email:'ncc@example.com'};
 await approveSupplierOrder(bucket,{id,supplierEmail:'ncc@example.com',itemDiscounts:[{sku:'ML-1',purchaseDiscount:10},{sku:'LOCK-2',purchaseDiscount:17.5}]},manager);
 const saved=await updateSupplierInternalOrderNumber(bucket,{id,supplierInternalOrderNumber:'NCC-AUTO-001'},supplier);
 assert.equal(saved.order.supplierInternalOrderNumber,'NCC-AUTO-001');
 const portal=await listApprovedSupplierOrders(bucket,supplier);
 assert.equal(portal.orders[0].supplierInternalOrderNumber,'NCC-AUTO-001');
 await assert.rejects(()=>updateSupplierInternalOrderNumber(bucket,{id,supplierInternalOrderNumber:'x'.repeat(101)},supplier),error=>error.status===400);
});

test('Minh Long supplier notifications route Duy to To and Linh plus existing NCC to Cc',async()=>{
 let payload;
 const env={
  SUPPLIER_ORDER_NOTIFY_WEBHOOK_URL:'https://n8nthai.moarchvn.com/webhook/test-supplier',
  SUPPLIER_ORDER_OWNER_EMAIL:'info@quatangvigifts.com',
  SUPPLIER_ORDER_EMAIL_FROM:'claw@quatangvigifts.com',
  SUPPLIER_ORDER_ZALO_TARGET:'group:test'
 };
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,env.SUPPLIER_ORDER_NOTIFY_WEBHOOK_URL);
  payload=JSON.parse(options.body);
  return new Response('{}',{status:200});
 };
 try{
  await notifySupplierOrder(env,'supplier_order_sent',{order:{id,ticketNumber:'DHNCC-1',supplierName:'CÔNG TY TNHH MINH LONG I',supplierEmail:'hung@example.com',ccEmail:'old@example.com',rows:[]}}, {id:'boss',name:'Boss',email:'boss@example.com',role:'manager'});
 }finally{
  globalThis.fetch=originalFetch;
 }
 assert.deepEqual(payload.mail.toEmails,['info@quatangvigifts.com','sales01.cantho@minhlong.com']);
 assert.deepEqual(payload.mail.ccEmails,['old@example.com','hung@example.com','linh.vo@minhlong.com']);
});


test('deleted NCC orders disappear from stock requests and cannot be answered',async()=>{
 const {bucket}=createBucket(),manager={id:'boss',role:'manager'};
 const index=await bucket.get('incoming-stock/index.json').then(object=>object.json());
 const requestId='44444444-4444-4444-8444-444444444444',secondId=index.shipments[1].id;
 index.supplierStockRequests=[
  {id:requestId,status:'pending',lines:[{orderId:id,sku:'ML-1',quantity:10}]},
  {id:'55555555-5555-4555-8555-555555555555',status:'accepted',lines:[{orderId:id,sku:'ML-1',quantity:10},{orderId:secondId,sku:'OTHER',quantity:1}]}
 ];
 await bucket.put('incoming-stock/index.json',JSON.stringify(index));
 assert.equal((await listSupplierStockRequests(bucket,manager)).count,1);
 await deleteIncomingStock(bucket,{id},manager);
 const result=await listSupplierStockRequests(bucket,manager);
 assert.equal(result.count,0);
 assert.equal(result.requests.length,1);
 assert.deepEqual(result.requests[0].lines,[{orderId:secondId,sku:'OTHER',quantity:1}]);
 await assert.rejects(()=>respondSupplierStockRequest(bucket,{id:requestId,decision:'accepted'},manager),error=>error.status===409);
 // Legacy history is retained while orphan requests are excluded from the live portal.
 const saved=await bucket.get('incoming-stock/index.json').then(object=>object.json());
 assert.equal(saved.supplierStockRequests.length,2);
});
