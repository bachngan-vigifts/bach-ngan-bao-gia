import {checkSapoAdminHealth,clean} from './sapo-admin.mjs';

const stateId='active';
const defaultIntervalMinutes=30;
const repeatAlertHours=6;
const timers=new WeakSet();
let memoryState=null;

const nowIso=now=>new Date(now).toISOString();
const number=(value,fallback)=>{const n=Number(value);return Number.isFinite(n)?n:fallback;};

export function sapoHealthMessage(health,event='error'){
 const code=health?.code||'SAPO_HEALTH_ERROR';
 if(event==='recovered')return 'Phiên Sapo direct đã khôi phục. Web báo giá có thể copy đơn vào Sapo lại.';
 if(event==='fallback')return 'Web báo giá đang fallback từ phiên Sapo runtime sang SAPO_ADMIN_COOKIE trong env. Manager nên cập nhật lại phiên Sapo runtime để tránh hết hạn im lặng.';
 if(code==='SAPO_SESSION_EXPIRED')return 'Phiên Sapo direct hết hạn. Manager đăng nhập lại Sapo rồi cập nhật qua /admin/sapo-session.';
 if(code==='SAPO_PERMISSION_DENIED')return 'Tài khoản Sapo hiện tại thiếu quyền. Manager cần đăng nhập bằng tài khoản có quyền đơn hàng/sản phẩm/khách hàng rồi cập nhật lại phiên.';
 if(code==='SAPO_COOKIE_MISSING')return 'Chưa có cookie Sapo direct. Manager cần cập nhật phiên Sapo hoặc cấu hình SAPO_ADMIN_COOKIE.';
 if(code==='SAPO_DIRECT_UNREACHABLE')return 'Sapo direct chưa phản hồi. Kiểm tra kết nối Sapo rồi thử lại.';
 return health?.message||'Sapo direct đang lỗi. Manager cần kiểm tra phiên Sapo trước khi copy đơn.';
}

function safeWebhookUrl(env){
 const value=clean(env.SAPO_ALERT_WEBHOOK_URL);
 if(!value)return '';
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}

export function createSapoHealthNotifier(env={},request=fetch){
 const webhook=safeWebhookUrl(env);
 return async alert=>{
  if(!webhook)return {ok:false,skipped:true};
  const body={
   source:'bach-ngan-bao-gia',
   kind:'sapo_health_alert',
   event:alert.event,
   ok:alert.health?.ok===true,
   code:alert.health?.code||'SAPO_HEALTH_ERROR',
   activeSource:alert.health?.activeSource||'none',
   checkedAt:alert.checkedAt,
   title:alert.title,
   message:alert.message,
  };
  const response=await request(webhook,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  return {ok:response.ok,status:response.status};
 };
}

async function ensureStateTable(db){
 if(!db)return;
 await db.prepare(`CREATE TABLE IF NOT EXISTS sapo_health_monitor_state (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
 )`).run();
}

export async function readSapoHealthMonitorState(db){
 if(!db)return memoryState;
 try{
  const row=await db.prepare('SELECT data FROM sapo_health_monitor_state WHERE id=?').bind(stateId).first();
  return row?.data?JSON.parse(row.data):null;
 }catch{return null;}
}

async function writeSapoHealthMonitorState(db,state){
 memoryState=state;
 if(!db)return;
 await ensureStateTable(db);
 await db.prepare(`INSERT INTO sapo_health_monitor_state (id,data,updated_at)
 VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`)
  .bind(stateId,JSON.stringify(state),state.checkedAt||nowIso(Date.now())).run();
}

function shouldAlert(previous,health,now){
 const lastAlertAt=Date.parse(previous?.lastAlertAt||'')||0;
 const canRepeat=!lastAlertAt||now-lastAlertAt>=repeatAlertHours*3600000;
 if(previous?.ok===false&&health.ok)return {event:'recovered',key:'recovered:'+previous.code};
 if(previous?.activeSource==='runtime_session'&&health.activeSource==='deployment_env')return {event:'fallback',key:'fallback:deployment_env'};
 if(!health.ok&&previous?.ok!==false)return {event:'error',key:'error:'+health.code};
 if(!health.ok&&canRepeat)return {event:'error',key:'error:'+health.code};
 return null;
}

export async function runSapoHealthMonitor(env={},options={}){
 if(clean(env.SAPO_HEALTH_MONITOR).toLowerCase()==='off')return {skipped:true,reason:'disabled'};
 const now=options.now?.()??Date.now(),checkedAt=nowIso(now),db=env.DB||null;
 const previous=options.previousState!==undefined?options.previousState:await readSapoHealthMonitorState(db);
 const health=await (options.healthCheck?options.healthCheck(env):checkSapoAdminHealth(env,options.request||fetch));
 const alert=shouldAlert(previous,health,now);
 let alertResult=null,alertError='';
 if(alert){
  const message=sapoHealthMessage(health,alert.event);
  const title=alert.event==='recovered'?'Sapo direct đã khôi phục':alert.event==='fallback'?'Sapo direct đang dùng env fallback':'Cảnh báo Sapo direct';
  try{alertResult=await (options.notifier||createSapoHealthNotifier(env,options.request||fetch))({event:alert.event,key:alert.key,title,message,health,checkedAt});}
  catch(error){alertError=error?.name||'notifier_error';}
 }
 const next={ok:Boolean(health.ok),code:health.code||'',message:health.message||'',activeSource:health.activeSource||'none',checkedAt,lastAlertAt:alert?checkedAt:previous?.lastAlertAt||null,lastAlertKey:alert?.key||previous?.lastAlertKey||'',lastAlertError:alertError||'',health};
 await writeSapoHealthMonitorState(db,next);
 return {health,state:next,alertSent:Boolean(alert),alertResult,alertError};
}

export async function runSapoHealthMonitorIfDue(env={},options={}){
 if(clean(env.SAPO_HEALTH_MONITOR).toLowerCase()==='off')return {skipped:true,reason:'disabled'};
 const now=options.now?.()??Date.now(),intervalMinutes=Math.max(1,number(env.SAPO_HEALTH_INTERVAL_MIN,defaultIntervalMinutes));
 const state=await readSapoHealthMonitorState(env.DB||null),last=Date.parse(state?.checkedAt||'')||0;
 if(last&&now-last<intervalMinutes*60000)return {skipped:true,reason:'not_due',state};
 return runSapoHealthMonitor(env,{...options,previousState:state});
}

export function startSapoHealthMonitor(env={},ctx=null,options={}){
 if(clean(env.SAPO_HEALTH_MONITOR).toLowerCase()==='off')return;
 if(ctx?.waitUntil)ctx.waitUntil(runSapoHealthMonitorIfDue(env,options).catch(()=>{}));
 if(typeof setInterval!=='function'||timers.has(env))return;
 timers.add(env);
 const intervalMinutes=Math.max(1,number(env.SAPO_HEALTH_INTERVAL_MIN,defaultIntervalMinutes));
 const timer=setInterval(()=>runSapoHealthMonitor(env,options).catch(()=>{}),intervalMinutes*60000);
 if(typeof timer?.unref==='function')timer.unref();
}
