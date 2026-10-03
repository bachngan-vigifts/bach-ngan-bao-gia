import '../public/quote-math.js';
import '../public/shipping.js';
import {QuotationError,resolveQuotationData} from './quotation-store.mjs';
import {derivedReportCache} from './report-derived-cache.mjs';
const day=value=>{if(!value)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');};
export function profitPeriods(now=new Date()){
 const today=day(now),d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
 return {today,starts:{day:today,week:d.toISOString().slice(0,10),month:today.slice(0,7)+'-01',year:today.slice(0,4)+'-01-01'}};
}
export function contractProfitContribution({data,crm},now=new Date()){
 const doc=data.contractDocument||{},hasDoc=!!String(doc.contractNumber||'').trim(),hasCrm=['created','existing'].includes(crm?.status)&&!!String(crm?.contractNumber||'').trim();
 if(!hasDoc&&!hasCrm)return null;
 const generated=day(hasDoc?doc.generatedAt:crm.createdAt),contractDay=generated||day(data.date);
 if(!contractDay)return null;
 if(contractDay>profitPeriods(now).today)return {deferredUntil:contractDay};
 const shipping=globalThis.Shipping.calculate(data.rows||[],data.shipping||{}).fee;
 const gross=globalThis.QuoteMath.profit({...data,rows:data.rows||[]},shipping).gross;
 if(!Number.isFinite(gross))throw new QuotationError(503,'Số liệu lợi nhuận không hợp lệ. Vui lòng kiểm tra báo giá.');
 const incomplete=(data.rows||[]).some(r=>Number(r.qty)>0&&!(Number(r.costPrice)>0))||(data.shipping?.payer==='sender'&&!Number.isFinite(shipping))||(globalThis.QuoteMath.printingInfo(data).enabled&&!((data.rows||[]).some(r=>Number(r.printing?.unitPrice)>0)||Number(data.printing?.totalCost)>0));
 return {contractDay,gross,incomplete:!!incomplete,legacy:!generated};
}
export function aggregateProfitContributions(records,now=new Date()){
 const {today,starts}=profitPeriods(now),periods=Object.fromEntries(Object.entries(starts).map(([key,from])=>[key,{from,to:today,profit:0,count:0,incompleteCount:0,legacyDateCount:0}]));
 for(const c of records){if(!c||c.deferredUntil||c.contractDay>today)continue;
  for(const p of Object.values(periods))if(c.contractDay>=p.from){p.profit+=c.gross;p.count++;p.incompleteCount+=c.incomplete?1:0;p.legacyDateCount+=c.legacy?1:0;}
 }
 for(const p of Object.values(periods))p.profit=Math.round(p.profit);
 return {periods,asOf:new Date(now).toISOString(),timeZone:'Asia/Ho_Chi_Minh',dateBasis:'contract_generated'};
}
export function aggregateContractProfit(records,now=new Date()){
 return aggregateProfitContributions(records.map(record=>contractProfitContribution(record,now)),now);
}
export async function quotationProfitSummary(db,bucket,viewer,now=new Date(),options={}){
 if(viewer?.role!=='manager')throw new QuotationError(403,'Chỉ quản lý được xem lợi nhuận.');
 const statuses=await db.prepare("SELECT quote_number AS quoteNumber,contract_number AS contractNumber,status,created_at AS createdAt FROM contract_statuses WHERE status IN ('created','existing') AND contract_number IS NOT NULL AND trim(contract_number)<>''").all();
 const crmByQuote=new Map((statuses.results||[]).map(r=>[r.quoteNumber,r]));
 const memo=await derivedReportCache(bucket,'profit-v1',{force:options.force,now:new Date(now).getTime()});
 const today=profitPeriods(now).today,records=[];let cursor=0;
 // Recheck current rows/statuses; unchanged immutable R2 payloads need no read or calculation.
 for(;;){
  const page=await db.prepare('SELECT rowid AS cursorRow,quote_no AS quoteNo,data FROM staff_quotations WHERE rowid>? ORDER BY rowid LIMIT 80').bind(cursor).all(),rows=page.results||[];
  if(!rows.length)break;
  for(let i=0;i<rows.length;i+=8){const batch=await Promise.all(rows.slice(i,i+8).map(async row=>{const crm=crmByQuote.get(row.quoteNo);return memo.get(String(row.cursorRow),[row.data,crm||null],async()=>contractProfitContribution({data:await resolveQuotationData(bucket,row.data),crm},now),value=>!value?.deferredUntil||value.deferredUntil>today);}));records.push(...batch);}
  cursor=rows.at(-1).cursorRow;
 }
 const result=aggregateProfitContributions(records,now);await memo.save();return result;
}
