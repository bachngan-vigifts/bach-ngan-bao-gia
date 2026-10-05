import {QuotationError} from './quotation-store.mjs';

export const clean=value=>value===undefined||value===null?'':String(value).trim();
export const number=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback;};
export const compactObject=value=>Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined&&item!==null&&item!==''));
export const normalize=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
export const sapoId=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+String(Math.random()).slice(2);

const defaultBase='https://bachngankiengiang.mysapogo.com/admin';
const runtimeSessionId='active';
const sapoRefreshWarnHours=6;

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

const sapoError=(status,code,message,details={})=>{
 const error=new QuotationError(status,message);
 error.code=code;
 error.details=details;
 return error;
};

function classifySapoResponse(response,body){
 const text=typeof body==='string'?body:JSON.stringify(body);
 const head=text.slice(0,800),contentType=clean(response.headers?.get?.('content-type')).toLowerCase();
 const redirectedToLogin=response.redirected&&/\/admin\/login|\/login/i.test(clean(response.url));
 const locationLogin=/\/admin\/login|\/login/i.test(clean(response.headers?.get?.('location')));
 const htmlLogin=contentType.includes('text/html')&&/login|đăng nhập|dang nhap|unauthorized/i.test(head);
 if(response.status===401||redirectedToLogin||locationLogin||htmlLogin)return {
  code:'SAPO_SESSION_EXPIRED',
  status:503,
  message:'Phiên Sapo direct hết hạn. Manager cần đăng nhập lại Sapo rồi cập nhật phiên Sapo trên web báo giá.',
 };
 if(response.status===403)return {
  code:'SAPO_PERMISSION_DENIED',
  status:403,
  message:'Tài khoản Sapo trong phiên hiện tại chưa đủ quyền thao tác. Manager cần dùng tài khoản có quyền đơn hàng/sản phẩm/khách hàng rồi cập nhật lại phiên Sapo.',
 };
 if(!response.ok)return {
  code:'SAPO_DIRECT_HTTP_ERROR',
  status:response.status,
  message:`Sapo direct báo lỗi (${response.status}): ${text.slice(0,300)}`,
 };
 return null;
}

function refreshWarning(updatedAt,env={}){
 const warnHours=number(env.SAPO_COOKIE_REFRESH_WARN_HOURS,sapoRefreshWarnHours);
 const time=Date.parse(updatedAt||'');
 if(!Number.isFinite(time)||warnHours<=0)return {refreshRecommended:false};
 const ageHours=(Date.now()-time)/36e5;
 return {refreshRecommended:ageHours>=warnHours,ageHours:Number(ageHours.toFixed(2)),warnAfterHours:warnHours};
}

async function readSapoRuntimeSessionResult(env){
 if(!env.DB)return {cookie:'',configured:false,readable:false};
 try{
  const row=await env.DB.prepare('SELECT encrypted_cookie FROM sapo_runtime_sessions WHERE id=?').bind(runtimeSessionId).first();
  if(!row?.encrypted_cookie)return {cookie:'',configured:false,readable:false};
  const [ivText,dataText]=String(row.encrypted_cookie).split('.');if(!ivText||!dataText)return {cookie:'',configured:true,readable:false,error:'runtime_session_invalid'};
  const key=await runtimeKey(env);if(!key)return {cookie:'',configured:true,readable:false,error:'runtime_session_key_missing'};
  const value=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(ivText)},key,base64ToBytes(dataText));
  return {cookie:clean(new TextDecoder().decode(value)),configured:true,readable:true};
 }catch(error){return {cookie:'',configured:true,readable:false,error:'runtime_session_unreadable'};}
}

async function readSapoRuntimeSession(env){
 return (await readSapoRuntimeSessionResult(env)).cookie;
}

export function sapoAdminBase(env={}){
 return clean(env.SAPO_ADMIN_BASE||defaultBase).replace(/\/$/,'');
}

async function sapoCookie(env={}){
 // The encrypted runtime session is newer than a deployment secret after an admin refreshes Sapo.
 return (await readSapoRuntimeSession(env))||clean(env.SAPO_ADMIN_COOKIE||env.SAPO_COOKIE);
}

async function sapoCookieCandidates(env={}){
 const runtime=await readSapoRuntimeSession(env),deployment=clean(env.SAPO_ADMIN_COOKIE||env.SAPO_COOKIE),candidates=[];
 if(runtime)candidates.push({source:'runtime_session',cookie:runtime});
 if(deployment&&deployment!==runtime)candidates.push({source:'deployment_env',cookie:deployment});
 return candidates;
}

export async function getSapoRuntimeSessionStatus(db,env={}){
 if(!db)return {configured:false,updatedAt:null,deploymentCookieConfigured:Boolean(clean(env.SAPO_ADMIN_COOKIE||env.SAPO_COOKIE)),activeSource:clean(env.SAPO_ADMIN_COOKIE||env.SAPO_COOKIE)?'deployment_env':'none'};
 try{
  const row=await db.prepare('SELECT updated_at,updated_by FROM sapo_runtime_sessions WHERE id=?').bind(runtimeSessionId).first();
  const deploymentCookieConfigured=Boolean(clean(env.SAPO_ADMIN_COOKIE||env.SAPO_COOKIE));
  if(!row)return {configured:false,updatedAt:null,deploymentCookieConfigured,activeSource:deploymentCookieConfigured?'deployment_env':'none'};
  const runtime=await readSapoRuntimeSessionResult({...env,DB:db});
  return {configured:true,updatedAt:row.updated_at||null,updatedBy:row.updated_by||null,runtimeReadable:runtime.readable,activeSource:runtime.cookie?'runtime_session':deploymentCookieConfigured?'deployment_env':'none',deploymentCookieConfigured,...refreshWarning(row.updated_at,env)};
 }
 catch{return {configured:false,updatedAt:null,deploymentCookieConfigured:Boolean(clean(env.SAPO_ADMIN_COOKIE||env.SAPO_COOKIE)),activeSource:clean(env.SAPO_ADMIN_COOKIE||env.SAPO_COOKIE)?'deployment_env':'none'};}
}

export function sapoOrderUrl(env,id){
 return id?`${sapoAdminBase(env)}/orders/${encodeURIComponent(id)}`:'';
}

export function sapoPurchaseOrderUrl(env,id){
 return id?`${sapoAdminBase(env)}/purchase_orders/${encodeURIComponent(id)}`:'';
}

export async function sapoAdminRequest(env,path,options={},request=fetch){
 const candidates=await sapoCookieCandidates(env);
 if(!candidates.length)throw sapoError(503,'SAPO_COOKIE_MISSING','Chưa cấu hình Sapo direct. Manager cần cập nhật phiên Sapo trên web báo giá hoặc thêm SAPO_ADMIN_COOKIE vào Sites env.');
 const base=sapoAdminBase(env),origin=base.replace(/\/admin$/,'');
 const {referer,locationId,timeout,headers:extraHeaders,signal,...fetchOptions}=options;
 const timeoutSignal=typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(timeout||45000):undefined;
 let lastError=null;
 for(const candidate of candidates){
  const headers={
   cookie:candidate.cookie,
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
  let response;
  try{response=await request(base+path,{...fetchOptions,headers,signal:signal||timeoutSignal});}
  catch(error){throw sapoError(504,'SAPO_DIRECT_UNREACHABLE','Sapo direct chưa phản hồi. Kiểm tra kết nối Sapo trước khi thử lại.');}
  const raw=await response.text();
  let body;try{body=raw?JSON.parse(raw):{};}catch{body=raw;}
  const classified=classifySapoResponse(response,body);
  if(classified){
   lastError=sapoError(classified.status,classified.code,classified.message,{httpStatus:response.status,source:candidate.source});
   if(candidate.source==='runtime_session'&&classified.code==='SAPO_SESSION_EXPIRED'&&candidates.some(item=>item.source==='deployment_env'))continue;
   throw lastError;
  }
  if(!body||typeof body!=='object'||Array.isArray(body))throw new QuotationError(502,'Sapo trả dữ liệu không hợp lệ. Vui lòng kiểm tra lại kết nối.');
  Object.defineProperty(body,'__sapoActiveSource',{value:candidate.source,enumerable:false});
  return body;
 }
 throw lastError||sapoError(503,'SAPO_SESSION_EXPIRED','Phiên Sapo direct hết hạn. Manager cần đăng nhập lại Sapo rồi cập nhật phiên Sapo trên web báo giá.');
}

// A read-only probe: never creates customers, products or orders.
export async function checkSapoConnection(env,request=fetch){
 const body=await sapoAdminRequest(env,'/orders.json?limit=1',{timeout:15000},request);
 if(!Array.isArray(body.orders))throw new QuotationError(502,'Sapo chưa trả danh sách đơn hàng hợp lệ.');
 return {ok:true,checkedAt:new Date().toISOString(),message:'Đã kết nối Sapo.'};
}

export async function checkSapoAdminHealth(env={},request=fetch){
 const session=await getSapoRuntimeSessionStatus(env.DB,env);
 try{
  const body=await sapoAdminRequest(env,'/accounts.json?limit=1',{timeout:15000},request);
  const activeSource=body.__sapoActiveSource||session.activeSource;
  return {...session,activeSource,ok:true,code:'SAPO_HEALTH_OK',accountCount:Array.isArray(body?.accounts)?body.accounts.length:undefined,message:session.refreshRecommended?'Phiên Sapo đang hoạt động nhưng nên refresh sớm.':'Phiên Sapo direct đang hoạt động.'};
 }catch(error){
  return {...session,ok:false,code:error.code||'SAPO_HEALTH_ERROR',status:error.status||500,message:error.message};
 }
}
