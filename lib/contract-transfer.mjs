import {QuotationError} from './quotation-store.mjs';
import {reserveContractNumber} from './contract-number.mjs';
export function contractTarget(env){
 try{const url=new URL(env.CONTRACT_WEBHOOK_URL);return url.protocol==='https:'&&url.hostname==='n8nthai.moarchvn.com'&&url.pathname.startsWith('/webhook/')&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
const safeContractUrl=result=>{for(const value of [result?.contract_url,result?.contractUrl,result?.url,result?.data?.contract_url,result?.data?.url])try{const url=new URL(value);if(url.protocol==='https:')return url.href;}catch{}return null;};
export async function transferContract(env,payload,request=fetch){
 const target=contractTarget(env);if(!target)throw new QuotationError(503,'Chưa kết nối được luồng tạo HĐKT. Manager cần hoàn tất cấu hình luồng.');
 if(!payload||typeof payload!=='object')throw new QuotationError(400,'Thông tin HĐKT CRM không hợp lệ.');
 const customer=payload.customer||{},deliveryDate=String(payload.delivery_date||'').trim();
 const outgoing={...payload,contract_number:'',so_hd:'',subtotal_before_vat:payload.subtotal_before_vat??payload.subtotal,responsible:String(payload.responsible||customer.responsible||'').trim(),delivery_date:deliveryDate,customer_tax_code:String(payload.customer_tax_code||customer.tax_code||'').trim(),collection_account_name:String(payload.collection_account_name||'').trim(),customer:{...customer,tax_code:String(payload.customer_tax_code||customer.tax_code||'').trim(),customer_code:String(customer.customer_code||'').trim(),name:String(customer.name||'').trim(),established_date:String(customer.established_date||'').trim(),address:String(customer.address||'').trim(),customer_type:String(customer.customer_type||'').trim(),responsible:String(payload.responsible||customer.responsible||'').trim(),contact_name:String(customer.contact_name||customer.contact||'').trim(),contact_phone:String(customer.contact_phone||customer.phone||'').trim()},items:Array.isArray(payload.items)?payload.items.map(item=>({...item,description:String(item.description||item.name||'').trim(),discount_percent:item.discount_percent===null||item.discount_percent===undefined||item.discount_percent===''?0:Number(item.discount_percent),status:String(item.status||'Đợi triển khai').trim(),delivery_date:String(item.delivery_date||deliveryDate).trim()})):[]};
 delete outgoing.collection_account;
 const allowedAccounts={VIGIFTS:['ACB Vigifts'],'Bách Ngân':['ACB Bách Ngân','VCB Bách Ngân']};
 const missing=[];const need=(value,label)=>{if(value===null||value===undefined||String(value).trim()==='')missing.push(label);};
 need(outgoing.quote_number,'số báo giá');need(outgoing.legal_entity,'pháp nhân');if(!Number.isFinite(Number(outgoing.payment_days))||Number(outgoing.payment_days)<0)missing.push('hạn thanh toán');if(!Number.isFinite(Number(outgoing.subtotal_before_vat)))missing.push('thành tiền trước thuế');need(outgoing.responsible,'nhân viên phụ trách');need(outgoing.delivery_date,'ngày hẹn giao');need(outgoing.customer_tax_code,'MST');need(outgoing.collection_account_name,'tài khoản thu tiền');need(outgoing.customer.customer_code,'mã khách hàng');need(outgoing.customer.name,'tên khách hàng');need(outgoing.customer.address,'địa chỉ');need(outgoing.customer.contact_name,'người liên hệ');need(outgoing.customer.contact_phone,'SĐT liên hệ');
 if(outgoing.legal_entity&&!allowedAccounts[outgoing.legal_entity])throw new QuotationError(400,'Pháp nhân HĐKT không hợp lệ.');
 if(outgoing.collection_account_name&&!allowedAccounts[outgoing.legal_entity]?.includes(outgoing.collection_account_name))throw new QuotationError(400,'Tài khoản thu tiền không đúng với pháp nhân đã chọn.');
 if(!outgoing.items.length)missing.push('dòng sản phẩm');if(outgoing.items.length>300)throw new QuotationError(400,'HĐKT không được vượt quá 300 dòng sản phẩm.');
 outgoing.items.forEach((item,index)=>{const row=index+1;need(item.sku,`SKU dòng ${row}`);need(item.name,`tên sản phẩm dòng ${row}`);need(item.description,`mô tả dòng ${row}`);need(item.unit,`đơn vị tính dòng ${row}`);if(!Number.isFinite(Number(item.unit_price)))missing.push(`đơn giá dòng ${row}`);if(!Number.isFinite(Number(item.quantity))||Number(item.quantity)<=0)missing.push(`số lượng dòng ${row}`);need(item.status,`trạng thái dòng ${row}`);need(item.delivery_date,`ngày giao dòng ${row}`);});
 if(missing.length)throw new QuotationError(400,`Chưa thể tạo HĐKT CRM. Còn thiếu: ${[...new Set(missing)].join(', ')}.`);
 const contractNumber=await reserveContractNumber(env.DB,outgoing);outgoing.contract_number=contractNumber;outgoing.so_hd=contractNumber;
 if(!contractNumber||['HĐKT0000','TEST','DRAFT'].includes(contractNumber.toUpperCase()))throw new QuotationError(503,'Chưa tạo được số HĐKT hợp lệ.');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),45000);
 let response;
 try{
  response=await request(target,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(outgoing),signal:controller.signal});
 }catch{
  throw new QuotationError(504,'Chưa nhận được kết quả tạo HĐKT. Kiểm tra luồng trước khi gửi lại để tránh tạo trùng.');
 }finally{
  clearTimeout(timer);
 }
 if(!response.ok)throw new QuotationError(502,'Luồng HĐKT chưa xử lý được yêu cầu. Kiểm tra kết nối máy chủ và lần chạy trong n8n.');
 const result=await response.json().catch(()=>null);
 if(result?.success===false||result?.error)throw new QuotationError(502,result?.message||'Luồng đã báo lỗi xử lý HĐKT. Kiểm tra lần chạy trước khi gửi lại.');
 const message=result?.message||'Luồng đã nhận thông tin HĐKT CRM.',contractUrl=safeContractUrl(result),timestamp=new Date().toISOString();
 await env.DB.prepare(`INSERT INTO contract_transfers (quote_number,contract_number,contract_url,message,result_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
  ON CONFLICT(quote_number) DO UPDATE SET contract_number=excluded.contract_number,contract_url=excluded.contract_url,message=excluded.message,result_json=excluded.result_json,updated_at=excluded.updated_at`).bind(outgoing.quote_number,contractNumber,contractUrl,message,JSON.stringify(result),timestamp,timestamp).run();
 return {accepted:true,message,contractNumber,contractUrl,result};
}
