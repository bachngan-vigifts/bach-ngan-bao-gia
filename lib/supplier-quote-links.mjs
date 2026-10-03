import {quotationScope,quoteShareKeys} from './quotation-access.mjs';
import {resolveQuotationData} from './quotation-store.mjs';
export async function supplierQuoteLinks(db,bucket,result,viewer,overrides){
 if(!['manager','employee'].includes(viewer.role)||!result.orders?.length)return result;
 const member=await db.prepare('SELECT id,role,active,position_id AS positionId FROM staff_members WHERE id=? AND active=1').bind(viewer.id).first();if(!member)return result;
 const scope=quotationScope(member,quoteShareKeys(overrides,member));
 const orders=await Promise.all(result.orders.map(async order=>{
  if(!order.quoteNumber)return order;
  const q=await db.prepare(`SELECT q.id,q.data FROM staff_quotations q JOIN staff_members m ON m.id=q.creator_id WHERE (${scope.sql}) AND q.quote_no=? ORDER BY q.created_at DESC LIMIT 1`).bind(...scope.bindings,order.quoteNumber).first();if(!q)return order;
  const data=await resolveQuotationData(bucket,q.data),crm=await db.prepare("SELECT contract_number AS number,status FROM contract_statuses WHERE quote_number=?").bind(order.quoteNumber).first();
  return {...order,quoteLink:{id:q.id,customer:data.customer||'',contractNumber:data.contractDocument?.contractNumber||(['created','existing'].includes(crm?.status)?crm.number:'')||'',deliveryDate:data.deliveryDate||'',rows:(data.rows||[]).map(r=>({sku:r.sku,deliveryDate:r.deliveryDate||data.deliveryDate||''}))}};
 }));return {...result,orders};
}
