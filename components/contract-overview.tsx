'use client';
import {useEffect,useState} from 'react';
import {selectContracts} from '@/lib/crm-contract-overview.mjs';
import {revalidatedList} from '@/lib/list-session-cache.mjs';
import './contract-overview.css';
type Row=Record<string,any>;
const states=[['all','Tất cả'],['approved','Đã duyệt'],['pending','Đợi duyệt'],['settled','Đã thanh lý'],['other','Trạng thái khác']];
export default function ContractOverview({user,revision}:{user:Row,revision:number}){
 const [data,setData]=useState<Row|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[limit,setLimit]=useState(8);
 const [filters,setFilters]=useState({status:'all',employee:'',customer:'',product:'',sort:'status'});
 useEffect(()=>{const controller=new AbortController();let active=true;setBusy(true);setError('');let storage=null;try{storage=sessionStorage;}catch{}
 revalidatedList(storage,JSON.stringify([user.id,user.role,user.position]),'/vigifts/contract-overview',async()=>{const r=await fetch('/api/vigifts/contract-overview',{signal:controller.signal,cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Chưa tải được HĐKT.');return d;},(d:Row)=>{if(active)setData(d);},{force:revision>0}).catch(e=>{if(active&&e.name!=='AbortError'){setError(e.message);setData(null);}}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;controller.abort();};
 },[user.id,user.role,user.position,revision]);
 const change=(key:string,value:string)=>{setFilters(f=>({...f,[key]:value}));setLimit(8);};
 const rows=selectContracts(data?.records||[],filters);
 return <section className="qw-section co-card" aria-labelledby="contract-overview-title"><div className="qw-section-title"><h2 id="contract-overview-title">HĐKT tổng quan</h2><a href={'/crm?table='+encodeURIComponent('Nhập đơn hàng')+'&view='+encodeURIComponent('HĐKT')}>Mở CRM →</a></div>
 <p className="qw-muted">Toàn bộ HĐKT trong CRM · Trạng thái theo hồ sơ CRM{busy?' · Đang cập nhật…':''}</p>
 {data?.fallback&&<p className="qw-error">Đang hiển thị bản lưu CRM ngày {new Date(data.asOf).toLocaleDateString('vi-VN')}, chưa phải dữ liệu trực tiếp.</p>}
 <div className="qw-filters" aria-label="Trạng thái HĐKT">{states.map(([value,label])=><button key={value} type="button" aria-pressed={filters.status===value} className={filters.status===value?'active':''} onClick={()=>change('status',value)}>{label} ({(data?.records||[]).filter((r:Row)=>value==='all'||r.status===value).length})</button>)}</div>
 <div className="co-controls">{[['employee','Nhân viên'],['customer','Khách hàng'],['product','Sản phẩm']].map(([key,label])=><label key={key}>{label}<input value={filters[key as keyof typeof filters]} onChange={e=>change(key,e.target.value)} placeholder={'Tìm '+label.toLowerCase()}/></label>)}<label>Sắp xếp<select value={filters.sort} onChange={e=>change('sort',e.target.value)}>{[['status','Trạng thái'],['employee','Nhân viên A–Z'],['customer','Khách hàng A–Z'],['product','Sản phẩm A–Z'],['number','Số HĐ'],['updated','Cập nhật mới nhất']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>
 {error?<p className="qw-error" role="alert">{error}</p>:<><p className="qw-count">{rows.length} HĐKT phù hợp{rows.length>limit?' · Hiển thị '+limit:''}</p>{!rows.length?<p className="qw-empty">{busy?'Đang tải HĐKT…':'Không có HĐKT phù hợp bộ lọc.'}</p>:<ul className="qw-list">{rows.slice(0,limit).map((r:Row)=><li key={r.id} className="qw-row"><div className="qw-row-main"><strong>{r.number}</strong><span>{r.customer}</span><small>Nhân viên: {r.employee}</small><small className="co-products">{r.products.length?r.products.join(' · '):'Chưa ghi nhận sản phẩm'}</small></div><span className={'qw-badge '+(r.status==='approved'?'approved':r.status==='settled'?'won':'pending')}>{r.statusLabel}</span></li>)}</ul>}{rows.length>limit&&<button className="qw-load-more" onClick={()=>setLimit(n=>n+20)}>Xem thêm HĐKT</button>}</>}
 </section>;
}
