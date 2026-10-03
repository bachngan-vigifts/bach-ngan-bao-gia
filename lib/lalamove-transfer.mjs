import {QuotationError} from './quotation-store.mjs';

const defaultTarget='https://n8nthai.moarchvn.com/webhook/lalamove-order-from-quote-web-to-claw';
const text=(value,max=500)=>typeof value==='string'?value.trim().slice(0,max):'';
const coordinate=(value,min,max)=>{if(value===null||value===undefined||String(value).trim()==='')return null;const number=Number(value);return Number.isFinite(number)&&number>=min&&number<=max?number:null;};

export function lalamoveTarget(env){return text(env.LALAMOVE_WEBHOOK,1000)||defaultTarget;}

export async function sendLalamoveRequest(payload,request=fetch,env={}){
 if(!payload||!['quote','place_order'].includes(payload.action)||!text(payload.quote_number,120))throw new QuotationError(400,'Thiếu số báo giá hoặc thao tác Lalamove không hợp lệ.');
 const required=['pickup_address','dropoff_address','sender_name','sender_phone','recipient_name','recipient_phone'];
 if(required.some(key=>!text(payload[key])))throw new QuotationError(400,'Cần nhập đủ địa chỉ, tên và số điện thoại hai bên.');
 if(coordinate(payload.pickup_lat,-90,90)===null||coordinate(payload.pickup_lng,-180,180)===null||coordinate(payload.dropoff_lat,-90,90)===null||coordinate(payload.dropoff_lng,-180,180)===null)throw new QuotationError(400,'Cần nhập tọa độ hợp lệ cho điểm lấy và điểm giao.');
 if(payload.action==='place_order'&&(!payload.confirmed||!text(payload.confirmed_by)||!text(payload.confirmed_at)||payload.confirmed_price===undefined||payload.confirmed_price===''))throw new QuotationError(400,'Cần xem cước và xác nhận giá trước khi đặt xe.');
 const outgoing={...payload,source:'quote_web',language:'vi_VN',pickup_lat:coordinate(payload.pickup_lat,-90,90),pickup_lng:coordinate(payload.pickup_lng,-180,180),dropoff_lat:coordinate(payload.dropoff_lat,-90,90),dropoff_lng:coordinate(payload.dropoff_lng,-180,180)};
 let response;
 const options={method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(outgoing)};
 if(typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function')options.signal=AbortSignal.timeout(45000);
 try{response=await request(lalamoveTarget(env),options);}catch(error){console.error('Lalamove webhook fetch failed',error?.name,error?.message);throw new QuotationError(504,'Chưa nhận được phản hồi từ máy chủ Lalamove.');}
 const raw=await response.text();let result={};try{result=raw?JSON.parse(raw):{}}catch{result={message:raw};}
 if(!response.ok||result?.ok===false||result?.success===false||result?.error)throw new QuotationError(502,text(result?.error||result?.message,1000)||'Luồng Lalamove báo lỗi.');
 return result;
}
