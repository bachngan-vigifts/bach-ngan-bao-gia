import assert from 'node:assert/strict';
import test from 'node:test';
import {loadSapoGoodsReceiptOptions,sendSapoGoodsReceipt} from '../lib/sapo-goods-receipt.mjs';

const env={SAPO_ADMIN_COOKIE:'sid=test'};
const payload={action:'create_purchase_receipt',ticket_number:'PN0000',supplier_name:'LocknLock',warehouse_name:'KHO VIGIFTS',employee_name:'Lê Minh Thái',receipt_date:'2026-09-11',items:[{sku:'652201000',name:'Tách trà',unit:'Cái',quantity:300,import_price:0}]};
const po={id:77,code:'PN0000',status:'active',line_items:[{id:88,sku:'652201000',quantity:300}]};

test('creates confirmed goods receipt through direct Sapo admin API',async()=>{
 const calls=[];
 const result=await sendSapoGoodsReceipt(payload,async(url,options)=>{
  assert.match(url,/^https:\/\/bachngankiengiang\.mysapogo\.com\/admin\//);
  assert.doesNotMatch(url,/n8n|webhook/);
  const parsed=new URL(url),path=parsed.pathname+parsed.search;
  calls.push({path,method:options.method||'GET'});
  if(path.startsWith('/admin/purchase_orders.json?query='))return new Response(JSON.stringify({purchase_orders:[]}));
  if(path==='/admin/locations.json?limit=250')return new Response(JSON.stringify({locations:[{id:1,name:'KHO VIGIFTS'}]}));
  if(path.startsWith('/admin/suppliers.json?query='))return new Response(JSON.stringify({suppliers:[{id:2,name:'LocknLock'}]}));
  if(path==='/admin/accounts.json?limit=250')return new Response(JSON.stringify({accounts:[{id:3,full_name:'Lê Minh Thái',status:'active'}]}));
  if(path.startsWith('/admin/variants/search.json?'))return new Response(JSON.stringify({variants:[{id:4,product_id:5,sku:'652201000',barcode:'652201000',name:'Tách trà'}]}));
  if(path==='/admin/purchase_orders.json'&&options.method==='POST'){const body=JSON.parse(options.body);assert.equal(body.purchase_order.line_items[0].price,0);return new Response(JSON.stringify({purchase_order:{...po,status:'draft'}}));}
  if(path==='/admin/purchase_orders/77/active.json'&&options.method==='PUT')return new Response(JSON.stringify({ok:true}));
  if(path==='/admin/purchase_orders/77.json')return new Response(JSON.stringify({purchase_order:po}));
  if(path==='/admin/purchase_orders/77/receipts.json'&&options.method==='POST')return new Response(JSON.stringify({receipt:{id:99,code:'PN-SAPO-1'}}));
  throw new Error('Unexpected Sapo call '+path+' '+(options.method||'GET'));
 },env);
 assert.equal(result.ok,true);
 assert.equal(result.sapoReceiptCode,'PN-SAPO-1');
 assert.equal(result.sapoReceiptUrl,'https://bachngankiengiang.mysapogo.com/admin/purchase_orders/77');
 assert.equal(calls.some(call=>call.path==='/admin/purchase_orders.json'&&call.method==='POST'),true);
});

test('rejects incomplete goods receipt before Sapo call',async()=>{
 await assert.rejects(()=>sendSapoGoodsReceipt({...payload,supplier_name:''},async()=>{throw Error('must not call')},env),error=>error.status===400);
});

test('loads de-duplicated supplier and employee options directly from Sapo',async()=>{
 const result=await loadSapoGoodsReceiptOptions(async(url)=>{
  assert.match(url,/^https:\/\/bachngankiengiang\.mysapogo\.com\/admin\//);
  assert.doesNotMatch(url,/n8n|webhook/);
  const path=new URL(url).pathname+new URL(url).search;
  if(path==='/admin/suppliers.json?limit=250&page=1')return new Response(JSON.stringify({suppliers:[{id:2,name:'Nhà cung cấp B'},{id:1,name:'Nhà cung cấp A'},{id:3,name:'Nhà cung cấp A'}]}));
  if(path==='/admin/accounts.json?limit=250&page=1')return new Response(JSON.stringify({accounts:[{id:'e2',name:'Trần B',status:'active'},{id:'e1',name:'An A',status:'active'}]}));
  throw new Error('Unexpected Sapo call '+path);
 },env);
 assert.deepEqual(result.suppliers,[{id:'1',name:'Nhà cung cấp A'},{id:'2',name:'Nhà cung cấp B'}]);
 assert.deepEqual(result.employees,[{id:'e1',name:'An A'},{id:'e2',name:'Trần B'}]);
});
