import test from 'node:test';import assert from 'node:assert/strict';
import {sendSapoCopy} from '../lib/sapo-copy.mjs';

const env={SAPO_ADMIN_COOKIE:'sid=test'};
const payload={quote_number:'TEST',responsible:'Trần Thị Bé Ngọc',responsible_email:'ngoctran@quatangvigifts.com',customer:{name:'Test',sapo_id:'manual_test',customer_code:'KH001'},items:[{sku:'SKU1',name:'Ly',quantity:1,price:100000}]};
const order={id:40,code:'TEST',reference_number:'TEST',status:'draft',location_id:51460,source_id:339582,customer_id:10,total:100000,total_tax:0,order_line_items:[{sku:'SKU1',quantity:1,price:100000,line_amount:100000}]};

test('Sapo copy creates draft order through direct Sapo admin API',async()=>{
 const calls=[];
 const result=await sendSapoCopy(payload,async(url,options)=>{
  assert.match(url,/^https:\/\/bachngankiengiang\.mysapogo\.com\/admin\//);
  assert.doesNotMatch(url,/n8n|webhook/);
  const path=new URL(url).pathname+new URL(url).search;
  calls.push({path,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
  if(path.startsWith('/admin/orders.json?query='))return new Response(JSON.stringify({orders:[]}));
  if(path.startsWith('/admin/customers.json?query='))return new Response(JSON.stringify({customers:[{id:10,name:'Test',code:'KH001'}]}));
  if(path.startsWith('/admin/variants/search.json?'))return new Response(JSON.stringify({variants:[{id:20,product_id:30,sku:'SKU1',barcode:'SKU1',name:'Ly'}]}));
  if(path==='/admin/accounts.json?limit=100')return new Response(JSON.stringify({accounts:[{id:586970,full_name:'TRẦN THỊ BÉ NGỌC',email:'ngoctran@quatangvigifts.com',status:'active'}]}));
  if(path==='/admin/orders.json'&&options.method==='POST')return new Response(JSON.stringify({order}));
  if(path==='/admin/orders/40.json'&&!options.method)return new Response(JSON.stringify({order}));
  throw new Error('Unexpected Sapo call '+path);
 },env);
 assert.equal(result.accepted,true);
 assert.equal(result.status,'created');
 assert.equal(result.sapoOrderId,40);
 assert.equal(result.sapoOrderCode,'TEST');
 assert.equal(result.sapoOrderUrl,'https://bachngankiengiang.mysapogo.com/admin/orders/40');
 const post=calls.find(call=>call.path==='/admin/orders.json'&&call.method==='POST');
 assert.ok(post);
 assert.equal(post.body.order.account_id,586970);
 assert.equal(post.body.order.assignee_id,586970);
});

test('Sapo copy returns existing direct order without creating duplicate',async()=>{
 const result=await sendSapoCopy(payload,async(url,options)=>{
  const path=new URL(url).pathname+new URL(url).search;
  if(path.startsWith('/admin/orders.json?query='))return new Response(JSON.stringify({orders:[order]}));
  if(path==='/admin/orders/40.json')return new Response(JSON.stringify({order}));
  throw new Error('Unexpected Sapo call '+path+' '+(options.method||'GET'));
 },env);
 assert.equal(result.status,'existing');
 assert.equal(result.sapoOrderId,40);
});

test('Sapo direct configuration and validation failures stay explicit',async()=>{
 await assert.rejects(sendSapoCopy(payload,async()=>new Response('{}')),e=>e.status===503);
 await assert.rejects(sendSapoCopy({...payload,items:[{sku:'',quantity:1}]},async()=>{throw Error('Must not send')},env),e=>e.status===400);
 await assert.rejects(sendSapoCopy(payload,async()=>new Response('Sapo broke',{status:500}),env),e=>e.status===500);
});
