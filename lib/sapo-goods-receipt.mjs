import {QuotationError} from './quotation-store.mjs';
import {clean,number,normalize,compactObject,sapoAdminRequest,sapoId,sapoPurchaseOrderUrl} from './sapo-admin.mjs';

const config=env=>({priceListId:number(env.SAPO_PURCHASE_PRICE_LIST_ID||env.SAPO_PRICE_LIST_ID,146549)});
const idNumber=(value,label)=>{const text=clean(value);if(!text)return null;if(!/^\d+$/.test(text))throw new QuotationError(400,label+' không hợp lệ.');return Number(text);};
const collator=new Intl.Collator('vi',{sensitivity:'base',numeric:true});

async function api(env,path,options,request){return sapoAdminRequest(env,path,{...options,referer:`${(env.SAPO_ADMIN_BASE||'https://bachngankiengiang.mysapogo.com/admin').replace(/\/$/,'')}/purchase_orders`},request);}

function dedupeAndSortOptions(records,nameGetter){
 const byId=new Set(),byName=new Set(),options=[];
 for(const record of records){
  const id=clean(record?.id),name=clean(nameGetter(record||{}));
  if(!id||!name)continue;
  const nameKey=normalize(name);if(byId.has(id)||byName.has(nameKey))continue;
  byId.add(id);byName.add(nameKey);options.push({id,name});
 }
 return options.sort((a,b)=>collator.compare(a.name,b.name)||String(a.id).localeCompare(String(b.id)));
}

async function fetchAll(env,path,rootKey,request){
 const all=[];
 for(let page=1;page<=100;page+=1){
  const sep=path.includes('?')?'&':'?',body=await api(env,path+sep+'limit=250&page='+page,{},request),batch=Array.isArray(body[rootKey])?body[rootKey]:[];
  all.push(...batch);
  const total=number(body.total??body.count??body.metadata?.total,0);
  if(batch.length<250||(total>0&&all.length>=total))break;
 }
 return all;
}

export async function loadSapoGoodsReceiptOptions(request=fetch,env={}){
 const [suppliersRaw,accountsRaw]=await Promise.all([fetchAll(env,'/suppliers.json','suppliers',request),fetchAll(env,'/accounts.json','accounts',request)]);
 const activeAccounts=accountsRaw.filter(account=>{const status=clean(account.status).toLowerCase();return !status||status==='active';});
 return {ok:true,suppliers:dedupeAndSortOptions(suppliersRaw,supplier=>supplier.name||supplier.full_name||supplier.company_name||supplier.code),employees:dedupeAndSortOptions(activeAccounts,account=>account.full_name||account.name||account.email||account.code)};
}

function validateDate(value){
 const date=clean(value);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(date+'T00:00:00Z').getTime()))throw new QuotationError(400,'Ngày nhập không hợp lệ.');
 return date;
}

function normalizePayload(payload){
 const body=payload?.body&&typeof payload.body==='object'?payload.body:payload;
 if(!body||body.action!=='create_purchase_receipt')throw new QuotationError(400,'Yêu cầu tạo phiếu nhập Sapo không hợp lệ.');
 const ticketNumber=clean(body.ticket_number),warehouseName=clean(body.warehouse_name),supplierName=clean(body.supplier_name),employeeName=clean(body.employee_name);
 if(!ticketNumber||!supplierName||!warehouseName||!employeeName)throw new QuotationError(400,'Vui lòng kiểm tra mã phiếu, nhà cung cấp, kho nhận và nhân viên tạo.');
 const items=(Array.isArray(body.items)?body.items:[]).map((item,index)=>({sku:clean(item.sku||item.barcode||item.code),name:clean(item.name||item.product_name||item.title),quantity:number(item.quantity??item.qty),unit:clean(item.unit||item.dvt),import_price:0,index:index+1})).filter(item=>item.sku||item.quantity>0);
 if(!items.length||items.length>500)throw new QuotationError(400,'Danh sách hàng nhập Sapo không hợp lệ.');
 for(const item of items){if(!item.sku)throw new QuotationError(400,'Dòng hàng thiếu SKU.');if(!(item.quantity>0))throw new QuotationError(400,'Số lượng nhập phải lớn hơn 0.');}
 const totalQuantity=number(body.total_quantity,items.reduce((sum,item)=>sum+item.quantity,0));
 if(!(totalQuantity>0)||totalQuantity>1e12)throw new QuotationError(400,'Tổng số lượng nhập không hợp lệ.');
 return {action:body.action,ticket_number:ticketNumber,supplier_id:idNumber(body.supplier_id,'Mã NCC'),supplier_name:supplierName,warehouse_name:warehouseName,employee_id:idNumber(body.employee_id,'Mã nhân viên'),employee_name:employeeName,receipt_date:validateDate(body.receipt_date),total_quantity:totalQuantity,source:clean(body.source||'quote_web'),dry_run:body.dry_run===true||body.test===true,items};
}

async function findLocation(env,name,request){
 const body=await api(env,'/locations.json?limit=250',{},request),locations=body.locations||[],target=normalize(name);
 const exact=locations.filter(location=>[location.name,location.label,location.full_name,location.code].map(normalize).includes(target));
 if(exact.length===1)return exact[0];if(exact.length>1)throw new QuotationError(409,'Kho nhận bị trùng trên Sapo: '+name);
 const contains=locations.filter(location=>normalize(location.name||location.label||'').includes(target));
 if(contains.length===1)return contains[0];
 throw new QuotationError(404,'Không tìm thấy kho nhận trên Sapo: '+name);
}

async function findSupplier(env,name,request){
 const candidates=[];
 for(const query of [...new Set([name,normalize(name)].filter(Boolean))]){const body=await api(env,'/suppliers.json?query='+encodeURIComponent(query)+'&limit=50',{},request);candidates.push(...(body.suppliers||[]));}
 const suppliers=[...new Map(candidates.map(supplier=>[String(supplier.id),supplier])).values()],target=normalize(name);
 const exact=suppliers.filter(supplier=>[supplier.name,supplier.code,supplier.supplier_code,supplier.tax_code].map(normalize).includes(target));
 if(exact.length===1)return exact[0];if(exact.length>1)throw new QuotationError(409,'Nhà cung cấp bị trùng trên Sapo: '+name);
 const contains=suppliers.filter(supplier=>normalize(supplier.name||'').includes(target));
 if(contains.length===1)return contains[0];
 throw new QuotationError(404,'Không tìm thấy NCC trên Sapo: '+name);
}

async function findAccount(env,name,request){
 const body=await api(env,'/accounts.json?limit=250',{},request),accounts=(body.accounts||[]).filter(account=>!clean(account.status)||clean(account.status).toLowerCase()==='active'),target=normalize(name);
 const exact=accounts.filter(account=>[account.full_name,account.name,account.email,account.code].map(normalize).includes(target));
 if(exact.length===1)return exact[0];
 const contains=accounts.filter(account=>normalize(account.full_name||account.name||account.email||'').includes(target));
 return contains.length===1?contains[0]:null;
}

async function findVariant(env,sku,locationId,request){
 const body=await api(env,'/variants/search.json?query='+encodeURIComponent(sku)+'&limit=20&location_id='+encodeURIComponent(locationId),{},request),target=clean(sku).toUpperCase();
 const exact=(body.variants||[]).filter(variant=>clean(variant.sku).toUpperCase()===target||clean(variant.barcode).toUpperCase()===target);
 if(exact.length>1)throw new QuotationError(409,'SKU bị trùng trên Sapo: '+sku);
 if(!exact.length)throw new QuotationError(404,'Không tìm thấy SKU trên Sapo: '+sku);
 return exact[0];
}

async function findExisting(env,ticketNumber,request){
 const body=await api(env,'/purchase_orders.json?query='+encodeURIComponent(ticketNumber)+'&limit=50',{},request);
 return (body.purchase_orders||[]).find(po=>clean(po.code)===ticketNumber||[po.code,po.name,po.note,po.reference_number].filter(Boolean).join(' ').includes(ticketNumber))||null;
}

function summarizePo(env,po,receipt,message){
 return {ok:true,message,sapoReceiptId:receipt?.id||po?.id||'',sapoReceiptCode:receipt?.code||po?.code||'',sapoReceiptUrl:po?.id?sapoPurchaseOrderUrl(env,po.id):'',result:{purchase_order:po||null,receipt:receipt||null}};
}

export async function sendSapoGoodsReceipt(payload,request=fetch,env={}){
 const input=normalizePayload(payload),cfg=config(env),existing=await findExisting(env,input.ticket_number,request);
 if(existing)return summarizePo(env,existing,null,'Phiếu nhập Sapo đã có sẵn, không tạo trùng.');
 const location=await findLocation(env,input.warehouse_name,request),supplier=input.supplier_id?{id:input.supplier_id,name:input.supplier_name}:await findSupplier(env,input.supplier_name,request),account=input.employee_id?{id:input.employee_id,full_name:input.employee_name}:await findAccount(env,input.employee_name,request);
 const lines=[];
 for(const item of input.items){
  const variant=await findVariant(env,item.sku,location.id,request);
  lines.push({product_id:variant.product_id,variant_id:variant.id,title:variant.name||item.name||item.sku,sku:variant.sku||item.sku,quantity:item.quantity,price:0,applied_discount:null,tax_lines:[{rate:0,title:null}],note:item.name&&item.name!==variant.name?item.name:null,product_type:'normal',serials:[],lots_dates:[],packsize:false,pack_size_quantity:0,pack_size_root_id:null});
 }
 if(input.dry_run)return {ok:true,message:'Dry run Sapo direct ok.',sapoReceiptId:'',sapoReceiptCode:'',sapoReceiptUrl:'',matched:{warehouse_id:location.id,supplier_id:supplier?.id||null,account_id:account?.id||null,item_count:lines.length}};
 const note=['OpenClaw Quote Web goods receipt.','source='+input.source,'ticket_number='+input.ticket_number,'receipt_date='+input.receipt_date,input.supplier_id?'supplier_id='+input.supplier_id:'',input.supplier_name?'supplier_name='+input.supplier_name:'',input.employee_id?'employee_id='+input.employee_id:'',input.employee_name?'employee_name='+input.employee_name:'','import_price=0 per line'].filter(Boolean).join(' | ');
 const purchase_order=compactObject({code:input.ticket_number,location_id:location.id,supplier_id:supplier?.id||null,account_id:account?.id||undefined,assignee_id:account?.id||undefined,line_items:lines,note,tags:['quote_web','openclaw_zero_import_price'],price_list_id:cfg.priceListId,taxes_included:false});
 const createdBody=await api(env,'/purchase_orders.json',{method:'POST',body:JSON.stringify({purchase_order}),headers:{'x-sapo-requestid':sapoId()}},request),created=createdBody.purchase_order||createdBody;
 if(!created.id)throw new QuotationError(502,'Sapo đã nhận tạo phiếu nhưng chưa trả ID phiếu.');
 if(created.status!=='active')await api(env,'/purchase_orders/'+encodeURIComponent(created.id)+'/active.json',{method:'PUT',body:'{}'},request);
 const fetched=(await api(env,'/purchase_orders/'+encodeURIComponent(created.id)+'.json',{},request)).purchase_order||created;
 const receipt={received_on:input.receipt_date+'T00:00:00+07:00',line_items:(fetched.line_items||[]).map(item=>({line_item_id:item.id,accepted_quantity:item.quantity,landed_cost_allocation:0,note:null,serials:[],lots_dates:[]})),landed_cost_lines:[],landed_cost_allocation_method:'across_total_price',total_landed_costs:0,note:'Quote Web receipt date '+input.receipt_date+' / ticket '+input.ticket_number};
 const receiptBody=await api(env,'/purchase_orders/'+encodeURIComponent(created.id)+'/receipts.json',{method:'POST',body:JSON.stringify({receipt})},request),receiptResult=receiptBody.receipt||receiptBody;
 const finalPo=(await api(env,'/purchase_orders/'+encodeURIComponent(created.id)+'.json',{},request)).purchase_order||fetched;
 return summarizePo(env,finalPo,receiptResult,'Đã tạo phiếu nhập Sapo.');
}
