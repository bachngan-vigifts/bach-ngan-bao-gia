import {QuotationError} from './quotation-store.mjs';

function ocrTarget(env){
 const value=String(env.INCOMING_STOCK_OCR_WEBHOOK_URL||'https://n8nthai.moarchvn.com/webhook/incoming-stock-ocr-from-quote-web').trim();
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='n8nthai.moarchvn.com'&&url.pathname.startsWith('/webhook/')?url.href:null;}catch{return null;}
}

function clean(value,max=2000){
 return String(value??'').trim().slice(0,max);
}

function validateRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>1000)throw new QuotationError(502,'Ảnh chưa đọc được danh sách hàng hợp lệ.');
 return rows.map(row=>({sku:clean(row?.sku,200),quantity:Number(row?.quantity)})).filter(row=>row.sku&&Number.isFinite(row.quantity)&&row.quantity>0);
}

export async function parseIncomingStockImage(env,payload,member,request=fetch){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 const target=ocrTarget(env);
 if(!target)fail(503,'Chưa cấu hình luồng đọc ảnh phiếu nhập.');
 if(!payload||typeof payload!=='object'||Array.isArray(payload))fail(400,'Dữ liệu ảnh không hợp lệ.');
 const image=payload.image||{};
 const dataUrl=clean(image.dataUrl||image.data_url,1800000);
 const match=dataUrl.match(/^data:((?:image\/(?:jpeg|png|webp))|application\/pdf);base64,([A-Za-z0-9+/=]+)$/);
 if(!match)fail(400,'Chọn ảnh JPEG, PNG, WebP hoặc PDF scan.');
 const bytes=Math.floor(match[2].length*3/4);
 if(bytes>720_000)fail(400,'Ảnh sau khi nén vẫn quá lớn. Vui lòng chụp rõ phần bảng hàng hoặc cắt bớt nền.');
 const body={
  action:'parse_incoming_stock_image',
  source:'quote_web',
  requested_fields:['ticketNumber','warehouse','arrivalDate','rows.sku','rows.quantity'],
  image:{name:clean(image.name,200),type:match[1],data_base64:match[2]},
  warehouse_options:Array.isArray(payload.warehouseOptions)?payload.warehouseOptions.map(item=>clean(item,200)).filter(Boolean).slice(0,10):[],
  user:{id:member.id,name:member.name||''},
 };
 let response;
 try{response=await request(target,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout?.(120000)});}catch{fail(504,'Luồng đọc ảnh chưa phản hồi. Vui lòng thử lại hoặc nhập Excel.');}
 if(!response.ok)fail(502,`Luồng đọc ảnh báo lỗi (${response.status}).`);
 let result;try{result=await response.json();}catch{fail(502,'Luồng đọc ảnh trả dữ liệu không hợp lệ.');}
 if(!result?.ok)fail(502,result?.error||'Luồng đọc ảnh chưa xử lý được phiếu này.');
 const rows=validateRows(result.rows);
 if(!rows.length)fail(502,'Ảnh chưa đọc được SKU và số lượng hợp lệ.');
 return {
  ok:true,
  ticketNumber:clean(result.ticketNumber||result.ticket_number,100),
  warehouse:clean(result.warehouse||result.warehouse_name,200),
  arrivalDate:clean(result.arrivalDate||result.arrival_date,10),
  rows,
  confidence:Number.isFinite(Number(result.confidence))?Number(result.confidence):null,
  message:clean(result.message,500),
 };
}
