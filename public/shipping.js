/* Carton counts stay fractional by quotation row. A 33-piece line with
   8 pieces/carton is shown as 4.125 cartons plus a packing note. */
globalThis.Shipping={
 calculate(rows,options={}){
  const groups=[];let cartons=0,kg=0,m3=0,billable=0,missing=0;
  const divisor=Number(options.divisor)||5000;
  for(const r of rows){
   if(!(r.qty>0))continue;
   const n=Number(r.perCarton),w=Number(r.cartonWeight),l=Number(r.cartonLength),b=Number(r.cartonWidth),h=Number(r.cartonHeight);
   // A valid SP/thùng is enough to count boxes. Weight and dimensions are
   // independent: they only affect kg, m3 and the transport estimate.
   if(!Number.isInteger(n)||n<=0){missing++;continue;}
   const hasWeight=Number.isFinite(w)&&w>0,hasDimensions=[l,b,h].every(v=>Number.isFinite(v)&&v>0);
   const full=Math.floor(r.qty/n),rest=r.qty-full*n,count=r.qty/n;
   const volume=hasDimensions?l*b*h/1e6:0,volumeCharge=hasDimensions?l*b*h/divisor:0;
   const unit=String(r.unit||'cái').trim()||'cái';
   const note=[full?`${full} thùng x ${n} ${unit}`:'',rest?`lẻ ${rest} ${unit}`:''].filter(Boolean).join(' + ');
   groups.push({sku:r.sku,name:r.name,quantity:r.qty,count,full,rest,units:n,note,kg:hasWeight?w:null,l:hasDimensions?l:null,b:hasDimensions?b:null,h:hasDimensions?h:null});
   cartons+=count;
   if(hasWeight)kg+=count*w;
   if(hasDimensions)m3+=count*volume;
   if(hasWeight||hasDimensions)billable+=count*Math.max(hasWeight?w:0,volumeCharge);
   if(!hasWeight||!hasDimensions)missing++;
  }
  const rate=Number(options.rate)||0,extra=Number(options.extra)||0;
  const hasRate=options.rate!==undefined&&options.rate!==null&&options.rate!=='';
  // A flat transport quote does not depend on carton weights or dimensions.
  const fee=rate===0&&(hasRate||extra>0)?Math.ceil(extra):!missing&&cartons&&rate>0?Math.ceil(billable*rate+extra):null;
  return {groups,cartons,kg,m3,billable,missing,fee};
 },
 render(host,state,onChange){
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number(n||0).toLocaleString('vi-VN',{maximumFractionDigits:3});
  const shown=n=>Number.isFinite(n)&&n>0?fmt(n):'—';
  const fields=[['perCarton','SP/thùng'],['cartonWeight','Kg/thùng đầy'],['cartonLength','Dài (cm)'],['cartonWidth','Rộng (cm)'],['cartonHeight','Cao (cm)']];
  const s=state.shipping||{},calc=this.calculate(state.rows,s);
  host.innerHTML=`<p>Quy cách lấy từ Excel theo SKU. Nhập bổ sung ô trống; kích thước tính bằng cm. Mỗi mã đóng riêng. Số thùng hiển thị dạng lẻ theo số lượng / SP thùng.</p><div class="shipping-scroll"><table><thead><tr><th>Mã / sản phẩm</th><th>Số lượng</th>${fields.map(f=>`<th>${f[1]}</th>`).join('')}</tr></thead><tbody>${state.rows.map((r,i)=>`<tr><td>${esc(r.sku)}<br><small>${esc(r.name)}</small></td><td>${fmt(r.qty)}</td>${fields.map(([key,label])=>`<td><input aria-label="${esc(label+' '+r.sku)}" data-pack="${key}" data-row="${i}" type="number" min="0" step="${key==='perCarton'?'1':'any'}" value="${r[key]||''}" placeholder="Chưa có"></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="shipping-rates">${[['divisor','Hệ số quy đổi cm³/kg',s.divisor||5000],['rate','Cước nhập tay (đ/kg)',s.rate??''],['extra','Phụ phí (đ)',s.extra??'']].map(([key,label,value])=>`<label>${label}<input data-rate="${key}" type="number" min="${key==='divisor'?1:0}" step="any" value="${value}"></label>`).join('')}</div><p>Kg tính cước mỗi dòng = số thùng lẻ × số lớn hơn giữa kg/thùng và Dài × Rộng × Cao / hệ số. Hệ số mặc định 5.000; chỉnh theo nhà vận chuyển. Nhập đơn giá 0đ và điền cước trọn gói vào Phụ phí (ví dụ 100.000đ). Cước dự toán không cộng vào tiền báo giá.</p><strong>${fmt(calc.cartons)} thùng · ${fmt(calc.kg)} kg dự toán · ${fmt(calc.m3)} m³ · ${fmt(calc.billable)} kg tính cước${calc.missing?` · ${calc.missing} dòng còn thiếu dữ liệu cước`:''}</strong><p>Cước dự toán: <b>${calc.fee===null?'Chưa đủ dữ liệu hoặc chưa nhập đơn giá':fmt(calc.fee)+' đ'}</b></p><div class="shipping-scroll"><table><thead><tr><th>SKU</th><th>Số lượng</th><th>Số thùng</th><th>Ghi chú đóng thùng</th><th>D × R × C (cm)</th><th>Kg/thùng dự toán</th></tr></thead><tbody>${calc.groups.map(g=>`<tr><td>${esc(g.sku)}<br><small>${esc(g.name||'')}</small></td><td>${fmt(g.quantity)}</td><td>${fmt(g.count)}</td><td>${esc(g.note)}</td><td>${[g.l,g.b,g.h].map(shown).join(' × ')}</td><td>${shown(g.kg)}</td></tr>`).join('')}</tbody></table></div>`;
  host.querySelectorAll('[data-pack]').forEach(el=>el.onchange=()=>{let v=Number(el.value);if(!Number.isFinite(v)||v<0||v>1e6||(el.dataset.pack==='perCarton'&&!Number.isInteger(v))){el.value='';v=0;}state.rows[Number(el.dataset.row)][el.dataset.pack]=v;onChange();});
  host.querySelectorAll('[data-rate]').forEach(el=>el.onchange=()=>{let v=Number(el.value);if(!Number.isFinite(v)||v<0||v>1e12)v=0;state.shipping={...state.shipping,[el.dataset.rate]:el.dataset.rate==='divisor'?Math.max(1,v):v};onChange();});
 }
};
