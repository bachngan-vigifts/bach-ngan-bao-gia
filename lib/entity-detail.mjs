import {quotationScope,quoteShareKeys} from './quotation-access.mjs';
import {QuotationError,resolveQuotationData,approvalTotal} from './quotation-store.mjs';
import {derivedReportCache,reportDigest} from './report-derived-cache.mjs';
import {contractDeliveryDate} from './contract-delivery-date.mjs';
import {visibleCustomerSql} from './customer-sync.mjs';
import {readCatalog} from './product-catalog.mjs';
import {loadCrmDetailTables} from './vigifts-mirror-api.mjs';
const norm=v=>String(v||'').trim().toUpperCase();
export function customerMatches(c,d){if(d.customerId)return String(c.id)===String(d.customerId);return !!((c.customerCode&&norm(c.customerCode)===norm(d.customerCode))||(c.taxCode&&norm(c.taxCode)===norm(d.customerTaxCode)));}
const raw=v=>v&&typeof v==='object'?(v.tupleId||v.tuple_id||v.value||v.label||''):v;
export function customerDebt(customer,tables,allowedNumbers=null){
 const matches=(tables.KhachHang||[]).filter(r=>(customer.customerCode&&norm(raw(r.values?.['MÃ KH']))===norm(customer.customerCode))||(customer.taxCode&&norm(raw(r.values?.['Ma So Thue']))===norm(customer.taxCode)));
 if(matches.length!==1)return {available:false,reason:matches.length?'Có nhiều hồ sơ CRM trùng mã/MST, cần đối chiếu':'Chưa đối chiếu được mã khách hàng hoặc MST với CRM'};
 const orders=(tables['Nhập đơn hàng']||[]).filter(r=>String(raw(r.values?.KH_NDP))===matches[0].tupleId&&(!allowedNumbers||allowedNumbers.has(norm(raw(r.values?.['Số HĐ'])))));
 if(!orders.length)return {available:false,reason:'Chưa có HĐKT CRM phù hợp trong phạm vi xem'};
 let value=0,paid=0;const ids=new Set(orders.map(r=>r.tupleId)),payments=[];
 for(const order of orders){const v=order.values||{},amount=Number(raw(v['Thành tiền (+thuế)']));if(!Number.isFinite(amount)||(raw(v['Thành tiền (+thuế)'])==null||String(raw(v['Thành tiền (+thuế)'])).trim()===''))return {available:false,reason:'HĐKT CRM chưa có giá trị sau thuế đầy đủ'};value+=amount;}
 for(const p of tables['Sổ thu chi']||[])if(ids.has(String(raw(p.values?.['Số HĐ'])))){const amount=Number(raw(p.values?.['Số tiền thanh toán']));if(!Number.isFinite(amount)||raw(p.values?.['Số tiền thanh toán'])==null||String(raw(p.values?.['Số tiền thanh toán'])).trim()==='')return {available:false,reason:'Sổ thu chi có số tiền cần đối chiếu'};paid+=amount;payments.push({id:p.tupleId,date:raw(p.values?.['Ngày ghi nhận']),amount,note:raw(p.values?.['Nọi dung'])||''});}
 return {available:true,value,paid,balance:value-paid,contractCount:orders.length,payments,contracts:orders.map(r=>({id:r.tupleId,number:raw(r.values?.['Số HĐ']),value:Number(raw(r.values?.['Thành tiền (+thuế)'])),deliveryDate:raw(r.values?.['Ngày hẹn giao'])||''}))};
}
export async function entityDetail(db,bucket,viewer,env,{kind,id,force=false,includeDebt=true,quoteShareOverrides}={}){
 if(!viewer?.active||viewer.role==='supplier')throw new QuotationError(403,'Không có quyền xem hồ sơ.');
 if(!['customer','product'].includes(kind)||!id||id.length>200)throw new QuotationError(400,'Thiếu mã hồ sơ.');
 let entity,policies=[],warehouses=[];
 if(kind==='customer'){entity=await db.prepare(`SELECT id,name,contact,phone,email,address,tax_code AS taxCode,customer_code AS customerCode,created_at AS createdAt FROM sapo_customers WHERE id=? AND ${visibleCustomerSql}`).bind(id).first();}
 else {const catalog=await (await readCatalog(bucket,viewer.role,db,{force})).json();entity=(catalog.products||[]).find(p=>norm(p.sku)===norm(id));policies=catalog.pricePolicies||[];warehouses=catalog.warehouses||[];}
 if(!entity)throw new QuotationError(404,'Không tìm thấy hồ sơ.');
 viewer={...viewer,positionId:viewer.positionId??viewer.position_id};
 const scope=quotationScope(viewer,quoteShareKeys(quoteShareOverrides,viewer)),memo=await derivedReportCache(bucket,'entity-facts-v1-'+await reportDigest([scope.sql,scope.bindings]),{force});
 const quotes=[];let cursor=0;
 for(;;){const result=await db.prepare(`SELECT q.rowid AS cursorRow,q.id,q.data,q.quote_no AS quoteNo,q.updated_at AS updatedAt,m.name AS creatorName FROM staff_quotations q JOIN staff_members m ON m.id=q.creator_id WHERE (${scope.sql}) AND q.rowid>? ORDER BY q.rowid LIMIT 80`).bind(...scope.bindings,cursor).all(),rows=result.results||[];if(!rows.length)break;
 for(let i=0;i<rows.length;i+=8){const facts=await Promise.all(rows.slice(i,i+8).map(q=>memo.get(q.id,[q.data,q.updatedAt],async()=>{const d=await resolveQuotationData(bucket,q.data);return {id:q.id,quoteNo:q.quoteNo,updatedAt:q.updatedAt,owner:d.owner||q.creatorName,customer:d.customer,customerId:d.customerId,customerCode:d.customerCode,customerTaxCode:d.customerTaxCode,contractNumber:d.contractDocument?.contractNumber||'',total:approvalTotal(d),rows:(d.rows||[]).map(r=>({sku:r.sku,name:r.name,unit:r.unit,qty:Number(r.qty||0),delivery:contractDeliveryDate(d,r),status:r.status||r.productStatus||''}))};})));for(const q of facts)if(kind==='customer'?customerMatches(entity,q):q.rows.some(r=>norm(r.sku)===norm(id)))quotes.push(q);}
 cursor=rows.at(-1).cursorRow;}
 await memo.save();quotes.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 const products=new Map(),customers=new Map();for(const q of quotes){customers.set(q.customerId||q.customerCode||q.customerTaxCode||q.customer,{id:q.customerId,name:q.customer,code:q.customerCode});for(const r of q.rows){if(kind==='product'&&norm(r.sku)!==norm(id))continue;const key=norm(r.sku)||r.name,p=products.get(key)||{sku:r.sku,name:r.name,unit:r.unit,quoteQuantity:0,contractQuantity:0,quoteIds:new Set()};p.quoteQuantity+=r.qty;if(q.contractNumber)p.contractQuantity+=r.qty;p.quoteIds.add(q.id);products.set(key,p);}}
 let debt=null;if(kind==='customer') {
  if(!includeDebt)debt={available:false,loading:true,reason:'Đang tải công nợ CRM ở nền.'};
  else try{const {tables,...meta}=await loadCrmDetailTables(env,['KhachHang','Nhập đơn hàng','Sổ thu chi']);debt={...customerDebt(entity,tables,viewer.role==='manager'?null:new Set(quotes.filter(q=>q.contractNumber).map(q=>norm(q.contractNumber)))),...meta};}catch{debt={available:false,reason:'Chưa tải được công nợ CRM. Vui lòng thử lại.'};}
 }
 return {kind,entity,policies,warehouses,quotes,products:[...products.values()].map(({quoteIds,...p})=>({...p,quoteCount:quoteIds.size})),customers:[...customers.values()],debt,summary:{quoteCount:quotes.length,contractCount:quotes.filter(q=>q.contractNumber).length,productCount:products.size,customerCount:customers.size,quotedValue:quotes.reduce((s,q)=>s+q.total,0)},asOf:new Date().toISOString()};
}
