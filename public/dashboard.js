(function(){
  const $=selector=>document.querySelector(selector);
  const fmt=value=>Number(value||0).toLocaleString('vi-VN');
  const date=value=>value?new Date(value).toLocaleString('vi-VN'):'Chưa có thời gian';
  const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let currentUserId=null;
  function signedOut(){currentUserId=null;$('#dashboardUser').textContent='Bạn chưa đăng nhập';$('#dashboardLogin').hidden=false;$('#dashboardLogout').hidden=true;$('#dashboardUpdated').textContent='';}
  const api=async path=>{
    const response=await fetch('/api/staff'+path,{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(response.status===401){signedOut();throw Error('Vui lòng đăng nhập để xem công việc.');}
    if(!response.ok)throw Error(data.error||'Không tải được dữ liệu.');
    return data;
  };
  const settle=promise=>promise.then(value=>({ok:true,value})).catch(error=>({ok:false,error}));
  async function loadQuotes(){
    const records=[];let cursor='';
    for(let page=0;page<5;page++){
      const data=await api('/quotes'+(cursor?'?before='+encodeURIComponent(cursor):''));
      records.push(...(data.records||[]));
      if(!data.nextCursor)break;
      cursor=data.nextCursor;
    }
    return records;
  }
  const card=(label,value,detail,tone='neutral',href='/quote')=>`<a class="dash-kpi ${tone}" href="${href}"><span>${safe(label)}</span><strong>${fmt(value)}</strong><small>${safe(detail)}</small></a>`;
  const workItem=(title,detail,count,tone='neutral',href='/quote')=>`<a class="work-item ${tone}" href="${href}"><b>${safe(title)}</b><span>${safe(detail)}</span><strong>${fmt(count)}</strong></a>`;
  function renderQuotes(quotes){
    const box=$('#recentQuotes');
    if(!quotes.length){box.innerHTML='<p class="muted">Chưa có báo giá trong phạm vi tài khoản.</p>';return;}
    box.innerHTML=quotes.slice(0,3).map(q=>{
      const approved=q.approvalStatus==='approved';
      return `<a class="quote-row" href="/quote?quoteId=${encodeURIComponent(q.id)}">
        <div><b>${safe(q.quoteNo||'Chưa có số')}</b><span>${safe(q.customer||'Chưa nhập khách hàng')}</span></div>
        <small>${safe(q.type||'')} · ${safe(q.creatorName||'')} · ${date(q.updatedAt)}</small>
        <em class="${approved?'done':'pending'}">${approved?'Đã duyệt':'Đợi duyệt'}</em>
      </a>`;
    }).join('');
  }
  function renderClosedCustomers(data){
    const box=$('#closedCustomers');
    const customers=data?.customers||[];
    if(!customers.length){box.innerHTML='<p class="muted">Chưa có khách chốt HĐKT trong phạm vi tài khoản.</p>';return;}
    box.innerHTML=customers.slice(0,3).map(item=>{
      const source=(item.source||[]).join(' + ')||'Đã chốt';
      const code=item.contractNumber||item.sapoOrderCode||item.quoteNo||'Đã chốt';
      const href=item.crmUrl||item.sapoOrderUrl||'/quote';
      return `<a class="quote-row closed-row" href="${safe(href)}">
        <div><b>${safe(item.customer||'Chưa có tên khách')}</b><span>${safe(code)}</span></div>
        <small>${safe(item.creatorName||'')} · ${date(item.updatedAt)}</small>
        <em class="done">${safe(source)}</em>
      </a>`;
    }).join('');
  }
  function numberFrom(result,path,field='count'){
    if(!result.ok)return 0;
    const value=path?result.value?.[path]:result.value;
    if(Array.isArray(value))return value.length;
    return Number(result.value?.[field]??0)||0;
  }
  async function render(){
    $('#dashboardRefresh').disabled=true;
    try{
      const me=await api('/me');
      if(me.user?.role==='supplier'){location.replace('/supplier');return;}
      currentUserId=me.user.id;$('#dashboardLogin').hidden=true;$('#dashboardLogout').hidden=false;
      $('#dashboardUser').textContent=`${me.user.name} · ${me.user.position||me.user.role} · ${me.user.email}`;
      const [quotesResult,pendingSupplierResult,incomingResult,approvedSupplierResult,paymentResult,stockRequestResult,closedResult]=await Promise.all([
        settle(loadQuotes()),
        settle(api('/supplier-orders/pending-count')),
        settle(api('/incoming-stock')),
        settle(api('/supplier-portal/orders')),
        settle(api('/supplier-payment-requests')),
        settle(api('/supplier-stock-requests')),
        settle(api('/closed-customers')),
      ]);
      const quotes=quotesResult.ok?quotesResult.value:[];
      const pendingQuotes=quotes.filter(q=>q.approvalStatus!=='approved').length;
      const approvedQuotes=quotes.filter(q=>q.approvalStatus==='approved').length;
      const sapoReady=quotes.filter(q=>['created','existing'].includes(q.sapoStatus)).length;
      const pendingSupplier=numberFrom(pendingSupplierResult,null,'count');
      const incoming=numberFrom(incomingResult,'shipments');
      const approvedSupplier=numberFrom(approvedSupplierResult,'orders');
      const paymentRequests=numberFrom(paymentResult,'requests',paymentResult.value?.count);
      const stockRequests=numberFrom(stockRequestResult,'requests');
      const closed=closedResult.ok?closedResult.value:{count:0,sapoCount:0,crmCount:0,customers:[]};
      $('#dashboardKpis').innerHTML=[
        card('Cần duyệt',pendingQuotes+pendingSupplier,`${pendingQuotes} báo giá · ${pendingSupplier} đơn NCC`,'urgent',pendingQuotes?'/quote?dashboardAction=pending-quotes':'/supplier'),
        card('Cần xử lý',paymentRequests+stockRequests,`${paymentRequests} thanh toán · ${stockRequests} xin hàng`,'warning','/supplier'),
        card('Hàng sắp về',incoming,'Phiếu chưa nhận kho','info','/quote?dashboardAction=incoming'),
        card('Đang triển khai',approvedSupplier+sapoReady,`${approvedSupplier} đơn NCC · ${sapoReady} đơn Sapo`,'success','/supplier'),
        card('Khách đã chốt HĐKT',closed.count,`${closed.crmCount||0} CRM · ${closed.sapoCount||0} Sapo`,'closed','/quote'),
      ].join('');
      const urgentItems=[
        workItem('Báo giá đợi duyệt',pendingQuotes?'Mở thư viện báo giá để duyệt':'Không có báo giá chờ duyệt',pendingQuotes,pendingQuotes?'urgent':'done','/quote?dashboardAction=pending-quotes'),
        workItem('Đơn NCC đợi duyệt',pendingSupplier?'Kiểm tra CK mua vào, ngày về hàng':'Không có đơn NCC chờ duyệt',pendingSupplier,pendingSupplier?'warning':'done','/supplier'),
        workItem('Đề nghị thanh toán NCC',paymentRequests?'Có yêu cầu thanh toán/cọc cần xử lý':'Không có yêu cầu thanh toán',paymentRequests,paymentRequests?'warning':'done','/supplier'),
        workItem('Yêu cầu xin hàng NCC',stockRequests?'Có yêu cầu chờ phản hồi':'Không có yêu cầu xin hàng',stockRequests,stockRequests?'info':'done','/supplier'),
      ].filter((_,index)=>[pendingQuotes,pendingSupplier,paymentRequests,stockRequests][index]>0);
      $('#urgentWork').innerHTML=urgentItems.length?urgentItems.join(''):'<p class="muted">Không có việc cần xử lý ngay.</p>';
      renderQuotes(quotes);
      renderClosedCustomers(closed);
      $('#dashboardUpdated').textContent='Cập nhật '+new Date().toLocaleTimeString('vi-VN');
    }catch(error){
      $('#dashboardKpis').innerHTML='';
      $('#urgentWork').innerHTML=`<p class="error-text">${safe(error.message)}</p>`;
      $('#recentQuotes').innerHTML='<p class="muted">Chưa tải được dữ liệu.</p>';
      $('#closedCustomers').innerHTML='<p class="muted">Chưa tải được dữ liệu.</p>';
    }finally{
      $('#dashboardRefresh').disabled=false;
    }
  }
  $('#dashboardRefresh')?.addEventListener('click',render);
  $('#dashboardLogout')?.addEventListener('click',async()=>{
    const button=$('#dashboardLogout');button.disabled=true;button.textContent='Đang đăng xuất…';
    try{const response=await fetch('/api/staff/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok&&response.status!==401)throw Error('Chưa đăng xuất được. Vui lòng thử lại.');
      if(currentUserId)sessionStorage.removeItem('bn-draft:'+currentUserId);
      location.replace('/');
    }catch(error){$('#dashboardUpdated').textContent=error.message;button.disabled=false;button.textContent='Đăng xuất';}
  });
  render();
})();
