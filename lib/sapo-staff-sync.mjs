import {QuotationError} from './quotation-store.mjs';
import {sapoAdminRequest} from './sapo-admin.mjs';
import {syncStaffMembers} from './staff-sync.mjs';

const fail=(status,message)=>{throw new QuotationError(status,message);};
const text=(value,max=500)=>String(value??'').trim().slice(0,max);

async function syncStaffDirect(env,fetchImpl){
 if(!env.DB)fail(503,'Cơ sở dữ liệu chưa sẵn sàng để đồng bộ nhân viên Sapo.');
 const payload=await sapoAdminRequest(env,'/accounts.json?limit=100',{method:'GET'},fetchImpl);
 const accounts=Array.isArray(payload?.accounts)?payload.accounts:[];
 const observedAt=new Date().toISOString();
 const members=accounts
  .filter(account=>text(account?.id,80)&&text(account?.full_name||account?.name||account?.email,200))
  .map(account=>({
   id:text(account.id,80),
   name:text(account.full_name||account.name||account.email,200),
   email:text(account.email,254),
   phone:text(account.phone||account.mobile_phone||account.mobile,40),
   active:account.active,
   status:account.status,
   updatedAt:text(account.updated_at||account.updatedAt||account.last_updated_at||account.last_login,80)||observedAt,
  }));
 const result=await syncStaffMembers(env.DB,{observedAt,members});
 return {ok:true,kind:'staff',source:'sapo-direct',...result};
}

export async function triggerSapoStaffSync(env,fetchImpl=fetch){
 const url=String(env.SAPO_STAFF_SYNC_WEBHOOK_URL||'').trim();
 if(!/^https:\/\/[\w.-]+\/.+/.test(url))fail(503,'Chưa cấu hình luồng đồng bộ nhân viên Sapo.');
 const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({action:'sync_staff_all'})});
 let data=null;try{data=await response.json();}catch{}
 if(!response.ok){
  // A 530 is emitted by the intermediary webhook/proxy, so bypass it with the manager's direct Sapo session.
  if(response.status===530)return syncStaffDirect(env,fetchImpl);
  fail(502,'Luồng đồng bộ nhân viên Sapo trả lỗi HTTP '+response.status+'.');
 }
 if(!data?.ok)fail(502,data?.error||'Luồng đồng bộ nhân viên Sapo chưa chạy thành công.');
 return {ok:true,kind:data.kind||'staff',received:data.received||0,applied:data.quoteWeb?.applied??data.applied??0};
}
