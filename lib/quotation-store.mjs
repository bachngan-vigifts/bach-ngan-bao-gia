import {derivedReportCache,reportDigest} from './report-derived-cache.mjs';
import { canEditQuotation, quotationScope, quoteShareKeys, quoteKeyOverridden } from './quotation-access.mjs';
export function validateContractWordEdits(value=[]){
 if(!Array.isArray(value)||value.length>1000||JSON.stringify(value).length>300000)throw new QuotationError(400,'Nội dung chỉnh Word quá lớn.');
 const seen=new Set();return value.map(e=>{if(!e||!Number.isInteger(e.index)||e.index<0||e.index>20000||seen.has(e.index)||!/^[a-f0-9]{64}$/.test(e.hash)||typeof e.text!=='string'||e.text.length>20000)throw new QuotationError(400,'Đoạn chỉnh Word không hợp lệ.');seen.add(e.index);const result={index:e.index,hash:e.hash,text:e.text};for(const k of ['bold','italic','underline'])if(e[k]!==undefined){if(typeof e[k]!=='boolean')throw new QuotationError(400,'Định dạng Word không hợp lệ.');result[k]=e[k];}if(e.align!==undefined){if(!['left','center','right','both'].includes(e.align))throw new QuotationError(400,'Căn lề Word không hợp lệ.');result.align=e.align;}return result;});
}
export function validateContractDocumentEdits(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['TAM_UNG','BBNT'].includes(k)))throw new QuotationError(400,'Loại hồ sơ chỉnh sửa không hợp lệ.');
 return Object.fromEntries(Object.entries(value).map(([key,edits])=>[key,validateContractWordEdits(edits)]));
}
const searchText=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
const searchMeta=data=>({date:data.date||'',customer:data.customer||'',products:data.rows.map(r=>[r.sku,r.name].join(' ')).join('\n')});
const quoteSearchMetadata=data=>{
  const contract=contractDocumentSummary(data), meta=searchMeta(data);
  return {
    quoteDate:meta.date||'',
    searchText:searchText([data.quoteNo,data.customer,data.customerTaxCode,data.customerCode,data.contact,data.phone,data.email,data.owner,meta.products,contract.contractNumber,contract.contractQuoteNo].join(' ')).slice(0,20000),
    contractNumber:contract.contractNumber,
    contractQuoteNo:contract.contractQuoteNo,
    hasContract:contract.hasContract?1:0,
  };
};
const quoteMeta=stored=>{try{return JSON.parse(stored||'{}')}catch{return {}}};
const contractDocumentSummary=data=>{
  const document=data?.contractDocument||{};
  const contractNumber=String(document.contractNumber||'').trim();
  const quoteNo=String(document.quoteNo||data?.quoteNo||'').trim();
  return {contractNumber,contractQuoteNo:quoteNo,hasContract:contractNumber?1:0};
};
const approvalStatus=stored=>{
  const meta=quoteMeta(stored);
  return meta.approvalStatus || (meta.pdfKey ? 'approved' : 'pending');
};
export const approvalTotal=data=>{
  let subtotal=0,tax=0;
  for(const row of data.rows||[]){
    const price=Number(row.price||0),discount=Number(row.discount||0);
    const net=Math.max(0,price-(row.discountType==='amount'?discount:price*discount/100));
    const after=(data.type==='VIGIFTS'?Math.round(net):net)+(data.type==='HRC'?0:Number(row.printFee||0));
    const line=after*Number(row.qty||0),rate=Number.isFinite(row.taxRate)?row.taxRate:Number(data.vat||0);
    subtotal+=line;tax+=line*rate/100;
  }
  // The approval rule follows the total displayed to users in the quotation UI.
  return Math.round(subtotal+tax);
};
const needsReapproval=(previous,next)=>approvalTotal(previous)!==approvalTotal(next)||String(previous.notes||'')!==String(next.notes||'');
const hasPdf=(options,row)=>quoteMeta(row.data).pdfKey && !quoteKeyOverridden(options.hidePdfOverrides,row.id,row.quoteNo,row.quote_no);
const listCursor=value=>{
  const match=String(value||'').match(/^(\d{4}-\d{2}-\d{2}T[^|]+)\|(\d+)$/);
  return match?{createdAt:match[1],rowid:Number(match[2])}:null;
};
const makeListCursor=row=>`${row.createdAt}|${row.cursorRow}`;
const productLinesQuoteLimit=200;
const productLinesConcurrency=12;
const mapConcurrent=async(items,limit,fn)=>{
  const output=new Array(items.length);
  let next=0;
  const workers=Array.from({length:Math.min(limit,items.length)},async()=>{
    while(next<items.length){
      const index=next++;
      try{output[index]=await fn(items[index],index);}
      catch{output[index]=null;}
    }
  });
  await Promise.all(workers);
  return output;
};
const allowedQuoteTypesFor=viewer=>{
  if(viewer.positionId==='sales-lock')return ['VIGIFTS'];
  if(viewer.positionId==='sales-ml')return ['HRC','B2B'];
  return ['HRC','B2B','VIGIFTS'];
};
const ensureQuoteTypeAllowed=(viewer,type)=>{
  if(!allowedQuoteTypesFor(viewer).includes(type))throw new QuotationError(403,'Tài khoản này chưa được tạo loại báo giá này.');
};
const customerKey=value=>searchText(value).replace(/[^a-z0-9]+/g,' ').trim();
const closedStatus=status=>['created','existing'].includes(String(status||'').toLowerCase());
const careStatuses=new Set(['','active','closed','lost']);
const activeCare=data=>data?.careStatus==='active'&&/^\d{4}-\d{2}-\d{2}$/.test(String(data?.careDueDate||''));

const quoteSearchSchemaState = new WeakMap();
export async function ensureQuotationSearchSchema(db) {
  if (!db || quoteSearchSchemaState.get(db)) return;
  const statements = [
    'ALTER TABLE staff_quotations ADD COLUMN quote_date TEXT',
    'ALTER TABLE staff_quotations ADD COLUMN search_text TEXT',
    'ALTER TABLE staff_quotations ADD COLUMN contract_number TEXT',
    'ALTER TABLE staff_quotations ADD COLUMN contract_quote_no TEXT',
    'ALTER TABLE staff_quotations ADD COLUMN has_contract INTEGER NOT NULL DEFAULT 0',
    'CREATE INDEX IF NOT EXISTS idx_quotations_quote_number ON staff_quotations(quote_no COLLATE NOCASE)',
    'CREATE INDEX IF NOT EXISTS idx_quotations_created ON staff_quotations(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_quotations_quote_date ON staff_quotations(quote_date)',
    'CREATE INDEX IF NOT EXISTS idx_quotations_contract ON staff_quotations(contract_number)',
    'CREATE INDEX IF NOT EXISTS idx_quotations_has_contract ON staff_quotations(has_contract, created_at)',
  ];
  for (const sql of statements) {
    try { await db.prepare(sql).run(); }
    catch (error) {
      if (!/duplicate column|already exists/i.test(String(error?.message || error))) throw error;
    }
  }
  quoteSearchSchemaState.set(db, true);
}

export class QuotationError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validateQuotation(input, maxBytes = 800000) {
  if (!input || typeof input !== 'object' || !['HRC','B2B','VIGIFTS'].includes(input.type) ||
      !Array.isArray(input.rows) || input.rows.length > 300) {
    throw new QuotationError(400, 'Báo giá không hợp lệ hoặc quá 300 dòng.');
  }
  if (input.rows.length < 1) throw new QuotationError(400, 'Vui lòng chọn ít nhất 1 sản phẩm trước khi lưu báo giá.');
  const text = (value, max) => {
    if (typeof value !== 'string' || value.length > max) throw new QuotationError(400, 'Nội dung báo giá không hợp lệ.');
    return value;
  };
  const number = (value, max) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new QuotationError(400, 'Số liệu báo giá không hợp lệ.');
    return value;
  };
  const result = { type: input.type };
  for (const key of ['quoteNo','date','customer','customerId','customerTaxCode','customerCode','customerAddress','contact','phone','email','owner','ownerPhone','notes']) {
    result[key] = text(input[key] ?? '', key === 'notes' ? 20000 : 500);
  }
  if (!result.quoteNo.trim()) throw new QuotationError(400, 'Vui lòng nhập số báo giá.');
  if(input.notesVersion===2)result.notesVersion=2;
  if(input.careStatus!==undefined||input.careDueDate!==undefined||input.careAssigneeId!==undefined||input.careNote!==undefined){
    const careStatus=text(input.careStatus??'',20);
    if(!careStatuses.has(careStatus))throw new QuotationError(400,'Trạng thái chăm sóc khách hàng không hợp lệ.');
    const careDueDate=text(input.careDueDate??'',20);
    if(careDueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(careDueDate))throw new QuotationError(400,'Ngày nhắc chăm sóc không hợp lệ.');
    if(careStatus)result.careStatus=careStatus;
    if(careDueDate&&careStatus==='active')result.careDueDate=careDueDate;
    if(input.careAssigneeId!==undefined)result.careAssigneeId=text(input.careAssigneeId??'',80);
    if(input.careNote!==undefined)result.careNote=text(input.careNote??'',3000);
    if(['closed','lost'].includes(careStatus)){result.careClosedAt=text(input.careClosedAt??new Date().toISOString(),80);result.careDueDate='';}
  }
  if(input.discountMode!==undefined){if(!['percent','amount'].includes(input.discountMode))throw new QuotationError(400,'Loại chiết khấu không hợp lệ.');result.discountMode=input.discountMode;}
  if(input.customerDiscounts!==undefined){
    if(!input.customerDiscounts||typeof input.customerDiscounts!=='object'||Array.isArray(input.customerDiscounts))throw new QuotationError(400,'Chiết khấu khách hàng không hợp lệ.');
    result.customerDiscounts={};for(const key of ['minhLong','lys','lock'])if(input.customerDiscounts[key]!==undefined&&input.customerDiscounts[key]!==null)result.customerDiscounts[key]=number(input.customerDiscounts[key],100);
  }
  if(input.contractDocument!==undefined){
    if(!input.contractDocument||typeof input.contractDocument!=='object'||Array.isArray(input.contractDocument))throw new QuotationError(400,'Dữ liệu HĐKT không hợp lệ.');
    const detailsIn=input.contractDocument.details||{}, details={};
    if(!detailsIn||typeof detailsIn!=='object'||Array.isArray(detailsIn))throw new QuotationError(400,'Thông tin HĐKT không hợp lệ.');
    for(const [key,max] of Object.entries({name:500,customerCode:100,taxCode:100,representativeName:500,representativeTitle:300,address:2000,deliveryAddress:2000,deliveryTime:2000,paymentMethod:1000,legalEntity:100,collectionAccountName:300}))details[key]=text(detailsIn[key]??'',max);
    const depositRate=Number(detailsIn.depositRate),paymentDays=Number(detailsIn.paymentDays);
    if(!Number.isFinite(depositRate)||depositRate<0||depositRate>100)throw new QuotationError(400,'Tỷ lệ thanh toán HĐKT không hợp lệ.');
    if(!Number.isInteger(paymentDays)||paymentDays<0||paymentDays>3650)throw new QuotationError(400,'Hạn thanh toán HĐKT không hợp lệ.');
    details.depositRate=depositRate;details.paymentDays=paymentDays;
    result.contractDocument={contractNumber:text(input.contractDocument.contractNumber??'',200),quoteNo:text(input.contractDocument.quoteNo??input.quoteNo??'',200),generatedAt:text(input.contractDocument.generatedAt??'',80),details};
    if(input.contractDocument.wordEdits!==undefined)result.contractDocument.wordEdits=validateContractWordEdits(input.contractDocument.wordEdits);
    if(input.contractDocument.documentEdits!==undefined)result.contractDocument.documentEdits=validateContractDocumentEdits(input.contractDocument.documentEdits);
    if(!result.contractDocument.contractNumber.trim())throw new QuotationError(400,'Thiếu số HĐKT.');
  }
  if(input.printing!==undefined){
    if(!input.printing||typeof input.printing!=='object'||Array.isArray(input.printing))throw new QuotationError(400,'Chi phí in gia công không hợp lệ.');
    result.printing={workshop:text(input.printing.workshop??'',180),totalCost:number(input.printing.totalCost??0,1e12),workshopExplicit:input.printing.workshopExplicit===true};
  }
  result.vat = number(input.vat, 100);
  if(input.shipping!==undefined){
    result.shipping={};for(const k of ['divisor','rate','extra'])result.shipping[k]=number(input.shipping?.[k]??(k==='divisor'?5000:0),1e12);
    const payer=input.shipping?.payer??'receiver';if(!['sender','receiver'].includes(payer))throw new QuotationError(400,'Bên thanh toán cước không hợp lệ.');result.shipping.payer=payer;
    if(result.shipping.divisor<1)throw new QuotationError(400,'Hệ số quy đổi phải từ 1 trở lên.');
  }
  result.rows = input.rows.map(row => {
    if (!row || typeof row !== 'object') throw new QuotationError(400, 'Dòng sản phẩm không hợp lệ.');
    const clean = { id: crypto.randomUUID() };
    for (const key of ['sku','name','unit','brand','pattern','image']) clean[key] = text(row[key] ?? '', key === 'image' ? 250000 : 4000);
    if (clean.image && !/^https:\/\//i.test(clean.image) && !/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(clean.image)) {
      throw new QuotationError(400, 'Hình ảnh phải dùng HTTPS hoặc ảnh JPEG, PNG, WebP.');
    }
    for (const key of ['qty','price','discount','printFee','perCarton','cartonWeight','cartonLength','cartonWidth','cartonHeight']) clean[key] = number(row[key] ?? 0, key === 'discount' ? (row.discountType==='amount'?Number(row.price||0):100) : 1e12);
    if(row.purchaseDiscount!==undefined&&row.purchaseDiscount!==null)clean.purchaseDiscount=number(row.purchaseDiscount,100);
    if(row.costPrice!==undefined)clean.costPrice=number(row.costPrice,1e12);
    if(row.printing!==undefined){if(!row.printing||typeof row.printing!=='object'||Array.isArray(row.printing))throw new QuotationError(400,'Phí in gia công không hợp lệ.');clean.printing={workshop:text(row.printing.workshop??'',180),unitPrice:number(row.printing.unitPrice??0,1e12),workshopExplicit:row.printing.workshopExplicit===true};}
    if(row.discountType!==undefined&&!['percent','amount'].includes(row.discountType))throw new QuotationError(400,'Loại chiết khấu không hợp lệ.');
    clean.discountType=row.discountType||'percent';
    if(row.taxRate!==undefined&&row.taxRate!==null)clean.taxRate=number(row.taxRate,100);
    if(row.bundleContents!==undefined)clean.bundleContents=text(row.bundleContents,2000);
    if(row.packagingDescription!==undefined)clean.packagingDescription=text(row.packagingDescription,2000);
    if(row.printDescription!==undefined)clean.printDescription=text(row.printDescription,2000);
    if(row.pricePolicy!==undefined)clean.pricePolicy=text(row.pricePolicy,200);
    return clean;
  });
  // A bounded JSON document keeps D1 rows small. Large uploaded images need R2.
  if (new TextEncoder().encode(JSON.stringify(result)).length > maxBytes) throw new QuotationError(413, 'Báo giá có quá nhiều ảnh tải lên. Vui lòng dùng đường dẫn ảnh Drive.');
  return result;
}

export async function resolveQuotationData(bucket, stored) {
  const data = JSON.parse(stored);
  if (!data.r2Key) return data; // Existing records migrate without changing their revision.
  if (!bucket || !/^quotations\/[a-zA-Z0-9/-]+\.json$/.test(data.r2Key)) throw new QuotationError(503, 'Kho lưu trữ chưa sẵn sàng.');
  const object = await bucket.get(data.r2Key);
  if (!object) throw new QuotationError(503, 'Không tìm thấy nội dung báo giá trong kho lưu trữ.');
  return object.json();
}

export function createQuotationStore(db, bucket = null, options = {}) {
  const member = async id => {
    const row = await db.prepare('SELECT id, name, role, position_id AS positionId, active FROM staff_members WHERE id = ? AND active = 1').bind(id).first();
    if (!row) throw new QuotationError(403, 'Tài khoản chưa được cấp quyền hoặc đã bị khóa.');
    return row;
  };
  return {
    async list(memberId, before = null, filters = {}) {
      const viewer = await member(memberId), scope = quotationScope(viewer, quoteShareKeys(options.quoteShareOverrides, viewer));
      const cursor=listCursor(before);
      const clean={};for(const key of ['from','to','customer','product','employee','contract','hasContract']){const value=filters[key]??'';if(typeof value!=='string'||value.length>200)throw new QuotationError(400,'Bộ lọc không hợp lệ.');clean[key]=value.trim();}
      for(const key of ['from','to'])if(clean[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(clean[key])||!Number.isFinite(Date.parse(clean[key]))))throw new QuotationError(400,'Ngày lọc không hợp lệ.');
      if(clean.from&&clean.to&&clean.from>clean.to)throw new QuotationError(400,'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      const where=[scope.sql,'(? IS NULL OR q.created_at < ? OR (q.created_at = ? AND q.rowid < ?))'],bindings=[...scope.bindings,cursor?.createdAt??null,cursor?.createdAt??null,cursor?.createdAt??null,cursor?.rowid??null];
      const like=value=>`%${searchText(value).replace(/[%_]/g,'')}%`;
      if(clean.from){where.push('(q.quote_date >= ? OR q.quote_date IS NULL OR q.quote_date = \'\')');bindings.push(clean.from);}
      if(clean.to){where.push('(q.quote_date <= ? OR q.quote_date IS NULL OR q.quote_date = \'\')');bindings.push(clean.to);}
      const numberSearch=/^BG[A-Z0-9]*-\d{8}-\d+$/i.test(clean.customer);
      if(numberSearch){where.push('q.quote_no LIKE ?');bindings.push('%'+clean.customer+'%');}
      else if(clean.customer){where.push('(q.search_text LIKE ? OR q.search_text IS NULL OR q.search_text = \'\')');bindings.push(like(clean.customer));}
      if(clean.product){where.push('(q.search_text LIKE ? OR q.search_text IS NULL OR q.search_text = \'\')');bindings.push(like(clean.product));}
      if(clean.contract){where.push('(q.contract_number LIKE ? OR q.contract_quote_no LIKE ? OR q.quote_no LIKE ? OR q.search_text LIKE ? OR q.search_text IS NULL OR q.search_text = \'\')');bindings.push(`%${clean.contract.replace(/[%_]/g,'')}%`,`%${clean.contract.replace(/[%_]/g,'')}%`,`%${clean.contract.replace(/[%_]/g,'')}%`,like(clean.contract));}
      if(clean.hasContract){where.push('(q.has_contract = 1 OR q.has_contract IS NULL)');}
      const rows=await db.prepare(`SELECT q.rowid AS cursorRow,q.id,q.quote_no AS quoteNo,q.quote_type AS type,q.customer,q.creator_id AS creatorId,
        m.name AS creatorName,m.email AS creatorEmail,p.name AS position,q.created_at AS createdAt,q.updated_at AS updatedAt,q.revision,q.data,
        q.quote_date AS quoteDate,q.search_text AS rowSearchText,q.contract_number AS contractNumber,q.contract_quote_no AS contractQuoteNo,q.has_contract AS hasContract,
        s.status AS sapoStatus,s.sapo_order_code AS sapoOrderCode,s.sapo_order_url AS sapoOrderUrl
        FROM staff_quotations q JOIN staff_members m ON m.id=q.creator_id
        LEFT JOIN staff_positions p ON p.id=m.position_id
        LEFT JOIN sapo_order_statuses s ON s.quote_number=q.quote_no
        WHERE ${where.join(' AND ')}
        ORDER BY q.created_at DESC,q.rowid DESC LIMIT 101`).bind(...bindings).all();
      const records=[];let last=null,scanned=0;
      const filtered=Object.values(clean).some(Boolean);
      const numberOnly=numberSearch&&!['from','to','product','contract','hasContract'].some(k=>clean[k]);
      const legacyRows=rows.results.slice(0,100).filter(row=>filtered&&!numberOnly&&(row.rowSearchText==null||row.rowSearchText===''));
      const resolvedLegacy=await mapConcurrent(legacyRows,8,async row=>({id:row.id,data:await resolveQuotationData(bucket,row.data)}));
      const legacyData=new Map(resolvedLegacy.filter(Boolean).map(item=>[item.id,item.data]));
      for(const row of rows.results.slice(0,100)){
        last=makeListCursor(row);scanned++;
        if(clean.employee&&!searchText(row.creatorName+' '+row.creatorEmail).includes(searchText(clean.employee)))continue;
        let contractSummary={contractNumber:row.contractNumber||'',contractQuoteNo:row.contractQuoteNo||'',hasContract:Number(row.hasContract||0)};
        if(filtered&&!numberOnly&&(row.rowSearchText==null||row.rowSearchText==='')){
          let fullData,meta;
          fullData=legacyData.get(row.id);
          if(!fullData)continue;
          meta=searchMeta(fullData);
          contractSummary=contractDocumentSummary(fullData);
          const fullSearch=searchText([row.quoteNo,row.customer,fullData.customer,meta.products,contractSummary.contractNumber,contractSummary.contractQuoteNo].join(' '));
          if(clean.customer&&!fullSearch.includes(searchText(clean.customer)))continue;
          if(clean.from&&meta.date<clean.from||clean.to&&meta.date>clean.to)continue;
          if((clean.from||clean.to)&&!meta.date)continue;
          if(clean.product&&!searchText(meta.products).includes(searchText(clean.product)))continue;
          if(clean.hasContract&&!contractSummary.hasContract)continue;
          if(clean.contract&&!fullSearch.includes(searchText(clean.contract)))continue;
        }
        const {data,creatorEmail,cursorRow,createdAt,quoteDate,rowSearchText,...record}=row,storedMeta=quoteMeta(data);
        if(!contractSummary.hasContract){
          const storedContract=contractDocumentSummary(storedMeta);
          if(storedContract.hasContract)contractSummary=storedContract;
        }
        if(clean.hasContract&&!contractSummary.contractNumber)continue;
        records.push({...record,approvalStatus:approvalStatus(data),approvedAt:storedMeta.approvedAt||'',approvedBy:storedMeta.approvedBy||'',hasPdf:hasPdf(options,row)?1:0,...contractSummary});
        if(records.length===50)break;
      }
      if(filters.summary==='1'){
        const rawById=new Map(rows.results.map(row=>[row.id,row]));
        const memo=await derivedReportCache(bucket,'quote-list-v1-'+await reportDigest([scope.sql,scope.bindings,before,clean]),{force:filters.refresh==='1'});
        const summaries=await mapConcurrent(records,8,async record=>{
          const row=rawById.get(record.id);
          return memo.get(record.id,[row.data,row.createdAt],async()=>{const full=legacyData.get(record.id)||await resolveQuotationData(bucket,row.data);
          return {total:approvalTotal(full),itemCount:(full.rows||[]).length,careStatus:full.careStatus||'',quoteDate:full.date||'',createdAt:row.createdAt};});
        });
        records.forEach((record,index)=>Object.assign(record,summaries[index]||{total:null,itemCount:null}));
        await memo.save();
      }
      return {records,nextCursor:rows.results.length>scanned?last:null};
    },
    async workForShift(memberId,{mode,date,from,to}) {
      const viewer=await member(memberId),scope=quotationScope(viewer,quoteShareKeys(options.quoteShareOverrides,viewer));
      if(!['delivery','created'].includes(mode)||!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to)))throw new QuotationError(400,'Khoảng thời gian báo giá không hợp lệ.');
      const where=[scope.sql],bindings=[...scope.bindings];
      if(mode==='created'){where.push('q.created_at>=? AND q.created_at<?');bindings.push(from,to);}
      const limit=mode==='delivery'?800:200;
      const rows=await db.prepare(`SELECT q.id,q.quote_no AS quoteNo,q.customer,q.data,q.created_at AS createdAt,q.updated_at AS updatedAt,m.name AS creatorName
        FROM staff_quotations q JOIN staff_members m ON m.id=q.creator_id WHERE ${where.join(' AND ')} ORDER BY q.created_at DESC,q.rowid DESC LIMIT ${limit+1}`).bind(...bindings).all();
      const source=(rows.results||[]).slice(0,limit),resolved=await mapConcurrent(source,productLinesConcurrency,async row=>({row,data:await resolveQuotationData(bucket,row.data)})),cards=[];
      for(const item of resolved){
        if(!item)continue;
        const {row,data}=item,deliveryDates=[data.deliveryDate,data.delivery_date,...(data.rows||[]).map(line=>line?.deliveryDate||line?.delivery_date)].map(value=>String(value||'').slice(0,10)).filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value));
        if(mode==='delivery'&&!deliveryDates.includes(date))continue;
        cards.push({id:row.id,quoteNo:row.quoteNo||data.quoteNo||'',customer:data.customer||row.customer||'Chưa nhập khách',contact:data.contact||'',phone:data.phone||'',email:data.email||'',createdAt:row.createdAt,updatedAt:row.updatedAt,creatorName:row.creatorName||'',deliveryDates:[...new Set(deliveryDates)],careStatus:data.careStatus||'',careDueDate:data.careDueDate||'',careAssigneeId:data.careAssigneeId||'',careNote:data.careNote||'',total:approvalTotal(data)});
      }
      return {mode,date,cards,limited:(rows.results||[]).length>limit};
    },
    async pendingCount(memberId) {
      const viewer = await member(memberId), scope = quotationScope(viewer, quoteShareKeys(options.quoteShareOverrides, viewer));
      const row = await db.prepare(`SELECT COUNT(*) AS count FROM staff_quotations q JOIN staff_members m ON m.id=q.creator_id
        WHERE ${scope.sql} AND COALESCE(json_extract(q.data,'$.approvalStatus'), CASE WHEN json_extract(q.data,'$.pdfKey') IS NOT NULL THEN 'approved' ELSE 'pending' END) <> 'approved'`)
        .bind(...scope.bindings).first();
      return {count:Number(row?.count||0)};
    },
    async closedCustomers(memberId) {
      const viewer = await member(memberId), scope = quotationScope(viewer, quoteShareKeys(options.quoteShareOverrides, viewer));
      const rows = await db.prepare(`SELECT q.quote_no AS quoteNo,q.customer,q.updated_at AS quoteUpdatedAt,
        m.name AS creatorName,s.status AS sapoStatus,s.sapo_order_code AS sapoOrderCode,
        s.sapo_order_url AS sapoOrderUrl,s.customer_name AS sapoCustomerName,s.updated_at AS sapoUpdatedAt,
        c.status AS contractStatus,c.contract_number AS contractNumber,c.crm_url AS crmUrl,
        c.customer_name AS contractCustomerName,c.updated_at AS contractUpdatedAt
        FROM staff_quotations q JOIN staff_members m ON m.id=q.creator_id
        LEFT JOIN sapo_order_statuses s ON s.quote_number=q.quote_no
        LEFT JOIN contract_statuses c ON c.quote_number=q.quote_no
        WHERE ${scope.sql} AND (s.status IN ('created','existing') OR c.status IN ('created','existing'))
        ORDER BY COALESCE(c.updated_at,s.updated_at,q.updated_at) DESC LIMIT 300`).bind(...scope.bindings).all();
      const customers=new Map();let sapoCount=0,crmCount=0;
      for(const row of rows.results){
        const hasSapo=closedStatus(row.sapoStatus),hasCrm=closedStatus(row.contractStatus);
        if(hasSapo)sapoCount++;
        if(hasCrm)crmCount++;
        const customer=row.contractCustomerName||row.sapoCustomerName||row.customer||'Chưa có tên khách';
        const key=customerKey(customer)||customerKey(row.quoteNo)||row.quoteNo;
        const previous=customers.get(key);
        const source=[...(previous?.source||[]),...(hasSapo?['Sapo']:[]),...(hasCrm?['CRM']:[])];
        const next={
          customer,
          quoteNo:row.quoteNo||previous?.quoteNo||'',
          creatorName:row.creatorName||previous?.creatorName||'',
          source:[...new Set(source)],
          sapoOrderCode:row.sapoOrderCode||previous?.sapoOrderCode||'',
          sapoOrderUrl:row.sapoOrderUrl||previous?.sapoOrderUrl||'',
          contractNumber:row.contractNumber||previous?.contractNumber||'',
          crmUrl:row.crmUrl||previous?.crmUrl||'',
          updatedAt:row.contractUpdatedAt||row.sapoUpdatedAt||row.quoteUpdatedAt||previous?.updatedAt||'',
        };
        customers.set(key,next);
      }
      return {count:customers.size,sapoCount,crmCount,customers:[...customers.values()].slice(0,8)};
    },
    async productLines(memberId) {
      const viewer = await member(memberId), scope = quotationScope(viewer, quoteShareKeys(options.quoteShareOverrides, viewer));
      const rows = await db.prepare(`SELECT q.id,q.quote_no AS quoteNo,q.quote_type AS type,q.customer,q.data,q.created_at AS createdAt,q.updated_at AS updatedAt,
        m.name AS creatorName,p.name AS position
        FROM staff_quotations q JOIN staff_members m ON m.id=q.creator_id
        LEFT JOIN staff_positions p ON p.id=m.position_id
        WHERE ${scope.sql}
        ORDER BY q.created_at DESC,q.rowid DESC LIMIT ${productLinesQuoteLimit+1}`).bind(...scope.bindings).all();
      const statusCounts=new Map(),lines=[],careCards=[];
      const safeNumber=value=>Number.isFinite(Number(value))?Number(value):0;
      const quoteRows=(rows.results||[]).slice(0,productLinesQuoteLimit);
      const resolvedQuotes=await mapConcurrent(quoteRows,productLinesConcurrency,async quote=>({quote,data:await resolveQuotationData(bucket,quote.data)}));
      for(const item of resolvedQuotes){
        if(!item)continue;
        const {quote,data}=item;
        const quoteStatus=approvalStatus(quote.data)==='approved'?'Đợi giao hàng':'Đợi triển khai';
        if(activeCare(data))careCards.push({
          id:quote.id,quoteId:quote.id,quoteNo:quote.quoteNo||data.quoteNo||'',quoteType:quote.type||data.type||'',
          customer:data.customer||quote.customer||'Chưa nhập khách',contact:data.contact||'',phone:data.phone||'',email:data.email||'',
          creatorName:quote.creatorName||'',position:quote.position||'',quoteDate:data.date||'',updatedAt:quote.updatedAt,
          careDueDate:data.careDueDate,careStatus:data.careStatus,total:approvalTotal(data)
        });
        for(const [index,row] of (data.rows||[]).entries()){
          if(!row||typeof row!=='object')continue;
          const status=String(row.status||row.productStatus||quoteStatus||'Đợi triển khai').trim()||'Đợi triển khai';
          const qty=safeNumber(row.qty),price=safeNumber(row.price),discount=safeNumber(row.discount),printFee=safeNumber(row.printFee);
          const net=Math.max(0,price-(row.discountType==='amount'?discount:price*discount/100));
          const unit=(data.type==='VIGIFTS'?Math.round(net):net)+(data.type==='HRC'?0:printFee);
          const rate=Number.isFinite(row.taxRate)?row.taxRate:safeNumber(data.vat);
          const beforeTax=unit*qty;
          statusCounts.set(status,(statusCounts.get(status)||0)+1);
          lines.push({
            id:`${quote.id}:${index}`,quoteId:quote.id,quoteNo:quote.quoteNo||data.quoteNo||'',quoteType:quote.type||data.type||'',
            customer:data.customer||quote.customer||'',creatorName:quote.creatorName||'',position:quote.position||'',createdAt:quote.createdAt,updatedAt:quote.updatedAt,
            quoteDate:data.date||'',status,sku:row.sku||'',name:row.name||'Sản phẩm',unit:row.unit||'',brand:row.brand||'',pattern:row.pattern||'',image:row.image||'',
            qty,price,discount,discountType:row.discountType||'percent',printFee,taxRate:rate,lineTotal:Math.round(beforeTax+beforeTax*rate/100)
          });
        }
      }
      const standard=['Đang sản xuất mẫu','Đã giao hàng','Đợi giao hàng','Đợi triển khai'];
      const statuses=[...new Set([...standard,...statusCounts.keys()])].map(name=>({name,count:statusCounts.get(name)||0}));
      careCards.sort((a,b)=>String(a.careDueDate).localeCompare(String(b.careDueDate))||String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return {lines,statuses,careCards,total:lines.length,quotes:quoteRows.length,limited:(rows.results||[]).length>productLinesQuoteLimit};
    },
    async get(memberId, id) {
      const viewer = await member(memberId), scope = quotationScope(viewer, quoteShareKeys(options.quoteShareOverrides, viewer));
      const row = await db.prepare(`SELECT q.*, m.name AS creator_name, m.phone AS creator_phone, m.position_id AS creator_position_id FROM staff_quotations q
        JOIN staff_members m ON m.id = q.creator_id WHERE q.id = ? AND ${scope.sql}`)
        .bind(id, ...scope.bindings).first();
      // Same response for an unknown id and another position's quotation.
      if (!row) throw new QuotationError(404, 'Không tìm thấy báo giá.');
      const data=await resolveQuotationData(bucket,row.data);
      if(viewer.role!=='manager'){delete data.printing;data.rows=(data.rows||[]).map(({purchaseDiscount,costPrice,printing,...item})=>item);}
      if(data.ownerPhone===undefined)data.ownerPhone=data.owner===row.creator_name?(row.creator_phone||''):'';
      const meta=quoteMeta(row.data);
      return { id: row.id, revision: row.revision, data, creatorName: row.creator_name, approvalStatus:approvalStatus(row.data), approvedAt:meta.approvedAt||'', approvedBy:meta.approvedBy||'', canEdit: canEditQuotation(viewer,{id:row.creator_id,positionId:row.creator_position_id}) };
    },
    async save(memberId, input, id = null, revision = null) {
      const viewer = await member(memberId), data = validateQuotation(input, bucket ? 8000000 : 800000), now = new Date().toISOString();
      ensureQuoteTypeAllowed(viewer,data.type);
      // Authorize updates before writing any new object. Conditional SQL below also
      // prevents lost updates; immutable objects remain available to old backups.
      let approvalMeta=null,previousData=null;
      const managerApproval=viewer.role==='manager'?{approvalStatus:'approved',approvedAt:now,approvedBy:viewer.id}:null;
      if (id) {
        const current = await db.prepare(`SELECT q.id,q.data FROM staff_quotations q JOIN staff_members creator ON creator.id=q.creator_id
          WHERE q.id=? AND q.revision=? AND EXISTS (SELECT 1 FROM staff_members v WHERE v.id=? AND v.active=1 AND (v.role='manager' OR q.creator_id=v.id OR (creator.position_id IS NOT NULL AND creator.position_id=v.position_id)))`)
          .bind(id,revision,viewer.id).first();
        if (!current) throw new QuotationError(409, 'Báo giá đã thay đổi hoặc không thuộc tài khoản của bạn.');
        previousData=await resolveQuotationData(bucket,current.data);
        const meta=quoteMeta(current.data);
        const keepApproval=approvalStatus(current.data)==='approved'&&!needsReapproval(previousData,data);
        approvalMeta=managerApproval||(keepApproval?{approvalStatus:'approved',approvedAt:meta.approvedAt||'',approvedBy:meta.approvedBy||''}:{approvalStatus:'pending'});
      }
      if(viewer.role!=='manager'){delete data.printing;if(previousData?.printing)data.printing=previousData.printing;}
      if(viewer.role!=='manager')data.rows=data.rows.map((row,index)=>{
        const preservedCost=previousData?.rows?.[index]?.costPrice,preservedDiscount=previousData?.rows?.[index]?.purchaseDiscount;
        const {purchaseDiscount,costPrice,printing,...cleanRow}=row;
        return {...cleanRow,...(previousData?.rows?.[index]?.printing?{printing:previousData.rows[index].printing}:{}),...(Number.isFinite(preservedDiscount)?{purchaseDiscount:preservedDiscount}:{}),...(Number.isFinite(preservedCost)&&preservedCost>0?{costPrice:preservedCost}:{})};
      });
      const searchColumns=quoteSearchMetadata(data);
      let encoded = JSON.stringify(data);
      if (bucket) {
        const r2Key = `quotations/${viewer.id}/${crypto.randomUUID()}.json`;
        await bucket.put(r2Key, encoded, {httpMetadata:{contentType:'application/json'}});
        const approval=approvalMeta||managerApproval||{approvalStatus:'pending'};
        encoded = JSON.stringify({r2Key,search:searchMeta(data),...approval});
      } else if (approvalMeta||managerApproval) {
        Object.assign(data,approvalMeta||managerApproval);
        encoded=JSON.stringify(data);
      }
      if (!id) {
        id = crypto.randomUUID();
        await db.prepare(`INSERT INTO staff_quotations (id, creator_id, quote_no, quote_type, customer, quote_date, search_text, contract_number, contract_quote_no, has_contract, data, revision, created_at, updated_at)
          SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ? FROM staff_members WHERE id = ? AND active = 1`)
          .bind(id, data.quoteNo, data.type, data.customer, searchColumns.quoteDate, searchColumns.searchText, searchColumns.contractNumber, searchColumns.contractQuoteNo, searchColumns.hasContract, encoded, now, now, viewer.id).run();
        return { id, revision: 1, approvalStatus:approvalStatus(encoded) };
      }
      if (!Number.isInteger(revision) || revision < 1) throw new QuotationError(400, 'Thiếu phiên bản báo giá.');
      const result = await db.prepare(`UPDATE staff_quotations SET quote_no = ?, quote_type = ?, customer = ?, quote_date = ?, search_text = ?, contract_number = ?, contract_quote_no = ?, has_contract = ?, data = ?, revision = revision + 1, updated_at = ?
        WHERE id = ? AND revision = ? AND EXISTS (SELECT 1 FROM staff_members v JOIN staff_members creator ON creator.id=staff_quotations.creator_id WHERE v.id = ? AND v.active = 1 AND (v.role = 'manager' OR staff_quotations.creator_id = v.id OR (creator.position_id IS NOT NULL AND creator.position_id = v.position_id)))`)
        .bind(data.quoteNo, data.type, data.customer, searchColumns.quoteDate, searchColumns.searchText, searchColumns.contractNumber, searchColumns.contractQuoteNo, searchColumns.hasContract, encoded, now, id, revision, viewer.id).run();
      if (!result.meta.changes) throw new QuotationError(409, 'Không thể ghi đè: báo giá đã thay đổi hoặc không thuộc tài khoản của bạn. Vui lòng mở lại hoặc lưu bản sao.');
      return { id, revision: revision + 1, approvalStatus:approvalStatus(encoded) };
    },
    async updateContractDetails(memberId,id,input={}) {
      const viewer=await member(memberId),revision=input.revision;
      if(!Number.isInteger(revision)||revision<1)throw new QuotationError(400,'Thiếu phiên bản hợp đồng.');
      const row=await db.prepare(`SELECT q.id,q.data,q.revision,q.creator_id,creator.position_id AS creator_position_id FROM staff_quotations q JOIN staff_members creator ON creator.id=q.creator_id WHERE q.id=?`).bind(id).first();
      if(!row||!canEditQuotation(viewer,{id:row.creator_id,positionId:row.creator_position_id}))throw new QuotationError(403,'Bạn không có quyền chỉnh hợp đồng này.');
      if(row.revision!==revision)throw new QuotationError(409,'Hợp đồng đã thay đổi. Vui lòng tải lại.');
      const data=await resolveQuotationData(bucket,row.data);
      if(!data.contractDocument?.contractNumber)throw new QuotationError(400,'Chưa có HĐKT đã sinh.');
      // Validate only the proposed contract fields; retain every original product,
      // private cost, approval field, contract number and creation timestamp.
      const validated=validateQuotation({...data,contractDocument:{...data.contractDocument,details:input.details}},8000000).contractDocument;
      const wordEdits=validateContractWordEdits(input.wordEdits??data.contractDocument.wordEdits??[]);
      const documentEdits=validateContractDocumentEdits(input.documentEdits??data.contractDocument.documentEdits??{});
      data.contractDocument={...data.contractDocument,details:validated.details,wordEdits,documentEdits};
      const meta=quoteMeta(row.data);let encoded=JSON.stringify(data);
      if(bucket){const r2Key=`quotations/${viewer.id}/${crypto.randomUUID()}.json`;await bucket.put(r2Key,encoded,{httpMetadata:{contentType:'application/json'}});encoded=JSON.stringify({...meta,r2Key});}
      const result=await db.prepare(`UPDATE staff_quotations SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM staff_members v JOIN staff_members creator ON creator.id=staff_quotations.creator_id WHERE v.id=? AND v.active=1 AND (v.role='manager' OR staff_quotations.creator_id=v.id OR (creator.position_id IS NOT NULL AND creator.position_id=v.position_id)))`).bind(encoded,new Date().toISOString(),id,revision,viewer.id).run();
      if(!result.meta.changes)throw new QuotationError(409,'Hợp đồng đã thay đổi hoặc quyền chỉnh sửa đã thay đổi.');
      return {id,revision:revision+1,approvalStatus:approvalStatus(encoded),details:validated.details,wordEdits,documentEdits};
    },
    async updateCare(memberId,id,input={}) {
      const viewer=await member(memberId), dueDate=String(input.dueDate||input.careDueDate||'').trim(),assigneeId=String(input.assigneeId||input.careAssigneeId||'').trim().slice(0,80),note=String(input.note||input.careNote||'').trim().slice(0,3000),status=String(input.status||input.careStatus||(dueDate||assigneeId||note?'active':'')).trim(), now=new Date().toISOString();
      if(!['active','closed','lost',''].includes(status))throw new QuotationError(400,'Trạng thái chăm sóc khách hàng không hợp lệ.');
      if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))throw new QuotationError(400,'Ngày nhắc chăm sóc khách hàng không hợp lệ.');
      if(assigneeId){const assignee=await db.prepare('SELECT id,role,position_id AS positionId FROM staff_members WHERE id=? AND active=1').bind(assigneeId).first();if(!assignee||(viewer.role!=='manager'&&assignee.role!=='manager'&&assignee.positionId!==viewer.positionId))throw new QuotationError(403,'Nhân viên được chỉ định không thuộc nhóm báo giá này.');}
      const row=await db.prepare(`SELECT q.id,q.data,q.revision,q.creator_id,creator.position_id AS creator_position_id FROM staff_quotations q
        JOIN staff_members creator ON creator.id=q.creator_id
        WHERE q.id=? AND EXISTS (SELECT 1 FROM staff_members v WHERE v.id=? AND v.active=1 AND (v.role='manager' OR q.creator_id=v.id OR (creator.position_id IS NOT NULL AND creator.position_id=v.position_id)))`)
        .bind(id,viewer.id).first();
      if(!row)throw new QuotationError(404,'Không tìm thấy báo giá.');
      if(!canEditQuotation(viewer,{id:row.creator_id,positionId:row.creator_position_id}))throw new QuotationError(403,'Bạn không có quyền cập nhật lịch chăm sóc báo giá này.');
      const data=await resolveQuotationData(bucket,row.data), meta=quoteMeta(row.data);
      if(status==='active'){data.careStatus='active';data.careDueDate=dueDate;data.careAssigneeId=assigneeId;data.careNote=note;delete data.careClosedAt;}
      else {data.careStatus=status||'';data.careDueDate='';data.careAssigneeId='';data.careNote='';data.careClosedAt=status?now:'';}
      const searchColumns=quoteSearchMetadata(data);
      let encoded;
      if(bucket&&meta.r2Key){
        const r2Key=`quotations/${viewer.id}/${crypto.randomUUID()}.json`;
        await bucket.put(r2Key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
        encoded=JSON.stringify({...meta,r2Key,search:searchMeta(data)});
      }else encoded=JSON.stringify(data);
      const result=await db.prepare('UPDATE staff_quotations SET quote_date=?, search_text=?, contract_number=?, contract_quote_no=?, has_contract=?, data=?, revision=revision+1, updated_at=? WHERE id=? AND revision=? AND data=?')
        .bind(searchColumns.quoteDate,searchColumns.searchText,searchColumns.contractNumber,searchColumns.contractQuoteNo,searchColumns.hasContract,encoded,now,id,row.revision,row.data).run();
      if(!result.meta.changes)throw new QuotationError(409,'Báo giá đã thay đổi. Vui lòng mở lại trước khi cập nhật lịch chăm sóc.');
      return {id,revision:row.revision+1,careStatus:data.careStatus||'',careDueDate:data.careDueDate||'',careAssigneeId:data.careAssigneeId||'',careNote:data.careNote||'',careClosedAt:data.careClosedAt||''};
    },
    async approve(memberId, id) {
      const viewer = await member(memberId);
      if (viewer.role !== 'manager') throw new QuotationError(403, 'Chỉ Manager được duyệt báo giá.');
      const row = await db.prepare('SELECT id,data,revision FROM staff_quotations WHERE id=?').bind(id).first();
      if (!row) throw new QuotationError(404, 'Không tìm thấy báo giá.');
      const meta=quoteMeta(row.data), now=new Date().toISOString();
      const next={...meta,approvalStatus:'approved',approvedAt:now,approvedBy:viewer.id};
      const result=await db.prepare('UPDATE staff_quotations SET data=?, revision=revision+1, updated_at=? WHERE id=? AND revision=? AND data=?')
        .bind(JSON.stringify(next),now,id,row.revision,row.data).run();
      if(!result.meta.changes) throw new QuotationError(409,'Báo giá đã thay đổi. Vui lòng mở lại trước khi duyệt.');
      return {id, revision:row.revision+1, approvalStatus:'approved', approvedAt:now, approvedBy:viewer.id};
    },
    async remove(memberId, id, revision) {
      const viewer = await member(memberId);
      if (!Number.isInteger(revision) || revision < 1) throw new QuotationError(400, 'Thiếu phiên bản báo giá.');
      const result = await db.prepare(`DELETE FROM staff_quotations WHERE id = ? AND revision = ? AND (creator_id = ? OR EXISTS (SELECT 1 FROM staff_members WHERE id = ? AND active = 1 AND role = 'manager'))
        AND EXISTS (SELECT 1 FROM staff_members WHERE id = ? AND active = 1)`)
        .bind(id, revision, viewer.id, viewer.id, viewer.id).run();
      if (!result.meta.changes) throw new QuotationError(409, 'Không thể xóa báo giá đã thay đổi hoặc bạn không có quyền xóa báo giá này.');
    },
  };
}
