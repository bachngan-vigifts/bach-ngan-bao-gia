import {exportFiles} from './r2-exports.mjs';
import {mappedMediaResponse, serveMediaFile, advanceMediaMigration, mediaMigrationStatus} from './r2-media.mjs';
import {supplierQuoteLinks} from './supplier-quote-links.mjs';
import {quotationDeliverySummary} from './quotation-delivery.mjs';
import {quotationProfitSummary} from './quotation-profit.mjs';
import {listPrintingWorkshops,createPrintingWorkshop} from './printing-workshops.mjs';
import {forceMergeStaffIdentity,reconcileStaffIdentities} from './staff-identity.mjs';
import {workCashLedger,requestWorkCash,reviewWorkCashRequest,refreshWorkCash,workContext,reportSapoOptions,saveWorkConfiguration,openReportShift,workShiftDetails,workShiftQuotes,syncWorkOrders,workAssistant,saveCashShift,saveWorkReport,workHistory,reviewWorkReport,reviewCashShift,workAuditHistory} from './work-reports.mjs';
import {reserveContractNumber} from './contract-number.mjs';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { initialStaff, initialPositions } from './initial-staff.mjs';
import { approvalTotal, createQuotationStore, ensureQuotationSearchSchema, QuotationError, resolveQuotationData } from './quotation-store.mjs';
import { makeBackup, exportBackup, migrateQuotePayloads } from './quotation-backup.mjs';
import { startFullBackup, advanceFullBackup, fullBackupStatus } from './full-backup.mjs';
import { checkNeonStorage } from './neon-storage-check.mjs';
import { startNeonStageCopy,advanceNeonStageCopy,neonStageStatus } from './neon-stage-copy.mjs';
import { syncCustomers, searchCustomersWithSapoFallback, createLocalCustomer, visibleCustomerSql } from './customer-sync.mjs';
import { syncStaffMembers } from './staff-sync.mjs';
import {contractTarget,transferContract} from './contract-transfer.mjs';
import {getContractStatus,upsertContractStatus} from './contract-status.mjs';
import {sendSapoCopy} from './sapo-copy.mjs';
import {loadSapoGoodsReceiptOptions,sendSapoGoodsReceipt} from './sapo-goods-receipt.mjs';
import {getSapoRuntimeSessionStatus,storeSapoRuntimeSession} from './sapo-admin.mjs';
import {notifySupplierOrderSafe} from './supplier-order-notify.mjs';
import {parseIncomingStockImage} from './incoming-stock-ocr.mjs';
import {triggerSapoStaffSync} from './sapo-staff-sync.mjs';
import { replaceCatalog, readCatalog, saveProduct, upsertSapoProductWebhook, importStock, applySapoInventoryDelta, applySapoInventoryWebhook, importPackaging, restoreMissingPackaging, inheritMinhLongPackaging, importIncomingStock, approveSupplierOrder, listApprovedSupplierOrders, getSupplierOrderSignatureFile, requestSupplierDeposit, updateSupplierInternalOrderNumber, markSupplierDeliveryReady, confirmSupplierDeliveryNote, uploadSupplierOrderSignature, deleteSupplierOrderSignature, confirmSupplierOrder, listSupplierPaymentRequests, listSupplierStockRequests, createSupplierStockRequest, respondSupplierStockRequest, paySupplierDeposit, countPendingSupplierOrders, listSupplierOrders, getSupplierOrder, listIncomingStock, getIncomingStock, receiveIncomingStock, updateIncomingStockPayment, deleteIncomingStock, auditCatalog, listSupplierOrderReminderSnapshot } from './product-catalog.mjs';
import { packagingRecoverySnapshot } from './packaging-recovery-snapshot.mjs';
import { createQuoteNotification, listQuoteNotifications, readQuoteNotifications } from './quote-notifications.mjs';
import { createWebNotification, listWebNotifications, readWebNotifications, subscribeWebPush, unsubscribeWebPush, webNotificationForClientEvent, webPushConfig } from './web-push-notifications.mjs';
import { upsertSapoStatus } from './sapo-status.mjs';
import {getCustomerContractProfile,saveCustomerContractProfile} from './customer-contract-profile.mjs';
import {crmOverview,listCrmTasks,createCrmTask,updateCrmTask} from './crm-core.mjs';
import {sendLalamoveRequest} from './lalamove-transfer.mjs';
import {loadLalamoveHistory} from './lalamove-history.mjs';
import {searchAddresses} from './address-search.mjs';
import {quoteKeyOverridden} from './quotation-access.mjs';

const cookieName = '__Host-bn-session';
// Persist sign-in on a trusted device while retaining server-side revocation controls.
const sessionLifetimeSeconds = 30 * 24 * 60 * 60;
const now = () => Math.floor(Date.now()/1000);
const digest = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('hex');
const json = (value, status=200, extra={}) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',...extra}});
const fail = (status, message) => { throw new QuotationError(status, message); };
const publicMember = m => ({id:m.id,name:m.name,phone:m.phone||'',email:m.email,role:m.role,positionId:m.position_id,position:m.position_name});
const inlineFilename = name => encodeURIComponent(String(name||'supplier-signature').replace(/[\r\n"]/g,'').slice(0,180)||'supplier-signature');
// Use the same implementation locally and in production: native Workers PBKDF2
// support/iteration limits differ across deployed runtime versions.
const derivePassword = async (password, salt, iterations) => Buffer.from(await pbkdf2Async(sha256,
  new TextEncoder().encode(password), new TextEncoder().encode(salt), { c: iterations, dkLen: 32 }));
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) fail(400,'Mật khẩu cần từ 8 đến 128 ký tự. Có thể dùng một cụm từ dễ nhớ.');
  const salt=randomBytes(16).toString('hex');
  return `pbkdf2-sha256$600000$${salt}$${(await derivePassword(password,salt,600000)).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [,iterations,salt,hash] = (stored || 'pbkdf2-sha256$600000$00000000000000000000000000000000$'+'00'.repeat(32)).split('$');
  const actual=await derivePassword(password,salt,Number(iterations));
  return timingSafeEqual(actual,Buffer.from(hash,'hex')) && Boolean(stored);
}
async function initialize(db, config) {
  if (await db.prepare('SELECT id FROM staff_setup WHERE id = ?').bind('initial-roster-v1').first()) return;
  if (!config) fail(503,'Hệ thống tài khoản đang được thiết lập. Vui lòng thử lại sau.');
  const seeds=JSON.parse(config);
  if (!initialStaff.every(m=>/^[a-f0-9]{64}$/.test(seeds[m.id]?.hash) && Number.isInteger(seeds[m.id]?.expires))) fail(503,'Chưa có cấu hình kích hoạt tài khoản.');
  const statements=initialPositions.map(p=>db.prepare('INSERT OR IGNORE INTO staff_positions (id,name) VALUES (?,?)').bind(p.id,p.name));
  for (const m of initialStaff) {
    statements.push(db.prepare('INSERT INTO staff_members (id,email,name,role,position_id,active,created_at,phone) VALUES (?,?,?,?,?,1,?,?) ON CONFLICT DO NOTHING').bind(m.id,m.email,m.name,m.role,m.positionId,new Date().toISOString(),m.phone));
    statements.push(db.prepare('INSERT INTO staff_credentials (member_id,activation_hash,activation_expires,version) VALUES (?,?,?,0) ON CONFLICT DO NOTHING').bind(m.id,seeds[m.id].hash,seeds[m.id].expires));
  }
  statements.push(db.prepare('INSERT INTO staff_setup (id) VALUES (?) ON CONFLICT DO NOTHING').bind('initial-roster-v1'));
  await db.batch(statements);
}
async function readBody(req, limit=8100000) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) fail(415,'Yêu cầu phải dùng JSON.');
  const reader=req.body?.getReader(); if (!reader) fail(400,'Thiếu nội dung.');
  const chunks=[]; let length=0;
  while (true) { const {done,value}=await reader.read(); if(done)break; length+=value.length; if(length>limit){await reader.cancel();fail(413,'Nội dung quá lớn.');} chunks.push(value); }
  const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try { const b=JSON.parse(new TextDecoder().decode(bytes)); if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b; } catch { fail(400,'Nội dung không hợp lệ.'); }
}
const customerSearchKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const businessCustomerPattern=/\b(cong ty|cty|tnhh|co phan|cp|dntn|doanh nghiep|chi nhanh|hkd|ho kinh doanh|hop tac xa|htx|nha hang|khach san|hotel|resort|spa|cafe|quan an|truong|benh vien|ubnd|sieu thi|showroom|dai ly|npp|phan phoi)\b/;
const isBusinessCustomer=row=>{
  const taxDigits=String(row.taxCode||'').replace(/\D/g,'');
  if(taxDigits.length>=10)return true;
  return businessCustomerPattern.test(customerSearchKey([row.name,row.customerCode,row.contact,row.email,row.address].join(' ')));
};
const quoteNumber=value=>{const number=Number(value||0);return Number.isFinite(number)?number:0;};
const quoteTotal=data=>{
  let subtotal=0,tax=0;
  for(const row of data?.rows||[]){
    const price=quoteNumber(row.price),qty=quoteNumber(row.qty),discount=quoteNumber(row.discount),printFee=quoteNumber(row.printFee);
    const net=Math.max(0,price-(row.discountType==='amount'?discount:price*discount/100));
    const unit=(data.type==='VIGIFTS'?Math.round(net):net)+(data.type==='HRC'?0:printFee);
    const line=unit*qty,rate=Number.isFinite(row.taxRate)?row.taxRate:quoteNumber(data.vat);
    subtotal+=line;tax+=line*rate/100;
  }
  return Math.round(subtotal+tax);
};
const safeParseJson=value=>{try{return JSON.parse(value||'{}')}catch{return {}}};
const customerAnalyticsQuoteLimit=800;
const customerAnalyticsConcurrency=16;
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
async function listWebQuoteCustomers(db,bucket=null){
  const [customerRows,quoteRows]=await Promise.all([
    db.prepare(`SELECT id,name,contact,phone,email,address,tax_code AS taxCode,customer_code AS customerCode,discounts,synced_at AS syncedAt,source_version AS sourceVersion
      FROM sapo_customers WHERE ${visibleCustomerSql} ORDER BY name,id LIMIT 2000`).all(),
    db.prepare(`SELECT q.id,q.quote_no AS quoteNo,q.customer,q.data,q.updated_at AS updatedAt,m.name AS creatorName,m.email AS creatorEmail,p.name AS position
      FROM staff_quotations q JOIN staff_members m ON m.id=q.creator_id LEFT JOIN staff_positions p ON p.id=m.position_id
      ORDER BY q.updated_at DESC LIMIT ${customerAnalyticsQuoteLimit+1}`).all(),
  ]);
  const customers=(customerRows.results||[]).filter(isBusinessCustomer).map(row=>({
    ...row,
    source:String(row.id||'').startsWith('local_')?'local':'sapo',
    discounts:safeParseJson(row.discounts),
    searchKey:customerSearchKey([row.id,row.name,row.contact,row.phone,row.email,row.taxCode,row.customerCode,row.address].join(' ')),
    quoteCount:0,
    quoteTotal:0,
    contractCount:0,
    lastQuoteAt:'',
    owners:[],
    quotes:[],
  }));
  const byId=new Map(customers.map(customer=>[String(customer.id),customer]));
  const ownerPush=(customer,row)=>{
    const label=[row.creatorName,row.position].filter(Boolean).join(' · ')||row.creatorEmail||'';
    if(label&&!customer.owners.includes(label))customer.owners.push(label);
  };
  const quoteList=(quoteRows.results||[]).slice(0,customerAnalyticsQuoteLimit);
  const resolvedQuotes=await mapConcurrent(quoteList,customerAnalyticsConcurrency,async row=>{
    let data;
    try{data=await resolveQuotationData(bucket,row.data);}
    catch{data=safeParseJson(row.data);}
    return {row,data};
  });
  for(const item of resolvedQuotes){
    if(!item)continue;
    const {row,data}=item;
    const keys=[
      customerSearchKey(data.customerId),
      customerSearchKey(data.customerCode),
      customerSearchKey(data.customerTaxCode),
      customerSearchKey(data.customer),
      customerSearchKey(row.customer),
    ].filter(Boolean);
    let customer=data.customerId&&byId.get(String(data.customerId));
    if(!customer)customer=customers.find(item=>keys.includes(customerSearchKey(item.id))||keys.includes(customerSearchKey(item.customerCode))||keys.includes(customerSearchKey(item.taxCode))||keys.some(key=>key&&item.searchKey.includes(key)&&key.length>=5));
    if(!customer)continue;
    const contractNumber=String(data.contractDocument?.contractNumber||'').trim(),total=quoteTotal(data);
    customer.quoteCount+=1;
    customer.quoteTotal+=total;
    customer.contractCount+=contractNumber?1:0;
    customer.lastQuoteAt=customer.lastQuoteAt&&customer.lastQuoteAt>row.updatedAt?customer.lastQuoteAt:row.updatedAt;
    ownerPush(customer,row);
    if(customer.quotes.length<20)customer.quotes.push({id:row.id,quoteNo:row.quoteNo||data.quoteNo||'',type:data.type||'',date:data.date||'',customer:data.customer||row.customer||'',total,contractNumber,updatedAt:row.updatedAt,creatorName:row.creatorName||'',position:row.position||''});
  }
  return {customers:customers.map(({searchKey,...customer})=>customer),total:customers.length,limited:(quoteRows.results||[]).length>customerAnalyticsQuoteLimit};
}
async function rateLimit(db, key, limit) {
  const time=now(), bucket=digest(key);
  const row=await db.prepare(`INSERT INTO staff_auth_attempts (key,count,expires) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires <= ? THEN 1 ELSE count+1 END,
    expires=CASE WHEN expires <= ? THEN excluded.expires ELSE expires END RETURNING count`).bind(bucket,time+900,time,time).first();
  if(row.count>limit) fail(429,'Đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.');
}
async function session(db, req) {
  const raw=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!/^[a-f0-9]{64}$/.test(raw||''))fail(401,'Vui lòng đăng nhập bằng email công ty.');
  const hash=digest(raw);
  const m=await db.prepare(`SELECT m.*, p.name AS position_name FROM staff_sessions s
    JOIN staff_members m ON m.id=s.member_id JOIN staff_credentials c ON c.member_id=m.id
    LEFT JOIN staff_positions p ON p.id=m.position_id
    WHERE s.hash=? AND s.expires>? AND m.active=1 AND s.version=c.version`).bind(hash,now()).first();
  if(!m)fail(401,'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  return {m,hash};
}

export async function staffPageRole(db, req) {
  try{return (await session(db,req)).m.role;}
  catch{return null;}
}

export async function staffPageMember(db, req) {
  try{return publicMember((await session(db,req)).m);}
  catch{return null;}
}

const sessionCookie = (value, age=sessionLifetimeSeconds) => `${cookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const roleFromPosition = positionId => positionId === 'manager' ? 'manager' : positionId === 'supplier' ? 'supplier' : 'employee';
const sapoTokenOk = (req,url,secret) => {
  if(!secret)return false;
  const auth=req.headers.get('authorization')||'', headerToken=req.headers.get('x-sapo-inventory-token')||'', queryToken=url.searchParams.get('token')||'';
  return timingSafeEqual(Buffer.from(digest(auth)),Buffer.from(digest('Bearer '+secret)))
    || timingSafeEqual(Buffer.from(digest(headerToken)),Buffer.from(digest(secret)))
    || timingSafeEqual(Buffer.from(digest(queryToken)),Buffer.from(digest(secret)));
};
async function ensurePositions(db){
 const supplierPosition=initialPositions.find(p=>p.id==='supplier');
 if(supplierPosition)await db.prepare('INSERT OR IGNORE INTO staff_positions (id,name) VALUES (?,?)').bind(supplierPosition.id,supplierPosition.name).run();
}
async function webNotifySafe(db, env, options) {
  try { return await createWebNotification(db, env, options); }
  catch (error) { console.error('web_push_notify_failed', options?.eventType || 'unknown', error?.name, error?.message); return {ok:false,error:error?.message||String(error)}; }
}
async function webNotifyStaffAudience(db, env, {positionId='', memberIds=[], ...options}) {
  const ids=new Set((memberIds||[]).filter(Boolean));
  const rows=await db.prepare(`SELECT id FROM staff_members WHERE active=1 AND (role='manager' OR (?<>'' AND position_id=?) ${ids.size?`OR id IN (${[...ids].map(()=>'?').join(',')})`:''})`)
    .bind(positionId||'',positionId||'',...[...ids]).all();
  const targets=[...new Set((rows.results||[]).map(row=>row.id))];
  const results=[];
  for(const targetMemberId of targets)results.push(await webNotifySafe(db,env,{...options,targetRole:'all',targetMemberId}));
  return {ok:true,count:results.length,results};
}
async function webNotifyQuoteAudience(db, env, quoteId, actorMember, options) {
  const row=await db.prepare(`SELECT q.creator_id AS creatorId,creator.position_id AS creatorPositionId
    FROM staff_quotations q JOIN staff_members creator ON creator.id=q.creator_id WHERE q.id=?`).bind(quoteId).first();
  return webNotifyStaffAudience(db,env,{...options,positionId:row?.creatorPositionId||actorMember.position_id||'',memberIds:[row?.creatorId,actorMember.id].filter(Boolean)});
}
const money = value => `${new Intl.NumberFormat('vi-VN', {maximumFractionDigits: 0}).format(Math.round(Number(value) || 0))} đ`;
function quoteApprovalTotal(data) {
  try { return approvalTotal(data || {rows: []}); }
  catch (error) { console.error('quote_total_for_notification_failed', error?.name, error?.message); return 0; }
}
function quoteApprovalNotificationBody(actorName, data, action) {
  const quoteNo = data?.quoteNo || 'báo giá';
  const customer = data?.customer || 'Chưa nhập khách hàng';
  return `${actorName} ${action} ${quoteNo} · ${customer} · Tổng gồm VAT: ${money(quoteApprovalTotal(data))}`;
}
const quoteSaveNotificationTitle = (created, approvalStatus) => created
  ? (approvalStatus === 'approved' ? 'Báo giá mới đã lưu' : 'Báo giá mới cần duyệt')
  : (approvalStatus === 'approved' ? 'Báo giá đã chỉnh sửa' : 'Báo giá cập nhật chờ duyệt');

async function staffApiInternal(req, env) {
  try {
    const url=new URL(req.url), path=url.pathname.slice('/api/staff'.length), method=req.method;
    if(path==='/integrations/sapo/catalog' && method==='POST'){
      if(!sapoTokenOk(req,url,env.SAPO_SYNC_TOKEN))fail(401,'Không được phép đồng bộ.');
      return json(await replaceCatalog(env.FILES,await readBody(req,20000000)));
    }
    if(path==='/integrations/sapo/product' && method==='POST'){
      const secret=env.SAPO_PRODUCT_SYNC_TOKEN||env.SAPO_SYNC_TOKEN||env.SAPO_INVENTORY_SYNC_TOKEN;
      if(!sapoTokenOk(req,url,secret))fail(401,'Không được phép đồng bộ sản phẩm.');
      if(!env.DB||!env.FILES)fail(503,'Cơ sở dữ liệu hoặc kho danh mục chưa sẵn sàng.');
      return json(await upsertSapoProductWebhook(env.DB,env.FILES,await readBody(req,1000000)));
    }
    if(path==='/integrations/sapo/customers' && method==='POST'){
      const secret=env.SAPO_CUSTOMER_SYNC_TOKEN||env.SAPO_INVENTORY_SYNC_TOKEN||env.SAPO_SYNC_TOKEN;
      if(!sapoTokenOk(req,url,secret))fail(401,'Không được phép đồng bộ.');
      return json(await syncCustomers(env.DB,await readBody(req,200000)));
    }
    if(path==='/integrations/sapo/staff' && method==='POST'){
      const secret=env.SAPO_STAFF_SYNC_TOKEN||env.SAPO_INVENTORY_SYNC_TOKEN||env.SAPO_SYNC_TOKEN;
      if(!sapoTokenOk(req,url,secret))fail(401,'Không được phép đồng bộ nhân viên.');
      if(!env.DB)fail(503,'Cơ sở dữ liệu chưa sẵn sàng.');
      return json(await syncStaffMembers(env.DB,await readBody(req,100000)));
    }
    if(path==='/integrations/sapo/inventory' && method==='POST'){
      const secret=env.SAPO_INVENTORY_SYNC_TOKEN||env.SAPO_SYNC_TOKEN;
      if(!sapoTokenOk(req,url,secret))fail(401,'Không được phép cập nhật tồn kho Sapo.');
      if(!env.DB||!env.FILES)fail(503,'Cơ sở dữ liệu hoặc kho danh mục chưa sẵn sàng.');
      return json(await applySapoInventoryDelta(env.DB,env.FILES,await readBody(req,300000)));
    }
    if(path==='/integrations/sapo/inventory-webhook' && method==='POST'){
      const secret=env.SAPO_INVENTORY_SYNC_TOKEN||env.SAPO_SYNC_TOKEN;
      if(!sapoTokenOk(req,url,secret))fail(401,'Không được phép cập nhật tồn kho Sapo.');
      if(!env.DB||!env.FILES)fail(503,'Cơ sở dữ liệu hoặc kho danh mục chưa sẵn sàng.');
      return json(await applySapoInventoryWebhook(env.DB,env.FILES,await readBody(req,300000),{locationMap:env.SAPO_INVENTORY_LOCATION_MAP}));
    }
    if(path==='/integrations/sapo/status' && method==='POST'){
      const auth=req.headers.get('authorization')||'';
      if(!env.SAPO_STATUS_TOKEN || !timingSafeEqual(Buffer.from(digest(auth)),Buffer.from(digest('Bearer '+env.SAPO_STATUS_TOKEN))))fail(401,'Không được phép cập nhật trạng thái Sapo.');
      if(!env.DB)fail(503,'Cơ sở dữ liệu chưa sẵn sàng.');
      return json(await upsertSapoStatus(env.DB,await readBody(req,100000)));
    }
    if(path==='/integrations/contract/status' && method==='POST'){
      const auth=req.headers.get('authorization')||'';
      if(!env.CONTRACT_STATUS_TOKEN||!timingSafeEqual(Buffer.from(digest(auth)),Buffer.from(digest('Bearer '+env.CONTRACT_STATUS_TOKEN))))fail(401,'Không được phép cập nhật trạng thái HĐKT.');
      if(!env.DB)fail(503,'Cơ sở dữ liệu chưa sẵn sàng.');
      return json(await upsertContractStatus(env.DB,await readBody(req,200000)));
    }
    if(path==='/integrations/supplier-order-reminders' && method==='GET'){
      const auth=req.headers.get('authorization')||'';
      if(!env.SUPPLIER_ORDER_REMINDER_TOKEN||!timingSafeEqual(Buffer.from(digest(auth)),Buffer.from(digest('Bearer '+env.SUPPLIER_ORDER_REMINDER_TOKEN))))fail(401,'Không được phép đọc lịch nhắc NCC.');
      if(!env.FILES)fail(503,'Kho đơn hàng chưa sẵn sàng.');
      return json(await listSupplierOrderReminderSnapshot(env.FILES));
    }
    if(path==='/integrations/push-test' && method==='POST'){
      const secret=env.SAPO_INVENTORY_SYNC_TOKEN||env.SAPO_SYNC_TOKEN;
      if(!sapoTokenOk(req,url,secret))fail(401,'Không được phép gửi test push.');
      if(!env.DB)fail(503,'Cơ sở dữ liệu chưa sẵn sàng.');
      const db=env.DB, body=await readBody(req,10000), memberId=String(body.memberId||'NV002').trim();
      if(!/^[A-Za-z0-9_-]{1,80}$/.test(memberId))fail(400,'Mã nhân viên không hợp lệ.');
      await initialize(db,env.STAFF_ACTIVATION_SEEDS);
      await ensurePositions(db);
      const member=await db.prepare('SELECT id,name FROM staff_members WHERE id=? AND active=1').bind(memberId).first();
      if(!member)fail(404,'Không tìm thấy nhân viên nhận test push.');
      return json(await createWebNotification(db,env,{eventType:'push_test',targetRole:'all',targetMemberId:member.id,title:'Test thông báo web',body:`Claw test push cho ${member.name} · ${new Date().toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`,url:'/quote',data:{memberId:member.id,test:true}}));
    }
    if(path==='/integrations/push-status' && method==='GET'){
      const secret=env.SAPO_INVENTORY_SYNC_TOKEN||env.SAPO_SYNC_TOKEN;
      if(!sapoTokenOk(req,url,secret))fail(401,'Không được phép đọc trạng thái push.');
      if(!env.DB)fail(503,'Cơ sở dữ liệu chưa sẵn sàng.');
      const db=env.DB;
      await initialize(db,env.STAFF_ACTIVATION_SEEDS);
      await ensurePositions(db);
      const rows=await db.prepare(`SELECT m.id,m.name,m.email,m.role,m.position_id AS positionId,p.name AS positionName,
        COUNT(CASE WHEN s.disabled_at IS NULL THEN 1 END) AS activeSubscriptions,
        COUNT(CASE WHEN s.disabled_at IS NOT NULL THEN 1 END) AS disabledSubscriptions,
        COALESCE(SUM(CASE WHEN s.disabled_at IS NULL THEN s.failure_count ELSE 0 END),0) AS activeFailures,
        MAX(CASE WHEN s.disabled_at IS NULL THEN s.last_seen_at END) AS lastSeenAt,
        MAX(CASE WHEN s.disabled_at IS NULL THEN s.updated_at END) AS pushUpdatedAt
        FROM staff_members m LEFT JOIN staff_positions p ON p.id=m.position_id
        LEFT JOIN staff_web_push_subscriptions s ON s.member_id=m.id
        WHERE m.active=1
        GROUP BY m.id,m.name,m.email,m.role,m.position_id,p.name
        ORDER BY CASE WHEN m.role='manager' THEN 0 ELSE 1 END,m.id`).all();
      return json({members:rows.results||[]});
    }
    if(path==='/integrations/sapo-session' && ['GET','POST'].includes(method)){
      const secret=env.SAPO_INVENTORY_SYNC_TOKEN||env.SAPO_SYNC_TOKEN;
      if(!sapoTokenOk(req,url,secret))fail(401,'Không được phép kiểm tra phiên Sapo.');
      if(!env.DB)fail(503,'Cơ sở dữ liệu chưa sẵn sàng.');
      if(method==='POST'){
        const body=await readBody(req,50000), result=await storeSapoRuntimeSession(env.DB,env,body.cookie,'integration');
        return json({ok:true,updatedAt:result.updatedAt});
      }
      const status=await getSapoRuntimeSessionStatus(env.DB);
      if(url.searchParams.get('check')==='1'){
        try{const options=await reportSapoOptions(env);return json({...status,ok:true,locationCount:options.locations.length,accountCount:options.accounts.length});}
        catch(error){return json({...status,ok:false,error:error?.message||String(error)},200);}
      }
      return json(status);
    }
    // Scheduled backup credential is separate from employee sessions. It can only
    // export snapshots or move existing payload bytes; it cannot manage accounts.
    if(path.startsWith('/maintenance/') && method==='POST') {
      const supplied=req.headers.get('authorization')||'';
      if(!env.BACKUP_TOKEN || !timingSafeEqual(Buffer.from(digest(supplied)),Buffer.from(digest('Bearer '+env.BACKUP_TOKEN))))fail(401,'Không được phép.');
      if(path==='/maintenance/migrate')return json(await migrateQuotePayloads(env.DB,env.FILES));
      if(path==='/maintenance/backup'){const backup=await makeBackup(env.DB,env.FILES);return exportBackup(env.FILES,backup.key);}
      fail(404,'Không tìm thấy chức năng.');
    }
    if(!['GET','POST','PUT','DELETE'].includes(method))fail(405,'Phương thức không hỗ trợ.');
    if(method!=='GET' && req.headers.get('origin')!==url.origin)fail(403,'Nguồn yêu cầu không hợp lệ.');
    if(!env.DB)fail(503,'Cơ sở dữ liệu chưa sẵn sàng.');
    const db=env.DB;
    await initialize(db,env.STAFF_ACTIVATION_SEEDS);
    await ensurePositions(db);
    if(['/login','/activate','/activation-info'].includes(path) && method==='POST') {
      const body=await readBody(req,4096), email=String(body.email||'').trim().toLowerCase();
      await rateLimit(db,'ip:'+(req.headers.get('cf-connecting-ip')||'unknown'),100);
      if(path!=='/login') {
        if(!/^[a-f0-9]{64}$/.test(body.token||''))fail(400,'Liên kết kích hoạt không hợp lệ hoặc đã hết hạn.');
        const hash=digest(body.token);
        const c=await db.prepare(`SELECT c.*,m.email FROM staff_credentials c JOIN staff_members m ON m.id=c.member_id
          WHERE m.active=1 AND c.activation_hash=? AND c.activation_expires>?`).bind(hash,now()).first();
        if(!c)fail(400,'Liên kết đã hết hạn, đã sử dụng hoặc đã được thay bằng liên kết mới. Vui lòng nhờ Manager cấp lại và mở đúng liên kết mới nhất.');
        if(path==='/activation-info')return json({email:c.email,expiresAt:c.activation_expires*1000});
        await rateLimit(db,'activation:'+hash,10);
        const passwordHash=await hashPassword(body.password);
        const changed=await db.prepare(`UPDATE staff_credentials SET password_hash=?, activation_hash=NULL, activation_expires=NULL,version=version+1
          WHERE member_id=? AND activation_hash=? AND activation_expires>?`).bind(passwordHash,c.member_id,hash,now()).run();
        if(!changed.meta.changes)fail(400,'Liên kết đã được sử dụng.');
        await db.batch([db.prepare('DELETE FROM staff_sessions WHERE member_id=?').bind(c.member_id),db.prepare('DELETE FROM staff_auth_attempts WHERE key=?').bind(digest('email:'+c.email))]);
        return json({ok:true});
      }
      await rateLimit(db,'email:'+email,10);
      const m=await db.prepare(`SELECT m.*,c.password_hash,c.version,p.name AS position_name FROM staff_members m
        JOIN staff_credentials c ON c.member_id=m.id LEFT JOIN staff_positions p ON p.id=m.position_id WHERE m.email=?`).bind(email).first();
      const valid=await verifyPassword(body.password,m?.password_hash);
      if(!valid || !m?.active)fail(401,'Email hoặc mật khẩu không đúng, hoặc tài khoản chưa được kích hoạt.');
      const raw=token();
      await db.batch([
        db.prepare('INSERT INTO staff_sessions (hash,member_id,version,expires) VALUES (?,?,?,?)').bind(digest(raw),m.id,m.version,now()+sessionLifetimeSeconds),
        db.prepare('DELETE FROM staff_sessions WHERE expires<=?').bind(now()),
        db.prepare('DELETE FROM staff_auth_attempts WHERE expires<=?').bind(now()),
      ]);
      return json({user:publicMember(m)},200,{'Set-Cookie':sessionCookie(raw)});
    }
    const {m,hash}=await session(db,req);
    if(path==='/printing-workshops'&&method==='GET')return json(await listPrintingWorkshops(db,m));
    if(path==='/printing-workshops'&&method==='POST')return json(await createPrintingWorkshop(db,await readBody(req,10000),m));
    if(path==='/export-files' && ['GET','POST'].includes(method))return exportFiles(req,env.FILES,m);
    if(m.role==='supplier'){
      if(path==='/me' && method==='GET')return json({user:publicMember(m)});
      if(path==='/supplier-portal/orders' && method==='GET'){if(!env.FILES)fail(503,'Kho đơn hàng chưa sẵn sàng.');return json(await supplierQuoteLinks(db,env.FILES,await listApprovedSupplierOrders(env.FILES,m),m,env.QUOTE_SHARE_OVERRIDES));}
      if(path==='/supplier-stock-requests' && method==='GET'){if(!env.FILES)fail(503,'Kho đơn hàng chưa sẵn sàng.');return json(await listSupplierStockRequests(env.FILES,m));}
      if(/^\/supplier-stock-requests\/[a-f0-9-]{36}\/respond$/i.test(path) && method==='POST'){const result=await respondSupplierStockRequest(env.FILES,{...(await readBody(req,10000)),id:path.split('/')[2]},m);await notifySupplierOrderSafe(env,'supplier_stock_request_responded',{order:{...result.request,ticketNumber:'Phản hồi xin hàng NCC',rows:result.request.lines||[]}},m);await webNotifyStaffAudience(db,env,{positionId:result.request.createdByPositionId||'',memberIds:[result.request.createdBy].filter(Boolean),eventType:'supplier_stock_request_responded',actorId:m.id,title:'NCC đã phản hồi xin hàng',body:`${result.request.supplierName||'NCC'} ${result.request.status==='accepted'?'đồng ý':'từ chối'} yêu cầu xin hàng · ${result.request.lines?.length||0} mã`,url:'/supplier',data:{requestId:result.request.id,status:result.request.status,supplierName:result.request.supplierName}});return json(result);}
      if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/signature-file$/i.test(path) && method==='GET'){if(!env.FILES)fail(503,'Kho đơn hàng chưa sẵn sàng.');const result=await getSupplierOrderSignatureFile(env.FILES,path.split('/')[3],m);return new Response(result.stored.body,{headers:{'Content-Type':result.file.type||'application/octet-stream','Content-Disposition':`inline; filename*=UTF-8''${inlineFilename(result.file.name)}`,'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});}
	      if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/internal-order$/i.test(path) && method==='POST'){const result=await updateSupplierInternalOrderNumber(env.FILES,{...(await readBody(req,10000)),id:path.split('/')[3]},m);return json(result);}
	      if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/delivery-ready$/i.test(path) && method==='POST'){const result=await markSupplierDeliveryReady(env.FILES,{...(await readBody(req,10000)),id:path.split('/')[3]},m);await notifySupplierOrderSafe(env,'supplier_delivery_ready',{order:{...result.order,rows:result.order.supplierDeliveryReadyRows?.length?result.order.supplierDeliveryReadyRows:result.order.rows}},m);return json(result);}
	      if(path==='/supplier-delivery-notes/confirm' && method==='POST'){const result=await confirmSupplierDeliveryNote(env.FILES,await readBody(req,100000),m);return json(result);}
	      if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/deposit-request$/i.test(path) && method==='POST'){const result=await requestSupplierDeposit(env.FILES,{...(await readBody(req,10000)),id:path.split('/')[3]},m);await notifySupplierOrderSafe(env,'supplier_deposit_requested',result,m);return json(result);}
      if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/signature-upload$/i.test(path) && method==='POST'){const result=await uploadSupplierOrderSignature(env.FILES,{...(await readBody(req,8500000)),id:path.split('/')[3]},m);await notifySupplierOrderSafe(env,'supplier_signature_uploaded',result,m);return json(result);}
      if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/signature-delete$/i.test(path) && method==='POST'){const result=await deleteSupplierOrderSignature(env.FILES,{id:path.split('/')[3]},m);await notifySupplierOrderSafe(env,'supplier_signature_deleted',result,m);return json(result);}
      if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/confirm$/i.test(path) && method==='POST'){const result=await confirmSupplierOrder(env.FILES,{...(await readBody(req,100000)),id:path.split('/')[3]},m);await notifySupplierOrderSafe(env,'supplier_order_confirmed',result,m);return json(result);}
      if(path==='/logout' && method==='POST') {
        await db.prepare('DELETE FROM staff_sessions WHERE hash=?').bind(hash).run();
        return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
      }
      if(path==='/password' && method==='POST') {
        const b=await readBody(req,4096);await rateLimit(db,'password:'+m.id,10);
        const c=await db.prepare('SELECT password_hash FROM staff_credentials WHERE member_id=?').bind(m.id).first();
        if(!await verifyPassword(b.currentPassword,c.password_hash))fail(400,'Mật khẩu hiện tại không đúng.');
        const next=await hashPassword(b.password);
        await db.batch([db.prepare('UPDATE staff_credentials SET password_hash=?,version=version+1 WHERE member_id=?').bind(next,m.id),db.prepare('DELETE FROM staff_sessions WHERE member_id=?').bind(m.id)]);
        return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
      }
      fail(403,'Tài khoản NCC chỉ được xem đơn hàng NCC đã duyệt.');
    }
    if(path==='/media-file' && method==='GET')return serveMediaFile(env.FILES,url.searchParams.get('key'));
    if(path==='/work/ledger' && method==='GET')return json(await workCashLedger(env,m,url.searchParams.get('shiftId')));
    if(path==='/work/ledger/sync' && method==='POST')return json(await refreshWorkCash(env,m,await readBody(req,5000)));
    if(path==='/work/ledger/request' && method==='POST'){
      const result=await requestWorkCash(env,m,await readBody(req,10000));
      if(!result.duplicate)await webNotifyStaffAudience(db,env,{memberIds:[m.id],eventType:'cash_request_submitted',actorId:m.id,title:'Sổ quỹ: phiếu mới chờ duyệt',body:`${m.name} gửi phiếu ${Number(result.amount).toLocaleString('vi-VN')}đ · ${result.note}`,url:'/work-reports.html?cashShift='+encodeURIComponent(result.shift_id),data:{requestId:result.id,shiftId:result.shift_id}});
      return json(result);
    }
    if(path==='/work/ledger/review' && method==='POST'){
      const result=await reviewWorkCashRequest(env,m,await readBody(req,10000));
      await webNotifyStaffAudience(db,env,{memberIds:[result.member_id],eventType:'cash_request_reviewed',actorId:m.id,title:result.status==='approved'?'Sổ quỹ: phiếu đã được duyệt':'Sổ quỹ: phiếu bị từ chối',body:`${Number(result.amount).toLocaleString('vi-VN')}đ · ${result.review_note||result.note}`,url:'/work-reports.html?cashShift='+encodeURIComponent(result.shift_id),data:{requestId:result.id,shiftId:result.shift_id,status:result.status}});
      return json(result);
    }
    if(path==='/work/context' && method==='GET')return json(await workContext(env,m));
    if(path==='/work/options' && method==='GET'){if(m.role!=='manager')fail(403,'Chỉ quản lý được thiết lập.');return json(await reportSapoOptions(env));}
    if(path==='/work/config' && method==='POST')return json(await saveWorkConfiguration(env,m,await readBody(req,50000)));
    if(path==='/work/shift' && method==='POST')return json(await openReportShift(env,m,await readBody(req,5000)));
    if(path==='/work/shift' && method==='GET')return json(await workShiftDetails(env,m,url.searchParams.get('id'),url.searchParams.get('branchId')||''));
    if(path==='/work/quotes' && method==='GET')return json(await workShiftQuotes(env,m,{shiftId:url.searchParams.get('shiftId'),mode:url.searchParams.get('mode')}));
    if(path==='/work/sync' && method==='POST')return json(await syncWorkOrders(env,m,await readBody(req,5000)));
    if(path==='/work/assistant' && method==='POST')return json(await workAssistant(env,m,await readBody(req,5000)));
    if(path==='/work/cash' && method==='POST')fail(409,'Vui lòng tải lại trang và gửi phiếu sổ quỹ để Manager duyệt.');
    if(path==='/work/report' && method==='POST')return json(await saveWorkReport(env,m,await readBody(req,50000)));
    if(path==='/work/history' && method==='GET')return json(await workHistory(env,m,url.searchParams));
    if(path==='/work/review' && method==='POST')return json(await reviewWorkReport(env,m,await readBody(req,10000)));
    if(path==='/work/cash-review' && method==='POST')return json(await reviewCashShift(env,m,await readBody(req,10000)));
    if(path==='/work/audit' && method==='GET')return json(await workAuditHistory(env,m,url.searchParams.get('id')));
    if(path==='/notifications' && method==='GET')return json(await listQuoteNotifications(db,m));
    if(path==='/notifications/read' && method==='POST')return json(await readQuoteNotifications(db,m,(await readBody(req,10000)).ids));
    if(path==='/push/config' && method==='GET')return json(webPushConfig(env));
    if(path==='/push/subscribe' && method==='POST')return json(await subscribeWebPush(db,m,await readBody(req,20000),req.headers.get('user-agent')||''));
    if(path==='/push/unsubscribe' && method==='POST')return json(await unsubscribeWebPush(db,m,await readBody(req,10000)));
    if(path==='/push/notifications' && method==='GET')return json(await listWebNotifications(db,m,Number(url.searchParams.get('limit')||50)));
    if(path==='/push/notifications/read' && method==='POST')return json(await readWebNotifications(db,m,(await readBody(req,10000)).ids));
    if(path==='/push/event' && method==='POST')return json(await createWebNotification(db,env,webNotificationForClientEvent(publicMember(m),await readBody(req,20000))));
    if(path==='/sapo-status' && method==='GET'){
      const quoteNumber=String(url.searchParams.get('quote_number')||'').trim().slice(0,200);
      if(!quoteNumber)fail(400,'Thiếu số báo giá.');
      const row=await db.prepare(`SELECT quote_number AS quoteNumber,status,sapo_order_id AS sapoOrderId,
        sapo_order_code AS sapoOrderCode,sapo_order_url AS sapoOrderUrl,customer_name AS customerName,
        message,updated_at AS updatedAt FROM sapo_order_statuses WHERE quote_number=?`).bind(quoteNumber).first();
      return json({status:row||null});
    }
    if(path==='/contract/status' && method==='GET')return json({configured:Boolean(contractTarget(env)),contract:await getContractStatus(db,url.searchParams.get('quote_number'))});
    if(path==='/contract/document-number' && method==='POST'){
      const body=await readBody(req,10000);
      const quote=await createQuotationStore(db,env.FILES).get(m.id,String(body.quote_id||''));
      if(!quote.canEdit)fail(403,'Bạn không có quyền cấp số cho báo giá này.');
      if(!quote.data.rows?.length)fail(400,'Báo giá chưa có sản phẩm.');
      return json({contractNumber:await reserveContractNumber(db,{quote_number:quote.data.quoteNo,legal_entity:quote.data.type==='VIGIFTS'?'VIGIFTS':'Bách Ngân',customer:{customer_code:body.customer_code,tax_code:body.tax_code}})});
    }
    if(path==='/contract' && method==='POST')return json(await transferContract(env,await readBody(req,800000)));
    if(path==='/sapo-copy' && method==='POST'){
      const body=await readBody(req,800000),outgoing={...body,responsible:body.responsible||m.name,responsible_email:body.responsible_email||m.email,responsible_phone:body.responsible_phone||m.phone||''},result=await sendSapoCopy(outgoing,fetch,env);
      if(result.sapoOrderId||result.sapoOrderCode)await upsertSapoStatus(db,{quote_number:body.quote_number||body.quoteNo||body.order?.quote_number||body.order?.quoteNo,status:result.status||'created',sapo_order_id:result.sapoOrderId||null,sapo_order_code:result.sapoOrderCode||null,sapo_order_url:result.sapoOrderUrl||null,customer_name:body.customer?.name||body.order?.customer?.name||'',message:result.message||'',updated_at:new Date().toISOString()});
      return json(result);
    }
    if(path==='/sapo-goods-receipt/options' && method==='POST'){if(m.role!=='manager')fail(403,'Chỉ Manager được xem danh mục Sapo.');return json(await loadSapoGoodsReceiptOptions(fetch,env));}
    if(path==='/supplier-orders/options' && method==='POST'){
      try{
        const options=await loadSapoGoodsReceiptOptions(fetch,env);
        return json({ok:true,suppliers:options.suppliers});
      }catch(e){
        return json({ok:true,suppliers:[{id:'',name:'CÔNG TY TNHH MINH LONG I',fallback:true}],warning:`Tạm dùng NCC Minh Long I vì chưa tải được danh sách NCC từ Sapo. ${e?.message||''}`.trim()});
      }
    }
    if(path==='/supplier-portal/orders' && method==='GET'){if(!env.FILES)fail(503,'Kho đơn hàng chưa sẵn sàng.');return json(await supplierQuoteLinks(db,env.FILES,await listApprovedSupplierOrders(env.FILES,m),m,env.QUOTE_SHARE_OVERRIDES));}
    if(path==='/supplier-stock-requests' && method==='GET'){if(!env.FILES)fail(503,'Kho đơn hàng chưa sẵn sàng.');return json(await listSupplierStockRequests(env.FILES,m));}
    if(path==='/supplier-stock-requests' && method==='POST'){if(!env.FILES)fail(503,'Kho đơn hàng chưa sẵn sàng.');const result=await createSupplierStockRequest(env.FILES,await readBody(req,120000),m);await notifySupplierOrderSafe(env,'supplier_stock_requested',{order:{...result.request,ticketNumber:'Yêu cầu xin hàng NCC',rows:result.request.lines||[]}},m);await webNotifyStaffAudience(db,env,{positionId:m.position_id||'',memberIds:[m.id],eventType:'supplier_stock_requested',actorId:m.id,title:'Có yêu cầu xin hàng NCC',body:`${m.name} gửi yêu cầu xin hàng ${result.request.supplierName||'NCC'} · ${result.request.lines?.length||0} mã`,url:'/supplier',data:{requestId:result.request.id,supplierName:result.request.supplierName}});return json(result);}
    if(/^\/supplier-stock-requests\/[a-f0-9-]{36}\/respond$/i.test(path) && method==='POST'){const result=await respondSupplierStockRequest(env.FILES,{...(await readBody(req,10000)),id:path.split('/')[2]},m);await notifySupplierOrderSafe(env,'supplier_stock_request_responded',{order:{...result.request,ticketNumber:'Phản hồi xin hàng NCC',rows:result.request.lines||[]}},m);await webNotifyStaffAudience(db,env,{positionId:result.request.createdByPositionId||'',memberIds:[result.request.createdBy].filter(Boolean),eventType:'supplier_stock_request_responded',actorId:m.id,title:'NCC đã phản hồi xin hàng',body:`${result.request.supplierName||'NCC'} ${result.request.status==='accepted'?'đồng ý':'từ chối'} yêu cầu xin hàng · ${result.request.lines?.length||0} mã`,url:'/supplier',data:{requestId:result.request.id,status:result.request.status,supplierName:result.request.supplierName}});return json(result);}
    if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/signature-file$/i.test(path) && method==='GET'){if(!env.FILES)fail(503,'Kho đơn hàng chưa sẵn sàng.');const result=await getSupplierOrderSignatureFile(env.FILES,path.split('/')[3],m);return new Response(result.stored.body,{headers:{'Content-Type':result.file.type||'application/octet-stream','Content-Disposition':`inline; filename*=UTF-8''${inlineFilename(result.file.name)}`,'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});}
    if(path==='/supplier-payment-requests' && method==='GET'){if(!env.FILES)fail(503,'Kho đơn hàng chưa sẵn sàng.');return json(await listSupplierPaymentRequests(env.FILES,m));}
    if(/^\/supplier-payment-requests\/[a-f0-9-]{36}\/pay$/i.test(path) && method==='POST'){const result=await paySupplierDeposit(env.FILES,{...(await readBody(req,10000)),id:path.split('/')[2]},m);await notifySupplierOrderSafe(env,'supplier_deposit_paid',result,m);return json(result);}
	    if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/internal-order$/i.test(path) && method==='POST'){const result=await updateSupplierInternalOrderNumber(env.FILES,{...(await readBody(req,10000)),id:path.split('/')[3]},m);return json(result);}
	    if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/delivery-ready$/i.test(path) && method==='POST'){const result=await markSupplierDeliveryReady(env.FILES,{...(await readBody(req,10000)),id:path.split('/')[3]},m);await notifySupplierOrderSafe(env,'supplier_delivery_ready',{order:{...result.order,rows:result.order.supplierDeliveryReadyRows?.length?result.order.supplierDeliveryReadyRows:result.order.rows}},m);return json(result);}
	    if(path==='/supplier-delivery-notes/confirm' && method==='POST'){const result=await confirmSupplierDeliveryNote(env.FILES,await readBody(req,100000),m);return json(result);}
	    if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/deposit-request$/i.test(path) && method==='POST'){const result=await requestSupplierDeposit(env.FILES,{...(await readBody(req,10000)),id:path.split('/')[3]},m);await notifySupplierOrderSafe(env,'supplier_deposit_requested',result,m);return json(result);}
    if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/signature-upload$/i.test(path) && method==='POST'){const result=await uploadSupplierOrderSignature(env.FILES,{...(await readBody(req,8500000)),id:path.split('/')[3]},m);await notifySupplierOrderSafe(env,'supplier_signature_uploaded',result,m);return json(result);}
    if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/signature-delete$/i.test(path) && method==='POST'){const result=await deleteSupplierOrderSignature(env.FILES,{id:path.split('/')[3]},m);await notifySupplierOrderSafe(env,'supplier_signature_deleted',result,m);return json(result);}
    if(/^\/supplier-portal\/orders\/[a-f0-9-]{36}\/confirm$/i.test(path) && method==='POST'){const result=await confirmSupplierOrder(env.FILES,{...(await readBody(req,100000)),id:path.split('/')[3]},m);await notifySupplierOrderSafe(env,'supplier_order_confirmed',result,m);return json(result);}
    if(path==='/supplier-orders/pending-count' && method==='GET')return json({count:await countPendingSupplierOrders(env.FILES,m)});
    if(path==='/supplier-orders' && method==='GET')return json(await listSupplierOrders(env.FILES,m));
    if(path==='/sapo-goods-receipt' && method==='POST'){if(m.role!=='manager')fail(403,'Chỉ Manager được tạo phiếu nhập Sapo.');return json(await sendSapoGoodsReceipt(await readBody(req,1200000),fetch,env));}
    if(path==='/lalamove/history' && method==='POST')return json(await loadLalamoveHistory(await readBody(req,10000),fetch));
    if(path==='/lalamove/addresses' && method==='GET'){await rateLimit(db,'address-search:'+m.id,300);return json(await searchAddresses(url.searchParams.get('q'),fetch,env));}
    if(path==='/lalamove' && method==='POST'){let body=await readBody(req,100000);if(typeof body.customer_id==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(body.customer_id)){const customer=await db.prepare('SELECT contact,phone FROM sapo_customers WHERE id=?').bind(body.customer_id).first();if(customer)body={...body,recipient_name:customer.contact||body.recipient_name,recipient_phone:customer.phone||body.recipient_phone};}return json(await sendLalamoveRequest({...body,sender_name:m.name,sender_phone:m.phone||''},fetch,env));}
    if(['/inventory/preview','/inventory/apply'].includes(path) && method==='POST'){if(m.role!=='manager')fail(403,'Chỉ Manager được cập nhật tồn kho.');return json(await importStock(db,env.FILES,await readBody(req,12000000),m,path.endsWith('/apply')));}
    if(path==='/incoming-stock' && method==='GET'){return json(await listIncomingStock(env.FILES));}
    if(path==='/incoming-stock/ocr' && method==='POST'){if(m.role!=='manager')fail(403,'Chỉ Manager được chụp phiếu nhập.');return json(await parseIncomingStockImage(env,await readBody(req,8000000),m));}
    if(path==='/supplier-orders' && method==='POST'){
      const result=await importIncomingStock(db,env.FILES,await readBody(req,2200000),m,true,{allowStaff:true,source:'supplier-order',initialStatus:'pending'});
      const orderDetail=result.shipment?.id?await getSupplierOrder(env.FILES,result.shipment.id,m).catch(()=>result.shipment):result.shipment;
      await notifySupplierOrderSafe(env,'supplier_order_created',{order:orderDetail||result.shipment},m);
      await webNotifySafe(db,env,{eventType:'supplier_order_created',targetRole:'manager',actorId:m.id,title:'Đơn NCC mới chờ duyệt',body:`${m.name} tạo ${result.shipment?.ticketNumber||'đơn NCC'} · ${result.shipment?.supplierName||''}`,url:`/quote#supplier-order=${encodeURIComponent(result.shipment?.id||'')}`,data:{orderId:result.shipment?.id,ticketNumber:result.shipment?.ticketNumber,supplierName:result.shipment?.supplierName}});
      return json(result);
    }
    if(/^\/supplier-orders\/[a-f0-9-]{36}$/i.test(path) && method==='GET')return json(await getSupplierOrder(env.FILES,path.split('/')[2],m));
    if(/^\/supplier-orders\/[a-f0-9-]{36}$/i.test(path) && method==='PUT'){if(m.role!=='manager')fail(403,'Chỉ Manager được sửa đơn đặt hàng NCC.');return json(await importIncomingStock(db,env.FILES,{...(await readBody(req,2200000)),id:path.split('/')[2]},m,true,{allowStaff:true,source:'supplier-order',initialStatus:'pending'}));}
    if(/^\/supplier-orders\/[a-f0-9-]{36}\/approve$/i.test(path) && method==='POST'){const result=await approveSupplierOrder(env.FILES,{...(await readBody(req,100000)),id:path.split('/')[2]},m);await notifySupplierOrderSafe(env,'supplier_order_sent',result,m);await webNotifySafe(db,env,{eventType:'supplier_order_approved',targetRole:'all',actorId:m.id,title:'Đơn NCC đã duyệt/gửi',body:`${m.name} duyệt ${result.order?.ticketNumber||'đơn NCC'} · ${result.order?.supplierName||''}`,url:`/quote#supplier-order=${encodeURIComponent(result.order?.id||'')}`,data:{orderId:result.order?.id,ticketNumber:result.order?.ticketNumber,supplierName:result.order?.supplierName}});return json(result);}
    if(/^\/incoming-stock\/[a-f0-9-]{36}\/receive$/i.test(path) && method==='POST'){return json(await receiveIncomingStock(env.FILES,{...(await readBody(req,10000)),id:path.split('/')[2]},m));}
    if(/^\/incoming-stock\/[a-f0-9-]{36}\/payment$/i.test(path) && method==='POST'){return json(await updateIncomingStockPayment(env.FILES,{...(await readBody(req,10000)),id:path.split('/')[2]},m));}
    if(/^\/incoming-stock\/[a-f0-9-]{36}$/i.test(path) && method==='DELETE'){
      const result=await deleteIncomingStock(env.FILES,{...(await readBody(req,10000)),id:path.split('/')[2]},m);
      if(result.shipment?.supplierPortalRemoved)await notifySupplierOrderSafe(env,'supplier_order_deleted',result.shipment,m);
      return json(result);
    }
    if(path.startsWith('/incoming-stock/') && method==='GET'){return json(await getIncomingStock(db,env.FILES,path.slice('/incoming-stock/'.length)));}
    if(['/incoming-stock/preview','/incoming-stock/apply'].includes(path) && method==='POST'){
      if(m.role!=='manager')fail(403,'Chỉ Manager được nhập hàng sắp về.');
      const result=await importIncomingStock(db,env.FILES,await readBody(req,12000000),m,path.endsWith('/apply'));
      if(path.endsWith('/apply'))await webNotifySafe(db,env,{eventType:'incoming_stock_created',targetRole:'all',actorId:m.id,title:'Có hàng sắp về',body:`${m.name} lưu phiếu ${result.shipment?.ticketNumber||'hàng sắp về'} · dự kiến ${result.shipment?.arrivalDate||''}`,url:'/quote?dashboardAction=incoming',data:{shipmentId:result.shipment?.id,ticketNumber:result.shipment?.ticketNumber,arrivalDate:result.shipment?.arrivalDate}});
      return json(result);
    }
    if(['/packaging/preview','/packaging/apply'].includes(path) && method==='POST'){if(m.role!=='manager')fail(403,'Chỉ Manager được cập nhật quy cách.');return json(await importPackaging(db,env.FILES,await readBody(req,12000000),m,path.endsWith('/apply')));}
    if(path==='/packaging/restore-missing' && method==='POST')return json(await restoreMissingPackaging(db,env.FILES,m,packagingRecoverySnapshot));
    if(['/packaging/minh-long-inherit/preview','/packaging/minh-long-inherit/apply'].includes(path) && method==='POST')return json(await inheritMinhLongPackaging(db,env.FILES,m,path.endsWith('/apply'),(await readBody(req,10000)).version||null));
    if(path==='/products' && ['POST','PUT'].includes(method))return json(await saveProduct(db,env.FILES,await readBody(req,900000),m,method==='POST'));
    if(path==='/catalog' && method==='GET')return readCatalog(env.FILES,m.role,db);
    if(path==='/data-audit' && method==='GET'){if(m.role!=='manager')fail(403,'Chỉ Manager được kiểm tra dữ liệu tổng.');return json(await auditCatalog(db,env.FILES,{sku:url.searchParams.get('sku')||''}));}
    if(path==='/me' && method==='GET')return json({user:publicMember(m)});
    if(path==='/customers/analytics' && method==='GET')return json(await listWebQuoteCustomers(db,env.FILES));
    if(path==='/customers' && method==='GET')return json(await searchCustomersWithSapoFallback(db,url.searchParams.get('q'),env,fetch,url.searchParams.get('sort')==='created_desc'));
    if(path==='/crm/overview' && method==='GET')return json(await crmOverview(db,m));
    if(path==='/crm/tasks' && method==='GET')return json(await listCrmTasks(db,m));
    if(path==='/crm/tasks' && method==='POST')return json(await createCrmTask(db,await readBody(req,20000),m));
    if(/^\/crm\/tasks\/CRM-[a-f0-9-]{36}$/i.test(path) && method==='PUT')return json(await updateCrmTask(db,path.split('/').at(-1),await readBody(req,10000),m));
    if(path==='/customer-contract-profile' && method==='GET')return json(await getCustomerContractProfile(db,url.searchParams.get('customer_id')));
    if(path==='/customer-contract-profile' && method==='PUT')return json(await saveCustomerContractProfile(db,await readBody(req,20000)));
    if(path==='/customers' && method==='PUT')return json(await createLocalCustomer(db,await readBody(req,10000),true));
    if(path==='/customers' && method==='POST')return json(await createLocalCustomer(db,await readBody(req,10000)),201);
    if(path==='/logout' && method==='POST') {
      await db.prepare('DELETE FROM staff_sessions WHERE hash=?').bind(hash).run();
      return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
    }
    if(path==='/password' && method==='POST') {
      const b=await readBody(req,4096);await rateLimit(db,'password:'+m.id,10);
      const c=await db.prepare('SELECT password_hash FROM staff_credentials WHERE member_id=?').bind(m.id).first();
      if(!await verifyPassword(b.currentPassword,c.password_hash))fail(400,'Mật khẩu hiện tại không đúng.');
      const next=await hashPassword(b.password);
      await db.batch([db.prepare('UPDATE staff_credentials SET password_hash=?,version=version+1 WHERE member_id=?').bind(next,m.id),db.prepare('DELETE FROM staff_sessions WHERE member_id=?').bind(m.id)]);
      return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
    }
    if(path.startsWith('/admin/')) {
      if(m.role!=='manager')fail(403,'Chỉ Manager được quản lý nhân viên.');
      if(path==='/admin/r2-media' && method==='GET')return json(await mediaMigrationStatus(env.FILES));
      if(path==='/admin/r2-media' && method==='POST')return json(await advanceMediaMigration(db,env.FILES));
      if(path==='/admin/neon-storage-check' && method==='POST')return json(await checkNeonStorage(env));
      const neonStageMatch=path.match(/^\/admin\/neon-stage\/([a-f0-9-]{36})(\/start)?$/);
      if(neonStageMatch && method==='POST')return json(await (neonStageMatch[2]?startNeonStageCopy(env,neonStageMatch[1]):advanceNeonStageCopy(env,neonStageMatch[1])));
      if(neonStageMatch && method==='GET')return json(await neonStageStatus(env,neonStageMatch[1]));
      if(path==='/admin/full-backup' && method==='POST')return json(await startFullBackup(db,env.FILES));
      const fullBackupMatch=path.match(/^\/admin\/full-backup\/([a-f0-9-]{36})$/);
      if(fullBackupMatch && method==='GET')return json(await fullBackupStatus(env.FILES,fullBackupMatch[1]));
      if(fullBackupMatch && method==='POST')return json(await advanceFullBackup(db,env.FILES,fullBackupMatch[1]));
      if(path==='/admin/reconcile-staff' && method==='POST')return json(await reconcileStaffIdentities(db));
      if(path==='/admin/merge-sapo-identity' && method==='POST'){
        const body=await readBody(req,4096);
        if(body.confirmation!=='MERGE_SAPO_IDENTITY')fail(400,'Cần xác nhận hợp nhất hồ sơ.');
        const result=await forceMergeStaffIdentity(db,{sapoId:body.sapoId,targetId:body.memberId,actorId:m.id});
        if(!result.ok)fail(409,result.reason);
        return json(result);
      }
      if(path==='/admin/sapo-session' && method==='GET')return json(await getSapoRuntimeSessionStatus(db));
      if(path==='/admin/sapo-session' && method==='POST'){
        const body=await readBody(req,40000);
        const result=await storeSapoRuntimeSession(db,env,body.cookie,m.id);
        return json({ok:true,updatedAt:result.updatedAt});
      }
      if(path==='/admin/backup' && method==='POST')return json(await makeBackup(db,env.FILES));
      if(path==='/admin/backup' && method==='GET')return exportBackup(env.FILES,url.searchParams.get('key'));
      if(path==='/admin/members' && method==='GET') {
        const members=await db.prepare(`SELECT m.id,m.name,m.email,m.phone,m.role,m.position_id AS positionId,m.active,
          CASE WHEN c.password_hash IS NULL THEN 0 ELSE 1 END AS activated FROM staff_members m
          LEFT JOIN staff_credentials c ON c.member_id=m.id ORDER BY m.id`).all();
        const positions=await db.prepare('SELECT id,name FROM staff_positions ORDER BY name').all();
        return json({members:members.results,positions:positions.results});
      }
      if(path==='/admin/sapo-staff-sync' && method==='POST')return json(await triggerSapoStaffSync(env,fetch));
      const b=await readBody(req,4096);
      if(path==='/admin/member-phone' && method==='PUT'){
        if(typeof b.phone!=='string'||b.phone.trim().length>40)fail(400,'Số điện thoại không hợp lệ.');
        const changed=await db.prepare('UPDATE staff_members SET phone=? WHERE id=?').bind(b.phone.trim(),b.id).run();
        if(!changed.meta.changes)fail(404,'Không tìm thấy nhân viên.');
        return json({ok:true});
      }
      if(path==='/admin/members' && method==='POST'){
        if(typeof b.phone!=='string'||!b.phone.trim()||b.phone.trim().length>40)fail(400,'Vui lòng nhập số điện thoại nhân viên (tối đa 40 ký tự).');
        const phone=b.phone.trim();
        const email=typeof b.email==='string'?b.email.trim().toLowerCase():'',name=typeof b.name==='string'?b.name.trim():'';
        if(!name||name.length>200||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Nhập họ tên và địa chỉ email hợp lệ.');
        if(typeof b.positionId!=='string'||!await db.prepare('SELECT id FROM staff_positions WHERE id=?').bind(b.positionId).first())fail(400,'Chức vụ không hợp lệ.');
        if(await db.prepare('SELECT id FROM staff_members WHERE email=? COLLATE NOCASE').bind(email).first())fail(409,'Email này đã có tài khoản. Vui lòng kiểm tra danh sách nhân viên.');
        const id='NV-'+crypto.randomUUID(),raw=token(),role=roleFromPosition(b.positionId);
        try{await db.batch([
          db.prepare('INSERT INTO staff_members (id,email,name,role,position_id,active,created_at,phone) VALUES (?,?,?,?,?,1,?,?)').bind(id,email,name,role,b.positionId,new Date().toISOString(),phone),
          db.prepare('INSERT INTO staff_credentials (member_id,activation_hash,activation_expires,version) VALUES (?,?,?,0)').bind(id,digest(raw),now()+900)
        ]);}catch(e){if(String(e.message).includes('UNIQUE constraint'))fail(409,'Email này đã có tài khoản.');throw e;}
        return json({member:{id,name,email,phone,role,positionId:b.positionId},url:`${url.origin}/login.html#email=${encodeURIComponent(email)}&token=${raw}`},201);
      }
      if(path==='/admin/reset' && method==='POST') {
        if(b.id===m.id)fail(400,'Dùng chức năng đổi mật khẩu cho tài khoản của mình.');
        const target=await db.prepare('SELECT id,email FROM staff_members WHERE id=? AND active=1').bind(b.id).first();
        if(!target)fail(404,'Không tìm thấy nhân viên đang hoạt động.');
        const raw=token();
        await db.batch([
          db.prepare('UPDATE staff_credentials SET activation_hash=?,activation_expires=?,password_hash=NULL,version=version+1 WHERE member_id=?').bind(digest(raw),now()+900,target.id),
          db.prepare('DELETE FROM staff_sessions WHERE member_id=?').bind(target.id),
        ]);
        return json({url:`${url.origin}/login.html#email=${encodeURIComponent(target.email)}&token=${raw}`});
      }
      if(path==='/admin/member' && method==='DELETE') {
        if(b.id===m.id)fail(400,'Không thể xoá tài khoản đang đăng nhập.');
        const target=await db.prepare('SELECT id FROM staff_members WHERE id=?').bind(b.id).first();
        if(!target)fail(404,'Không tìm thấy nhân viên.');
        const changed=await db.prepare(`UPDATE staff_members SET active=0 WHERE id=? AND id<>?
          AND EXISTS (SELECT 1 FROM staff_members actor WHERE actor.id=? AND actor.active=1 AND actor.role='manager')`).bind(b.id,m.id,m.id).run();
        if(!changed.meta.changes)fail(404,'Không tìm thấy nhân viên.');
        await db.prepare('DELETE FROM staff_sessions WHERE member_id=?').bind(b.id).run();
        return json({ok:true});
      }
      if(path==='/admin/member' && method==='PUT') {
        if(await db.prepare('SELECT member_id FROM staff_sapo_links WHERE sapo_id=?').bind(b.id).first())fail(409,'Hồ sơ này đã hợp nhất. Vui lòng chỉnh hồ sơ web đang sử dụng.');
        if(b.id===m.id)fail(400,'Không tự thay đổi quyền hoặc khóa tài khoản của mình.');
        if(!['manager','employee','supplier'].includes(b.role)||typeof b.active!=='boolean')fail(400,'Quyền không hợp lệ.');
        const name=typeof b.name==='string'?b.name.trim():'';
        const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
        const phone=typeof b.phone==='string'?b.phone.trim():'';
        if(!name||name.length>200||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Nhập họ tên và địa chỉ email hợp lệ.');
        if(!phone||phone.length>40)fail(400,'Vui lòng nhập số điện thoại nhân viên (tối đa 40 ký tự).');
        if(!await db.prepare('SELECT id FROM staff_positions WHERE id=?').bind(b.positionId).first())fail(400,'Chức vụ không hợp lệ.');
        if(await db.prepare('SELECT id FROM staff_members WHERE email=? COLLATE NOCASE AND id<>?').bind(email,b.id).first())fail(409,'Email này đã có tài khoản.');
        const role=roleFromPosition(b.positionId);
        const changed=await db.prepare(`UPDATE staff_members SET name=?,email=?,phone=?,role=?,position_id=?,active=? WHERE id=?
          AND EXISTS (SELECT 1 FROM staff_members actor WHERE actor.id=? AND actor.active=1 AND actor.role='manager')`).bind(name,email,phone,role,b.positionId,b.active?1:0,b.id,m.id).run();
        if(!changed.meta.changes)fail(404,'Không tìm thấy nhân viên.');
        await db.prepare('DELETE FROM staff_sessions WHERE member_id=?').bind(b.id).run();
        return json({ok:true,member:{id:b.id,name,email,phone,role,positionId:b.positionId,active:b.active}});
      }
      fail(404,'Không tìm thấy chức năng.');
    }
    if(!env.FILES)fail(503,'Kho lưu trữ báo giá chưa sẵn sàng.');
    await ensureQuotationSearchSchema(db);
    const store=createQuotationStore(db,env.FILES,{quoteShareOverrides:env.QUOTE_SHARE_OVERRIDES,hidePdfOverrides:env.QUOTE_HIDE_PDF_OVERRIDES}), id=path.match(/^\/quotes\/([a-zA-Z0-9-]{1,64})$/)?.[1];
    const approveId=path.match(/^\/quotes\/([a-zA-Z0-9-]{1,64})\/approve$/)?.[1];
    const careId=path.match(/^\/quotes\/([a-zA-Z0-9-]{1,64})\/care$/)?.[1];
    const sapoStatusId=path.match(/^\/quotes\/([a-zA-Z0-9-]{1,64})\/sapo-status$/)?.[1];
    const pdfId=path.match(/^\/quotes\/([a-zA-Z0-9-]{1,64})\/pdf$/)?.[1];
    if(sapoStatusId && method==='GET'){
      const quote=await store.get(m.id,sapoStatusId);
      const row=await db.prepare(`SELECT quote_number AS quoteNumber,status,sapo_order_id AS sapoOrderId,
        sapo_order_code AS sapoOrderCode,sapo_order_url AS sapoOrderUrl,customer_name AS customerName,
        message,updated_at AS updatedAt FROM sapo_order_statuses WHERE quote_number=?`).bind(quote.data.quoteNo).first();
      return json({status:row||null});
    }
    if(pdfId){
      const quote=await store.get(m.id,pdfId);
      const row=await db.prepare('SELECT data FROM staff_quotations WHERE id=?').bind(pdfId).first();
      if(method==='GET'){
        if(quote.approvalStatus!=='approved')fail(403,'Báo giá đang đợi duyệt. Chỉ báo giá đã duyệt mới được xem file PDF.');
        const meta=JSON.parse(row.data);if(!meta.pdfKey)fail(404,'Chưa có PDF đã lưu cho phiên bản này.');
        if(quoteKeyOverridden(env.QUOTE_HIDE_PDF_OVERRIDES,pdfId,quote.data.quoteNo))fail(404,'File PDF đã lưu của báo giá này đã được ẩn. Vui lòng tải file PDF mới từ báo giá hiện tại.');
        const object=await env.FILES.get(meta.pdfKey);if(!object)fail(404,'Không tìm thấy PDF.');
        const disposition=url.searchParams.get('view')==='1'?'inline':'attachment; filename="bao-gia.pdf"';
        if(m.role==='employee')await webNotifyQuoteAudience(db,env,pdfId,m,{eventType:'quote_pdf_opened',actorId:m.id,title:'Nhân viên mở file báo giá',body:`${m.name} mở PDF ${quote.data.quoteNo||''} · ${quote.data.customer||'Chưa nhập khách hàng'}`,url:`/quote?quoteId=${encodeURIComponent(pdfId)}`,data:{quoteId:pdfId,quoteNo:quote.data.quoteNo,customer:quote.data.customer}});
        return new Response(object.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':disposition,'Cache-Control':'no-store, private'}});
      }
      if(method==='POST'){
        if(!quote.canEdit)fail(403,'Chỉ người tạo hoặc Manager được lưu PDF của báo giá.');
        if(quote.approvalStatus!=='approved')fail(403,'Báo giá đang đợi duyệt. Chỉ báo giá đã duyệt mới được tạo file PDF.');
        const revision=Number(url.searchParams.get('revision'));
        if(revision!==quote.revision)fail(409,'Báo giá đã thay đổi. Vui lòng tạo lại PDF.');
        if(req.headers.get('content-type')!=='application/pdf')fail(415,'File phải là PDF.');
        const reader=req.body.getReader(),parts=[];let size=0;
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20000000){await reader.cancel();fail(413,'PDF tối đa 20 MB.');}parts.push(value);}
        const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
        if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')fail(400,'File PDF không hợp lệ.');
        const key=`pdf/${pdfId}/${crypto.randomUUID()}.pdf`;await env.FILES.put(key,bytes,{httpMetadata:{contentType:'application/pdf'}});
        const updated=await db.prepare('UPDATE staff_quotations SET data=? WHERE id=? AND revision=? AND (creator_id=? OR EXISTS (SELECT 1 FROM staff_members WHERE id=? AND active=1 AND role=\'manager\')) AND data=?').bind(JSON.stringify({...JSON.parse(row.data),pdfKey:key}),pdfId,revision,m.id,m.id,row.data).run();
        if(!updated.meta.changes)fail(409,'Báo giá đã thay đổi. Vui lòng tạo lại PDF.');
        await createQuoteNotification(db,m,{id:pdfId,quoteNo:quote.data.quoteNo,customer:quote.data.customer},'pdf');
        await webNotifyQuoteAudience(db,env,pdfId,m,{eventType:'quote_pdf_uploaded',actorId:m.id,title:'Nhân viên tải báo giá',body:`${m.name} tải PDF ${quote.data.quoteNo||''} · ${quote.data.customer||'Chưa nhập khách hàng'}`,url:`/quote?quoteId=${encodeURIComponent(pdfId)}`,data:{quoteId:pdfId,quoteNo:quote.data.quoteNo,customer:quote.data.customer}});
        return json({ok:true});
      }
    }
    if(path==='/closed-customers' && method==='GET')return json(await store.closedCustomers(m.id));
    if(path==='/quote-product-lines' && method==='GET')return json(await store.productLines(m.id));
    if(path==='/quotes/delivery-summary' && method==='GET')return json(await quotationDeliverySummary(db,env.FILES,m,{quoteShareOverrides:env.QUOTE_SHARE_OVERRIDES,force:url.searchParams.get('refresh')==='1'}));
    if(path==='/quotes/profit-summary' && method==='GET')return json(await quotationProfitSummary(db,env.FILES,m,new Date(),{force:url.searchParams.get('refresh')==='1'}));
    if(path==='/quotes/pending-count' && method==='GET')return json(await store.pendingCount(m.id));
    if(path==='/quotes' && method==='GET')return json(await store.list(m.id,url.searchParams.get('before'),Object.fromEntries(['from','to','customer','product','employee','contract','hasContract','summary'].map(k=>[k,url.searchParams.get(k)||'']))));
    if(path==='/quotes' && method==='POST'){
      const body=await readBody(req),result=await store.save(m.id,body.data);
      await createQuoteNotification(db,m,{id:result.id,quoteNo:body.data.quoteNo,customer:body.data.customer},'saved');
      await webNotifyQuoteAudience(db,env,result.id,m,{eventType:'quote_created',actorId:m.id,title:quoteSaveNotificationTitle(true,result.approvalStatus),body:quoteApprovalNotificationBody(m.name,body.data,'lưu'),url:`/quote?quoteId=${encodeURIComponent(result.id)}`,data:{quoteId:result.id,quoteNo:body.data.quoteNo,customer:body.data.customer,total:quoteApprovalTotal(body.data),approvalStatus:result.approvalStatus}});
      return json(result,201);
    }
    if(id && method==='GET')return json(await store.get(m.id,id));
    if(approveId && method==='POST'){
      const row=await db.prepare('SELECT id,creator_id,quote_no,customer FROM staff_quotations WHERE id=?').bind(approveId).first();
      const result=await store.approve(m.id,approveId);
      if(row)await webNotifyQuoteAudience(db,env,approveId,m,{eventType:'quote_approved',actorId:m.id,title:'Báo giá đã duyệt',body:`${m.name} đã duyệt ${row.quote_no||'báo giá'} · ${row.customer||''}`,url:`/quote?quoteId=${encodeURIComponent(approveId)}`,data:{quoteId:approveId,quoteNo:row.quote_no,customer:row.customer}});
      return json(result);
    }
    if(careId && method==='POST')return json(await store.updateCare(m.id,careId,await readBody(req,4096)));
    if(id && method==='PUT'){
      const b=await readBody(req),result=await store.save(m.id,b.data,id,b.revision);
      await createQuoteNotification(db,m,{id,quoteNo:b.data?.quoteNo,customer:b.data?.customer},'saved');
      await webNotifyQuoteAudience(db,env,id,m,{eventType:'quote_updated',actorId:m.id,title:quoteSaveNotificationTitle(false,result.approvalStatus),body:quoteApprovalNotificationBody(m.name,b.data,'cập nhật'),url:`/quote?quoteId=${encodeURIComponent(id)}`,data:{quoteId:id,quoteNo:b.data?.quoteNo,customer:b.data?.customer,total:quoteApprovalTotal(b.data),approvalStatus:result.approvalStatus}});
      return json(result);
    }
    if(id && method==='DELETE'){await store.remove(m.id,id,(await readBody(req,4096)).revision);return json({ok:true});}
    fail(404,'Không tìm thấy chức năng.');
  } catch(e) {
    if(e instanceof QuotationError)return json({error:e.message},e.status);
    console.error('staff_api_error',e?.name); // Never log credentials or request bodies.
    return json({error:'Hệ thống đang gặp lỗi. Vui lòng thử lại sau.'},500);
  }
}

export async function staffApi(request,env){const response=await staffApiInternal(request,env);return request.method==='GET'&&!new URL(request.url).pathname.includes('/admin/')?mappedMediaResponse(response,env.FILES):response;}
