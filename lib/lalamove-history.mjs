import {QuotationError} from './quotation-store.mjs';

const target='https://n8nthai.moarchvn.com/webhook/lalamove-history-for-quote-web';

export async function loadLalamoveHistory(body,request=fetch){
 const payload={search:typeof body?.q==='string'?body.q.trim().slice(0,160):'',phone:typeof body?.customer_phone==='string'?body.customer_phone.trim().slice(0,100):'',limit:Math.min(100,Math.max(1,Number(body?.limit)||100))};
 const url=new URL(target);url.searchParams.set('limit',payload.limit);if(payload.phone)url.searchParams.set('phone',payload.phone);if(payload.search)url.searchParams.set('search',payload.search);
 let response;
 try{response=await request(url.href,{method:'GET',headers:{'Accept':'application/json'}});}catch(error){console.error('Lalamove history fetch failed',error?.name,error?.message);throw new QuotationError(504,'Chưa tải được lịch sử Lalamove.');}
 const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={};}
 if(!response.ok||data?.ok!==true||data?.success===false||data?.error)throw new QuotationError(502,data?.error||data?.message||'Không tải được lịch sử Lalamove.');
 return {addresses:Array.isArray(data.addresses)?data.addresses:[]};
}
