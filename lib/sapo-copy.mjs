import {QuotationError} from './quotation-store.mjs';
import {clean,number,normalize,compactObject,sapoId,sapoAdminRequest,sapoOrderUrl} from './sapo-admin.mjs';

const truncate=(value,maxLength)=>{const text=clean(value);return text.length<=maxLength?text:text.slice(0,Math.max(0,maxLength-3)).trimEnd()+'...';};
const upper=value=>clean(value).toUpperCase();
const config=env=>({
 locationId:number(env.SAPO_VIGIFTS_LOCATION_ID||env.SAPO_LOCATION_ID,51460),
 sourceId:number(env.SAPO_VIGIFTS_SOURCE_ID||env.SAPO_SOURCE_ID,339582),
 priceListId:number(env.SAPO_PRICE_LIST_ID,146550),
 accountId:env.SAPO_ACCOUNT_ID?number(env.SAPO_ACCOUNT_ID):null,
});

function pickQuote(payload){
 const order=payload.order||payload,candidates=[order.external_reference,payload.external_reference,order.quote_number,payload.quote_number,order.so_bao_gia,payload.so_bao_gia,order.quoteNo,payload.quoteNo,order.quotation_no,payload.quotation_no,order.code,payload.code];
 const quote=candidates.find(value=>clean(value));if(!quote)throw new QuotationError(400,'Thiếu số báo giá để tạo đơn Sapo.');
 return clean(quote);
}

function normalizeCustomer(payload){
 const order=payload.order||payload,raw=order.customer||payload.customer||{};
 const sapoIdValue=clean(raw.sapo_id);
 return compactObject({sapo_id:/^\d+$/.test(sapoIdValue)?Number(sapoIdValue):null,local_id:clean(raw.local_id),name:clean(raw.name),tax_code:clean(raw.tax_code),customer_code:clean(raw.customer_code),contact:clean(raw.contact||raw.contact_name),phone:clean(raw.phone),email:clean(raw.email),discounts:raw.discounts||null});
}

function normalizeItems(payload){
 const order=payload.order||payload,rawItems=order.items||order.line_items||payload.items||payload.line_items||[];
 if(!Array.isArray(rawItems)||!rawItems.length||rawItems.length>300)throw new QuotationError(400,'Vui lòng thêm sản phẩm vào báo giá.');
 return rawItems.map((item,index)=>{
  const sku=clean(item.sku||item.barcode||item.ma_hang||item.code);
  const quantity=number(item.quantity??item.qty??item.so_luong);
  const unitPrice=number(item.unit_price??item.price??item.don_gia);
  if(!sku)throw new QuotationError(400,'Mỗi sản phẩm cần có SKU.');
  if(!(quantity>0))throw new QuotationError(400,'Mỗi sản phẩm cần số lượng lớn hơn 0.');
  if(unitPrice<0)throw new QuotationError(400,'Đơn giá Sapo không hợp lệ.');
  const discountAmount=number(item.discount_amount),priceAfterDiscount=number(item.price_after_discount??item.discounted_unit_price,Math.max(0,unitPrice-discountAmount));
  return {line:number(item.line,index+1),sku,name:clean(item.name||item.ten_hang||item.product_name||sku),unit:clean(item.unit||item.dvt),quantity,unitPrice,discountType:clean(item.discount_type||(item.discount_percent!==undefined?'percent':'amount')),discountPercent:number(item.discount_percent??item.discount_rate),discountAmount,printFee:number(item.print_fee),hasExplicitPriceAfterDiscount:item.price_after_discount!==undefined||item.discounted_unit_price!==undefined,priceAfterDiscount,lineTotal:number(item.line_total,priceAfterDiscount*quantity+number(item.print_fee)),taxPercent:number(item.tax_percent??order.vat_percent??payload.vat_percent,8),pricePolicy:clean(item.price_policy),cartons:number(item.cartons),weightKg:number(item.weight_kg),imageUrl:clean(item.image_url),deliveryDate:clean(item.delivery_date)};
 });
}

async function api(env,path,options,request,cfg){return sapoAdminRequest(env,path,{...options,locationId:cfg.locationId,referer:`${(env.SAPO_ADMIN_BASE||'https://bachngankiengiang.mysapogo.com/admin').replace(/\/$/,'')}/orders/create`},request);}

async function findExisting(env,quote,requestId,request,cfg){
 const queries=[...new Set([quote,quote.replace(/\D/g,''),requestId].filter(Boolean))];
 for(const query of queries){
  const body=await api(env,'/orders.json?query='+encodeURIComponent(query)+'&limit=50',{},request,cfg);
  const found=(body.orders||[]).find(order=>{
   if(Number(order.location_id)!==cfg.locationId)return false;
   const haystack=[order.code,order.reference_number,order.note,...(Array.isArray(order.tags)?order.tags:[])].filter(Boolean).join(' ');
   return haystack.includes(quote)||(requestId&&haystack.includes(requestId));
  });
  if(found)return found;
 }
 return null;
}

async function findCustomerById(env,id,request,cfg){
 if(!id)return null;
 try{return (await api(env,'/customers/'+encodeURIComponent(id)+'.json',{},request,cfg)).customer||null;}
 catch(error){if(error.status===404)return null;throw error;}
}

async function findCustomer(env,customer,request,cfg){
 const byId=await findCustomerById(env,customer.sapo_id,request,cfg);if(byId)return byId;
 const queries=[customer.customer_code,customer.tax_code,customer.phone,customer.email,customer.name].filter(Boolean);
 for(const query of [...new Set(queries)]){
  const body=await api(env,'/customers.json?query='+encodeURIComponent(query)+'&limit=20',{},request,cfg);
  const found=(body.customers||[]).find(candidate=>{
   const haystack=[candidate.code,candidate.customer_code,candidate.tax_code,candidate.phone,candidate.mobile,candidate.email,candidate.name].filter(Boolean).map(v=>clean(v).toLowerCase());
   return [customer.customer_code,customer.tax_code,customer.phone,customer.email,customer.name].filter(Boolean).some(v=>haystack.includes(clean(v).toLowerCase()));
  });
  if(found)return found;
 }
 return null;
}

function customerPayload(customer){
 const name=customer.name||customer.contact||customer.phone||customer.email||customer.customer_code;
 if(!name)throw new QuotationError(400,'Thiếu thông tin khách hàng để tạo khách Sapo.');
 return compactObject({name,code:customer.customer_code,customer_code:customer.customer_code,tax_code:customer.tax_code,phone:customer.phone,mobile:customer.phone,email:customer.email,contact_name:customer.contact,note:['OpenClaw tao tu web bao gia.',customer.local_id?'local_id='+customer.local_id:'',customer.discounts?'discounts='+JSON.stringify(customer.discounts):''].filter(Boolean).join(' ')});
}

async function createCustomer(env,customer,request,cfg){
 const payload=customerPayload(customer),attempts=[{body:{customer:payload}},{body:payload}];
 for(const attempt of attempts){
  try{const body=await api(env,'/customers.json',{method:'POST',body:JSON.stringify(attempt.body),headers:{'x-sapo-requestid':sapoId()}},request,cfg);return {customer:body.customer||body,action:'created'};}
  catch{const existing=await findCustomer(env,customer,request,cfg);if(existing)return {customer:existing,action:'existing_after_error'};}
 }
 throw new QuotationError(502,'Không tạo được khách hàng trên Sapo.');
}

async function ensureCustomer(env,customer,request,cfg){
 const existing=await findCustomer(env,customer,request,cfg);
 return existing?{customer:existing,action:'existing'}:createCustomer(env,customer,request,cfg);
}

async function findVariant(env,sku,request,cfg){
 const body=await api(env,'/variants/search.json?query='+encodeURIComponent(sku)+'&limit=20&location_id='+encodeURIComponent(cfg.locationId),{},request,cfg);
 const exact=(body.variants||[]).filter(variant=>upper(variant.sku)===upper(sku)||upper(variant.barcode)===upper(sku));
 if(exact.length>1)throw new QuotationError(409,'SKU bị trùng trên Sapo: '+sku);
 return exact[0]||null;
}

function productPayload(item){
 return compactObject({name:item.name||item.sku,status:'active',product_type:'normal',vendor:'OpenClaw',tags:['OpenClaw','web-bao-gia',item.sku].join(','),description:['Tao tu web bao gia khi SKU chua ton tai.',item.pricePolicy?'Chinh sach gia: '+item.pricePolicy+'.':'',item.imageUrl?'Anh web: '+item.imageUrl:''].filter(Boolean).join(' '),variants:[compactObject({sku:item.sku,barcode:item.sku,name:item.name,option1:'Default Title',price:item.unitPrice,import_price:0,unit:item.unit,weight:item.weightKg,taxable:true,inventory_management:'sapo',inventory_policy:'continue'})]});
}

async function createProduct(env,item,request,cfg){
 const payload=productPayload(item),attempts=[{body:{product:payload}},{body:payload}];
 for(const attempt of attempts){
  try{const body=await api(env,'/products.json',{method:'POST',body:JSON.stringify(attempt.body),headers:{'x-sapo-requestid':sapoId()}},request,cfg);const product=body.product||body;const variant=(product.variants||[]).find(v=>upper(v.sku)===upper(item.sku))||await findVariant(env,item.sku,request,cfg);if(!variant)throw new Error('missing variant');return {variant,action:'created',product_id:product.id||variant.product_id};}
  catch{const existing=await findVariant(env,item.sku,request,cfg);if(existing)return {variant:existing,action:'existing_after_error',product_id:existing.product_id};}
 }
 throw new QuotationError(502,'Không tạo được sản phẩm Sapo cho SKU '+item.sku+'.');
}

async function ensureVariant(env,item,request,cfg){
 const existing=await findVariant(env,item.sku,request,cfg);
 return existing?{variant:existing,action:'existing',product_id:existing.product_id}:createProduct(env,item,request,cfg);
}

function configuredAccount(payload,env){
 const direct=number(payload.responsible_sapo_account_id||payload.sapo_account_id);
 if(direct>0)return direct;
 let map={};try{map=JSON.parse(env.SAPO_ACCOUNT_MAP||'{}')}catch{}
 const keys=[payload.responsible_email,payload.responsible,payload.responsible_phone].map(clean).filter(Boolean);
 for(const key of keys){const id=number(map[key]||map[key.toLowerCase()]||map[normalize(key)]);if(id>0)return id;}
 return null;
}

async function findResponsibleAccount(env,payload,request,cfg){
 const configured=configuredAccount(payload,env);if(configured)return {id:configured,source:'configured'};
 const responsibleEmail=clean(payload.responsible_email).toLowerCase(),responsibleName=normalize(payload.responsible);
 if(!responsibleEmail&&!responsibleName)return null;
 let accounts=[];
 try{accounts=(await api(env,'/accounts.json?limit=100',{},request,cfg)).accounts||[];}catch{return null;}
 const active=accounts.filter(account=>clean(account.status).toLowerCase()!=='inactive'),matchesEmail=account=>responsibleEmail&&clean(account.email).toLowerCase()===responsibleEmail,matchesName=account=>responsibleName&&normalize(account.full_name||account.name)===responsibleName;
 return active.find(matchesEmail)||active.find(matchesName)||null;
}

function discountItems(item){
 if(item.discountType==='percent'&&item.discountPercent>0)return [{source:'manual',rate:item.discountPercent,value:0,reason:'Chiet khau '+item.discountPercent+'%',promotion_condition_item_id:null}];
 if(item.discountAmount>0)return [{source:'manual',rate:0,value:item.discountAmount,reason:'Chiet khau theo so tien',promotion_condition_item_id:null}];
 return [];
}

function buildLine(item,variant){
 const useNet=item.hasExplicitPriceAfterDiscount&&item.priceAfterDiscount>0;
 return compactObject({product_id:variant.product_id,variant_id:variant.id,is_freeform:false,price:useNet?item.priceAfterDiscount:item.unitPrice,tax_included:false,tax_rate_override:item.taxPercent,quantity:item.quantity,note:[item.deliveryDate?'Ngày giao: '+item.deliveryDate:'',useNet?'Gia goc: '+item.unitPrice:'',useNet&&item.discountPercent?'CK: '+item.discountPercent+'%':'',useNet&&item.discountAmount?'CK tien: '+item.discountAmount:'',item.printFee?'Phi in: '+item.printFee:'',useNet?'Don gia sau CK+phi in: '+item.priceAfterDiscount:'',item.pricePolicy?'Gia: '+item.pricePolicy:'',item.cartons?'So thung: '+item.cartons:'',item.weightKg?'Kg: '+item.weightKg:'',item.imageUrl?'Anh: '+item.imageUrl:''].filter(Boolean).join('; '),discount_items:useNet?[]:discountItems(item)});
}

async function verifyOrder(env,id,request,cfg){return (await api(env,'/orders/'+encodeURIComponent(id)+'.json',{},request,cfg)).order;}
async function ensureOrderCode(env,orderId,quote,request,cfg){
 let order=await verifyOrder(env,orderId,request,cfg);
 if(order.code===quote&&order.reference_number===quote)return order;
 await api(env,'/orders/'+encodeURIComponent(orderId)+'.json',{method:'PUT',body:JSON.stringify({order:{id:orderId,code:quote,reference_number:quote}})},request,cfg);
 order=await verifyOrder(env,orderId,request,cfg);
 if(order.code!==quote||order.reference_number!==quote)throw new QuotationError(502,'Sapo đã lưu đơn nhưng chưa giữ đúng số báo giá.');
 return order;
}

function orderSummary(order){return order?{id:order.id,code:order.code,reference_number:order.reference_number,status:order.status,location_id:order.location_id,source_id:order.source_id,customer_id:order.customer_id||null,total:order.total,total_tax:order.total_tax,line_count:(order.order_line_items||[]).length}:null;}

function message(result){
 const code=result.order?.code||result.order?.reference_number||result.quote;
 if(result.action==='existing')return 'Đơn nháp Sapo đã có sẵn: '+code;
 return 'Đã tạo đơn nháp Sapo: '+code;
}

export async function sendSapoCopy(payload,request=fetch,env={}){
 if(!payload||typeof payload!=='object')throw new QuotationError(400,'Dữ liệu báo giá không hợp lệ.');
 const quote=pickQuote(payload),cfg=config(env),customerInput=normalizeCustomer(payload),items=normalizeItems(payload),requestId=clean(payload.request_id||payload.idempotency_key||quote);
 if(!customerInput.name&&!customerInput.phone&&!customerInput.email&&!customerInput.customer_code)throw new QuotationError(400,'Vui lòng nhập khách hàng trước khi copy Sapo.');
 const dryRun=payload.test===true||payload.dry_run===true||payload.dryRun===true;
 if(dryRun)return {accepted:true,ok:true,status:'dry_run',message:'Dry run Sapo direct ok.',result:{quote,line_count:items.length}};
 const existing=await findExisting(env,quote,requestId,request,cfg);
 if(existing){
  const verified=existing.id?await verifyOrder(env,existing.id,request,cfg):existing,result={ok:true,action:'existing',quote,order:orderSummary(verified)};
  return {accepted:true,ok:true,status:'existing',message:message(result),sapoOrderId:verified.id||'',sapoOrderCode:verified.code||verified.reference_number||quote,sapoOrderUrl:sapoOrderUrl(env,verified.id),result};
 }
 const customer=await ensureCustomer(env,customerInput,request,cfg),responsibleAccount=await findResponsibleAccount(env,payload,request,cfg),accountId=responsibleAccount?.id||cfg.accountId,lineResults=[],lines=[];
 for(const item of items){const ensured=await ensureVariant(env,item,request,cfg);lineResults.push({sku:item.sku,action:ensured.action,product_id:ensured.product_id||ensured.variant.product_id,variant_id:ensured.variant.id});lines.push(buildLine(item,ensured.variant));}
 const order=compactObject({code:quote,reference_number:quote,operation_system:'web',location_id:cfg.locationId,source_id:cfg.sourceId,source_name:'Khác',price_list_id:cfg.priceListId,account_id:accountId,assignee_id:accountId,customer_id:customer.customer.id,tax_treatment:'inclusive',status:'draft',create_invoice:false,note:truncate(['OpenClaw tao don nhap ban hang draft tu web bao gia.','So bao gia: '+quote+'.',clean(payload.quote_type||payload.order?.quote_type)?'Loai: '+clean(payload.quote_type||payload.order?.quote_type)+'.':'',requestId?'Request: '+requestId+'.':'',clean(payload.responsible)?'NV phu trach: '+clean(payload.responsible)+(clean(payload.responsible_phone)?' - '+clean(payload.responsible_phone):'')+'.':'',customerInput.name?'Khach: '+customerInput.name+(customerInput.tax_code?' MST '+customerInput.tax_code:'')+'.':'','Tong web: truoc VAT '+number(payload.subtotal)+', VAT '+number(payload.vat_amount)+', tong '+number(payload.total)+'.'].filter(Boolean).join(' '),500),tags:['OpenClaw','web-bao-gia',clean(payload.quote_type||payload.order?.quote_type),quote,'VIGIFTS'].filter(Boolean),order_line_items:lines,order_discount_rate:0,order_discount_value:0,order_discount_amount:0,discount_items:[]});
 const attempts=[{body:{order}},{body:{order:{...order,line_items:order.order_line_items}}},{body:order},{body:{...order,line_items:order.order_line_items}}],errors=[];
 for(const attempt of attempts){
  try{
   const body=await api(env,'/orders.json',{method:'POST',body:JSON.stringify(attempt.body),headers:{'x-sapo-requestid':sapoId()}},request,cfg),created=body.order||body;
   if(!created?.id)throw new QuotationError(502,'Sapo chưa xác nhận mã đơn hàng.');
   const verified=await ensureOrderCode(env,created.id,quote,request,cfg);
   const result={ok:true,action:'created',quote,customer:{action:customer.action,id:customer.customer.id,name:customer.customer.name},products:lineResults,order:orderSummary(verified),errors};
   return {accepted:true,ok:true,status:'created',message:message(result),sapoOrderId:verified.id||'',sapoOrderCode:verified.code||verified.reference_number||quote,sapoOrderUrl:sapoOrderUrl(env,verified.id),result};
  }catch(error){
   errors.push({status:error.status||null,message:error.message});
   const maybeCreated=await findExisting(env,quote,requestId,request,cfg);
   if(maybeCreated){const verified=await verifyOrder(env,maybeCreated.id,request,cfg),result={ok:true,action:'created_after_error',quote,customer:{action:customer.action,id:customer.customer.id,name:customer.customer.name},products:lineResults,order:orderSummary(verified),errors};return {accepted:true,ok:true,status:'created',message:message(result),sapoOrderId:verified.id||'',sapoOrderCode:verified.code||verified.reference_number||quote,sapoOrderUrl:sapoOrderUrl(env,verified.id),result};}
  }
 }
 throw new QuotationError(502,'Không tạo được đơn nháp Sapo. Kiểm tra Sapo trước khi thử lại để tránh tạo trùng.');
}
