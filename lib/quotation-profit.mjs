import '../public/quote-math.js';
import '../public/shipping.js';
import {QuotationError,resolveQuotationData} from './quotation-store.mjs';
const day=value=>{if(!value)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');};
export function profitPeriods(now=new Date()){
 const today=day(now),d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
 return {today,starts:{day:today,week:d.toISOString().slice(0,10),month:today.slice(0,7)+'-01',year:today.slice(0,4)+'-01-01'}};
}
export function aggregateContractProfit(records,now=new Date()){
 const {today,starts}=profitPeriods(now),periods=Object.fromEntries(Object.entries(starts).map(([key,from])=>[key,{from,to:today,profit:0,count:0,incompleteCount:0,legacyDateCount:0}]));
 for(const {data,crm} of records){
  const doc=data.contractDocument||{},hasDoc=!!String(doc.contractNumber||'').trim(),hasCrm=['created','existing'].includes(crm?.status)&&!!String(crm?.contractNumber||'').trim();
  if(!hasDoc&&!hasCrm)continue;
  const generated=day(hasDoc?doc.generatedAt:crm.createdAt),contractDay=generated||day(data.date);
  if(!contractDay||contractDay>today)continue;
  const shipping=globalThis.Shipping.calculate(data.rows||[],data.shipping||{}).fee;
  const gross=globalThis.QuoteMath.profit({...data,rows:data.rows||[]},shipping).gross;
  if(!Number.isFinite(gross))throw new QuotationError(503,'Số liệu lợi nhuận không hợp lệ. Vui lòng kiểm tra báo giá.');
  const incomplete=(data.rows||[]).some(r=>Number(r.qty)>0&&!(Number(r.costPrice)>0))||(data.shipping?.payer==='sender'&&!Number.isFinite(shipping))||(globalThis.QuoteMath.printingInfo(data).enabled&&!((data.rows||[]).some(r=>Number(r.printing?.unitPrice)>0)||Number(data.printing?.totalCost)>0));
  for(const p of Object.values(periods))if(contractDay>=p.from){p.profit+=gross;p.count++;p.incompleteCount+=incomplete?1:0;p.legacyDateCount+=generated?0:1;}
 }
 for(const p of Object.values(periods))p.profit=Math.round(p.profit);
 return {periods,asOf:new Date(now).toISOString(),timeZone:'Asia/Ho_Chi_Minh',dateBasis:'contract_generated'};
}
export async function quotationProfitSummary(db,bucket,viewer,now=new Date()){
 if(viewer?.role!=='manager')throw new QuotationError(403,'Chỉ quản lý được xem lợi nhuận.');
 const statuses=await db.prepare("SELECT quote_number AS quoteNumber,contract_number AS contractNumber,status,created_at AS createdAt FROM contract_statuses WHERE status IN ('created','existing') AND contract_number IS NOT NULL AND trim(contract_number)<>''").all();
 const crmByQuote=new Map((statuses.results||[]).map(r=>[r.quoteNumber,r]));
 const records=[];let cursor=0;
 // Read every payload, including legacy quotes without indexed contract metadata.
 for(;;){
  const page=await db.prepare('SELECT rowid AS cursorRow,quote_no AS quoteNo,data FROM staff_quotations WHERE rowid>? ORDER BY rowid LIMIT 80').bind(cursor).all(),rows=page.results||[];
  if(!rows.length)break;
  for(let i=0;i<rows.length;i+=8){const batch=await Promise.all(rows.slice(i,i+8).map(async row=>({data:await resolveQuotationData(bucket,row.data),crm:crmByQuote.get(row.quoteNo)})));records.push(...batch);}
  cursor=rows.at(-1).cursorRow;
 }
 return aggregateContractProfit(records,now);
}
