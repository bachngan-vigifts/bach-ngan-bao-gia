const defaultTarget='https://n8nthai.moarchvn.com/webhook/supplier-order-zalo-notify-from-quote-web';
const defaultZaloTarget='group:2470612216799246520';
const defaultMailFrom='claw@quatangvigifts.com';
const defaultOwnerEmail='info@quatangvigifts.com';
const defaultPublicBaseUrl='https://baogia.minhlongonline.com';
const minhLongToEmail='sales01.cantho@minhlong.com';
const minhLongCcEmails=['linh.vo@minhlong.com'];

const clean=(value,max=500)=>String(value??'').trim().slice(0,max);
const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim());
const emailList=value=>String(value||'').split(/[;,]/).map(item=>clean(item,254).toLowerCase()).filter(validEmail);
const uniqueEmails=values=>[...new Set(values.flatMap(emailList))];
const isMinhLongOrder=order=>/minh\s*long/i.test(String(order?.supplierName||''));
const webhookTarget=env=>{
 const value=clean(env.SUPPLIER_ORDER_NOTIFY_WEBHOOK_URL||defaultTarget,1000);
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='n8nthai.moarchvn.com'&&url.pathname.startsWith('/webhook/')?url.href:null;}catch{return null;}
};
const publicBaseUrl=env=>{
 const value=clean(env.SUPPLIER_ORDER_PUBLIC_BASE_URL||env.PUBLIC_SITE_URL||env.SITE_PUBLIC_URL||defaultPublicBaseUrl,1000);
 try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.origin:defaultPublicBaseUrl;}catch{return defaultPublicBaseUrl;}
};
const orderLinks=(env,order)=>{
 const base=publicBaseUrl(env),id=encodeURIComponent(clean(order?.id||'',120));
 const supplierOrder=`${base}/supplier#order=${id}`;
 return {supplierOrder,supplierPortal:supplierOrder,staffOrder:`${base}/quote#supplier-order=${id}`};
};

const briefOrder=(order,links={})=>({
 id:order.id,
 ticketNumber:order.ticketNumber||'',
 quoteNumber:order.quoteNumber||'',
 source:order.source||'',
 approvalStatus:order.approvalStatus||'',
 supplierInternalOrderNumber:order.supplierInternalOrderNumber||'',
 supplierName:order.supplierName||'',
 supplierEmail:order.supplierEmail||'',
 ccEmail:order.ccEmail||'',
 warehouse:order.warehouse||'',
 arrivalDate:order.arrivalDate||'',
 depositRate:order.depositRate??30,
 depositAmount:order.depositAmount||0,
 depositRequestedAt:order.depositRequestedAt||'',
 depositPaidAt:order.depositPaidAt||'',
 depositPaidAmount:order.depositPaidAmount||0,
 remainingAmount:order.remainingAmount||0,
 supplierStatus:order.supplierStatus||'pending',
 supplierSignatureUploadedAt:order.supplierSignatureUploadedAt||'',
 supplierSignatureDeletedAt:order.supplierSignatureDeletedAt||'',
 supplierSignatureFile:order.supplierSignatureFile?{name:order.supplierSignatureFile.name||'',type:order.supplierSignatureFile.type||'',size:order.supplierSignatureFile.size||0}:null,
 supplierDeliveryReadyAt:order.supplierDeliveryReadyAt||'',
 supplierDeliveryReadyMode:order.supplierDeliveryReadyMode||'',
 supplierDeliveryReadyDate:order.supplierDeliveryReadyDate||'',
 approvedAt:order.approvedAt||'',
 supplierConfirmedAt:order.supplierConfirmedAt||'',
 deletedAt:order.deletedAt||'',
 deletedBy:order.deletedBy||'',
 supplierPortalRemoved:Boolean(order.supplierPortalRemoved),
 subtotal:order.subtotal||0,
 vat:order.vat||0,
 total:order.total||0,
 supplierDateChanges:Array.isArray(order.supplierDateChanges)?order.supplierDateChanges.slice(0,80):[],
 supplierDiscountChanges:Array.isArray(order.supplierDiscountChanges)?order.supplierDiscountChanges.slice(0,80):[],
 viewUrl:links.supplierOrder||'',
 supplierPortalUrl:links.supplierPortal||'',
 staffUrl:links.staffOrder||'',
 rows:(order.rows||[]).slice(0,80).map(row=>({
  sku:row.sku,
  name:row.name,
  quantity:row.quantity,
  purchaseDiscount:row.purchaseDiscount,
  supplierNote:row.supplierNote||'',
  promisedDate:row.promisedDate||'',
  lineTotal:row.lineTotal||0
 }))
});

export async function notifySupplierOrder(env,eventType,result,member){
 const target=webhookTarget(env);if(!target)return {ok:false,skipped:true};
 const order=result?.order||result;
 const ownerEmail=clean(env.SUPPLIER_ORDER_OWNER_EMAIL||defaultOwnerEmail,254);
 const supplierEmail=clean(order?.supplierEmail||'',254);
 const storedCcEmails=emailList(order?.ccEmail);
 const minhLong=isMinhLongOrder(order);
 const toEmails=uniqueEmails([ownerEmail,minhLong?minhLongToEmail:supplierEmail]);
 const ccEmails=uniqueEmails([storedCcEmails,minhLong?[supplierEmail,...minhLongCcEmails]:[]]).filter(email=>!toEmails.includes(email));
 const links=orderLinks(env,order);
 const payload={
  source:'bach-ngan-bao-gia',
  eventType,
  eventTime:new Date().toISOString(),
  zaloTarget:clean(env.SUPPLIER_ORDER_ZALO_TARGET||defaultZaloTarget,120),
  links,
  mail:{from:clean(env.SUPPLIER_ORDER_EMAIL_FROM||defaultMailFrom,254),ownerEmail,toEmails,ccEmails,orderUrl:links.supplierOrder},
  actor:{id:member.id,name:member.name,email:member.email,role:member.role},
  order:briefOrder(order,links)
 };
 const response=await fetch(target,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 if(!response.ok)throw Error(`N8N supplier notify failed ${response.status}`);
 return {ok:true,status:response.status};
}

export async function notifySupplierOrderSafe(env,eventType,result,member){
 try{return await notifySupplierOrder(env,eventType,result,member);}
 catch(error){console.error('Supplier order n8n notify failed',eventType,error?.name,error?.message);return {ok:false,error:error?.message||String(error)};}
}
