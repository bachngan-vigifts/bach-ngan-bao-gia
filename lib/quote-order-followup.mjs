import {validDeliveryDate,contractDeliveryDate} from './contract-delivery-date.mjs';
import {quotationScope,quoteShareKeys} from './quotation-access.mjs';
import '../public/quote-math.js';
import {QuotationError} from './quotation-store.mjs';
const fail=(status,message)=>{throw new QuotationError(status,message);};
export function approvedSapoPayload(quote,input={}){
 if(quote.approvalStatus!=='approved')fail(403,'Báo giá cần được duyệt trước khi tạo đơn Sapo.');
 if(!quote.canEdit)fail(403,'Bạn không có quyền tạo đơn từ báo giá này.');
 if(Number(input.revision)!==quote.revision)fail(409,'Báo giá đã thay đổi. Vui lòng mở lại trước khi tạo đơn.');
 const d=quote.data,rows=d.rows||[],dates=input.delivery_dates;
 if(!rows.length)fail(400,'Báo giá chưa có sản phẩm.');
 if(!Array.isArray(dates)||dates.length!==rows.length)fail(400,'Vui lòng nhập ngày giao cho từng sản phẩm.');
 const items=rows.map((r,i)=>{
  const delivery_date=validDeliveryDate(dates[i]);if(!delivery_date)fail(400,`Ngày giao sản phẩm dòng ${i+1} không hợp lệ.`);
  return {line:i+1,sku:r.sku,name:r.name,unit:r.unit,quantity:r.qty,unit_price:r.price,discount_type:r.discountType||'percent',discount_percent:r.discountType==='amount'?0:r.discount||0,discount_amount:r.discountType==='amount'?r.discount||0:Number(r.price||0)*Number(r.discount||0)/100,print_fee:d.type==='HRC'?0:r.printFee||0,price_after_discount:QuoteMath.after(r,d),line_total:QuoteMath.after(r,d)*r.qty,tax_percent:QuoteMath.rate(r,d),delivery_date,price_policy:r.pricePolicy||'',image_url:r.image?.startsWith('data:')?'':r.image||''};
 });
 const t=QuoteMath.totals(d);
 return {quote_number:d.quoteNo,quote_type:d.type,quote_date:d.date,responsible:d.owner,responsible_phone:d.ownerPhone||'',customer:{sapo_id:/^\d+$/.test(d.customerId||'')?d.customerId:null,name:d.customer,customer_code:d.customerCode,tax_code:d.customerTaxCode,phone:d.phone,email:d.email,address:d.customerAddress,contact:d.contact},items,subtotal:t.subtotal,vat_amount:t.tax,total:t.total,notes:d.notes||''};
}
export async function readOrderFollowup(db,id){
 try{const row=await db.prepare('SELECT data FROM quote_order_followups WHERE quote_id=?').bind(id).first();return row?JSON.parse(row.data):null;}
 catch(e){if(/no such table|does not exist/i.test(e.message||''))return null;throw e;}
}
export function applyOrderFollowup(data,record){
 if(!record)return data;
 return {...data,orderFollowup:record,rows:(data.rows||[]).map((r,i)=>({...r,...(record.lines?.[i]?.sku===r.sku?{deliveryDate:record.lines[i].deliveryDate}:{})}))};
}
export async function saveOrderFollowup(db,quote,payload,result){
 if(!['created','existing'].includes(result.status)||!result.sapoOrderId)fail(502,'Sapo chưa xác nhận đơn để ghi công nợ.');
 await db.prepare('CREATE TABLE IF NOT EXISTS quote_order_followups (quote_id TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at TEXT NOT NULL)').run();
 const data={quoteId:quote.id,quoteNo:quote.data.quoteNo,customerId:quote.data.customerId||'',customer:quote.data.customer,total:Math.round(payload.total),paid:0,balance:Math.round(payload.total),kind:'expected',sapoOrderId:result.sapoOrderId,sapoOrderCode:result.sapoOrderCode,sapoOrderUrl:result.sapoOrderUrl,lines:payload.items.map((r,i)=>({line:i+1,sku:r.sku,name:r.name,qty:r.quantity,deliveryDate:r.delivery_date})),createdAt:new Date().toISOString()};
 // One debt record per quotation, including repeat requests and uncertain retries.
 await db.prepare('INSERT INTO quote_order_followups (quote_id,data,updated_at) VALUES (?,?,?) ON CONFLICT(quote_id) DO NOTHING').bind(quote.id,JSON.stringify(data),data.createdAt).run();
 return readOrderFollowup(db,quote.id);
}
export async function listOrderFollowups(db,viewer,overrides){
 viewer={...viewer,positionId:viewer.positionId??viewer.position_id};const scope=quotationScope(viewer,quoteShareKeys(overrides,viewer));
 try{const rows=await db.prepare(`SELECT f.data FROM quote_order_followups f JOIN staff_quotations q ON q.id=f.quote_id JOIN staff_members m ON m.id=q.creator_id WHERE ${scope.sql} ORDER BY f.updated_at DESC`).bind(...scope.bindings).all();return (rows.results||[]).map(r=>JSON.parse(r.data));}
 catch(e){if(/no such table|does not exist/i.test(e.message||''))return [];throw e;}
}
