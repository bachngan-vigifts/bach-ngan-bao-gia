import {QuotationError} from './quotation-store.mjs';

export const clean=value=>value===undefined||value===null?'':String(value).trim();
export const number=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback;};
export const compactObject=value=>Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined&&item!==null&&item!==''));
export const normalize=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
export const sapoId=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+String(Math.random()).slice(2);

const defaultBase='https://bachngankiengiang.mysapogo.com/admin';
const runtimeSessionId='active';

const bytesToBase64=bytes=>{
 let text='';for(const byte of bytes)text+=String.fromCharCode(byte);
 return btoa(text);
};
const base64ToBytes=value=>Uint8Array.from(atob(value),char=>char.charCodeAt(0));
const runtimeKey=async env=>{
 const seed=clean(env.STAFF_ACTIVATION_SEEDS);
 if(!seed||!globalThis.crypto?.subtle)return null;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`sapo-runtime-session:${seed}`));
 return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
};
const ensureRuntimeSessionTable=db=>db.prepare(`CREATE TABLE IF NOT EXISTS sapo_runtime_sessions (
 id TEXT PRIMARY KEY, encrypted_cookie TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
)`).run();

export async function storeSapoRuntimeSession(db,env,cookie,memberId){
 const value=clean(cookie);
 if(!db||!value||value.length>30000||/[\r\n]/.test(value)||!/(^|;\s*)_admin_session_id=/.test(value))throw new QuotationError(400,'Phiên Sapo không hợp lệ. Vui lòng đăng nhập lại Sapo rồi thử lại.');
 const key=await runtimeKey(env);if(!key)throw new QuotationError(503,'Chưa có khóa bảo mật để lưu phiên Sapo.');
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value));
 const payload=`${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
 await ensureRuntimeSessionTable(db);
 await db.prepare(`INSERT INTO sapo_runtime_sessions (id,encrypted_cookie,updated_at,updated_by)
 VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET encrypted_cookie=excluded.encrypted_cookie,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
  .bind(runtimeSessionId,payload,new Date().toISOString(),clean(memberId)||'manager').run();
 return {updatedAt:new Date().toISOString()};
}

export async function getSapoRuntimeSessionStatus(db){
 if(!db)return {configured:false,updatedAt:null};
 try{const row=await db.prepare('SELECT updated_at,updated_by FROM sapo_runtime_sessions WHERE id=?').bind(runtimeSessionId).first();return {configured:Boolean(row),updatedAt:row?.updated_at||null,updatedBy:row?.updated_by||null};}
 catch{return {configured:false,updatedAt:null};}
}

async function readSapoRuntimeSession(env){
 if(!env.DB)return '';
 try{
  const row=await env.DB.prepare('SELECT encrypted_cookie FROM sapo_runtime_sessions WHERE id=?').bind(runtimeSessionId).first();
  if(!row?.encrypted_cookie)return '';
  const [ivText,dataText]=String(row.encrypted_cookie).split('.');if(!ivText||!dataText)return '';
  const key=await runtimeKey(env);if(!key)return '';
  const value=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(ivText)},key,base64ToBytes(dataText));
  return clean(new TextDecoder().decode(value));
 }catch{return '';}
}

export function sapoAdminBase(env={}){
 return clean(env.SAPO_ADMIN_BASE||defaultBase).replace(/\/$/,'');
}

async function sapoCookie(env={}){
 // The encrypted runtime session is newer than a deployment secret after an admin refreshes Sapo.
 return (await readSapoRuntimeSession(env))||clean(env.SAPO_ADMIN_COOKIE||env.SAPO_COOKIE);
}

export function sapoOrderUrl(env,id){
 return id?`${sapoAdminBase(env)}/orders/${encodeURIComponent(id)}`:'';
}

export function sapoPurchaseOrderUrl(env,id){
 return id?`${sapoAdminBase(env)}/purchase_orders/${encodeURIComponent(id)}`:'';
}

export async function sapoAdminRequest(env,path,options={},request=fetch){
 const cookie=await sapoCookie(env);
 if(!cookie)throw new QuotationError(503,'Chưa cấu hình Sapo direct. Cần thêm SAPO_ADMIN_COOKIE vào Sites env.');
 const base=sapoAdminBase(env),origin=base.replace(/\/admin$/,'');
 const {referer,locationId,timeout,headers:extraHeaders,signal,...fetchOptions}=options;
 const headers={
  cookie,
  accept:'application/json,text/plain,*/*',
  'content-type':'application/json; charset=UTF-8',
  'x-sapo-client':'sapo-frontend-v3',
  'x-sapo-serviceid':'sapo-frontend-v3',
  'x-requested-with':'XMLHttpRequest',
  'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 OpenClaw-Sapo-Direct',
  origin,
  referer:referer||base,
  'accept-language':'vi',
  ...(locationId?{'x-sapo-locationid':String(locationId)}:{}),
  ...(extraHeaders||{}),
 };
 const timeoutSignal=typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(timeout||45000):undefined;
 let response;
 try{response=await request(base+path,{...fetchOptions,headers,signal:signal||timeoutSignal});}
 catch(error){throw new QuotationError(504,'Sapo direct chưa phản hồi. Kiểm tra phiên Sapo trước khi thử lại.');}
 const raw=await response.text();
 let body;try{body=raw?JSON.parse(raw):{};}catch{body=raw;}
 const text=typeof body==='string'?body:JSON.stringify(body);
 const loginResponse=typeof body==='string' && /login|unauthorized|forbidden/i.test(text.slice(0,500));
 if(response.status===401||response.status===403||loginResponse){
  throw new QuotationError(503,'Phiên Sapo direct hết hạn hoặc chưa đủ quyền. Cần refresh/cập nhật SAPO_ADMIN_COOKIE.');
 }
 if(!response.ok)throw new QuotationError(response.status,`Sapo direct báo lỗi (${response.status}): ${text.slice(0,300)}`);
 if(!body||typeof body!=='object'||Array.isArray(body))throw new QuotationError(502,'Sapo trả dữ liệu không hợp lệ. Vui lòng kiểm tra lại kết nối.');
 return body;
}

// A read-only probe: never creates customers, products or orders.
export async function checkSapoConnection(env,request=fetch){
 const body=await sapoAdminRequest(env,'/orders.json?limit=1',{timeout:15000},request);
 if(!Array.isArray(body.orders))throw new QuotationError(502,'Sapo chưa trả danh sách đơn hàng hợp lệ.');
 return {ok:true,checkedAt:new Date().toISOString(),message:'Đã kết nối Sapo.'};
}
