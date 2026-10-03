(()=>{
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
 const money=value=>(Math.round(Number(value||0)||0)).toLocaleString('vi-VN')+' đ';
 const dateText=value=>{if(!value)return '';const parsed=Date.parse(value);return Number.isFinite(parsed)?new Date(parsed).toLocaleDateString('vi-VN'):String(value);};
 const sourceLabel=customer=>customer.source==='local'?'Ngoài Sapo':'Sapo';
 const state={loaded:false,loading:null,limited:false,filtersOpen:false,customers:[],filters:{q:'',source:'all',status:'all',sort:'recent'}};
 const initials=name=>String(name||'KH').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'KH';
 const logoHtml=customer=>`<span class="customer-dashboard-logo fallback">${esc(initials(customer.name))}</span>`;
 const customerOwner=customer=>(customer.owners||[])[0]||'Chưa có báo giá';
 const customerContracts=customer=>[...new Set((customer.quotes||[]).map(quote=>String(quote.contractNumber||'').trim()).filter(Boolean))];
 const customerSearch=customer=>normalize([customer.name,customer.customerCode,customer.taxCode,customer.phone,customer.email,customer.address,customer.contact,(customer.owners||[]).join(' '),(customer.quotes||[]).map(quote=>[quote.quoteNo,quote.contractNumber].filter(Boolean).join(' ')).join(' ')].join(' '));
 const withTimeout=(promise,ms,message)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(message)),ms))]);
 const load=async()=>{
  if(state.loaded)return;
  if(state.loading)return state.loading;
  state.loading=withTimeout(BN.api('/customers/analytics'),25000,'Tải khách hàng quá lâu. Vui lòng bấm làm mới để thử lại.').then(data=>{state.customers=data.customers||[];state.limited=Boolean(data.limited);state.loaded=true;}).finally(()=>{state.loading=null;});
  return state.loading;
 };
 const filtered=()=>{
  const q=normalize(state.filters.q),{source,status,sort}=state.filters;
  let rows=state.customers.filter(customer=>{
   if(q&&!customerSearch(customer).includes(q))return false;
   if(source!=='all'&&customer.source!==source)return false;
   if(status==='hasQuote'&&!customer.quoteCount)return false;
   if(status==='hasContract'&&!customer.contractCount)return false;
   if(status==='noQuote'&&customer.quoteCount)return false;
   if(status==='hasDiscount'&&!Object.keys(customer.discounts||{}).length)return false;
   return true;
  });
 rows=[...rows].sort((a,b)=>{
   if(sort==='revenue')return Number(b.quoteTotal||0)-Number(a.quoteTotal||0);
   if(sort==='quotes')return Number(b.quoteCount||0)-Number(a.quoteCount||0);
   if(sort==='name')return String(a.name||'').localeCompare(String(b.name||''),'vi');
   return String(b.lastQuoteAt||b.syncedAt||b.id||'').localeCompare(String(a.lastQuoteAt||a.syncedAt||a.id||''))||String(a.name||'').localeCompare(String(b.name||''),'vi');
  });
  return rows;
 };
 const filterBar=rows=>`<div class="customer-dashboard-filters ${state.filtersOpen?'open':''}">
  <div class="customer-dashboard-search-row">
   <label class="customer-dashboard-search"><span>Tìm khách hàng</span><input id="customerDashboardSearch" type="search" value="${esc(state.filters.q)}" placeholder="Tên, MST, SĐT, email, số HĐKT"></label>
   <button type="button" id="customerDashboardFilterToggle" aria-expanded="${state.filtersOpen?'true':'false'}">Bộ lọc ${state.filtersOpen?'▴':'▾'}</button>
   <strong>${rows.length.toLocaleString('vi-VN')}/${state.customers.length.toLocaleString('vi-VN')}</strong>
  </div>
  <div class="customer-dashboard-filter-extra">
  <label><span>Nguồn</span><select id="customerDashboardSource">
   <option value="all"${state.filters.source==='all'?' selected':''}>Tất cả</option>
   <option value="sapo"${state.filters.source==='sapo'?' selected':''}>Sapo</option>
   <option value="local"${state.filters.source==='local'?' selected':''}>Ngoài Sapo</option>
  </select></label>
  <label><span>Bộ lọc</span><select id="customerDashboardStatus">
   <option value="all"${state.filters.status==='all'?' selected':''}>Tất cả</option>
   <option value="hasQuote"${state.filters.status==='hasQuote'?' selected':''}>Có báo giá</option>
   <option value="hasContract"${state.filters.status==='hasContract'?' selected':''}>Đã sinh HĐKT</option>
   <option value="noQuote"${state.filters.status==='noQuote'?' selected':''}>Chưa có báo giá</option>
   <option value="hasDiscount"${state.filters.status==='hasDiscount'?' selected':''}>Có CK riêng</option>
  </select></label>
  <label><span>Sắp xếp</span><select id="customerDashboardSort">
   <option value="recent"${state.filters.sort==='recent'?' selected':''}>Mới phát sinh</option>
   <option value="revenue"${state.filters.sort==='revenue'?' selected':''}>Tổng báo giá cao</option>
   <option value="quotes"${state.filters.sort==='quotes'?' selected':''}>Nhiều báo giá</option>
   <option value="name"${state.filters.sort==='name'?' selected':''}>Tên A-Z</option>
  </select></label>
  </div>
 </div>`;
 const kpis=rows=>{
  const total=rows.reduce((sum,customer)=>sum+Number(customer.quoteTotal||0),0),quoted=rows.filter(customer=>customer.quoteCount>0).length,contracts=rows.reduce((sum,customer)=>sum+Number(customer.contractCount||0),0),locals=rows.filter(customer=>customer.source==='local').length;
  return `<div class="customer-dashboard-kpis">
   <article><span>Khách hàng</span><b>${rows.length.toLocaleString('vi-VN')}</b></article>
   <article><span>Có báo giá</span><b>${quoted.toLocaleString('vi-VN')}</b></article>
   <article><span>Tổng giá trị BG</span><b>${money(total)}</b></article>
   <article><span>HĐKT đã sinh</span><b>${contracts.toLocaleString('vi-VN')}</b></article>
   <article><span>Ngoài Sapo</span><b>${locals.toLocaleString('vi-VN')}</b></article>
  </div>`;
 };
 const statusClass=customer=>customer.contractCount?'contract':customer.quoteCount?'quoted':'new';
 const approvalGroup=customer=>customer.source==='local'?'Khách web báo giá':'Khách Sapo / đã đồng bộ';
 const purchaseGroup=customer=>customer.contractCount?'Đã sinh HĐKT':customer.quoteCount?'Đã có báo giá':'Khách chưa mua hàng';
 const discountText=customer=>{
  const d=customer.discounts||{},parts=[];
  if(d.minhLong!==undefined)parts.push('ML '+d.minhLong+'%');
  if(d.lys!==undefined)parts.push('Lys '+d.lys+'%');
  if(d.lock!==undefined)parts.push('Lock '+d.lock+'%');
  return parts.join(' · ');
 };
 const statusText=customer=>customer.contractCount?`Đã sinh HĐKT · ${Number(customer.contractCount||0).toLocaleString('vi-VN')} HĐKT`:customer.quoteCount?'Đã có báo giá':'Khách chưa mua hàng';
  const card=customer=>{
  const tone=customer.contractCount?'ok':customer.quoteCount?'neutral':'new',contracts=customerContracts(customer),contractText=contracts.length?`HĐKT ${contracts.slice(0,3).join(', ')}${contracts.length>3?'...':''}`:'';
  return `<button type="button" class="customer-dashboard-card ${tone}" data-customer-id="${esc(customer.id)}">
   ${logoHtml(customer)}
   <span class="customer-dashboard-card-copy">
    <span class="customer-dashboard-card-title"><strong>${esc(customer.name||'Khách hàng')}</strong>${customer.contractCount?`<i>HĐKT ${Number(customer.contractCount||0).toLocaleString('vi-VN')}</i>`:''}</span>
    <em class="customer-dashboard-status ${statusClass(customer)}">${esc(statusText(customer))}</em>
    <small>${esc([customer.customerCode||sourceLabel(customer),customer.taxCode,customer.phone,Number(customer.quoteCount||0)?`${Number(customer.quoteCount||0).toLocaleString('vi-VN')} BG · ${money(customer.quoteTotal||0)}`:'',contractText].filter(Boolean).join(' · '))}</small>
   </span>
  </button>`;
 };
 const groupedList=rows=>{
  const groups=new Map();
  for(const customer of rows){
   const approval=approvalGroup(customer),purchase=purchaseGroup(customer),owner=customerOwner(customer);
   if(!groups.has(approval))groups.set(approval,new Map());
   const purchaseGroups=groups.get(approval);
   if(!purchaseGroups.has(purchase))purchaseGroups.set(purchase,new Map());
   const ownerGroups=purchaseGroups.get(purchase);
   if(!ownerGroups.has(owner))ownerGroups.set(owner,[]);
   ownerGroups.get(owner).push(customer);
  }
  return [...groups.entries()].map(([approval,purchaseGroups])=>{
   const approvalCount=[...purchaseGroups.values()].reduce((sum,ownerGroups)=>sum+[...ownerGroups.values()].reduce((n,items)=>n+items.length,0),0);
   return `<section class="customer-dashboard-appsheet-group"><h3>${esc(approval)} <b>${approvalCount.toLocaleString('vi-VN')}</b></h3>${[...purchaseGroups.entries()].map(([purchase,ownerGroups])=>{
    const purchaseCount=[...ownerGroups.values()].reduce((sum,items)=>sum+items.length,0);
    return `<section class="customer-dashboard-purchase-group"><h4>${esc(purchase)} <b>${purchaseCount.toLocaleString('vi-VN')}</b></h4>${[...ownerGroups.entries()].map(([owner,items])=>`<section class="customer-dashboard-group">
     <header class="customer-dashboard-owner"><span class="customer-dashboard-owner-photo">${esc(initials(owner))}</span><b>${esc(owner)}</b><i>${items.length.toLocaleString('vi-VN')}</i><em>›</em></header>
     <div class="customer-dashboard-list">${items.map(card).join('')}</div>
    </section>`).join('')}</section>`;
   }).join('')}</section>`;
  }).join('');
 };
 const render=()=>{
  const rows=filtered(),panel=$('customerDashboardPanel');
  panel.innerHTML=`<header class="customer-dashboard-head crm-style"><button type="button" id="customerDashboardClose" aria-label="Đóng">‹</button><span class="customer-dashboard-app-logo">VG</span><div><h2>Khách hàng</h2><small>${rows.length.toLocaleString('vi-VN')} khách công ty/hộ kinh doanh${state.limited?' · dữ liệu báo giá mới nhất':''}</small></div><button type="button" id="customerDashboardSearchFocus" aria-label="Tìm kiếm">⌕</button><button type="button" id="customerDashboardRefresh" aria-label="Làm mới">↻</button></header>${filterBar(rows)}<main class="customer-dashboard-groups">${rows.length?groupedList(rows):'<p class="customer-dashboard-empty">Không có khách hàng phù hợp bộ lọc.</p>'}</main>`;
 };
 const relationList=(title,items,mapper)=>`<section class="customer-detail-section"><h3>${esc(title)} <b>${items.length.toLocaleString('vi-VN')}</b></h3>${items.length?`<div>${items.slice(0,20).map(mapper).join('')}</div>`:'<p>Chưa có dữ liệu liên quan.</p>'}</section>`;
 const detail=customer=>{
  const html=`<div class="customer-detail-backdrop"><section class="customer-detail-sheet">
   <header><button type="button" data-customer-detail-close>‹</button><div>${logoHtml(customer)}</div><span><p>${esc([sourceLabel(customer),customer.customerCode].filter(Boolean).join(' · ')||'Khách hàng web báo giá')}</p><h2>${esc(customer.name||'Khách hàng')}</h2></span></header>
   <div class="customer-detail-actions"><button type="button" class="btn primary" data-customer-quote="${esc(customer.id)}">Tạo báo giá</button></div>
   <div class="customer-detail-kpis">
    <article><span>Tổng giá trị BG</span><b>${money(customer.quoteTotal||0)}</b></article>
    <article><span>Số báo giá</span><b>${Number(customer.quoteCount||0).toLocaleString('vi-VN')}</b></article>
    <article><span>HĐKT</span><b>${Number(customer.contractCount||0).toLocaleString('vi-VN')}</b></article>
    <article><span>Cập nhật</span><b>${esc(dateText(customer.lastQuoteAt||customer.syncedAt)||'—')}</b></article>
   </div>
   <dl class="customer-detail-fields">
    <div><dt>MST</dt><dd>${esc(customer.taxCode||'—')}</dd></div>
    <div><dt>SĐT</dt><dd>${esc(customer.phone||'—')}</dd></div>
    <div><dt>Email</dt><dd>${esc(customer.email||'—')}</dd></div>
    <div><dt>Người liên hệ</dt><dd>${esc(customer.contact||'—')}</dd></div>
    <div><dt>CK riêng</dt><dd>${esc(discountText(customer)||'—')}</dd></div>
    <div><dt>Nhân viên từng báo giá</dt><dd>${esc((customer.owners||[]).join(', ')||'—')}</dd></div>
    <div class="wide"><dt>Địa chỉ</dt><dd>${esc(customer.address||'—')}</dd></div>
   </dl>
   ${relationList('Báo giá đã lưu',customer.quotes||[],quote=>`<article><b>${esc(quote.quoteNo||'—')}</b><small>${esc([quote.type,dateText(quote.date||quote.updatedAt),quote.creatorName,quote.position,money(quote.total||0),quote.contractNumber?'HĐKT '+quote.contractNumber:''].filter(Boolean).join(' · '))}</small></article>`)}
  </section></div>`;
  document.body.insertAdjacentHTML('beforeend',html);
 };
 const installEvents=()=>{
  document.addEventListener('input',event=>{if(event.target.id==='customerDashboardSearch'){state.filters.q=event.target.value;render();}},true);
  document.addEventListener('change',event=>{
   if(event.target.id==='customerDashboardSource'){state.filters.source=event.target.value;render();}
   if(event.target.id==='customerDashboardStatus'){state.filters.status=event.target.value;render();}
   if(event.target.id==='customerDashboardSort'){state.filters.sort=event.target.value;render();}
  },true);
  document.addEventListener('click',event=>{
   const card=event.target.closest?.('[data-customer-id]');
   if(card){const customer=state.customers.find(item=>String(item.id)===String(card.dataset.customerId));if(customer)detail(customer);return;}
   const quoteButton=event.target.closest?.('[data-customer-quote]');
   if(quoteButton){const customer=state.customers.find(item=>String(item.id)===String(quoteButton.dataset.customerQuote));if(customer&&BN.startQuoteForCustomer?.(customer)){document.querySelector('.customer-detail-backdrop')?.remove();close();}return;}
   if(event.target.closest?.('#customerDashboardFilterToggle')){state.filtersOpen=!state.filtersOpen;render();return;}
   if(event.target.closest?.('#customerDashboardSearchFocus')){$('customerDashboardSearch')?.focus();return;}
   if(event.target.closest?.('#customerDashboardRefresh')){state.loaded=false;state.loading=null;open();return;}
   if(event.target.closest?.('#customerDashboardClose'))close();
   if(event.target.closest?.('[data-customer-detail-close]')||event.target.classList?.contains('customer-detail-backdrop'))document.querySelector('.customer-detail-backdrop')?.remove();
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){document.querySelector('.customer-detail-backdrop')?.remove();if($('customerDashboardPage')?.classList.contains('open'))close();}});
 };
 const ensurePage=()=>{
  let page=$('customerDashboardPage');
  if(page)return page;
  page=document.createElement('section');page.id='customerDashboardPage';page.className='customer-dashboard-page';page.setAttribute('aria-hidden','true');page.innerHTML='<div id="customerDashboardPanel" class="customer-dashboard-panel"><p class="customer-dashboard-empty">Đang tải khách hàng…</p></div>';document.body.append(page);
  return page;
 };
 const open=async()=>{
  const page=ensurePage();document.documentElement.classList.add('customer-dashboard-locked');document.body.classList.add('customer-dashboard-locked');page.classList.add('open');page.setAttribute('aria-hidden','false');$('customerDashboardPanel').innerHTML='<p class="customer-dashboard-empty">Đang tải khách hàng web báo giá…</p>';
  try{await load();render();}catch(error){$('customerDashboardPanel').innerHTML=`<header class="customer-dashboard-head"><div><p>WEB BÁO GIÁ</p><h2>Khách hàng</h2></div><button type="button" id="customerDashboardClose" aria-label="Đóng">×</button></header><p class="customer-dashboard-empty">${esc(error.message)}</p>`;}
 };
 const close=()=>{const page=$('customerDashboardPage');if(page){page.classList.remove('open');page.setAttribute('aria-hidden','true');}document.documentElement.classList.remove('customer-dashboard-locked');document.body.classList.remove('customer-dashboard-locked');};
 let lastTouchEnd=0;
 document.addEventListener('touchend',event=>{if(!$('customerDashboardPage')?.classList.contains('open'))return;const now=Date.now();if(now-lastTouchEnd<=300)event.preventDefault();lastTouchEnd=now;},{passive:false});
 document.addEventListener('gesturestart',event=>{if($('customerDashboardPage')?.classList.contains('open'))event.preventDefault();},{passive:false});
 BN.openCustomerDashboard=open;
 installEvents();
 document.addEventListener('click',event=>{
  const trigger=event.target.closest?.('#mobileAddRowNav');
  if(!trigger)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();open();
 },true);
})();
