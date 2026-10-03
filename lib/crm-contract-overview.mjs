export const normalizeContractText=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().trim();
const id=v=>String(v&&typeof v==='object'?(v.tupleId||v.tuple_id||v.itemId||''):v??'');
const text=v=>String(v&&typeof v==='object'?(v.label||v.value||id(v)):v??'');
export function contractState(value){const s=normalizeContractText(text(value));return s==='da thanh ly'?'settled':s==='da duyet'?'approved':['doi duyet','chua duyet','cho duyet'].includes(s)?'pending':'other';}
export function crmContractOverview(tables){
 const maps={};for(const [table,fields] of Object.entries({NhanVien:['Ten','Tên','Email'],KhachHang:['TênKH','MÃ KH'],SanPham:['Tên sản phẩm','Mã hàng']}))maps[table]=new Map((tables[table]||[]).map(r=>[r.tupleId,fields.map(f=>text(r.values?.[f])).find(Boolean)||r.tupleId]));
 const label=(table,value)=>maps[table]?.get(id(value))||text(value);
 const products=new Map();for(const r of tables['Chi tiết đơn hàng']||[]){const v=r.values||{},key=id(v['Số HĐ']);const value=[label('SanPham',v['Sản phẩm']),text(v['Mô tả sản phẩm'])].filter(Boolean).join(' · ');if(!products.has(key))products.set(key,new Set());if(value)products.get(key).add(value);}
 return (tables['Nhập đơn hàng']||[]).map(r=>{const v=r.values||{},raw=text(v['Phê duyệt']);return {id:r.tupleId,number:text(v['Số HĐ'])||'Chưa có số HĐ',customer:label('KhachHang',v.KH_NDP)||'Chưa có khách hàng',employee:label('NhanVien',v['Nhân viên phụ trách'])||'Chưa phân công',status:contractState(raw),statusLabel:raw||'Chưa ghi nhận',products:[...(products.get(r.tupleId)||[])],updatedAt:r.sourceUpdatedAt||r.sourceCreatedAt||''};});
}
export function selectContracts(rows,{status='all',employee='',customer='',product='',sort='status'}={}){
 const match=(v,q)=>normalizeContractText(v).includes(normalizeContractText(q));
 const result=rows.filter(r=>(status==='all'||r.status===status)&&match(r.employee,employee)&&match(r.customer,customer)&&match(r.products.join(' '),product));
 const rank={approved:0,pending:1,settled:2,other:3};
 return result.sort((a,b)=>{const primary=sort==='status'?rank[a.status]-rank[b.status]:sort==='updated'?String(b.updatedAt).localeCompare(String(a.updatedAt)):String(sort==='product'?a.products.join(' '):a[sort]).localeCompare(String(sort==='product'?b.products.join(' '):b[sort]),'vi',{numeric:true});return primary||a.number.localeCompare(b.number,'vi',{numeric:true})||a.id.localeCompare(b.id);});
}
