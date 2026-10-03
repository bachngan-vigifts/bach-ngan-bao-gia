export function validDeliveryDate(value){const s=String(value||'').trim(),m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)||s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)?.slice().map((v,i,a)=>i===1?a[3]:i===3?a[1]:v);if(!m)return '';const iso=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;const d=new Date(iso+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===iso?iso:'';}
export function contractDeliveryDate(data,row={}){
 const details=data.contractDocument?.details||{};
 const line=validDeliveryDate(row.deliveryDate||row.delivery_date);if(line)return {date:line,source:'Ngày giao sản phẩm'};
 const edits=(data.contractDocument?.wordEdits||[]).filter(e=>/thời gian giao|ngày (hẹn )?giao/i.test(e.text||''));
 const terms=edits.length?edits.map(e=>e.text).join('\n'):String(details.deliveryTime||'');
 if(!edits.length){const explicit=validDeliveryDate(details.deliveryDate)||validDeliveryDate(data.deliveryDate||data.delivery_date);if(explicit)return {date:explicit,source:'Ngày giao đã ghi nhận'};}
 const dates=[...new Set((terms.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b/g)||[]).map(validDeliveryDate).filter(Boolean))];
 const relative=/kể từ|sau khi|từ ngày|ngày ký|ký hợp đồng/i.test(terms)&&/\d+\s*(?:[-–]\s*\d+\s*)?ngày/i.test(terms);
 if(dates.length===1&&!relative)return {date:dates[0],source:edits.length?'Nội dung HĐKT đã chỉnh':'Điều khoản giao hàng'};
 if(dates.length>1)return {date:'',reason:'Điều khoản có nhiều ngày, cần xác nhận ngày giao'};
 const n=terms.match(/(?:trong\s*)?(\d+)(?:\s*[-–]\s*(\d+))?\s*ngày/i);
 if(n){if(/ngày làm việc/i.test(terms))return {date:'',reason:'Ngày làm việc cần xác nhận lịch nghỉ và ngày giao'};const deposit=/tạm ứng|đặt cọc/i.test(terms),signed=/ngày ký|ký hợp đồng/i.test(terms),base=dates.length===1?dates[0]:deposit?validDeliveryDate(details.depositReceivedDate):signed?validDeliveryDate(details.signedDate):'';if(!base)return {date:'',reason:deposit?'Chưa có ngày nhận tạm ứng':signed?'Chưa có ngày ký hợp đồng':'Chưa rõ ngày bắt đầu tính hạn giao'};const days=Number(n[2]||n[1]);if(days>3650)return {date:'',reason:'Số ngày giao cần kiểm tra'};const d=new Date(base+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return {date:d.toISOString().slice(0,10),source:`${days} ngày từ ${deposit?'nhận tạm ứng':'ngày ký'} (ngày lịch)`};}
 return {date:'',reason:'Chưa có ngày giao cụ thể'};
}
