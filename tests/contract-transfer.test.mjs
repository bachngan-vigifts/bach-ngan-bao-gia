import test from 'node:test';import assert from 'node:assert/strict';
import {contractTarget,transferContract} from '../lib/contract-transfer.mjs';
const counterDb=()=>{let sequence=0;return {prepare:sql=>({bind:(...args)=>({first:async()=>sql.startsWith('SELECT contract_number')?null:sql.startsWith('INSERT INTO contract_document_numbers')?{contract_number:args[2]}:{sequence:++sequence},run:async()=>({success:true})})})};};
const validPayload=()=>({quote_number:'Q1',quote_type:'B2B',quote_date:'2026-09-07',legal_entity:'Bách Ngân',payment_days:7,contract_number:'HĐ-001',subtotal_before_vat:100,responsible:'Nhân viên A',delivery_date:'2026-09-15',customer_tax_code:'1800000000',collection_account_name:'VCB Bách Ngân',customer:{tax_code:'1800000000',customer_code:'KH001',name:'Sample',established_date:'2020-01-01',address:'Cần Thơ',customer_type:'Doanh nghiệp',responsible:'Nhân viên A',contact_name:'Anh B',contact_phone:'0900000000'},items:[{sku:'P1',name:'Sản phẩm 1',description:'',unit:'Cái',quantity:1,unit_price:100,discount_percent:'',status:'',delivery_date:''}],total_in_words:'Một trăm đồng'});
test('contract transfer stays disabled until production webhook is configured',async()=>{
 assert.equal(contractTarget({}),null);assert.equal(contractTarget({CONTRACT_WEBHOOK_URL:'https://n8nthai.moarchvn.com/workflow/ZXdKGauBA1AKIAiJ'}),null);
 assert.equal(contractTarget({CONTRACT_WEBHOOK_URL:'https://other.invalid/webhook/test'}),null);
 await assert.rejects(()=>transferContract({},{} ,()=>{throw Error('must not send');}),e=>e.status===503);
});
test('contract transfer sends the reviewed quote and returns the n8n result',async()=>{
 const env={CONTRACT_WEBHOOK_URL:'https://n8nthai.moarchvn.com/webhook/test-contract',DB:counterDb()},payload=validPayload();
 let sent;const result=await transferContract(env,payload,async(url,options)=>{assert.equal(url,env.CONTRACT_WEBHOOK_URL);assert.equal(options.redirect,undefined);assert.ok(options.signal instanceof AbortSignal);sent=JSON.parse(options.body);return new Response('{"success":true,"message":"Da nhan du lieu HDKT CRM"}',{status:200});});assert.match(sent.so_hd,/^\d{2}-01\/\d{8}\/HĐKT\/BN-KH001$/);assert.equal(sent.contract_number,sent.so_hd);assert.notEqual(sent.so_hd,'HĐKT0000');assert.equal(sent.collection_account_name,'VCB Bách Ngân');assert.equal('collection_account' in sent,false);assert.equal(sent.items[0].description,'Sản phẩm 1');assert.equal(sent.items[0].discount_percent,0);assert.equal(sent.items[0].status,'Đợi triển khai');assert.equal(sent.items[0].delivery_date,'2026-09-15');assert.equal(result.accepted,true);assert.equal(result.contractNumber,sent.so_hd);assert.equal(result.message,'Da nhan du lieu HDKT CRM');assert.equal(result.result.success,true);
 await assert.rejects(()=>transferContract(env,payload,async()=>new Response('',{status:530})),e=>e.status===502);
 await assert.rejects(()=>transferContract(env,payload,async()=>new Response('{"success":false,"message":"Loi tu n8n"}',{status:200})),e=>e.status===502&&e.message==='Loi tu n8n');
 await assert.rejects(()=>transferContract(env,payload,async()=>{throw new Error('timeout');}),e=>e.status===504);
});
test('contract transfer blocks missing CRM identity fields',async()=>{
 const env={CONTRACT_WEBHOOK_URL:'https://n8nthai.moarchvn.com/webhook/test-contract',DB:counterDb()},payload=validPayload();delete payload.customer_tax_code;delete payload.customer.tax_code;
 await assert.rejects(()=>transferContract(env,payload,async()=>new Response('{}',{status:200})),error=>error.status===400&&/MST/.test(error.message));
});
test('contract transfer only accepts collection accounts assigned to the legal entity',async()=>{
 const env={CONTRACT_WEBHOOK_URL:'https://n8nthai.moarchvn.com/webhook/test-contract',DB:counterDb()},payload=validPayload();payload.collection_account_name='ACB Vigifts';
 await assert.rejects(()=>transferContract(env,payload,async()=>new Response('{}',{status:200})),error=>error.status===400&&/không đúng/.test(error.message));
});
test('contract transfer does not require customer establishment date or type',async()=>{
 const env={CONTRACT_WEBHOOK_URL:'https://n8nthai.moarchvn.com/webhook/test-contract',DB:counterDb()},payload=validPayload();delete payload.customer.established_date;delete payload.customer.customer_type;
 const result=await transferContract(env,payload,async()=>new Response('{"success":true}',{status:200}));assert.equal(result.accepted,true);
});
