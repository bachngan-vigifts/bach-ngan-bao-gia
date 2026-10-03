import {isActiveSapoStaff} from './sapo-staff-status.mjs';
import {createQuotationStore,QuotationError} from './quotation-store.mjs';
import {sapoAdminRequest,sapoOrderUrl,normalize} from './sapo-admin.mjs';
const fail=(s,m)=>{throw new QuotationError(s,m);};
const txt=(v,n=3000)=>String(v??'').trim().slice(0,n);
const stamp=()=>new Date().toISOString();
const parse=s=>{try{return JSON.parse(s||'{}');}catch{return {};}};
const rows=async(db,sql,...v)=>(await db.prepare(sql).bind(...v).all()).results||[];
const amount=(v,label,optional=false)=>{if((v===''||v==null)&&optional)return null;const n=Number(v);if(v===''||v==null||!Number.isSafeInteger(n)||n<0||n>1e12)fail(400,label+' phải là số tiền nguyên, không âm.');return n;};
const choice=(v,values,fallback='')=>values.includes(v)?v:fallback;
const tags=(v,values,max=8)=>Array.isArray(v)?[...new Set(v.map(x=>txt(x,80)).filter(x=>values.includes(x)))].slice(0,max):[];
const taskState=v=>choice(v,['done','partial','not_done'],'not_done');
const manager=m=>{if(m.role!=='manager')fail(403,'Chỉ quản lý được thực hiện thao tác này.');};
const publicError=e=>e?.status===503?'Không kết nối được Sapo: phiên đăng nhập hết hạn, thiếu cấu hình hoặc chưa đủ quyền.':e?.status===504?'Sapo phản hồi quá chậm hoặc kết nối bị gián đoạn. Vui lòng thử lại.':e?.status?`Sapo trả lỗi HTTP ${e.status}. Vui lòng thử lại.`:'Sapo trả dữ liệu không hợp lệ hoặc chưa đủ trang. Vui lòng thử lại.';
const divisions={'sales-ml':'Minh Long Cần Thơ','sales-lock':'LocknLock Cần Thơ'};
const defaultSharedKeepers={'51380':{'sales-lock':'NV-2f7239bd-79b8-41a3-915c-1c4805c60ece','sales-ml':'NV-86c09732-30ae-4b36-aba9-8d55a30e9344'}};
export const isSharedRetailBranch=name=>{const n=normalize(name);return /minh long/.test(n)&&/lock\s*n?\s*lock/.test(n)&&/can tho/.test(n);};
// Sales groups share Sapo's physical location, but keep separate web shifts and cash ledgers.
export function splitRetailBranches(branches){return branches.flatMap(b=>isSharedRetailBranch(b.name)?Object.entries(divisions).map(([positionId,name])=>({...b,keeper_id:branchKeeper(b,positionId),id:b.id+'~'+positionId,name,sapoLocationId:b.id,sapoLocationName:b.name,positionId,sharedSapoLocation:true,sharedCash:false})): [b]);}
function branchScope(id){const [sourceId,positionId,...extra]=String(id||'').split('~');if(extra.length||(positionId&&!divisions[positionId]))fail(400,'Nhóm chi nhánh không hợp lệ.');return {sourceId,positionId:positionId||''};}
function keeperMap(value){try{const parsed=JSON.parse(value||'');return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;}catch{return null;}}
function branchKeeper(branch,positionId=''){const map=keeperMap(branch?.keeper_id);if(map)return txt(map[positionId]||map.default||'',80)||null;const preset=defaultSharedKeepers[String(branch?.id||'')]?.[positionId];return preset||branch?.keeper_id||null;}
function keeperValue(current,positionId,keeperId){if(!positionId)return keeperId;const map=keeperMap(current)||{};if(keeperId)map[positionId]=keeperId;else delete map[positionId];return Object.keys(map).length?JSON.stringify(map):null;}
function shiftPosition(shift){return txt(parse(shift?.data).positionId,80);}
const sapoBranchId=branch=>String(branch?.sapoLocationId||branch?.id||'');
const virtualBranch=(source,positionId)=>positionId?{...source,id:source.id+'~'+positionId,name:divisions[positionId],keeper_id:branchKeeper(source,positionId),sapoLocationId:source.id,positionId,sharedSapoLocation:true,sharedCash:false}:source;
async function ensureVirtualBranch(db,source,positionId){
 if(!positionId)return source;
 const branch=virtualBranch(source,positionId),now=stamp();
 const people=await rows(db,'SELECT a.member_id,a.sapo_account_id FROM work_assignments a JOIN staff_members m ON m.id=a.member_id WHERE a.branch_id=? AND m.position_id=?',source.id,positionId);
 await db.batch([
  db.prepare('INSERT INTO work_branches(id,name,keeper_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,keeper_id=excluded.keeper_id,updated_at=excluded.updated_at').bind(branch.id,branch.name,branch.keeper_id,now),
  db.prepare('DELETE FROM work_assignments WHERE branch_id=?').bind(branch.id),
  ...people.map(p=>db.prepare('INSERT INTO work_assignments(member_id,branch_id,sapo_account_id,updated_at) VALUES(?,?,?,?)').bind(p.member_id,branch.id,p.sapo_account_id,now))
 ]);
 return branch;
}
function displayBranch(branch,positionId){return isSharedRetailBranch(branch.name)&&divisions[positionId]?{...branch,keeper_id:branchKeeper(branch,positionId),id:branch.id+'~'+positionId,name:divisions[positionId],sapoLocationId:branch.id,sapoLocationName:branch.name,positionId,sharedSapoLocation:true,sharedCash:false}:branch;}
const shiftScopeSql="COALESCE(json_extract(data,'$.positionId'),'')=?";
const shiftScope=(branchId,positionId)=>[branchId,positionId||''];
export function reportPeriod(body){
 const date=txt(body.date,10),start=txt(body.start,5),end=txt(body.end,5);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||![start,end].every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))fail(400,'Ngày hoặc giờ ca không hợp lệ.');
 const from=new Date(date+'T'+start+':00+07:00'),to=new Date(date+'T'+end+':00+07:00');
 if(!Number.isFinite(from.getTime())||new Date(from.getTime()+25200000).toISOString().slice(0,10)!==date||to<=from||to-from>86400000)fail(400,'Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày.');
 if(from.getTime()>Date.now()+86400000)fail(400,'Chỉ lập báo cáo đến ngày mai.');
 return {date,start,end,from:from.toISOString(),to:to.toISOString(),label:start+'–'+end};
}
async function branchAccess(db,m,branchId){
 const scope=branchScope(branchId),branch=await db.prepare('SELECT * FROM work_branches WHERE id=?').bind(txt(scope.sourceId,80)).first();
 if(!branch)fail(400,'Quản lý cần thiết lập chi nhánh Sapo trước.');if(scope.positionId&&(!isSharedRetailBranch(branch.name)||(m.role!=='manager'&&m.position_id!==scope.positionId)))fail(403,'Bạn không thuộc nhóm chi nhánh này.');
 const assignment=await db.prepare('SELECT * FROM work_assignments WHERE member_id=? AND branch_id=?').bind(m.id,branch.id).first();
 if(m.role!=='manager'&&!assignment)fail(403,'Bạn chưa được phân công tại chi nhánh này.');
 return {branch:virtualBranch(branch,scope.positionId),assignment};
}
async function shiftAccess(db,m,id){
 const shift=await db.prepare('SELECT * FROM work_shifts WHERE id=?').bind(txt(id,200)).first();if(!shift)fail(404,'Không tìm thấy ca.');
 return {shift,...await branchAccess(db,m,shift.branch_id)};
}
async function listSapo(env,path,key,request=fetch){
 const all=[],seen=new Set();
 for(let page=1;page<=20;page++){
  const data=await sapoAdminRequest(env,path+(path.includes('?')?'&':'?')+'limit=250&page='+page,{timeout:18000},request);
  if(!Array.isArray(data?.[key]))throw Error('Dữ liệu không đúng định dạng.');
  const batch=data[key];
  for(const r of batch){if(r.id==null||seen.has(String(r.id)))throw Error('Danh sách không đầy đủ hoặc lặp trang.');seen.add(String(r.id));all.push(r);}
  const total=Number(data.metadata?.total??data.total);
  if(Number.isFinite(total)&&total>0&&all.length>=total)return all;
  if(batch.length<250){if(Number.isFinite(total)&&total>all.length)throw Error('Thiếu trang dữ liệu Sapo.');return all;}
 }
 throw Error('Vượt số lượng có thể đối chiếu trong một lần.');
}
const orderTime=o=>Date.parse(o.modified_on||o.updated_on||o.updated_at||o.created_on||o.created_at);
async function listRecentSapoOrders(env,{branchId,accountIds,from},request=fetch){
 const all=[],seen=new Set(),start=Date.parse(from),accounts=[...accountIds].filter(Boolean);
 let complete=true,message='';
 for(const accountId of accounts){
  let reachedEnd=false,lastTime=Infinity,ordered=true;
  let fetched=0;
  for(let page=1;page<=20;page++){
   const query=new URLSearchParams({location_ids:String(branchId),assignee_id:String(accountId)});
   const data=await sapoAdminRequest(env,'/orders.json?'+query+'&limit=250&page='+page,{timeout:18000},request);
   if(!Array.isArray(data?.orders))throw Error('Dữ liệu không đúng định dạng.');
   const batch=data.orders;
   fetched+=batch.length;
   let pageOld=true;
   for(const order of batch){
    if(order.id==null)throw Error('Danh sách không đầy đủ hoặc lặp trang.');
    const time=orderTime(order);
    if(!Number.isFinite(time)||order.location_id==null||!(order.created_on||order.created_at)){
     complete=false;
     message='Một số đơn thiếu mốc thời gian hoặc chi nhánh; cần kiểm tra lại trên Sapo.';
     pageOld=false;
    }else{
     if(time>lastTime)ordered=false;
     lastTime=time;
     if(time>=start)pageOld=false;
    }
    const id=String(order.id);
    if(!seen.has(id)){seen.add(id);all.push(order);}
   }
   if(batch.length<250){
    const total=Number(data.metadata?.total??data.total);
    if(Number.isFinite(total)&&total>fetched){
     complete=false;
     message='Sapo báo còn đơn nhưng không trả đủ trang dữ liệu; vui lòng thử lại hoặc kiểm tra trực tiếp trên Sapo.';
    }
    reachedEnd=true;break;
   }
   if(ordered&&pageOld){reachedEnd=true;break;}
  }
  if(!reachedEnd){
   complete=false;
   message='Tài khoản Sapo có quá nhiều đơn để đối chiếu trong một lần; vui lòng chia ca ngắn hơn hoặc kiểm tra trực tiếp trên Sapo.';
  }
 }
 return {orders:all,complete,message};
}
export async function reportSapoOptions(env,request=fetch){
 const [locations,accounts]=await Promise.all([listSapo(env,'/locations.json','locations',request),listSapo(env,'/accounts.json','accounts',request)]);
 const sapoLocations=locations.filter(x=>x.status!=='inactive').map(x=>({id:String(x.id),name:txt(x.name,200)||txt(x.label,200)||txt(x.full_name,200)||txt(x.code,200)||('Chi nhánh #'+String(x.id))}));return {locations:splitRetailBranches(sapoLocations),sapoLocations,accounts:accounts.filter(isActiveSapoStaff).map(x=>({id:String(x.id),name:txt(x.full_name||x.name||x.email,200),email:txt(x.email,254)}))};
}
export async function workContext(env,m){
 const db=env.DB;
 const branches=m.role==='manager'?await rows(db,"SELECT * FROM work_branches WHERE instr(id,'~')=0 ORDER BY name"):await rows(db,"SELECT b.* FROM work_branches b JOIN work_assignments a ON a.branch_id=b.id WHERE a.member_id=? AND instr(b.id,'~')=0 ORDER BY b.name",m.id);
 const assignments=m.role==='manager'?await rows(db,'SELECT * FROM work_assignments'):await rows(db,'SELECT * FROM work_assignments WHERE member_id=?',m.id);
 const members=await rows(db,`SELECT m.id,m.name,m.email,m.position_id,p.name AS position_name FROM staff_members m LEFT JOIN staff_positions p ON p.id=m.position_id WHERE m.active=1 AND m.role<>'supplier' ${m.role==='manager'?'':"AND (m.role='manager' OR m.position_id=?)"} ORDER BY m.name`,...(m.role==='manager'?[]:[m.position_id||'']));
 const sapoLinks=m.role==='manager'?await rows(db,'SELECT sapo_id,member_id FROM staff_sapo_links'):[];
 return {sapoLinks,branches:branches.flatMap(b=>m.role==='manager'?splitRetailBranches([b]):[displayBranch(b,m.position_id)]),assignments,members,user:{id:m.id,name:m.name,role:m.role,position:m.position_name,positionId:m.position_id}};
}
export async function saveWorkConfiguration(env,m,body,request=fetch){
 manager(m);const db=env.DB,scope=branchScope(body.branchId),options=await reportSapoOptions(env,request),location=options.sapoLocations.find(x=>x.id===scope.sourceId);if(scope.positionId&&location&&!isSharedRetailBranch(location.name))fail(400,'Chi nhánh không hỗ trợ nhóm này.');
 if(!location)fail(400,'Chi nhánh không có trong Sapo.');
 if(!Array.isArray(body.assignments)||body.assignments.length>150)fail(400,'Danh sách phân công không hợp lệ.');
 const members=await rows(db,"SELECT id,position_id FROM staff_members WHERE active=1 AND role<>'supplier'");
 let values=body.assignments.map(a=>({memberId:txt(a.memberId,80),accountId:txt(a.accountId,80)}));
 if(values.some(a=>!members.some(m=>m.id===a.memberId)||!options.accounts.some(s=>s.id===a.accountId))||new Set(values.map(x=>x.memberId)).size!==values.length||new Set(values.map(x=>x.accountId)).size!==values.length)fail(400,'Nhân viên và tài khoản Sapo cần được ghép duy nhất, không trùng nhau.');
 if(scope.positionId){
 if(values.some(a=>{const person=members.find(x=>x.id===a.memberId);return person?.position_id!==scope.positionId;}))fail(400,'Nhân viên không thuộc nhóm chi nhánh đang chọn.');
  const retained=await rows(db,'SELECT a.member_id AS memberId,a.sapo_account_id AS accountId FROM work_assignments a JOIN staff_members m ON m.id=a.member_id WHERE a.branch_id=? AND (m.position_id IS NULL OR m.position_id<>?)',location.id,scope.positionId);
  values=[...values,...retained];
  if(new Set(values.map(x=>x.accountId)).size!==values.length)fail(400,'Tài khoản Sapo đã ghép cho nhân viên ở nhóm còn lại.');
 }
 const keeperId=txt(body.keeperId,80)||null;if(keeperId&&!values.some(a=>a.memberId===keeperId))fail(400,'Người giữ quỹ phải được phân công tại chi nhánh.');
 if(scope.positionId&&keeperId&&members.find(x=>x.id===keeperId)?.position_id!==scope.positionId)fail(400,'Người giữ quỹ phải thuộc đúng nhóm chi nhánh đang chọn.');
 const openKeepers=await rows(db,"SELECT keeper_id FROM work_shifts WHERE branch_id=? AND cash_status='open' AND keeper_id IS NOT NULL",location.id);
 if(openKeepers.some(s=>!values.some(v=>v.memberId===s.keeper_id)))fail(409,'Không thể bỏ phân công người đang giữ quỹ chưa chốt.');
 const existingBranch=await db.prepare('SELECT keeper_id FROM work_branches WHERE id=?').bind(location.id).first();
 const savedKeeper=keeperValue(existingBranch?.keeper_id,scope.positionId,keeperId);
 const now=stamp();await db.batch([
 db.prepare('INSERT INTO work_branches(id,name,keeper_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,keeper_id=excluded.keeper_id,updated_at=excluded.updated_at').bind(location.id,location.name,savedKeeper,now),
 db.prepare('DELETE FROM work_assignments WHERE branch_id=?').bind(location.id),
 ...values.map(a=>db.prepare('INSERT INTO work_assignments(member_id,branch_id,sapo_account_id,updated_at) VALUES(?,?,?,?)').bind(a.memberId,location.id,a.accountId,now)),
 db.prepare('INSERT INTO work_audit(id,entity_id,actor_id,action,data,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),location.id,m.id,'configuration',JSON.stringify({keeperId,positionId:scope.positionId,assignments:values}),now)]);
 return {ok:true};
}
export async function openReportShift(env,m,body){
 const db=env.DB,{branch:accessBranch}=await branchAccess(db,m,body.branchId),scope=branchScope(body.branchId),branch=await ensureVirtualBranch(db,{...accessBranch,id:scope.sourceId},scope.positionId),p=reportPeriod(body),id=branch.id+':'+p.date+':'+p.start+':'+p.end;
 await db.prepare('INSERT INTO work_shifts(id,branch_id,work_date,starts_at,ends_at,label,data,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,branch.id,p.date,p.from,p.to,p.label,JSON.stringify({positionId:scope.positionId||m.position_id||''}),stamp()).run();
 return workShiftDetails(env,m,id,body.branchId);
}
export async function workShiftDetails(env,m,id,viewBranchId=''){
 const db=env.DB,{shift,branch}=await shiftAccess(db,m,id);
 const viewScope=branchScope(viewBranchId);if(viewBranchId){if(viewScope.sourceId!==sapoBranchId(branch))fail(400,'Chi nhánh không khớp ca.');await branchAccess(db,m,viewBranchId);}
 const positionId=viewScope.positionId||shiftPosition(shift)||m.position_id;
 const reportBranch=displayBranch(branch,positionId);
 const reports=await rows(db,'SELECT * FROM work_reports WHERE shift_id=? AND member_id=? ORDER BY phase',id,m.id);
 const previous=await db.prepare(`SELECT id,actual,ends_at,keeper_id,revision FROM work_shifts WHERE branch_id=? AND ${shiftScopeSql} AND ends_at<=? AND cash_status='closed' ORDER BY ends_at DESC LIMIT 1`).bind(...shiftScope(branch.id,positionId),shift.starts_at).first();
 const snapshot=await db.prepare('SELECT id,data,created_at FROM work_snapshots WHERE member_id=? AND shift_id=? ORDER BY created_at DESC LIMIT 1').bind(m.id,id).first();
 const canCash=shift.keeper_id?shift.keeper_id===m.id:branchKeeper(branch,positionId)===m.id;
 // Quỹ chỉ hiển thị cho người giữ quỹ và quản lý; báo cáo cá nhân vẫn tách biệt.
 const visible=m.role==='manager'||canCash;
 return {shift:{...shift,...(!visible?{opening:null,actual:null,expected:null,difference:null,data:'{}'}:{}),data:visible?parse(shift.data):{}},reports:reports.map(r=>({...r,data:parse(r.data),snapshot:parse(r.snapshot)})),previous:visible?previous:null,canCash,branch:reportBranch,snapshot:snapshot&&(!reportBranch.positionId||parse(snapshot.data).positionId===reportBranch.positionId)?{id:snapshot.id,...parse(snapshot.data)}:null};
}
export async function workShiftQuotes(env,m,body){
 const {shift}=await shiftAccess(env.DB,m,body.shiftId),mode=choice(body.mode,['delivery','created'],'delivery');
 const store=createQuotationStore(env.DB,env.FILES,{quoteShareOverrides:env.QUOTE_SHARE_OVERRIDES,hidePdfOverrides:env.QUOTE_HIDE_PDF_OVERRIDES});
 return store.workForShift(m.id,{mode,date:shift.work_date,from:shift.starts_at,to:shift.ends_at});
}
export function mapSapoOrder(order,accountIds,ownId,branchId,from,to,accountNames=new Map()){
 if(String(order.location_id)!==String(branchId))return null;
 const account=String(order.assignee_id??order.account_id??'');if(!accountIds.has(account))return null;
 const created=Date.parse(order.created_on||order.created_at),updated=Date.parse(order.modified_on||order.updated_on||order.updated_at);
 const start=Date.parse(from),end=Date.parse(to),newInShift=created>=start&&created<end;
 if(!newInShift&&!(updated>=start&&updated<end))return null;
 const raw=txt(order.status,80).toLowerCase();
 const state=order.cancelled_on||order.cancelled_at||['cancelled','canceled','void','voided'].includes(raw)?'cancelled':['completed','finished'].includes(raw)?'completed':'processing';
 const total=Number(order.total??order.total_price),paidValue=order.total_paid??order.paid_amount??order.total_paid_amount;
 return {id:String(order.id),code:txt(order.code||order.order_number||order.reference_number,100),customer:txt(order.customer?.full_name||order.customer?.name||order.customer_name,300),accountId:account,salesName:txt(accountNames.get(account)||'',120),own:account===String(ownId),newInShift,status:state,rawStatus:raw,total:Number.isFinite(total)?total:null,paid:paidValue!=null&&Number.isFinite(Number(paidValue))?Number(paidValue):null};
}
function cashOrderId(row){const value=row.order_id??row.sale_order_id??row.source_id??row.reference_id??row.order?.id??row.sale_order?.id??row.source?.id;return value==null?'':String(value);}
// Fail closed: only explicit cash methods and posted receipt/payment records are usable.
export function summarizeCash(receipts,payments,branchId,from,to,options={}){
 let incoming=0,outgoing=0,unknown=0;const entries=[],seen=new Set();const start=Date.parse(from),end=Date.parse(to);
 for(const [kind,batch] of [['in',receipts],['out',payments]])for(const r of batch){
  if(r.location_id==null){unknown++;continue;}if(String(r.location_id)!==String(branchId))continue;
  const at=Date.parse(r.paid_on||r.received_on||r.processed_on);
  if(!Number.isFinite(at)){unknown++;continue;}if(at<start||at>=end)continue;
  const status=txt(r.status).toLowerCase();if(['cancelled','canceled','void','deleted'].includes(status))continue;
  if(!['paid','completed','success','active','confirmed'].includes(status)){unknown++;continue;}
  const method=normalize(r.payment_method?.name||r.payment_method_name||r.payment_method||r.method);
  if(!method){unknown++;continue;}
  if(!['cash','tien mat'].includes(method)){if(!/bank|transfer|chuyen khoan|card|the|cod|vi dien tu|wallet/.test(method))unknown++;continue;}
  if(options.orderIds){const orderId=cashOrderId(r);if(!orderId){unknown++;continue;}if(!options.orderIds.has(orderId))continue;}
  const n=Number(r.amount??r.total);if(!Number.isSafeInteger(n)||n<0||!r.id){unknown++;continue;}
  const key=kind+':'+r.id;if(seen.has(key)){unknown++;continue;}seen.add(key);
  if(kind==='in')incoming+=n;else outgoing+=n;
  entries.push({id:key,reference:txt(r.code||r.reference_number||r.id,120),kind,amount:n,at:new Date(at).toISOString(),note:txt(r.note||r.description,300)});
 }
 return {complete:unknown===0,incoming,outgoing,unknown,entries};
}
async function assignedAccounts(db,branchId,positionId=''){
 return positionId
  ? await rows(db,'SELECT a.sapo_account_id,m.name AS member_name FROM work_assignments a JOIN staff_members m ON m.id=a.member_id WHERE a.branch_id=? AND m.position_id=? AND m.active=1',branchId,positionId)
  : await rows(db,'SELECT a.sapo_account_id,m.name AS member_name FROM work_assignments a JOIN staff_members m ON m.id=a.member_id WHERE a.branch_id=? AND m.active=1',branchId);
}
async function cashScopeOrders(env,db,branch,shift,positionId,request){
 if(!positionId||!branch.sapoLocationId)return {orderIds:null,complete:true,message:''};
 const assigned=await assignedAccounts(db,sapoBranchId(branch),positionId),ids=new Set(assigned.map(a=>a.sapo_account_id));
 if(!ids.size)return {orderIds:new Set(),complete:true,message:''};
 const physicalId=sapoBranchId(branch),rawResult=await listRecentSapoOrders(env,{branchId:physicalId,accountIds:ids,from:shift.starts_at},request);
 const scoped=rawResult.orders.map(o=>mapSapoOrder(o,ids,'',physicalId,shift.starts_at,shift.ends_at)).filter(Boolean);
 return {orderIds:new Set(scoped.map(o=>o.id)),complete:rawResult.complete,message:rawResult.message};
}
async function loadShiftCash(env,db,branch,shift,positionId,request){
 const physicalId=sapoBranchId(branch),scope=await cashScopeOrders(env,db,branch,shift,positionId,request),q=new URLSearchParams({location_id:physicalId});
 const [receipts,payments]=await Promise.all([listSapo(env,'/receipts.json?'+q,'receipts',request),listSapo(env,'/payments.json?'+q,'payments',request)]);
 const cash={...summarizeCash(receipts,payments,physicalId,shift.starts_at,shift.ends_at,{orderIds:scope.orderIds}),message:''};
 if(!receipts.length&&!payments.length){cash.complete=false;cash.message='Chưa có chứng từ để xác minh dữ liệu quỹ Sapo.';}
 else if(scope.orderIds&&!scope.complete){cash.complete=false;cash.message=scope.message||'Chưa tải đủ đơn Sapo để tách quỹ theo nhóm bán hàng.';}
 else if(!cash.complete)cash.message=scope.orderIds?'Có chứng từ tiền mặt chưa gắn được với đơn của nhóm này. Vui lòng kiểm tra Sapo hoặc gửi số kiểm đếm để Manager duyệt.':'Có chứng từ chưa xác định được thời gian, phương thức hoặc trạng thái.';
 return cash;
}
export async function syncWorkOrders(env,m,body,request=fetch){
 const db=env.DB,{shift,branch,assignment}=await shiftAccess(db,m,body.shiftId);
 const scope=branchScope(body.branchId);if(body.branchId){if(scope.sourceId!==sapoBranchId(branch))fail(400,'Chi nhánh không khớp ca.');await branchAccess(db,m,body.branchId);}
 const positionId=branch.sapoLocationId?(scope.positionId||shiftPosition(shift)||(m.role==='manager'?'':m.position_id)):m.position_id;
 if(!assignment&&m.role!=='manager')fail(400,'Cần ghép tài khoản nhân viên với Sapo tại phần Thiết lập.');
 const physicalId=sapoBranchId(branch),assigned=await assignedAccounts(db,physicalId,positionId),accountNames=new Map(assigned.map(a=>[String(a.sapo_account_id),a.member_name]));
 const ids=new Set(assigned.map(a=>a.sapo_account_id));if(assignment&&positionId===m.position_id)ids.add(assignment.sapo_account_id);
 let orders=[],orderComplete=false,orderMessage='';
 try{
  const rawResult=await listRecentSapoOrders(env,{branchId:physicalId,accountIds:ids,from:shift.starts_at},request),raw=rawResult.orders;
  orders=raw.map(o=>mapSapoOrder(o,ids,assignment?.sapo_account_id||'',physicalId,shift.starts_at,shift.ends_at,accountNames)).filter(Boolean).map(o=>({...o,url:sapoOrderUrl(env,o.id)}));
  orderComplete=rawResult.complete;
  if(!orderComplete)orderMessage=rawResult.message||'Một số đơn thiếu mốc thời gian hoặc chi nhánh; cần kiểm tra lại trên Sapo.';
 }catch(e){orderMessage='Đơn hàng: '+publicError(e);}
 let cash={complete:false,incoming:0,outgoing:0,entries:[],message:'Chưa đủ dữ liệu sổ quỹ Sapo.'};
 if(m.role==='manager'||shift.keeper_id===m.id||branchKeeper(branch,positionId||shiftPosition(shift)||m.position_id)===m.id){
  try{cash=await loadShiftCash(env,db,branch,shift,positionId||shiftPosition(shift)||m.position_id,request);}
  catch(e){cash.message=publicError(e)+' Quỹ cần kiểm tra bổ sung.';}
 }
 const data={orders,orderComplete,orderMessage,cash,positionId,branchName:displayBranch(branch,positionId).name,observedAt:stamp(),from:shift.starts_at,to:shift.ends_at};
 if(JSON.stringify(data).length>900000)fail(413,'Ca có quá nhiều dữ liệu. Vui lòng chia thành ca ngắn hơn.');
 const id=crypto.randomUUID();await db.prepare('INSERT INTO work_snapshots(id,shift_id,member_id,data,created_at) VALUES(?,?,?,?,?)').bind(id,shift.id,m.id,JSON.stringify(data),data.observedAt).run();
 return {id,...data};
}
// Data-only assistant: suggestions are generated from the selected shift's own
// Sapo snapshot and the previous submitted report. No customer data is sent away.
export async function workAssistant(env,m,body){
 const db=env.DB,{shift,branch}=await shiftAccess(db,m,body.shiftId),mode=choice(body.mode,['start','result','handover','audit'],'start');
 const snapshotRow=await db.prepare('SELECT data FROM work_snapshots WHERE shift_id=? AND member_id=? ORDER BY created_at DESC LIMIT 1').bind(shift.id,m.id).first();
 const startReport=await db.prepare("SELECT data FROM work_reports WHERE shift_id=? AND member_id=? AND phase='start'").bind(shift.id,m.id).first();
 const snapshot=snapshotRow?parse(snapshotRow.data):{},orders=Array.isArray(snapshot.orders)?snapshot.orders:[];
 const previous=await db.prepare("SELECT r.data FROM work_reports r JOIN work_shifts s ON s.id=r.shift_id WHERE r.member_id=? AND s.branch_id=? AND s.ends_at<? AND r.phase='end' AND r.status IN ('submitted','approved') ORDER BY s.ends_at DESC LIMIT 1").bind(m.id,branch.id,shift.starts_at).first();
 const recent=await rows(db,"SELECT r.snapshot FROM work_reports r JOIN work_shifts s ON s.id=r.shift_id WHERE r.member_id=? AND s.branch_id=? AND s.ends_at<? AND r.phase='end' AND r.status IN ('submitted','approved') ORDER BY s.ends_at DESC LIMIT 7",m.id,branch.id,shift.starts_at);
 const old=parse(previous?.data),unfinished=(old.tasks||[]).filter(t=>taskState(t.status||(t.done?'done':'not_done'))!=='done').map(t=>txt(t.title,500)).filter(Boolean);
 const processing=orders.filter(o=>o.status==='processing'),unpaid=orders.filter(o=>o.status!=='cancelled'&&Number(o.paid??0)<Number(o.total??0));
 const total=orders.reduce((n,o)=>n+Number(o.total||0),0),target=Number(parse(startReport?.data).targetRevenue||0);
 const dayTotals=recent.map(r=>(parse(r.snapshot).orders||[]).reduce((n,o)=>n+Number(o.total||0),0)).filter(Number.isFinite),sevenDayAverage=dayTotals.length?Math.round(dayTotals.reduce((n,v)=>n+v,0)/dayTotals.length):null;
 if(mode==='start')return {tasks:[...unfinished.slice(0,2),'Mở cửa, vệ sinh','Kiểm tra POS/QR',...(processing.length?['Theo dõi '+processing.length+' đơn Sapo đang giao dịch']:[]),'Đối chiếu quỹ','Cập nhật đơn Sapo'].filter((x,i,a)=>a.indexOf(x)===i).slice(0,5),handover:old.handover||'',suggestedContacts:Math.max(5,processing.length),suggestedQuotes:Math.max(5,unpaid.length),sevenDayAverage};
 if(mode==='result')return {text:`Ca này ghi nhận ${orders.length} đơn Sapo, doanh số ${Math.round(total).toLocaleString('vi-VN')}đ.${target?` Mục tiêu đầu ca ${Math.round(target).toLocaleString('vi-VN')}đ, ${total>=target?'đã đạt':'cần theo dõi thêm'}.`:''}${processing.length?` Còn ${processing.length} đơn đang giao dịch cần bám sát.`:''}`};
 if(mode==='handover')return {text:[...unfinished,...processing.map(o=>`${o.customer||'Khách lẻ'} · đơn ${o.code||o.id}`),...unpaid.map(o=>`${o.customer||'Khách lẻ'} · đơn ${o.code||o.id} chưa thanh toán`)].filter((x,i,a)=>a.indexOf(x)===i).slice(0,8).map(x=>`${x} · người nhận: ca sau · thời hạn: đầu ca kế tiếp`).join('\n')};
 return {warnings:[...(!snapshot.orderComplete?['Dữ liệu đơn Sapo chưa đầy đủ hoặc chưa cập nhật.']:[]),...(unpaid.length?[`${unpaid.length} đơn chưa thanh toán cần kiểm tra.`]:[]),...(snapshot.cash?.complete===false?['Dữ liệu tiền mặt Sapo chưa đủ để đối chiếu quỹ.']:[])]};
}
async function auditChange(db,table,id,revision,updates,m,action,auditData){
 // Audit only if optimistic update succeeded; both statements share a transaction.
 const now=stamp(),keys=Object.keys(updates),result=await db.batch([
 db.prepare(`UPDATE ${table} SET ${keys.map(k=>k+'=?').join(',')},revision=revision+1,updated_at=? WHERE id=? AND revision=?`).bind(...Object.values(updates),now,id,revision),
 db.prepare('INSERT INTO work_audit(id,entity_id,actor_id,action,data,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),id,m.id,action,JSON.stringify(auditData),now)]);
 if(!result[0].meta.changes)fail(409,'Dữ liệu vừa được cập nhật ở nơi khác. Tải lại trước khi lưu.');
}
export function reconcileCash(opening,incoming,outgoing,actual,complete){
 const expected=opening+incoming-outgoing,difference=actual==null?null:actual-expected;
 return {expected,difference,status:!complete?'unverified':difference===0?'matched':'mismatch'};
}
export async function saveCashShift(env,m,body){
 const db=env.DB,{shift,branch}=await shiftAccess(db,m,body.shiftId);
 if(!['open','draft','close'].includes(body.action))fail(400,'Thao tác quỹ không hợp lệ.');
 const effectiveKeeper=branchKeeper(branch,shiftPosition(shift)||m.position_id);
 if(shift.keeper_id?shift.keeper_id!==m.id:effectiveKeeper!==m.id)fail(403,'Chỉ người được phân công giữ quỹ mới được nhập và chốt quỹ.');
 if(shift.cash_status==='closed')fail(409,'Quỹ đã chốt. Quản lý có thể yêu cầu mở lại để bổ sung.');
 if(Number(body.revision)!==shift.revision)fail(409,'Quỹ vừa thay đổi, hãy tải lại.');
 const data=parse(shift.data),reason=txt(body.reason),now=stamp();
 if(body.action==='open'){
  const opening=amount(body.opening,'Tiền đầu ca');
  if(shift.keeper_id)fail(409,'Quỹ đã mở.');
  const positionId=shiftPosition(shift)||m.position_id;
  const previous=await db.prepare(`SELECT id,actual,revision FROM work_shifts WHERE branch_id=? AND ${shiftScopeSql} AND ends_at<=? AND cash_status='closed' ORDER BY ends_at DESC LIMIT 1`).bind(...shiftScope(branch.id,positionId),shift.starts_at).first();
  if(previous&&opening!==previous.actual&&!reason)fail(400,'Tiền nhận khác ca trước, vui lòng giải trình.');
  if(!body.acceptHandover)fail(400,'Vui lòng xác nhận đã kiểm đếm và nhận bàn giao.');
  const saved={...data,openingReason:reason,previous,openedBy:m.id,openedAt:now,acceptedHandover:true};
  const result=await db.batch([
  db.prepare(`UPDATE work_shifts SET keeper_id=?,opening=?,cash_status='open',data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM work_shifts x WHERE x.branch_id=? AND ${shiftScopeSql} AND x.id<>? AND x.keeper_id IS NOT NULL AND x.starts_at<? AND x.ends_at>?) AND NOT EXISTS(SELECT 1 FROM work_shifts x WHERE x.branch_id=? AND ${shiftScopeSql} AND x.id<>? AND x.keeper_id IS NOT NULL AND x.cash_status='open')`).bind(m.id,opening,JSON.stringify(saved),now,shift.id,shift.revision,branch.id,positionId,shift.id,shift.ends_at,shift.starts_at,branch.id,positionId,shift.id),
  db.prepare('INSERT INTO work_audit(id,entity_id,actor_id,action,data,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),shift.id,m.id,'cash_open',JSON.stringify(saved),now)]);
  if(!result[0].meta.changes)fail(409,'Chi nhánh có ca quỹ chưa chốt hoặc trùng thời gian. Hãy chọn đúng ca chung.');
 }else{
  if(shift.opening==null)fail(400,'Cần nhận quỹ đầu ca trước.');
  const actual=amount(body.actual,'Tiền kiểm đếm',body.action!=='close');
  const manualIn=amount(body.manualIn??0,'Thu bổ sung'),manualOut=amount(body.manualOut??0,'Chi / nộp quỹ bổ sung'),manualNote=txt(body.manualNote);
  if((manualIn||manualOut)&&!manualNote)fail(400,'Cần ghi nội dung, chứng từ của khoản bổ sung chưa có trên Sapo.');
  const snapshot=await db.prepare('SELECT * FROM work_snapshots WHERE id=? AND member_id=? AND shift_id=?').bind(txt(body.snapshotId,80),m.id,shift.id).first();
  const snap=snapshot?parse(snapshot.data):null,cash=snap?.cash;
  const fresh=!!snapshot&&Date.now()-Date.parse(snapshot.created_at)<300000;
  const ended=Date.now()>=Date.parse(shift.ends_at);
  const complete=!!cash?.complete&&fresh&&ended&&Date.parse(snapshot?.created_at||0)>=Date.parse(shift.ends_at);
  const calc=reconcileCash(shift.opening,(cash?.incoming||0)+manualIn,(cash?.outgoing||0)+manualOut,actual,complete);
  if(body.action==='close'&&((calc.difference!==0||!complete)&&!reason))fail(400,'Quỹ lệch hoặc chưa đủ dữ liệu đối chiếu: cần giải trình trước khi chốt.');
  if(body.action==='close'&&!ended)fail(400,'Chưa đến giờ kết thúc ca. Có thể lưu nháp kiểm đếm.');
  const saved={...data,manualIn,manualOut,manualNote,reason,snapshot:snap,verification:calc.status,closedBy:body.action==='close'?m.id:null,closedAt:body.action==='close'?now:null};
  await auditChange(db,'work_shifts',shift.id,shift.revision,{actual,expected:calc.expected,difference:calc.difference,cash_status:body.action==='close'?'closed':'open',data:JSON.stringify(saved)},m,body.action==='close'?'cash_close':'cash_draft',saved);
 }
 return workShiftDetails(env,m,shift.id);
}
export async function saveWorkReport(env,m,body){
 const db=env.DB,{shift}=await shiftAccess(db,m,body.shiftId),phase=body.phase;
 if(!['start','end'].includes(phase))fail(400,'Loại báo cáo không hợp lệ.');
 const id=shift.id+':'+m.id+':'+phase;
 const existing=await db.prepare('SELECT * FROM work_reports WHERE id=?').bind(id).first();
 if(existing&&!['draft','returned'].includes(existing.status))fail(409,'Báo cáo đã gửi. Cần quản lý yêu cầu bổ sung trước khi sửa.');
 const d=body.data||{},tasks=Array.isArray(d.tasks)?d.tasks.slice(0,20).map(t=>({title:txt(t.title,500),status:taskState(t.status||(t.done?'done':'not_done')),done:taskState(t.status||(t.done?'done':'not_done'))==='done'})).filter(t=>t.title):[];
 const data={tasks,targetRevenue:amount(d.targetRevenue,'Mục tiêu doanh số',true),targetCustomers:amount(d.targetCustomers,'Mục tiêu liên hệ',true),targetQuotes:amount(d.targetQuotes,'Mục tiêu báo giá',true),contacts:amount(d.contacts,'Số khách đã liên hệ',true),quotes:amount(d.quotes,'Số báo giá đã gửi',true),checkHandover:!!d.checkHandover,checkDisplay:!!d.checkDisplay,checkEquipment:!!d.checkEquipment,handoverStatus:choice(d.handoverStatus,['complete','pending','missing'],'missing'),handoverNote:txt(d.handoverNote),targetPreset:choice(d.targetPreset,['average','plus10','plus15','manual']),issueTags:tags(d.issueTags,['Thiếu hàng','Sai giá/tem giá','Thiết bị hỏng','Thiếu tiền lẻ','Không có','Đơn Sapo sai','Chênh quỹ','Khách phàn nàn','Hàng lỗi/đổi trả']),contactOutcome:choice(d.contactOutcome,['closed','follow_up','rejected']),quoteOutcome:choice(d.quoteOutcome,['closed','follow_up','rejected']),rejectionReasons:tags(d.rejectionReasons,['Giá cao','Chưa cần','Hết hàng','So sánh nơi khác'],4),resultTags:tags(d.resultTags,['Đạt mục tiêu','Có đơn lớn','Khách cũ quay lại','Chưa đạt mục tiêu'],4),handoverRecipient:choice(d.handoverRecipient,['next_shift','manager']),cashChecks:{counted:!!d.cashChecks?.counted,qrChecked:!!d.cashChecks?.qrChecked,deposited:!!d.cashChecks?.deposited,matched:!!d.cashChecks?.matched,mismatch:!!d.cashChecks?.mismatch,difference:amount(d.cashChecks?.difference,'Chênh lệch quỹ',true),reason:txt(d.cashChecks?.reason)},results:txt(d.results),handover:txt(d.handover),issues:txt(d.issues)};
 const submit=body.submit===true;
 if(submit&&phase==='start'&&!tasks.length)fail(400,'Vui lòng nhập ít nhất một việc ưu tiên.');
 if(submit&&phase==='end'){
  const start=await db.prepare("SELECT id FROM work_reports WHERE shift_id=? AND member_id=? AND phase='start' AND status IN ('submitted','approved')").bind(shift.id,m.id).first();
  if(!start)fail(400,'Cần gửi báo cáo đầu ca trước.');
  if(Date.now()<Date.parse(shift.ends_at))fail(400,'Chưa đến giờ kết thúc ca. Hãy lưu nháp.');
  if(tasks.some(t=>t.status!=='done')&&!data.handover)fail(400,'Cần ghi việc bàn giao khi còn công việc chưa xong.');
 }
 let snapshot={};
 if(phase==='end'){
  const s=await db.prepare('SELECT data FROM work_snapshots WHERE member_id=? AND shift_id=? ORDER BY created_at DESC LIMIT 1').bind(m.id,shift.id).first();snapshot=s?parse(s.data):{orderComplete:false,orderMessage:'Chưa đồng bộ Sapo.',orders:[]};
  if(submit&&(!snapshot.orderComplete||Date.now()-Date.parse(snapshot.observedAt||0)>300000)&&!data.issues)fail(400,'Dữ liệu Sapo chưa đầy đủ hoặc đã cũ. Làm mới hoặc ghi lý do tại Vấn đề cần hỗ trợ.');
 }
 const values={data:JSON.stringify(data),snapshot:JSON.stringify(snapshot),status:submit?'submitted':'draft',submitted_at:submit?stamp():null,review_note:existing?.review_note||''};
 if(existing){if(Number(body.revision)!==existing.revision)fail(409,'Báo cáo đã thay đổi. Hãy tải lại.');await auditChange(db,'work_reports',id,existing.revision,values,m,submit?'submit':'draft',{...data,snapshot});}
 else{
  const now=stamp();const result=await db.batch([
  db.prepare('INSERT INTO work_reports(id,shift_id,member_id,position_id,phase,status,data,snapshot,updated_at,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,shift.id,m.id,m.position_id||'',phase,values.status,values.data,values.snapshot,now,values.submitted_at),
  db.prepare('INSERT INTO work_audit(id,entity_id,actor_id,action,data,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),id,m.id,submit?'submit':'draft',JSON.stringify({data,snapshot}),now)]);
  if(!result[0].meta.changes)fail(409,'Báo cáo vừa được tạo ở phiên khác, hãy tải lại.');
 }
 return workShiftDetails(env,m,shift.id);
}
export async function workHistory(env,m,query){
 const db=env.DB,date=txt(query.get('date'),10),scope=branchScope(txt(query.get('branchId'),100)),sourceBranch=scope.sourceId,branch=scope.positionId?sourceBranch+'~'+scope.positionId:sourceBranch,member=txt(query.get('memberId'),80),where=[],args=[];
 if(m.role!=='manager'){where.push('r.member_id=?');args.push(m.id);}else if(member){where.push('r.member_id=?');args.push(member);}
 if(scope.positionId){where.push('r.position_id=?');args.push(scope.positionId);}if(date){where.push('s.work_date=?');args.push(date);}if(branch){where.push('s.branch_id=?');args.push(branch);}
 const reports=await rows(db,`SELECT r.*,s.work_date,s.label,s.branch_id,b.name AS branch_name,m.name AS member_name FROM work_reports r JOIN work_shifts s ON s.id=r.shift_id JOIN work_branches b ON b.id=s.branch_id JOIN staff_members m ON m.id=r.member_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY r.updated_at DESC LIMIT 200`,...args);
 const cash=m.role==='manager'?await rows(db,`SELECT s.*,b.name AS branch_name,m.name AS keeper_name FROM work_shifts s JOIN work_branches b ON b.id=s.branch_id LEFT JOIN staff_members m ON m.id=s.keeper_id WHERE s.keeper_id IS NOT NULL ${date?'AND s.work_date=?':''} ${branch?'AND s.branch_id=?':''} ${scope.positionId?`AND COALESCE(json_extract(s.data,'$.positionId'),'')=?`:''} ORDER BY s.ends_at DESC LIMIT 100`,...[date,branch,scope.positionId].filter(Boolean)):[];
 let missing=[];if(m.role==='manager'&&date){const missingArgs=[scope.positionId,scope.positionId,date];if(sourceBranch)missingArgs.push(sourceBranch);if(scope.positionId)missingArgs.push(scope.positionId);missing=await rows(db,`SELECT m.id,m.name,m.position_id,b.name AS branch_name,p.name AS position_name,COALESCE((SELECT GROUP_CONCAT(DISTINCT r.phase) FROM work_reports r JOIN work_shifts s ON s.id=r.shift_id WHERE r.member_id=m.id AND s.branch_id=(b.id || CASE WHEN ?<>'' THEN '~'||? ELSE '' END) AND s.work_date=? AND r.status IN ('submitted','approved')),'') AS phases FROM work_assignments a JOIN staff_members m ON m.id=a.member_id JOIN work_branches b ON b.id=a.branch_id LEFT JOIN staff_positions p ON p.id=m.position_id WHERE m.active=1 ${sourceBranch?'AND b.id=?':''} ${scope.positionId?'AND m.position_id=?':''} ORDER BY b.name,m.name`,...missingArgs);}
 return {reports:reports.map(r=>({...r,branch_name:displayBranch({id:r.branch_id,name:r.branch_name},r.position_id).name,data:parse(r.data),snapshot:parse(r.snapshot)})),cash:cash.map(r=>({...r,data:parse(r.data)})),missing:missing.map(r=>({...r,branch_name:displayBranch({name:r.branch_name},r.position_id).name}))};
}
export async function reviewWorkReport(env,m,body){
 manager(m);const db=env.DB,note=txt(body.note),actions=['approved','returned'];
 if(!actions.includes(body.status))fail(400,'Thao tác duyệt không hợp lệ.');
 if(body.status==='returned'&&!note)fail(400,'Cần ghi nội dung yêu cầu bổ sung.');
 const report=await db.prepare('SELECT * FROM work_reports WHERE id=?').bind(txt(body.id,400)).first();if(!report)fail(404,'Không tìm thấy báo cáo.');
 if(!['submitted','approved'].includes(report.status))fail(409,'Báo cáo chưa gửi để duyệt.');
 if(Number(body.revision)!==report.revision)fail(409,'Báo cáo đã thay đổi. Hãy tải lại.');
 await auditChange(db,'work_reports',report.id,report.revision,{status:body.status,reviewed_by:m.id,review_note:note},m,'review',{status:body.status,note});return {ok:true};
}
export async function reviewCashShift(env,m,body){
 manager(m);const {shift}=await shiftAccess(env.DB,m,body.id),note=txt(body.note);if(!note)fail(400,'Cần ghi nội dung kiểm tra quỹ.');
 if(shift.cash_status!=='closed')fail(409,'Quỹ chưa chốt.');if(Number(body.revision)!==shift.revision)fail(409,'Quỹ đã thay đổi. Hãy tải lại.');
 if(!['approve','reopen'].includes(body.action))fail(400,'Thao tác không hợp lệ.');
 if(body.action==='reopen'){
  const later=await env.DB.prepare('SELECT id FROM work_shifts WHERE branch_id=? AND starts_at>=? AND keeper_id IS NOT NULL LIMIT 1').bind(shift.branch_id,shift.ends_at).first();
  if(later)fail(409,'Ca sau đã nhận quỹ. Giữ nguyên ca đã chốt và ghi khoản điều chỉnh ở ca hiện tại.');
 }
 const data={...parse(shift.data),review:{by:m.id,at:stamp(),note,action:body.action}};
 await auditChange(env.DB,'work_shifts',shift.id,shift.revision,{cash_status:body.action==='reopen'?'open':'closed',data:JSON.stringify(data)},m,'cash_review',data);return {ok:true};
}
export async function workAuditHistory(env,m,id){
 const db=env.DB,report=await db.prepare('SELECT member_id FROM work_reports WHERE id=?').bind(id).first();
 if(m.role!=='manager'&&report?.member_id!==m.id)fail(403,'Không được xem lịch sử này.');
 return {events:await rows(db,'SELECT a.id,a.action,a.created_at,a.data,m.name AS actor_name FROM work_audit a LEFT JOIN staff_members m ON m.id=a.actor_id WHERE a.entity_id=? ORDER BY a.created_at DESC LIMIT 100',id)};
}

// Branch cash ledger. Only approved manual entries affect the balance.
export async function workCashLedger(env,m,shiftId){
 const {shift,branch}=await shiftAccess(env.DB,m,shiftId),d=parse(shift.data);
 const positionId=shiftPosition(shift)||m.position_id,canKeeper=shift.keeper_id?shift.keeper_id===m.id:branchKeeper(branch,positionId)===m.id;
 const canManageCash=canKeeper||m.role==='manager';
 const snapshot=await env.DB.prepare('SELECT data,created_at FROM work_snapshots WHERE shift_id=? ORDER BY created_at DESC LIMIT 1').bind(shift.id).first();
 const snap=snapshot?parse(snapshot.data):null,cash=shift.cash_status==='closed'?d.snapshot?.cash:snap?.cash;
 const requests=await rows(env.DB,'SELECT r.*,m.name AS member_name FROM work_cash_requests r JOIN staff_members m ON m.id=r.member_id WHERE r.shift_id=? ORDER BY r.created_at DESC',shift.id);
 const incoming=Number(cash?.incoming||0)+Number(d.manualIn||0),outgoing=Number(cash?.outgoing||0)+Number(d.manualOut||0);
 // The ledger balance is always calculated from the recorded movements. The
 // physical count remains on the shift for reconciliation, never as the balance.
 const balance=shift.opening==null?null:shift.opening+incoming-outgoing;
 return {shift,branch:displayBranch(branch,positionId),requests,cash:cash||null,observedAt:snapshot?.created_at||null,balance,incoming,outgoing,complete:!!cash?.complete&&(shift.cash_status==='closed'||!!snapshot&&Date.now()-Date.parse(snapshot.created_at)<300000),automatic:d.closeMode==='automatic',canWrite:canManageCash&&shift.cash_status!=='closed',canAdjust:canManageCash&&(shift.cash_status!=='closed'||d.closeMode==='automatic'),canReview:m.role==='manager'};
}
export async function requestWorkCash(env,m,body){
 const {shift,branch}=await shiftAccess(env.DB,m,body.shiftId),kind=body.kind,n=amount(body.amount,'Số tiền'),note=txt(body.note),id=txt(body.id,80);
 const effectiveKeeper=branchKeeper(branch,shiftPosition(shift)||m.position_id);
 const canManageCash=m.role==='manager'||(shift.keeper_id?shift.keeper_id===m.id:effectiveKeeper===m.id);
 if(!canManageCash)fail(403,'Chỉ quản lý hoặc người giữ quỹ được nhập phiếu quỹ.');
 if(!/^[a-f0-9-]{36}$/i.test(id))fail(400,'Mã phiếu không hợp lệ.');
 const previous=await env.DB.prepare('SELECT * FROM work_cash_requests WHERE id=?').bind(id).first();
 if(previous){if(previous.member_id!==m.id||previous.shift_id!==shift.id||previous.kind!==kind||previous.amount!==n||previous.note!==note)fail(409,'Mã phiếu đã được sử dụng.');return {...previous,duplicate:true};}
 if(!['opening','in','out','balance'].includes(kind)||!note)fail(400,'Chọn loại phiếu và nhập nội dung / lý do.');
 if(['in','out'].includes(kind)&&n===0)fail(400,'Số tiền thu / chi phải lớn hơn 0.');
 if(shift.cash_status==='closed'&&!(kind==='balance'&&parse(shift.data).closeMode==='automatic'))fail(409,'Ca đã kết sổ. Ghi điều chỉnh ở ca hiện tại.');
 if(kind==='opening'&&shift.opening!=null)fail(409,'Ca đã có số dư đầu ca.');
 if(kind!=='opening'&&shift.opening==null)fail(400,'Cần số dư đầu ca đã duyệt trước khi lập phiếu.');
 if(kind==='balance'&&Date.now()<Date.parse(shift.ends_at))fail(400,'Chưa hết ca. Chỉ gửi số kiểm đếm cuối ca sau giờ kết thúc.');
 if(kind==='opening'&&!effectiveKeeper)fail(400,'Quản lý cần chọn người giữ quỹ trong Thiết lập.');
 const now=stamp();
 const result=await env.DB.batch([
 env.DB.prepare("INSERT INTO work_cash_requests(id,shift_id,member_id,kind,amount,note,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM work_shifts WHERE id=? AND revision=? AND (cash_status<>'closed' OR ?='balance') AND (?<>'balance' OR NOT EXISTS(SELECT 1 FROM work_shifts x WHERE x.branch_id=work_shifts.branch_id AND x.id<>work_shifts.id AND x.starts_at>=work_shifts.ends_at AND x.keeper_id IS NOT NULL))) AND NOT EXISTS(SELECT 1 FROM work_cash_requests WHERE shift_id=? AND status='pending' AND (kind IN ('opening','balance') OR ? IN ('opening','balance')))").bind(id,shift.id,m.id,kind,n,note,now,now,shift.id,shift.revision,kind,kind,shift.id,kind),
 env.DB.prepare('INSERT INTO work_audit(id,entity_id,actor_id,action,data,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),shift.id,m.id,'cash_request',JSON.stringify({id,kind,amount:n,note}),now)]);
 if(!result[0].meta.changes)fail(409,'Quỹ vừa thay đổi hoặc có phiếu số dư chờ duyệt. Tải lại sổ quỹ.');
 return {id,shift_id:shift.id,member_id:m.id,kind,amount:n,note,status:'pending'};
}
export async function reviewWorkCashRequest(env,m,body){
 manager(m);const db=env.DB,r=await db.prepare('SELECT * FROM work_cash_requests WHERE id=?').bind(txt(body.id,80)).first();
 if(!r)fail(404,'Không tìm thấy phiếu.');if(r.status!=='pending')fail(409,'Phiếu đã được xử lý.');
 if(!['approved','rejected'].includes(body.status))fail(400,'Kết quả duyệt không hợp lệ.');
 const {shift,branch}=await shiftAccess(db,m,r.shift_id),note=txt(body.note),now=stamp();
 if(body.status==='rejected'){
  if(!note)fail(400,'Nhập lý do từ chối.');
  const result=await db.batch([db.prepare("UPDATE work_cash_requests SET status='rejected',reviewed_by=?,review_note=?,updated_at=? WHERE id=? AND status='pending'").bind(m.id,note,now,r.id),db.prepare('INSERT INTO work_audit(id,entity_id,actor_id,action,data,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),shift.id,m.id,'cash_request_review',JSON.stringify({id:r.id,status:'rejected',note}),now)]);
  if(!result[0].meta.changes)fail(409,'Phiếu đã được xử lý.');return {...r,status:'rejected',review_note:note};
 }
 if(shift.cash_status==='closed'&&!(r.kind==='balance'&&parse(shift.data).closeMode==='automatic'))fail(409,'Ca đã chốt, không thể duyệt thêm khoản tiền.');
 const data=parse(shift.data),updates={data:''};
 if(r.kind==='opening'){
  const effectiveKeeper=branchKeeper(branch,shiftPosition(shift)||m.position_id);
  if(shift.opening!=null||!effectiveKeeper)fail(409,'Số dư đầu ca hoặc người giữ quỹ đã thay đổi.');
  updates.opening=r.amount;updates.keeper_id=effectiveKeeper;updates.cash_status='open';data.openedBy=r.member_id;data.openedAt=now;data.openingReason=r.note;
 }else if(r.kind==='in'||r.kind==='out'){
  const key=r.kind==='in'?'manualIn':'manualOut';data[key]=Number(data[key]||0)+r.amount;data.manualNote=[data.manualNote,r.note].filter(Boolean).join('\n');
 }else{
  const ledger=await workCashLedger(env,m,shift.id);updates.actual=r.amount;updates.expected=ledger.balance;updates.difference=ledger.balance==null?null:r.amount-ledger.balance;updates.cash_status='closed';data.closeMode='manual';data.closedBy=r.member_id;data.closedAt=now;data.reason=r.note;data.snapshot={cash:ledger.cash};data.verification=ledger.complete&&Date.parse(ledger.observedAt)>=Date.parse(shift.ends_at)?(updates.difference===0?'matched':'mismatch'):'unverified';
 }
 data.review={by:m.id,at:now,note,action:'approve'};updates.data=JSON.stringify(data);
 const keys=Object.keys(updates);
 const result=await db.batch([
 db.prepare(`UPDATE work_shifts SET ${keys.map(k=>k+'=?').join(',')},revision=revision+1,updated_at=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM work_cash_requests WHERE id=? AND status='pending') ${r.kind==='balance'?"AND NOT EXISTS(SELECT 1 FROM work_shifts x WHERE x.branch_id=work_shifts.branch_id AND x.id<>work_shifts.id AND x.starts_at>=work_shifts.ends_at AND x.keeper_id IS NOT NULL)":''} ${r.kind==='opening'?"AND NOT EXISTS(SELECT 1 FROM work_shifts x WHERE x.branch_id=work_shifts.branch_id AND x.id<>work_shifts.id AND x.keeper_id IS NOT NULL AND (x.cash_status='open' OR (x.starts_at<work_shifts.ends_at AND x.ends_at>work_shifts.starts_at)))":''}`).bind(...Object.values(updates),now,shift.id,shift.revision,r.id),
 db.prepare("UPDATE work_cash_requests SET status='approved',reviewed_by=?,review_note=?,updated_at=? WHERE id=? AND status='pending' AND changes()=1").bind(m.id,note,now,r.id),
 db.prepare('INSERT INTO work_audit(id,entity_id,actor_id,action,data,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),shift.id,m.id,'cash_request_review',JSON.stringify({id:r.id,status:'approved',note,kind:r.kind,amount:r.amount}),now)]);
 if(!result[0].meta.changes)fail(409,'Quỹ vừa thay đổi hoặc có ca quỹ trùng / chưa chốt. Tải lại trước khi duyệt.');return {...r,status:'approved',review_note:note};
}
export async function refreshWorkCash(env,m,body,request=fetch){
 const db=env.DB;let {shift,branch}=await shiftAccess(db,m,body.shiftId);
 const effectiveKeeper=branchKeeper(branch,shiftPosition(shift)||m.position_id);
 if(shift.opening==null&&effectiveKeeper){
  const positionId=shiftPosition(shift)||m.position_id;
  const previous=await db.prepare(`SELECT id,actual,data FROM work_shifts WHERE branch_id=? AND ${shiftScopeSql} AND ends_at<=? AND cash_status='closed' ORDER BY ends_at DESC LIMIT 1`).bind(...shiftScope(branch.id,positionId),shift.starts_at).first(),pd=parse(previous?.data);
  const previousId=txt(previous?.id,200),carried=Number(previous?.actual);
  if(previousId&&Number.isSafeInteger(carried)&&carried>=0&&(pd.closeMode==='automatic'||pd.review?.action==='approve')&&!(await db.prepare("SELECT id FROM work_cash_requests WHERE shift_id=? AND status='pending' LIMIT 1").bind(previousId).first())){
   await db.prepare(`UPDATE work_shifts SET opening=?,keeper_id=?,cash_status='open',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM work_cash_requests WHERE shift_id IN (?,?) AND status='pending') AND NOT EXISTS(SELECT 1 FROM work_shifts x WHERE x.branch_id=work_shifts.branch_id AND ${shiftScopeSql} AND x.id<>work_shifts.id AND x.keeper_id IS NOT NULL AND (x.cash_status='open' OR (x.starts_at<work_shifts.ends_at AND x.ends_at>work_shifts.starts_at)))`).bind(carried,txt(effectiveKeeper,80),stamp(),txt(shift.id,200),Number(shift.revision),txt(shift.id,200),previousId,txt(positionId,80)).run();
   shift=(await shiftAccess(db,m,body.shiftId)).shift;
  }
 }

 let cash={complete:false,incoming:0,outgoing:0,entries:[],message:'Chưa xác minh dữ liệu Sapo.'};
 try{cash=await loadShiftCash(env,db,branch,shift,shiftPosition(shift)||m.position_id,request);if(!cash.complete&&!cash.message)cash.message='Chưa đủ chứng từ Sapo để tự kết sổ. Có thể gửi số kiểm đếm để Manager duyệt.';}catch(e){cash.message='Sổ quỹ: '+publicError(e);}
 const now=stamp(),id=crypto.randomUUID();
 // Keep order snapshots intact; ledger snapshots carry no member order scope.
 await db.prepare('INSERT INTO work_snapshots(id,shift_id,member_id,data,created_at) VALUES(?,?,?,?,?)').bind(id,shift.id,'cash-ledger',JSON.stringify({cash,observedAt:now}),now).run();
 if(shift.cash_status==='open'&&shift.opening!=null&&cash.complete&&Date.parse(now)>=Date.parse(shift.ends_at)){
  const d=parse(shift.data),expected=shift.opening+cash.incoming+Number(d.manualIn||0)-cash.outgoing-Number(d.manualOut||0);
  const data={...d,snapshot:{cash,observedAt:now},closeMode:'automatic',closedAt:now,verification:'calculated',closedBy:null};
  await db.batch([db.prepare("UPDATE work_shifts SET actual=?,expected=?,difference=0,cash_status='closed',data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM work_cash_requests WHERE shift_id=? AND status='pending')").bind(expected,expected,JSON.stringify(data),now,shift.id,shift.revision,shift.id),db.prepare('INSERT INTO work_audit(id,entity_id,actor_id,action,data,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),shift.id,m.id,'cash_auto_close',JSON.stringify({expected}),now)]);
 }
 return workCashLedger(env,m,shift.id);
}
