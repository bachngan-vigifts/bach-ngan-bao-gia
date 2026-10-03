(()=>{
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
 const money=value=>(Math.round(Number(value||0)||0)).toLocaleString('vi-VN')+' đ';
 const number=value=>Number(value||0).toLocaleString('vi-VN',{maximumFractionDigits:3});
 const pageSize=100;
 const state={loaded:false,loading:null,filtersOpen:false,visible:pageSize,products:[],meta:{warehouses:[],pricePolicies:[]},filters:{q:'',quality:'all',stock:'all',brand:'all',sort:'recent',price:'0'}};
 const lineState={loaded:false,loading:null,visible:pageSize,lines:[],statuses:[],careCards:[],status:'All',q:'',total:0,quotes:0,limited:false};
 let mode='status';
 let searchTimer=null;
 const statusOrder=['All','Đang sản xuất mẫu','Đã giao hàng','Đợi giao hàng','Đợi triển khai'];
 const statusClass=name=>({'Đang sản xuất mẫu':'sample','Đã giao hàng':'delivered','Đợi giao hàng':'waiting-delivery','Đợi triển khai':'waiting-start'}[name]||'other');
 const isImageHost=value=>{try{const host=new URL(value).hostname;return host==='drive.google.com'||host.endsWith('.googleusercontent.com')||['sapo.dktcdn.net','bizweb.dktcdn.net'].includes(host)}catch{return false}};
 const imageUrl=(value,size='icon')=>{const src=String(value||'').trim();if(!src)return '';return isImageHost(src)?`/api/image?size=${size}&src=${encodeURIComponent(src)}`:src};
 const initials=product=>String(product?.name||product?.sku||'SP').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'SP';
 const productImage=product=>product.image?`<img src="${esc(imageUrl(product.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:`<span>${esc(initials(product))}</span>`;
 const stockAt=(product,warehouse)=>{const index=state.meta.warehouses.indexOf(warehouse),value=Number(product.stock?.[index]);return index>=0&&Number.isFinite(value)?value:null};
 const availableStock=product=>state.meta.warehouses.reduce((sum,warehouse,index)=>['NCC','Hàng chờ về'].includes(warehouse)?sum:sum+(Number(product.stock?.[index])||0),0);
 const supplierStock=product=>stockAt(product,'NCC');
 const incomingStock=product=>stockAt(product,'Hàng chờ về');
 const hasPrice=product=>(product.prices||[]).some(value=>Number(value)>0);
 const hasPacking=product=>Number(product.perCarton)>0&&Number(product.cartonLength)>0&&Number(product.cartonWidth)>0&&Number(product.cartonHeight)>0;
 const hasTax=product=>!product.taxable||Number.isFinite(Number(product.taxOut));
 const hasImage=product=>Boolean(product.image);
 const currentQuoteType=()=>document.querySelector('.quote-type.active')?.dataset.type||'HRC';
 const isMinhLongProduct=product=>{const q=normalize(`${product?.brand||''} ${product?.name||''}`);return q.includes('minh long')||q.includes('healthy cook')||q.includes('su duong sinh')};
 const allowedForQuoteType=product=>currentQuoteType()==='VIGIFTS'?!isMinhLongProduct(product):isMinhLongProduct(product);
 const qualityGroup=product=>hasPrice(product)&&hasImage(product)&&hasTax(product)?'Đã duyệt / đủ dữ liệu':'Cần cập nhật dữ liệu';
 const sellingGroup=product=>hasPrice(product)&&(availableStock(product)>0||Number(supplierStock(product))>0||Number(incomingStock(product))>0)?'Đang bán / có dữ liệu':'Chưa bán / thiếu dữ liệu';
 const brandGroup=product=>product.brand||'Chưa có nhãn hiệu';
 const currentPriceIndex=()=>Math.max(0,Math.min(Number(state.filters.price)||0,(state.meta.pricePolicies||[]).length-1));
 const currentPrice=product=>product.prices?.[currentPriceIndex()]??null;
 const productSearch=product=>normalize([product.sku,product.name,product.brand,product.pattern,product.unit].join(' '));
 const enrich=(product,index)=>({...product,_index:index,_search:productSearch(product)});
 const withTimeout=(promise,ms,message)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(message)),ms))]);
 const load=async(force=false)=>{
  if(state.loaded&&!force)return;
  if(state.loading)return state.loading;
  const snapshot=!force&&BN.getCatalogSnapshot?.();
  if(snapshot?.products?.length){
   state.meta=snapshot.meta||{warehouses:[],pricePolicies:[]};
   state.products=snapshot.products.map(enrich);
   state.loaded=true;
   return;
  }
  state.loading=BN.api('/catalog').then(data=>{state.meta=data;state.products=(data.products||[]).map(enrich);state.loaded=true;}).finally(()=>{state.loading=null;});
  return state.loading;
 };
 const loadLines=async(force=false)=>{
  if(lineState.loaded&&!force)return;
  if(lineState.loading)return lineState.loading;
  lineState.loading=withTimeout(BN.api('/quote-product-lines'),25000,'Tải chi tiết sản phẩm quá lâu. Vui lòng bấm làm mới để thử lại.').then(data=>{
   lineState.lines=(data.lines||[]).map((line,index)=>({...line,_index:index,_search:normalize([line.status,line.quoteNo,line.customer,line.creatorName,line.position,line.sku,line.name,line.brand,line.pattern].join(' '))}));
   lineState.careCards=data.careCards||[];
   lineState.statuses=data.statuses||[];lineState.total=data.total||0;lineState.quotes=data.quotes||0;lineState.limited=Boolean(data.limited);lineState.loaded=true;
  }).finally(()=>{lineState.loading=null;});
  return lineState.loading;
 };
 const filtered=()=>{
  const q=normalize(state.filters.q);
  let rows=state.products.filter(product=>{
   if(!allowedForQuoteType(product))return false;
   if(q&&!product._search.includes(q))return false;
   return true;
  });
  return [...rows].sort((a,b)=>Number(b._index)-Number(a._index));
 };
 const brandOptions=()=>[...new Set(state.products.map(product=>product.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi')).slice(0,80);
 const filterBar=(rows,shownCount)=>`<div class="product-dashboard-filters">
  <div class="product-dashboard-search-row">
   <label><span>Tìm sản phẩm</span><input id="productDashboardSearch" type="search" value="${esc(state.filters.q)}" placeholder="Tên, mã SKU, nhãn hiệu"></label>
   <strong>${shownCount.toLocaleString('vi-VN')}/${rows.length.toLocaleString('vi-VN')}</strong>
  </div>
 </div>`;
 const card=product=>{
  const price=currentPrice(product),available=availableStock(product),missing=[hasPrice(product)?'':'giá',hasImage(product)?'':'ảnh',hasTax(product)?'':'thuế',hasPacking(product)?'':'quy cách'].filter(Boolean),tone=missing.length?'needs-update':'ok';
  return `<article class="product-dashboard-card ${tone}" data-product-sku="${esc(product.sku)}">
   <span class="product-dashboard-logo">${productImage(product)}</span>
   <span class="product-dashboard-card-copy">
    <span class="product-dashboard-card-title"><strong>${esc(product.name||'Sản phẩm')}</strong></span>
    <em class="product-dashboard-status ${tone}">${missing.length?'Thiếu '+missing.join(', '):'Đủ dữ liệu'}</em>
    <small>${esc([product.sku,product.brand,product.pattern,product.unit].filter(Boolean).join(' · '))}</small>
    <span class="product-dashboard-card-stats"><b>${price===null?'Chưa có giá':money(price)}</b><b>Tồn ${number(available)}</b><b>NCC ${supplierStock(product)===null?'—':number(supplierStock(product))}</b><b>Chờ ${incomingStock(product)===null?'—':number(incomingStock(product))}</b></span>
   </span>
   <button type="button" class="product-dashboard-quick-add" data-product-add="${esc(product.sku)}" aria-label="Chọn ${esc(product.name||product.sku||'sản phẩm')} vào báo giá">+ Chọn</button>
  </article>`;
 };
 const groupedList=rows=>{
  const groups=new Map();
  for(const product of rows){
   const quality=qualityGroup(product),selling=sellingGroup(product),brand=brandGroup(product);
   if(!groups.has(quality))groups.set(quality,new Map());
   const sellingGroups=groups.get(quality);
   if(!sellingGroups.has(selling))sellingGroups.set(selling,new Map());
   const brandGroups=sellingGroups.get(selling);
   if(!brandGroups.has(brand))brandGroups.set(brand,[]);
   brandGroups.get(brand).push(product);
  }
  return [...groups.entries()].map(([quality,sellingGroups])=>{
   const qualityCount=[...sellingGroups.values()].reduce((sum,brandGroups)=>sum+[...brandGroups.values()].reduce((n,items)=>n+items.length,0),0);
   return `<section class="product-dashboard-appsheet-group"><h3>${esc(quality)} <b>${qualityCount.toLocaleString('vi-VN')}</b></h3>${[...sellingGroups.entries()].map(([selling,brandGroups])=>{
    const sellingCount=[...brandGroups.values()].reduce((sum,items)=>sum+items.length,0);
    return `<section class="product-dashboard-selling-group"><h4>${esc(selling)} <b>${sellingCount.toLocaleString('vi-VN')}</b></h4>${[...brandGroups.entries()].map(([brand,items])=>`<section class="product-dashboard-group">
     <header class="product-dashboard-owner"><span class="product-dashboard-owner-photo">${esc(brand.slice(0,2).toUpperCase()||'SP')}</span><b>${esc(brand)}</b><i>${items.length.toLocaleString('vi-VN')}</i><em>›</em></header>
     <div class="product-dashboard-list">${items.map(card).join('')}</div>
    </section>`).join('')}</section>`;
   }).join('')}</section>`;
  }).join('');
 };
 const statusRows=()=>{
  const counts=new Map((lineState.statuses||[]).map(item=>[item.name,Number(item.count)||0]));
  const names=[...new Set([...statusOrder.filter(name=>name!=='All'),...(lineState.statuses||[]).map(item=>item.name)])];
  return [{name:'All',count:lineState.total},...names.map(name=>({name,count:counts.get(name)||0}))];
 };
 const lineImage=line=>line.image?`<img src="${esc(imageUrl(line.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:`<span>${esc(String(line.name||line.sku||'SP').slice(0,2).toUpperCase())}</span>`;
 const statusHeader=(title,sub='',back='close')=>`<header class="product-dashboard-head crm-style"><button type="button" id="${back==='status'?'productStatusBack':'productDashboardClose'}" aria-label="${back==='status'?'Quay lại':'Đóng'}">‹</button><span class="product-dashboard-app-logo">SP</span><div><h2>${esc(title)}</h2><small>${esc(sub)}</small></div><button type="button" id="productLineSearchFocus" aria-label="Tìm kiếm">⌕</button><button type="button" id="productDashboardRefresh" aria-label="Làm mới">↻</button></header>`;
 const formatDate=value=>value?String(value).split('-').reverse().join('/'):'—';
 const careCard=card=>`<article class="customer-care-card" data-care-card="${esc(card.quoteId)}"><div><b>${esc(card.customer||'Chưa nhập khách')}</b><small>${esc(card.quoteNo||'Báo giá')} · ${esc(card.creatorName||'')} · nhắc ${esc(formatDate(card.careDueDate))}</small><span>${esc([card.contact,card.phone,card.email].filter(Boolean).join(' · ')||'Chưa có thông tin liên hệ')}</span></div><div class="customer-care-actions"><button type="button" data-open-care-quote="${esc(card.quoteId)}">Mở</button><button type="button" data-care-status="closed" data-care-quote="${esc(card.quoteId)}">Đã chốt</button><button type="button" data-care-status="lost" data-care-quote="${esc(card.quoteId)}">Đã rớt</button></div></article>`;
 const renderStatusHome=()=>{
  mode='status';const panel=$('productDashboardPanel'),rows=statusRows();
  panel.innerHTML=`${statusHeader('Chi tiết sản phẩm',`${lineState.total.toLocaleString('vi-VN')} dòng sản phẩm từ ${lineState.quotes.toLocaleString('vi-VN')} báo giá${lineState.limited?' · dữ liệu mới nhất':''}`)}
  <main class="product-status-home">
   <section class="product-status-section customer-care-section"><h3>Khách hàng đang chăm sóc <b>${lineState.careCards.length.toLocaleString('vi-VN')}</b></h3>${lineState.careCards.length?lineState.careCards.map(careCard).join(''):'<p class="product-dashboard-empty">Chưa có lịch chăm sóc đang mở.</p>'}</section>
   <section class="product-status-section"><h3>Status</h3>${rows.map(item=>`<button type="button" class="product-status-row ${statusClass(item.name)}" data-product-status="${esc(item.name)}"><span class="product-status-dot"></span><b>${esc(item.name)}</b><i>${item.count.toLocaleString('vi-VN')}</i><em>›</em></button>`).join('')}</section>
   <button type="button" class="product-dashboard-more" id="productCatalogOpen">Danh mục sản phẩm</button>
  </main>
  <nav class="product-status-tabs" aria-label="Điều hướng AppSheet"><span>⌂<b>Home</b></span><span>KH<b>Khách hàng</b></span><span>HĐ<b>HĐKT</b></span><span>CN<b>CÔNG NỢ</b></span></nav>`;
 };
 const filteredLines=()=>{
  const q=normalize(lineState.q),status=lineState.status;
  return lineState.lines.filter(line=>(status==='All'||line.status===status)&&(!q||line._search.includes(q)));
 };
 const lineCard=line=>`<button type="button" class="product-line-card" data-product-line="${esc(line.id)}">
  <span class="product-line-photo">${lineImage(line)}</span>
  <span class="product-line-copy"><b>${esc(line.name||'Sản phẩm')}</b><small>${esc([line.sku,line.brand,line.pattern].filter(Boolean).join(' · '))}</small><em class="${statusClass(line.status)}">${esc(line.status)}</em><span>${esc(line.quoteNo||'Báo giá')} · ${esc(line.customer||'Chưa nhập khách')}</span><span>${number(line.qty)} ${esc(line.unit||'')} · ${money(line.lineTotal)} · ${esc(line.creatorName||'')}</span></span>
 </button>`;
 const renderStatusLines=status=>{
  mode='lines';lineState.status=status||lineState.status||'All';const rows=filteredLines(),shown=rows.slice(0,lineState.visible),more=rows.length>shown.length?`<button type="button" class="product-dashboard-more" id="productLineMore">Hiện thêm ${Math.min(pageSize,rows.length-shown.length).toLocaleString('vi-VN')} dòng</button>`:'';
  $('productDashboardPanel').innerHTML=`${statusHeader(lineState.status,lineState.status==='All'?`${rows.length.toLocaleString('vi-VN')} dòng sản phẩm`:`${rows.length.toLocaleString('vi-VN')} dòng trong trạng thái này`,'status')}
  <div class="product-line-search"><input id="productLineSearch" type="search" value="${esc(lineState.q)}" placeholder="Tìm mã, tên sản phẩm, báo giá, khách hàng"></div>
  <main class="product-line-list">${shown.length?shown.map(lineCard).join('')+more:'<p class="product-dashboard-empty">Không có dòng sản phẩm phù hợp.</p>'}</main>`;
 };
 const lineDetail=line=>{
  const html=`<div class="product-detail-backdrop"><section class="product-detail-sheet product-line-detail">
   <header><button type="button" data-product-detail-close>‹</button><div class="product-detail-image">${lineImage(line)}</div><span><p>${esc([line.status,line.quoteNo].filter(Boolean).join(' · '))}</p><h2>${esc(line.name||'Sản phẩm')}</h2></span></header>
   <div class="product-detail-actions"><button type="button" class="btn primary" data-open-line-quote="${esc(line.quoteId)}">Mở báo giá</button><button type="button" class="btn soft" data-product-detail-close>Đóng</button></div>
   <div class="product-detail-kpis"><article><span>Số lượng</span><b>${number(line.qty)} ${esc(line.unit||'')}</b></article><article><span>Thành tiền</span><b>${money(line.lineTotal)}</b></article><article><span>Đơn giá</span><b>${money(line.price)}</b></article><article><span>Nhân viên</span><b>${esc(line.creatorName||'—')}</b></article></div>
   <dl class="product-detail-fields">${field('Mã hàng',line.sku)}${field('Khách hàng',line.customer)}${field('Số báo giá',line.quoteNo)}${field('Nhãn hiệu',line.brand)}${field('Hoa văn / phiên bản',line.pattern)}${field('Ngày báo giá',line.quoteDate||line.createdAt)}</dl>
  </section></div>`;
  document.body.insertAdjacentHTML('beforeend',html);
 };
 const render=()=>{
  mode='catalog';
  const rows=filtered(),shown=rows.slice(0,state.visible),panel=$('productDashboardPanel'),more=rows.length>shown.length?`<button type="button" class="product-dashboard-more" id="productDashboardMore">Hiện thêm ${Math.min(pageSize,rows.length-shown.length).toLocaleString('vi-VN')} sản phẩm</button>`:'';
  panel.innerHTML=`<header class="product-dashboard-head crm-style"><button type="button" id="productDashboardClose" aria-label="Đóng">‹</button><span class="product-dashboard-app-logo">SP</span><div><h2>Sản phẩm</h2><small>${rows.length.toLocaleString('vi-VN')} sản phẩm phù hợp · đang hiện ${shown.length.toLocaleString('vi-VN')}</small></div><button type="button" id="productDashboardSearchFocus" aria-label="Tìm kiếm">⌕</button><button type="button" id="productDashboardRefresh" aria-label="Làm mới">↻</button></header>${filterBar(rows,shown.length)}<main class="product-dashboard-groups"><div class="product-dashboard-list">${shown.length?shown.map(card).join(''):'<p class="product-dashboard-empty">Không có sản phẩm phù hợp loại báo giá.</p>'}</div>${shown.length?more:''}</main>`;
 };
 const field=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${esc(value||'—')}</dd></div>`;
 const warningList=product=>[hasPrice(product)?'':'Thiếu giá bán',hasImage(product)?'':'Thiếu ảnh',hasTax(product)?'':'Thiếu thuế đầu ra',hasPacking(product)?'':'Thiếu quy cách đóng thùng'].filter(Boolean);
 const detail=product=>{
  const prices=(state.meta.pricePolicies||[]).map((policy,index)=>({policy,value:product.prices?.[index]})),stockRows=(state.meta.warehouses||[]).map((warehouse,index)=>({warehouse,value:product.stock?.[index]})),warnings=warningList(product);
  const html=`<div class="product-detail-backdrop"><section class="product-detail-sheet">
   <header><button type="button" data-product-detail-close>‹</button><div class="product-detail-image">${productImage(product)}</div><span><p>${esc([product.brand||'Chưa có nhãn hiệu',product.sku].filter(Boolean).join(' · '))}</p><h2>${esc(product.name||'Sản phẩm')}</h2></span></header>
   <div class="product-detail-actions"><button type="button" class="btn primary" data-product-add="${esc(product.sku)}">Chọn vào báo giá</button><button type="button" class="btn soft" data-product-edit="${esc(product.sku)}">Cập nhật</button></div>
   ${warnings.length?`<div class="product-detail-warnings">${warnings.map(item=>`<b>${esc(item)}</b>`).join('')}</div>`:''}
   <div class="product-detail-kpis">
    <article><span>Giá đang xem</span><b>${currentPrice(product)===null?'—':money(currentPrice(product))}</b></article>
    <article><span>Tồn khả dụng</span><b>${number(availableStock(product))}</b></article>
    <article><span>Tồn NCC</span><b>${supplierStock(product)===null?'—':number(supplierStock(product))}</b></article>
    <article><span>Hàng chờ về</span><b>${incomingStock(product)===null?'—':number(incomingStock(product))}</b></article>
   </div>
   <dl class="product-detail-fields">
    ${field('Mã hàng',product.sku)}${field('Đơn vị tính',product.unit)}${field('Hoa văn / phiên bản',product.pattern)}${field('Thuế đầu ra',product.taxable?(product.taxOut===null?'Chưa có':`${product.taxOut}%`):'Không áp dụng')}${field('Cơ sở giá',product.taxBasis)}${field('Quy cách',hasPacking(product)?`${number(product.perCarton)} ${product.unit||'cái'}/thùng · ${number(product.cartonLength)}x${number(product.cartonWidth)}x${number(product.cartonHeight)} cm · ${number(product.cartonWeight)} kg`:'—')}
   </dl>
   <section class="product-detail-section"><h3>Chính sách giá <b>${prices.length.toLocaleString('vi-VN')}</b></h3><div>${prices.map(item=>`<article><b>${esc(item.policy)}</b><small>${item.value===null?'Chưa có giá':money(item.value)}</small></article>`).join('')}</div></section>
   <section class="product-detail-section"><h3>Tồn kho <b>${stockRows.length.toLocaleString('vi-VN')}</b></h3><div>${stockRows.map(item=>`<article><b>${esc(item.warehouse)}</b><small>${item.value===null||item.value===undefined?'Chưa có số liệu':number(item.value)}</small></article>`).join('')}</div></section>
  </section></div>`;
  document.body.insertAdjacentHTML('beforeend',html);
 };
 const closeDetail=()=>document.querySelector('.product-detail-backdrop')?.remove();
 const installEvents=()=>{
  const resetRender=()=>{state.visible=pageSize;render();};
  const resetLineRender=()=>{lineState.visible=pageSize;renderStatusLines(lineState.status);};
  document.addEventListener('input',event=>{if(event.target.id==='productDashboardSearch'){clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.filters.q=event.target.value;resetRender();},350);}},true);
  document.addEventListener('input',event=>{if(event.target.id==='productLineSearch'){lineState.q=event.target.value;resetLineRender();}},true);
  document.addEventListener('click',event=>{
   const openCareQuote=event.target.closest?.('[data-open-care-quote]');
   if(openCareQuote){close();BN.openSavedQuote?.(openCareQuote.dataset.openCareQuote);return;}
   const careButton=event.target.closest?.('[data-care-status]');
   if(careButton){const status=careButton.dataset.careStatus,quoteId=careButton.dataset.careQuote,label=status==='closed'?'Đã chốt':'Đã rớt';if(!confirm(`Chuyển khách hàng này sang trạng thái ${label} và xóa lịch chăm sóc?`))return;careButton.disabled=true;BN.api('/quotes/'+encodeURIComponent(quoteId)+'/care','POST',{status}).then(()=>{lineState.careCards=lineState.careCards.filter(item=>item.quoteId!==quoteId);renderStatusHome();}).catch(error=>{alert(error.message);careButton.disabled=false;});return;}
   const statusButton=event.target.closest?.('[data-product-status]');
   if(statusButton){lineState.status=statusButton.dataset.productStatus||'All';lineState.q='';lineState.visible=pageSize;renderStatusLines(lineState.status);return;}
   const lineButton=event.target.closest?.('[data-product-line]');
   if(lineButton){const line=lineState.lines.find(item=>String(item.id)===String(lineButton.dataset.productLine));if(line)lineDetail(line);return;}
   const openLineQuote=event.target.closest?.('[data-open-line-quote]');
   if(openLineQuote){const id=openLineQuote.dataset.openLineQuote;closeDetail();close();BN.openSavedQuote?.(id);return;}
   if(event.target.closest?.('#productStatusBack')){lineState.q='';lineState.visible=pageSize;renderStatusHome();return;}
   if(event.target.closest?.('#productLineMore')){lineState.visible+=pageSize;renderStatusLines(lineState.status);return;}
   if(event.target.closest?.('#productLineSearchFocus')){$('productLineSearch')?.focus();return;}
   if(event.target.closest?.('#productCatalogOpen')){openCatalog();return;}
   const edit=event.target.closest?.('[data-product-edit]');
   if(edit){closeDetail();close();BN.openCatalogProductEditor?.(edit.dataset.productEdit);return;}
   const add=event.target.closest?.('[data-product-add]');
   if(add){const ok=BN.addCatalogProduct?.(add.dataset.productAdd);if(ok!==false){closeDetail();close();}return;}
   const cardEl=event.target.closest?.('[data-product-sku]');
   if(cardEl){const product=state.products.find(item=>String(item.sku)===String(cardEl.dataset.productSku));if(product)detail(product);return;}
   if(event.target.closest?.('#productDashboardMore')){state.visible+=pageSize;render();return;}
   if(event.target.closest?.('#productDashboardSearchFocus')){$('productDashboardSearch')?.focus();return;}
   if(event.target.closest?.('#productDashboardRefresh')){if(mode==='catalog'){state.loaded=false;state.loading=null;openCatalog(true);}else{lineState.loaded=false;lineState.loading=null;open(true);}return;}
   if(event.target.closest?.('#productDashboardClose'))close();
   if(event.target.closest?.('[data-product-detail-close]')||event.target.classList?.contains('product-detail-backdrop'))closeDetail();
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeDetail();if($('productDashboardPage')?.classList.contains('open'))close();}});
 };
 const ensurePage=()=>{
  let page=$('productDashboardPage');
  if(page)return page;
  page=document.createElement('section');page.id='productDashboardPage';page.className='product-dashboard-page';page.setAttribute('aria-hidden','true');page.innerHTML='<div id="productDashboardPanel" class="product-dashboard-panel"><p class="product-dashboard-empty">Đang tải sản phẩm…</p></div>';document.body.append(page);
  return page;
 };
 const showPage=()=>{
  const page=ensurePage();document.documentElement.classList.add('product-dashboard-locked');document.body.classList.add('product-dashboard-locked');page.classList.add('open');page.setAttribute('aria-hidden','false');return page;
 };
 const openCatalog=async(force=false)=>{
  showPage();$('productDashboardPanel').innerHTML='<p class="product-dashboard-empty">Đang tải danh mục sản phẩm web báo giá…</p>';
  try{await load(force);state.visible=pageSize;if(!state.meta.pricePolicies?.length)state.filters.price='0';render();}catch(error){$('productDashboardPanel').innerHTML=`<header class="product-dashboard-head crm-style"><button type="button" id="productDashboardClose" aria-label="Đóng">‹</button><span class="product-dashboard-app-logo">SP</span><div><h2>Sản phẩm</h2><small>Không tải được danh mục</small></div></header><p class="product-dashboard-empty">${esc(error.message)}</p>`;}
 };
 const open=async(force=false)=>{
  showPage();$('productDashboardPanel').innerHTML='<p class="product-dashboard-empty">Đang tải chi tiết sản phẩm từ báo giá…</p>';
  try{await loadLines(force);lineState.visible=pageSize;lineState.status='All';lineState.q='';renderStatusHome();}catch(error){$('productDashboardPanel').innerHTML=`<header class="product-dashboard-head crm-style"><button type="button" id="productDashboardClose" aria-label="Đóng">‹</button><span class="product-dashboard-app-logo">SP</span><div><h2>Chi tiết sản phẩm</h2><small>Không tải được dữ liệu</small></div></header><p class="product-dashboard-empty">${esc(error.message)}</p>`;}
 };
 const close=()=>{const page=$('productDashboardPage');if(page){page.classList.remove('open');page.setAttribute('aria-hidden','true');}closeDetail();document.documentElement.classList.remove('product-dashboard-locked');document.body.classList.remove('product-dashboard-locked');};
 let lastTouchEnd=0;
 document.addEventListener('touchend',event=>{if(!$('productDashboardPage')?.classList.contains('open'))return;const now=Date.now();if(now-lastTouchEnd<=300)event.preventDefault();lastTouchEnd=now;},{passive:false});
 document.addEventListener('gesturestart',event=>{if($('productDashboardPage')?.classList.contains('open'))event.preventDefault();},{passive:false});
 BN.openProductCatalog=openCatalog;
 BN.openProductDashboard=openCatalog;
 BN.openProductStatusDashboard=open;
 installEvents();
})();
