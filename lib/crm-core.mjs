import {visibleCustomerSql} from './customer-sync.mjs';
import {QuotationError} from './quotation-store.mjs';

const text=(value,max=2000)=>typeof value==='string'&&value.trim().length<=max?value.trim():null;
const taskId=()=>`CRM-${crypto.randomUUID()}`;
const managerOnly=(member)=>member.role==='manager';

function taskPayload(body){
  const title=text(body?.title,240), details=text(body?.details||'',4000);
  const customerId=text(body?.customerId||'',120), quoteNumber=text(body?.quoteNumber||'',200);
  const dueDate=text(body?.dueDate||'',40), priority=text(body?.priority||'normal',20);
  if(!title)throw new QuotationError(400,'Vui lòng nhập tên công việc.');
  if(details===null||customerId===null||quoteNumber===null||dueDate===null||!['low','normal','high'].includes(priority))throw new QuotationError(400,'Dữ liệu công việc không hợp lệ.');
  return {title,details,customerId:customerId||null,quoteNumber:quoteNumber||null,dueDate:dueDate||null,priority};
}

export async function crmOverview(db,member){
  const own=managerOnly(member)?[]:[member.id];
  const taskWhere=own.length?'WHERE assigned_to=?':'';
  const [customers,openTasks,dueTasks,contracts,taskRows]=await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM sapo_customers WHERE ${visibleCustomerSql}`).first(),
    db.prepare(`SELECT COUNT(*) AS count FROM crm_tasks ${taskWhere?`${taskWhere} AND `:'WHERE '}status!='done'`).bind(...own).first(),
    db.prepare(`SELECT COUNT(*) AS count FROM crm_tasks ${taskWhere?`${taskWhere} AND `:'WHERE '}status!='done' AND due_date IS NOT NULL AND due_date<=?`).bind(...own,new Date().toISOString().slice(0,10)).first(),
    db.prepare('SELECT quote_number AS quoteNumber,contract_number AS contractNumber,status,customer_name AS customerName,crm_url AS crmUrl,updated_at AS updatedAt FROM contract_statuses ORDER BY updated_at DESC LIMIT 8').all(),
    db.prepare(`SELECT id,title,details,customer_id AS customerId,quote_number AS quoteNumber,status,priority,due_date AS dueDate,assigned_to AS assignedTo,created_at AS createdAt FROM crm_tasks ${taskWhere?`${taskWhere} AND `:'WHERE '}status!='done' ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,due_date IS NULL,due_date ASC,created_at DESC LIMIT 12`).bind(...own).all(),
  ]);
  return {summary:{customers:customers?.count||0,openTasks:openTasks?.count||0,dueTasks:dueTasks?.count||0,contracts:(contracts.results||[]).length},contracts:contracts.results||[],tasks:taskRows.results||[]};
}

export async function listCrmTasks(db,member){
  const own=managerOnly(member)?[]:[member.id];
  const where=own.length?'WHERE assigned_to=?':'';
  const rows=await db.prepare(`SELECT id,title,details,customer_id AS customerId,quote_number AS quoteNumber,status,priority,due_date AS dueDate,assigned_to AS assignedTo,created_by AS createdBy,created_at AS createdAt,updated_at AS updatedAt FROM crm_tasks ${where} ORDER BY status='done',due_date IS NULL,due_date ASC,created_at DESC LIMIT 100`).bind(...own).all();
  return {tasks:rows.results||[]};
}

export async function createCrmTask(db,body,member){
  const task=taskPayload(body), assignedTo=managerOnly(member)&&text(body?.assignedTo||'',120)?text(body.assignedTo,120):member.id;
  const assignee=await db.prepare('SELECT id FROM staff_members WHERE id=? AND active=1').bind(assignedTo).first();
  if(!assignee)throw new QuotationError(400,'Nhân viên được giao không hợp lệ.');
  if(task.customerId&&!await db.prepare('SELECT id FROM sapo_customers WHERE id=?').bind(task.customerId).first())throw new QuotationError(400,'Khách hàng không tồn tại.');
  const stamp=new Date().toISOString(),id=taskId();
  await db.prepare('INSERT INTO crm_tasks (id,title,details,customer_id,quote_number,status,priority,due_date,assigned_to,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,task.title,task.details,task.customerId,task.quoteNumber,'open',task.priority,task.dueDate,assignedTo,member.id,stamp,stamp).run();
  return {task:{id,...task,status:'open',assignedTo,createdBy:member.id,createdAt:stamp,updatedAt:stamp}};
}

export async function updateCrmTask(db,id,body,member){
  if(!/^CRM-[a-f0-9-]{36}$/i.test(id))throw new QuotationError(400,'Mã công việc không hợp lệ.');
  const current=await db.prepare('SELECT id,assigned_to AS assignedTo FROM crm_tasks WHERE id=?').bind(id).first();
  if(!current)throw new QuotationError(404,'Không tìm thấy công việc.');
  if(!managerOnly(member)&&current.assignedTo!==member.id)throw new QuotationError(403,'Bạn chỉ có thể cập nhật công việc của mình.');
  const status=text(body?.status,20);
  if(!['open','in_progress','done'].includes(status||''))throw new QuotationError(400,'Trạng thái công việc không hợp lệ.');
  const stamp=new Date().toISOString();
  await db.prepare('UPDATE crm_tasks SET status=?,completed_at=?,updated_at=? WHERE id=?').bind(status,status==='done'?stamp:null,stamp,id).run();
  return {ok:true};
}
