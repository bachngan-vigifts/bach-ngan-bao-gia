import {QuotationError} from './quotation-store.mjs';
export const defaultPrintingWorkshops=['Xưởng in Tiến phát','Thương Bé Ba','Trọng Tín','Xưởng in Hạnh Nguyên (Anh Liêm)','Minh Long'];
const key=name=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
const schema=`CREATE TABLE IF NOT EXISTS printing_workshops (id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,tax_code TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,created_by TEXT NOT NULL)`;
const allow=member=>{if(member.role!=='manager')throw new QuotationError(403,'Chỉ Manager được quản lý xưởng in.');};
export async function listPrintingWorkshops(db,member){
 allow(member);await db.prepare(schema).run();
 const result=await db.prepare('SELECT id,name,tax_code AS taxCode,address,phone,email FROM printing_workshops ORDER BY created_at,name').all();
 return {workshops:[...defaultPrintingWorkshops.map((name,index)=>({id:`default-${index}`,name,taxCode:'',address:'',phone:'',email:''})),...(result.results||[])]};
}
export async function createPrintingWorkshop(db,body,member){
 allow(member);const clean={};
 for(const [field,max] of Object.entries({name:180,taxCode:40,address:1000,phone:40,email:254})){
  const value=body?.[field]??'';if(typeof value!=='string'||value.length>max)throw new QuotationError(400,'Thông tin xưởng in không hợp lệ.');clean[field]=value.trim();
 }
 if(!clean.name)throw new QuotationError(400,'Vui lòng nhập tên xưởng.');
 if(clean.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email))throw new QuotationError(400,'Email xưởng không hợp lệ.');
 await db.prepare(schema).run();const nameKey=key(clean.name);
 if(defaultPrintingWorkshops.some(name=>key(name)===nameKey))throw new QuotationError(409,'Xưởng này đã có trong danh sách.');
 const id=crypto.randomUUID();
 const result=await db.prepare('INSERT INTO printing_workshops (id,name,name_key,tax_code,address,phone,email,created_at,created_by) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(name_key) DO NOTHING').bind(id,clean.name,nameKey,clean.taxCode,clean.address,clean.phone,clean.email,new Date().toISOString(),member.id).run();
 if(!result.meta.changes)throw new QuotationError(409,'Xưởng này đã có trong danh sách.');
 return {ok:true,workshop:{id,...clean}};
}
