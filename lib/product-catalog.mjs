import {storeInlineProductImage} from './r2-media.mjs';
import '../public/supplier-progress.js';
import {QuotationError} from './quotation-store.mjs';
export const stockInteger=n=>n===null?null:Math.sign(n)*Math.floor(Math.abs(n)+0.5);
const quoteWebWarehouses=['MINH LONG - LOCKNLOCK CẦN THƠ','KHO VIGIFTS','NCC','Hàng chờ về'];
function quoteWebWarehouseIndices(data){
  const allowed=new Set(quoteWebWarehouses);
  return data.warehouses.flatMap((warehouse,index)=>allowed.has(warehouse)?[index]:[]);
}
function filterQuoteWebWarehouses(data){
  const indices=quoteWebWarehouseIndices(data);
  data.warehouses=indices.map(index=>data.warehouses[index]);
  data.products=data.products.map(product=>({...product,stock:indices.map(index=>product.stock[index])}));
  return data;
}
function validateCatalog(data){
  const bad=()=>{throw new QuotationError(400,'Danh mục sản phẩm không hợp lệ.');};

  if(data.format!=='sapo-catalog-v1'||!Array.isArray(data.products)||!data.products.length||data.products.length>50000||!Array.isArray(data.warehouses)||!(data.warehouses.filter(w=>!['NCC','Hàng chờ về'].includes(w)).length===4&&data.warehouses.length<=6)||!Array.isArray(data.pricePolicies)||data.pricePolicies.length>30||!Number.isFinite(Date.parse(data.observedAt)))bad();
  const strings=(xs,max)=>xs.every(x=>typeof x==='string'&&x.length>0&&x.length<=max);
  if(!strings(data.warehouses,200)||!strings(data.pricePolicies,200)||new Set(data.warehouses).size!==data.warehouses.length||new Set(data.pricePolicies).size!==data.pricePolicies.length)bad();
  const skus=new Set();
  for(const p of data.products){
    for(const k of ['perCarton','cartonWeight','cartonLength','cartonWidth','cartonHeight'])if(p[k]!==undefined&&(!Number.isFinite(p[k])||p[k]<0||p[k]>1e6))bad();
    if(!strings([p.sku,p.name],2000)||skus.has(p.sku))bad();skus.add(p.sku);
    if(!['unit','brand','pattern','image','taxBasis'].every(k=>typeof p[k]==='string'&&p[k].length<=4000))bad();
    if(p.image){let u;try{u=new URL(p.image)}catch{bad()}if(u.protocol!=='https:'||!['sapo.dktcdn.net','bizweb.dktcdn.net'].includes(u.hostname))bad();}
    if(!Array.isArray(p.prices)||p.prices.length!==data.pricePolicies.length||!p.prices.every(n=>n===null||typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e12))bad();
    if(!Array.isArray(p.stock)||p.stock.length!==data.warehouses.length||!p.stock.every(n=>n===null||typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e12))bad();
    if(![p.taxIn,p.taxOut].every(n=>n===null||typeof n==='number'&&n>=0&&n<=100)||typeof p.taxable!=='boolean')bad();
  }
}
export async function replaceCatalog(bucket,data){
  validateCatalog(data);
  data={...data,products:data.products.map(p=>({...p,stock:p.stock.map(stockInteger)}))};
  const key=`catalogs/${crypto.randomUUID()}.json`;
  await bucket.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
  await bucket.put('catalogs/current.json',JSON.stringify({key,count:data.products.length,observedAt:data.observedAt}));
  return {count:data.products.length,key,observedAt:data.observedAt};
}
export async function catalogData(bucket,db){
  const pointer=await bucket?.get('catalogs/current.json');
  if(!pointer)throw new QuotationError(503,'Danh mục Sapo đang được cập nhật. Vui lòng thử lại sau.');
  const {key}=await pointer.json(),obj=await bucket.get(key);
  if(!obj)throw new QuotationError(503,'Không đọc được danh mục sản phẩm.');
  const data=await obj.json();
  // NCC is maintained on the website; legacy Sapo exports still contain four warehouses.
  for(const warehouse of ['NCC','Hàng chờ về'])if(!data.warehouses.includes(warehouse)){data.warehouses.push(warehouse);data.products=data.products.map(p=>({...p,stock:[...p.stock,null]}));}
  data.catalogKey=key;data.stockRevision=0;data.editRevision=0;
  const latest=db?await db.prepare('SELECT * FROM stock_imports ORDER BY revision DESC LIMIT 1').first():null;
  if(latest){const snapshot=await bucket.get(latest.key);if(!snapshot)throw new QuotationError(503,'Không đọc được tồn kho cập nhật.');const inventory=await snapshot.json(),map=new Map(inventory.rows.map(r=>[r.sku.toLowerCase(),r.stock]));data.products=data.products.map(p=>({...p,stock:data.warehouses.map((w,i)=>Object.hasOwn(map.get(p.sku.toLowerCase())||{},w)?map.get(p.sku.toLowerCase())[w]:p.stock[i])}));data.stockRevision=latest.revision;data.stockUpdatedAt=latest.created_at;data.stockObservedAt=latest.observed_at;data.stockFilename=latest.filename;data._inventory=map;}
  if(db){const rows=await db.prepare('SELECT * FROM product_edits').all();const map=new Map(data.products.map(p=>[p.sku.toLowerCase(),p]));for(const row of rows.results){data.editRevision+=row.revision;const edit=JSON.parse(row.data),base=map.get(row.sku)||{};const imported=data._inventory?.get(row.sku)||{};const stock=latest&&row.updated_at<=latest.created_at?{...edit.stock,...imported}:edit.stock;map.set(row.sku,{...base,...edit.fields,prices:data.pricePolicies.map((n,i)=>Object.hasOwn(edit.prices,n)?edit.prices[n]:(base.prices?.[i]??null)),stock:data.warehouses.map((n,i)=>Object.hasOwn(stock,n)?stock[n]:(base.stock?.[i]??null)),revision:row.revision,source:edit.source});}data.products=[...map.values()];}
  data.products=data.products.map(p=>({...p,stock:p.stock.map(stockInteger)}));
  const incomingObject=await bucket.get(incomingIndexKey),incomingIndex=incomingObject?await incomingObject.json():{shipments:[]},incomingTotals=new Map(),receivedTotals=new Map();
  for(const shipment of incomingIndex.shipments||[]){
   // Older tickets predate stockRows in the index. Read their saved detail so they
   // remain included in the Hàng chờ về balance without requiring re-entry.
   let stockRows=shipment.stockRows;
   if(!Array.isArray(stockRows)&&shipment.key){const object=await bucket.get(shipment.key),saved=object?await object.json():null;stockRows=(saved?.rows||[]).filter(row=>!isPrintLogoRow(row)).map(row=>({sku:row.sku,quantity:row.quantity}));}
   for(const row of stockRows||[]){
    const sku=String(row.sku||'').toLowerCase(),quantity=stockInteger(Number(row.quantity)||0);if(!sku||quantity<=0)continue;
    const syncedRows=new Set(Array.isArray(shipment.stockSyncedRows)?shipment.stockSyncedRows:[]);
    if(shipment.receivedAt&&!shipment.stockSyncedAt&&data.warehouses.includes(shipment.receivedWarehouse)&&!syncedRows.has(receivedStockRowKey(shipment.receivedWarehouse,sku))){
     const totals=receivedTotals.get(shipment.receivedWarehouse)||new Map();totals.set(sku,(totals.get(sku)||0)+quantity);receivedTotals.set(shipment.receivedWarehouse,totals);
    }else if(!shipment.receivedAt&&shipment.approvalStatus!=='pending')incomingTotals.set(sku,(incomingTotals.get(sku)||0)+quantity);
   }
  }
  const incomingColumn=data.warehouses.indexOf('Hàng chờ về');
  data.products=data.products.map(product=>{const incomingQuantity=incomingTotals.get(product.sku.toLowerCase())||0,stock=[...product.stock];if(incomingQuantity)stock[incomingColumn]=(stock[incomingColumn]||0)+incomingQuantity;for(const [warehouse,totals] of receivedTotals){const quantity=totals.get(product.sku.toLowerCase())||0;if(quantity){const column=data.warehouses.indexOf(warehouse);stock[column]=(stock[column]||0)+quantity;}}return {...product,stock,incomingQuantity};});
  delete data._inventory;
  return data;
}
export async function readCatalog(bucket,role,db){
  const data=await catalogData(bucket,db);
  delete data.catalogKey;delete data.editRevision;
  filterQuoteWebWarehouses(data);
  return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
}

function auditSample(product,extra={}){
 return {sku:product.sku,name:product.name,brand:product.brand||'',unit:product.unit||'',...extra};
}

export async function auditCatalog(db,bucket,options={}){
 const sku=String(options.sku||'').trim().toLowerCase();
 const data=await catalogData(bucket,db),quoteIndices=quoteWebWarehouseIndices(data),pricePolicy=data.pricePolicies[0]||'',products=data.products||[];
 const missingPackaging=[],missingPrice=[],negativeStock=[],zeroStock=[];
 for(const product of products){
  const stocks=quoteIndices.map(index=>Number(product.stock?.[index])).filter(Number.isFinite),totalStock=stocks.reduce((sum,value)=>sum+value,0);
  const hasNegative=stocks.some(value=>value<0),hasPrice=(product.prices||[]).some(value=>Number(value)>0);
  const hasPacking=Number(product.perCarton)>0&&Number(product.cartonLength)>0&&Number(product.cartonWidth)>0&&Number(product.cartonHeight)>0;
  if(!hasPacking&&missingPackaging.length<80)missingPackaging.push(auditSample(product));
  if(!hasPrice&&missingPrice.length<80)missingPrice.push(auditSample(product));
  if(hasNegative&&negativeStock.length<80)negativeStock.push(auditSample(product,{stock:Object.fromEntries(quoteIndices.map(index=>[data.warehouses[index],product.stock?.[index]??null]))}));
  if(totalStock<=0&&zeroStock.length<80)zeroStock.push(auditSample(product));
 }
 const editCount=await db.prepare('SELECT COUNT(*) AS count FROM product_edits').first(),stockRows=await db.prepare('SELECT revision,key,filename,observed_at AS observedAt,created_at AS createdAt,created_by AS createdBy,count FROM stock_imports ORDER BY revision DESC LIMIT 20').all();
 const incomingObject=await bucket.get(incomingIndexKey),incomingIndex=incomingObject?await incomingObject.json():{shipments:[]},shipments=Array.isArray(incomingIndex.shipments)?incomingIndex.shipments:[];
 const unsyncedReceived=shipments.filter(shipment=>shipment.receivedAt&&!shipment.stockSyncedAt).slice(0,80).map(shipment=>({id:shipment.id,ticketNumber:shipment.ticketNumber,warehouse:shipment.receivedWarehouse||shipment.warehouse,receivedAt:shipment.receivedAt,rows:Array.isArray(shipment.stockRows)?shipment.stockRows.length:null,syncedRows:Array.isArray(shipment.stockSyncedRows)?shipment.stockSyncedRows.length:0}));
 const summary={products:products.length,warehouses:data.warehouses,pricePolicies:data.pricePolicies,pricePolicy,stockRevision:data.stockRevision,stockUpdatedAt:data.stockUpdatedAt||'',stockObservedAt:data.stockObservedAt||data.observedAt||'',stockFilename:data.stockFilename||'',productEdits:editCount?.count||0,missingPackagingCount:products.filter(product=>!(Number(product.perCarton)>0&&Number(product.cartonLength)>0&&Number(product.cartonWidth)>0&&Number(product.cartonHeight)>0)).length,missingPriceCount:products.filter(product=>!(product.prices||[]).some(value=>Number(value)>0)).length,negativeStockCount:products.filter(product=>quoteIndices.some(index=>Number(product.stock?.[index])<0)).length,zeroStockCount:products.filter(product=>quoteIndices.reduce((sum,index)=>sum+(Number(product.stock?.[index])||0),0)<=0).length,incomingShipments:shipments.filter(shipment=>!shipment.receivedAt&&shipment.approvalStatus!=='pending').length,pendingSupplierOrders:shipments.filter(shipment=>shipment.source==='supplier-order'&&shipment.approvalStatus==='pending'&&!shipment.receivedAt).length,approvedSupplierOrders:shipments.filter(shipment=>shipment.source==='supplier-order'&&shipment.approvalStatus==='approved'&&!shipment.receivedAt).length,unsyncedReceivedCount:shipments.filter(shipment=>shipment.receivedAt&&!shipment.stockSyncedAt).length};
 const result={summary,samples:{missingPackaging,missingPrice,negativeStock,zeroStock},unsyncedReceived,stockImports:stockRows.results||[]};
 if(sku){
  const product=products.find(item=>item.sku.toLowerCase()===sku)||products.find(item=>item.sku.toLowerCase().includes(sku));
  if(product){
   const edit=await db.prepare('SELECT sku,data,revision,updated_at AS updatedAt,updated_by AS updatedBy FROM product_edits WHERE sku=?').bind(product.sku.toLowerCase()).first();
   const stockHistory=[];
   for(const row of stockRows.results||[]){
    const object=await bucket.get(row.key);if(!object)continue;
    const saved=await object.json(),item=(saved.rows||[]).find(entry=>String(entry.sku||'').toLowerCase()===product.sku.toLowerCase());
    if(item)stockHistory.push({revision:row.revision,filename:row.filename,observedAt:row.observedAt,createdAt:row.createdAt,createdBy:row.createdBy,stock:item.stock||{}});
   }
   const relatedShipments=[];
   for(const shipment of shipments){
    const rows=await shipmentRows(bucket,shipment),found=rows.find(row=>String(row.sku||'').toLowerCase()===product.sku.toLowerCase());
    if(found&&relatedShipments.length<40)relatedShipments.push({id:shipment.id,ticketNumber:shipment.ticketNumber,warehouse:shipment.receivedWarehouse||shipment.warehouse,arrivalDate:shipment.arrivalDate,quantity:found.quantity,source:shipment.source,status:shipment.receivedAt?'received':shipment.approvalStatus==='pending'?'pending':'incoming',supplierStatus:shipment.supplierStatus||'',receivedAt:shipment.receivedAt||'',stockSyncedAt:shipment.stockSyncedAt||'',rowSynced:Array.isArray(shipment.stockSyncedRows)&&shipment.stockSyncedRows.includes(receivedStockRowKey(shipment.receivedWarehouse||shipment.warehouse,product.sku))});
   }
   result.sku={product:auditSample(product,{stock:Object.fromEntries(data.warehouses.map((warehouse,index)=>[warehouse,product.stock?.[index]??null])),prices:Object.fromEntries(data.pricePolicies.map((policy,index)=>[policy,product.prices?.[index]??null])),perCarton:product.perCarton||null,cartonWeight:product.cartonWeight||null,cartonLength:product.cartonLength||null,cartonWidth:product.cartonWidth||null,cartonHeight:product.cartonHeight||null,source:product.source||''}),edit:edit?{...edit,data:undefined,source:JSON.parse(edit.data||'{}').source||''}:null,stockHistory,relatedShipments};
  }else result.sku={notFound:sku};
 }
 return result;
}

export async function saveProduct(db,bucket,body,member,creating){
  const fail=(status,message)=>{throw new QuotationError(status,message);};
  const data=await catalogData(bucket,db),input=body.product;
  if(!input||typeof input.sku!=='string')fail(400,'Vui lòng nhập mã SKU.');
  if(data.stockRevision&&(body.stockRevision!==data.stockRevision))fail(409,'Tồn kho vừa cập nhật. Vui lòng tải lại trang trước khi sửa sản phẩm.');
  const sku=input.sku.trim(),key=sku.toLowerCase(),existing=data.products.find(p=>p.sku.toLowerCase()===key);
  if(creating&&existing)fail(409,'SKU đã tồn tại. Vui lòng dùng nút Cập nhật.');
  if(!creating&&!existing)fail(404,'Không tìm thấy sản phẩm.');
  if(!creating&&body.revision!==(existing.revision||0))fail(409,'Sản phẩm vừa được người khác cập nhật. Đóng form và tải lại danh mục trước khi sửa.');
  const fields={sku:existing?.sku||sku};
  for(const k of ['name','unit','brand','pattern','image','taxBasis'])fields[k]=typeof input[k]==='string'?input[k].trim():'';
  for(const k of ['taxable','taxIn','taxOut','perCarton','cartonWeight','cartonLength','cartonWidth','cartonHeight'])fields[k]=input[k];
  if(!fields.name||fields.sku.length>200)fail(400,'Nhập tên sản phẩm và SKU tối đa 200 ký tự.');
  if(fields.image.length>700000||fields.image&&!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(fields.image)&&!/^https:\/\//.test(fields.image))fail(400,'Ảnh cần là đường dẫn HTTPS hoặc ảnh tải lên dưới 500 KB.');
  const allowed=data.warehouses.filter(w=>quoteWebWarehouses.includes(w));
  const prices=input.prices,stock=input.stock?{...input.stock}:input.stock;
  if(!prices||Array.isArray(prices)||!stock||Array.isArray(stock)||Object.keys(stock).some(w=>!allowed.includes(w))||Object.keys(prices).some(n=>!data.pricePolicies.includes(n)))fail(400,'Chính sách giá hoặc kho không hợp lệ.');
  for(const n of data.pricePolicies)if(!Object.hasOwn(prices,n))fail(400,'Thiếu chính sách giá.');
  for(const n of allowed)if(!['NCC','Hàng chờ về'].includes(n)&&!Object.hasOwn(stock,n))fail(400,'Thiếu thông tin kho.');
  validateCatalog({...data,products:[{...fields,image:'',prices:data.pricePolicies.map(n=>prices[n]),stock:data.warehouses.map(n=>stock[n]??null)}]});
  for(const key of Object.keys(stock))stock[key]=stockInteger(stock[key]);
  if(Object.hasOwn(stock,'Hàng chờ về')&&existing?.incomingQuantity){if(stock['Hàng chờ về']<existing.incomingQuantity)fail(400,'Số hàng chờ về không được thấp hơn số lượng trên các phiếu. Vui lòng chỉnh phiếu hàng chờ về.');stock['Hàng chờ về']-=existing.incomingQuantity;}

  const previous=await db.prepare('SELECT data FROM product_edits WHERE sku=?').bind(key).first();
  const old=previous?JSON.parse(previous.data):{};
  // Product refreshes from Sapo do not carry carton data. Keep a stored carton
  // specification when an otherwise valid product update sends every value as 0.
  const packingFields=['perCarton','cartonWeight','cartonLength','cartonWidth','cartonHeight'];
  const incomingPackingIsEmpty=packingFields.every(name=>Number(fields[name])===0);
  const savedPacking=(old.fields&&packingFields.some(name=>Number(old.fields[name])>0))?old.fields:{};
  if(incomingPackingIsEmpty)for(const name of packingFields)if(Number(savedPacking[name])>0)fields[name]=savedPacking[name];
  fields.image=await storeInlineProductImage(bucket,fields.image);
  const edit={fields,prices,stock:{...old.stock,...stock},source:old.source||(creating?'Web':'Sapo · cập nhật trên web')};
  const revision=(existing?.revision||0)+1,stamp=new Date().toISOString();
  const result=existing?.revision?await db.prepare('UPDATE product_edits SET data=?,revision=?,updated_at=?,updated_by=? WHERE sku=? AND revision=? AND (SELECT COALESCE(MAX(revision),0) FROM stock_imports)=?').bind(JSON.stringify(edit),revision,stamp,member.id,key,body.revision,data.stockRevision).run():await db.prepare('INSERT INTO product_edits (sku,data,revision,updated_at,updated_by) SELECT ?,?,1,?,? WHERE (SELECT COALESCE(MAX(revision),0) FROM stock_imports)=? ON CONFLICT DO NOTHING').bind(key,JSON.stringify(edit),stamp,member.id,data.stockRevision).run();
  if(!result.meta.changes)fail(409,'Sản phẩm đã thay đổi. Vui lòng tải lại danh mục.');
  return {sku:fields.sku,revision};
}

function cleanWebhookString(value){
 return String(value??'').trim();
}

function webhookNumber(value){
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);
 return Number.isFinite(n)?n:null;
}

function webhookPattern(product,variant){
 const productOptions=[product.opt1,product.opt2,product.opt3].map(cleanWebhookString);
 return [variant.opt1,variant.opt2,variant.opt3].map(cleanWebhookString).filter((value,index)=>value&&value!==productOptions[index]&&value!==product.name).join(' · ');
}

function webhookName(product,variant,sku){
 const base=cleanWebhookString(variant.name||variant.product_name||product.name||sku);
 return sku&&!base.includes(sku)?`${base} (${sku})`:base;
}

function webhookImage(product,variant){
 const sources=[...(Array.isArray(variant.images)?variant.images:[]),...(Array.isArray(product.images)?product.images:[])];
 for(const image of sources){
  const url=cleanWebhookString(image.full_path||image.src||image.url||image.path);
  if(url.startsWith('https://sapo.dktcdn.net/')||url.startsWith('https://bizweb.dktcdn.net/'))return url;
 }
 const url=cleanWebhookString(product.image_path||product.image);
 return url.startsWith('https://sapo.dktcdn.net/')||url.startsWith('https://bizweb.dktcdn.net/')?url:'';
}

function webhookPriceMap(data,variant,base){
 const prices={...base};
 const rows=Array.isArray(variant.variant_prices)?variant.variant_prices:Array.isArray(variant.prices)?variant.prices:[];
 for(const row of rows){
  const policy=cleanWebhookString(row.price_list_name||row.name||row.price_list?.name);
  const value=webhookNumber(row.value??row.price);
  if(policy&&data.pricePolicies.includes(policy))prices[policy]=value;
 }
 const retail=webhookNumber(variant.price??variant.retail_price??variant.retailPrice);
 if(retail!==null&&data.pricePolicies[0]&&!Object.hasOwn(prices,data.pricePolicies[0]))prices[data.pricePolicies[0]]=retail;
 return prices;
}

function webhookStockMap(data,variant,base){
 const stock={...base};
 for(const inventory of Array.isArray(variant.inventories)?variant.inventories:[]){
  const warehouse=cleanWebhookString(inventory.location_name||inventory.location?.name||inventory.location_label||inventory.warehouse||inventory.warehouse_name);
  const value=webhookNumber(inventory.available??inventory.on_hand??inventory.amount??inventory.quantity);
  if(warehouse&&data.warehouses.includes(warehouse)&&value!==null)stock[warehouse]=stockInteger(value);
 }
 return stock;
}

export async function upsertSapoProductWebhook(db,bucket,body){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Webhook sản phẩm Sapo không hợp lệ.');
 if(body.dry_run===true||body.test===true)return {ok:true,dryRun:true};
 const data=await catalogData(bucket,db),products=new Map(data.products.map(product=>[product.sku.toLowerCase(),product]));
 const sourceProducts=Array.isArray(body.products)?body.products:[body.product||body.data||body];
 const timestamp=new Date().toISOString(),changed=[],skipped=[],statements=[];
 for(const product of sourceProducts){
  if(!product||typeof product!=='object'||Array.isArray(product)){skipped.push({reason:'invalid_product'});continue;}
  if(cleanWebhookString(product.status)&&cleanWebhookString(product.status)!=='active'){skipped.push({id:product.id,reason:'inactive_product'});continue;}
  const variants=Array.isArray(product.variants)&&product.variants.length?product.variants:[product.variant||product];
  for(const variant of variants){
   if(!variant||typeof variant!=='object'||Array.isArray(variant)){skipped.push({id:product.id,reason:'invalid_variant'});continue;}
   if(cleanWebhookString(variant.status)&&cleanWebhookString(variant.status)!=='active'){skipped.push({id:variant.id,reason:'inactive_variant'});continue;}
   const sku=cleanWebhookString(variant.sku||variant.barcode||variant.code||product.sku||product.barcode);
   if(!sku||sku.length>200){skipped.push({id:variant.id||product.id,reason:'missing_sku'});continue;}
   const key=sku.toLowerCase(),existing=products.get(key),previous=await db.prepare('SELECT data,revision FROM product_edits WHERE sku=?').bind(key).first(),old=previous?JSON.parse(previous.data):{};
   const baseFields=old.fields||{};
   const fields={
    ...baseFields,
    sku:existing?.sku||sku,
    name:webhookName(product,variant,sku).slice(0,2000),
    unit:cleanWebhookString(variant.unit||product.unit||baseFields.unit),
    brand:cleanWebhookString(product.brand||variant.brand||baseFields.brand),
    pattern:webhookPattern(product,variant)||baseFields.pattern||'',
    image:webhookImage(product,variant)||baseFields.image||existing?.image||'',
    taxBasis:variant.tax_included?'Giá đã bao gồm thuế':(baseFields.taxBasis||existing?.taxBasis||''),
    taxable:typeof variant.taxable==='boolean'?variant.taxable:(baseFields.taxable??existing?.taxable??false),
    taxIn:webhookNumber(variant.input_vat_rate)??baseFields.taxIn??existing?.taxIn??null,
    taxOut:webhookNumber(variant.output_vat_rate)??baseFields.taxOut??existing?.taxOut??null,
    perCarton:baseFields.perCarton??existing?.perCarton??0,
    cartonWeight:baseFields.cartonWeight??existing?.cartonWeight??0,
    cartonLength:baseFields.cartonLength??existing?.cartonLength??0,
    cartonWidth:baseFields.cartonWidth??existing?.cartonWidth??0,
    cartonHeight:baseFields.cartonHeight??existing?.cartonHeight??0,
   };
   const basePrices=Object.fromEntries(data.pricePolicies.map((name,index)=>[name,old.prices&&Object.hasOwn(old.prices,name)?old.prices[name]:(existing?.prices?.[index]??null)]));
   const baseStock=Object.fromEntries(data.warehouses.map((name,index)=>[name,old.stock&&Object.hasOwn(old.stock,name)?old.stock[name]:(existing?.stock?.[index]??null)]));
   const edit={fields,prices:webhookPriceMap(data,variant,basePrices),stock:webhookStockMap(data,variant,baseStock),source:'Sapo webhook sản phẩm'};
   if(previous)statements.push(db.prepare('UPDATE product_edits SET data=?,revision=revision+1,updated_at=?,updated_by=? WHERE sku=?').bind(JSON.stringify(edit),timestamp,'sapo-webhook',key));
   else statements.push(db.prepare('INSERT INTO product_edits (sku,data,revision,updated_at,updated_by) VALUES (?,?,?,?,?) ON CONFLICT DO UPDATE SET data=excluded.data,revision=product_edits.revision+1,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(key,JSON.stringify(edit),1,timestamp,'sapo-webhook'));
   changed.push({sku,name:fields.name,existing:Boolean(existing)});
  }
 }
 if(!changed.length)fail(400,'Webhook Sapo không có SKU sản phẩm hợp lệ.');
 for(let index=0;index<statements.length;index+=50)await db.batch(statements.slice(index,index+50));
 return {ok:true,updated:changed.length,created:changed.filter(item=>!item.existing).length,changed:changed.slice(0,50),skipped:skipped.slice(0,50),updatedAt:timestamp};
}

export async function importStock(db,bucket,body,member,apply=false){
 const fail=(s,m)=>{throw new QuotationError(s,m);};
 if(member.role!=='manager')fail(403,'Chỉ Manager được cập nhật tồn kho bằng file.');
 const data=await catalogData(bucket,db);
 if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>50000||typeof body.filename!=='string'||body.filename.length>250||!Number.isFinite(Date.parse(body.observedAt)))fail(400,'File tồn kho không hợp lệ.');
 if(Date.parse(body.observedAt)>Date.now()+86400000)fail(400,'Ngày tồn kho không được ở tương lai.');
 if(Date.parse(body.observedAt)<Date.parse(data.stockObservedAt||data.observedAt))fail(409,'File cũ hơn dữ liệu tồn kho hiện có. Kiểm tra lại ngày báo cáo.');
 const products=new Map(data.products.map(p=>[p.sku.toLowerCase(),p])),acceptedBySku=new Map(),unknown=new Set(),samples=[],warehouses=new Set();let cells=0,duplicates=0;
 for(const row of body.rows){
  if(typeof row.sku!=='string'||!row.sku.trim()||row.sku.length>200||!row.stock||typeof row.stock!=='object'||Array.isArray(row.stock))fail(400,'Dòng sản phẩm không hợp lệ.');
  const key=row.sku.trim().toLowerCase();
  for(const [w,n]of Object.entries(row.stock))if(!data.warehouses.includes(w)||typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1e12)fail(400,'Kho hoặc số tồn không hợp lệ: '+row.sku);
  const product=products.get(key);if(!product){unknown.add(row.sku);continue;}
  if(!Object.keys(row.stock).length)continue;
  const roundedStock=Object.fromEntries(Object.entries(row.stock).map(([w,n])=>[w,stockInteger(n)]));
  const accepted=acceptedBySku.get(key);
  if(accepted){duplicates++;for(const [w,n]of Object.entries(roundedStock))if(!(w in accepted.stock)||n>accepted.stock[w])accepted.stock[w]=n;}
  else acceptedBySku.set(key,{sku:product.sku,stock:roundedStock});
 }
 const accepted=[...acceptedBySku.values()];
 for(const row of accepted){const product=products.get(row.sku.toLowerCase());for(const [w,n]of Object.entries(row.stock)){warehouses.add(w);cells++;if(samples.length<20)samples.push({sku:row.sku,name:product.name,warehouse:w,before:product.stock[data.warehouses.indexOf(w)],after:n});}}
 if(!accepted.length)fail(400,'Không có SKU và số tồn hợp lệ để cập nhật.');
 const version={stockRevision:data.stockRevision,editRevision:data.editRevision,catalogKey:data.catalogKey};
 const summary={matched:accepted.length,duplicates,unknownCount:unknown.size,unknown:[...unknown].slice(0,100),cells,warehouses:[...warehouses],samples,version};
 if(!apply)return summary;
 if(!body.version||Object.entries(version).some(([k,v])=>body.version[k]!==v))fail(409,'Danh mục vừa thay đổi. Vui lòng xem trước lại file.');
 const map=new Map(data.products.map(p=>[p.sku.toLowerCase(),{sku:p.sku,stock:Object.fromEntries(data.warehouses.map((w,i)=>[w,p.stock[i]]))}]));
 for(const row of accepted)Object.assign(map.get(row.sku.toLowerCase()).stock,row.stock);
 for(const product of data.products){const inventory=map.get(product.sku.toLowerCase()).stock;if(product.incomingQuantity){if(inventory['Hàng chờ về']<product.incomingQuantity)fail(400,'Số hàng chờ về không được thấp hơn số lượng trên phiếu: '+product.sku);inventory['Hàng chờ về']-=product.incomingQuantity;}}
 const key='inventory/'+crypto.randomUUID()+'.json',createdAt=new Date().toISOString();
 await bucket.put(key,JSON.stringify({rows:[...map.values()]}),{httpMetadata:{contentType:'application/json'}});
 const result=await db.prepare(`INSERT INTO stock_imports (revision,key,filename,observed_at,created_at,created_by,count) SELECT ?,?,?,?,?,?,? WHERE (SELECT COALESCE(MAX(revision),0) FROM stock_imports)=? AND (SELECT COALESCE(SUM(revision),0) FROM product_edits)=? ON CONFLICT DO NOTHING`).bind(data.stockRevision+1,key,body.filename,body.observedAt,createdAt,member.id,accepted.length,data.stockRevision,data.editRevision).run();
 if(!result.meta.changes)fail(409,'Dữ liệu vừa thay đổi. Xem trước lại file trước khi cập nhật.');
 await reconcileReceivedIncomingStock(bucket,body.observedAt);
 return {...summary,revision:data.stockRevision+1,updatedAt:createdAt};
}

function normalizeText(value){
 return String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}

function sapoDeltaRows(body,data){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 const sourceRows=Array.isArray(body.rows)?body.rows:Array.isArray(body.updates)?body.updates:body.sku?[body]:[];
 if(!sourceRows.length||sourceRows.length>1000)fail(400,'Dữ liệu tồn kho Sapo không hợp lệ.');
 const allowedWarehouses=new Map(data.warehouses.filter(name=>!['NCC','Hàng chờ về'].includes(name)).map(name=>[normalizeText(name),name]));
 const resolveWarehouse=(name)=>{
  const normalized=normalizeText(name);
  if(allowedWarehouses.has(normalized))return allowedWarehouses.get(normalized);
  for(const [key,value]of allowedWarehouses)if(key===normalized.replace(/\bhoa don\b/g,'').replace(/\s+/g,' ').trim()||key.replace(/\bhoa don\b/g,'').replace(/\s+/g,' ').trim()===normalized)return value;
  fail(400,'Kho Sapo không hợp lệ: '+(name||'(trống)'));
 };
 const rows=[];
 for(const row of sourceRows){
  const sku=String(row?.sku||row?.barcode||row?.variant_sku||row?.item_sku||'').trim();
  if(!sku||sku.length>200)fail(400,'Thiếu SKU tồn kho Sapo.');
  const stock={};
  if(row.stock&&!Array.isArray(row.stock)&&typeof row.stock==='object'){
   for(const [warehouse,value]of Object.entries(row.stock)){
    const resolved=resolveWarehouse(warehouse);
    const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>1e12)fail(400,'Số tồn Sapo không hợp lệ: '+sku);
    stock[resolved]=stockInteger(n);
   }
  }else{
   const warehouse=String(row.warehouse||row.warehouse_name||row.location_name||body.warehouse||body.warehouse_name||'').trim();
   const resolved=resolveWarehouse(warehouse);
   const value=row.available??row.on_hand??row.quantity??row.stock_quantity??row.stock;
   const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>1e12)fail(400,'Số tồn Sapo không hợp lệ: '+sku);
   stock[resolved]=stockInteger(n);
  }
  if(!Object.keys(stock).length)fail(400,'Thiếu số tồn Sapo: '+sku);
  rows.push({sku,stock});
 }
 return rows;
}

export async function applySapoInventoryDelta(db,bucket,body){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Dữ liệu tồn kho Sapo không hợp lệ.');
 const observedAt=body.observedAt||body.observed_at||body.updatedAt||body.updated_at||new Date().toISOString();
 if(!Number.isFinite(Date.parse(observedAt)))fail(400,'Thời điểm tồn kho Sapo không hợp lệ.');
 const data=await catalogData(bucket,db),products=new Map(data.products.map(product=>[product.sku.toLowerCase(),product]));
 const inputRows=sapoDeltaRows(body,data),merged=new Map();
 for(const row of inputRows){
  const key=row.sku.toLowerCase();
  const product=products.get(key);
  if(!product){merged.set(key,{sku:row.sku,unknown:true,stock:{...(merged.get(key)?.stock||{}),...row.stock}});continue;}
  const previous=merged.get(key);
  merged.set(key,{sku:product.sku,product,stock:{...(previous?.stock||{}),...row.stock}});
 }
 const accepted=[...merged.values()].filter(row=>!row.unknown),unknown=[...merged.values()].filter(row=>row.unknown).map(row=>row.sku);
 if(!accepted.length)fail(400,'Không có SKU Sapo nào khớp danh mục web báo giá.');
 const dryRun=body.dry_run===true||body.test===true;
 const samples=accepted.slice(0,20).map(row=>({sku:row.sku,name:row.product.name,stock:row.stock}));
 const summary={ok:true,dryRun,matched:accepted.length,unknownCount:unknown.length,unknown:unknown.slice(0,100),warehouses:[...new Set(accepted.flatMap(row=>Object.keys(row.stock)))],observedAt,samples};
 if(body.full_snapshot===true||body.snapshot===true){
  if(dryRun)return summary;
  let updated=0,unchanged=0;
  const map=new Map(data.products.map(product=>[product.sku.toLowerCase(),{sku:product.sku,stock:Object.fromEntries(data.warehouses.map((warehouse,index)=>[warehouse,product.stock[index]]))}]));
  for(const row of accepted){
   const current=map.get(row.sku.toLowerCase()).stock;
   const changed=Object.entries(row.stock).some(([warehouse,value])=>current[warehouse]!==value);
   if(changed)updated++;else unchanged++;
   Object.assign(current,row.stock);
  }
  if(!updated)return {...summary,updated,unchanged,revision:data.stockRevision,updatedAt:data.stockUpdatedAt||null};
  for(const product of data.products){const inventory=map.get(product.sku.toLowerCase()).stock;if(product.incomingQuantity){if(inventory['Hàng chờ về']<product.incomingQuantity)fail(400,'Số hàng chờ về không được thấp hơn số lượng trên phiếu: '+product.sku);inventory['Hàng chờ về']-=product.incomingQuantity;}}
  const key='inventory/'+crypto.randomUUID()+'.json',createdAt=new Date().toISOString();
  await bucket.put(key,JSON.stringify({rows:[...map.values()]}),{httpMetadata:{contentType:'application/json'}});
  const result=await db.prepare(`INSERT INTO stock_imports (revision,key,filename,observed_at,created_at,created_by,count) SELECT ?,?,?,?,?,?,? WHERE (SELECT COALESCE(MAX(revision),0) FROM stock_imports)=? AND (SELECT COALESCE(SUM(revision),0) FROM product_edits)=? ON CONFLICT DO NOTHING`).bind(data.stockRevision+1,key,String(body.filename||'Sapo realtime inventory snapshot').slice(0,250),observedAt,createdAt,'sapo-webhook',accepted.length,data.stockRevision,data.editRevision).run();
  if(!result.meta.changes)fail(409,'Dữ liệu vừa thay đổi. Vui lòng đồng bộ lại.');
  await reconcileReceivedIncomingStock(bucket,observedAt);
  return {...summary,updated,unchanged,revision:data.stockRevision+1,updatedAt:createdAt};
 }
 if(dryRun)return summary;
 const timestamp=new Date().toISOString();
 const receivedSyncKeys=await receivedIncomingDeltaSyncKeys(bucket,observedAt,accepted);
 let updated=0,unchanged=0;
 for(const row of accepted){
  const key=row.sku.toLowerCase(),previous=await db.prepare('SELECT data,revision FROM product_edits WHERE sku=?').bind(key).first();
  const old=previous?JSON.parse(previous.data):{};
  const currentStock=Object.fromEntries(data.warehouses.map((warehouse,index)=>[warehouse,row.product.stock[index]]));
  const changed=Object.entries(row.stock).some(([warehouse,value])=>currentStock[warehouse]!==value||receivedSyncKeys.has(receivedStockRowKey(warehouse,row.sku)));
  if(!changed){unchanged++;continue;}
  const edit={fields:old.fields||{},prices:old.prices||{},stock:{...(old.stock||{}),...row.stock},source:'Sapo realtime inventory webhook'};
  const result=previous
   ?await db.prepare('UPDATE product_edits SET data=?,revision=revision+1,updated_at=?,updated_by=? WHERE sku=?').bind(JSON.stringify(edit),timestamp,'sapo-webhook',key).run()
   :await db.prepare('INSERT INTO product_edits (sku,data,revision,updated_at,updated_by) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING').bind(key,JSON.stringify(edit),1,timestamp,'sapo-webhook').run();
  updated+=result.meta.changes||0;
 }
 await reconcileReceivedIncomingStockDelta(bucket,observedAt,accepted);
 return {...summary,updated,unchanged,updatedAt:timestamp};
}

function collectInventoryWebhookCandidates(value,out=[]){
 if(!value||typeof value!=='object')return out;
 if(Array.isArray(value)){for(const item of value)collectInventoryWebhookCandidates(item,out);return out;}
 const sku=cleanWebhookString(value.sku||value.barcode||value.variant_sku||value.item_sku||value.product_code||value.code);
 const locationId=cleanWebhookString(value.location_id||value.locationId||value.source_id||value.sourceId);
 const warehouse=cleanWebhookString(value.warehouse||value.warehouse_name||value.location_name||value.locationName||value.location_label||value.location?.name||value.location?.label);
 const available=value.available??value.on_hand??value.quantity??value.stock_quantity??value.inventory_quantity??value.stock??value.amount;
 if(sku)out.push({sku,locationId,warehouse,available});
 for(const key of ['data','inventory','inventory_level','inventory_levels','variant','variants','line_item','line_items','item','items','product','products']){
  if(value[key]!==undefined)collectInventoryWebhookCandidates(value[key],out);
 }
 return out;
}

function sapoLocationMapFromEnv(envText){
 const defaults={
  '51380':'MINH LONG - LOCKNLOCK CẦN THƠ',
  '51460':'KHO VIGIFTS',
 };
 const pairs=String(envText||'').split(',').map(item=>item.trim()).filter(Boolean);
 for(const pair of pairs){
  const index=pair.indexOf(':');
  if(index>0){const id=pair.slice(0,index).trim(),name=pair.slice(index+1).trim();if(id&&name)defaults[id]=name;}
 }
 return defaults;
}

export async function applySapoInventoryWebhook(db,bucket,body,options={}){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Webhook tồn kho Sapo không hợp lệ.');
 const candidates=collectInventoryWebhookCandidates(body);
 if(!candidates.length)fail(400,'Webhook tồn kho Sapo chưa có SKU. Cần payload có sku/barcode/variant_sku.');
 const locationMap=sapoLocationMapFromEnv(options.locationMap);
 const rows=[];
 const skipped=[];
 for(const item of candidates){
  const warehouse=item.warehouse||locationMap[item.locationId]||'';
  if(!warehouse){skipped.push({sku:item.sku,locationId:item.locationId,reason:'unknown_location'});continue;}
  const n=webhookNumber(item.available);
  if(n===null){skipped.push({sku:item.sku,warehouse,reason:'missing_stock'});continue;}
  rows.push({sku:item.sku,warehouse,stock:n});
 }
 if(!rows.length)return {ok:true,skipped:true,skippedCount:skipped.length,skipped};
 const delta={
  format:'sapo-inventory-delta-v1',
  source:'sapo-direct-inventory-webhook',
  observedAt:body.observedAt||body.observed_at||body.updatedAt||body.updated_at||new Date().toISOString(),
  dry_run:body.dry_run===true||body.test===true,
  rows,
 };
 const result=await applySapoInventoryDelta(db,bucket,delta);
 return {...result,source:delta.source,skippedCount:skipped.length,skipped:skipped.slice(0,50)};
}

const incomingIndexKey='incoming-stock/index.json';
const incomingWarehouses=data=>data.warehouses.filter(name=>!['NCC','Hàng chờ về'].includes(name));
const depositRates=[0,20,30,50,100];
const normalizeDepositRate=value=>{const rate=Number(value);return Number.isFinite(rate)&&rate>=0&&rate<=100?Math.round(rate*100)/100:null;};
const supplierDepositAmount=order=>Math.round(Number(order.total||0)*(normalizeDepositRate(order.depositRate)??30)/100);
const supplierPaidAmount=order=>Math.max(0,Number(order.depositPaidAmount??order.paidAmount??0)||0);
const receivedStockRowKey=(warehouse,sku)=>`${String(warehouse||'').trim()}\u0000${String(sku||'').trim().toLowerCase()}`;
const isPrintLogoRow=row=>String(row?.type||'').toLowerCase()==='print-logo'||String(row?.sku||'').trim().toUpperCase()==='IN-LOGO';
const cleanDesignImage=value=>{const text=String(value||'').trim();if(!text||text==='[uploaded-on-device]')return text;if(text.length>950000)return '';if(/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(text))return text;try{const url=new URL(text);return url.protocol==='https:'?text:'';}catch{return '';}};
const printDescriptionDefault='In ấn logo theo thiết kế được duyệt';
// Older orders stored logo work as a synthetic IN-LOGO product. Present it on the related products instead.
const normalizeSupplierPrintRows=rows=>{
 const source=Array.isArray(rows)?rows:[],legacy=source.filter(isPrintLogoRow),products=source.filter(row=>!isPrintLogoRow(row));
 if(!legacy.length)return products;
 return products.map(row=>{
  const linked=legacy.find(item=>!Array.isArray(item.sourceSkus)||!item.sourceSkus.length||item.sourceSkus.some(sku=>String(sku).trim().toLowerCase()===String(row.sku||'').trim().toLowerCase()));
  if(!linked)return row;
  return {...row,printDescription:String(row.printDescription||linked.name||printDescriptionDefault).trim().slice(0,2500),printFee:Number(row.printFee)||0,designImage:cleanDesignImage(row.designImage)||cleanDesignImage(linked.designImage||linked.image)};
 });
};
export async function listIncomingStock(bucket){
 const object=await bucket.get(incomingIndexKey);if(!object)return {shipments:[]};
 const index=await object.json();return {shipments:Array.isArray(index.shipments)?index.shipments.filter(shipment=>!shipment.receivedAt&&(shipment.source!=='supplier-order'||shipment.supplierStatus==='confirmed'||shipment.supplierConfirmedAt)).slice(0,100).map(({stockRows,...shipment})=>shipment):[]};
}
export async function listSupplierOrders(bucket,member){
 const object=await bucket.get(incomingIndexKey);if(!object)return {orders:[]};
 const index=await object.json(),shipments=Array.isArray(index.shipments)?index.shipments:[];
 return {orders:shipments.filter(shipment=>shipment.source==='supplier-order'&&shipment.approvalStatus==='pending'&&!shipment.receivedAt&&(member.role==='manager'||shipment.createdBy===member.id)).slice(0,100).map(({stockRows,...order})=>order)};
}
export async function getSupplierOrder(bucket,id,member){
 if(!/^[a-f0-9-]{36}$/.test(id||''))throw new QuotationError(400,'Số đơn đặt hàng NCC không hợp lệ.');
 const object=await bucket.get(incomingIndexKey);if(!object)throw new QuotationError(404,'Không tìm thấy đơn đặt hàng NCC.');
 const index=await object.json(),order=(index.shipments||[]).find(item=>item.id===id&&item.source==='supplier-order'&&item.approvalStatus==='pending'&&!item.receivedAt);
 if(!order||(member.role!=='manager'&&order.createdBy!==member.id))throw new QuotationError(404,'Không tìm thấy đơn đặt hàng NCC.');
 const savedObject=order.key?await bucket.get(order.key):null;if(!savedObject)throw new QuotationError(404,'Không đọc được chi tiết đơn đặt hàng NCC.');
 const saved=await savedObject.json();return {...saved,...order,rows:normalizeSupplierPrintRows(saved.rows)};
}
export async function countPendingSupplierOrders(bucket,member){
 const object=await bucket.get(incomingIndexKey);if(!object)return 0;
 const index=await object.json(),shipments=Array.isArray(index.shipments)?index.shipments:[];
 return shipments.filter(shipment=>shipment.source==='supplier-order'&&shipment.approvalStatus==='pending'&&!shipment.receivedAt&&(member.role==='manager'||shipment.createdBy===member.id)).length;
}
export async function listSupplierOrderReminderSnapshot(bucket){
 const object=await bucket.get(incomingIndexKey);if(!object)return {orders:[],updatedAt:new Date().toISOString()};
 const index=await object.json(),shipments=Array.isArray(index.shipments)?index.shipments:[];
 const source=shipments.filter(order=>order.source==='supplier-order'&&order.approvalStatus==='approved'&&!order.receivedAt).slice(0,300);
 const orders=[];
 for(const order of source){
  const detail=await supplierOrderDetail(bucket,order);
  orders.push({
   id:detail.id,
   ticketNumber:detail.ticketNumber||'',
   quoteNumber:detail.quoteNumber||'',
   supplierInternalOrderNumber:detail.supplierInternalOrderNumber||'',
   supplierName:detail.supplierName||'',
   supplierEmail:detail.supplierEmail||'',
   warehouse:detail.warehouse||'',
   arrivalDate:detail.arrivalDate||'',
   supplierStatus:detail.supplierStatus||'pending',
   supplierConfirmedAt:detail.supplierConfirmedAt||'',
   sentAt:detail.sentAt||detail.approvedAt||detail.updatedAt||detail.createdAt||'',
   approvedAt:detail.approvedAt||'',
   total:detail.total||0,
   rows:(detail.rows||[]).map(row=>({
    sku:row.sku||'',
    name:row.name||'',
    unit:row.unit||'',
    quantity:row.quantity||0,
    promisedDate:row.promisedDate||detail.arrivalDate||'',
    supplierNote:row.supplierNote||'',
    supplierConfirmed:Boolean(row.supplierConfirmed)
   }))
  });
 }
 return {orders,updatedAt:new Date().toISOString()};
}
export async function getIncomingStock(db,bucket,id){
 if(!/^[a-f0-9-]{36}$/.test(id||''))throw new QuotationError(400,'Số phiếu hàng sắp về không hợp lệ.');
 const {shipments}=await listIncomingStock(bucket),shipment=shipments.find(item=>item.id===id);if(!shipment)throw new QuotationError(404,'Không tìm thấy phiếu hàng sắp về.');
 const object=await bucket.get(shipment.key);if(!object)throw new QuotationError(404,'Không đọc được chi tiết phiếu hàng sắp về.');
 const saved=await object.json(),data=await catalogData(bucket,db),products=new Map(data.products.map(product=>[product.sku.toLowerCase(),product]));
 let cartons=0,weightKg=0,volumeM3=0,missingPackaging=0;
 const rows=(saved.rows||[]).map(row=>{
  const product=products.get(String(row.sku||'').toLowerCase()),quantity=stockInteger(row.quantity||0),perCarton=Number(product?.perCarton),cartonCount=perCarton>0?quantity/perCarton:null,cartonWeight=Number(product?.cartonWeight),length=Number(product?.cartonLength),width=Number(product?.cartonWidth),height=Number(product?.cartonHeight);
  const refreshed={...row,perCarton:perCarton||null,cartons:cartonCount,weightKg:cartonCount&&cartonWeight>0?cartonCount*cartonWeight:null,volumeM3:cartonCount&&length>0&&width>0&&height>0?cartonCount*length*width*height/1000000:null};
  if(refreshed.cartons===null)missingPackaging++;else cartons+=refreshed.cartons;if(refreshed.weightKg===null)missingPackaging++;else weightKg+=refreshed.weightKg;if(refreshed.volumeM3===null)missingPackaging++;else volumeM3+=refreshed.volumeM3;
  return refreshed;
 });
 return {...saved,...shipment,rows,cartons,weightKg,volumeM3,missingPackaging};
}
export async function importIncomingStock(db,bucket,body,member,apply=false,options={}){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(member.role!=='manager'&&!options.allowStaff)fail(403,'Chỉ Manager được nhập hàng sắp về.');
 const data=await catalogData(bucket,db),warehouses=incomingWarehouses(data);
 const supplierName=String(body.supplierName||'').trim(),quoteNumber=String(body.quoteNumber||'').trim(),supplierInternalOrderNumber=String(body.supplierInternalOrderNumber||body.supplierOrderNumber||body.supplier_order_number||'').trim();
 const paidAmountInput=body.paidAmount??body.amountPaid??body.paid_amount,paidAmount=paidAmountInput===undefined||paidAmountInput===null||paidAmountInput===''?null:Number(paidAmountInput);
 if(paidAmount!==null&&(!Number.isFinite(paidAmount)||paidAmount<0||paidAmount>1e12))fail(400,'Số tiền đã thanh toán không hợp lệ.');
 if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>50000||typeof body.filename!=='string'||body.filename.length>250||typeof body.ticketNumber!=='string'||!body.ticketNumber.trim()||body.ticketNumber.trim().length>100||typeof body.warehouse!=='string'||!warehouses.includes(body.warehouse)||!/^\d{4}-\d{2}-\d{2}$/.test(body.arrivalDate||'')||!Number.isFinite(Date.parse(body.arrivalDate+'T00:00:00Z'))||supplierName.length>300||quoteNumber.length>100||supplierInternalOrderNumber.length>100||(options.source==='supplier-order'&&(!supplierName||!quoteNumber)))fail(400,'Dữ liệu hàng sắp về không hợp lệ.');
 const products=new Map(data.products.map(product=>[product.sku.toLowerCase(),product])),accepted=[],unknown=[],samples=[],allowDuplicateRows=body.allowDuplicateRows===true&&options.source!=='supplier-order',sourceRows=[],sourceRowsBySku=new Map();let quantity=0,cartons=0,weightKg=0,volumeM3=0,missingPackaging=0;
 for(const row of body.rows){
  if(!row||typeof row.sku!=='string'||!row.sku.trim()||row.sku.length>200||typeof row.quantity!=='number'||!Number.isFinite(row.quantity)||row.quantity<0||row.quantity>1e12)fail(400,'Dòng hàng sắp về không hợp lệ.');
  const key=row.sku.trim().toLowerCase(),previousRow=sourceRowsBySku.get(key);if(previousRow){if(!allowDuplicateRows)fail(400,'SKU bị lặp trong file: '+row.sku);previousRow.quantity+=row.quantity;if(previousRow.quantity>1e12)fail(400,'Dòng hàng sắp về không hợp lệ.');}else{const sourceRow={...row};sourceRowsBySku.set(key,sourceRow);sourceRows.push(sourceRow);}
 }
 for(const row of sourceRows){
  if(!row||typeof row.sku!=='string'||!row.sku.trim()||row.sku.length>200||typeof row.quantity!=='number'||!Number.isFinite(row.quantity)||row.quantity<0||row.quantity>1e12)fail(400,'Dòng hàng sắp về không hợp lệ.');
  const hasPrice=row.price!==undefined&&row.price!==null,hasTaxRate=row.taxRate!==undefined&&row.taxRate!==null,price=Number(row.price),taxRate=Number(row.taxRate),printFee=Number(row.printFee??0);if(options.source==='supplier-order'&&(!hasPrice||!hasTaxRate||!Number.isFinite(price)||price<0||price>1e12||!Number.isFinite(taxRate)||taxRate<0||taxRate>100||!Number.isFinite(printFee)||printFee<0||printFee>1e12))fail(400,'Đơn giá, phí in hoặc VAT của đơn đặt hàng NCC không hợp lệ.');
 const key=row.sku.trim().toLowerCase();
  if(options.source==='supplier-order'&&isPrintLogoRow(row)){
   // Legacy clients may still submit this synthetic row. It is intentionally not stored or counted.
   continue;
  }
  const product=products.get(key);if(!product){unknown.push(row.sku);continue;}
  const rounded=stockInteger(row.quantity);if(rounded<=0)continue;
  const perCarton=Number(product.perCarton),cartonCount=perCarton>0?rounded/perCarton:null,cartonWeight=Number(product.cartonWeight),length=Number(product.cartonLength),width=Number(product.cartonWidth),height=Number(product.cartonHeight);
  const item={sku:product.sku,name:product.name,unit:product.unit||'',quantity:rounded,price:hasPrice&&Number.isFinite(price)?price:null,manualPrice:options.source==='supplier-order'&&Boolean(row.manualPrice),taxRate:hasTaxRate&&Number.isFinite(taxRate)?taxRate:null,printDescription:options.source==='supplier-order'?String(row.printDescription||'').trim().slice(0,2500):'',printFee:options.source==='supplier-order'?printFee:0,designImage:options.source==='supplier-order'?cleanDesignImage(row.designImage):'',perCarton:perCarton||null,cartonWeight:cartonWeight||null,cartonLength:length||null,cartonWidth:width||null,cartonHeight:height||null,cartons:cartonCount,weightKg:cartonCount&&cartonWeight>0?cartonCount*cartonWeight:null,volumeM3:cartonCount&&length>0&&width>0&&height>0?cartonCount*length*width*height/1000000:null};accepted.push(item);quantity+=rounded;if(item.cartons===null)missingPackaging++;else cartons+=item.cartons;if(item.weightKg===null)missingPackaging++;else weightKg+=item.weightKg;if(item.volumeM3===null)missingPackaging++;else volumeM3+=item.volumeM3;if(samples.length<20)samples.push(item);
 }
 if(!accepted.length)fail(400,'Không có SKU và số lượng hàng về hợp lệ.');
 const summary={matched:accepted.length,quantity,cartons,weightKg,volumeM3,missingPackaging,unknownCount:unknown.length,unknown:unknown.slice(0,100),samples};
 if(!apply)return summary;
 const ticketNumber=body.ticketNumber.trim(),indexObject=await bucket.get(incomingIndexKey),index=indexObject?await indexObject.json():{shipments:[]};
 const previous=body.id?index.shipments.find(item=>item.id===body.id):null;
 if(body.id&&!previous)fail(404,'Không tìm thấy phiếu hàng sắp về.');
 if(previous&&body.revision!==(previous.updatedAt||previous.createdAt))fail(409,'Phiếu đã được chỉnh sửa. Tải lại phiếu trước khi lưu.');
 if(index.shipments.some(item=>item.id!==body.id&&String(item.ticketNumber||'').toLowerCase()===ticketNumber.toLowerCase()))fail(409,'Số phiếu này đã được nhập.');const now=new Date().toISOString(),createdAt=previous?.createdAt||now,id=previous?.id||crypto.randomUUID(),key=`incoming-stock/${id}-${crypto.randomUUID()}.json`,depositRate=options.source==='supplier-order'?(normalizeDepositRate(body.depositRate)??previous?.depositRate??30):null,shipment={id,key,ticketNumber,warehouse:body.warehouse,arrivalDate:body.arrivalDate,filename:body.filename,supplierName,quoteNumber,supplierInternalOrderNumber,paidAmount:paidAmount??previous?.paidAmount??0,source:options.source||previous?.source||'incoming-stock',approvalStatus:options.initialStatus||previous?.approvalStatus||'approved',supplierStatus:previous?.supplierStatus||'pending',depositRate,createdAt,createdBy:previous?.createdBy||member.id,updatedAt:now,updatedBy:member.id,count:accepted.length,quantity,cartons,weightKg,volumeM3,missingPackaging};
 await bucket.put(key,JSON.stringify({...shipment,rows:accepted}),{httpMetadata:{contentType:'application/json'}});
 const indexedShipment={...shipment,stockRows:accepted.filter(row=>!isPrintLogoRow(row)).map(({sku,quantity})=>({sku,quantity}))};
 const shipments=previous?index.shipments.map(item=>item.id===id?indexedShipment:item):[indexedShipment,...index.shipments];
 const committed=await bucket.put(incomingIndexKey,JSON.stringify({...index,shipments}),{httpMetadata:{contentType:'application/json'},onlyIf:indexObject?{etagMatches:indexObject.etag}:{etagDoesNotMatch:'*'}});
 if(!committed){await bucket.delete(key);fail(409,'Phiếu hàng chờ về vừa thay đổi. Tải lại và lưu lại phiếu.');}
 return {...summary,shipment};
}

export async function approveSupplierOrder(bucket,body,member){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(member.role!=='manager')fail(403,'Chỉ Manager được phê duyệt đơn đặt hàng NCC.');
 const id=String(body?.id||''),supplierEmail=String(body?.supplierEmail||'').trim(),ccEmail=String(body?.ccEmail||'').trim();
 if(!/^[a-f0-9-]{36}$/i.test(id)||!/^\S+@\S+\.\S+$/.test(supplierEmail))fail(400,'Thông tin phê duyệt đơn hàng không hợp lệ.');
 const cc=ccEmail?ccEmail.split(/[;,]/).map(value=>value.trim()).filter(Boolean):[];
 if(cc.length>20||cc.some(email=>!/^\S+@\S+\.\S+$/.test(email)))fail(400,'Email CC không hợp lệ.');
 const object=await bucket.get(incomingIndexKey);if(!object)fail(404,'Không tìm thấy đơn đặt hàng NCC.');
 const index=await object.json(),position=(index.shipments||[]).findIndex(shipment=>shipment.id===id&&shipment.source==='supplier-order');
 if(position<0)fail(404,'Không tìm thấy đơn đặt hàng NCC.');
 const order=index.shipments[position];
 if(order.approvalStatus==='approved')fail(409,'Đơn này đã được phê duyệt.');
 if(order.receivedAt)fail(409,'Đơn này đã nhập kho.');
 const expected=Array.isArray(order.stockRows)?order.stockRows:[],provided=Array.isArray(body?.itemDiscounts)?body.itemDiscounts:[];
 if(!expected.length||provided.length!==expected.length)fail(400,'Nhập chiết khấu cho đầy đủ từng mã hàng.');
 const discounts=new Map();
 for(const row of provided){const sku=String(row?.sku||'').trim(),value=Number(row?.purchaseDiscount),key=sku.toLowerCase();if(!sku||discounts.has(key)||!Number.isFinite(value)||value<0||value>100)fail(400,'Chiết khấu từng mã phải từ 0 đến 100%.');discounts.set(key,value);}
 if(expected.some(row=>!discounts.has(String(row.sku||'').toLowerCase())))fail(400,'Danh sách mã hàng và chiết khấu không khớp đơn đặt hàng.');
 const itemDiscounts=expected.map(row=>({sku:row.sku,purchaseDiscount:discounts.get(String(row.sku).toLowerCase())}));
 const approvedAt=new Date().toISOString(),updated={...order,approvalStatus:'approved',supplierStatus:order.supplierStatus||'pending',supplierEmail,ccEmail:cc.join(', '),itemDiscounts,approvedAt,approvedBy:member.id,updatedAt:approvedAt,updatedBy:member.id};
 const shipments=index.shipments.map((shipment,index)=>index===position?updated:shipment);
 const committed=await bucket.put(incomingIndexKey,JSON.stringify({...index,shipments}),{httpMetadata:{contentType:'application/json'},onlyIf:{etagMatches:object.etag}});
 if(!committed)fail(409,'Đơn vừa được cập nhật. Vui lòng tải lại và thử lại.');
 return {ok:true,order:await supplierOrderDetail(bucket,updated)};
}

function supplierEmailMatches(order,member){
 const email=String(member.email||'').trim().toLowerCase();
 if(!email)return false;
 if(String(order.supplierEmail||'').trim().toLowerCase()===email)return true;
 if(['bachngankg@gmail.com','sales.bachngankg@gmail.com'].includes(email))return /minh\s*long/i.test(String(order.supplierName||''));
 return false;
}

async function supplierOrderDetail(bucket,order){
 const savedObject=order.key?await bucket.get(order.key):null,saved=savedObject?await savedObject.json():{};
 const discounts=new Map((order.itemDiscounts||[]).map(item=>[String(item.sku||'').toLowerCase(),Number(item.purchaseDiscount)||0]));
 const confirmations=new Map((order.supplierConfirmations||[]).map(item=>[String(item.sku||'').toLowerCase(),item]));
 let subtotal=0,vat=0;
 const rows=normalizeSupplierPrintRows(saved.rows).map(row=>{
 const confirmation=confirmations.get(String(row.sku||'').toLowerCase())||{};
  const quantity=stockInteger(Number(row.quantity)||0),unitPrice=Number(row.price)||0,printFee=Math.max(0,Number(row.printFee)||0),taxRate=Number(row.taxRate)||0,confirmedDiscount=Number(confirmation.purchaseDiscount),purchaseDiscount=Math.max(0,Math.min(100,Number.isFinite(confirmedDiscount)?confirmedDiscount:(discounts.get(String(row.sku||'').toLowerCase())||0)));
  const priceAfterDiscount=unitPrice*(100-purchaseDiscount)/100,lineTotal=(priceAfterDiscount+printFee)*quantity,lineVat=lineTotal*taxRate/100;
  subtotal+=lineTotal;vat+=lineVat;
  const cartons=Number(row.cartons),weightKg=Number(row.weightKg),volumeM3=Number(row.volumeM3),cartonWeight=Number(row.cartonWeight),derivedCartonWeight=Number.isFinite(cartons)&&cartons>0&&Number.isFinite(weightKg)&&weightKg>0?weightKg/cartons:null;
  return {sku:row.sku,name:row.name,unit:row.unit||'',quantity,unitPrice,manualPrice:Boolean(row.manualPrice),printFee,printDescription:String(row.printDescription||''),designImage:cleanDesignImage(row.designImage),taxRate,purchaseDiscount,priceAfterDiscount,lineTotal,lineVat,promisedDate:confirmation.promisedDate||order.arrivalDate||'',supplierNote:confirmation.supplierNote||'',supplierConfirmed:Boolean(confirmation.confirmed),perCarton:Number(row.perCarton)||null,cartonWeight:cartonWeight||derivedCartonWeight,cartonLength:Number(row.cartonLength)||null,cartonWidth:Number(row.cartonWidth)||null,cartonHeight:Number(row.cartonHeight)||null,cartons:Number.isFinite(cartons)?cartons:null,weightKg:Number.isFinite(weightKg)?weightKg:null,volumeM3:Number.isFinite(volumeM3)?volumeM3:null};
 });
 const total=subtotal+vat,detail={...order,depositRate:normalizeDepositRate(order.depositRate)??30,total},depositAmount=supplierDepositAmount(detail),depositPaidAmount=supplierPaidAmount(detail);
 return {...detail,supplierStatus:order.supplierStatus==='confirmed'||order.supplierConfirmedAt?'confirmed':'pending',rows,subtotal,vat,depositAmount,depositPaidAmount,remainingAmount:Math.max(0,total-depositPaidAmount),sentAt:order.approvedAt||order.updatedAt||order.createdAt,supplierSignatureUploadedAt:order.supplierSignatureUploadedAt||order.supplierSignatureDownloadedAt||'',supplierSignatureUploadedBy:order.supplierSignatureUploadedBy||order.supplierSignatureDownloadedBy||'',supplierSignatureFile:order.supplierSignatureFile||null};
}

export async function listApprovedSupplierOrders(bucket,member){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(!['manager','supplier','employee'].includes(member.role))fail(403,'Tài khoản này không được xem trang đơn hàng NCC.');
 const object=await bucket.get(incomingIndexKey);if(!object)return {orders:[]};
 const index=await object.json(),shipments=Array.isArray(index.shipments)?index.shipments:[];
 const visible=shipments.filter(order=>order.source==='supplier-order'&&order.approvalStatus==='approved'&&(member.role==='manager'||member.role==='employee'||supplierEmailMatches(order,member)));
 const receipt=await globalThis.SupplierProgress.receiptSummary(bucket,shipments);
 const orders=[];
 for(const order of visible){
  const original=await supplierOrderDetail(bucket,order);
  const detail={...original,supplierReceivedRows:[...(receipt.received.get(order.id)?.values()||[])],receiptHistory:receipt.history.get(order.id)||[]};
  orders.push(member.role==='employee'?{...detail,priceHidden:true,subtotal:0,vat:0,total:0,depositAmount:0,depositPaidAmount:0,remainingAmount:0,rows:detail.rows.map(row=>({...row,unitPrice:0,taxRate:0,purchaseDiscount:null,priceAfterDiscount:0,lineTotal:0,lineVat:0}))}:detail);
 }
 return {orders};
}

export async function getSupplierOrderSignatureFile(bucket,id,member){
 if(!['manager','supplier','employee'].includes(member.role))throw new QuotationError(403,'Tài khoản này không được xem file đơn hàng NCC.');
 if(!/^[a-f0-9-]{36}$/i.test(id||''))throw new QuotationError(400,'Số đơn NCC không hợp lệ.');
 const object=await bucket.get(incomingIndexKey);if(!object)throw new QuotationError(404,'Không tìm thấy đơn NCC.');
 const index=await object.json(),order=(index.shipments||[]).find(item=>item.id===id&&item.source==='supplier-order'&&item.approvalStatus==='approved');
 if(!order||(member.role==='supplier'&&!supplierEmailMatches(order,member)))throw new QuotationError(404,'Không tìm thấy đơn NCC của tài khoản này.');
 const file=order.supplierSignatureFile,key=String(file?.key||'');
 if(!key)throw new QuotationError(404,'Đơn này chưa có ảnh/file đã upload.');
 const stored=await bucket.get(key);
 if(!stored)throw new QuotationError(404,'File upload không còn tồn tại.');
 return {file,stored};
}

export async function listSupplierPaymentRequests(bucket,member){
 if(member.role!=='manager')throw new QuotationError(403,'Chỉ Manager được xem đề nghị thanh toán NCC.');
 const object=await bucket.get(incomingIndexKey);if(!object)return {requests:[],count:0,totalDeposit:0};
 const index=await object.json(),shipments=Array.isArray(index.shipments)?index.shipments:[];
 const requests=[];
 for(const order of shipments){
  if(order.source!=='supplier-order'||order.approvalStatus!=='approved'||!order.depositRequestedAt)continue;
  if(order.depositPaidAt)continue;
  const detail=await supplierOrderDetail(bucket,order);
  if(supplierPaidAmount(detail)>=supplierDepositAmount(detail))continue;
  requests.push(detail);
 }
 requests.sort((a,b)=>String(b.depositRequestedAt||'').localeCompare(String(a.depositRequestedAt||'')));
 return {requests:requests.slice(0,200),count:requests.length,totalDeposit:requests.reduce((sum,order)=>sum+supplierDepositAmount(order),0)};
}

export async function listSupplierStockRequests(bucket,member){
 if(!['manager','employee','supplier'].includes(member.role))throw new QuotationError(403,'Tài khoản này không được xem yêu cầu xin hàng NCC.');
 const object=await bucket.get(incomingIndexKey);if(!object)return {requests:[],count:0};
 const index=await object.json(),source=Array.isArray(index.supplierStockRequests)?index.supplierStockRequests:[];
 const liveOrderIds=new Set((index.shipments||[]).filter(order=>order.source==='supplier-order').map(order=>order.id));
 const requests=source.map(request=>({...request,lines:(request.lines||[]).filter(line=>liveOrderIds.has(line.orderId))})).filter(request=>request.lines.length>0).filter(request=>member.role==='manager'||(member.role==='employee'&&(request.createdBy===member.id||Boolean(request.createdByPositionId&&request.createdByPositionId===member.position_id)))||supplierEmailMatches(request,member)).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,100);
 return {requests,count:requests.filter(request=>request.status==='pending').length};
}

export async function createSupplierStockRequest(bucket,body,member){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(!['manager','employee'].includes(member.role))fail(403,'Chỉ nhân viên công ty được gửi yêu cầu xin hàng NCC.');
 const requestedRows=Array.isArray(body?.rows)?body.rows:[];
 if(!requestedRows.length||requestedRows.length>100)fail(400,'Chọn ít nhất 1 mã hàng để xin NCC.');
 const object=await bucket.get(incomingIndexKey);if(!object)fail(404,'Không tìm thấy đơn NCC.');
 const index=await object.json(),shipments=Array.isArray(index.shipments)?index.shipments:[],orderMap=new Map(shipments.filter(order=>order.source==='supplier-order'&&order.approvalStatus==='approved'&&order.supplierStatus==='confirmed'&&!order.receivedAt).map(order=>[order.id,order]));
 const lines=[],supplierKeys=new Set();
 for(const input of requestedRows){
  const orderId=String(input?.orderId||input?.id||''),sku=String(input?.sku||'').trim(),quantity=stockInteger(Number(input?.quantity)||0),order=orderMap.get(orderId);
  if(!order||!sku)fail(400,'Mã hàng xin NCC không khớp đơn đã đặt.');
  const detail=await supplierOrderDetail(bucket,order),row=(detail.rows||[]).find(item=>String(item.sku||'').toLowerCase()===sku.toLowerCase());
  if(!row)fail(400,'Mã hàng xin NCC không có trong đơn đã đặt.');
  const max=stockInteger(Number(row.quantity)||0);
  if(quantity<=0||quantity>max)fail(400,'Số lượng xin hàng phải lớn hơn 0 và không vượt quá số lượng trong đơn.');
  const supplierKey=String(order.supplierEmail||order.supplierName||'').trim().toLowerCase();
  if(!supplierKey)fail(400,'Đơn chưa có thông tin NCC để gửi yêu cầu.');
  supplierKeys.add(supplierKey);
  lines.push({orderId:order.id,ticketNumber:order.ticketNumber||'',supplierInternalOrderNumber:order.supplierInternalOrderNumber||'',sku:row.sku,name:row.name||'',unit:row.unit||'',quantity,maxQuantity:max,arrivalDate:row.promisedDate||detail.arrivalDate||''});
 }
 if(supplierKeys.size!==1)fail(400,'Một yêu cầu xin hàng chỉ gửi cho một NCC. Vui lòng chọn các mã cùng NCC.');
 const firstOrder=orderMap.get(lines[0].orderId),now=new Date().toISOString(),request={id:crypto.randomUUID(),status:'pending',supplierName:firstOrder.supplierName||'',supplierEmail:firstOrder.supplierEmail||'',createdAt:now,createdBy:member.id,createdByName:member.name||'',createdByPositionId:member.position_id||'',note:String(body?.note||'').trim().slice(0,500),lines};
 const supplierStockRequests=[request,...(Array.isArray(index.supplierStockRequests)?index.supplierStockRequests:[])].slice(0,300);
 const committed=await bucket.put(incomingIndexKey,JSON.stringify({...index,shipments,supplierStockRequests}),{httpMetadata:{contentType:'application/json'},onlyIf:{etagMatches:object.etag}});
 if(!committed)fail(409,'Đơn NCC vừa được cập nhật. Vui lòng tải lại và thử lại.');
 return {ok:true,request};
}

export async function respondSupplierStockRequest(bucket,body,member){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(!['manager','supplier'].includes(member.role))fail(403,'Tài khoản này không được phản hồi yêu cầu xin hàng NCC.');
 const id=String(body?.id||''),decision=String(body?.decision||body?.status||body?.action||'').trim().toLowerCase();
 const status=/^(agree|accept|accepted|dong-y|đồng ý|approve|approved)$/.test(decision)?'accepted':/^(reject|rejected|tu-choi|từ chối|decline|declined)$/.test(decision)?'rejected':'';
 if(!/^[a-f0-9-]{36}$/i.test(id)||!status)fail(400,'Phản hồi yêu cầu xin hàng không hợp lệ.');
 const object=await bucket.get(incomingIndexKey);if(!object)fail(404,'Không tìm thấy yêu cầu xin hàng.');
 const index=await object.json(),requests=Array.isArray(index.supplierStockRequests)?index.supplierStockRequests:[],position=requests.findIndex(request=>request.id===id);
 if(position<0)fail(404,'Không tìm thấy yêu cầu xin hàng.');
 const original=requests[position],liveOrderIds=new Set((index.shipments||[]).filter(order=>order.source==='supplier-order').map(order=>order.id));
 const request={...original,lines:(original.lines||[]).filter(line=>liveOrderIds.has(line.orderId))};
 if(!request.lines.length)fail(409,'Đơn NCC của yêu cầu này đã bị xoá. Vui lòng tải lại danh sách.');
 if(member.role==='supplier'&&!supplierEmailMatches(request,member))fail(404,'Không tìm thấy yêu cầu xin hàng của tài khoản này.');
 if(request.status!=='pending')fail(409,'Yêu cầu xin hàng này đã được phản hồi.');
 const updated={...request,status,respondedAt:new Date().toISOString(),respondedBy:member.id,responseNote:String(body?.note||'').trim().slice(0,500)};
 const supplierStockRequests=requests.map((item,index)=>index===position?updated:item);
 const shipments=Array.isArray(index.shipments)?index.shipments:[];
 const committed=await bucket.put(incomingIndexKey,JSON.stringify({...index,shipments,supplierStockRequests}),{httpMetadata:{contentType:'application/json'},onlyIf:{etagMatches:object.etag}});
 if(!committed)fail(409,'Yêu cầu vừa được cập nhật. Vui lòng tải lại và thử lại.');
 return {ok:true,request:updated};
}

export async function paySupplierDeposit(bucket,body,member){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(member.role!=='manager')fail(403,'Chỉ Manager được ghi nhận thanh toán cọc NCC.');
 if(!body||!/^[-a-f0-9]{36}$/i.test(body.id||''))fail(400,'Đơn NCC không hợp lệ.');
 const object=await bucket.get(incomingIndexKey);if(!object)fail(404,'Không tìm thấy đơn NCC.');
 const index=await object.json(),position=(index.shipments||[]).findIndex(order=>order.id===body.id&&order.source==='supplier-order'&&order.approvalStatus==='approved');
 if(position<0)fail(404,'Không tìm thấy đơn NCC đã gửi.');
 const currentDetail=await supplierOrderDetail(bucket,index.shipments[position]);
 if(!currentDetail.depositRequestedAt)fail(400,'Đơn này chưa có đề nghị thanh toán.');
 const defaultAmount=supplierDepositAmount(currentDetail),paidAmountInput=body.paidAmount??body.amountPaid??body.paid_amount,paidAmount=paidAmountInput===undefined||paidAmountInput===null||paidAmountInput===''?defaultAmount:Number(paidAmountInput);
 if(!Number.isFinite(paidAmount)||paidAmount<0||paidAmount>1e12)fail(400,'Số tiền cọc không hợp lệ.');
 const now=new Date().toISOString(),updated={...index.shipments[position],paidAmount,depositPaidAmount:paidAmount,depositPaidAt:now,depositPaidBy:member.id,paidUpdatedAt:now,paidUpdatedBy:member.id,updatedAt:now,updatedBy:member.id};
 const shipments=index.shipments.map((order,i)=>i===position?updated:order),committed=await bucket.put(incomingIndexKey,JSON.stringify({...index,shipments}),{httpMetadata:{contentType:'application/json'},onlyIf:{etagMatches:object.etag}});
 if(!committed)fail(409,'Đơn NCC vừa được cập nhật. Vui lòng tải lại và thử lại.');
 return {ok:true,order:await supplierOrderDetail(bucket,updated)};
}

async function updateSupplierPortalOrder(bucket,id,member,updater){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(!['manager','supplier'].includes(member.role))fail(403,'Chỉ tài khoản NCC được xác nhận đơn NCC.');
 if(!/^[a-f0-9-]{36}$/i.test(id||''))fail(400,'Số đơn NCC không hợp lệ.');
 const object=await bucket.get(incomingIndexKey);if(!object)fail(404,'Không tìm thấy đơn NCC.');
 const index=await object.json(),position=(index.shipments||[]).findIndex(order=>order.id===id&&order.source==='supplier-order'&&order.approvalStatus==='approved');
 if(position<0)fail(404,'Không tìm thấy đơn NCC đã gửi.');
 const order=index.shipments[position];
 if(member.role==='supplier'&&!supplierEmailMatches(order,member))fail(404,'Không tìm thấy đơn NCC của tài khoản này.');
 const updated=await updater(order,fail);
 const now=new Date().toISOString(),shipments=index.shipments.map((item,index)=>index===position?{...updated,updatedAt:now,updatedBy:member.id}:item);
 const committed=await bucket.put(incomingIndexKey,JSON.stringify({...index,shipments}),{httpMetadata:{contentType:'application/json'},onlyIf:{etagMatches:object.etag}});
 if(!committed)fail(409,'Đơn vừa được cập nhật. Vui lòng tải lại và thử lại.');
 return {ok:true,order:await supplierOrderDetail(bucket,shipments[position])};
}

export async function requestSupplierDeposit(bucket,body,member){
 const id=String(body?.id||''),rows=Array.isArray(body?.rows)?body.rows:[];
 return updateSupplierPortalOrder(bucket,id,member,async(order,fail)=>{
  if(order.depositPaidAt)fail(409,'Đơn này đã nhận tiền cọc.');
  const hasInternalOrder=Object.hasOwn(body||{},'supplierInternalOrderNumber')||Object.hasOwn(body||{},'supplierOrderNumber')||Object.hasOwn(body||{},'supplier_order_number');
  const supplierInternalOrderNumber=hasInternalOrder?String(body?.supplierInternalOrderNumber||body?.supplierOrderNumber||body?.supplier_order_number||'').trim():String(order.supplierInternalOrderNumber||'');
  if(supplierInternalOrderNumber.length>100)fail(400,'Số phiếu nội bộ NCC tối đa 100 ký tự.');
  const expected=Array.isArray(order.stockRows)?order.stockRows:[];
  if(!expected.length||rows.length!==expected.length)fail(400,'Tick chọn đầy đủ từng sản phẩm trước khi yêu cầu đặt cọc.');
  const checked=new Map();
  for(const row of rows){
   const sku=String(row?.sku||'').trim(),key=sku.toLowerCase(),quantity=stockInteger(Number(row?.quantity)||0);
   if(!sku||checked.has(key)||row?.confirmed!==true)fail(400,'Tick chọn đầy đủ từng sản phẩm trước khi yêu cầu đặt cọc.');
   checked.set(key,{sku,quantity});
  }
  for(const expectedRow of expected){
   const key=String(expectedRow.sku||'').toLowerCase(),row=checked.get(key);
   if(!row||row.quantity!==stockInteger(Number(expectedRow.quantity)||0))fail(400,'Danh sách sản phẩm chọn không khớp đơn đã gửi NCC.');
  }
  const requestedDepositRate=normalizeDepositRate(Object.hasOwn(body||{},'depositRate')?body.depositRate:(order.depositRate??30));
  if(requestedDepositRate===null)fail(400,'Tỷ lệ cọc phải từ 0 đến 100%.');
  const requestedAt=new Date().toISOString();
  return {...order,supplierInternalOrderNumber,depositRequestedAt:order.depositRequestedAt||requestedAt,depositRequestedBy:member.id,depositRate:requestedDepositRate};
 });
}

export async function updateSupplierInternalOrderNumber(bucket,body,member){
 const id=String(body?.id||''),supplierInternalOrderNumber=String(body?.supplierInternalOrderNumber||body?.supplierOrderNumber||body?.supplier_order_number||'').trim();
 return updateSupplierPortalOrder(bucket,id,member,async(order,fail)=>{
  if(supplierInternalOrderNumber.length>100)fail(400,'Số phiếu nội bộ NCC tối đa 100 ký tự.');
  return {...order,supplierInternalOrderNumber};
 });
}

export async function markSupplierDeliveryReady(bucket,body,member){
 const id=String(body?.id||''),ready=body?.ready!==false;
 return updateSupplierPortalOrder(bucket,id,member,async(order,fail)=>{
  if(!ready){
   const {supplierDeliveryReadyAt,supplierDeliveryReadyBy,supplierDeliveryReadyMode,supplierDeliveryReadyDate,supplierDeliveryReadyRows,...rest}=order;
   return rest;
  }
  if(order.supplierStatus!=='confirmed'&&!order.supplierConfirmedAt)fail(409,'Chỉ đơn đã duyệt mới được báo sẵn sàng giao.');
  if(order.receivedAt)fail(409,'Đơn đã nhập kho, không cần báo sẵn sàng giao.');
  const mode=String(body?.mode||'full').trim().toLowerCase()==='partial'?'partial':'full',deliveryDate=String(body?.deliveryDate||body?.date||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)||!Number.isFinite(Date.parse(deliveryDate+'T00:00:00Z')))fail(400,'Chọn ngày muốn giao hợp lệ.');
  const expected=(Array.isArray(order.stockRows)?order.stockRows:[]).filter(row=>!isPrintLogoRow(row));
  const bySku=new Map(expected.map(row=>[String(row.sku||'').toLowerCase(),row]));
  let supplierDeliveryReadyRows=expected.map(row=>({sku:row.sku,name:row.name||'',quantity:stockInteger(Number(row.quantity)||0)}));
  if(mode==='partial'){
   const rows=Array.isArray(body?.rows)?body.rows:[];
   if(!rows.length)fail(400,'Chọn ít nhất 1 mã hàng khi giao một phần.');
   const seen=new Set();
   supplierDeliveryReadyRows=rows.map(row=>{
    const sku=String(row?.sku||'').trim(),key=sku.toLowerCase(),expectedRow=bySku.get(key),quantity=stockInteger(Number(row?.quantity)||0);
    if(!sku||!expectedRow||seen.has(key))fail(400,'Mã hàng giao một phần không khớp đơn NCC.');
    seen.add(key);
    const max=stockInteger(Number(expectedRow.quantity)||0);
    if(quantity<=0||quantity>max)fail(400,'Số lượng giao một phần phải lớn hơn 0 và không vượt quá số lượng trong đơn.');
    return {sku:expectedRow.sku,name:expectedRow.name||'',quantity};
   });
  }
 return {...order,supplierDeliveryReadyAt:new Date().toISOString(),supplierDeliveryReadyBy:member.id,supplierDeliveryReadyMode:mode,supplierDeliveryReadyDate:deliveryDate,supplierDeliveryReadyRows};
 });
}

export async function confirmSupplierDeliveryNote(bucket,body,member){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(!['manager','supplier'].includes(member.role))fail(403,'Tài khoản này không được xác nhận phiếu giao.');
 const rows=Array.isArray(body?.rows)?body.rows:[];
 if(!rows.length||rows.length>200)fail(400,'Phiếu giao chưa có dòng hàng để xác nhận.');
 const grouped=new Map();
 for(const input of rows){
  const orderId=String(input?.orderId||'').trim(),sku=String(input?.sku||'').trim(),quantity=stockInteger(Number(input?.quantity)||0);
  if(!/^[a-f0-9-]{36}$/i.test(orderId)||!sku||quantity<=0)fail(400,'Dòng phiếu giao không hợp lệ.');
  const key=orderId;
  const current=grouped.get(key)||[];
  current.push({sku,quantity});
  grouped.set(key,current);
 }
 const duplicate=await existingIncomingDeliveryNote(bucket,body,member,[...grouped.keys()]);
 if(duplicate)return duplicate;
 const updatedOrders=[];
 for(const [id,items] of grouped){
  const result=await updateSupplierPortalOrder(bucket,id,member,async(order,failUpdate)=>{
   if(order.receivedAt)failUpdate(409,'Đơn đã nhập kho, không cần xác nhận giao.');
   const stockRows=(Array.isArray(order.stockRows)?order.stockRows:[]).filter(row=>!isPrintLogoRow(row));
   const expected=new Map(stockRows.map(row=>[String(row.sku||'').toLowerCase(),row]));
   const delivered=new Map((Array.isArray(order.supplierDeliveredRows)?order.supplierDeliveredRows:[]).map(row=>[String(row.sku||'').toLowerCase(),{sku:row.sku,quantity:stockInteger(Number(row.quantity)||0),lastDeliveredAt:row.lastDeliveredAt||''}]));
   const now=new Date().toISOString();
   for(const item of items){
    const key=String(item.sku||'').toLowerCase(),expectedRow=expected.get(key);
    if(!expectedRow)failUpdate(400,'Dòng phiếu giao không khớp đơn NCC.');
    const max=stockInteger(Number(expectedRow.quantity)||0),current=delivered.get(key)||{sku:expectedRow.sku,quantity:0,lastDeliveredAt:''},next=current.quantity+stockInteger(Number(item.quantity)||0);
    if(next>max)failUpdate(400,`Số lượng đã giao của ${expectedRow.sku} vượt quá số lượng đơn NCC.`);
    delivered.set(key,{sku:expectedRow.sku,name:expectedRow.name||'',quantity:next,lastDeliveredAt:now});
   }
   const supplierDeliveredRows=[...delivered.values()].filter(row=>row.quantity>0);
   const complete=stockRows.length>0&&stockRows.every(row=>(delivered.get(String(row.sku||'').toLowerCase())?.quantity||0)>=stockInteger(Number(row.quantity)||0));
   return {...order,supplierDeliveredRows,supplierDeliveredAt:now,supplierDeliveredBy:member.id,supplierDeliveryCompletedAt:complete?(order.supplierDeliveryCompletedAt||now):''};
  });
  updatedOrders.push(result.order);
 }
 const deliveredAt=new Date().toISOString(),incomingShipment=await createIncomingFromSupplierDeliveryNote(bucket,body,member,updatedOrders,rows,deliveredAt,fail);
 return {ok:true,orders:updatedOrders,incomingShipment,deliveredAt};
}

async function existingIncomingDeliveryNote(bucket,body,member,orderIds){
 const deliveryNoteId=String(body?.deliveryNoteId||'').trim().slice(0,160);
 if(!deliveryNoteId)return null;
 const object=await bucket.get(incomingIndexKey);if(!object)return null;
 const index=await object.json(),shipments=Array.isArray(index.shipments)?index.shipments:[],existing=shipments.find(item=>item.source==='supplier-delivery-note'&&item.deliveryNoteId===deliveryNoteId);
 if(!existing)return null;
 const orders=[];
 for(const id of orderIds){
  const order=shipments.find(item=>item.id===id&&item.source==='supplier-order'&&item.approvalStatus==='approved');
  if(!order)continue;
  if(member.role==='supplier'&&!supplierEmailMatches(order,member))continue;
  orders.push(await supplierOrderDetail(bucket,order));
 }
 return {ok:true,duplicate:true,orders,incomingShipment:{id:existing.id,ticketNumber:existing.ticketNumber,warehouse:existing.warehouse,arrivalDate:existing.arrivalDate,alreadyCreated:true},deliveredAt:existing.deliveredAt||existing.createdAt||new Date().toISOString()};
}

async function createIncomingFromSupplierDeliveryNote(bucket,body,member,orders,deliveredRows,deliveredAt,fail){
 const object=await bucket.get(incomingIndexKey),index=object?await object.json():{shipments:[]},shipments=Array.isArray(index.shipments)?index.shipments:[];
 const deliveryNoteId=String(body?.deliveryNoteId||'').trim().slice(0,160),fileName=String(body?.fileName||'Phiếu giao hàng NCC').trim().slice(0,250);
 if(deliveryNoteId){
  const existing=shipments.find(item=>item.source==='supplier-delivery-note'&&item.deliveryNoteId===deliveryNoteId);
  if(existing)return {id:existing.id,ticketNumber:existing.ticketNumber,warehouse:existing.warehouse,arrivalDate:existing.arrivalDate,alreadyCreated:true};
 }
 const orderMap=new Map((orders||[]).map(order=>[order.id,order])),lineMap=new Map(),supplierNames=new Set(),quoteNumbers=new Set(),internalNumbers=new Set();
 for(const input of deliveredRows){
  const order=orderMap.get(String(input?.orderId||''));if(!order)continue;
  const detailRow=(order.rows||[]).find(row=>String(row.sku||'').toLowerCase()===String(input?.sku||'').toLowerCase());
  if(!detailRow)continue;
  const quantity=stockInteger(Number(input?.quantity)||0);if(quantity<=0)continue;
  const sku=String(detailRow.sku||input.sku).trim(),key=sku.toLowerCase(),current=lineMap.get(key)||{...detailRow,sku,name:detailRow.name||'',unit:detailRow.unit||'',quantity:0,sourceOrders:[]};
  current.quantity+=quantity;
  current.sourceOrders.push({orderId:order.id,ticketNumber:order.ticketNumber||'',supplierInternalOrderNumber:order.supplierInternalOrderNumber||'',quantity});
  lineMap.set(key,current);
  if(order.supplierName)supplierNames.add(order.supplierName);
  if(order.quoteNumber)quoteNumbers.add(order.quoteNumber);
  if(order.supplierInternalOrderNumber)internalNumbers.add(order.supplierInternalOrderNumber);
 }
 const accepted=[...lineMap.values()].map(row=>{
  const quantity=stockInteger(Number(row.quantity)||0),perCarton=Number(row.perCarton),cartonCount=perCarton>0?quantity/perCarton:null,cartonWeight=Number(row.cartonWeight),length=Number(row.cartonLength),width=Number(row.cartonWidth),height=Number(row.cartonHeight);
  return {sku:row.sku,name:row.name||'',unit:row.unit||'',quantity,price:Number.isFinite(Number(row.unitPrice))?Number(row.unitPrice):Number.isFinite(Number(row.price))?Number(row.price):null,taxRate:Number.isFinite(Number(row.taxRate))?Number(row.taxRate):null,printFee:Number(row.printFee)||0,perCarton:perCarton||null,cartonWeight:cartonWeight||null,cartonLength:length||null,cartonWidth:width||null,cartonHeight:height||null,cartons:cartonCount,weightKg:cartonCount&&cartonWeight>0?cartonCount*cartonWeight:null,volumeM3:cartonCount&&length>0&&width>0&&height>0?cartonCount*length*width*height/1000000:null,sourceOrders:row.sourceOrders};
 }).filter(row=>row.quantity>0);
 if(!accepted.length)fail(400,'Phiếu giao không có dòng hợp lệ để đưa vào Hàng sắp về.');
 let quantity=0,cartons=0,weightKg=0,volumeM3=0,missingPackaging=0;
 for(const item of accepted){
  quantity+=item.quantity;
  if(item.cartons===null)missingPackaging++;else cartons+=item.cartons;
  if(item.weightKg===null)missingPackaging++;else weightKg+=item.weightKg;
  if(item.volumeM3===null)missingPackaging++;else volumeM3+=item.volumeM3;
 }
 const firstOrder=orders[0]||{},baseTicket=String(body?.ticketNumber||fileName.replace(/\.pdf$/i,'')||'Phiếu giao hàng NCC').trim().slice(0,90),safeTicket=baseTicket||`PGH-${deliveredAt.slice(0,10).replaceAll('-','')}`;
 let ticketNumber=safeTicket;
 if(shipments.some(item=>String(item.ticketNumber||'').toLowerCase()===ticketNumber.toLowerCase())){
  const suffix=(deliveryNoteId||crypto.randomUUID()).split('-').pop().slice(-6);
  ticketNumber=`${safeTicket}-${suffix}`.slice(0,100);
 }
 const arrivalDate=/^\d{4}-\d{2}-\d{2}$/.test(body?.dateKey||'')?body.dateKey:deliveredAt.slice(0,10);
 const id=crypto.randomUUID(),key=`incoming-stock/${id}-${crypto.randomUUID()}.json`,now=new Date().toISOString(),shipment={id,key,ticketNumber,warehouse:firstOrder.warehouse||'KHO VIGIFTS',arrivalDate,filename:fileName,supplierName:[...supplierNames].join(', ').slice(0,300),quoteNumber:[...quoteNumbers].join(', ').slice(0,100),supplierInternalOrderNumber:[...internalNumbers].join(', ').slice(0,100),paidAmount:0,source:'supplier-delivery-note',approvalStatus:'approved',supplierStatus:'confirmed',deliveryNoteId,deliveryFileName:fileName,deliveryTime:String(body?.deliveryTime||'').trim().slice(0,20),deliveryWarehouse:String(body?.deliveryWarehouse||'').trim().slice(0,120),vehicleNumber:String(body?.vehicleNumber||'').trim().slice(0,80),contactPerson:String(body?.contactPerson||'').trim().slice(0,120),deliveredAt,createdAt:now,createdBy:member.id,updatedAt:now,updatedBy:member.id,count:accepted.length,quantity,cartons,weightKg,volumeM3,missingPackaging};
 await bucket.put(key,JSON.stringify({...shipment,rows:accepted}),{httpMetadata:{contentType:'application/json'}});
 const indexedShipment={...shipment,stockRows:accepted.map(({sku,quantity})=>({sku,quantity}))};
 const committed=await bucket.put(incomingIndexKey,JSON.stringify({...index,shipments:[indexedShipment,...shipments]}),{httpMetadata:{contentType:'application/json'},onlyIf:object?{etagMatches:object.etag}:{etagDoesNotMatch:'*'}});
 if(!committed){await bucket.delete(key);fail(409,'Phiếu hàng sắp về vừa thay đổi. Vui lòng thử lại.');}
 return {id,ticketNumber,warehouse:shipment.warehouse,arrivalDate,count:shipment.count,quantity:shipment.quantity};
}

export async function uploadSupplierOrderSignature(bucket,body,member){
 const id=String(body?.id||'');
 const name=String(body?.fileName||'').trim().slice(0,180),type=String(body?.mimeType||'').trim().toLowerCase(),base64=String(body?.dataBase64||'').replace(/^data:[^,]+,/,'').trim();
 const allowed=/^(image\/(?:jpeg|jpg|png|webp)|application\/pdf)$/.test(type);
 if(!name||!allowed||!base64)throw new QuotationError(400,'Chỉ upload ảnh hoặc file PDF bản ký xác nhận.');
 let bytes;try{bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));}catch{throw new QuotationError(400,'File ký xác nhận không hợp lệ.');}
 if(!bytes.length||bytes.length>6*1024*1024)throw new QuotationError(400,'File ký xác nhận tối đa 6MB.');
 return updateSupplierPortalOrder(bucket,id,member,async(order)=>{
  const uploadedAt=new Date().toISOString(),extension=type==='application/pdf'?'.pdf':type.endsWith('png')?'.png':type.endsWith('webp')?'.webp':'.jpg',key=`supplier-signatures/${id}/${crypto.randomUUID()}${extension}`;
  await bucket.put(key,bytes,{httpMetadata:{contentType:type}});
  return {...order,supplierSignatureUploadedAt:uploadedAt,supplierSignatureUploadedBy:member.id,supplierSignatureFile:{key,name,type,size:bytes.length,uploadedAt,uploadedBy:member.id}};
 });
}

export async function deleteSupplierOrderSignature(bucket,body,member){
 const id=String(body?.id||'');
 return updateSupplierPortalOrder(bucket,id,member,async(order)=>{
  const key=order.supplierSignatureFile?.key;
  if(key)await bucket.delete(key);
  const {supplierSignatureUploadedAt,supplierSignatureUploadedBy,supplierSignatureDownloadedAt,supplierSignatureDownloadedBy,supplierSignatureFile,...rest}=order;
  return {...rest,supplierSignatureDeletedAt:new Date().toISOString(),supplierSignatureDeletedBy:member.id};
 });
}

export async function confirmSupplierOrder(bucket,body,member){
 const id=String(body?.id||''),rows=Array.isArray(body?.rows)?body.rows:[];
 return updateSupplierPortalOrder(bucket,id,member,async(order,fail)=>{
  const hasInternalOrder=Object.hasOwn(body||{},'supplierInternalOrderNumber')||Object.hasOwn(body||{},'supplierOrderNumber')||Object.hasOwn(body||{},'supplier_order_number');
  const supplierInternalOrderNumber=hasInternalOrder?String(body?.supplierInternalOrderNumber||body?.supplierOrderNumber||body?.supplier_order_number||'').trim():String(order.supplierInternalOrderNumber||'');
  if(supplierInternalOrderNumber.length>100)fail(400,'Số phiếu nội bộ NCC tối đa 100 ký tự.');
  if(order.supplierStatus==='confirmed'||order.supplierConfirmedAt)fail(409,'Đơn này đã được NCC xác nhận.');
  if(!order.supplierSignatureUploadedAt&&!order.supplierSignatureDownloadedAt)fail(400,'Vui lòng upload ảnh hoặc file bản ký xác nhận trước khi bấm Xác nhận.');
  const expected=Array.isArray(order.stockRows)?order.stockRows:[],discounts=new Map((order.itemDiscounts||[]).map(item=>[String(item.sku||'').toLowerCase(),Number(item.purchaseDiscount)||0]));
  if(!expected.length||rows.length!==expected.length)fail(400,'Cần xác nhận đầy đủ từng mã hàng.');
  const confirmations=new Map(),dateChanges=[],discountChanges=[];
  for(const row of rows){
   const sku=String(row?.sku||'').trim(),key=sku.toLowerCase(),quantity=stockInteger(Number(row?.quantity)||0),purchaseDiscount=Number(row?.purchaseDiscount),promisedDate=String(row?.promisedDate||'').trim(),supplierNote=String(row?.supplierNote||row?.note||'').trim().slice(0,500);
   if(!sku||confirmations.has(key)||!Number.isFinite(purchaseDiscount)||purchaseDiscount<0||purchaseDiscount>100||!/^\d{4}-\d{2}-\d{2}$/.test(promisedDate)||!Number.isFinite(Date.parse(promisedDate+'T00:00:00Z'))||row?.confirmed!==true)fail(400,'NCC cần tick xác nhận CK, SL và ngày hẹn giao cho từng mã.');
   confirmations.set(key,{sku,quantity,purchaseDiscount,promisedDate,supplierNote,confirmed:true});
  }
  for(const expectedRow of expected){
   const key=String(expectedRow.sku||'').toLowerCase(),confirmation=confirmations.get(key);
   if(!confirmation||confirmation.quantity!==stockInteger(Number(expectedRow.quantity)||0))fail(400,'Thông tin xác nhận không khớp đơn đã gửi NCC.');
   const originalDate=String(expectedRow.promisedDate||order.arrivalDate||'').trim();
   if(originalDate&&confirmation.promisedDate&&originalDate!==confirmation.promisedDate)dateChanges.push({sku:expectedRow.sku,name:expectedRow.name||'',from:originalDate,to:confirmation.promisedDate,note:confirmation.supplierNote||''});
   const originalDiscount=discounts.get(key)||0;
   if(confirmation.purchaseDiscount!==originalDiscount)discountChanges.push({sku:expectedRow.sku,name:expectedRow.name||'',from:originalDiscount,to:confirmation.purchaseDiscount,note:confirmation.supplierNote||''});
  }
  const confirmedAt=new Date().toISOString();
  return {...order,supplierInternalOrderNumber,supplierStatus:'confirmed',supplierConfirmedAt:confirmedAt,supplierConfirmedBy:member.id,supplierConfirmations:expected.map(row=>confirmations.get(String(row.sku||'').toLowerCase())),supplierDateChanges:dateChanges,supplierDiscountChanges:discountChanges};
 });
}

async function shipmentRows(bucket,shipment){
 if(Array.isArray(shipment.stockRows))return shipment.stockRows;
 const object=shipment.key?await bucket.get(shipment.key):null,saved=object?await object.json():null;
 return (saved?.rows||[]).filter(row=>!isPrintLogoRow(row)).map(row=>({sku:row.sku,quantity:row.quantity}));
}

async function reconcileReceivedIncomingStock(bucket,observedAt){
 const object=await bucket.get(incomingIndexKey);if(!object)return;
 const index=await object.json(),cutoff=Date.parse(observedAt);let changed=false;
 const shipments=(index.shipments||[]).map(shipment=>{if(shipment.receivedAt&&!shipment.stockSyncedAt&&Date.parse(shipment.receivedAt)<=cutoff){changed=true;return {...shipment,stockSyncedAt:new Date().toISOString()};}return shipment;});
 if(changed)await bucket.put(incomingIndexKey,JSON.stringify({...index,shipments}),{httpMetadata:{contentType:'application/json'},onlyIf:{etagMatches:object.etag}});
}

async function receivedIncomingDeltaSyncKeys(bucket,observedAt,rows){
 const object=await bucket.get(incomingIndexKey);if(!object)return new Set();
 const cutoff=Date.parse(observedAt);if(!Number.isFinite(cutoff))return new Set();
 const index=await object.json(),changedKeys=new Set(rows.flatMap(row=>Object.keys(row.stock||{}).map(warehouse=>receivedStockRowKey(warehouse,row.sku))));
 const syncKeys=new Set();
 for(const shipment of index.shipments||[]){
  if(!shipment.receivedAt||shipment.stockSyncedAt||Date.parse(shipment.receivedAt)>cutoff||!shipment.receivedWarehouse)continue;
  const syncedRows=new Set(Array.isArray(shipment.stockSyncedRows)?shipment.stockSyncedRows:[]);
  for(const row of await shipmentRows(bucket,shipment)){
   const key=receivedStockRowKey(shipment.receivedWarehouse,row.sku);
   if(!syncedRows.has(key)&&changedKeys.has(key))syncKeys.add(key);
  }
 }
 return syncKeys;
}

async function reconcileReceivedIncomingStockDelta(bucket,observedAt,rows){
 const object=await bucket.get(incomingIndexKey);if(!object)return;
 const cutoff=Date.parse(observedAt);if(!Number.isFinite(cutoff))return;
 const index=await object.json(),changedKeys=new Set(rows.flatMap(row=>Object.keys(row.stock||{}).map(warehouse=>receivedStockRowKey(warehouse,row.sku))));
 let changed=false;
 const shipments=[];
 for(const shipment of index.shipments||[]){
  if(!shipment.receivedAt||shipment.stockSyncedAt||Date.parse(shipment.receivedAt)>cutoff||!shipment.receivedWarehouse){shipments.push(shipment);continue;}
  const rowsForShipment=await shipmentRows(bucket,shipment),syncedRows=new Set(Array.isArray(shipment.stockSyncedRows)?shipment.stockSyncedRows:[]);
  for(const row of rowsForShipment){
   const key=receivedStockRowKey(shipment.receivedWarehouse,row.sku);
   if(changedKeys.has(key)&&!syncedRows.has(key)){syncedRows.add(key);changed=true;}
  }
  const expected=rowsForShipment.map(row=>receivedStockRowKey(shipment.receivedWarehouse,row.sku));
  const allSynced=expected.length&&expected.every(key=>syncedRows.has(key));
  shipments.push(allSynced?{...shipment,stockSyncedRows:[...syncedRows],stockSyncedAt:new Date().toISOString()}:{...shipment,stockSyncedRows:[...syncedRows]});
 }
 if(changed)await bucket.put(incomingIndexKey,JSON.stringify({...index,shipments}),{httpMetadata:{contentType:'application/json'},onlyIf:{etagMatches:object.etag}});
}

export async function receiveIncomingStock(bucket,body,member){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(member.role!=='manager')fail(403,'Chỉ Manager được xác nhận nhập kho.');
 if(!body||!/^[-a-f0-9]{36}$/i.test(body.id||'')||typeof body.warehouse!=='string'||!body.warehouse.trim())fail(400,'Phiếu hoặc kho nhập không hợp lệ.');
 const object=await bucket.get(incomingIndexKey);if(!object)fail(404,'Không tìm thấy phiếu hàng chờ về.');
 const index=await object.json(),position=(index.shipments||[]).findIndex(shipment=>shipment.id===body.id);if(position<0)fail(404,'Không tìm thấy phiếu hàng chờ về.');
 const shipment=index.shipments[position];
 if(shipment.receivedAt)return {ok:true,alreadyReceived:true,shipment:{id:shipment.id,ticketNumber:shipment.ticketNumber,warehouse:shipment.receivedWarehouse}};
 if(shipment.warehouse!==body.warehouse.trim())fail(409,'Kho nhập đã thay đổi. Vui lòng tải lại phiếu trước khi xác nhận.');
 const rows=await shipmentRows(bucket,shipment);if(!rows.length)fail(400,'Phiếu không có hàng để nhập kho.');
 const receivedAt=new Date().toISOString(),updated={...shipment,receivedAt,receivedBy:member.id,receivedWarehouse:shipment.warehouse,sapoReceiptId:String(body.sapoReceiptId||'').trim().slice(0,200),sapoReceiptCode:String(body.sapoReceiptCode||'').trim().slice(0,200)};
 const shipments=index.shipments.map((item,i)=>i===position?updated:item),committed=await bucket.put(incomingIndexKey,JSON.stringify({...index,shipments}),{httpMetadata:{contentType:'application/json'},onlyIf:{etagMatches:object.etag}});
 if(!committed)fail(409,'Phiếu hàng chờ về vừa thay đổi. Vui lòng thử lại.');
 return {ok:true,alreadyReceived:false,shipment:{id:updated.id,ticketNumber:updated.ticketNumber,warehouse:updated.receivedWarehouse,receivedAt:updated.receivedAt}};
}

export async function updateIncomingStockPayment(bucket,body,member){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(member.role!=='manager')fail(403,'Chỉ Manager được ghi nhận thanh toán phiếu hàng sắp về.');
 if(!body||!/^[-a-f0-9]{36}$/i.test(body.id||''))fail(400,'Phiếu hàng sắp về không hợp lệ.');
 const paidAmount=Number(body.paidAmount??body.amountPaid??body.paid_amount);
 if(!Number.isFinite(paidAmount)||paidAmount<0||paidAmount>1e12)fail(400,'Số tiền đã thanh toán không hợp lệ.');
 const object=await bucket.get(incomingIndexKey);if(!object)fail(404,'Không tìm thấy phiếu hàng chờ về.');
 const index=await object.json(),position=(index.shipments||[]).findIndex(shipment=>shipment.id===body.id);if(position<0)fail(404,'Không tìm thấy phiếu hàng chờ về.');
 const shipment=index.shipments[position];
 if(body.revision&&body.revision!==(shipment.updatedAt||shipment.createdAt))fail(409,'Phiếu đã được chỉnh sửa. Tải lại phiếu trước khi lưu thanh toán.');
 const now=new Date().toISOString(),updated={...shipment,paidAmount,paidUpdatedAt:now,paidUpdatedBy:member.id,updatedAt:now,updatedBy:member.id};
 const shipments=index.shipments.map((item,i)=>i===position?updated:item),committed=await bucket.put(incomingIndexKey,JSON.stringify({...index,shipments}),{httpMetadata:{contentType:'application/json'},onlyIf:{etagMatches:object.etag}});
 if(!committed)fail(409,'Phiếu hàng chờ về vừa thay đổi. Vui lòng thử lại.');
 return {ok:true,shipment:{id:updated.id,ticketNumber:updated.ticketNumber,paidAmount:updated.paidAmount,paidUpdatedAt:updated.paidUpdatedAt,updatedAt:updated.updatedAt}};
}

export async function deleteIncomingStock(bucket,body,member){
 const fail=(status,message)=>{throw new QuotationError(status,message);};
 if(member.role!=='manager')fail(403,'Chỉ Manager được xoá phiếu hàng sắp về.');
 if(!body||!/^[-a-f0-9]{36}$/i.test(body.id||''))fail(400,'Phiếu hàng sắp về không hợp lệ.');
 const object=await bucket.get(incomingIndexKey);if(!object)fail(404,'Không tìm thấy phiếu hàng chờ về.');
 const index=await object.json(),position=(index.shipments||[]).findIndex(shipment=>shipment.id===body.id);if(position<0)fail(404,'Không tìm thấy phiếu hàng chờ về.');
 const shipment=index.shipments[position];
 if(shipment.receivedAt)fail(409,'Phiếu đã nhập kho, không xoá khỏi danh sách chờ về.');
 if(body.revision&&body.revision!==(shipment.updatedAt||shipment.createdAt))fail(409,'Phiếu đã được chỉnh sửa. Tải lại phiếu trước khi xoá.');
 const savedObject=shipment.key?await bucket.get(shipment.key):null,saved=savedObject?await savedObject.json():{};
 const shipments=index.shipments.filter((_,i)=>i!==position);
 const committed=await bucket.put(incomingIndexKey,JSON.stringify({...index,shipments}),{httpMetadata:{contentType:'application/json'},onlyIf:{etagMatches:object.etag}});
 if(!committed)fail(409,'Phiếu hàng chờ về vừa thay đổi. Vui lòng thử lại.');
 if(shipment.key)await bucket.delete(shipment.key);
 const deletedAt=new Date().toISOString();
 return {ok:true,shipment:{...saved,...shipment,rows:Array.isArray(saved.rows)?saved.rows:[],deletedAt,deletedBy:member.id,supplierPortalRemoved:shipment.source==='supplier-order'&&shipment.approvalStatus==='approved'}};
}

export async function importPackaging(db,bucket,body,member,apply=false){
 const fail=(s,m)=>{throw new QuotationError(s,m);};
 if(member.role!=='manager')fail(403,'Chỉ Manager được cập nhật quy cách bằng file.');
 if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>50000||typeof body.filename!=='string'||body.filename.length>250)fail(400,'File quy cách không hợp lệ.');
 const data=await catalogData(bucket,db), products=new Map(data.products.map(p=>[p.sku.toLowerCase(),p]));
 const seen=new Set(), changed=[], unknown=[], notLock=[], noData=[];
 for(const row of body.rows){
  if(!row||typeof row.sku!=='string'||!row.sku.trim()||row.sku.length>200||!row.fields||typeof row.fields!=='object'||Array.isArray(row.fields))fail(400,'Dòng quy cách không hợp lệ.');
  const key=row.sku.trim().toLowerCase();if(seen.has(key))fail(400,'SKU bị lặp trong file: '+row.sku);seen.add(key);
  const product=products.get(key);if(!product){unknown.push(row.sku);continue;}
  if(!/lock/i.test(String(product.brand||''))){notLock.push(product.sku);continue;}
  const fields={};
  for(const name of ['perCarton','cartonWeight','cartonLength','cartonWidth','cartonHeight']){
   const value=row.fields[name];
   if(value===undefined||value===null||value==='')continue;
   if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000000)fail(400,'Quy cách không hợp lệ: '+row.sku);
   if(name==='perCarton'&&!Number.isInteger(value))fail(400,'SP/thùng phải là số nguyên: '+row.sku);
   if(value>0)fields[name]=value;
  }
  if(!Object.keys(fields).length){noData.push(product.sku);continue;}
  const different=Object.fromEntries(Object.entries(fields).filter(([name,value])=>Number(product[name]||0)!==value));
  if(Object.keys(different).length)changed.push({sku:product.sku,name:product.name,fields:different,before:Object.fromEntries(Object.keys(different).map(name=>[name,Number(product[name]||0)])),revision:product.revision||0});
 }
 const version={stockRevision:data.stockRevision,editRevision:data.editRevision,catalogKey:data.catalogKey};
 const summary={matched:changed.length,unknownCount:unknown.length,unknown:unknown.slice(0,100),notLockCount:notLock.length,noDataCount:noData.length,samples:changed.slice(0,20),version};
 if(!apply)return summary;
 if(!body.version||Object.entries(version).some(([key,value])=>body.version[key]!==value))fail(409,'Danh mục vừa thay đổi. Vui lòng xem trước lại file.');
 if(!changed.length)fail(400,'Không có SKU Lock nào cần cập nhật quy cách.');
 const timestamp=new Date().toISOString(), statements=[];
 for(const item of changed){
  const key=item.sku.toLowerCase(), previous=await db.prepare('SELECT data FROM product_edits WHERE sku=?').bind(key).first();
  const old=previous?JSON.parse(previous.data):{};
  const edit={fields:{...(old.fields||{}),...item.fields},prices:old.prices||{},stock:old.stock||{},source:old.source||'Lock data file'};
  if(previous)statements.push(db.prepare('UPDATE product_edits SET data=?,revision=revision+1,updated_at=?,updated_by=? WHERE sku=? AND revision=?').bind(JSON.stringify(edit),timestamp,member.id,key,item.revision));
  else statements.push(db.prepare('INSERT INTO product_edits (sku,data,revision,updated_at,updated_by) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING').bind(key,JSON.stringify(edit),1,timestamp,member.id));
 }
 const results=await db.batch(statements);
 if(results.some(result=>result.meta.changes!==1))fail(409,'Danh mục vừa thay đổi. Vui lòng xem trước lại file.');
 return {...summary,updatedAt:timestamp};
}

export async function restoreMissingPackaging(db,bucket,member,rows){
 const fail=(s,m)=>{throw new QuotationError(s,m);};
 if(member.role!=='manager')fail(403,'Chỉ Manager được khôi phục quy cách.');
 if(!Array.isArray(rows)||!rows.length||rows.length>50000)fail(400,'Bản sao lưu quy cách không hợp lệ.');
 const data=await catalogData(bucket,db),products=new Map(data.products.map(product=>[product.sku.toLowerCase(),product]));
 const existing=await db.prepare('SELECT sku,data,revision FROM product_edits').all();
 const edits=new Map(existing.results.map(row=>[row.sku,{...row,edit:JSON.parse(row.data)}]));
 const packingFields=['perCarton','cartonWeight','cartonLength','cartonWidth','cartonHeight'];
 const statements=[],timestamp=new Date().toISOString();let restored=0,skipped=0;
 for(const row of rows){
  const sku=String(row?.sku||'').trim(),product=products.get(sku.toLowerCase());
  if(!sku||!product||!row.fields)continue;
  const fields={};
  for(const name of packingFields){const value=Number(row.fields[name]);if(Number(product[name])===0&&Number.isFinite(value)&&value>0&&value<=1000000)fields[name]=value;}
  if(!Object.keys(fields).length){skipped++;continue;}
  const previous=edits.get(sku.toLowerCase()),old=previous?.edit||{};
  const edit={fields:{...(old.fields||{}),...fields},prices:old.prices||{},stock:old.stock||{},source:old.source||'Khôi phục từ bản sao lưu 09/09/2026'};
  if(previous)statements.push(db.prepare('UPDATE product_edits SET data=?,revision=revision+1,updated_at=?,updated_by=? WHERE sku=?').bind(JSON.stringify(edit),timestamp,member.id,sku.toLowerCase()));
  else statements.push(db.prepare('INSERT INTO product_edits (sku,data,revision,updated_at,updated_by) VALUES (?,?,?,?,?)').bind(sku.toLowerCase(),JSON.stringify(edit),1,timestamp,member.id));
  restored++;
 }
 for(let index=0;index<statements.length;index+=100)await db.batch(statements.slice(index,index+100));
 return {restored,skipped,updatedAt:timestamp};
}

const packingFields=['perCarton','cartonWeight','cartonLength','cartonWidth','cartonHeight'];
const packingNumber=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):0;
const isMinhLong=product=>/minh\s*long/i.test(String(product?.brand||''));
const cleanPackingName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

// The Sapo pattern field is the reliable separator between a product's shape and its decoration.
const packingFamily=product=>{
 const name=String(product?.name||'').replace(/\([^)]*\)/g,' ');
 const pattern=String(product?.pattern||'').trim();
 if(!name.trim()||!pattern||/^(mac dinh|default|n a)$/i.test(cleanPackingName(pattern)))return '';
 const patternWords=cleanPackingName(pattern).split(' ').filter(word=>word.length>1);
 let base=cleanPackingName(name);
 for(const word of patternWords)base=base.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\b`,'g'),' ');
 return base.replace(/\s+/g,' ').trim();
};
const packingSignature=product=>packingFields.map(field=>packingNumber(product[field])).join('|');
const missingPackingFields=(target,donor)=>Object.fromEntries(packingFields.filter(field=>!packingNumber(target[field])&&packingNumber(donor[field])).map(field=>[field,packingNumber(donor[field])]));

export async function inheritMinhLongPackaging(db,bucket,member,apply=false,version=null){
 const fail=(s,m)=>{throw new QuotationError(s,m);};
 if(member.role!=='manager')fail(403,'Chỉ Manager được cập nhật quy cách.');
 const data=await catalogData(bucket,db);
 const currentVersion={stockRevision:data.stockRevision,editRevision:data.editRevision,catalogKey:data.catalogKey};
 if(apply&&(!version||Object.entries(currentVersion).some(([key,value])=>version[key]!==value)))fail(409,'Danh mục vừa thay đổi. Vui lòng xem trước lại.');
 const groups=new Map();
 for(const product of data.products){
  if(!isMinhLong(product))continue;
  const family=packingFamily(product);if(!family)continue;
  const items=groups.get(family)||[];items.push(product);groups.set(family,items);
 }
 const candidates=[],conflicts=[];
 for(const [family,items] of groups){
  // A partial record cannot safely define the carton shape for other patterns.
  const donors=items.filter(item=>['perCarton','cartonLength','cartonWidth','cartonHeight'].every(field=>packingNumber(item[field])));
  const signatures=[...new Set(donors.map(packingSignature))];
  if(!donors.length)continue;
  if(signatures.length!==1){conflicts.push({family,count:items.length});continue;}
  const donor=donors[0];
  for(const target of items){
   const fields=missingPackingFields(target,donor);
   if(Object.keys(fields).length)candidates.push({sku:target.sku,name:target.name,donorSku:donor.sku,donorName:donor.name,fields,revision:target.revision||0});
  }
 }
 const summary={matched:candidates.length,groupCount:groups.size,conflictCount:conflicts.length,conflicts:conflicts.slice(0,30),samples:candidates.slice(0,30),version:currentVersion};
 if(!apply)return summary;
 if(!candidates.length)fail(400,'Không có mã Minh Long thiếu quy cách đủ điều kiện để áp dụng.');
 const timestamp=new Date().toISOString(),statements=[];
 for(const item of candidates){
  const key=item.sku.toLowerCase(),previous=await db.prepare('SELECT data FROM product_edits WHERE sku=?').bind(key).first();
  const old=previous?JSON.parse(previous.data):{};
  const edit={fields:{...(old.fields||{}),...item.fields},prices:old.prices||{},stock:old.stock||{},source:old.source||`Áp quy cách cùng kiểu dáng Minh Long từ ${item.donorSku}`};
  if(previous)statements.push(db.prepare('UPDATE product_edits SET data=?,revision=revision+1,updated_at=?,updated_by=? WHERE sku=? AND revision=?').bind(JSON.stringify(edit),timestamp,member.id,key,item.revision));
  else statements.push(db.prepare('INSERT INTO product_edits (sku,data,revision,updated_at,updated_by) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING').bind(key,JSON.stringify(edit),1,timestamp,member.id));
 }
 const results=await db.batch(statements);
 if(results.some(result=>result.meta.changes!==1))fail(409,'Danh mục vừa thay đổi. Vui lòng xem trước lại.');
 return {...summary,updatedAt:timestamp};
}
