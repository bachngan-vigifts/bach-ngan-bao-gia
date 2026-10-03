import {QuotationError} from './quotation-store.mjs';

export const normalizeLegalCode=value=>{
  const normalized=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toUpperCase();
  if(normalized.includes('BACH'))return 'BN';
  if(normalized.includes('VIGIFTS')||normalized==='VG')return 'VG';
  if(normalized.includes('QTV'))return 'QTV';
  throw new QuotationError(400,'Pháp nhân chưa có mã cấp số HĐKT.');
};

export const compactContractCode=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,20);

const vietnamDateParts=now=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));

export async function generateContractNumber(db,payload,now=new Date()){
  if(!db?.prepare)throw new QuotationError(503,'Kho cấp số HĐKT chưa sẵn sàng.');
  const {day,month,year}=vietnamDateParts(now),legalCode=normalizeLegalCode(payload.legal_entity),customerCode=compactContractCode(payload.customer?.customer_code||payload.customer?.tax_code||payload.customer_tax_code);
  if(!customerCode)throw new QuotationError(400,'Chưa có mã khách hàng hoặc MST để tạo số HĐKT.');
  const id=`HDKT:${year}:${month}:${legalCode}`,updatedAt=now.toISOString();
  const row=await db.prepare(`INSERT INTO contract_counters (id,type,year,month,legal_entity,last_sequence,updated_at)
    VALUES (?,'HDKT',?,?,?,1,?)
    ON CONFLICT(id) DO UPDATE SET last_sequence=contract_counters.last_sequence+1,updated_at=excluded.updated_at
    RETURNING last_sequence AS sequence`).bind(id,Number(year),Number(month),legalCode,updatedAt).first();
  const sequence=Number(row?.sequence);
  if(!Number.isInteger(sequence)||sequence<1)throw new QuotationError(503,'Chưa tạo được số HĐKT hợp lệ.');
  return `${month}-${String(sequence).padStart(2,'0')}/${day}${month}${year}/HĐKT/${legalCode}-${customerCode}`;
}

// Reserve one number per quotation and legal entity; downloads and CRM share it.
export async function reserveContractNumber(db,payload){
 const quoteNumber=String(payload.quote_number||'').trim();
 if(!quoteNumber||quoteNumber.length>200)throw new QuotationError(400,'Thiếu số báo giá hợp lệ.');
 const legalCode=normalizeLegalCode(payload.legal_entity);
 const existing=await db.prepare('SELECT contract_number FROM contract_document_numbers WHERE quote_number=? AND legal_entity=?').bind(quoteNumber,legalCode).first();
 if(existing)return existing.contract_number;
 const crm=await db.prepare("SELECT contract_number FROM contract_statuses WHERE quote_number=? AND status IN ('created','existing')").bind(quoteNumber).first();
 const transferred=crm||await db.prepare('SELECT contract_number FROM contract_transfers WHERE quote_number=?').bind(quoteNumber).first();
 const prior=String(transferred?.contract_number||'');
 const number=prior.includes(`/HĐKT/${legalCode}-`)?prior:await generateContractNumber(db,payload);
 const reserved=await db.prepare(`INSERT INTO contract_document_numbers (quote_number,legal_entity,contract_number)
 VALUES (?,?,?) ON CONFLICT(quote_number,legal_entity) DO UPDATE SET contract_number=contract_document_numbers.contract_number
 RETURNING contract_number`).bind(quoteNumber,legalCode,number).first();
 return reserved.contract_number;
}
