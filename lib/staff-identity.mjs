// Retain the web identity, permissions and credentials; link Sapo's external ID.
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/\s+/g,' ').trim();
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^84(?=\d{9}$)/,'0');
const email=v=>String(v||'').trim().toLowerCase();
export function sameStaffIdentity(a,b){
 const sameName=!!norm(a.name)&&norm(a.name)===norm(b.name),samePhone=phone(a.phone).length>=9&&phone(a.phone)===phone(b.phone),sameEmail=!!email(a.email)&&!email(a.email).endsWith('@sapo.local.invalid')&&email(a.email)===email(b.email);
 return (sameName&&(samePhone||sameEmail))||(samePhone&&sameEmail);
}
// Owner confirmed this exact duplicate pair on 2026-09-29; names must still agree.
const confirmedPair=(source,target)=>source.id==='SAPO-1253649'&&target.id==='NV-2f7239bd-79b8-41a3-915c-1c4805c60ece'&&norm(source.name)==='huynh chau quan'&&norm(target.name)==='huynh chau quan';
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const activityChecks=[['staff_credentials',"member_id=? AND (password_hash IS NOT NULL OR activation_hash IS NOT NULL)"],['staff_sessions','member_id=?'],['staff_quotations','creator_id=?'],['work_reports','member_id=?'],['work_shifts','keeper_id=?'],['work_branches','keeper_id=?'],['work_cash_requests','member_id=?'],['work_snapshots','member_id=?'],['crm_tasks','assigned_to=? OR created_by=?'],['stock_imports','created_by=?'],['product_edits','updated_by=?'],['work_audit','actor_id=?'],['staff_web_push_subscriptions','member_id=?'],['staff_quote_notifications','actor_id=?']];

// This is deliberately separate from automatic reconciliation. A manager must
// explicitly confirm it because the source identity can already own history.
export async function forceMergeStaffIdentity(db,{sapoId,targetId,actorId}){
 if(!String(sapoId||'').startsWith('SAPO-')||String(targetId||'').startsWith('SAPO-'))return {ok:false,reason:'Hồ sơ nguồn hoặc hồ sơ đích không hợp lệ.'};
 const source=await db.prepare('SELECT id,name,email,phone,active FROM staff_members WHERE id=?').bind(sapoId).first();
 const target=await db.prepare('SELECT id,name,email,phone,active,role FROM staff_members WHERE id=?').bind(targetId).first();
 if(!source||!target||!source.active||!target.active)return {ok:false,reason:'Hồ sơ nguồn hoặc hồ sơ đích không còn hoạt động.'};
 if(!sameStaffIdentity(source,target))return {ok:false,reason:'Thông tin liên hệ không đủ để xác nhận hai hồ sơ là một người.'};
 const linked=await db.prepare('SELECT sapo_id FROM staff_sapo_links WHERE member_id=?').bind(targetId).first();
 if(linked&&linked.sapo_id!==sapoId)return {ok:false,reason:'Hồ sơ web đã liên kết với một tài khoản Sapo khác.'};
 const assignments=await rows(db,'SELECT branch_id,sapo_account_id FROM work_assignments WHERE member_id=?',sapoId);
 for(const assignment of assignments){
  const current=await db.prepare('SELECT sapo_account_id FROM work_assignments WHERE member_id=? AND branch_id=?').bind(targetId,assignment.branch_id).first();
  if(current&&current.sapo_account_id!==assignment.sapo_account_id)return {ok:false,reason:'Phân công chi nhánh của hai hồ sơ đang dùng hai tài khoản Sapo khác.'};
 }
 const reportConflicts=await rows(db,`SELECT s.id FROM work_reports s
   WHERE s.member_id=? AND EXISTS(SELECT 1 FROM work_reports t WHERE t.member_id=? AND t.shift_id=s.shift_id AND t.phase=s.phase)`,sapoId,targetId);
 const now=new Date().toISOString(),auditId=`staff-merge:${sapoId}:${targetId}:${now}`;
 const updates=[
  ['staff_quotations','creator_id=?','creator_id=?'],
  ['work_reports','member_id=?',`member_id=? AND NOT EXISTS(SELECT 1 FROM work_reports t WHERE t.member_id=? AND t.shift_id=work_reports.shift_id AND t.phase=work_reports.phase)`],
  ['work_reports','reviewed_by=?','reviewed_by=?'],
  ['work_shifts','keeper_id=?','keeper_id=?'],
  ['work_branches','keeper_id=?','keeper_id=?'],
  ['work_cash_requests','member_id=?','member_id=?'],
  ['work_cash_requests','reviewed_by=?','reviewed_by=?'],
  ['work_snapshots','member_id=?','member_id=?'],
  ['crm_tasks','assigned_to=?','assigned_to=?'],
  ['crm_tasks','created_by=?','created_by=?'],
  ['stock_imports','created_by=?','created_by=?'],
  ['product_edits','updated_by=?','updated_by=?'],
  ['work_audit','actor_id=?','actor_id=?'],
  ['staff_quote_notifications','actor_id=?','actor_id=?']
 ];
 const statements=[];
 for(const [table,set,where] of updates){
  const conflictAware=table==='work_reports'&&set==='member_id=?';
  statements.push(db.prepare(`UPDATE ${table} SET ${set} WHERE ${where}`).bind(targetId,sapoId,...(conflictAware?[targetId]:[])));
 }
 // Source sessions and push endpoints must not remain usable after archival.
 statements.push(db.prepare('DELETE FROM staff_sessions WHERE member_id=?').bind(sapoId));
 statements.push(db.prepare('UPDATE staff_web_push_subscriptions SET disabled_at=? WHERE member_id=? AND disabled_at IS NULL').bind(now,sapoId));
 // The branch/account pair is unique, so release the source row before assigning it.
 statements.push(db.prepare('DELETE FROM work_assignments WHERE member_id=?').bind(sapoId));
 for(const assignment of assignments){
  statements.push(db.prepare('INSERT INTO work_assignments(member_id,branch_id,sapo_account_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(member_id,branch_id) DO NOTHING').bind(targetId,assignment.branch_id,assignment.sapo_account_id,now));
 }
 statements.push(db.prepare(`INSERT INTO staff_sapo_links(sapo_id,member_id,created_at,evidence) VALUES(?,?,?,?)
   ON CONFLICT(sapo_id) DO UPDATE SET member_id=excluded.member_id,created_at=excluded.created_at,evidence=excluded.evidence`).bind(sapoId,targetId,now,'manager_confirmed_history_merge'));
 statements.push(db.prepare('UPDATE staff_members SET active=0 WHERE id=?').bind(sapoId));
 statements.push(db.prepare('INSERT INTO work_audit(id,entity_id,actor_id,action,data,created_at) VALUES(?,?,?,?,?,?)').bind(auditId,`staff:${targetId}`,actorId,'staff_identity_merged',JSON.stringify({sourceId:sapoId,targetId,reportConflicts:reportConflicts.length}),now));
 const result=await db.batch(statements);
 const changed=Object.fromEntries(updates.map(([table,set],index)=>[`${table}.${set.split('=')[0]}`,result[index].meta.changes||0]));
 return {ok:true,sourceId:sapoId,targetId,moved:changed,assignments:assignments.length,reportConflicts:reportConflicts.length};
}
export async function reconcileStaffIdentities(db,incoming=[]){
 const members=await rows(db,'SELECT id,name,email,phone,role,position_id,active FROM staff_members'),locals=members.filter(m=>!m.id.startsWith('SAPO-')&&m.active&&m.role!=='supplier'),existingLinks=await rows(db,'SELECT sapo_id,member_id FROM staff_sapo_links');
 const sourceMap=new Map(members.filter(m=>m.id.startsWith('SAPO-')&&m.active).map(m=>[m.id,m]));
 for(const r of incoming){if(!r.active)sourceMap.delete(r.id);else sourceMap.set(r.id,{...sourceMap.get(r.id),...r});}
 const merged=[],review=[];
 for(const [sapoId,source] of sourceMap){
  if(existingLinks.some(l=>l.sapo_id===sapoId))continue;
  const matches=locals.filter(m=>sameStaffIdentity(source,m)||confirmedPair(source,m));if(matches.length!==1){if(matches.length>1)review.push({id:sapoId,name:source.name,reason:'Có nhiều hồ sơ khớp thông tin'});continue;}
  const target=matches[0];if(existingLinks.some(l=>l.member_id===target.id)){review.push({id:sapoId,name:source.name,reason:'Hồ sơ đã liên kết tài khoản Sapo khác'});continue;}
  const duplicate=members.find(m=>m.id===sapoId);let occupied=false;
  if(duplicate)for(const [table,where] of activityChecks){const args=Array((where.match(/\?/g)||[]).length).fill(sapoId);if(await db.prepare(`SELECT 1 FROM ${table} WHERE ${where} LIMIT 1`).bind(...args).first()){occupied=true;break;}}
  if(occupied){review.push({id:sapoId,name:source.name,reason:'Cả hai hồ sơ cần kiểm tra lịch sử hoặc đăng nhập trước khi gộp'});continue;}
  const assignments=duplicate?await rows(db,'SELECT * FROM work_assignments WHERE member_id=?',sapoId):[];
  for(const a of assignments){const old=await db.prepare('SELECT sapo_account_id FROM work_assignments WHERE member_id=? AND branch_id=?').bind(target.id,a.branch_id).first();if(old&&old.sapo_account_id!==a.sapo_account_id)occupied=true;}
  if(occupied){review.push({id:sapoId,name:source.name,reason:'Phân công chi nhánh đang ghép tài khoản khác'});continue;}
  const now=new Date().toISOString(),guard='EXISTS(SELECT 1 FROM staff_sapo_links WHERE sapo_id=? AND member_id=?)';
  const checks=duplicate?activityChecks.map(([table,where])=>`NOT EXISTS(SELECT 1 FROM ${table} WHERE ${where})`):[],checkArgs=duplicate?activityChecks.flatMap(([,where])=>Array((where.match(/\?/g)||[]).length).fill(sapoId)):[];
  const statements=[db.prepare(`INSERT INTO staff_sapo_links(sapo_id,member_id,created_at,evidence) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM staff_members WHERE id=? AND active=1 AND email=? AND phone=?) ${checks.length?'AND '+checks.join(' AND '):''} ON CONFLICT DO NOTHING`).bind(sapoId,target.id,now,confirmedPair(source,target)?'owner_confirmed_2026_09_29':'verified_contact_and_name',target.id,target.email,target.phone,...checkArgs)];
  if(duplicate){
   // Do not delete identities: an archived source remains available for audit.
   statements.push(db.prepare(`DELETE FROM work_assignments WHERE member_id=? AND ${guard}`).bind(sapoId,sapoId,target.id));
   for(const a of assignments)statements.push(db.prepare(`INSERT INTO work_assignments(member_id,branch_id,sapo_account_id,updated_at) SELECT ?,?,?,? WHERE ${guard} ON CONFLICT(member_id,branch_id) DO NOTHING`).bind(target.id,a.branch_id,a.sapo_account_id,now,sapoId,target.id));
   statements.push(db.prepare(`UPDATE staff_members SET active=0 WHERE id=? AND ${guard}`).bind(sapoId,sapoId,target.id));
  }
  const result=await db.batch(statements);if(result[0].meta.changes){merged.push({id:target.id,sapoId,name:target.name});existingLinks.push({sapo_id:sapoId,member_id:target.id});}
 }
 return {merged,review};
}
