import {contractDeliveryDate} from './contract-delivery-date.mjs';
import {quotationScope,quoteShareKeys} from './quotation-access.mjs';
import {QuotationError,resolveQuotationData} from './quotation-store.mjs';
import {derivedReportCache,reportDigest} from './report-derived-cache.mjs';
import {profitPeriods} from './quotation-profit.mjs';
const date=value=>{const v=String(value||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))?v:'';};
const completed=value=>/^(da giao hang|da giao|hoan thanh|da hoan thanh|da huy|huy|cancelled|canceled|delivered)$/i.test(String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').trim());
export function deliveryAlerts(records,now=new Date()){
 const today=profitPeriods(now).today,d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+7);const through=d.toISOString().slice(0,10),contracts=[],products=[],unresolved=[];
 for(const {quote,data,crm} of records){
  const number=String(data.contractDocument?.contractNumber||(['created','existing'].includes(crm?.status)?crm.contractNumber:'')||'').trim();
  if(!number||data.careStatus==='lost')continue;
  const common={quoteId:quote.id,quoteNo:quote.quoteNo||data.quoteNo,contractNumber:number,customer:data.customer||quote.customer||'Chưa nhập khách hàng',owner:data.owner||quote.creatorName||''};
  const outstanding=[];
  for(const [i,row] of (data.rows||[]).entries()){
   if(!(Number(row.qty)>0)||completed(row.status||row.productStatus))continue;
   const resolved=contractDeliveryDate(data,row),due=resolved.date;
   if(!due){unresolved.push({...common,sku:row.sku||'',name:row.name||'Sản phẩm',reason:resolved.reason});continue;}
   if(!due||due>through)continue;
   const line={...common,id:quote.id+':'+i,sku:row.sku||'',name:row.name||'Sản phẩm',qty:Number(row.qty),unit:row.unit||'SP',deliveryDate:due,deliverySource:resolved.source,status:row.status||'Đợi giao hàng',urgency:due<today?'overdue':due===today?'today':'upcoming'};
   outstanding.push(line);products.push(line);
  }
  if(outstanding.length){outstanding.sort((a,b)=>a.deliveryDate.localeCompare(b.deliveryDate));contracts.push({...common,id:quote.id,deliveryDate:outstanding[0].deliveryDate,urgency:outstanding[0].urgency,itemCount:outstanding.length});}
 }
 const order=(a,b)=>a.deliveryDate.localeCompare(b.deliveryDate)||String(a.quoteNo).localeCompare(String(b.quoteNo));
 return {today,through,contracts:contracts.sort(order),products:products.sort(order),unresolved};
}
export async function quotationDeliverySummary(db,bucket,viewer,options={}){
 if(!viewer?.active||viewer.role==='supplier')throw new QuotationError(403,'Tài khoản chưa được xem báo giá.');
 viewer={...viewer,positionId:viewer.positionId??viewer.position_id};
 const scope=quotationScope(viewer,quoteShareKeys(options.quoteShareOverrides,viewer));
 const statuses=await db.prepare("SELECT quote_number AS quoteNumber,contract_number AS contractNumber,status FROM contract_statuses WHERE status IN ('created','existing')").all();const crm=new Map((statuses.results||[]).map(r=>[r.quoteNumber,r]));
 const now=new Date(),today=profitPeriods(now).today;
 const memo=await derivedReportCache(bucket,'delivery-v2-'+await reportDigest([scope.sql,scope.bindings]),{force:options.force});
 const records=[];let cursor=0;
 for(;;){const p=await db.prepare(`SELECT q.rowid AS cursorRow,q.id,q.quote_no AS quoteNo,q.customer,q.data,m.name AS creatorName FROM staff_quotations q JOIN staff_members m ON m.id=q.creator_id WHERE (${scope.sql}) AND q.rowid>? ORDER BY q.rowid LIMIT 80`).bind(...scope.bindings,cursor).all(),rows=p.results||[];if(!rows.length)break;
  for(let i=0;i<rows.length;i+=8)records.push(...await Promise.all(rows.slice(i,i+8).map(async quote=>memo.get(String(quote.id),[today,quote,crm.get(quote.quoteNo)||null],async()=>deliveryAlerts([{quote,data:await resolveQuotationData(bucket,quote.data),crm:crm.get(quote.quoteNo)}],now)))));cursor=rows.at(-1).cursorRow;
 }
 const result=deliveryAlerts([],now),order=(a,b)=>a.deliveryDate.localeCompare(b.deliveryDate)||String(a.quoteNo).localeCompare(String(b.quoteNo));
 result.contracts=records.flatMap(r=>r.contracts).sort(order);result.products=records.flatMap(r=>r.products).sort(order);
 result.unresolved=records.flatMap(r=>r.unresolved||[]);
 await memo.save();return result;
}
