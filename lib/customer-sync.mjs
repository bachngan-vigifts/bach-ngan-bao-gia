import {QuotationError} from './quotation-store.mjs';
import {clean,sapoAdminRequest} from './sapo-admin.mjs';
export const normalizeCustomerSearch=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
// Sapo imports require a populated tax ID and exclude generic retail customers.
// Local customers and historical quote references remain available.
export const isEligibleSapoCustomer=c=>/[1-9]/.test(String(c.taxCode||c.tax_code||''))&&!/^khach (?:hang )?le/.test(normalizeCustomerSearch(c.name||'').trim());
export const visibleCustomerSql="(substr(id,1,6)='local_' OR (tax_code GLOB '*[1-9]*' AND substr(search,length(id)+2) NOT GLOB 'khach le*' AND substr(search,length(id)+2) NOT GLOB 'khach hang le*'))";
export async function createLocalCustomer(db,body,updating=false){
  const clean=(key,max)=>{const value=body[key]??'';if(typeof value!=='string'||value.length>max)throw new QuotationError(400,'Thông tin khách hàng không hợp lệ.');return value.trim();};
  const id=clean('id',80),name=clean('name',500),contact=clean('contact',500),phone=clean('phone',100),email=clean('email',254).toLowerCase(),address=clean('address',2000);
  if(!(updating?/^[a-zA-Z0-9_-]+$/:/^local_[a-f0-9-]{36}$/).test(id)||!name)throw new QuotationError(400,'Vui lòng nhập tên khách hàng hợp lệ.');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new QuotationError(400,'Email khách hàng không hợp lệ.');
  const taxCode=clean('taxCode',100),customerCode=clean('customerCode',100),discounts={};
  if(body.discounts!==undefined&&(!body.discounts||typeof body.discounts!=='object'||Array.isArray(body.discounts)))throw new QuotationError(400,'Chiết khấu không hợp lệ.');
  for(const key of ['minhLong','lys','lock']){const value=body.discounts?.[key];if(value===undefined||value===null)continue;if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)throw new QuotationError(400,'Chiết khấu phải từ 0 đến 100%.');discounts[key]=value;}
  const customer={id,name,contact,phone,email,address,taxCode,customerCode,discounts:JSON.stringify(discounts)},search=normalizeCustomerSearch([id,name,contact,phone,email,taxCode,customerCode].join(' ')),stamp=new Date().toISOString();
  if(updating){
    if(typeof body.syncedAt!=='string'||!body.syncedAt)throw new QuotationError(400,'Vui lòng mở lại khách hàng trước khi cập nhật.');
    const changed=await db.prepare('UPDATE sapo_customers SET name=?,contact=?,phone=?,email=?,address=?,tax_code=?,customer_code=?,discounts=?,search=?,synced_at=? WHERE id=? AND synced_at=?').bind(name,contact,phone,email,address,taxCode,customerCode,customer.discounts,search,stamp,id,body.syncedAt).run();
    if(!changed.meta.changes)throw new QuotationError(409,'Khách hàng đã được cập nhật bởi người khác hoặc không còn tồn tại. Đóng form và tìm lại khách hàng để lấy thông tin mới.');
    return {customer:{...customer,discounts,syncedAt:stamp,source:id.startsWith('local_')?'local':'sapo'}};
  }
  await db.prepare(`INSERT INTO sapo_customers (id,name,contact,phone,email,address,search,source_version,synced_at,tax_code,customer_code,discounts,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(id,name,contact,phone,email,address,search,Date.now(),stamp,taxCode,customerCode,customer.discounts,stamp).run();
  const stored=await db.prepare('SELECT id,name,contact,phone,email,address,tax_code AS taxCode,customer_code AS customerCode,discounts FROM sapo_customers WHERE id=?').bind(id).first();
  if(Object.keys(customer).some(k=>customer[k]!==stored[k]))throw new QuotationError(409,'Mã khách hàng đã được sử dụng. Vui lòng mở lại chức năng thêm khách hàng.');
  return {customer:{...stored,discounts:JSON.parse(stored.discounts),source:'local'}};
}
export async function syncCustomers(db,body){
  if(!Array.isArray(body.customers)||body.customers.length>40)throw new QuotationError(400,'Mỗi lần đồng bộ tối đa 40 khách hàng.');
  const observed=Date.parse(body.observedAt);
  if(!Number.isFinite(observed)||observed>Date.now()+300000)throw new QuotationError(400,'Thiếu thời điểm lấy dữ liệu hợp lệ.');
  const text=(v,max)=>{if(typeof v!=='string'||v.length>max)throw new QuotationError(400,'Dữ liệu khách hàng không hợp lệ.');return v.trim();};
  const rows=body.customers.map(c=>{
    if(!c||typeof c!=='object')throw new QuotationError(400,'Dữ liệu khách hàng không hợp lệ.');
    const id=text(c.id,80);if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new QuotationError(400,'Mã khách hàng không hợp lệ.');
    if(id.startsWith('local_'))throw new QuotationError(400,'Mã khách hàng nội bộ không được đồng bộ từ Sapo.');
    const name=text(c.name,500),contact=text(c.contact||'',500),phone=text(c.phone||'',100),email=text(c.email||'',254),address=text(c.address||'',2000),taxCode=text(c.taxCode||c.tax_code||'',100),customerCode=text(c.customerCode||c.customer_code||'',100);
    if(!name)throw new QuotationError(400,'Khách hàng thiếu tên.');
    const version=c.updatedAt?Date.parse(c.updatedAt):observed;
    if(!Number.isFinite(version)||version>Date.now()+300000)throw new QuotationError(400,'Thời điểm cập nhật không hợp lệ.');
    const created=Date.parse(c.createdAt||c.created_at||'');
    const createdAt=Number.isFinite(created)&&created<=Date.now()+300000?new Date(created).toISOString():new Date(observed).toISOString();
    return {id,name,contact,phone,email,address,taxCode,customerCode,version,createdAt,search:normalizeCustomerSearch([id,name,contact,phone,email,taxCode,customerCode].join(' '))};
  });
  if(new Set(rows.map(c=>c.id)).size!==rows.length)throw new QuotationError(400,'Trùng mã khách hàng trong một trang.');
  if(!rows.length)return {received:0,applied:0};
  const skipped=rows.filter(c=>!isEligibleSapoCustomer(c)).length;
  const statements=rows.map(c=>!isEligibleSapoCustomer(c)
    ? db.prepare('UPDATE sapo_customers SET name=?,tax_code=?,search=?,source_version=?,synced_at=? WHERE id=? AND source_version<=?').bind(c.name,c.taxCode,c.search,c.version,new Date().toISOString(),c.id,c.version)
    : db.prepare(`INSERT INTO sapo_customers (id,name,contact,phone,email,address,search,source_version,synced_at,tax_code,customer_code,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,contact=excluded.contact,phone=excluded.phone,
    email=excluded.email,address=excluded.address,search=excluded.search,source_version=excluded.source_version,synced_at=excluded.synced_at,
    tax_code=excluded.tax_code,customer_code=excluded.customer_code
    WHERE excluded.source_version>=sapo_customers.source_version`).bind(c.id,c.name,c.contact,c.phone,c.email,c.address,c.search,c.version,new Date().toISOString(),c.taxCode,c.customerCode,c.createdAt));
  const result=await db.batch(statements);
  return {received:rows.length,applied:result.reduce((n,r,i)=>n+(isEligibleSapoCustomer(rows[i])?r.meta.changes:0),0),skipped};
}
export async function searchCustomers(db,q,newest=false){
  const normalized=normalizeCustomerSearch(String(q||'').slice(0,160)).trim();
  const words=normalized.split(/\s+/).filter(Boolean).slice(0,6);
  const filters=words.map(()=>"search LIKE ? ESCAPE '\\'").join(' AND ');
  const escape=s=>s.replace(/[\\%_]/g,'\\$&');
  const phrase=escape(normalized);
  const order=newest?'ORDER BY created_at DESC,id DESC':words.length?`ORDER BY CASE
    WHEN lower(id)=? OR lower(customer_code)=? OR lower(tax_code)=? THEN 0
    WHEN lower(name)=? THEN 1
    WHEN lower(name) LIKE ? ESCAPE '\\' OR lower(name) LIKE ? ESCAPE '\\' THEN 2
    WHEN lower(customer_code) LIKE ? ESCAPE '\\' OR lower(tax_code) LIKE ? ESCAPE '\\' THEN 3
    WHEN lower(name) LIKE ? ESCAPE '\\' THEN 4
    ELSE 5 END, source_version DESC, name,id`:'ORDER BY name,id';
  const orderArgs=!newest&&words.length?[normalized,normalized,normalized,normalized,phrase+'%','% '+phrase+'%',phrase+'%',phrase+'%','%'+phrase+'%']:[];
  const result=await db.prepare(`SELECT id,name,contact,phone,email,address,tax_code AS taxCode,customer_code AS customerCode,discounts,synced_at AS syncedAt,created_at AS createdAt FROM sapo_customers WHERE ${visibleCustomerSql} ${filters?'AND '+filters:''} ${order} LIMIT 25`).bind(...words.map(w=>'%'+escape(w)+'%'),...orderArgs).all();
  return {customers:result.results.map(c=>({...c,discounts:JSON.parse(c.discounts),source:c.id.startsWith('local_')?'local':'sapo'}))};
}

const addressText=customer=>{
  const address=customer.default_address||customer.defaultAddress||customer.addresses?.[0]||{};
  return clean(customer.address||customer.full_address||[
    address.address1||address.address,
    address.ward,
    address.district,
    address.province,
    address.country,
  ].filter(Boolean).join(', '));
};

const directCustomerRow=customer=>{
  const id=clean(customer.id);
  if(!/^[a-zA-Z0-9_-]+$/.test(id)||id.startsWith('local_'))return null;
  const name=clean(customer.name||customer.full_name||customer.company);
  if(!name)return null;
  return {
    id,
    name,
    contact:clean(customer.contact||customer.contact_name||customer.full_name||customer.representative),
    phone:clean(customer.phone||customer.mobile||customer.phone_number),
    email:clean(customer.email).toLowerCase(),
    address:addressText(customer),
    taxCode:clean(customer.taxCode||customer.tax_code),
    customerCode:clean(customer.customerCode||customer.customer_code||customer.code),
    createdAt:clean(customer.created_at||customer.createdAt||customer.created_on),
    updatedAt:clean(customer.updated_at||customer.updatedAt||customer.modified_on||customer.created_at||customer.createdAt)||new Date().toISOString(),
  };
};

export async function searchCustomersWithSapoFallback(db,q,env={},request=fetch,newest=false){
  const query=String(q||'').trim().slice(0,160),local=await searchCustomers(db,query,newest);
  if(local.customers.length||normalizeCustomerSearch(query).length<3)return local;
  try{
    const body=await sapoAdminRequest(env,'/customers.json?query='+encodeURIComponent(query)+'&limit=20',{},request);
    const customers=(body.customers||[]).map(directCustomerRow).filter(Boolean).slice(0,20);
    const synced=customers.length?await syncCustomers(db,{observedAt:new Date().toISOString(),customers}):{skipped:0};
    const refreshed=await searchCustomers(db,query,newest);
    return {...refreshed,sapoDirect:{checked:true,imported:customers.length-synced.skipped,skipped:synced.skipped}};
  }catch(error){
    return {...local,sapoDirect:{checked:false,error:error.message}};
  }
}
