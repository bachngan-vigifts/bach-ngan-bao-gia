import {QuotationError} from './quotation-store.mjs';

const allowedStatuses=new Set(['created','existing','error','dry_run']);
const value=(input,length)=>input==null?'':String(input).trim().slice(0,length);
const httpsUrl=input=>{const raw=value(input,2000);if(!raw)return null;try{return new URL(raw).protocol==='https:'?raw:null;}catch{return null;}};

export async function upsertContractStatus(db,body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new QuotationError(400,'Dữ liệu trạng thái HĐKT không hợp lệ.');
 const quoteNumber=value(body.quote_number,200),status=value(body.status,40).toLowerCase();
 if(!quoteNumber)throw new QuotationError(400,'Thiếu số báo giá.');
 if(!allowedStatuses.has(status))throw new QuotationError(400,'Trạng thái HĐKT không hợp lệ.');
 const suppliedDate=new Date(body.updated_at),updatedAt=Number.isNaN(suppliedDate.getTime())?new Date().toISOString():suppliedDate.toISOString();
 const itemCount=body.item_count==null||body.item_count===''?null:Number(body.item_count);
 if(itemCount!==null&&(!Number.isInteger(itemCount)||itemCount<0))throw new QuotationError(400,'Số dòng sản phẩm không hợp lệ.');
 const row={quoteNumber,contractNumber:value(body.contract_number,300)||null,status,crmRowId:value(body.crm_row_id,300)||null,crmUrl:httpsUrl(body.crm_url),customerName:value(body.customer_name,500)||null,itemCount,message:value(body.message,4000)||null,resultJson:JSON.stringify(body).slice(0,50000),updatedAt};
 await db.prepare(`INSERT INTO contract_statuses (quote_number,contract_number,status,crm_row_id,crm_url,customer_name,item_count,message,result_json,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(quote_number) DO UPDATE SET contract_number=excluded.contract_number,status=excluded.status,crm_row_id=excluded.crm_row_id,crm_url=excluded.crm_url,customer_name=excluded.customer_name,item_count=excluded.item_count,message=excluded.message,result_json=excluded.result_json,updated_at=excluded.updated_at`)
  .bind(row.quoteNumber,row.contractNumber,row.status,row.crmRowId,row.crmUrl,row.customerName,row.itemCount,row.message,row.resultJson,new Date().toISOString(),row.updatedAt).run();
 return {success:true,status:row};
}

export async function getContractStatus(db,quoteNumber){
 const key=value(quoteNumber,200);if(!key)return null;
 return await db.prepare(`SELECT quote_number AS quoteNumber,contract_number AS contractNumber,status,crm_row_id AS crmRowId,crm_url AS crmUrl,customer_name AS customerName,item_count AS itemCount,message,updated_at AS updatedAt FROM contract_statuses WHERE quote_number=?`).bind(key).first()||null;
}
