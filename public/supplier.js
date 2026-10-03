(()=>{
 const $=selector=>document.querySelector(selector);
 const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const money=value=>Number(value||0).toLocaleString('vi-VN')+' đ';
 const number=value=>Number(value||0).toLocaleString('vi-VN',{maximumFractionDigits:3});
 const date=value=>value?new Date(value).toLocaleDateString('vi-VN'):'—';
 const api=async(path,method='GET',body)=>{
  const response=await fetch('/api/staff'+path,{method,cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  let data={};try{data=await response.json();}catch{}
  if(response.status===401){location.replace('/login.html?returnTo='+encodeURIComponent(location.pathname+location.search+location.hash));throw Error('Vui lòng đăng nhập lại.');}
  if(!response.ok)throw Error(data.error||'Không thể kết nối hệ thống.');
  return data;
 };
 const pushWorkerUrl='/push-sw.js?v=notification-target-20261002';
 const pushKeyToBytes=key=>{const pad='='.repeat((4-key.length%4)%4),base=(key+pad).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));};
 const pushSupportMessage=()=>{const ua=navigator.userAgent||'',ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if(location.protocol!=='https:')return 'Cần mở bằng link HTTPS để bật thông báo.';if(!('serviceWorker'in navigator))return 'Trình duyệt này chưa hỗ trợ Service Worker.';if(!('PushManager'in window))return ios?'iPhone cần thêm web vào Màn hình chính rồi mở từ icon mới để bật thông báo.':'Trình duyệt/app đang mở chưa hỗ trợ Web Push. Trên Android nên mở bằng Chrome.';if(!('Notification'in window))return 'Trình duyệt này chưa hỗ trợ thông báo.';return '';};
	 let allOrders=[],paymentRequests=[],stockRequests=[],activeTab='pending',currentUser=null,calendarCursor=new Date(),calendarView='month',calendarGroup='ticket',showCalendar=false,showProductStats=false,selectedOrderId='',selectedProductKey='',productStatsFilters={sku:'',name:''},orderFilters={query:'',date:''},orderFilterDraft={query:'',date:''},deepLinkConsumed=false,pendingDeposit=null,portalRefreshBusy=false;
	 const internalOrderSaveTimers=new Map();
	 let productStatsFilterTimer=null;
	 let deliveryReadyRequest=null;
	 let deliveryNoteRequest=null;
	 const deepLinkedOrderId=()=>new URLSearchParams(location.hash.replace(/^#/,'')).get('order')||'';
 const clearOrderHash=()=>{if(deepLinkedOrderId())history.replaceState(null,'',location.pathname+location.search);};
 const statusLabel=order=>order.receivedAt||(order.supplierReceivedRows?.length&&stockRows(order).every(r=>lineProgress(order,r).received>=Number(r.quantity||0)))?'Đã nhập kho':order.supplierStatus==='confirmed'?'Đã duyệt':'Đợi duyệt';
 const hidePrices=order=>order?.priceHidden||currentUser?.role==='employee';
 const canActOnOrder=()=>currentUser?.role!=='employee';
 const isPrintLogoRow=row=>row?.type==='print-logo'||String(row?.sku||'').trim().toUpperCase()==='IN-LOGO';
 const stockRows=order=>(order.rows||[]).filter(row=>!isPrintLogoRow(row));
 const designHref=row=>String(row.designImage||'').trim()&&!String(row.designImage||'').startsWith('[uploaded')?String(row.designImage).trim():'';
 const printLogoDetail=row=>`${row.description?`<small>${safe(row.description)}</small>`:''}${row.sourceSkus?.length?`<small>Áp dụng: ${row.sourceSkus.map(safe).join(', ')}</small>`:''}${designHref(row)?`<a class="design-file-link" href="${safe(designHref(row))}" target="_blank" rel="noopener noreferrer">Xem ảnh/thiết kế</a>`:''}`;
 const rowHtml=(row,order)=>isPrintLogoRow(row)?(hidePrices(order)?`<tr class="print-logo-row"><td><b>IN-LOGO</b></td><td class="product-name"><b>${safe(row.name||'In ấn logo')}</b>${printLogoDetail(row)}</td><td>—</td><td>${date(row.promisedDate)}</td></tr>`:`<tr class="print-logo-row"><td><b>IN-LOGO</b></td><td class="product-name"><b>${safe(row.name||'In ấn logo')}</b>${printLogoDetail(row)}</td><td>—</td><td class="money">—</td><td class="money">—</td><td class="money">—</td></tr>`):hidePrices(order)?`<tr><td><b>${safe(row.sku)}</b></td><td class="product-name"><b>${safe(row.name||'')}</b>${row.supplierNote?`<small>Ghi chú: ${safe(row.supplierNote)}</small>`:''}</td><td>${number(row.quantity)}</td><td>${date(row.promisedDate)}</td></tr>`:`<tr><td><b>${safe(row.sku)}</b></td><td class="product-name"><b>${safe(row.name||'')}</b><small>VAT ${number(row.taxRate)}% · CK nhập ${number(row.purchaseDiscount)}%</small>${row.supplierNote?`<small>Ghi chú: ${safe(row.supplierNote)}</small>`:''}</td><td>${number(row.quantity)}</td><td class="money">${money(row.unitPrice)}</td><td class="money">${money(row.priceAfterDiscount)}</td><td class="money">${money(row.lineTotal)}</td></tr>`;
 const pendingRow=row=>isPrintLogoRow(row)?`<tr class="print-logo-row"><td><span><b>IN-LOGO</b><small>${safe(row.name||'In ấn logo')}</small></span></td><td colspan="4">${printLogoDetail(row)||'<small>In logo theo thiết kế được duyệt.</small>'}</td></tr>`:`<tr data-confirm-row data-sku="${safe(row.sku)}" data-quantity="${safe(row.quantity)}"><td><label class="confirm-check"><input type="checkbox" data-confirm-check> <span><b>${safe(row.sku)}</b><small>${safe(row.name||'')}</small></span></label></td><td><input class="supplier-note-input" data-supplier-note maxlength="500" placeholder="Ghi chú"></td><td><b>${number(row.quantity)}</b></td><td><input class="discount-input" data-purchase-discount type="number" min="0" max="100" step="0.01" value="${safe(row.purchaseDiscount)}"></td><td><input type="date" data-promised-date value="${safe(row.promisedDate||'')}"></td></tr>`;
 const signatureFileUrl=order=>`/api/staff/supplier-portal/orders/${encodeURIComponent(order.id)}/signature-file`;
 const loadExcelJs=()=>new Promise((resolve,reject)=>{if(window.ExcelJS)return resolve();const existing=document.querySelector('[data-exceljs-loader]');if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(Error('Không tải được bộ xuất Excel. Tải lại trang rồi thử lại.')),{once:true});return;}const script=document.createElement('script');script.src='/exceljs.min.js';script.dataset.exceljsLoader='1';script.onload=resolve;script.onerror=()=>reject(Error('Không tải được bộ xuất Excel. Tải lại trang rồi thử lại.'));document.body.append(script);});
	 const loadPdfLib=()=>new Promise((resolve,reject)=>{
	  const loadScript=(src,flag,done)=>{if(window[flag])return done();const existing=document.querySelector(`[data-${flag.toLowerCase()}-loader]`);if(existing){existing.addEventListener('load',done,{once:true});existing.addEventListener('error',()=>reject(Error('Không tải được bộ xuất PDF. Tải lại trang rồi thử lại.')),{once:true});return;}const script=document.createElement('script');script.src=src;script.dataset[`${flag.toLowerCase()}Loader`]='1';script.onload=done;script.onerror=()=>reject(Error('Không tải được bộ xuất PDF. Tải lại trang rồi thử lại.'));document.body.append(script);};
	  loadScript('/pdf-lib.min.js','PDFLib',()=>loadScript('/fontkit.umd.min.js','fontkit',resolve));
	 });
 const fileSafe=value=>String(value||'don-hang-ncc').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)||'don-hang-ncc';
	 const orderTableTools=(order,requireChecked=false)=>`<div class="order-table-tools"><button class="secondary-action" data-download-order ${requireChecked?'data-require-checked="1" aria-disabled="true" title="Tick chọn đủ từng mã hàng trước khi tải file"':''} type="button">Tải file đơn hàng</button></div>`;
		 const orderHeadActions=(order,pending)=>{
		  const readyAction=!pending&&currentUser?.role!=='employee'?deliveryReadyButton(order):'';
		  return `<div class="order-head-actions"><div class="order-status-stack"><span class="order-status ${pending?'waiting':'done'}">${statusLabel(order)}</span>${readyAction}</div>${currentUser?.role==='manager'?'<button class="danger-action head-delete-action" data-delete-order type="button">Xóa phiếu</button>':''}<button class="order-close-action" data-close-order type="button" aria-label="Đóng chi tiết đơn NCC" title="Đóng chi tiết">×</button></div>`;
		 };
 const supplierTicket=value=>safe(value||'Chưa có');
 const internalOrder=value=>`Số phiếu NCC: ${supplierTicket(value)}`;
 const internalMeta=(order,pending)=>pending?`<label class="supplier-internal-field">Số phiếu NCC<input data-supplier-internal-order maxlength="100" value="${safe(order.supplierInternalOrderNumber||'')}" placeholder="Ví dụ: PO-2026-001"></label>`:`<span>Số phiếu NCC<b>${supplierTicket(order.supplierInternalOrderNumber)}</b></span>`;
 const orderQuantity=order=>stockRows(order).reduce((sum,row)=>sum+Number(row.quantity||0),0);
 const lineProgress=(order,row)=>SupplierProgress.progress(order,row);
 let supplyPlanScope='confirmed';
 const planScopePicker=()=>`<label class="supplier-plan-picker">Nguồn hàng <select data-plan-scope aria-label="Phân loại nguồn hàng"><option value="confirmed" ${supplyPlanScope==='confirmed'?'selected':''}>NCC đã xác nhận</option><option value="pending" ${supplyPlanScope==='pending'?'selected':''}>Dự kiến — chờ NCC xác nhận</option><option value="all" ${supplyPlanScope==='all'?'selected':''}>Tất cả (gồm dự kiến)</option></select></label>`;
 const planOrders=()=>allOrders.filter(o=>!o.receivedAt&&(supplyPlanScope==='all'||(supplyPlanScope==='confirmed'?o.supplierStatus==='confirmed':o.supplierStatus!=='confirmed')));
 const bindPlanScope=body=>body.querySelector('[data-plan-scope]')?.addEventListener('change',e=>{supplyPlanScope=e.target.value;selectedProductKey='';syncProductStatsDialog();syncCalendarDialog();});
 const deliveredQuantity=(order,sku)=>(order?.supplierDeliveredRows||[]).filter(row=>String(row.sku||'').toLowerCase()===String(sku||'').toLowerCase()).reduce((sum,row)=>sum+Number(row.quantity||0),0);
 const remainingRowQuantity=(order,row)=>lineProgress(order,row).remaining;
 const packingNote=row=>{
  const qty=Number(row.quantity)||0,perCarton=Number(row.perCarton),unit=String(row.unit||'cái').trim()||'cái';
  if(!Number.isInteger(perCarton)||perCarton<=0||qty<=0)return 'Chưa có quy cách';
  const full=Math.floor(qty/perCarton),rest=qty-full*perCarton;
  return [full?`${number(full)} thùng x ${number(perCarton)} ${unit}`:'',rest?`lẻ ${number(rest)} ${unit}`:''].filter(Boolean).join(' + ')||'0 thùng';
 };
 const packingValue=value=>Number.isFinite(Number(value))&&Number(value)>0?number(value):'—';
 const packingCartons=row=>{
  const saved=Number(row.cartons),perCarton=Number(row.perCarton),qty=Number(row.quantity)||0;
  if(Number.isFinite(saved)&&saved>0)return saved;
  return perCarton>0?qty/perCarton:0;
 };
 const supplierPackingPanel=order=>{
  const rows=stockRows(order).filter(row=>Number(row.quantity)>0);
  if(!rows.length)return '';
  let cartons=0,weightKg=0,volumeM3=0,missing=0;
  const body=rows.map(row=>{
   const count=packingCartons(row),weight=Number(row.weightKg),volume=Number(row.volumeM3);
   if(count>0)cartons+=count;else missing++;
   if(Number.isFinite(weight)&&weight>0)weightKg+=weight;else missing++;
   if(Number.isFinite(volume)&&volume>0)volumeM3+=volume;else missing++;
   const dimensions=[row.cartonLength,row.cartonWidth,row.cartonHeight].map(packingValue).join(' × ');
   return `<tr><td><b>${safe(row.sku)}</b><small>${safe(row.name||'')}</small></td><td>${number(row.quantity)}</td><td>${count?number(count):'—'}</td><td>${safe(packingNote(row))}</td><td>${dimensions}</td><td>${packingValue(row.weightKg)}</td><td>${packingValue(row.volumeM3)}</td></tr>`;
  }).join('');
  return `<section class="supplier-packing-panel"><div class="supplier-packing-head"><div><span>Tính đóng thùng &amp; phí vận chuyển</span><b>${missing?'Tạm tính — chưa đủ dữ liệu: ':''}${number(cartons)} thùng quy đổi · ${number(weightKg)} kg · ${number(volumeM3)} m³</b></div>${missing?`<em>${number(missing)} mục thiếu dữ liệu</em>`:''}</div><div class="table-wrap supplier-packing-table"><table><thead><tr><th>SKU / sản phẩm</th><th>SL</th><th>Thùng quy đổi</th><th>Thùng nguyên + hàng lẻ</th><th>D × R × C (cm)</th><th>Kg</th><th>m³</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
 };
 const parseLocalDate=value=>{
  if(!value)return null;
  const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(match)return new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
  const parsed=new Date(value);
  return Number.isNaN(parsed.getTime())?null:parsed;
 };
 const isoDate=value=>{
  const parsed=parseLocalDate(value);
  if(!parsed)return '';
  const year=parsed.getFullYear(),month=String(parsed.getMonth()+1).padStart(2,'0'),day=String(parsed.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
 };
 const monthName=value=>`tháng ${value.getMonth()+1} ${value.getFullYear()}`;
	 const addDays=(value,days)=>new Date(value.getFullYear(),value.getMonth(),value.getDate()+days);
	 const startOfWeek=value=>addDays(value,-((value.getDay()+6)%7));
	 const daysBetween=(from,to)=>{
	  const a=parseLocalDate(from),b=parseLocalDate(to);
	  if(!a||!b)return null;
	  return Math.round((new Date(a.getFullYear(),a.getMonth(),a.getDate())-new Date(b.getFullYear(),b.getMonth(),b.getDate()))/86400000);
	 };
	 const orderDueDate=order=>{
	  const dates=stockRows(order).filter(row=>remainingRowQuantity(order,row)>0).map(row=>isoDate(row.promisedDate||order.arrivalDate)).filter(Boolean);
	  if(!dates.length&&isoDate(order.arrivalDate))dates.push(isoDate(order.arrivalDate));
	  return dates.sort()[0]||'';
	 };
	 const orderDueDays=order=>{
	  const due=orderDueDate(order);
	  return due?daysBetween(due,todayIso()):null;
	 };
	 const urgencyInfo=order=>{
	  const due=orderDueDate(order),days=orderDueDays(order);
	  if(days===null)return {className:'none',label:date(due||order.arrivalDate)};
	  if(days<0)return {className:'red',label:`${date(due)} · quá hạn ${Math.abs(days)} ngày`};
	  if(days===0)return {className:'red',label:`${date(due)} · hôm nay`};
	  if(days===1)return {className:'orange',label:`${date(due)} · còn 1 ngày`};
	  if(days===2)return {className:'yellow',label:`${date(due)} · còn 2 ngày`};
	  return {className:'green',label:`${date(due)} · còn ${number(days)} ngày`};
	 };
		 const deliveryReadyInfo=order=>{
		  const ready=Boolean(order.supplierDeliveryReadyAt),approved=order.supplierStatus==='confirmed',available=approved&&!order.receivedAt,partial=order.supplierDeliveryReadyMode==='partial';
		  return {ready,available,className:ready?'ready':available?'active':'muted',label:ready?`Đã sẵn sàng${partial?' 1 phần':''}`:available?'Sẵn sàng giao':'Chưa duyệt',title:ready?'NCC đã báo sẵn sàng giao đơn này.':available?'Bấm để chọn giao toàn bộ hoặc giao một phần.':'Chỉ đơn đã duyệt mới báo sẵn sàng giao.'};
		 };
	 const sortOrdersByDelivery=orders=>[...orders].sort((a,b)=>{
	  const aDue=orderDueDate(a),bDue=orderDueDate(b);
	  if(aDue!==bDue)return (aDue||'9999-12-31').localeCompare(bDue||'9999-12-31');
	  return String(a.ticketNumber||a.id||'').localeCompare(String(b.ticketNumber||b.id||''),'vi');
	 });
	 const isOverdue=order=>{
	  if(order.receivedAt||order.supplierStatus!=='confirmed')return false;
	  const today=todayIso(),rows=stockRows(order).length?stockRows(order):[{}];
  return rows.some(row=>{
   if(remainingRowQuantity(order,row)<=0)return false;
   const key=isoDate(row.promisedDate||order.arrivalDate);
   return key&&key<today;
  });
 };
 const matchesDate=(order,value)=>{
  if(!value)return true;
  if(isoDate(order.arrivalDate)===value)return true;
  return (order.rows||[]).some(row=>isoDate(row.promisedDate)===value);
 };
 const filterOrders=orders=>{
  const query=orderFilters.query.trim().toLowerCase(),dateValue=orderFilters.date;
  return orders.filter(order=>{
   const haystack=[order.ticketNumber,order.quoteNumber,order.supplierInternalOrderNumber].map(value=>String(value||'').toLowerCase()).join(' ');
   return (!query||haystack.includes(query))&&matchesDate(order,dateValue);
  });
 };
	 const deliveryReadyButton=(order,compact=false)=>{const state=deliveryReadyInfo(order);return `<button class="delivery-ready-action ${state.className} ${compact?'compact':''}" data-delivery-ready="${safe(order.id)}" type="button" ${state.available?'':'disabled aria-disabled="true"'} title="${safe(state.title)}">${safe(state.label)}</button>`;};
	 const deliveryPrintDate=order=>isoDate(order.supplierDeliveryReadyDate||orderDueDate(order)||order.arrivalDate);
	 const deliveryPrintEligible=order=>order.supplierStatus==='confirmed'&&!order.receivedAt&&order.supplierDeliveryReadyAt;
	 const deliveryPrintRowsForOrder=order=>{
	  const rows=stockRows(order);
	  if(order.supplierDeliveryReadyMode!=='partial'||!order.supplierDeliveryReadyRows?.length)return rows.map(row=>({...row,quantity:remainingRowQuantity(order,row),deliveryNoteText:'Giao toàn bộ',deliveryOriginalQuantity:Number(row.quantity||0)})).filter(row=>Number(row.quantity)>0);
	  const selected=new Map(order.supplierDeliveryReadyRows.map(row=>[String(row.sku||'').toLowerCase(),Number(row.quantity||0)]));
	  return rows.filter(row=>selected.has(String(row.sku||'').toLowerCase())).map(row=>{
	   const readyQuantity=selected.get(String(row.sku||'').toLowerCase())||row.quantity,original=Number(row.quantity||0),already=deliveredQuantity(order,row.sku),available=Math.max(0,original-already),quantity=Math.min(Number(readyQuantity)||0,available),remaining=Math.max(0,available-Number(quantity||0));
	   return {...row,quantity,deliveryOriginalQuantity:original,deliveryNoteText:remaining>0?`Giao trước ${number(quantity)} cái còn lại ${number(remaining)} cái`:'Giao toàn bộ'};
	  }).filter(row=>Number(row.quantity)>0);
	 };
	 const acceptedStockRequestLinesForOrders=orders=>{
	  const ids=new Set(orders.map(order=>order.id));
	  return stockRequests.filter(request=>request.status==='accepted').flatMap(request=>(request.lines||[]).filter(line=>ids.has(line.orderId)).map(line=>({request,line,order:orders.find(order=>order.id===line.orderId)})));
	 };
	 const deliveryNoteAvailableLines=()=>{
	  const orderLines=allOrders.filter(deliveryPrintEligible).flatMap(order=>deliveryPrintRowsForOrder(order).map(row=>({key:`order:${order.id}:${String(row.sku||'').toLowerCase()}`,source:'Đơn NCC',order,row,date:deliveryPrintDate(order),supplierName:order.supplierName||'NCC'})));
	  const requestLines=stockRequests.filter(request=>request.status==='accepted').flatMap(request=>(request.lines||[]).map(line=>{const order=allOrders.find(item=>item.id===line.orderId),orderRow=stockRows(order||{}).find(row=>String(row.sku||'').toLowerCase()===String(line.sku||'').toLowerCase()),quantity=orderRow&&!order.receivedAt?Math.min(Number(line.quantity)||0,remainingRowQuantity(order,orderRow)):0;return {key:`request:${request.id}:${line.orderId}:${String(line.sku||'').toLowerCase()}`,source:'Đang lấy hàng',order,row:{sku:line.sku,name:line.name,unit:line.unit,quantity,supplierNote:'Đang lấy hàng',deliveryNoteText:'Giao toàn bộ'},date:isoDate(line.arrivalDate)||deliveryPrintDate(order||{}),supplierName:request.supplierName||order?.supplierName||'NCC'};}));
	  return [...orderLines,...requestLines].filter(item=>item.row?.sku&&Number(item.row.quantity)>0).sort((a,b)=>(a.date||'9999-12-31').localeCompare(b.date||'9999-12-31')||String(a.row.sku||'').localeCompare(String(b.row.sku||''),'vi'));
	 };
	 const deliveryNoteLineGroups=lines=>{
	  const map=new Map();
	  for(const item of lines){
	   const sku=String(item.row.sku||'').trim(),key=sku.toLowerCase(),current=map.get(key)||{key,sku,name:item.row.name||'',quantity:0,lines:[]};
	   current.quantity+=Number(item.row.quantity||0);
	   current.lines.push(item);
	   if(!current.name&&item.row.name)current.name=item.row.name;
	   map.set(key,current);
	  }
	  return [...map.values()].sort((a,b)=>a.sku.localeCompare(b.sku,'vi'));
	 };
	 const paidSummary=order=>{
  if(hidePrices(order))return {label:'Ẩn giá',state:''};
  const total=Number(order.total||0),paid=Math.max(0,Number(order.depositPaidAmount??order.paidAmount??0)||0);
  if(paid<=0)return {label:'Chưa thanh toán',state:'unpaid'};
  const percent=total>0?Math.min(100,Math.round(paid/total*1000)/10):0;
  return {label:`${number(percent)}% - ${money(paid)}`,state:'paid'};
 };
			 const compactOrderRow=order=>{const paid=paidSummary(order),rows=stockRows(order),urgency=urgencyInfo(order),confirmed=order.supplierStatus==='confirmed';return `<article class="order-list-row ${selectedOrderId===order.id?'active':''}" data-select-order="${safe(order.id)}" role="button" tabindex="0"><span class="compact-main"><b>${safe(order.ticketNumber||'Đơn NCC')}</b><small>${internalOrder(order.supplierInternalOrderNumber)}</small></span><span class="due-pill ${urgency.className}">${safe(urgency.label)}</span><span>${number(rows.length)} mã / ${number(orderQuantity(order))}</span><span class="compact-paid ${paid.state}">${safe(paid.label)}</span><span class="compact-money">${hidePrices(order)?'Ẩn giá':money(order.total)}</span><span class="order-status ${confirmed?'done':'waiting'}">${statusLabel(order)}</span>${confirmed&&currentUser?.role!=='employee'?`<span class="delivery-list-actions">${deliveryReadyButton(order,true)}</span>`:'<span class="delivery-ready-placeholder"></span>'}</article>`;};
	 const orderList=(orders,totalCount,emptyText)=>`<section class="order-list-shell"><div class="order-list-head"><span>Đơn hàng</span><span>Hẹn giao</span><span>Số lượng</span><span>Đã thanh toán</span><span>Tổng tiền</span><span>Trạng thái</span><span>Giao hàng</span></div>${orders.length?orders.map(compactOrderRow).join(''):`<div class="empty compact-empty">${emptyText}</div>`}</section>`;
 const paymentRequestRow=order=>`<article class="payment-request" data-payment-request="${safe(order.id)}"><div><b>${safe(order.ticketNumber||'Đơn NCC')}</b><span>${internalOrder(order.supplierInternalOrderNumber)} · ${safe(order.supplierName||'NCC')}</span></div><strong>${money(order.depositAmount)}</strong><button class="primary" data-pay-deposit type="button">Đã thanh toán cọc</button></article>`;
 const updateSupplierConfirmReminder=()=>{
  const reminder=$('#supplierConfirmReminder');
  if(!reminder)return;
  const orders=allOrders.filter(order=>currentUser?.role==='supplier'&&order.depositRequestedAt&&!order.depositPaidAt&&order.supplierStatus!=='confirmed');
  reminder.hidden=!orders.length;
  reminder.textContent=orders.length?`Còn ${number(orders.length)} đơn đã gửi yêu cầu thanh toán cọc. Vui lòng upload bản ký và bấm Xác nhận đơn để hoàn tất.`:'';
 };
	 const managerPaymentPanel=()=>{
	  if(currentUser?.role!=='manager')return '';
	  if(!paymentRequests.length)return '';
	  const total=paymentRequests.reduce((sum,order)=>sum+Number(order.depositAmount||0),0);
		  return `<section class="payment-requests-panel"><div class="payment-requests-head"><div><span>Yêu cầu thanh toán NCC</span><b>${number(paymentRequests.length)} yêu cầu</b></div><strong>${money(total)}</strong></div>${paymentRequests.map(paymentRequestRow).join('')}</section>`;
		 };
		 const stockRequestStatus=request=>request.status==='accepted'?'Đang lấy hàng':request.status==='rejected'?'Từ chối':'Đợi phản hồi';
		 const stockRequestStatusClass=request=>request.status==='accepted'?'done':request.status==='rejected'?'rejected':'waiting';
		 const stockRequestCard=(request,picking=false)=>`<article class="stock-request-card ${picking?'picking':''}" data-stock-request="${safe(request.id)}"><div class="stock-request-main"><b>${picking?'Đang lấy hàng':'Xin hàng'} ${safe(request.supplierName||'NCC')}</b><span>${number(request.lines?.length||0)} mã · gửi ${date(request.createdAt)}${request.respondedAt?' · phản hồi '+date(request.respondedAt):''}</span><small>${(request.lines||[]).map(line=>`${safe(line.sku)} x ${number(line.quantity)}${line.ticketNumber?' / '+safe(line.ticketNumber):''}`).join(' · ')}</small></div><span class="order-status ${stockRequestStatusClass(request)}">${stockRequestStatus(request)}</span>${currentUser?.role==='supplier'&&request.status==='pending'?'<div class="stock-request-actions"><button class="primary" data-stock-request-response="accepted" type="button">Đồng ý</button><button class="danger-action" data-stock-request-response="rejected" type="button">Từ chối</button></div>':''}</article>`;
		 const stockRequestPanel=()=>{
		  const visible=stockRequests.filter(request=>currentUser?.role==='manager'||currentUser?.role==='employee'||request.status==='pending').slice(0,20);
		  if(!visible.length)return '';
		  const requests=visible.filter(request=>request.status!=='accepted');
		  if(!requests.length)return '';
		  return `<section class="stock-requests-panel"><div class="stock-requests-head"><div><span>Xin hàng</span><b>${number(requests.filter(request=>request.status==='pending').length)} đang chờ</b></div><strong>${number(requests.length)} yêu cầu</strong></div>${requests.map(request=>stockRequestCard(request)).join('')}</section>`;
		 };
	 const normalizeSearch=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
	 const productStats=()=>{
	  const map=new Map(),pricesHidden=currentUser?.role==='employee';
	  for(const order of planOrders()){
	   if(order.receivedAt)continue;
	   for(const row of stockRows(order)){
	    const sku=String(row.sku||'').trim()||'NO-SKU',key=sku.toLowerCase(),quantity=Number(row.quantity||0),lineTotal=Number(row.lineTotal||0),due=isoDate(row.promisedDate||order.arrivalDate);
	    const remaining=remainingRowQuantity(order,row);
	    if(remaining<=0)continue;
	    const remainingLineTotal=quantity>0?lineTotal*remaining/quantity:lineTotal;
	    const current=map.get(key)||{key,sku,name:row.name||'',orders:new Map(),quantity:0,total:0,dates:[],lines:[]};
	    if(!current.name&&row.name)current.name=row.name;
	    current.quantity+=remaining;
	    current.total+=remainingLineTotal;
	    if(due)current.dates.push(due);
	    current.orders.set(order.id||order.ticketNumber||Math.random(),true);
	    current.lines.push({order,row,quantity:remaining,lineTotal:remainingLineTotal,due});
	    map.set(key,current);
	   }
	  }
	  const skuNeedle=normalizeSearch(productStatsFilters.sku),nameNeedle=normalizeSearch(productStatsFilters.name);
	  return [...map.values()].filter(item=>(!skuNeedle||normalizeSearch(item.sku).includes(skuNeedle))&&(!nameNeedle||normalizeSearch(item.name).includes(nameNeedle))).sort((a,b)=>b.total-a.total||b.quantity-a.quantity||a.sku.localeCompare(b.sku,'vi')).map(item=>({...item,orderCount:item.orders.size,firstDate:item.dates.sort()[0]||'',latestDate:item.dates.sort().at(-1)||'',totalLabel:pricesHidden?'Ẩn giá':money(item.total)}));
	 };
	 const productStatsDetail=item=>{
	  const pricesHidden=currentUser?.role==='employee';
	  const lines=[...item.lines].sort((a,b)=>(a.due||'9999-12-31').localeCompare(b.due||'9999-12-31')||String(a.order.ticketNumber||'').localeCompare(String(b.order.ticketNumber||''),'vi'));
	  return `<tr class="product-detail-row"><td colspan="7"><div class="product-detail-box"><div class="product-detail-title"><b>${safe(item.sku)}</b><span>${number(lines.length)} dòng đặt hàng</span></div><div class="table-wrap product-detail-table"><table><thead><tr><th>Số đơn NCC</th><th>Số phiếu NCC</th><th>SL</th><th>Ngày về hàng</th><th>Trạng thái</th><th class="money">Giá trị</th></tr></thead><tbody>${lines.map(({order,quantity,lineTotal,due})=>`<tr><td><button class="link-button" data-product-scroll-order="${safe(order.id)}" type="button">${safe(order.ticketNumber||'Đơn NCC')}</button><small>${safe(order.quoteNumber||'')}</small></td><td>${safe(order.supplierInternalOrderNumber||'—')}</td><td><b>${number(quantity)}</b></td><td>${date(due||order.arrivalDate)}</td><td><span class="order-status ${order.supplierStatus==='confirmed'?'done':'waiting'}">${statusLabel(order)}</span></td><td class="money">${pricesHidden?'Ẩn giá':money(lineTotal)}</td></tr>`).join('')}</tbody></table></div></div></td></tr>`;
	 };
	 const productStatsSummary=rows=>{
	  const pricesHidden=currentUser?.role==='employee',totalValue=pricesHidden?0:rows.reduce((sum,item)=>sum+item.total,0),totalQty=rows.reduce((sum,item)=>sum+item.quantity,0);
	  return `${number(rows.length)} mã · ${number(totalQty)} sản phẩm${pricesHidden?'':' · '+money(totalValue)}`;
	 };
	 const productStatsRowsHtml=rows=>rows.length?rows.map(item=>`<tr class="product-row ${selectedProductKey===item.key?'active':''}" data-product-key="${safe(item.key)}"><td><button class="link-button" data-select-product="${safe(item.key)}" type="button"><b>${safe(item.sku)}</b></button></td><td class="product-name"><b>${safe(item.name||'Chưa có tên')}</b></td><td>${number(item.orderCount)}</td><td><b>${number(item.quantity)}</b></td><td>${date(item.firstDate)}</td><td>${item.firstDate&&item.latestDate&&item.firstDate!==item.latestDate?`${date(item.firstDate)} - ${date(item.latestDate)}`:date(item.latestDate||item.firstDate)}</td><td class="money"><b>${safe(item.totalLabel)}</b></td></tr>${selectedProductKey===item.key?productStatsDetail(item):''}`).join(''):'<tr><td colspan="7"><div class="empty compact-empty">Không tìm thấy mã hàng phù hợp.</div></td></tr>';
	 const productStatsView=()=>{
	  const rows=productStats();
	  if(selectedProductKey&&!rows.some(item=>item.key===selectedProductKey))selectedProductKey='';
		  return `<section class="product-stats-view"><div class="product-stats-head"><div><span>Thống kê chi tiết theo sản phẩm</span><b id="productStatsSummary">${safe(productStatsSummary(rows))}</b></div><button class="secondary-action" data-close-product-stats type="button">Đóng</button></div><div class="product-stats-filters">${planScopePicker()}<label>Mã hàng<input id="productStatsSku" value="${safe(productStatsFilters.sku)}" maxlength="80" placeholder="Nhập SKU"></label><label>Tên hàng<input id="productStatsName" value="${safe(productStatsFilters.name)}" maxlength="160" placeholder="Nhập tên sản phẩm"></label><button class="secondary-action" data-open-order-search type="button">Tìm đơn</button><button class="secondary-action" data-clear-product-stats type="button">Xóa lọc</button></div><div class="table-wrap product-stats-table"><table><thead><tr><th>Mã hàng</th><th>Tên sản phẩm</th><th>Số đơn</th><th>Tổng SL</th><th>Ngày về gần nhất</th><th>Khoảng ngày về</th><th class="money">Tổng giá trị</th></tr></thead><tbody id="productStatsRows">${productStatsRowsHtml(rows)}</tbody></table></div></section>`;
	 };
	 const closeProductStatsDialog=()=>{showProductStats=false;$('#productStatsDialog')?.close();renderOrders();};
	 const syncProductStatsDialog=()=>{
	  const dialog=$('#productStatsDialog'),body=$('#productStatsDialogBody');
	  if(!dialog||!body)return;
	  if(!showProductStats){
	   if(dialog.open)dialog.close();
	   body.innerHTML='';
	   return;
	  }
	  const active=document.activeElement,activeId=active?.id,selectionStart=typeof active?.selectionStart==='number'?active.selectionStart:null,selectionEnd=typeof active?.selectionEnd==='number'?active.selectionEnd:null;
	  body.innerHTML=productStatsView();bindPlanScope(body);
	  const bindProductStatsRows=()=>{
	   body.querySelectorAll('[data-select-product]').forEach(button=>button.onclick=()=>{selectedProductKey=selectedProductKey===button.dataset.selectProduct?'':button.dataset.selectProduct||'';refreshProductStatsResults();});
	   body.querySelectorAll('[data-product-scroll-order]').forEach(button=>button.onclick=()=>{showProductStats=false;dialog.close();selectedOrderId=button.dataset.productScrollOrder||'';activeTab=allOrders.find(o=>o.id===selectedOrderId)?.supplierStatus==='confirmed'?'confirmed':'pending';if(selectedOrderId){deepLinkConsumed=true;history.replaceState(null,'',`#order=${encodeURIComponent(selectedOrderId)}`);}renderOrders();requestAnimationFrame(()=>$('#orders .order-card')?.scrollIntoView({behavior:'smooth',block:'start'}));});
	  };
	  const refreshProductStatsResults=()=>{
	   const rows=productStats();
	   if(selectedProductKey&&!rows.some(item=>item.key===selectedProductKey))selectedProductKey='';
	   const summary=body.querySelector('#productStatsSummary'),tbody=body.querySelector('#productStatsRows');
	   if(summary)summary.textContent=productStatsSummary(rows);
	   if(tbody)tbody.innerHTML=productStatsRowsHtml(rows);
	   bindProductStatsRows();
	  };
	  body.querySelector('[data-close-product-stats]')?.addEventListener('click',closeProductStatsDialog);
	  body.querySelector('[data-open-order-search]')?.addEventListener('click',()=>{showProductStats=false;dialog.close();renderOrders();requestAnimationFrame(openOrderSearchDialog);});
	  body.querySelector('[data-clear-product-stats]')?.addEventListener('click',()=>{productStatsFilters={sku:'',name:''};selectedProductKey='';if(skuInput)skuInput.value='';if(nameInput)nameInput.value='';refreshProductStatsResults();skuInput?.focus();});
	  const scheduleProductStatsFilter=()=>{
	   clearTimeout(productStatsFilterTimer);
	   productStatsFilterTimer=setTimeout(()=>{selectedProductKey='';refreshProductStatsResults();},5);
	  };
	  const skuInput=$('#productStatsSku'),nameInput=$('#productStatsName');
	  if(skuInput)skuInput.oninput=()=>{productStatsFilters.sku=skuInput.value;scheduleProductStatsFilter();};
	  if(nameInput)nameInput.oninput=()=>{productStatsFilters.name=nameInput.value;scheduleProductStatsFilter();};
	  bindProductStatsRows();
	  if(!dialog.open)dialog.showModal();
	  if(activeId&&['productStatsSku','productStatsName'].includes(activeId)){
	   const next=$(`#${activeId}`);
	   if(next){next.focus();if(selectionStart!==null&&selectionEnd!==null)next.setSelectionRange(selectionStart,selectionEnd);}
	  }
	 };
		 const applyOrderFilters=()=>{orderFilters={...orderFilterDraft};selectedOrderId='';clearOrderHash();renderOrders();};
		 const stockRequestRows=()=>allOrders.filter(order=>order.approvalStatus==='approved'&&order.supplierStatus==='confirmed'&&!order.receivedAt).flatMap(order=>stockRows(order).map(row=>({order,row:{...row,quantity:remainingRowQuantity(order,row)}})).filter(({row})=>Number(row.quantity)>0));
		 const stockRequestGroups=()=>{
		  const groups=new Map();
		  for(const {order,row} of stockRequestRows()){
		   const supplierKey=String(order.supplierEmail||order.supplierName||'').trim().toLowerCase(),sku=String(row.sku||'').trim()||'NO-SKU',key=`${supplierKey}|${sku.toLowerCase()}`;
		   const current=groups.get(key)||{key,sku,name:row.name||'',supplierName:order.supplierName||'NCC',supplierKey,totalQuantity:0,lines:[]};
		   current.totalQuantity+=Number(row.quantity||0);
		   current.lines.push({order,row});
		   if(!current.name&&row.name)current.name=row.name;
		   groups.set(key,current);
		  }
		  return [...groups.values()].sort((a,b)=>a.supplierName.localeCompare(b.supplierName,'vi')||a.sku.localeCompare(b.sku,'vi'));
		 };
		 const openStockRequestDialog=()=>{
		  const dialog=$('#stockRequestDialog'),body=$('#stockRequestBody'),message=$('#stockRequestMessage');
		  if(!dialog||!body)return;
		  const groups=stockRequestGroups();
		  message.textContent='';
		  body.innerHTML=groups.length?`<div class="stock-request-intro"><span>Chọn mã hàng từ các đơn đã đặt</span><b>Một lần gửi chỉ chọn các mã cùng NCC</b></div><div class="stock-request-groups">${groups.map(group=>`<section class="stock-request-group" data-stock-request-group><div class="stock-request-group-head"><label><input type="checkbox" data-stock-request-group-check><span class="stock-request-product"><b>${safe(group.sku)}</b><small>${safe(group.name||'Chưa có tên')}</small><em>${safe(group.supplierName)} · ${number(group.lines.length)} đơn</em></span></label><strong>Tổng SL ${number(group.totalQuantity)}</strong><button class="secondary-action" data-stock-request-expand type="button" aria-expanded="false">Xem đơn</button></div><div class="stock-request-group-lines" hidden>${group.lines.map(({order,row})=>`<label class="stock-request-row"><input type="checkbox" data-stock-request-row data-order-id="${safe(order.id)}" data-sku="${safe(row.sku)}"><span class="stock-request-product"><b>${safe(order.ticketNumber||'Đơn NCC')}</b><small>${internalOrder(order.supplierInternalOrderNumber)}</small><em>${date(row.promisedDate||order.arrivalDate)} · ${safe(row.name||'')}</em></span><span class="ready-qty-field"><small>SL xin</small><input type="number" data-stock-request-qty min="1" max="${safe(row.quantity)}" step="1" value="${safe(row.quantity)}" inputmode="numeric"></span><em>Tối đa ${number(row.quantity)}</em></label>`).join('')}</div></section>`).join('')}</div>`:'<div class="empty compact-empty">Chưa có mã hàng NCC nào để xin.</div>';
		  const syncGroup=group=>{
		   const checks=[...group.querySelectorAll('[data-stock-request-row]')],groupCheck=group.querySelector('[data-stock-request-group-check]'),checked=checks.filter(input=>input.checked).length;
		   if(groupCheck){groupCheck.checked=checked>0&&checked===checks.length;groupCheck.indeterminate=checked>0&&checked<checks.length;}
		  };
		  body.querySelectorAll('[data-stock-request-expand]').forEach(button=>button.onclick=()=>{const group=button.closest('[data-stock-request-group]'),lines=group?.querySelector('.stock-request-group-lines');if(!lines)return;lines.hidden=!lines.hidden;button.textContent=lines.hidden?'Xem đơn':'Ẩn đơn';button.setAttribute('aria-expanded',lines.hidden?'false':'true');});
		  body.querySelectorAll('[data-stock-request-group-check]').forEach(input=>input.onchange=()=>{const group=input.closest('[data-stock-request-group]'),lines=group?.querySelector('.stock-request-group-lines');group?.querySelectorAll('[data-stock-request-row]').forEach(child=>child.checked=input.checked);if(input.checked&&lines?.hidden){lines.hidden=false;const button=group.querySelector('[data-stock-request-expand]');if(button){button.textContent='Ẩn đơn';button.setAttribute('aria-expanded','true');}}syncGroup(group);});
		  body.querySelectorAll('[data-stock-request-row]').forEach(input=>input.onchange=()=>syncGroup(input.closest('[data-stock-request-group]')));
		  dialog.showModal();
		 };
		 const stockRequestPayload=()=>({rows:[...$('#stockRequestBody').querySelectorAll('[data-stock-request-row]:checked')].map(input=>{const row=input.closest('.stock-request-row');return {orderId:input.dataset.orderId,sku:input.dataset.sku,quantity:Number(row.querySelector('[data-stock-request-qty]').value)};})});
		 async function submitStockRequest(){
		  const dialog=$('#stockRequestDialog'),message=$('#stockRequestMessage'),button=$('#stockRequestForm [type=submit]'),payload=stockRequestPayload();
		  if(!payload.rows.length){message.textContent='Chọn ít nhất 1 mã hàng để xin NCC.';return;}
		  if(payload.rows.some(row=>!row.orderId||!row.sku||!Number.isFinite(row.quantity)||row.quantity<=0)){message.textContent='Số lượng xin hàng phải lớn hơn 0.';return;}
		  button.disabled=true;message.textContent='Đang gửi yêu cầu xin hàng…';
		  try{
		   const result=await api('/supplier-stock-requests','POST',payload);
		   stockRequests=[result.request,...stockRequests];
		   dialog.close();
		   renderOrders();
		  }catch(error){message.textContent=error.message||'Chưa gửi được yêu cầu xin hàng.';button.disabled=false;}
		 }
		 async function respondStockRequest(id,status,button){
		  if(!id||!status||!button)return;
		  button.disabled=true;
		  try{
		   const result=await api(`/supplier-stock-requests/${encodeURIComponent(id)}/respond`,'POST',{decision:status});
		   stockRequests=stockRequests.map(request=>request.id===id?result.request:request);
		   renderOrders();
		  }catch(error){alert(error.message||'Chưa phản hồi được yêu cầu xin hàng.');button.disabled=false;}
		 }
		 const calendarRangeLabel=value=>{
  if(calendarView==='day')return date(isoDate(value));
  if(calendarView==='week'){
   const start=startOfWeek(value),end=addDays(start,6);
   return `${date(isoDate(start))} - ${date(isoDate(end))}`;
  }
  return monthName(value);
 };
 const progressPanel=order=>{const rows=stockRows(order);return `<section class="supplier-progress-panel"><h3>Tiến độ giao &amp; nhận hàng</h3><p>${order.supplierStatus==='confirmed'?'NCC đã xác nhận đơn hàng':'Đơn dự kiến — chờ NCC xác nhận'} · Đã giao lấy từ phiếu giao được xác nhận; đã nhận lấy từ phiếu nhập kho.</p><div class="table-wrap"><table><thead><tr><th>Mã hàng</th><th>SL đặt</th><th>Đã giao</th><th>Kho đã nhận</th><th>Chờ nhận</th><th>NCC còn thiếu</th></tr></thead><tbody>${rows.map(r=>{const p=lineProgress(order,r);return `<tr><td><b>${safe(r.sku)}</b><small>${safe(r.name)}</small></td><td>${number(p.ordered)}</td><td>${number(p.delivered)}</td><td>${number(p.received)}</td><td>${number(p.awaitingReceipt)}</td><td>${number(p.remaining)}</td></tr>`;}).join('')}</tbody></table></div>${order.receiptHistory?.length?`<details><summary>Lịch sử nhập kho (${number(order.receiptHistory.length)} đợt)</summary>${order.receiptHistory.map(r=>`<p>${safe(r.ticketNumber)} · ${date(r.receivedAt)} · ${safe(r.warehouse)}</p>`).join('')}</details>`:''}</section>`;};
 const quoteLinkPanel=order=>{if(currentUser?.role==='supplier')return '';const q=order.quoteLink;if(!q)return `<p class="supplier-link-note">Báo giá nguồn: ${safe(order.quoteNumber||'Chưa liên kết')} · Chưa tìm thấy báo giá trong phạm vi tài khoản.</p>`;const delayed=stockRows(order).filter(r=>{const due=(q.rows||[]).find(x=>String(x.sku).toLowerCase()===String(r.sku).toLowerCase())?.deliveryDate||q.deliveryDate;return remainingRowQuantity(order,r)>0&&due&&isoDate(r.promisedDate||order.arrivalDate)>isoDate(due);});return `<section class="supplier-quote-link"><a href="/quote?quoteId=${encodeURIComponent(q.id)}">${safe(q.contractNumber?'HĐKT '+q.contractNumber:'Báo giá '+order.quoteNumber)} ↗</a><span>${safe(q.customer)}</span>${delayed.length?`<p role="status" class="supplier-warning">${number(delayed.length)} mã có ngày NCC hẹn giao sau hạn giao khách. Mở báo giá để kiểm tra.</p>`:''}</section>`;};
 const supplierAlertsPanel=()=>{const today=todayIso(),rows=[];for(const order of allOrders){if(order.receivedAt)continue;if(order.supplierStatus!=='confirmed'){rows.push({order,label:'Chưa được NCC xác nhận',kind:'pending'});continue;}const outstanding=stockRows(order).filter(r=>remainingRowQuantity(order,r)>0),late=outstanding.filter(r=>isoDate(r.promisedDate||order.arrivalDate)&&isoDate(r.promisedDate||order.arrivalDate)<today),due=outstanding.filter(r=>isoDate(r.promisedDate||order.arrivalDate)===today),waiting=stockRows(order).filter(r=>lineProgress(order,r).awaitingReceipt>0);if(late.length)rows.push({order,label:number(late.length)+' mã trễ hẹn, còn thiếu '+number(late.reduce((sum,r)=>sum+remainingRowQuantity(order,r),0)),kind:'late'});else if(due.length)rows.push({order,label:number(due.length)+' mã cần giao hôm nay',kind:'today'});if(waiting.length)rows.push({order,label:number(waiting.length)+' mã NCC đã giao, kho chưa nhận đủ',kind:'receipt'});}rows.sort((a,b)=>(a.kind==='late'?0:1)-(b.kind==='late'?0:1));return `<section class="supplier-alerts-panel"><h2>Việc cần xử lý <small>${number(rows.length)} cảnh báo</small></h2>${rows.length?rows.map(({order,label,kind})=>`<button type="button" class="supplier-alert ${kind}" data-alert-order="${safe(order.id)}"><strong>${safe(order.ticketNumber)}</strong><span>${safe(label)}</span><b>Xem đơn →</b></button>`).join(''):'<p>Không có đơn cần xử lý.</p>'}</section>`;};
 const orderHtml=order=>{
  const pending=order.supplierStatus!=='confirmed';
  const depositStatus=order.depositPaidAt?`<em>Đã cọc ${hidePrices(order)?'Ẩn giá':money(order.depositPaidAmount)} · còn lại ${hidePrices(order)?'Ẩn giá':money(order.remainingAmount)}</em>`:order.depositRequestedAt?'<em>Đã yêu cầu thanh toán</em>':'';
  return `<article class="order-card" data-order-id="${safe(order.id)}"><div class="order-head"><div><h2>${safe(order.ticketNumber||'Đơn hàng NCC')}</h2><p>${internalOrder(order.supplierInternalOrderNumber)} · ${safe(order.supplierName||'NCC')}</p></div>${orderHeadActions(order,pending)}</div><div class="order-body"><div class="deposit-strip"><span>Thanh toán đơn hàng</span><b>${number(order.depositRate??30)}%</b>${depositStatus}</div><div class="order-meta"><span>Ngày gửi NCC<b>${date(order.sentAt)}</b></span><span>Ngày hẹn giao<b>${date(order.arrivalDate)}</b></span><span>Kho nhận<b>${safe(order.warehouse||'—')}</b></span>${internalMeta(order,pending)}<span>Số dòng hàng<b>${number(stockRows(order).length)}</b></span></div>${quoteLinkPanel(order)}${progressPanel(order)}${pending?pendingOrderBody(order):confirmedOrderBody(order)}</div></article>`;
 };
 const confirmedOrderBody=order=>hidePrices(order)?`${orderTableTools(order)}<div class="table-wrap"><table><thead><tr><th>SKU</th><th>Sản phẩm</th><th>SL</th><th>Ngày hẹn giao</th></tr></thead><tbody>${(order.rows||[]).map(row=>rowHtml(row,order)).join('')}</tbody></table></div><p class="order-message" role="status"></p>${signatureReady(order)?`<div class="signature-gate">${signatureStatus(order)}</div>`:''}${supplierPackingPanel(order)}`:`${orderTableTools(order)}<div class="table-wrap"><table><thead><tr><th>SKU</th><th>Sản phẩm</th><th>SL</th><th class="money">Đơn giá</th><th class="money">Giá sau CK</th><th class="money">Thành tiền</th></tr></thead><tbody>${(order.rows||[]).map(row=>rowHtml(row,order)).join('')}</tbody></table></div><p class="order-message" role="status"></p>${signatureReady(order)?`<div class="signature-gate">${signatureStatus(order)}</div>`:''}${orderTotal(order)}${supplierPackingPanel(order)}`;
 const orderTotal=order=>hidePrices(order)?'':`<div class="order-total"><span>Tạm tính <b>${money(order.subtotal)}</b></span><span>Thuế VAT <b>${money(order.vat)}</b></span><strong>Tổng thanh toán <b>${money(order.total)}</b></strong></div>`;
 const signatureReady=order=>Boolean(order.supplierSignatureUploadedAt||order.supplierSignatureDownloadedAt);
 const signatureStatus=order=>signatureReady(order)?`<a class="signature-ready" href="${signatureFileUrl(order)}" target="_blank" rel="noopener noreferrer">Đã upload bản ký: ${date(order.supplierSignatureUploadedAt||order.supplierSignatureDownloadedAt)}${order.supplierSignatureFile?.name?` · ${safe(order.supplierSignatureFile.name)}`:''}</a>`:'<span class="signature-warning">Upload ảnh hoặc file bản ký xác nhận trước khi bấm Xác nhận.</span>';
 const depositRequestAction=order=>order.depositPaidAt?'':`<button class="secondary-action" data-deposit-request type="button" ${order.depositRequestedAt?'disabled':''}>${order.depositRequestedAt?'Đã yêu cầu thanh toán':'Yêu cầu thanh toán'}</button>`;
 const pendingOrderBody=order=>!canActOnOrder()?confirmedOrderBody(order):`<div class="supplier-confirm-note">Tick xác nhận từng mã hàng. NCC có thể chỉnh CK nhập và ngày hẹn giao theo từng mã.</div>${orderTableTools(order,true)}<div class="table-wrap confirm-wrap"><table><thead><tr><th>Mã hàng / sản phẩm</th><th>Ghi chú</th><th>SL</th><th>CK nhập</th><th>Ngày hẹn giao</th></tr></thead><tbody>${(order.rows||[]).map(pendingRow).join('')}</tbody></table></div><p class="order-message" role="status"></p><div class="signature-gate">${signatureStatus(order)}</div><div class="order-actions"><button class="secondary-action" data-upload-signature type="button">${signatureReady(order)?'Upload lại bản ký':'Upload ảnh/file ký'}</button>${signatureReady(order)?'<button class="secondary-action danger" data-delete-signature type="button">Xóa bản ký</button>':''}${depositRequestAction(order)}<button class="primary" data-confirm-order type="button" ${signatureReady(order)?'':'disabled title="Upload bản ký xác nhận trước"'}>Xác nhận</button></div>${orderTotal(order)}${supplierPackingPanel(order)}`;
 const deliveryDashboard=()=>{
  const grouped=new Map();
  let itemCount=0;
  for(const order of planOrders())for(const original of stockRows(order)){
   const remaining=remainingRowQuantity(order,original);if(remaining<=0)continue;const row={...original,quantity:remaining};
   const key=isoDate(row.promisedDate||order.arrivalDate);
   if(!key)continue;
   if(!grouped.has(key))grouped.set(key,[]);
   grouped.get(key).push({order,row});
   itemCount++;
  }
  const todayKey=todayIso();
  const sortItems=items=>[...items].sort((a,b)=>calendarGroup==='ticket'?String(a.order.ticketNumber||'').localeCompare(String(b.order.ticketNumber||''),'vi'):String(a.row.sku||'').localeCompare(String(b.row.sku||''),'vi'));
  const ticketItems=items=>{
   const byTicket=new Map();
   for(const item of items){
    const key=item.order.id||item.order.ticketNumber||Math.random();
    const current=byTicket.get(key)||{order:item.order,rows:[],quantity:0};
    current.rows.push(item.row);
    current.quantity+=Number(item.row.quantity||0);
    byTicket.set(key,current);
   }
   return [...byTicket.values()].sort((a,b)=>String(a.order.ticketNumber||'').localeCompare(String(b.order.ticketNumber||''),'vi'));
  };
  const pill=item=>{
   if(calendarGroup==='ticket'){
    const {order,rows,quantity}=item;
    return `<button class="calendar-pill ticket-pill ${order.supplierStatus==='confirmed'?'confirmed':order.depositRequestedAt?'deposit':'pending'}" data-scroll-order="${safe(order.id)}" type="button" title="${safe(order.ticketNumber||'Đơn NCC')} · ${number(rows.length)} mã · SL ${number(quantity)}"><b>${safe(order.ticketNumber||'Đơn NCC')}</b><small>${order.supplierStatus==='confirmed'?'Đã xác nhận':'Dự kiến'} · ${number(rows.length)} mã · SL ${number(quantity)}</small></button>`;
   }
   const {order,row}=item;
   return `<button class="calendar-pill sku-pill ${order.supplierStatus==='confirmed'?'confirmed':order.depositRequestedAt?'deposit':'pending'}" data-scroll-order="${safe(order.id)}" type="button" title="${safe(order.ticketNumber||'Đơn NCC')} · ${safe(row.sku)} · SL ${number(row.quantity)}"><b>${safe(row.sku||'Mã hàng')}</b><small>${number(row.quantity)} · CK ${number(row.purchaseDiscount)}%</small></button>`;
  };
  const dayCell=(value,extraClass='')=>{
   const key=isoDate(value),source=grouped.get(key)||[],items=calendarGroup==='ticket'?ticketItems(source):sortItems(source);
   return `<div class="calendar-day ${key===todayKey?'today':''} ${extraClass}"><span class="day-number">${String(value.getDate()).padStart(2,'0')}</span><div class="calendar-items">${items.length?items.map(pill).join(''):'<span class="no-items"></span>'}</div></div>`;
  };
  const year=calendarCursor.getFullYear(),month=calendarCursor.getMonth();
  let calendarBody='';
  if(calendarView==='day'){
   calendarBody=`<div class="delivery-calendar single-day">${dayCell(calendarCursor,'focus-day')}</div>`;
  }else if(calendarView==='week'){
   const start=startOfWeek(calendarCursor),days=Array.from({length:7},(_,index)=>addDays(start,index));
   calendarBody=`<div class="calendar-weekdays"><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span></div><div class="delivery-calendar week-view">${days.map(day=>dayCell(day)).join('')}</div>`;
  }else{
   const first=new Date(year,month,1),last=new Date(year,month+1,0),startOffset=(first.getDay()+6)%7,cells=[];
   for(let index=0;index<startOffset;index++)cells.push('<div class="calendar-day blank"></div>');
   for(let day=1;day<=last.getDate();day++)cells.push(dayCell(new Date(year,month,day)));
   while(cells.length%7)cells.push('<div class="calendar-day blank"></div>');
   calendarBody=`<div class="calendar-weekdays"><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span></div><div class="delivery-calendar month-view">${cells.join('')}</div>`;
  }
	  return `<section class="delivery-dashboard app-calendar"><div class="calendar-popup-head"><div><span>Lịch giao hàng NCC</span><b>${safe(calendarRangeLabel(calendarCursor))}</b></div><button class="secondary-action" data-close-calendar type="button">Đóng</button></div>${planScopePicker()}<div class="calendar-tabs"><button class="${calendarView==='day'?'active':''}" data-calendar-view="day" type="button">Day</button><button class="${calendarView==='week'?'active':''}" data-calendar-view="week" type="button">Week</button><button class="${calendarView==='month'?'active':''}" data-calendar-view="month" type="button">Month</button><button data-calendar-today type="button">Today</button></div><div class="calendar-group-tabs" aria-label="Kiểu xem lịch"><button class="${calendarGroup==='ticket'?'active':''}" data-calendar-group="ticket" type="button">Theo số phiếu</button><button class="${calendarGroup==='sku'?'active':''}" data-calendar-group="sku" type="button">Theo mã hàng</button></div><div class="calendar-toolbar"><button data-calendar-prev type="button" aria-label="Kỳ trước">‹</button><strong>${safe(calendarRangeLabel(calendarCursor))}</strong><button data-calendar-next type="button" aria-label="Kỳ sau">›</button></div>${calendarBody}<div class="calendar-legend"><span><i class="pending"></i>Đợi duyệt</span><span><i class="deposit"></i>Yêu cầu cọc</span><span><i class="confirmed"></i>Đã duyệt</span><b>${calendarGroup==='ticket'?'Đang xem theo số phiếu':'Đang xem theo mã hàng'} · ${number(itemCount)} mã hàng</b></div></section>`;
	 };
	 const closeCalendarDialog=()=>{showCalendar=false;$('#calendarDialog')?.close();renderOrders();};
	 const syncCalendarDialog=()=>{
	  const dialog=$('#calendarDialog'),body=$('#calendarDialogBody');
	  if(!dialog||!body)return;
	  if(!showCalendar){
	   if(dialog.open)dialog.close();
	   body.innerHTML='';
	   return;
	  }
	  body.innerHTML=deliveryDashboard();bindPlanScope(body);
	  body.querySelector('[data-close-calendar]')?.addEventListener('click',closeCalendarDialog);
	  body.querySelectorAll('[data-calendar-view]').forEach(button=>button.onclick=()=>{calendarView=button.dataset.calendarView;syncCalendarDialog();});
	  body.querySelectorAll('[data-calendar-group]').forEach(button=>button.onclick=()=>{calendarGroup=button.dataset.calendarGroup;syncCalendarDialog();});
	  body.querySelector('[data-calendar-prev]')?.addEventListener('click',()=>{calendarCursor=calendarView==='day'?addDays(calendarCursor,-1):calendarView==='week'?addDays(calendarCursor,-7):new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);syncCalendarDialog();});
	  body.querySelector('[data-calendar-next]')?.addEventListener('click',()=>{calendarCursor=calendarView==='day'?addDays(calendarCursor,1):calendarView==='week'?addDays(calendarCursor,7):new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);syncCalendarDialog();});
	  body.querySelector('[data-calendar-today]')?.addEventListener('click',()=>{calendarCursor=new Date();syncCalendarDialog();});
	  body.querySelectorAll('[data-scroll-order]').forEach(button=>button.onclick=()=>{showCalendar=false;dialog.close();selectedOrderId=button.dataset.scrollOrder||'';activeTab=allOrders.find(o=>o.id===selectedOrderId)?.supplierStatus==='confirmed'?'confirmed':'pending';if(selectedOrderId){deepLinkConsumed=true;history.replaceState(null,'',`#order=${encodeURIComponent(selectedOrderId)}`);}renderOrders();requestAnimationFrame(()=>$('#orders .order-card')?.scrollIntoView({behavior:'smooth',block:'start'}));});
	  if(!dialog.open)dialog.showModal();
	 };
	 const pdfFontBytes=async()=>{const response=await fetch('/fonts/DejaVuSans.ttf',{cache:'force-cache'});if(!response.ok)throw Error('Không tải được font PDF.');return response.arrayBuffer();};
	 const wrapPdf=(font,text,size,width)=>{
	  const lines=[];
	  for(const paragraph of String(text??'').split('\n')){
	   let line='';
	   for(const word of paragraph.split(/\s+/).filter(Boolean)){
	    const next=line?`${line} ${word}`:word;
	    if(font.widthOfTextAtSize(next,size)<=width){line=next;continue;}
	    if(line)lines.push(line);
	    line=word;
	   }
	   lines.push(line);
	  }
	  return lines.length?lines:[''];
	 };
	 const downloadBlob=(blob,fileName)=>{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=fileName;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);};
	 const deliveryNoteFileDbName='bach-ngan-delivery-note-files-v1',deliveryNoteFileStore='files';
	 const deliveryNoteFileDb=()=>new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(Error('Trình duyệt không hỗ trợ lưu file đã xuất.'));const request=indexedDB.open(deliveryNoteFileDbName,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(deliveryNoteFileStore)){const store=db.createObjectStore(deliveryNoteFileStore,{keyPath:'id'});store.createIndex('createdAt','createdAt');}};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('Không mở được kho file đã xuất.'));});
	 const deliveryNoteFileTx=(mode,callback)=>deliveryNoteFileDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction(deliveryNoteFileStore,mode),store=tx.objectStore(deliveryNoteFileStore),result=callback(store);tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error||Error('Không đọc được kho file đã xuất.'));};}));
	 const saveDeliveryNoteFile=async record=>{await (await import('/r2-export.js')).saveExport(record.blob,record.fileName);await deliveryNoteFileTx('readwrite',store=>store.put(record)).catch(()=>{});};
	 const getDeliveryNoteFile=id=>deliveryNoteFileDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction(deliveryNoteFileStore,'readonly'),request=tx.objectStore(deliveryNoteFileStore).get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();reject(tx.error||Error('Không mở được file đã xuất.'));};}));
	 const deleteDeliveryNoteFile=id=>deliveryNoteFileTx('readwrite',store=>store.delete(id));
	 const listDeliveryNoteFiles=async lines=>{
	  try{
	   const keys=Array.isArray(lines)?new Set(lines.map(item=>item.key)):null;
	   const db=await deliveryNoteFileDb();
	   return await new Promise((resolve,reject)=>{const tx=db.transaction(deliveryNoteFileStore,'readonly'),request=tx.objectStore(deliveryNoteFileStore).getAll();request.onsuccess=()=>{const items=(request.result||[]).filter(item=>!keys||!item.lineKeys?.length||item.lineKeys.some(key=>keys.has(key))).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,25);resolve(items);};request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();reject(tx.error||Error('Không lấy được danh sách file đã xuất.'));};});
	  }catch{return [];}
	 };
	 const deliveryNoteFileLabel=item=>`${date(item.dateKey||item.createdAt)} · ${item.deliveryTime||'--:--'} · ${number(item.lineCount)} dòng · ${item.vehicleNumber||'chưa có số xe'}`;
	 const deliveryNoteFileRows=file=>{
	  if(Array.isArray(file?.lineRows)&&file.lineRows.length)return file.lineRows.map(row=>({orderId:String(row.orderId||''),sku:String(row.sku||''),quantity:Number(row.quantity)||0})).filter(row=>row.orderId&&row.sku&&row.quantity>0);
	  return (file?.lineKeys||[]).map(key=>{
	   const parts=String(key||'').split(':'),orderId=parts[0]==='order'?parts[1]:parts[0]==='request'?parts[2]:'',sku=parts.at(-1)||'',order=allOrders.find(item=>item.id===orderId),row=stockRows(order||{}).find(item=>String(item.sku||'').toLowerCase()===sku.toLowerCase());
	   return {orderId,sku:row?.sku||sku,quantity:row?remainingRowQuantity(order,row):0};
	  }).filter(row=>row.orderId&&row.sku&&row.quantity>0);
	 };
	 const openDeliveryNoteSavedFile=async(id,download=false)=>{
	  const message=$('#deliveryNoteMessage');
	  try{
	   const item=await getDeliveryNoteFile(id);
	   if(!item?.blob)throw Error('Không tìm thấy file đã xuất.');
	   if(download){downloadBlob(item.blob,item.fileName||'phieu-giao-hang.pdf');return;}
	   const url=URL.createObjectURL(item.blob);
	   window.open(url,'_blank','noopener');
	   setTimeout(()=>URL.revokeObjectURL(url),300000);
	  }catch(error){if(message)message.textContent=error.message||'Chưa mở được file đã xuất.';}
	 };
	 const confirmDeliveryNoteDelivered=async id=>{
	  const message=$('#deliveryNoteMessage');
	  try{
	   const file=await getDeliveryNoteFile(id),rows=deliveryNoteFileRows(file);
	   if(!file)throw Error('Không tìm thấy phiếu PDF.');
	   if(file.deliveredAt)throw Error('Phiếu này đã xác nhận giao rồi.');
	   if(!rows.length)throw Error('Phiếu này thiếu dữ liệu dòng hàng, vui lòng xuất lại PDF rồi xác nhận.');
	   if(!confirm('Xác nhận phiếu này đã giao? Hệ thống sẽ trừ số lượng khỏi đơn NCC, đồng thời đưa số phiếu vào Hàng sắp về.'))return;
	   const result=await api('/supplier-delivery-notes/confirm','POST',{deliveryNoteId:file.id||id,fileName:file.fileName||'',ticketNumber:String(file.fileName||'').replace(/\.pdf$/i,''),dateKey:file.dateKey||'',deliveryTime:file.deliveryTime||'',deliveryWarehouse:file.deliveryWarehouse||'',vehicleNumber:file.vehicleNumber||'',contactPerson:file.contactPerson||'',rows});
	   const incoming=result.incomingShipment||null,updated={...file,deliveredAt:result.deliveredAt||new Date().toISOString(),deliveredRows:rows,incomingShipmentId:incoming?.id||file.incomingShipmentId||'',incomingTicketNumber:incoming?.ticketNumber||file.incomingTicketNumber||''};
	   await saveDeliveryNoteFile(updated);
	   if(Array.isArray(result.orders))allOrders=allOrders.map(order=>result.orders.find(item=>item.id===order.id)||order);
	   renderOrders();
	  }catch(error){if(message)message.textContent=error.message||'Chưa xác nhận được phiếu đã giao.';else alert(error.message||'Chưa xác nhận được phiếu đã giao.');}
	 };
	 const confirmDeleteDeliveryNoteFile=async(id,afterDelete)=>{
	  if(!id||!confirm('Xóa phiếu PDF đã xuất này?'))return;
	  const message=$('#deliveryNoteMessage');
	  try{
	   await deleteDeliveryNoteFile(id);
	   if(message)message.textContent='Đã xóa phiếu PDF đã xuất.';
	   if(typeof afterDelete==='function')afterDelete();
	  }catch(error){if(message)message.textContent=error.message||'Chưa xóa được phiếu PDF.';}
	 };
	 const renderDeliveryNoteFileHistory=async lines=>{
	  const host=$('#deliveryNoteHistory');
	  if(!host)return;
	  const files=await listDeliveryNoteFiles(lines);
	  host.innerHTML=files.length?`<div class="delivery-note-history-head"><span>Phiếu đã xuất</span><small>Chọn file cũ để xem lại, tải lại hoặc xóa</small></div><div class="delivery-note-history-tools"><select data-delivery-note-file>${files.map(file=>`<option value="${safe(file.id)}">${safe(deliveryNoteFileLabel(file))}</option>`).join('')}</select><button class="secondary-action" data-delivery-note-open-file type="button">Xem lại</button><button class="secondary-action" data-delivery-note-download-file type="button">Tải lại</button><button class="danger-action" data-delivery-note-delete-file type="button">Xóa phiếu</button></div>`:'';
	  host.querySelector('[data-delivery-note-open-file]')?.addEventListener('click',()=>openDeliveryNoteSavedFile(host.querySelector('[data-delivery-note-file]')?.value));
	  host.querySelector('[data-delivery-note-download-file]')?.addEventListener('click',()=>openDeliveryNoteSavedFile(host.querySelector('[data-delivery-note-file]')?.value,true));
	  host.querySelector('[data-delivery-note-delete-file]')?.addEventListener('click',()=>confirmDeleteDeliveryNoteFile(host.querySelector('[data-delivery-note-file]')?.value,()=>renderDeliveryNoteFileHistory(lines)));
	 };
	 const deliveryNoteFilesPanel=()=>currentUser?.role==='employee'?'':`<section class="delivery-files-panel"><div class="delivery-files-head"><div><span>Nhận hàng</span><b id="deliveryFilesTitle">Đang tải phiếu đã xuất…</b></div><strong id="deliveryFilesCount">—</strong></div><div id="deliveryFilesBody" class="delivery-files-body"><div class="empty compact-empty">Đang tải danh sách phiếu nhận hàng…</div></div></section>`;
	 const syncDeliveryNoteFilePanel=async()=>{
	  const title=$('#deliveryFilesTitle'),count=$('#deliveryFilesCount'),body=$('#deliveryFilesBody');
	  if(!title||!count||!body)return;
	  const files=await listDeliveryNoteFiles(null);
	  count.textContent=`${number(files.length)} phiếu`;
	  title.textContent=files.length?'File PDF đã xuất từ In phiếu giao':'Chưa có phiếu PDF đã xuất';
	  body.innerHTML=files.length?files.map(file=>`<article class="delivery-file-card ${file.deliveredAt?'delivered':''}"><div><b>${safe(file.fileName||'Phiếu nhận hàng')}</b><span>${safe(deliveryNoteFileLabel(file))}${file.deliveredAt?' · Đã giao '+date(file.deliveredAt):''}${file.incomingTicketNumber?' · Hàng sắp về: '+safe(file.incomingTicketNumber):''}</span></div><button class="secondary-action" data-delivery-note-panel-open="${safe(file.id)}" type="button">Xem lại</button><button class="secondary-action" data-delivery-note-panel-download="${safe(file.id)}" type="button">Tải lại</button>${file.deliveredAt?'<span class="order-status done">Đã giao</span>':`<button class="primary" data-delivery-note-panel-delivered="${safe(file.id)}" type="button">Xác nhận đã giao</button>`}<button class="danger-action" data-delivery-note-panel-delete="${safe(file.id)}" type="button">Xóa phiếu</button></article>`).join(''):'<div class="empty compact-empty">Sau khi bấm In phiếu giao → Xuất PDF, file sẽ nằm ở đây để xem lại.</div>';
	  body.querySelectorAll('[data-delivery-note-panel-open]').forEach(button=>button.onclick=()=>openDeliveryNoteSavedFile(button.dataset.deliveryNotePanelOpen));
	  body.querySelectorAll('[data-delivery-note-panel-download]').forEach(button=>button.onclick=()=>openDeliveryNoteSavedFile(button.dataset.deliveryNotePanelDownload,true));
	  body.querySelectorAll('[data-delivery-note-panel-delivered]').forEach(button=>button.onclick=()=>confirmDeliveryNoteDelivered(button.dataset.deliveryNotePanelDelivered));
	  body.querySelectorAll('[data-delivery-note-panel-delete]').forEach(button=>button.onclick=()=>confirmDeleteDeliveryNoteFile(button.dataset.deliveryNotePanelDelete,syncDeliveryNoteFilePanel));
	 };
	 function openDeliveryNoteDialog(){
	  const lines=deliveryNoteAvailableLines(),groups=deliveryNoteLineGroups(lines);
	  deliveryNoteRequest={lines};
	  const dialog=$('#deliveryNoteDialog'),body=$('#deliveryNoteBody'),message=$('#deliveryNoteMessage');
	  if(!dialog||!body)return;
	  message.textContent='';
	  body.innerHTML=`<div class="delivery-note-summary"><span>Phiếu giao hàng</span><b>${number(groups.length)} mã hàng sẵn sàng</b><small>${number(lines.length)} dòng từ đơn NCC và yêu cầu xin hàng đã đồng ý</small></div><div id="deliveryNoteHistory" class="delivery-note-history" aria-live="polite"></div><div class="delivery-note-fields four-fields"><label>Giờ giao<input name="deliveryTime" type="time" required></label><label>Kho giao<select name="deliveryWarehouse"><option selected>Nhà máy</option><option>Minh Sáng</option><option>Minh Đạt</option></select></label><label>Số xe<input name="vehicleNumber" maxlength="80" placeholder="Ví dụ: 65C-12345" autocomplete="off"></label><label>Người liên hệ<input name="contactPerson" maxlength="120" placeholder="Tên / SĐT" autocomplete="off"></label></div><div class="delivery-note-ready-list">${groups.length?groups.map(group=>`<section class="delivery-note-group" data-delivery-note-group><div class="delivery-note-group-head"><label><input type="checkbox" data-delivery-note-group-check><span><b>${safe(group.sku)}</b><small>${safe(group.name||'Chưa có tên')}</small><em>${number(group.lines.length)} dòng · SL ${number(group.quantity)}</em></span></label><button class="secondary-action" data-delivery-note-expand type="button" aria-expanded="false">Xem đơn</button></div><div class="delivery-note-group-lines" hidden>${group.lines.map(item=>`<label class="delivery-note-line"><input type="checkbox" data-delivery-note-line="${safe(item.key)}"><span><b>${safe(item.order?.ticketNumber||'Yêu cầu xin hàng')}</b><small>${item.order?.supplierInternalOrderNumber?`Số phiếu NCC: ${safe(item.order.supplierInternalOrderNumber)} · `:''}${date(item.date)} · ${safe(item.source)}</small></span><strong>${number(item.row.quantity)}</strong></label>`).join('')}</div></section>`).join(''):'<div class="empty compact-empty">Chưa có mã hàng nào được NCC bấm sẵn sàng giao.</div>'}</div>`;
	  renderDeliveryNoteFileHistory(lines);
	  const syncGroup=group=>{const checks=[...group.querySelectorAll('[data-delivery-note-line]')],groupCheck=group.querySelector('[data-delivery-note-group-check]'),checked=checks.filter(input=>input.checked).length;if(groupCheck){groupCheck.checked=checked>0&&checked===checks.length;groupCheck.indeterminate=checked>0&&checked<checks.length;}};
	  body.querySelectorAll('[data-delivery-note-expand]').forEach(button=>button.onclick=()=>{const group=button.closest('[data-delivery-note-group]'),linesEl=group?.querySelector('.delivery-note-group-lines');if(!linesEl)return;linesEl.hidden=!linesEl.hidden;button.textContent=linesEl.hidden?'Xem đơn':'Ẩn đơn';button.setAttribute('aria-expanded',linesEl.hidden?'false':'true');});
	  body.querySelectorAll('[data-delivery-note-group-check]').forEach(input=>input.onchange=()=>{const group=input.closest('[data-delivery-note-group]'),linesEl=group?.querySelector('.delivery-note-group-lines');group?.querySelectorAll('[data-delivery-note-line]').forEach(child=>child.checked=input.checked);if(input.checked&&linesEl?.hidden){linesEl.hidden=false;const button=group.querySelector('[data-delivery-note-expand]');if(button){button.textContent='Ẩn đơn';button.setAttribute('aria-expanded','true');}}syncGroup(group);});
	  body.querySelectorAll('[data-delivery-note-line]').forEach(input=>input.onchange=()=>syncGroup(input.closest('[data-delivery-note-group]')));
	  dialog.showModal();
	  requestAnimationFrame(()=>body.querySelector('[name=deliveryTime]')?.focus());
	 }
	 async function printDeliveryNote(){
	  const form=$('#deliveryNoteForm'),button=form?.querySelector('[type=submit]'),message=$('#deliveryNoteMessage');
	  const selectedKeys=new Set([...$('#deliveryNoteBody').querySelectorAll('[data-delivery-note-line]:checked')].map(input=>input.dataset.deliveryNoteLine));
	  const allRows=(deliveryNoteRequest?.lines||[]).filter(item=>selectedKeys.has(item.key));
	  if(!allRows.length){if(message)message.textContent='Chọn ít nhất 1 mã hàng đã sẵn sàng để in.';return;}
	  const deliveryTime=form?.deliveryTime?.value||'',vehicleNumber=form?.vehicleNumber?.value.trim()||'',deliveryWarehouse=form?.deliveryWarehouse?.value||'Nhà máy',contactPerson=form?.contactPerson?.value.trim()||'';
	  if(!deliveryTime){if(message)message.textContent='Nhập giờ giao trước khi xuất PDF.';return;}
	  const dates=[...new Set(allRows.map(item=>item.date).filter(Boolean))].sort(),dateKey=dates.length===1?dates[0]:'';
	  const old=button.textContent;
	  button.disabled=true;button.textContent='Đang tạo PDF…';
	  try{
	   await loadPdfLib();
	   const {PDFDocument,rgb}=PDFLib,pdf=await PDFDocument.create();
	   pdf.registerFontkit(fontkit);
	   const font=await pdf.embedFont(await pdfFontBytes(),{subset:true}),bold=font;
	   const W=595.28,H=841.89,M=32,line=rgb(.82,.86,.91),navy=rgb(.06,.16,.34),blue=rgb(.13,.35,.66),soft=rgb(.96,.98,1),green=rgb(.05,.48,.27),muted=rgb(.35,.41,.5);
	   let page,y;
	   const text=(value,x,top,opt={})=>page.drawText(String(value??''),{x,y:H-top-(opt.size||9),size:opt.size||9,font:opt.bold?bold:font,color:opt.color||rgb(.08,.12,.18)});
	   const rect=(x,top,w,h,color,border=line)=>page.drawRectangle({x,y:H-top-h,width:w,height:h,color,borderColor:border,borderWidth:.7});
	   const cell=(value,x,top,w,h,opt={})=>{
	    rect(x,top,w,h,opt.fill||rgb(1,1,1),opt.border||line);
	    const size=opt.size||8,lines=wrapPdf(opt.bold?bold:font,value,size,w-8).slice(0,opt.maxLines||4),lh=size+2,start=top+(h-lines.length*lh)/2+1;
	    lines.forEach((row,index)=>{const width=(opt.bold?bold:font).widthOfTextAtSize(row,size),left=opt.align==='right'?x+w-5-width:opt.align==='center'?x+(w-width)/2:x+5;text(row,left,start+index*lh,{size,bold:opt.bold,color:opt.color});});
	   };
	   const newPage=continued=>{
	    page=pdf.addPage([W,H]);y=30;
	    rect(0,0,W,62,soft,soft);
	    text('BÁCH NGÂN / VIGIFTS',M,20,{size:8.5,bold:true,color:blue});
	    text('PHIẾU GIAO HÀNG NCC',M,38,{size:17,bold:true,color:navy});
	    text(continued?'Tiếp theo':'Tổng hợp mã hàng NCC sẵn sàng giao',M,57,{size:7.5,color:muted});
	    text(`Ngày giao: ${dateKey?date(dateKey):'Theo từng dòng'}`,W-176,26,{size:9.5,bold:true,color:green});
	    text(`Giờ giao: ${deliveryTime}`,W-176,44,{size:7.8,bold:true,color:muted});
	    y=72;
	   };
	   const supplierNames=[...new Set(allRows.map(item=>item.supplierName).filter(Boolean))].join(', ')||'NCC';
	   const warehouseNames=[...new Set(allRows.map(item=>item.order?.warehouse).filter(Boolean))].join(', ')||'—';
	   const orderNames=[...new Set(allRows.map(item=>[item.order?.ticketNumber||'',item.order?.supplierInternalOrderNumber?`Số phiếu NCC: ${item.order.supplierInternalOrderNumber}`:''].filter(Boolean).join(' / ')).filter(Boolean))];
	   newPage(false);
	   const info=[['Nhà cung cấp',supplierNames],['Kho nhận',warehouseNames],['Kho giao',deliveryWarehouse],['Số xe',vehicleNumber||'—'],['Người liên hệ',contactPerson||'—'],['Đơn NCC',orderNames.join(' · ')||'—']];
	   const infoW=(W-M*2-8)/2,infoLabel=56,infoH=16;
	   info.forEach(([label,value],index)=>{const col=index%2,row=Math.floor(index/2),x=M+col*(infoW+8),top=y+row*infoH;cell(label,x,top,infoLabel,infoH,{fill:rgb(.97,.98,.99),bold:true,color:muted,size:5.9,maxLines:1});cell(value,x+infoLabel,top,infoW-infoLabel,infoH,{align:'left',size:6.1,maxLines:1});});
	   y+=Math.ceil(info.length/2)*infoH+7;
	   const widths=[22,60,160,30,104,62,93],headers=['STT','Mã hàng','Sản phẩm','SL','Mã đơn','Số phiếu NCC','Ghi chú'];
	   const tableWidth=widths.reduce((sum,w)=>sum+w,0),left=M;
	   const tableHeader=()=>{let x=left;headers.forEach((head,index)=>{cell(head,x,y,widths[index],20,{fill:navy,color:rgb(1,1,1),bold:true,align:'center',size:6.8,border:navy});x+=widths[index];});y+=20;};
	   tableHeader();
	   allRows.forEach(({order,row},index)=>{
	    const height=Math.max(19,Math.min(34,Math.max(wrapPdf(font,row.name||'',6.5,widths[2]-8).length,wrapPdf(font,row.deliveryNoteText||row.supplierNote||'',6.3,widths[6]-8).length)*7.2+6));
	    if(y+height>H-114){newPage(true);tableHeader();}
	    const values=[index+1,row.sku||'',row.name||'',number(row.quantity),order?.ticketNumber||'',order?.supplierInternalOrderNumber||'',row.deliveryNoteText||row.supplierNote||'Giao toàn bộ'];
	    let x=left;values.forEach((value,col)=>{cell(value,x,y,widths[col],height,{size:col===1?7.1:6.5,bold:col===0||col===1||col===3,align:col===0||col===3?'center':'left',maxLines:col===2?3:col===6?3:2});x+=widths[col];});
	    y+=height;
	   });
	   y+=16;
	   if(y+118>H-20)newPage(true);
	   const totalQty=allRows.reduce((sum,{row})=>sum+Number(row.quantity||0),0);
	   text(`Tổng cộng: ${number(allRows.length)} dòng hàng · ${number(totalQty)} sản phẩm`,M,y,{size:10,bold:true,color:navy});
	   const signTop=Math.min(y+34,H-96),signW=(W-M*2-24)/3;
	   ['NCC giao hàng','Kho nhận hàng','Người điều phối'].forEach((label,index)=>{const x=M+index*(signW+12);rect(x,signTop,signW,64,rgb(1,1,1),line);text(label,x+12,signTop+16,{size:9,bold:true,color:navy});text('Ký, ghi rõ họ tên',x+12,signTop+34,{size:7.8,color:muted});});
	   const bytes=await pdf.save(),blob=new Blob([bytes],{type:'application/pdf'}),fileName=`${fileSafe('phieu-giao-'+(dateKey||todayIso())+'-'+allRows.length+'-dong')}.pdf`;
	   await saveDeliveryNoteFile({id:`delivery-note-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,fileName,blob,createdAt:new Date().toISOString(),dateKey:dateKey||todayIso(),deliveryTime,deliveryWarehouse,vehicleNumber,contactPerson,lineCount:allRows.length,totalQty,lineKeys:allRows.map(item=>item.key),lineRows:allRows.map(item=>({key:item.key,orderId:item.order?.id||'',sku:item.row?.sku||'',quantity:Number(item.row?.quantity)||0,source:item.source||''})),supplierNames,orderNames});
	   downloadBlob(blob,fileName);
	   $('#deliveryNoteDialog')?.close();
	  }catch(error){if(message)message.textContent=error.message||'Chưa tạo được phiếu giao PDF.';}
	  finally{button.disabled=false;button.textContent=old;}
	 }
function renderOrders(){
  const linkedOrderId=deepLinkConsumed?'':deepLinkedOrderId(),linkedOrder=linkedOrderId&&allOrders.find(order=>order.id===linkedOrderId);
  if(linkedOrder){
   const linkedTab=linkedOrder.supplierStatus==='confirmed'?'confirmed':'pending';
   selectedOrderId=linkedOrder.id;
   if(activeTab!==linkedTab){activeTab=linkedTab;renderOrders();return;}
   deepLinkConsumed=true;
  }
	  const pending=sortOrdersByDelivery(allOrders.filter(order=>order.supplierStatus!=='confirmed')),confirmed=sortOrdersByDelivery(allOrders.filter(order=>order.supplierStatus==='confirmed')),overdue=sortOrdersByDelivery(allOrders.filter(isOverdue)),baseShown=activeTab==='pending'?pending:activeTab==='confirmed'?confirmed:overdue,shown=sortOrdersByDelivery(filterOrders(baseShown)),pricesHidden=currentUser?.role==='employee',total=pricesHidden?0:allOrders.reduce((sum,order)=>sum+Number(order.total||0),0),units=allOrders.reduce((sum,order)=>sum+stockRows(order).reduce((a,row)=>a+Number(row.quantity||0),0),0);
  if(selectedOrderId&&!shown.some(order=>order.id===selectedOrderId))selectedOrderId='';
  const selectedOrder=selectedOrderId?shown.find(order=>order.id===selectedOrderId):null;
  const emptyText=activeTab==='pending'?'Không có đơn NCC nào đang đợi duyệt.':activeTab==='confirmed'?'Chưa có đơn NCC nào đã được xác nhận.':'Không có đơn NCC quá hạn.';
  updateSupplierConfirmReminder();
	  $('#summary').innerHTML=`<div class="supplier-tabs"><button class="${activeTab==='pending'?'active':''} pending-tab ${pending.length?'has-alert':''}" data-tab="pending" type="button">Đợi duyệt <b>${number(pending.length)}</b></button><button class="${activeTab==='confirmed'?'active':''}" data-tab="confirmed" type="button">Đã duyệt <b>${number(confirmed.length)}</b></button><button class="${activeTab==='overdue'?'active':''} overdue-tab" data-tab="overdue" type="button">Đơn quá hạn <b>${number(overdue.length)}</b></button></div><div class="metric"><span>Đơn đã gửi</span><b>${number(allOrders.length)}</b></div><div class="metric"><span>SL đặt (gồm dự kiến)</span><b>${number(units)}</b></div><div class="metric"><span>Giá trị đặt (gồm dự kiến)</span><b>${pricesHidden?'Ẩn giá':money(total)}</b></div>`;
		  $('#orders').innerHTML=supplierAlertsPanel()+stockRequestPanel()+deliveryNoteFilesPanel()+managerPaymentPanel()+orderList(shown,baseShown.length,emptyText)+(selectedOrder?orderHtml(selectedOrder):'');
	  $('#orders').querySelectorAll('[data-alert-order]').forEach(button=>button.onclick=()=>{const o=allOrders.find(x=>x.id===button.dataset.alertOrder);if(!o)return;activeTab=o.supplierStatus==='confirmed'?'confirmed':'pending';selectedOrderId=o.id;deepLinkConsumed=true;history.replaceState(null,'',`#order=${encodeURIComponent(o.id)}`);renderOrders();requestAnimationFrame(()=>$('#orders .order-card')?.scrollIntoView({behavior:'smooth',block:'start'}));});
  syncDeliveryNoteFilePanel();
	  const calendarToggle=$('#calendarToggle');
	  if(calendarToggle){calendarToggle.textContent=showCalendar?'Ẩn lịch giao':'Xem lịch giao';calendarToggle.setAttribute('aria-expanded',showCalendar?'true':'false');}
	  const productStatsToggle=$('#productStatsToggle');
	  if(productStatsToggle){productStatsToggle.textContent=showProductStats?'Đóng thống kê':'Thống kê sản phẩm';productStatsToggle.setAttribute('aria-expanded',showProductStats?'true':'false');}
	  const stockRequestToggle=$('#stockRequestToggle');
	  if(stockRequestToggle)stockRequestToggle.hidden=!['manager','employee'].includes(currentUser?.role);
	  const deliveryNoteToggle=$('#deliveryNoteToggle');
	  if(deliveryNoteToggle){const count=deliveryNoteAvailableLines().length;deliveryNoteToggle.hidden=currentUser?.role==='employee';deliveryNoteToggle.textContent=count?`In phiếu giao (${number(count)})`:'In phiếu giao';}
	  const orderSearchTop=$('#orderSearchTop');
	  if(orderSearchTop)orderSearchTop.setAttribute('aria-expanded',$('#orderSearchDialog')?.open?'true':'false');
  const searchCount=$('#orderSearchDialogCount');
  if(searchCount)searchCount.textContent=`Đang hiển thị ${number(shown.length)}/${number(baseShown.length)} đơn trong tab hiện tại.`;
	  $('#summary').querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{activeTab=button.dataset.tab;selectedOrderId='';clearOrderHash();renderOrders();});
		  syncProductStatsDialog();
		  syncCalendarDialog();
	  $('#orders').querySelectorAll('[data-select-order]').forEach(button=>button.onclick=()=>{selectedOrderId=button.dataset.selectOrder||'';if(selectedOrderId){deepLinkConsumed=true;history.replaceState(null,'',`#order=${encodeURIComponent(selectedOrderId)}`);}renderOrders();requestAnimationFrame(()=>$('#orders .order-card')?.scrollIntoView({behavior:'smooth',block:'start'}));});
  $('#orders').querySelectorAll('[data-close-order]').forEach(button=>button.onclick=()=>{const closedId=selectedOrderId;selectedOrderId='';deepLinkConsumed=true;clearOrderHash();renderOrders();requestAnimationFrame(()=>{const row=[...$('#orders').querySelectorAll('[data-select-order]')].find(item=>item.dataset.selectOrder===closedId);row?.focus();});});
  $('#orders').querySelectorAll('[data-upload-signature]').forEach(button=>button.onclick=()=>uploadSignatureFile(button.closest('[data-order-id]'),button));
  $('#orders').querySelectorAll('[data-delete-signature]').forEach(button=>button.onclick=()=>deleteSignatureFile(button.closest('[data-order-id]'),button));
  $('#orders').querySelectorAll('[data-deposit-request]').forEach(button=>button.onclick=()=>openDepositConfirm(button.closest('[data-order-id]'),button));
  $('#orders').querySelectorAll('[data-confirm-order]').forEach(button=>button.onclick=()=>confirmOrder(button.closest('[data-order-id]'),button));
  $('#orders').querySelectorAll('[data-delete-order]').forEach(button=>button.onclick=()=>deleteOrder(button.closest('[data-order-id]'),button));
  $('#orders').querySelectorAll('[data-download-order]').forEach(button=>button.onclick=()=>downloadSupplierOrderFile(button.closest('[data-order-id]'),button));
  $('#orders').querySelectorAll('[data-supplier-internal-order]').forEach(input=>{input.dataset.lastSaved=input.value.trim();input.oninput=()=>scheduleInternalOrderSave(input.closest('[data-order-id]'),input);input.onblur=()=>scheduleInternalOrderSave(input.closest('[data-order-id]'),input,0);});
	  $('#orders').querySelectorAll('[data-confirm-check]').forEach(input=>input.onchange=()=>syncDownloadOrderButton(input.closest('[data-order-id]')));
	  $('#orders').querySelectorAll('[data-order-id]').forEach(syncDownloadOrderButton);
	  $('#orders').querySelectorAll('[data-pay-deposit]').forEach(button=>button.onclick=()=>payDeposit(button.closest('[data-payment-request]'),button));
	  $('#orders').querySelectorAll('[data-stock-request-response]').forEach(button=>button.onclick=event=>{event.stopPropagation();respondStockRequest(button.closest('[data-stock-request]')?.dataset.stockRequest,button.dataset.stockRequestResponse,button);});
		  $('#orders').querySelectorAll('[data-delivery-ready]').forEach(button=>button.onclick=event=>{event.stopPropagation();openDeliveryReadyDialog(button.dataset.deliveryReady,button);});
	 $('#orders').querySelectorAll('[data-scroll-order]').forEach(button=>button.onclick=()=>{selectedOrderId=button.dataset.scrollOrder||'';activeTab=allOrders.find(o=>o.id===selectedOrderId)?.supplierStatus==='confirmed'?'confirmed':'pending';if(selectedOrderId){deepLinkConsumed=true;history.replaceState(null,'',`#order=${encodeURIComponent(selectedOrderId)}`);}renderOrders();requestAnimationFrame(()=>$('#orders .order-card')?.scrollIntoView({behavior:'smooth',block:'start'}));});
	  if(linkedOrderId)requestAnimationFrame(()=>{const card=$(`[data-order-id="${CSS.escape(linkedOrderId)}"]`);if(!card)return;card.scrollIntoView({behavior:'smooth',block:'start'});card.classList.add('deep-link-focus');setTimeout(()=>card.classList.remove('deep-link-focus'),2600);});
	 }
		 const todayIso=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(key=>parts.find(p=>p.type===key).value).join('-');};
		 const deliveryReadyRowsHtml=order=>{
		  const selected=new Map((order.supplierDeliveryReadyRows||[]).map(row=>[String(row.sku||'').toLowerCase(),Number(row.quantity||0)]));
			  return stockRows(order).map(row=>{const key=String(row.sku||'').toLowerCase(),chosen=selected.has(key),quantity=chosen?selected.get(key):row.quantity;return `<label class="delivery-ready-row"><input type="checkbox" data-ready-row data-sku="${safe(row.sku)}" ${chosen?'checked':''}><span class="ready-product"><b>${safe(row.sku)}</b><small>${safe(row.name||'')}</small></span><span class="ready-qty-field"><small>SL giao</small><input type="number" data-ready-quantity min="1" max="${safe(row.quantity)}" step="1" value="${safe(quantity)}" inputmode="numeric"></span><em>Tối đa ${number(row.quantity)}</em></label>`;}).join('');
			 };
		 function openDeliveryReadyDialog(id,button){
		  const order=allOrders.find(item=>item.id===id);
		  if(!order||button?.disabled)return;
		  deliveryReadyRequest={id};
		  const dialog=$('#deliveryReadyDialog'),body=$('#deliveryReadyBody'),message=$('#deliveryReadyMessage'),form=$('#deliveryReadyForm');
		  if(!dialog||!body||!form)return;
		  message.textContent='';
		  const partial=order.supplierDeliveryReadyMode==='partial';
			  body.innerHTML=`<div class="delivery-ready-summary"><span class="ready-kicker">Thông tin giao hàng</span><b>${safe(order.ticketNumber||'Đơn NCC')}</b><span>${internalOrder(order.supplierInternalOrderNumber)} · ${safe(order.supplierName||'NCC')}</span></div><fieldset class="delivery-ready-mode"><legend>Kiểu giao</legend><label class="ready-mode-card"><input type="radio" name="mode" value="full" ${partial?'':'checked'}><span><b>Giao toàn bộ đơn</b><small>Tất cả mã trong phiếu</small></span></label><label class="ready-mode-card"><input type="radio" name="mode" value="partial" ${partial?'checked':''}><span><b>Giao một phần</b><small>Theo mã hàng và số lượng</small></span></label></fieldset><label class="delivery-date-field"><span>Ngày muốn giao</span><input name="deliveryDate" type="date" value="${safe(order.supplierDeliveryReadyDate||todayIso())}" required></label><div class="delivery-ready-lines" hidden><div class="ready-lines-head"><b>Mã hàng giao một phần</b><span>Danh sách mã hàng trong đơn</span></div>${deliveryReadyRowsHtml(order)}</div>`;
		  const syncMode=()=>{body.querySelector('.delivery-ready-lines').hidden=form.mode.value!=='partial';};
		  body.querySelectorAll('[name=mode]').forEach(input=>input.onchange=syncMode);
		  syncMode();
		  dialog.showModal();
		 }
		 function deliveryReadyPayload(){
		  const form=$('#deliveryReadyForm'),body=$('#deliveryReadyBody'),mode=form.mode.value,deliveryDate=form.deliveryDate.value;
		  const payload={ready:true,mode,deliveryDate};
		  if(mode==='partial'){
		   payload.rows=[...body.querySelectorAll('[data-ready-row]:checked')].map(input=>{
		    const row=input.closest('.delivery-ready-row');
		    return {sku:input.dataset.sku,quantity:Number(row.querySelector('[data-ready-quantity]').value)};
		   });
		  }
		  return payload;
		 }
		 async function submitDeliveryReady(){
		  const id=deliveryReadyRequest?.id,order=allOrders.find(item=>item.id===id),dialog=$('#deliveryReadyDialog'),form=$('#deliveryReadyForm'),message=$('#deliveryReadyMessage'),button=form?.querySelector('[type=submit]');
		  if(!id||!order||!form)return;
		  let payload;
		  try{payload=deliveryReadyPayload();}catch{message.textContent='Thông tin giao hàng chưa hợp lệ.';return;}
		  if(!/^\d{4}-\d{2}-\d{2}$/.test(payload.deliveryDate||'')){message.textContent='Chọn ngày muốn giao trước khi lưu.';return;}
		  if(payload.mode==='partial'){
		   if(!payload.rows?.length){message.textContent='Chọn ít nhất 1 mã hàng khi giao một phần.';return;}
		   const available=new Map(stockRows(order).map(row=>[String(row.sku||'').toLowerCase(),Number(row.quantity||0)]));
		   if(payload.rows.some(row=>!row.sku||!Number.isFinite(row.quantity)||row.quantity<=0||row.quantity>Number(available.get(String(row.sku||'').toLowerCase())||0))){message.textContent='Số lượng giao một phần phải lớn hơn 0 và không vượt quá số lượng trong đơn.';return;}
		  }
		  button.disabled=true;message.textContent='Đang lưu trạng thái sẵn sàng giao…';
		  try{
		   const result=await api(`/supplier-portal/orders/${encodeURIComponent(id)}/delivery-ready`,'POST',payload);
		   allOrders=allOrders.map(item=>item.id===id?result.order:item);
		   deliveryReadyRequest=null;
		   dialog.close();
		   renderOrders();
		  }catch(error){message.textContent=error.message||'Chưa lưu được trạng thái sẵn sàng giao.';button.disabled=false;}
		 }
		 async function markDeliveryReady(id,button,payload={ready:true}){
		  const order=allOrders.find(item=>item.id===id);
		  if(!order||!button||button.disabled)return;
		  button.disabled=true;
		  button.textContent='Đang lưu…';
		  try{
		   const result=await api(`/supplier-portal/orders/${encodeURIComponent(id)}/delivery-ready`,'POST',payload);
		  allOrders=allOrders.map(item=>item.id===id?result.order:item);
		  renderOrders();
	  }catch(error){
	   button.disabled=false;
	   button.textContent=deliveryReadyButton(order,true).replace(/<[^>]+>/g,'').trim()||'Sẵn sàng giao';
	   alert(error.message||'Chưa lưu được trạng thái sẵn sàng giao.');
	  }
	 }
	 function confirmRows(card){
  return [...card.querySelectorAll('[data-confirm-row]')].map(row=>({sku:row.dataset.sku,quantity:Number(row.dataset.quantity),purchaseDiscount:Number(row.querySelector('[data-purchase-discount]').value),supplierNote:row.querySelector('[data-supplier-note]').value.trim(),promisedDate:row.querySelector('[data-promised-date]').value,confirmed:row.querySelector('[data-confirm-check]').checked}));
 }
 function syncDownloadOrderButton(card){
 const button=card?.querySelector('[data-download-order][data-require-checked]');
 if(!button)return;
  const rows=[...card.querySelectorAll('[data-confirm-row]')],ready=rows.length&&rows.every(row=>row.querySelector('[data-confirm-check]')?.checked);
  button.disabled=false;
  button.setAttribute('aria-disabled',ready?'false':'true');
  button.title=ready?'Tải file đơn hàng':'Tick chọn đủ từng mã hàng trước khi tải file';
 }
 function supplierInternalOrderNumber(card){
  return card.querySelector('[data-supplier-internal-order]')?.value.trim()||'';
 }
 function scheduleInternalOrderSave(card,input,delay=650){
  const id=card?.dataset.orderId,message=card?.querySelector('.order-message');
  if(!id||!input)return;
  clearTimeout(internalOrderSaveTimers.get(id));
  internalOrderSaveTimers.set(id,setTimeout(async()=>{
   const value=input.value.trim();
   if(value.length>100){if(message)message.textContent='Số phiếu NCC tối đa 100 ký tự.';return;}
   if(input.dataset.lastSaved===value)return;
   if(message)message.textContent='Đang tự lưu Số phiếu NCC…';
   try{
    const result=await api(`/supplier-portal/orders/${encodeURIComponent(id)}/internal-order`,'POST',{supplierInternalOrderNumber:value});
    input.dataset.lastSaved=value;
    allOrders=allOrders.map(order=>order.id===id?result.order:order);
    if(message)message.textContent=value?'Đã tự lưu Số phiếu NCC.':'Đã xóa Số phiếu NCC.';
   }catch(error){
    if(message)message.textContent=error.message||'Chưa lưu được Số phiếu NCC.';
   }
  },delay));
 }
 function openDepositConfirm(card,button){
  const id=card?.dataset.orderId,order=allOrders.find(item=>item.id===id),message=card?.querySelector('.order-message'),rows=confirmRows(card);
  if(!order||!card)return;
  if(order.depositPaidAt){message.textContent='Đơn này đã ghi nhận tiền cọc, không cần yêu cầu thanh toán lại.';return;}
  if(!rows.length||rows.some(row=>!row.confirmed)){message.textContent='Tick chọn đầy đủ từng sản phẩm trước khi yêu cầu đặt cọc.';return;}
  pendingDeposit={id,card,button,rows,supplierInternalOrderNumber:supplierInternalOrderNumber(card)};
  $('#depositConfirmBody').innerHTML=`<dl><div><dt>Số đơn</dt><dd>${safe(order.ticketNumber||'—')}</dd></div><div><dt>Số báo giá</dt><dd>${safe(order.quoteNumber||'—')}</dd></div><div><dt>Nhà cung cấp</dt><dd>${safe(order.supplierName||'—')}</dd></div><div><dt>Số nội bộ NCC</dt><dd>${safe(pendingDeposit.supplierInternalOrderNumber||order.supplierInternalOrderNumber||'—')}</dd></div><div><dt>Cọc</dt><dd class="deposit-inline"><label class="deposit-rate-field"><input id="depositRateInput" type="number" min="0" max="100" step="0.01" value="${safe(order.depositRate??30)}" inputmode="decimal"><span>%</span></label><b id="depositAmountPreview">${hidePrices(order)?'Ẩn giá':money(Math.round(Number(order.total||0)*Number(order.depositRate??30)/100))}</b></dd></div><div><dt>Tổng tiền</dt><dd>${hidePrices(order)?'Ẩn giá':money(order.total)}</dd></div><div><dt>Sản phẩm đã tick</dt><dd>${number(rows.length)} dòng / ${number(orderQuantity(order))} sản phẩm</dd></div><div><dt>Ngày hẹn giao</dt><dd>${date(order.arrivalDate)}</dd></div></dl>`;
  const updateDepositAmount=()=>{const rate=Number($('#depositRateInput')?.value),total=Number(order.total||0);$('#depositAmountPreview').textContent=!Number.isFinite(rate)||rate<0||rate>100?'—':hidePrices(order)?'Ẩn giá':money(Math.round(total*rate/100));};
  $('#depositRateInput')?.addEventListener('input',updateDepositAmount);
  $('#depositConfirmNote').textContent='Bấm Gửi yêu cầu để gửi thông tin thanh toán cho Manager.';
  $('#depositConfirmDialog').showModal();
  $('#depositRateInput')?.focus();
 }
 async function submitDepositRequest(){
  const request=pendingDeposit;
  if(!request)return;
  const {id,card,button,rows}=request,message=card.querySelector('.order-message'),submit=$('#depositConfirmForm [type=submit]');
  const depositRate=Number($('#depositRateInput')?.value);
  if(!Number.isFinite(depositRate)||depositRate<0||depositRate>100){$('#depositConfirmNote').textContent='Tỷ lệ cọc phải từ 0 đến 100%.';return;}
  submit.disabled=true;
  button.disabled=true;message.textContent='Đang gửi yêu cầu đặt cọc…';
  try{const result=await api(`/supplier-portal/orders/${encodeURIComponent(id)}/deposit-request`,'POST',{rows,supplierInternalOrderNumber:request.supplierInternalOrderNumber,depositRate});pendingDeposit=null;$('#depositConfirmDialog').close();allOrders=allOrders.map(order=>order.id===id?result.order:order);renderOrders();}
  catch(error){message.textContent=error.message;$('#depositConfirmNote').textContent=error.message;button.disabled=false;submit.disabled=false;}
 }
 const readFileAsBase64=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
  reader.onerror=()=>reject(Error('Không đọc được file.'));
  reader.readAsDataURL(file);
 });
 async function downloadSupplierOrderFile(card,button){
  const id=card?.dataset.orderId,order=allOrders.find(item=>item.id===id),message=card?.querySelector('.order-message');
  if(!order||!card)return;
  const confirmRowElements=[...card.querySelectorAll('[data-confirm-row]')];
  if(button?.dataset.requireChecked==='1'&&(!confirmRowElements.length||confirmRowElements.some(row=>!row.querySelector('[data-confirm-check]')?.checked))){if(message)message.textContent='Tick chọn đủ từng mã hàng trước khi tải file đơn hàng.';syncDownloadOrderButton(card);return;}
  button.disabled=true;
  const label=button.textContent;
  button.textContent='Đang tạo file…';
  try{
   await loadExcelJs();
   const template=await fetch('/supplier-order-template.xlsx?v=supplier-order-template-1',{cache:'no-store'});
   if(!template.ok)throw Error('Không tải được file mẫu đơn hàng NCC.');
   const book=new ExcelJS.Workbook();
   await book.xlsx.load(await template.arrayBuffer());
   const rows=(order.rows||[]).filter(row=>!isPrintLogoRow(row));
   const getRows=()=>rows.length?rows:[{sku:'',name:'',quantity:''}];
   const cloneStyle=(from,to,lastCol)=>{to.height=from.height;for(let col=1;col<=lastCol;col++){const source=from.getCell(col),target=to.getCell(col);target.style=JSON.parse(JSON.stringify(source.style||{}));target.numFmt=source.numFmt;target.alignment=source.alignment?JSON.parse(JSON.stringify(source.alignment)):target.alignment;target.border=source.border?JSON.parse(JSON.stringify(source.border)):target.border;target.fill=source.fill?JSON.parse(JSON.stringify(source.fill)):target.fill;target.font=source.font?JSON.parse(JSON.stringify(source.font)):target.font;}};
   const fillSheet2=()=>{
    const ws=book.getWorksheet('Sheet2')||book.worksheets[1]||book.worksheets[0],templateRow=ws.getRow(2),items=getRows(),pickupTicket=order.supplierInternalOrderNumber||order.ticketNumber||order.quoteNumber||'',pickup=`${date(order.arrivalDate)} - ${pickupTicket}`.trim();
    for(let index=0;index<items.length;index++){
     const item=items[index],row=ws.getRow(2+index);cloneStyle(templateRow,row,9);
     row.values=[,index+1,item.sku||'',item.name||'',item.category||'',item.pattern||'',item.quality||'L1',Number(item.quantity)||'',order.supplierName||'NHÀ MÁY',pickup];
     row.commit?.();
    }
    for(let rowNumber=2+items.length;rowNumber<=Math.max(5,ws.rowCount);rowNumber++)ws.getRow(rowNumber).values=[];
   };
   const fillSheet1=()=>{
    const ws=book.getWorksheet('Sheet1');if(!ws)return;
    const items=getRows(),templateRow=ws.getRow(8);
    ws.getCell('I1').value=order.arrivalDate?new Date(order.arrivalDate+'T00:00:00'):new Date();
    ws.getCell('A2').value='GIỜ LẤY : CẬP NHẬT SAU';
    ws.getCell('A5').value='SỐ XE : CẬP NHẬT SAU';
    for(let index=0;index<items.length;index++){
     const item=items[index],row=ws.getRow(8+index);cloneStyle(templateRow,row,9);
     row.values=[,index+1,order.supplierInternalOrderNumber||order.ticketNumber||'',item.sku||'',item.name||'',item.category||'',item.pattern||'',item.quality||'L1',Number(item.quantity)||'',Number(item.weightKg)||''];
     row.commit?.();
    }
    for(let rowNumber=8+items.length;rowNumber<=Math.max(8,ws.rowCount);rowNumber++)ws.getRow(rowNumber).values=[];
   };
   fillSheet1();fillSheet2();
   const buffer=await book.xlsx.writeBuffer(),blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download=`${fileSafe(order.ticketNumber||order.quoteNumber||'don-hang-ncc')}.xlsx`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
   if(message)message.textContent='Đã tải file đơn hàng NCC.';
  }catch(error){if(message)message.textContent=error.message;}
  finally{button.disabled=false;button.textContent=label;}
 }
 async function uploadSignatureFile(card,button){
  const id=card?.dataset.orderId,order=allOrders.find(item=>item.id===id),message=card?.querySelector('.order-message');
  if(!order||!card)return;
  const input=document.createElement('input');
  input.type='file';input.accept='image/*,application/pdf';input.capture='environment';
  input.onchange=async()=>{
   const file=input.files?.[0];
   if(!file)return;
   if(!/^(image\/(?:jpeg|jpg|png|webp)|application\/pdf)$/i.test(file.type)){if(message)message.textContent='Chỉ nhận ảnh hoặc PDF bản ký xác nhận.';return;}
   if(file.size>6*1024*1024){if(message)message.textContent='File ký xác nhận tối đa 6MB.';return;}
   button.disabled=true;if(message)message.textContent='Đang upload bản ký xác nhận…';
   try{
    const result=await api(`/supplier-portal/orders/${encodeURIComponent(id)}/signature-upload`,'POST',{fileName:file.name,mimeType:file.type,dataBase64:await readFileAsBase64(file)});
    allOrders=allOrders.map(item=>item.id===id?result.order:item);
    renderOrders();
   }catch(error){if(message)message.textContent=error.message;button.disabled=false;}
  };
  input.click();
 }
 async function deleteSignatureFile(card,button){
  const id=card?.dataset.orderId,order=allOrders.find(item=>item.id===id),message=card?.querySelector('.order-message');
  if(!order||!card)return;
  if(!confirm('Xóa bản ký đã upload? Sau khi xóa, cần upload bản ký mới trước khi xác nhận.'))return;
  button.disabled=true;if(message)message.textContent='Đang xóa bản ký…';
  try{
   const result=await api(`/supplier-portal/orders/${encodeURIComponent(id)}/signature-delete`,'POST',{});
   allOrders=allOrders.map(item=>item.id===id?result.order:item);
   renderOrders();
  }catch(error){if(message)message.textContent=error.message;button.disabled=false;}
 }
 async function confirmOrder(card,button){
  const id=card?.dataset.orderId,order=allOrders.find(item=>item.id===id),message=card.querySelector('.order-message'),rows=confirmRows(card);
  if(!signatureReady(order)){message.textContent='Vui lòng upload ảnh hoặc file bản ký xác nhận trước khi bấm Xác nhận.';return;}
  if(rows.some(row=>!row.confirmed||!row.promisedDate||!Number.isFinite(row.purchaseDiscount)||row.purchaseDiscount<0||row.purchaseDiscount>100)){message.textContent='Tick xác nhận, nhập CK từ 0-100% và chọn ngày hẹn giao đầy đủ từng mã hàng.';return;}
  button.disabled=true;message.textContent='Đang xác nhận đơn NCC…';
  try{
   const result=await api(`/supplier-portal/orders/${encodeURIComponent(id)}/confirm`,'POST',{rows,supplierInternalOrderNumber:supplierInternalOrderNumber(card)});
   allOrders=allOrders.map(item=>item.id===id?result.order:item);activeTab='confirmed';renderOrders();
  }
  catch(error){message.textContent=error.message;button.disabled=false;}
 }
 async function deleteOrder(card,button){
  const id=card?.dataset.orderId,order=allOrders.find(item=>item.id===id),message=card.querySelector('.order-message');
  if(!order||!confirm(`Xóa phiếu ${order.ticketNumber||id}?`))return;
  button.disabled=true;message.textContent='Đang xoá phiếu…';
  try{await api(`/incoming-stock/${encodeURIComponent(id)}`,'DELETE',{revision:order.updatedAt||order.createdAt});allOrders=allOrders.filter(item=>item.id!==id);renderOrders();}
  catch(error){message.textContent=error.message;button.disabled=false;}
 }
 async function refreshPaymentRequests(){
  if(currentUser?.role!=='manager'){paymentRequests=[];return;}
  const result=await api('/supplier-payment-requests');
  paymentRequests=result.requests||[];
 }
 async function refreshStockRequests(){
  if(!['manager','employee','supplier'].includes(currentUser?.role)){stockRequests=[];return;}
  const result=await api('/supplier-stock-requests');
  stockRequests=result.requests||[];
 }
 async function refreshPortal(){
  if(portalRefreshBusy)return;
  portalRefreshBusy=true;
  try{
   const result=await api('/supplier-portal/orders');
   allOrders=result.orders||[];
   await refreshPaymentRequests();
   await refreshStockRequests();
   renderOrders();
  }finally{
   portalRefreshBusy=false;
  }
 }
 async function payDeposit(row,button){
  const id=row?.dataset.paymentRequest,order=paymentRequests.find(item=>item.id===id);
  if(!order)return;
  if(!confirm(`Ghi nhận đã thanh toán cọc ${money(order.depositAmount)} cho ${order.ticketNumber||'đơn NCC'}?`))return;
  button.disabled=true;button.textContent='Đang lưu…';
  try{
   const result=await api(`/supplier-payment-requests/${encodeURIComponent(id)}/pay`,'POST',{});
   paymentRequests=paymentRequests.filter(item=>item.id!==id);
   allOrders=allOrders.map(item=>item.id===id?result.order:item);
   renderOrders();
  }catch(error){
   button.disabled=false;button.textContent='Đã thanh toán cọc';
   row.insertAdjacentHTML('beforeend',`<p class="order-message" role="status">${safe(error.message)}</p>`);
  }
 }
 // Move the existing controls, keeping their handlers, role restrictions and live labels.
 function setupHomeLayout(user){
  document.querySelectorAll('[data-staff-navigation]').forEach(link=>{link.hidden=user.role==='supplier';});
  const account=$('#accountPanel'),actions=$('.title-actions');
  const accountAnchor=document.createComment('supplier account'),actionsAnchor=document.createComment('supplier actions');
  account.before(accountAnchor);actions.before(actionsAnchor);
  const desktop=matchMedia('(min-width: 1024px)');
  const sync=()=>{
   if(desktop.matches){
    $('#supplierLeftAccount').append(account);
    $('#supplierLeftActions').append(actions);
   }else{
    accountAnchor.after(account);actionsAnchor.after(actions);
   }
   account.classList.remove('open');$('#accountMenuToggle').setAttribute('aria-expanded','false');
  };
  desktop.addEventListener('change',sync);sync();
 }
 async function load(){
  const me=await api('/me');
  if(!['supplier','manager','employee'].includes(me.user.role)){location.replace('/quote');return;}
  currentUser=me.user;
  setupHomeLayout(me.user);
  $('#supplierUser').textContent=`${me.user.name} · ${me.user.email}`;
  setupSupplierPush();
  document.body.hidden=false;
  await refreshPortal();
 }
 async function setupSupplierPush(){
  const button=$('#supplierPushToggle');
  if(!button||currentUser?.role==='supplier')return;
  const unsupported=pushSupportMessage();
  button.hidden=false;
  if(unsupported){button.textContent='Cách bật thông báo';button.onclick=()=>alert(unsupported);return;}
  const refresh=async()=>{try{const reg=await navigator.serviceWorker.register(pushWorkerUrl,{scope:'/'}),sub=await reg.pushManager.getSubscription();if(sub)api('/push/subscribe','POST',sub.toJSON()).catch(()=>{});button.textContent=sub?'Thông báo đang bật':'Bật thông báo';}catch{button.textContent='Bật thông báo';}};
  button.onclick=async()=>{try{const config=await api('/push/config');if(!config.enabled||!config.publicKey)throw Error('Web push chưa được cấu hình.');const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Anh cần cho phép thông báo trong trình duyệt.');const reg=await navigator.serviceWorker.register(pushWorkerUrl,{scope:'/'});let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushKeyToBytes(config.publicKey)});await api('/push/subscribe','POST',sub.toJSON());await refresh();}catch(error){alert(error.message||'Chưa bật được thông báo.');}};
  navigator.serviceWorker?.addEventListener?.('message',event=>{if(event.data?.type==='web-push-notification'&&['supplier_stock_requested','supplier_stock_request_responded','supplier_deposit_requested','supplier_deposit_paid'].includes(event.data?.eventType)){refreshPortal().catch(()=>{});}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPortal().catch(()=>{});});
  await refresh();
 }
 $('#logout').onclick=async()=>{try{await api('/logout','POST',{});}finally{location.replace('/login.html');}};
 const openOrderSearchDialog=()=>{const dialog=$('#orderSearchDialog'),input=$('#orderSearchDialogInput'),dateInput=$('#orderSearchDialogDate');input.value=orderFilterDraft.query;dateInput.value=orderFilterDraft.date;dialog.showModal();$('#orderSearchTop')?.setAttribute('aria-expanded','true');requestAnimationFrame(()=>input.focus());};
	 if($('#orderSearchTop'))$('#orderSearchTop').onclick=openOrderSearchDialog;
 $('#accountMenuToggle').onclick=event=>{event.stopPropagation();const panel=$('#accountPanel'),open=!panel.classList.contains('open');panel.classList.toggle('open',open);$('#accountMenuToggle').setAttribute('aria-expanded',open?'true':'false');};
 document.addEventListener('click',event=>{if(!$('#accountPanel')?.contains(event.target)){$('#accountPanel')?.classList.remove('open');$('#accountMenuToggle')?.setAttribute('aria-expanded','false');}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){$('#accountPanel')?.classList.remove('open');$('#accountMenuToggle')?.setAttribute('aria-expanded','false');}});
		 $('#changePassword').onclick=()=>{$('#accountPanel').classList.remove('open');$('#accountMenuToggle').setAttribute('aria-expanded','false');$('#passwordError').textContent='';$('#passwordDialog').showModal();};
		 $('#calendarToggle').onclick=()=>{showCalendar=!showCalendar;renderOrders();};
		 $('#productStatsToggle').onclick=()=>{showProductStats=!showProductStats;selectedOrderId='';clearOrderHash();renderOrders();};
		 $('#deliveryNoteToggle').onclick=openDeliveryNoteDialog;
		 $('#stockRequestToggle').onclick=openStockRequestDialog;
		 $('#calendarDialog').addEventListener('click',event=>{if(event.target===$('#calendarDialog'))closeCalendarDialog();});
		 $('#calendarDialog').addEventListener('close',()=>{if(showCalendar){showCalendar=false;renderOrders();}});
		 $('#productStatsDialog').addEventListener('click',event=>{if(event.target===$('#productStatsDialog'))closeProductStatsDialog();});
		 $('#productStatsDialog').addEventListener('close',()=>{if(showProductStats){showProductStats=false;renderOrders();}});
		 $('#orderSearchDialog').addEventListener('close',()=>$('#orderSearchTop')?.setAttribute('aria-expanded','false'));
 $('#cancelOrderSearch').onclick=()=>$('#orderSearchDialog').close();
 $('#clearOrderSearch').onclick=()=>{orderFilters={query:'',date:''};orderFilterDraft={query:'',date:''};selectedOrderId='';clearOrderHash();$('#orderSearchDialog').close();renderOrders();};
 $('#orderSearchForm').onsubmit=event=>{event.preventDefault();orderFilterDraft={query:$('#orderSearchDialogInput').value.trim(),date:$('#orderSearchDialogDate').value};applyOrderFilters();$('#orderSearchDialog').close();};
	 $('#cancelDepositConfirm').onclick=()=>{$('#depositConfirmDialog').close();pendingDeposit=null;};
	 $('#depositConfirmDialog').addEventListener('close',()=>{$('#depositConfirmForm [type=submit]').disabled=false;});
	 $('#depositConfirmForm').onsubmit=event=>{event.preventDefault();submitDepositRequest();};
	 $('#cancelDeliveryReady').onclick=()=>{$('#deliveryReadyDialog').close();deliveryReadyRequest=null;};
	 $('#deliveryReadyDialog').addEventListener('close',()=>{$('#deliveryReadyForm [type=submit]').disabled=false;});
	 $('#deliveryReadyForm').onsubmit=event=>{event.preventDefault();submitDeliveryReady();};
	 $('#cancelDeliveryNote').onclick=()=>{$('#deliveryNoteDialog').close();deliveryNoteRequest=null;};
	 $('#deliveryNoteDialog').addEventListener('close',()=>{$('#deliveryNoteForm [type=submit]').disabled=false;});
	 $('#deliveryNoteForm').onsubmit=event=>{event.preventDefault();printDeliveryNote();};
	 $('#cancelStockRequest').onclick=()=>$('#stockRequestDialog').close();
	 $('#stockRequestDialog').addEventListener('click',event=>{if(event.target===$('#stockRequestDialog'))$('#stockRequestDialog').close();});
	 $('#stockRequestDialog').addEventListener('close',()=>{$('#stockRequestForm [type=submit]').disabled=false;});
	 $('#stockRequestForm').onsubmit=event=>{event.preventDefault();submitStockRequest();};
	 setInterval(()=>{if(document.hidden||document.querySelector('dialog[open]'))return;refreshPortal().catch(()=>{});},30000);
 $('#cancelPassword').onclick=()=>$('#passwordDialog').close();
 $('#passwordForm').onsubmit=async event=>{
  event.preventDefault();
  const form=event.currentTarget,error=$('#passwordError'),button=form.querySelector('[type=submit]');
  error.textContent='';
  if(form.next.value!==form.confirm.value){error.textContent='Hai mật khẩu chưa khớp.';return;}
  button.disabled=true;
  try{await api('/password','POST',{currentPassword:form.current.value,password:form.next.value});location.replace('/login.html');}
  catch(err){error.textContent=err.message;button.disabled=false;}
 };
 load().catch(error=>{document.body.hidden=false;$('#orders').innerHTML=`<div class="empty">${safe(error.message)}</div>`;});
})();
