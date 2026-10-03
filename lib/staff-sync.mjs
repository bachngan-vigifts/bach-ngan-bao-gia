import {reconcileStaffIdentities} from './staff-identity.mjs';
import {isActiveSapoStaff} from './sapo-staff-status.mjs';
import {QuotationError} from './quotation-store.mjs';

const fail=(status,message)=>{throw new QuotationError(status,message);};
const clean=(value,max=500)=>{if(typeof value!=='string'||value.length>max)fail(400,'Dữ liệu nhân viên không hợp lệ.');return value.trim();};
const emailValue=(value,id)=>{const email=clean(value||'',254).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:`sapo-${id}@sapo.local.invalid`;};

export async function syncStaffMembers(db,body){
 if(!Array.isArray(body.members)||body.members.length>100)fail(400,'Mỗi lần đồng bộ tối đa 100 nhân viên.');
 const observed=Date.parse(body.observedAt);
 if(!Number.isFinite(observed)||observed>Date.now()+300000)fail(400,'Thiếu thời điểm lấy dữ liệu hợp lệ.');
 const rows=body.members.map(member=>{
  if(!member||typeof member!=='object')fail(400,'Dữ liệu nhân viên không hợp lệ.');
  const sapoId=clean(String(member.id||''),80);
  if(!/^[a-zA-Z0-9_-]+$/.test(sapoId))fail(400,'Mã nhân viên Sapo không hợp lệ.');
  const id='SAPO-'+sapoId;
  const name=clean(member.name||'',200);
  if(!name)fail(400,'Nhân viên thiếu tên.');
  const email=emailValue(member.email,id),phone=clean(member.phone||'',40);
  const active=isActiveSapoStaff(member)?1:0;
  const version=member.updatedAt?Date.parse(member.updatedAt):observed;
  if(!Number.isFinite(version)||version>Date.now()+300000)fail(400,'Thời điểm cập nhật nhân viên không hợp lệ.');
  return {id,name,email,phone,active,version};
 });
 if(new Set(rows.map(row=>row.id)).size!==rows.length)fail(400,'Trùng mã nhân viên trong một lần đồng bộ.');
 if(!rows.length)return {received:0,applied:0};
 const reconciliation=await reconcileStaffIdentities(db,rows),links=(await db.prepare('SELECT sapo_id,member_id FROM staff_sapo_links').all()).results||[];
 const now=new Date().toISOString(),statements=[];
 for(const row of rows){
  if(!row.active){
   // Archive previously imported identities, but never create departed staff.
   statements.push(db.prepare('UPDATE staff_members SET active=0 WHERE id=?').bind(row.id));
   statements.push(db.prepare('DELETE FROM staff_sessions WHERE member_id=?').bind(row.id));
   continue;
  }
  if(links.some(l=>l.sapo_id===row.id))continue; // Keep web login, position, permissions and active state.
  const existing=await db.prepare('SELECT id FROM staff_members WHERE email=? COLLATE NOCASE AND id<>?').bind(row.email,row.id).first();
  const email=existing?`sapo-${row.id.toLowerCase()}@sapo.local.invalid`:row.email;
  statements.push(db.prepare(`INSERT INTO staff_members (id,email,name,role,position_id,active,created_at,phone)
   VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,phone=excluded.phone,active=excluded.active`)
   .bind(row.id,email,row.name,'employee','sale',row.active,now,row.phone));
  statements.push(db.prepare('INSERT INTO staff_credentials (member_id,version) VALUES (?,0) ON CONFLICT(member_id) DO NOTHING').bind(row.id));
 }
 const result=statements.length?await db.batch(statements):[];
 return {received:rows.length,skippedInactive:rows.filter(r=>!r.active).length,applied:result.reduce((sum,row)=>sum+(row.meta?.changes||0),0),linked:links.filter(l=>rows.some(r=>r.id===l.sapo_id)).length,merged:reconciliation.merged.length,review:reconciliation.review};
}
