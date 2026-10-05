import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('Sapo confirmation hides code, validates connection and sends the reviewed snapshot once',async()=>{
 const src=readFileSync('public/app.js','utf8');const start=src.indexOf('let confirmedSapoPayload=');const end=src.indexOf('\n};',src.indexOf("$('#sendWebhook').onclick=",start))+4;
 const els=Object.fromEntries(['previewPayload','sapoConfirmation','sapoSendStatus','sendWebhook','sapoOrderStatus'].map(id=>['#'+id,{}]));els['#mobileSapoCopy']={hidden:false,toggleAttribute(name,value){if(name==='hidden')this.hidden=value;}};els['#viewSapoOrder']={hidden:true,removeAttribute(){},setAttribute(){},classList:{toggle(){}}};
 const q={quote_number:'Q1',quote_date:'2026-09-06',customer:{name:'Customer'},items:[{name:'Product',sku:'SKU1',quantity:2,unit_price:100,discount_type:'percent',discount_percent:5,print_fee:0,tax_percent:8,line_total:190}],subtotal:190,vat_amount:15.2,total:205.2,total_in_words:'Hai trăm lẻ năm đồng'};
 let endpoint='',calls=[];const ctx={document:{getElementById:()=>null},$:id=>els[id],localStorage:{getItem:()=>endpoint},saveDraft(){},quotePayload:()=>structuredClone(q),openModal(){},toast(){},esc:s=>String(s??''),money:s=>String(s),state:{_record:{id:'quote-1',approvalStatus:'approved'}},BN:{api:async(url,method,body)=>{if(url==='/sapo-connection')return {ok:true,message:'Đã kết nối Sapo.'};if(url==='/quotes/quote-1/sapo-status')return {status:{status:'created',sapoOrderUrl:'https://admin.sapo.vn/orders/1070212469',sapoOrderCode:'SO-1'}};assert.equal(url,'/sapo-copy');calls.push(body);return {status:'created',sapoOrderId:40,sapoOrderCode:'Q1',sapoOrderUrl:'https://admin.sapo.vn/orders/40',message:'Created'};}}};
 vm.runInNewContext(src.slice(start,end),ctx);await els['#previewPayload'].onclick();assert.equal(els['#sendWebhook'].disabled,false);assert.equal(els['#viewSapoOrder'].hidden,false);assert.equal(els['#viewSapoOrder'].href,'https://admin.sapo.vn/orders/1070212469');assert.equal(els['#previewPayload'].hidden,true);assert.equal(els['#mobileSapoCopy'].hidden,true);
 endpoint='https://example.invalid/sapo';await els['#previewPayload'].onclick();assert.equal(els['#sendWebhook'].disabled,false);assert.match(els['#sapoConfirmation'].innerHTML,/SKU1/);assert.match(els['#sapoOrderStatus'].innerHTML,/Xem đơn hàng Sapo/);
 q.items[0].quantity=99;await els['#sendWebhook'].onclick();await els['#sendWebhook'].onclick();assert.equal(calls.length,1);assert.equal(els['#sendWebhook'].textContent,'Đã tạo đơn Sapo');assert.match(els['#sapoOrderStatus'].innerHTML,/orders\/40/);assert.equal(calls[0].items[0].quantity,2);
 assert.equal(calls[0].total_in_words,'Hai trăm lẻ năm đồng');
 const html=readFileSync('public/quote.html','utf8');assert(!html.includes('id="webhookUrl"'));assert(!html.includes('id="payloadCode"'));assert(!html.includes('Sao chép JSON'));
 assert.match(html,/id="viewSapoOrder"/);assert.match(html,/sapo-icon\.jpeg/);
});

test('expired Sapo session keeps submit disabled and never posts an order',async()=>{
 const src=readFileSync('public/app.js','utf8'),start=src.indexOf('let confirmedSapoPayload='),end=src.indexOf('\n};',src.indexOf("$('#sendWebhook').onclick=",start))+4;
 const els=Object.fromEntries(['previewPayload','sapoConfirmation','sapoSendStatus','sendWebhook','sapoOrderStatus'].map(id=>['#'+id,{}]));
 els['#mobileSapoCopy']={toggleAttribute(){}};els['#viewSapoOrder']={removeAttribute(){},setAttribute(){},classList:{toggle(){}}};
 const q={quote_number:'Q1',customer:{name:'Customer'},items:[{sku:'SKU1',quantity:1}]};let posts=0;
 const ctx={document:{getElementById:()=>null},$:id=>els[id],saveDraft(){},quotePayload:()=>q,openModal(){},esc:s=>String(s??''),money:String,state:{_record:{id:'quote-1'}},BN:{api:async(url,method)=>{if(method==='POST')posts++;if(url==='/sapo-connection')throw Error('Phiên Sapo hết hạn');return {status:null};}}};
 vm.runInNewContext(src.slice(start,end),ctx);await els['#previewPayload'].onclick();await els['#sendWebhook'].onclick();
 assert.equal(els['#sendWebhook'].disabled,true);assert.match(els['#sapoSendStatus'].textContent,/hết hạn/);assert.equal(posts,0);
});
