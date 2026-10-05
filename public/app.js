const IMAGE_CSV='https://docs.google.com/spreadsheets/d/1166xitL8s5Du4cWE194b6GCjhcC4zgF2XslelnGBfH4/export?format=csv&gid=959071204';
const IMAGE_GVIZ='https://docs.google.com/spreadsheets/d/1166xitL8s5Du4cWE194b6GCjhcC4zgF2XslelnGBfH4/gviz/tq?gid=959071204&tqx=out:json;responseHandler:__bachNganImageHandler';
const FALLBACK=[{s:'031199000',n:'Chén cơm 11.2 cm JAS Lys Trắng Ngà',u:'Cái',g:23000,b:'JAS',p:'Trắng ngà',c:0,w:0},{s:'153613000',n:'Ca bia 0.36 L JAS Trắng',u:'Cái',g:85000,b:'JAS',p:'Trắng',c:0,w:0},{s:'36JAS',n:'Bộ đồ ăn 10 người 36sp JAS Trắng',u:'Bộ',g:1390000,b:'JAS',p:'Trắng',c:0,w:0}];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(Number(n)||0)+' đ';
const unitMoney=n=>new Intl.NumberFormat('vi-VN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0)+' đ';
const today=()=>{const d=new Date(),z=d.getTimezoneOffset()*60000;return new Date(d-z).toISOString().slice(0,10)};
const makeNo=type=>`BG${type}-${today().replaceAll('-','')}-${String(Date.now()).slice(-4)}`;
const cleanFile=s=>String(s||'Khach hang').replace(/[\\/:*?"<>|]/g,'-').trim();
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ALL_QUOTE_TYPES=['HRC','B2B','VIGIFTS'];
function allowedQuoteTypes(){
 const scope=normalize(`${BN.user?.positionId||''} ${BN.user?.position||''}`);
 if(scope.includes('sales-lock')||scope.includes('nvbh lock')||/\block\b/.test(scope))return ['VIGIFTS'];
 if(scope.includes('sales-ml')||scope.includes('nvbh ml')||scope.includes('minh long')||/\bml\b/.test(scope))return ['HRC','B2B'];
 return ALL_QUOTE_TYPES;
}
const canUseQuoteType=type=>allowedQuoteTypes().includes(type);
const firstAllowedQuoteType=()=>allowedQuoteTypes()[0]||'HRC';
const DEFAULT_PRINT_DESCRIPTION='In ấn logo như thiết kế được phê duyệt.';
const inputMoney=n=>Number(n)>0?Number(n).toLocaleString('vi-VN'):'';
const inputNumber=(value,moneyField=false)=>Number(moneyField?String(value||'').replace(/\D/g,''):value)||0;
const isManager=()=>BN.user?.role==='manager';
let catalogMeta={pricePolicies:[],warehouses:[]};
let catalog=[],imageMap=new Map(),activeImageRow='',pendingImage='',searchTimer,searchAllProducts=false;
let state={type:'HRC',quoteNo:'',date:today(),customer:'',contact:'',phone:'',email:'',owner:'',vat:8,notes:'',rows:[]};
let pendingQuoteDiscountType=null;
let showCostFields=false;
let showProfit=false;
function currentUserOwner(){return {owner:BN.user?.name||'',ownerPhone:BN.user?.phone||''}}
function refreshCustomerInfoToggle(){
 const toggle=$('#customerInfoToggle'),card=toggle?.closest('.customer-card');
 if(!toggle||!card)return;
 const expanded=card.classList.contains('is-expanded'),name=($('#customerName')?.value||state.customer||'').trim();
 toggle.setAttribute('aria-expanded',String(expanded));
 toggle.innerHTML='<span class="customer-summary-name"></span>';
 toggle.querySelector('.customer-summary-name').textContent=name||'Khách hàng';
}
const quoteSavedKeysToIgnore=new Set(['_record','_quoteMetaConfirmed']);
let lastSavedQuoteSignature='';
function stableQuoteValue(value){
 if(Array.isArray(value))return value.map(stableQuoteValue);
 if(value&&typeof value==='object'){
  const out={};
  for(const key of Object.keys(value).sort())if(!quoteSavedKeysToIgnore.has(key)&&value[key]!==undefined)out[key]=stableQuoteValue(value[key]);
  return out;
 }
 return value;
}
function quoteSignature(){return JSON.stringify(stableQuoteValue(state))}
function refreshQuoteSaveState(){
 const button=$('#saveQuote'),inline=$('#inlineSaveQuote'),mobileSaveButtons=$$('[data-click-target="saveQuote"]'),hasRows=Boolean(state.rows?.length),saved=Boolean(state._record?.id);
 if(!button)return;
 const dirty=saved?quoteSignature()!==lastSavedQuoteSignature:hasRows;
 const saveDisabled=!hasRows||(saved&&!dirty);
 const cleanState=!hasRows||(saved&&!dirty);
 button.hidden=!hasRows;
 button.disabled=saveDisabled;
 button.classList.toggle('is-clean',cleanState);
 button.title=!hasRows?'Thêm sản phẩm trước khi lưu':saved&&!dirty?'Báo giá đã lưu, chưa có thay đổi mới':'Lưu báo giá lên hệ thống';
 [inline,$('#headerSaveQuote')].filter(Boolean).forEach(item=>{item.disabled=saveDisabled||Boolean(BN.headerQuoteActionBusy);item.classList.toggle('is-clean',cleanState);item.title=button.title;});
 mobileSaveButtons.forEach(item=>{item.disabled=saveDisabled;item.classList.toggle('is-clean',cleanState);item.title=button.title;});
 const status=$('#saveState');
 if(status)status.textContent=saved?(dirty?'● Có thay đổi chưa lưu':'● Đã lưu lên hệ thống'):(hasRows?'● Chưa lưu lên hệ thống':'● Bản nháp trong tab');
}
function quoteSavedSignatureKey(){return 'bn-saved-signature:'+BN.user.id}
function markQuoteSaved(){try{collect()}catch{}lastSavedQuoteSignature=quoteSignature();try{sessionStorage.setItem(quoteSavedSignatureKey(),lastSavedQuoteSignature)}catch{}refreshQuoteSaveState();}
function quoteHasUnsavedChanges(){try{collect()}catch{}return Boolean(state._record?.id)?quoteSignature()!==lastSavedQuoteSignature:Boolean(state.rows?.length)}
function askNewQuoteSaveChoice(){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');
  dialog.className='quote-leave-dialog';
  dialog.setAttribute('aria-labelledby','quoteLeaveTitle');
  dialog.innerHTML='<form method="dialog"><header><h2 id="quoteLeaveTitle">Lưu báo giá trước khi tạo mới?</h2><button class="icon-btn" value="cancel" aria-label="Đóng, tiếp tục chỉnh sửa">×</button></header><p>Báo giá hiện tại có thay đổi chưa lưu. Anh chọn lưu lại hoặc tạo báo giá mới mà không lưu các thay đổi này.</p><footer><button class="btn soft" value="discard">Không lưu, tạo mới</button><button class="btn primary" value="save" autofocus>Lưu và tạo mới</button></footer></form>';
  dialog.addEventListener('close',()=>{const choice=dialog.returnValue;dialog.remove();resolve(choice);},{once:true});
  document.body.append(dialog);
  dialog.showModal();
 });
}
async function confirmQuoteLeave(options={}){
 if(!quoteHasUnsavedChanges())return true;
 if(options.allowDiscard){
  const choice=await askNewQuoteSaveChoice();
  if(choice==='discard')return true;
  if(choice!=='save')return false;
  return Boolean(await saveToLibrary());
 }
 const shouldSave=confirm('Báo giá đang mở có thay đổi chưa lưu.\n\nBấm OK để lưu báo giá trước khi tiếp tục.\nBấm Hủy để ở lại chỉnh sửa.');
 if(!shouldSave)return false;
 return Boolean(await saveToLibrary());
}
BN.markQuoteSaved=markQuoteSaved;
BN.refreshQuoteSaveState=refreshQuoteSaveState;
BN.quoteHasUnsavedChanges=quoteHasUnsavedChanges;
BN.confirmQuoteLeave=confirmQuoteLeave;

function defaultDiscountFor(product,choice={price:0}){if(state.discountScope==='table')return Number(state.defaultDiscount)||0;if(state.discountScope==='manual')return 0;return QuoteMath.customerDiscount(product?.brand,state.customerDiscounts,state.discountMode||state.rows[0]?.discountType||'percent',choice.price)}
function blankRow(){return {id:crypto.randomUUID(),sku:'',name:'Nhấp để sửa mô tả',unit:'',qty:1,price:0,manualPrice:false,discount:state.discountScope==='table'?Number(state.defaultDiscount)||0:0,discountType:state.discountMode||state.rows[0]?.discountType||'percent',printFee:0,purchaseDiscount:null,costPrice:0,bundleContents:'',packagingDescription:'theo tiêu chuẩn nhà sản xuất',brand:'',pattern:'',perCarton:0,cartonWeight:0,image:''}}
function hasPurchaseDiscount(row){return row.purchaseDiscount!==null&&row.purchaseDiscount!==''&&Number.isFinite(Number(row.purchaseDiscount))}
function syncCostPrice(row){row.costPrice=hasPurchaseDiscount(row)?QuoteMath.purchasePrice(row.price,row.purchaseDiscount):0;return row.costPrice}
function normalizeRow(r){const row={...blankRow(),...r,id:r.id||crypto.randomUUID(),qty:Number(r.qty)||0,price:Number(r.price)||0,manualPrice:Boolean(r.manualPrice||r.priceManual||r.unit_price_manual),discount:Number(r.discount)||0,printFee:Number(r.printFee)||0,costPrice:Number(r.costPrice)||0,perCarton:Number(r.perCarton)||0,cartonWeight:Number(r.cartonWeight)||0};const purchaseDiscount=Number(r.purchaseDiscount);row.purchaseDiscount=Number.isFinite(purchaseDiscount)?Math.min(100,Math.max(0,purchaseDiscount)):null;if(row.purchaseDiscount===null&&row.costPrice>0&&row.price>0)row.purchaseDiscount=Math.min(100,Math.max(0,(1-row.costPrice/row.price)*100));syncCostPrice(row);if(row.printFee>0&&!String(row.printDescription||'').trim())row.printDescription=DEFAULT_PRINT_DESCRIPTION;return row}
function enforceAllowedQuoteType(){
 if(canUseQuoteType(state.type))return;
 state.type=firstAllowedQuoteType();
 state.quoteNo=makeNo(state.type);
 state.notes=defaultNotes(state.type);
 state.notesVersion=2;
 state.rows=[];
 delete state._record;
}
function loadDraft(){try{const raw=sessionStorage.getItem('bn-draft:'+BN.user.id);if(raw)state={...state,...JSON.parse(raw)};lastSavedQuoteSignature=sessionStorage.getItem(quoteSavedSignatureKey())||''}catch{}state.rows=(state.rows||[]).map(normalizeRow);if(!state.quoteNo)state.quoteNo=makeNo(state.type);if(!state.date)state.date=today()}
function collect(){collectPrintingCosts();state.quoteNo=$('#quoteNo').value.trim()||state.quoteNo;state.customer=$('#customerName').value.trim();state.contact=$('#contactName').value.trim();state.phone=$('#phone').value.trim();state.email=$('#email').value.trim();state.owner=$('#owner').value.trim();state.ownerPhone=$('#ownerPhone').value.trim();state.date=$('#quoteDate').value||today();state.vat=Number($('#vatRate').value)||0;state.notes=$('#notes').value;$$('#quoteRows tr[data-id]').forEach(tr=>{const row=state.rows.find(item=>item.id===tr.dataset.id);if(!row)return;tr.querySelectorAll('input[data-field]').forEach(input=>{if(input.dataset.field==='purchaseDiscount'){row.purchaseDiscount=input.value.trim()===''?null:Math.min(100,Math.max(0,inputNumber(input.value)));syncCostPrice(row);return;}let value=Math.max(0,inputNumber(input.value,input.hasAttribute('data-money-input')));if(input.dataset.field==='discount')value=Math.min(value,row.discountType==='amount'?row.price:100);row[input.dataset.field]=value;});const print=tr.querySelector('[data-print-description]');if(print)row.printDescription=print.value.trim()||(row.printFee>0?DEFAULT_PRINT_DESCRIPTION:'');});}
function saveDraft(show=false){collect();try{sessionStorage.setItem('bn-draft:'+BN.user.id,JSON.stringify(state));$('#saveState').textContent='● Bản nháp trong tab';if(show)toast('Đã tạm lưu bản nháp trong tab')}catch{$('#saveState').textContent='Ảnh quá lớn – chưa thể lưu';if(show)toast('Không đủ bộ nhớ. Nên dùng ảnh từ Google Drive.')}refreshQuoteSaveState()}
function defaultNotes(type){return QuoteNotes[type]||QuoteNotes.HRC}
function isMinhLongCatalogProduct(p){const q=normalize(`${p?.brand||''} ${p?.name||''}`);return q.includes('minh long')||q.includes('healthy cook')||q.includes('su duong sinh')}
function catalogForQuoteType(){return catalog.filter(p=>state.type==='VIGIFTS'?!isMinhLongCatalogProduct(p):isMinhLongCatalogProduct(p))}
function updateCatalogStatus(){if(!catalog.length)return;const count=catalogForQuoteType().length,label=state.type==='VIGIFTS'?'sản phẩm Vigifts':'sản phẩm Minh Long';$('#catalogStatus').textContent=`${count.toLocaleString('vi-VN')} ${label} · ${catalogMeta.warehouses.length} kho`}
function hydrate(){
 enforceAllowedQuoteType();
 if(state.notesVersion!==2){const tail=defaultNotes(state.type).split('\n').slice(2);state.notes=[state.notes||defaultNotes(state.type).split('\n').slice(0,2).join('\n'),...tail.filter(line=>!(state.notes||'').includes(line))].join('\n');state.notesVersion=2;}
 if(!String(state.notes||'').trim())state.notes=defaultNotes(state.type);
 state.notes=QuoteNotes.updateDelivery(state.notes,state.type);
 $('#quoteNo').value=state.quoteNo;$('#quoteDate').value=state.date;$('#customerName').value=state.customer;$('#contactName').value=state.contact;$('#phone').value=state.phone;$('#email').value=state.email;if(state.ownerPhone===undefined)state.ownerPhone=state.owner===BN.user.name?(BN.user.phone||''):'';BN.syncOwnerSelect?.(state.owner);$('#owner').value=state.owner||'';$('#ownerPhone').value=state.ownerPhone;$('#vatRate').value=state.vat;$('#notes').value=state.notes||'';
$$('.quote-type').forEach(b=>{b.hidden=!canUseQuoteType(b.dataset.type);b.classList.toggle('active',b.dataset.type===state.type)});$('#pageTitle').textContent=`Báo giá ${state.type==='VIGIFTS'?'Vigifts':state.type}`;$('#productHint').textContent=state.type==='VIGIFTS'?'Danh mục quà tặng Vigifts · đã ẩn các nhóm Minh Long':'Chỉ hiện Minh Long, Minh Long LYS, Healthy Cook và Sứ dưỡng sinh';refreshCustomerInfoToggle();setSapoOrderLink(null);queueMicrotask(()=>{refreshSapoOrderStatus(state.quoteNo,{showUpdating:true,poll:true});BN.refreshContractAction?.()});updateCatalogStatus();render();
}
function afterPrice(r){return QuoteMath.after(r,state)}
function canShowCostFields(){return isManager()&&showCostFields}
function refreshCostToggle(){const button=$('#toggleCostFields');if(!button)return;button.hidden=!isManager();button.textContent=showCostFields?'Ẩn giá nhập':'Xem giá nhập';button.setAttribute('aria-pressed',String(showCostFields))}
let printingWorkshops=QuoteMath.printingWorkshops.map(name=>({name})),printingWorkshopLoad=null,printingWorkshopTarget='';
function ensurePrintingWorkshops(){
 if(printingWorkshopLoad||!isManager())return;
 printingWorkshopLoad=BN.api('/printing-workshops').then(result=>{printingWorkshops=result.workshops||printingWorkshops;refreshPrintingCosts();}).catch(()=>{const status=$('#printingWorkshopsStatus');if(status)status.textContent='Chưa tải được danh sách xưởng dùng chung. Có thể chọn các xưởng mặc định hoặc thêm xưởng mới.';});
}
function initializePrintingLines(){
 const rows=state.rows||[],legacy=state.printing,first=rows.find(row=>Number(row.qty)>0),hasLines=rows.some(row=>row.printing);
 for(const row of rows){
  if(!row.printing)row.printing={unitPrice:!hasLines&&row===first&&legacy?.totalCost>0?legacy.totalCost/row.qty:0,workshop:legacy?.workshop||'',workshopExplicit:legacy?.workshopExplicit===true};
  if(!row.printing.workshopExplicit)row.printing.workshop=QuoteMath.printingInfo({type:state.type,rows:[{...row,qty:1,printFee:1}]}).defaultWorkshop;
 }
}
function printingWorkshopOptions(selected){
 let custom=[];try{custom=JSON.parse(localStorage.getItem('bn-printing-workshops')||'[]');}catch{}
 const names=[...new Set([...printingWorkshops.map(item=>item.name),...(Array.isArray(custom)?custom.filter(item=>typeof item==='string'):[]),selected].filter(Boolean))];
 return '<option value="__add_workshop__">+ Thêm xưởng in mới</option>'+names.map(name=>`<option value="${esc(name)}" ${name===selected?'selected':''}>${esc(name)}</option>`).join('');
}
function refreshPrintingCosts(){
 const info=QuoteMath.printingInfo(state),section=$('#profitPrintingRow');if(!section)return;
 section.hidden=!isManager()||!info.enabled;if(section.hidden)return;
 initializePrintingLines();ensurePrintingWorkshops();
 const host=$('#printingCostRows'),multiple=state.rows.length>=2;
 // Keep the active numeric editor in place while recalculating totals.
 if(host.contains(document.activeElement)&&document.activeElement.matches('[data-printing-unit]')){
  host.querySelectorAll('[data-printing-line-total]').forEach(el=>{const row=state.rows.find(row=>row.id===el.dataset.printingLineTotal);if(row)el.textContent=money(Math.round(row.printing.unitPrice*row.qty));});return;
 }
 $('#printingCostHead').innerHTML=`<tr>${multiple?'<th>Mã hàng</th>':''}<th>Xưởng in</th><th>SL</th><th>Đơn giá in (đ/SP)</th><th>Tổng chi phí in</th></tr>`;
 host.innerHTML=state.rows.map((row,index)=>`<tr data-printing-id="${esc(row.id)}">${multiple?`<td><b>${esc(row.sku||'Chưa có mã')}</b><small>${esc(row.name||'Dòng '+(index+1))}</small></td>`:''}<td><select data-printing-workshop aria-label="Xưởng in dòng ${index+1}">${printingWorkshopOptions(row.printing.workshop)}</select></td><td>${Number(row.qty||0).toLocaleString('vi-VN')}</td><td><input type="number" inputmode="decimal" min="0" max="1000000000000" step="any" data-printing-unit aria-label="Đơn giá in dòng ${index+1}" value="${row.printing.unitPrice||''}" placeholder="0"></td><td><strong data-printing-line-total="${esc(row.id)}">${money(Math.round(row.printing.unitPrice*row.qty))}</strong></td></tr>`).join('');
}
function collectPrintingCosts(){
 if(!isManager()||!QuoteMath.printingInfo(state).enabled||$('#profitPrintingRow')?.hidden)return;
 $('#printingCostRows')?.querySelectorAll('[data-printing-id]').forEach(tr=>{
  const row=state.rows.find(row=>row.id===tr.dataset.printingId);if(!row)return;
  const workshop=tr.querySelector('[data-printing-workshop]').value,unitPrice=Math.min(1e12,Math.max(0,Number(tr.querySelector('[data-printing-unit]').value)||0));
  row.printing={...row.printing,unitPrice};
  if(workshop!=='__add_workshop__'&&workshop!==row.printing.workshop){row.printing.workshop=workshop;row.printing.workshopExplicit=true;}
 });
}
function openPrintingWorkshopForm(rowId){
 printingWorkshopTarget=rowId;const form=$('#printingWorkshopForm');form.reset();$('#printingWorkshopError').textContent='';
 refreshPrintingCosts();$('#printingWorkshopDialog').showModal();form.elements.name.focus();
}
function refreshProfit(){
 const card=$('#profitCard');if(!card)return;const allowed=isManager(),toggle=$('#toggleProfit'),section=$('#profitSection');if(section)section.hidden=!allowed;if(toggle){toggle.textContent=showProfit?'Ẩn lợi nhuận tạm tính':'Xem lợi nhuận tạm tính';toggle.setAttribute('aria-expanded',String(allowed&&showProfit));}card.hidden=!allowed||!showProfit;refreshCostToggle();refreshPrintingCosts();if(card.hidden)return;
 const shipping=Shipping.calculate(state.rows,state.shipping||{}),profit=QuoteMath.profit(state,shipping.fee),payer=state.shipping?.payer||'receiver';
 $('#profitRevenue').textContent=money(profit.revenue);$('#profitCost').textContent=money(profit.cost);
 $('#profitShipping').textContent=shipping.fee===null?'Chưa có cước dự toán':money(shipping.fee);
 $$('input[name="profitShippingPayer"]').forEach(input=>{input.checked=input.value===payer;});
 $('#profitShippingHint').hidden=payer!=='sender'||shipping.fee!==null;
 $('#profitGross').textContent=money(profit.gross);$('#profitGross').classList.toggle('is-negative',profit.gross<0);
 $('#profitMargin').textContent=`${profit.margin.toLocaleString('vi-VN',{maximumFractionDigits:1})}%`;$('#profitMargin').classList.toggle('is-negative',profit.margin<0);
}

async function updatePurchaseCosts(){if(!isManager())return;const button=$('#refreshProfitCosts');if(button?.disabled)return;collect();let updated=0;const missing=[];for(const row of state.rows){const product=catalog.find(p=>normalize(p.sku)===normalize(row.sku))||row,discount=QuoteMath.defaultCostDiscount(product);if(discount===null){missing.push(row);continue;}row.purchaseDiscount=discount;syncCostPrice(row);updated++;}if(missing.length)showCostFields=true;render();saveDraft();if(button){button.disabled=true;button.textContent='Đang lưu CK…';}try{const saved=await saveToLibrary();if(!saved)throw Error('Chưa lưu được CK mua vào lên hệ thống.');const missingText=missing.slice(0,12).map((row,index)=>`${index+1}. ${row.sku||'Chưa có SKU'} - ${row.name||'Chưa có tên'}`).join('\n'),more=missing.length>12?`\n... và ${missing.length-12} dòng khác`:'';if(missing.length){alert(`Có ${missing.length} sản phẩm chưa xác định được CK nhập rõ ràng. Vui lòng nhập thủ công ở cột CK mua vào rồi bấm Lưu báo giá.\n\n${missingText}${more}`);toast(`Đã lưu ${updated} dòng CK, còn ${missing.length} dòng cần nhập thủ công`);}else toast(`Đã cập nhật và lưu CK mua vào cho ${updated} dòng`);}catch(error){toast(error.message||'Chưa lưu được CK mua vào.');note.textContent=error.message||'Chưa lưu được CK mua vào.';}finally{if(button){button.disabled=false;button.textContent='Cập nhật CK mua vào';}}}
function refreshTotals(){const totals=QuoteMath.totals(state);$('#subtotal').textContent=money(totals.subtotal);$('#vatLabel').textContent=totals.label;$('#vatAmount').textContent=money(totals.tax);$('#grandTotal').textContent=money(totals.total);refreshProfit()}
function refreshCalculatedRow(tr,row){const after=afterPrice(row);tr.querySelector('[data-after-price]').textContent=unitMoney(after);tr.querySelector('[data-line-total]').textContent=money(after*row.qty);const cost=tr.querySelector('[data-cost-price]');if(cost)cost.textContent=hasPurchaseDiscount(row)?money(syncCostPrice(row)):'—';refreshTotals()}
function discountHeading(){const modes=new Set(state.rows.map(r=>r.discountType||'percent'));const mode=modes.size>1?'mixed':(modes.size?[...modes][0]:state.discountMode||'percent');return `<span class="discount-heading">CK (F6)<select id="discountMode" aria-label="Đơn vị chiết khấu cả cột">${mode==='mixed'?'<option value="mixed" selected disabled>Nhiều loại</option>':''}<option value="percent" ${mode==='percent'?'selected':''}>%</option><option value="amount" ${mode==='amount'?'selected':''}>đ/SP</option></select></span>`}
function headers(){const cost=canShowCostFields()?'<th>CK mua vào</th><th>Giá nhập</th>':'';return state.type==='HRC'?`<tr><th>STT</th><th>Hình ảnh</th><th>Sản phẩm / Mã hàng</th><th>ĐVT</th><th>Số lượng</th><th>Đơn giá</th><th>${discountHeading()}</th><th>Đơn giá CK</th><th>Thành tiền</th>${cost}<th></th></tr>`:`<tr><th>STT</th><th>Hình ảnh</th><th>Tên hàng / Mã hàng</th><th>ĐVT</th><th>Số lượng</th><th>Đơn giá</th><th>${discountHeading()}</th><th>Phí in (F7)</th><th>Giá sau CK</th><th>Thành tiền</th>${cost}<th></th></tr>`}
function imageBox(r){return `<button class="preview-box" data-image="${r.id}" title="Chèn hoặc đổi hình">${r.image?`<img src="${esc(proxiedImage(r.image))}" data-fallback="${esc(imageFallback(r.image))}" alt="${esc(r.name)}" loading="lazy" referrerpolicy="no-referrer">`:`<small>＋ Chèn hình</small>`}</button>`}
function packingSpec(r){const number=n=>Number(n).toLocaleString('vi-VN',{maximumFractionDigits:3}),parts=[];if(Number(r.perCarton)>0)parts.push(`${number(r.perCarton)} ${r.unit||'cái'}/thùng`);if(Number(r.cartonWeight)>0)parts.push(`nặng ${number(r.cartonWeight)} kg/thùng`);return parts.join('; ')}
function productCell(r){const detail=[r.brand,r.pattern,r.pricePolicy,Number.isFinite(r.taxRate)?`VAT ${r.taxRate}%`:''].filter(Boolean).join(' · ');const hrcPacking=state.type==='HRC'&&packingSpec(r)?`<div class="product-meta packing-spec">Đóng gói: ${esc(packingSpec(r))}</div>`:'';const bundle=['B2B','VIGIFTS'].includes(state.type)?`<label class="product-meta print-description-row"><span>Bộ gồm</span><input class="cell-input" data-bundle-contents value="${esc(r.bundleContents||'')}" placeholder="Ví dụ: 01 ly + 01 nắp"></label>`:'';const print=state.type!=='HRC'?`<label class="product-meta print-description-row"><span>Mô tả in ấn</span><input class="cell-input" data-print-description value="${esc(r.printDescription||'')}" placeholder="Ví dụ: in logo màu tại 01 vị trí"></label>`:'';const packaging=state.type!=='HRC'?`<label class="product-meta print-description-row"><span>Đóng gói</span><input class="cell-input" data-packaging-description value="${esc(r.packagingDescription||'theo tiêu chuẩn nhà sản xuất')}" placeholder="Ví dụ: theo tiêu chuẩn nhà sản xuất"></label>`:'';return `<td class="product-cell"><div class="product-name" contenteditable="true" spellcheck="false">${esc(r.name)}</div><div class="sku-line"><span class="sku">${esc(r.sku||'Chưa có mã')}</span>${r.sku?'<button type="button" class="stock-view-button" data-stock-view>Xem tồn kho</button>':''}</div>${detail?`<div class="product-meta">${esc(detail)}</div>`:''}${hrcPacking}${bundle}${print}${packaging}</td>`}

function openRowStock(row){const product=catalog.find(p=>p.sku===row.sku),body=$('#inventoryBody');$('#inventoryTitle').textContent=row.name||'Tồn kho sản phẩm';if(!product){body.innerHTML='<p class="empty">Chưa tìm thấy mã hàng này trong dữ liệu tồn kho hiện tại.</p>';}else{const updated=catalogMeta.stockUpdatedAt?new Date(catalogMeta.stockUpdatedAt).toLocaleString('vi-VN'):'Chưa có thời điểm cập nhật';body.innerHTML=`<p class="inventory-sku">Mã hàng: <b>${esc(row.sku)}</b></p><div class="inventory-list">${catalogMeta.warehouses.map((warehouse,index)=>`<div><span>${esc(warehouse)}</span><strong>${product.stock?.[index]===null||product.stock?.[index]===undefined?'Chưa có số liệu':Number(product.stock[index]).toLocaleString('vi-VN')}</strong></div>`).join('')}</div><p class="inventory-updated">Cập nhật tồn gần nhất: ${esc(updated)}</p>`;}openModal('inventory');}
function rowHtml(r,i){const after=afterPrice(r),discountUnit=r.discountType==='amount'?'đ':'%',discountValue=r.discountType==='amount'?inputMoney(r.discount):(r.discount||''),priceCell=`<td><div class="number-unit price-control"><input class="cell-input" data-field="price" data-money-input type="text" inputmode="numeric" aria-label="Đơn giá" value="${inputMoney(r.price)}"><b>đ</b></div></td>`,costCell=canShowCostFields()?`<td><div class="number-unit purchase-discount-control"><input class="cell-input" data-field="purchaseDiscount" type="number" min="0" max="100" step="any" inputmode="decimal" aria-label="Chiết khấu mua vào" value="${r.purchaseDiscount??''}"><b>%</b></div></td><td class="money" data-cost-price>${hasPurchaseDiscount(r)?money(syncCostPrice(r)):'—'}</td>`:'';const discountCell=`<div class="discount-control number-unit"><input class="cell-input discount" aria-label="Chiết khấu F6" data-field="discount" ${r.discountType==='amount'?'data-money-input type="text" inputmode="numeric"':'type="number" min="0" max="100" step="any"'} value="${discountValue}"><b>${discountUnit}</b></div>`;return state.type==='HRC'?`<tr data-id="${r.id}"><td class="stt">${i+1}</td><td>${imageBox(r)}</td>${productCell(r)}<td>${esc(r.unit||'—')}</td><td><input class="cell-input" data-field="qty" type="number" min="0" value="${r.qty}"></td>${priceCell}<td>${discountCell}</td><td class="money" data-after-price>${unitMoney(after)}</td><td class="money" data-line-total>${money(after*r.qty)}</td>${costCell}<td><button class="row-delete" aria-label="Xóa dòng">×</button></td></tr>`:`<tr data-id="${r.id}"><td class="stt">${i+1}</td><td>${imageBox(r)}</td>${productCell(r)}<td>${esc(r.unit||'—')}</td><td><input class="cell-input" data-field="qty" type="number" min="0" value="${r.qty}"></td>${priceCell}<td>${discountCell}</td><td><div class="number-unit print-fee-control"><input class="cell-input" data-field="printFee" data-money-input type="text" inputmode="numeric" aria-label="Phí in F7" value="${inputMoney(r.printFee)}"><b>đ</b></div></td><td class="money" data-after-price>${unitMoney(after)}</td><td class="money" data-line-total>${money(after*r.qty)}</td>${costCell}<td><button class="row-delete" aria-label="Xóa dòng">×</button></td></tr>`}
function render(){
 $('#saveQuote').hidden=!state.rows.length;
 document.getElementById('fillPacking').onclick=()=>{let count=0;for(const r of state.rows){const p=catalog.find(p=>p.sku===r.sku);if(!p)continue;for(const k of ['perCarton','cartonWeight','cartonLength','cartonWidth','cartonHeight'])if(!r[k]&&p[k]){r[k]=p[k];count++;}}render();saveDraft();toast(count?'Đã điền quy cách còn thiếu từ Excel':'Không có quy cách bổ sung cho các mã này');};
 Shipping.render(document.getElementById('shippingBody'),state,()=>{render();saveDraft()});
 $('#tableHead').innerHTML=headers();$('#quoteRows').innerHTML=state.rows.length?state.rows.map(rowHtml).join(''):`<tr><td colspan="${(state.type==='HRC'?10:11)+(canShowCostFields()?2:0)}"><div class="empty">Chưa có sản phẩm. Bấm “+ Thêm sản phẩm” để bắt đầu.</div></td></tr>`;
 $('#discountMode').onchange=e=>{const mode=e.target.value;for(const row of state.rows){if((row.discountType||'percent')===mode)continue;const value=Number(row.discount)||0;row.discount=mode==='amount'?row.price*value/100:(row.price?value/row.price*100:0);row.discountType=mode;}state.discountMode=mode;render();saveDraft()};
 $$('.discount, [data-field=price], [data-field=printFee], [data-field=purchaseDiscount]').forEach(input=>{if(input.dataset.field!=='purchaseDiscount'&&Number(input.value)===0)input.value='';input.placeholder='';input.inputMode='decimal';input.onfocus=()=>input.select()});
 refreshTotals();
 $$('#quoteRows tr[data-id]').forEach(tr=>{const row=state.rows.find(x=>x.id===tr.dataset.id);tr.querySelectorAll('input[data-field]').forEach(inp=>{if(inp.hasAttribute('data-money-input'))inp.addEventListener('input',()=>{const digits=inp.value.replace(/\D/g,'');inp.value=digits?Number(digits).toLocaleString('vi-VN'):''});const readValue=()=>{if(inp.dataset.field==='purchaseDiscount')return inp.value.trim()===''?null:Math.min(100,Math.max(0,inputNumber(inp.value)));let v=Math.max(0,inputNumber(inp.value,inp.hasAttribute('data-money-input')));if(inp.dataset.field==='discount')v=Math.min(v,row.discountType==='amount'?row.price:100);return v};inp.addEventListener('input',()=>{const v=readValue();if(inp.dataset.field==='printFee'&&v>0&&!Number(row.printFee))inp.dataset.firstPrintFee='true';row[inp.dataset.field]=v;if(inp.dataset.field==='price'){row.manualPrice=true;if(row.discountType==='amount')row.discount=Math.min(Number(row.discount)||0,v);}if(['price','purchaseDiscount'].includes(inp.dataset.field))syncCostPrice(row);refreshCalculatedRow(tr,row)});inp.addEventListener('change',()=>{const v=readValue();const firstPrintFee=inp.dataset.firstPrintFee==='true';delete inp.dataset.firstPrintFee;row[inp.dataset.field]=v;if(inp.dataset.field==='price'){row.manualPrice=true;if(row.discountType==='amount')row.discount=Math.min(Number(row.discount)||0,v);}if(['price','purchaseDiscount'].includes(inp.dataset.field))syncCostPrice(row);if(firstPrintFee&&!String(row.printDescription||'').trim())row.printDescription=DEFAULT_PRINT_DESCRIPTION;render();saveDraft();if(firstPrintFee)alert('Đã nhập phí in. Vui lòng xem kỹ phần Mô tả in ấn: “In ấn logo như thiết kế được phê duyệt.”')})});const name=tr.querySelector('.product-name');name.onblur=()=>{row.name=name.innerText.trim()||'Sản phẩm';saveDraft()};const bundle=tr.querySelector('[data-bundle-contents]');if(bundle)bundle.onchange=()=>{row.bundleContents=bundle.value.trim();saveDraft()};const print=tr.querySelector('[data-print-description]');if(print)print.onchange=()=>{row.printDescription=print.value.trim()||DEFAULT_PRINT_DESCRIPTION;print.value=row.printDescription;saveDraft()};const packaging=tr.querySelector('[data-packaging-description]');if(packaging)packaging.onchange=()=>{row.packagingDescription=packaging.value.trim()||'theo tiêu chuẩn nhà sản xuất';packaging.value=row.packagingDescription;saveDraft()};const stock=tr.querySelector('[data-stock-view]');if(stock)stock.onclick=e=>{e.stopPropagation();openRowStock(row)};const pic=tr.querySelector('.preview-box img');if(pic)pic.onerror=()=>{const fallback=pic.dataset.fallback;if(fallback&&pic.src!==fallback){pic.src=fallback;pic.dataset.fallback=''}else pic.closest('.preview-box').innerHTML='<small>Ảnh Drive chưa chia sẻ</small>'};tr.querySelector('[data-image]').onclick=()=>openImage(row.id);tr.querySelector('.row-delete').onclick=()=>{state.rows=state.rows.filter(x=>x.id!==row.id);render();saveDraft();if($('#searchModal').classList.contains('open'))drawResults()}})
 refreshQuoteSaveState();
}

async function loadCatalog(){
 try{const data=await BN.api('/catalog');catalogMeta=data;catalog=data.products.map(p=>({...p,_q:normalize(`${p.sku} ${p.name} ${p.brand} ${p.pattern}`)}));imageMap.clear();for(const p of catalog)if(p.image)imageMap.set(p.sku.toUpperCase(),p.image);
 BN.catalogSnapshot={meta:catalogMeta,products:catalog};
 $('#catalogPolicy').innerHTML=data.pricePolicies.map((name,i)=>`<option value="${i}">${esc(name)}</option>`).join('');$('#catalogPolicy').onchange=drawResults;
 $('#catalogSnapshot').textContent=`Tồn kho chụp lúc ${new Date(data.stockObservedAt||data.observedAt).toLocaleString('vi-VN')} · Đơn giá báo giá chưa VAT.`;
 updateCatalogStatus();
 $('#saveState').textContent='● Danh mục Sapo đã sẵn sàng';
 }catch(e){catalog=[];$('#catalogStatus').textContent='Chưa tải được danh mục Sapo';$('#saveState').textContent=e.message;}
}
async function loadImageMap(){
 try{const res=await fetch('/api/images',{cache:'no-store'});if(!res.ok)throw Error();const data=await res.json();applyImageRows(data.items||[])}catch{try{const res=await fetch(IMAGE_CSV,{cache:'no-store'});if(!res.ok)throw Error();const rows=parseCSV(await res.text());applyImageRows(rows.slice(1))}catch{try{await loadImageMapByScript()}catch{}}}
 finishImageMap();
}
function applyImageRows(rows){rows.forEach(r=>{const sku=String(r[0]??'').trim(),url=String(r[1]??'').trim();if(sku&&url&&normalize(sku)!=='sku')imageMap.set(sku.toUpperCase(),url)})}
function loadImageMapByScript(){return new Promise((resolve,reject)=>{const old=document.getElementById('driveImageData');if(old)old.remove();const timer=setTimeout(()=>{cleanup();reject(Error('timeout'))},15000),script=document.createElement('script');function cleanup(){clearTimeout(timer);delete window.__bachNganImageHandler;script.remove()}window.__bachNganImageHandler=data=>{try{const rows=(data?.table?.rows||[]).map(r=>(r.c||[]).map(c=>c?.v??c?.f??''));applyImageRows(rows);cleanup();resolve()}catch(err){cleanup();reject(err)}};script.id='driveImageData';script.src=IMAGE_GVIZ;script.onerror=()=>{cleanup();reject(Error('script'))};document.head.appendChild(script)})}
function finishImageMap(){state.rows.forEach(r=>{const url=imageMap.get(String(r.sku||'').toUpperCase());if(!r.image&&url)r.image=url});render();saveDraft();updateCatalogStatus()}
function parseCSV(text){const out=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(ch===','&&!quoted){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))out.push(row);row=[];cell=''}else cell+=ch}row.push(cell);if(row.some(Boolean))out.push(row);return out}
function driveId(value){const s=String(value||'');return (s.match(/\/d\/([\w-]+)/)||s.match(/[?&]id=([\w-]+)/)||[])[1]||''}
function driveUrl(value){const s=String(value||'').trim();if(!s)return'';if(/\/uc\?/i.test(s)||/googleusercontent\.com/i.test(s))return s;const id=driveId(s);return id?`https://drive.google.com/uc?export=download&id=${id}`:s}
function isGoogleImage(value){try{const h=new URL(value).hostname;return h==='drive.google.com'||h==='lh3.googleusercontent.com'||h.endsWith('.googleusercontent.com')}catch{return false}}
function isSapoImage(value){try{return ['sapo.dktcdn.net','bizweb.dktcdn.net'].includes(new URL(value).hostname)}catch{return false}}
function proxiedImage(value){const s=String(value||'').trim();return (isGoogleImage(s)||isSapoImage(s))?`/api/image?src=${encodeURIComponent(s)}`:s}
function productIcon(value){const s=String(value||'').trim();return (isGoogleImage(s)||isSapoImage(s))?`/api/image?size=icon&src=${encodeURIComponent(s)}`:s}
function imageFallback(value){const id=driveId(value);return id?`/api/image?src=${encodeURIComponent(`https://drive.google.com/thumbnail?id=${id}&sz=w1000`)}`:''}
function matchesSearchGroup(product,group){
 const name=normalize(product.name||'').replace(/đ/g,'d');
 const thermal=name.includes('giu nhiet');
 if(group==='dinner')return /bo (do an|ban an|chen dia)/.test(name);
 if(group==='tea')return /bo (tra|am tra|tach tra)/.test(name);
 if(group==='thermalCup')return thermal&&/\b(ly|coc|ca)\b/.test(name);
 if(group==='thermalBottle')return thermal&&/\bbinh\b/.test(name);
 if(group==='tableware')return /\b(chen|to|dia|tach)\b/.test(name);
 if(group==='vase')return /binh hoa|lo hoa/.test(name);
 if(group==='cookware')return /\b(noi|chao|quanh)\b/.test(name);
 return true;
}
function doSearch(q){
 const source=searchAllProducts?catalog:catalogForQuoteType(),tokens=normalize(q).trim().split(/\s+/).filter(Boolean);
 const group=$('#searchProductGroup').value,minText=$('#searchPriceMin').value,maxText=$('#searchPriceMax').value;
 const min=minText===''?null:Number(minText),max=maxText===''?null:Number(maxText);
 if((min!==null&&min<0)||(max!==null&&max<0)||(min!==null&&max!==null&&min>max)){
  $('#searchFilterStatus').textContent='Giá từ phải nhỏ hơn hoặc bằng giá đến, và không được âm.';return [];
 }
 let matches=source.filter(p=>tokens.every(t=>p._q.includes(t)));
 // Keep direct SKU lookup for products awaiting brand classification.
 const exactSku=tokens.length===1?catalog.find(p=>normalize(p.sku)===tokens[0]):null;
 if(exactSku&&!matches.includes(exactSku))matches.unshift(exactSku);
 matches=matches.filter(p=>{
  if(!matchesSearchGroup(p,group))return false;
  if(min===null&&max===null)return true;
  const raw=catalogChoice(p).raw;
  return raw!==null&&raw!==undefined&&Number.isFinite(Number(raw))&&(min===null||Number(raw)>=min)&&(max===null||Number(raw)<=max);
 });
 $('#searchFilterStatus').textContent=`${matches.length.toLocaleString('vi-VN')} sản phẩm phù hợp · Giá theo chính sách đang chọn. ${matches.length>80?'Hiển thị 80 kết quả đầu; hãy thêm từ khoá hoặc thu hẹp bộ lọc.':''}`;
 return matches.slice(0,80);
}
function catalogChoice(p){const index=Number($('#catalogPolicy').value||0),policy=catalogMeta.pricePolicies[index]||'',raw=p.prices[index];const tax=p.taxable?(p.taxOut??state.vat):0;const included=/VAT/i.test(policy)||p.taxBasis==='Giá đã bao gồm thuế';return{policy,raw,tax,included,price:raw===null?null:QuoteMath.netPrice(raw,tax,included)}}
function stockAt(product,warehouse){const index=catalogMeta.warehouses.indexOf(warehouse),value=Number(product.stock?.[index]);return index>=0&&Number.isFinite(value)?value:null}
function stockText(value){return value===null?'Chưa có số liệu':value.toLocaleString('vi-VN')}
function availableStock(product){const values=catalogMeta.warehouses.map((warehouse,index)=>({warehouse,value:Number(product.stock?.[index])})).filter(({warehouse,value})=>!['NCC','Hàng chờ về'].includes(warehouse)&&Number.isFinite(value));return values.length?values.reduce((total,{value})=>total+value,0):null}
function drawResults(){const list=doSearch($('#searchInput').value);$('#searchResults').innerHTML=list.length?list.map(p=>{const choice=catalogChoice(p),stock=availableStock(p),supplierStock=stockAt(p,'NCC'),incomingStock=stockAt(p,'Hàng chờ về'),selected=state.rows.some(row=>row.sku===p.sku);return `<div class="result" tabindex="0" data-sku="${esc(p.sku)}"><div class="result-icon">${p.image?`<img src="${esc(productIcon(p.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:esc(p.name.slice(0,2).toUpperCase())}</div><div><b>${esc(p.name)}</b><small>Nhãn hiệu: ${esc(p.brand||'Chưa có trên Sapo')}</small><small>Mã ${esc(p.sku)} · ${esc(p.unit||'—')} · ${p.taxable?(p.taxOut===null?'Chưa có thuế đầu ra':`VAT ${p.taxOut}%`):'Không áp dụng thuế'}</small><small>Tồn khả dụng: <strong>${stockText(stock)}</strong> | Tồn NCC: ${stockText(supplierStock)} - Hàng chờ về: ${stockText(incomingStock)}</small></div><div class="result-price">${choice.raw===null?'Chưa có giá':unitMoney(choice.raw)}<small>${choice.included?'Đã gồm VAT':'Chưa VAT'}</small><div class="product-actions"><button type="button" class="btn ghost" data-edit-product>Cập nhật</button><button type="button" class="btn soft" data-add-product ${selected?'disabled title="Sản phẩm đã có trong báo giá"':''}>Chọn</button></div></div></div>`}).join(''):`<div class="empty">Không tìm thấy sản phẩm phù hợp.</div>`;$$('.result').forEach(el=>{const add=()=>addProduct(el.dataset.sku);el.querySelector('[data-add-product]').onclick=add;el.querySelector('[data-edit-product]').onclick=()=>openProductEditor(el.dataset.sku)})}
function addProduct(sku){const p=catalog.find(x=>x.sku===sku);if(!p)return;const choice=catalogChoice(p);if(choice.raw===null){toast('Chính sách này chưa có giá. Vui lòng chọn chính sách khác.');return;}if(choice.raw===0&&!confirm('Giá sản phẩm đang là 0 đồng trên Sapo. Thêm vào báo giá?'))return;
 if(p.taxable&&p.taxOut===null){toast('Sản phẩm chưa có thuế đầu ra. Vui lòng cập nhật thuế trên Sapo trước.');return;}
 const wasEmpty=!state.rows.length;
 const purchaseDiscount=isManager()?QuoteMath.defaultCostDiscount(p):null;
 state.rows.push(normalizeRow({sku:p.sku,name:p.name,unit:p.unit,brand:p.brand,pattern:p.pattern,price:choice.price,manualPrice:false,taxRate:choice.tax,pricePolicy:choice.policy,id:crypto.randomUUID(),qty:1,discount:defaultDiscountFor(p,choice),discountType:'percent',printFee:0,purchaseDiscount,costPrice:purchaseDiscount===null?0:QuoteMath.purchasePrice(choice.price,purchaseDiscount),image:p.image,perCarton:p.perCarton||0,cartonWeight:p.cartonWeight||0,cartonLength:p.cartonLength||0,cartonWidth:p.cartonWidth||0,cartonHeight:p.cartonHeight||0}));
 if([defaultNotes('HRC'),defaultNotes('B2B')].includes(state.notes)){state.notes=state.notes.replace(/8% (thuế VAT|hóa đơn VAT)/,'thuế VAT theo từng sản phẩm');$('#notes').value=state.notes;}
 render();saveDraft();drawResults();openFirstProductQuoteDiscount(wasEmpty);toast(`Đã thêm ${p.sku}`)}
BN.addCatalogProduct=sku=>{const before=state.rows.length;addProduct(sku);return state.rows.length>before};
BN.openCatalogProductEditor=sku=>openProductEditor(sku);
BN.reloadCatalog=()=>loadCatalog();
BN.getCatalogSnapshot=()=>({meta:catalogMeta,products:catalog});

function openModal(name){const el=$(`#${name}Modal`);el.classList.add('open');el.setAttribute('aria-hidden','false');if(name==='search'){if(!catalog.length)$('#searchResults').innerHTML='<div class="loading-line">Đang tải danh mục sản phẩm…</div>';else{drawResults();setTimeout(()=>$('#searchInput').focus(),40)}}}
function closeModal(name){const el=$(`#${name}Modal`);if(!el)return;el.classList.remove('open');el.setAttribute('aria-hidden','true');delete el.dataset.clawDirty}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),2400)}
function openImage(id){activeImageRow=id;const r=state.rows.find(x=>x.id===id);pendingImage=r.image||'';$('#imageKind').textContent=state.type!=='HRC'?'MAQUETTE':'HÌNH SẢN PHẨM';$('#imageUrl').value=pendingImage.startsWith('data:')?'':pendingImage;drawImagePreview();openModal('image')}
function drawImagePreview(){const box=$('#imagePreview');box.innerHTML=pendingImage?`<img src="${esc(proxiedImage(pendingImage))}" alt="Xem trước">`:'Chưa có ảnh'}
function compressImage(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{const max=900,scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL('image/jpeg',.78))};img.src=reader.result};reader.readAsDataURL(file)})}

function quotePayload(){collect();const {subtotal:sub,tax}=QuoteMath.totals(state),total=sub+tax;return {quote_number:state.quoteNo,quote_type:state.type,quote_date:state.date,responsible:state.owner,responsible_phone:state.ownerPhone||'',customer:{sapo_id:state.customerId&&!state.customerId.startsWith('local_')?state.customerId:null,local_id:state.customerId?.startsWith('local_')?state.customerId:null,name:state.customer,tax_code:state.customerTaxCode||'',customer_code:state.customerCode||'',established_date:state.customerEstablishedDate||'',address:state.customerAddress||'',customer_type:state.customerType||'',discounts:state.customerDiscounts||{},contact:state.contact,contact_name:state.contact,phone:state.phone,contact_phone:state.phone,email:state.email},items:state.rows.map((r,i)=>{const cartons=r.perCarton?Math.ceil(r.qty/r.perCarton):0;return {line:i+1,tax_percent:QuoteMath.rate(r,state),price_policy:r.pricePolicy||'',sku:r.sku,name:r.name,description:r.description||r.name,bundle_contents:r.bundleContents||'',print_description:r.printDescription||'',packaging_description:r.packagingDescription||'theo tiêu chuẩn nhà sản xuất',unit:r.unit,quantity:r.qty,unit_price:r.price,unit_price_manual:Boolean(r.manualPrice),discount_type:r.discountType||'percent',discount_percent:r.discountType==='amount'?0:(Number.isFinite(Number(r.discount))?Number(r.discount):0),discount_amount:r.discountType==='amount'?r.discount:r.price*r.discount/100,print_fee:r.printFee,price_after_discount:afterPrice(r),line_total:afterPrice(r)*r.qty,status:r.status||'Đợi triển khai',delivery_date:r.deliveryDate||'',cartons,weight_kg:cartons*r.cartonWeight,image_url:r.image.startsWith('data:')?'[uploaded-on-device]':r.image};}),vat_percent:new Set(state.rows.map(r=>QuoteMath.rate(r,state))).size>1?null:(state.rows.length?QuoteMath.rate(state.rows[0],state):state.vat),vat_amount:tax,subtotal:sub,subtotal_before_vat:sub,total,total_in_words:HrcPdf.amountInWords(total),notes:state.notes,contract_number:state.contractNumber||'',so_hd:state.soHd||'',legal_entity:state.legalEntity||'',payment_days:state.paymentDays??'',delivery_date:state.deliveryDate||'',customer_tax_code:state.customerTaxCode||'',collection_account_name:state.collectionAccountName||'',payment:state.payment||'',deposit:state.deposit||'',delivery:state.delivery||''}}
function saveToLibrary(){}
function drawLibrary(){}

function wrapText(ctx,text,maxWidth){const words=String(text||'').split(/\s+/),lines=[];let line='';for(const w of words){const test=line?`${line} ${w}`:w;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=w}else line=test}if(line)lines.push(line);return lines}
function pdfDate(){return (state.date||today()).split('-').reverse().join('/')}
function pdfLine(c,x1,y1,x2,y2,w=1){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.lineWidth=w;c.strokeStyle='#111';c.stroke()}
function pdfCell(c,x,y,w,h,text,opt={}){c.fillStyle=opt.fill||'#fff';c.fillRect(x,y,w,h);c.strokeStyle='#111';c.lineWidth=1;c.strokeRect(x,y,w,h);c.fillStyle=opt.color||'#111';c.font=`${opt.bold?'bold ':''}${opt.size||16}px ${opt.font||'Arial'}`;c.textAlign=opt.align||'center';c.textBaseline='middle';const lines=wrapText(c,text,Math.max(8,w-10)).slice(0,opt.maxLines||8),lh=opt.lineHeight||((opt.size||16)+3),start=y+h/2-(lines.length-1)*lh/2;lines.forEach((line,i)=>c.fillText(line,opt.align==='left'?x+6:opt.align==='right'?x+w-6:x+w/2,start+i*lh));c.textBaseline='alphabetic'}
function pdfFitImage(c,img,x,y,w,h){if(!img)return;const s=Math.min(w/img.width,h/img.height);c.drawImage(img,x+(w-img.width*s)/2,y+(h-img.height*s)/2,img.width*s,img.height*s)}
function pdfBrand(c,W){c.fillStyle='#102a56';c.textAlign='center';c.font='bold 14px Arial';c.fillText('CÔNG TY TNHH SẢN XUẤT THƯƠNG MẠI BÁCH NGÂN',W/2,20)}
function pdfHeaderB2b(c,W,M){pdfBrand(c,W);c.fillStyle='#000';c.textAlign='center';c.font='bold 34px "Times New Roman"';c.fillText('BẢNG CHÀO GIÁ',W/2,62);c.font='20px "Times New Roman"';c.fillText(`Ngày ${pdfDate()}`,W/2,91);c.textAlign='left';c.font='bold 19px "Times New Roman"';c.fillText(`Kính gửi: ${state.customer||'Quý khách hàng'};`,M,132);c.font='17px "Times New Roman"';c.fillText('Rất cám ơn sự quan tâm của Quý khách đến sản phẩm của Công ty chúng tôi.',M,164);c.fillText('Theo yêu cầu của Quý khách, chúng tôi xin gửi bảng chào giá các sản phẩm sứ theo chi tiết như sau:',M,196)}
function pdfBlock(c,text,x,y,maxWidth,opt={}){c.textAlign=opt.align||'left';c.fillStyle=opt.color||'#000';c.font=`${opt.bold?'bold ':''}${opt.size||16}px ${opt.font||'"Times New Roman"'}`;let yy=y;String(text||'').split('\n').forEach(part=>{const lines=wrapText(c,part,maxWidth);(lines.length?lines:['']).forEach(line=>{c.fillText(line,x,yy);yy+=opt.lineHeight||22})});return yy}
function b2bDescription(r){return `${r.name}\n- Thương hiệu: Gốm sứ Minh Long I\n- Mã hàng: ${r.sku}\n- Bộ gồm: ${r.bundleContents||'.......'}\n- In ấn logo: ${r.printFee>0?(r.printDescription||'Có tính phí in ấn logo'):'Chưa bao gồm chi phí in ấn logo'}\n- Đóng gói: hộp + túi giấy nhà sản xuất`}
function loadCanvasImage(src,timeoutMs=10000){return new Promise(resolve=>{if(!src){resolve(null);return}const candidates=[proxiedImage(src),imageFallback(src)].filter(Boolean);let i=0,done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value)},timer=setTimeout(()=>finish(null),timeoutMs),tryNext=()=>{if(i>=candidates.length){finish(null);return}const img=new Image();img.crossOrigin='anonymous';img.referrerPolicy='no-referrer';img.onload=()=>finish(img);img.onerror=()=>{i++;tryNext()};img.src=candidates[i]};tryNext()})}
async function loadExcelImages(rows){const images=[];for(let start=0;start<rows.length;start+=6){const batch=rows.slice(start,start+6);images.push(...await Promise.all(batch.map(row=>loadCanvasImage(row.image||imageMap.get(String(row.sku||'').toUpperCase())||'',30000))))}return images}
function openPdfTarget(){const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if(!ios)return null;const tab=window.open('about:blank','_blank');if(tab){tab.document.title='Đang tạo PDF';tab.document.body.innerHTML='<p style="font:16px Arial;padding:24px">Đang tạo file PDF, vui lòng chờ…</p>'}return tab}
async function deliverPdf(blob,fileName,target){const url=URL.createObjectURL(blob);if(target&&!target.closed){target.location.href=url;toast('PDF đã được mở để lưu hoặc chia sẻ')}else{const a=document.createElement('a');a.href=url;a.download=fileName;a.target='_blank';document.body.appendChild(a);a.click();a.remove();toast('Đã tạo và tải file PDF A4')}setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function reloadCurrentQuote(){
 if(!state._record?.id)return null;
 const record=await BN.api('/quotes/'+state._record.id);
 state={...record.data,_record:{id:record.id,revision:record.revision,canEdit:record.canEdit,contractApproval:record.contractApproval,canExportContract:record.canExportContract,hasPdf:false,approvalStatus:record.approvalStatus||state._record.approvalStatus||'pending'}};
 state.rows=(state.rows||[]).map(normalizeRow);
 hydrate();saveDraft();markQuoteSaved();BN.setPdfAction?.(state._record);
 return record;
}
BN.reloadCurrentQuote=reloadCurrentQuote;
async function createPdf(options={}){
 if(createPdf.pending)return;
 if(state._record?.id){try{await reloadCurrentQuote();toast('Đã nạp dữ liệu mới nhất trước khi tạo PDF');}catch(error){toast(error.message||'Không tải được dữ liệu mới nhất.');return}}
 if(!state.rows.length){toast('Chưa có sản phẩm để xuất PDF');return}
 if(state._record?.approvalStatus!=='approved'){toast('Báo giá đang đợi duyệt. Chỉ báo giá đã duyệt mới tải được file PDF.');return}
 collect();createPdf.pending=true;const pdfTarget=openPdfTarget();
 const button=$('#printQuote'),old=button.textContent;button.disabled=true;button.textContent='Đang tạo PDF…';
 try{
  const pdfState={...state,...(state.type==='HRC'?{hideHrcDiscountColumn:Boolean(options.hideHrcDiscountColumn)}:{}),...(state.type==='B2B'?{hideB2bDiscountColumn:Boolean(options.hideB2bDiscountColumn)}:{})},pdfRecord={id:state._record.id,revision:state._record.revision,canEdit:state._record.canEdit};
  const images=await Promise.all(pdfState.rows.map(r=>loadCanvasImage(r.image||imageMap.get(String(r.sku||'').toUpperCase())||'')));
  const banner=await loadCanvasImage(pdfState.type==='VIGIFTS'?'/vigifts-letterhead.png':'/hrc-letterhead.jpg');
  const bytes=await EditableQuotePdf.create({state:pdfState,images,banner}),blob=new Blob([bytes],{type:'application/pdf'}),date=(pdfState.date||today()).split('-').reverse().join('-'),fileName=`${cleanFile(pdfState.quoteNo)} - ${cleanFile(pdfState.customer)} - ${date}.pdf`;
  await BN.uploadPdf(blob,pdfRecord);state._record.hasPdf=true;
  await deliverPdf(blob,fileName,pdfTarget)

 }catch(err){console.error(err);if(pdfTarget&&!pdfTarget.closed)pdfTarget.close();alert(`Không thể tạo PDF: ${err?.message||'Vui lòng thử lại.'}`)}finally{createPdf.pending=false;button.disabled=false;if(state._record?.hasPdf)BN.setPdfAction?.(state._record);else button.textContent=old}
}

loadDraft();hydrate();loadCatalog();
// Keep typed contact data current before another action rehydrates the form.
['quoteNo','customerName','quoteDate','contactName','phone','email','owner','ownerPhone','vatRate','notes'].forEach(id=>$('#'+id).addEventListener('input',()=>{collect();refreshQuoteSaveState()}));
['quoteNo','customerName','quoteDate','contactName','phone','email','owner','ownerPhone','vatRate','notes'].forEach(id=>$('#'+id).addEventListener('change',()=>{saveDraft();if(id==='vatRate')render()}));
$('#customerName')?.addEventListener('input',refreshCustomerInfoToggle);
$('#customerName')?.addEventListener('change',refreshCustomerInfoToggle);
function nextQuoteNoForType(type){
 if(type===state.type&&state.quoteNo)return state.quoteNo;
 if(/^BG(?:HRC|B2B)-/.test(state.quoteNo)&&['HRC','B2B'].includes(type))return state.quoteNo.replace(/^BG(?:HRC|B2B)-/,`BG${type}-`);
 return makeNo(type);
}
function refreshQuoteDiscountTypeButtons(){
 $$('[data-quote-discount-type]').forEach(button=>{
  const type=button.dataset.quoteDiscountType;
  button.hidden=!canUseQuoteType(type);
  button.classList.toggle('active',type===pendingQuoteDiscountType);
  button.setAttribute('aria-pressed',String(type===pendingQuoteDiscountType));
 });
}
function setQuoteDiscountType(type,{resetNo=true}={}){
 if(!canUseQuoteType(type))type=firstAllowedQuoteType();
 pendingQuoteDiscountType=type;
 $('#quoteDiscountTypeName').textContent=type==='VIGIFTS'?'Vigifts':type;
 if(resetNo)$('#quoteDiscountNo').value=nextQuoteNoForType(type);
 refreshQuoteDiscountTypeButtons();
}
function openQuoteDiscountChoice(type){setQuoteDiscountType(type);$('#quoteDiscountDate').value=state.date||today();$('#quoteDefaultDiscount').value=Number(state.defaultDiscount)>0?Number(state.defaultDiscount):'';openModal('quoteDiscount')}
function quoteDiscountFormValues(type){return {quoteNo:$('#quoteDiscountNo')?.value.trim()||makeNo(type),date:$('#quoteDiscountDate')?.value||today()}}
function openFirstProductQuoteDiscount(wasEmpty){if(!wasEmpty||state._quoteMetaConfirmed)return;if($('#searchModal')?.classList.contains('open'))closeModal('search');openQuoteDiscountChoice(state.type)}
const canKeepRowsOnTypeChange=(from,to)=>['HRC','B2B'].includes(from)&&['HRC','B2B'].includes(to);
function switchQuoteTypeKeepingRows(type){if(type===state.type)return;collect();if(!canKeepRowsOnTypeChange(state.type,type))return openQuoteDiscountChoice(type);if(/^BG(?:HRC|B2B)-/.test(state.quoteNo))state.quoteNo=state.quoteNo.replace(/^BG(?:HRC|B2B)-/,`BG${type}-`);state.type=type;state.notes=defaultNotes(type);state.notesVersion=2;hydrate();saveDraft();toast(`Đã đổi sang mẫu ${type} và giữ nguyên sản phẩm, CK hiện tại`)}
function applyQuoteTypeAndDiscount({type,scope,discount=0,quoteNo='',date=''}){const changed=type!==state.type;collect();if(changed){const keepRows=canKeepRowsOnTypeChange(state.type,type);if(!keepRows){delete state._record;state.rows=[];}state.type=type;state.notes=defaultNotes(type);state.notesVersion=2;}state.quoteNo=quoteNo||nextQuoteNoForType(type);state.date=date||today();state.discountScope=scope;state.discountMode='percent';state.defaultDiscount=scope==='table'?Math.min(100,Math.max(0,Number(discount)||0)):0;state._quoteMetaConfirmed=true;if(scope==='table')state.rows.forEach(row=>{row.discountType='percent';row.discount=state.defaultDiscount});hydrate();saveDraft();toast(scope==='table'?`Đã áp dụng CK ${state.defaultDiscount}% cho báo giá ${type}`:'Đã chọn nhập CK thủ công từng dòng')}
$$('.quote-type').forEach(b=>b.onclick=async()=>{if(!canUseQuoteType(b.dataset.type))return;if(b.dataset.type!==state.type&&!(await confirmQuoteLeave()))return;if(b.dataset.type!==state.type&&state.rows.length&&canKeepRowsOnTypeChange(state.type,b.dataset.type))return switchQuoteTypeKeepingRows(b.dataset.type);if(b.dataset.type!==state.type&&state.rows.length&&!canKeepRowsOnTypeChange(state.type,b.dataset.type)&&!confirm('Đổi sang mẫu này sẽ tạo bảng mới. Tiếp tục?'))return;openQuoteDiscountChoice(b.dataset.type)});
$('#openSearch').onclick=$('#openSearch2').onclick=()=>{openModal('search');$('#searchInput').value='';drawResults()};$('#searchInput').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(drawResults,350)};
$('#searchAllProducts').onchange=e=>{searchAllProducts=e.currentTarget.checked;drawResults()};
$('#searchProductGroup').onchange=drawResults;
$('#searchPriceRange').onchange=()=>{
 const value=$('#searchPriceRange').value;if(value==='custom')return;
 const [min='',max='']=value.split(':');$('#searchPriceMin').value=min;$('#searchPriceMax').value=max;drawResults();
};
['searchPriceMin','searchPriceMax'].forEach(id=>$('#'+id).oninput=()=>{$('#searchPriceRange').value='custom';clearTimeout(searchTimer);searchTimer=setTimeout(drawResults,250)});
$('#clearSearchFilters').onclick=()=>{$('#searchInput').value='';$('#searchProductGroup').value='all';$('#searchPriceRange').value='';$('#searchPriceMin').value='';$('#searchPriceMax').value='';drawResults()};

$('#addBlank').onclick=()=>{const wasEmpty=!state.rows.length;state.rows.push(blankRow());render();saveDraft();openFirstProductQuoteDiscount(wasEmpty)};
$$('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
function startBlankQuote(extra={}){
 const type=canUseQuoteType(state.type)?state.type:firstAllowedQuoteType();
 state={type,quoteNo:makeNo(type),date:today(),customer:'',contact:'',phone:'',email:'',...currentUserOwner(),vat:8,notes:defaultNotes(type),notesVersion:2,rows:[],...extra};
 delete state._record;
 hydrate();saveDraft();BN.setPdfAction?.(null);
}
$('#newQuote').onclick=async()=>{if(!(await confirmQuoteLeave({allowDiscard:true})))return;startBlankQuote();openQuoteDiscountChoice(state.type);toast('Đã tạo báo giá mới')};
BN.startQuoteForCustomer=async customer=>{
 if(!(await confirmQuoteLeave({allowDiscard:true})))return false;
 const discounts=customer?.discounts&&typeof customer.discounts==='object'?customer.discounts:{};
 startBlankQuote({
  customerId:customer?.id||'',
  customer:customer?.name||'',
  customerCode:customer?.customerCode||'',
  customerTaxCode:customer?.taxCode||'',
  customerAddress:customer?.address||'',
  customerDiscounts:discounts,
  contact:customer?.contact||'',
  phone:customer?.phone||'',
  email:customer?.email||'',
 });
 toast(customer?.name?`Đã tạo báo giá cho ${customer.name}`:'Đã tạo báo giá từ khách hàng');
 return true;
};
$('#printingCostRows')?.addEventListener('input',event=>{
 if(!isManager()||!event.target.matches('[data-printing-unit]'))return;collectPrintingCosts();refreshProfit();saveDraft();
});
$('#printingCostRows')?.addEventListener('change',event=>{
 if(!isManager()||!event.target.matches('[data-printing-workshop]'))return;
 const rowId=event.target.closest('[data-printing-id]').dataset.printingId;
 if(event.target.value==='__add_workshop__'){openPrintingWorkshopForm(rowId);return;}
 collectPrintingCosts();refreshProfit();saveDraft();
});
$$('[data-close-printing-workshop]').forEach(button=>button.onclick=()=>$('#printingWorkshopDialog').close());
$('#printingWorkshopDialog')?.addEventListener('close',()=>{printingWorkshopTarget='';refreshPrintingCosts();});
$('#printingWorkshopForm')?.addEventListener('submit',async event=>{
 event.preventDefault();if(!isManager())return;const form=event.target,submit=form.querySelector('[type=submit]'),error=$('#printingWorkshopError');submit.disabled=true;error.textContent='';
 try{
  const result=await BN.api('/printing-workshops','POST',Object.fromEntries(new FormData(form))),workshop=result.workshop;
  printingWorkshops=[...printingWorkshops.filter(item=>item.id!==workshop.id),workshop];
  const row=state.rows.find(row=>row.id===printingWorkshopTarget);if(row)row.printing={...row.printing,workshop:workshop.name,workshopExplicit:true};
  $('#printingWorkshopDialog').close();refreshProfit();saveDraft();toast('Đã thêm xưởng in vào danh sách dùng chung');
 }catch(err){error.textContent=err.message||'Chưa lưu được xưởng in.';}finally{submit.disabled=false;}
});
$('#toggleProfit')?.addEventListener('click',()=>{if(!isManager())return;collect();showProfit=!showProfit;refreshProfit();});
$$('input[name="profitShippingPayer"]').forEach(input=>input.addEventListener('change',()=>{if(!isManager()||!input.checked)return;state.shipping={...state.shipping,payer:input.value};refreshProfit();saveDraft();}));
$('#saveQuote').onclick=saveToLibrary;$('#quoteLibrary').onclick=()=>{drawLibrary();openModal('library')};$('#refreshProfitCosts')?.addEventListener('click',updatePurchaseCosts);$('#toggleCostFields')?.addEventListener('click',()=>{if(!isManager())return;collect();showCostFields=!showCostFields;render();saveDraft();toast(showCostFields?'Đã hiện cột giá nhập':'Đã ẩn cột giá nhập')});
$('#imageUrl').oninput=()=>{pendingImage=driveUrl($('#imageUrl').value);drawImagePreview()};$('#imageFile').onchange=async e=>{if(e.target.files[0]){pendingImage=await compressImage(e.target.files[0]);drawImagePreview()}};$('#applyImage').onclick=()=>{const r=state.rows.find(x=>x.id===activeImageRow);if(r)r.image=pendingImage;closeModal('image');render();saveDraft();toast('Đã chèn hình và tự căn vừa ô')};$('#removeImage').onclick=()=>{pendingImage='';$('#imageUrl').value='';drawImagePreview()};
function openHrcPdfChoice(){
 if(!['HRC','B2B'].includes(state.type)){createPdf();return}
 const typeName=state.type==='B2B'?'B2B':'HRC';
 const eyebrow=$('#hrcPdfChoiceModal .eyebrow'),note=$('#hrcPdfChoiceModal .payload-note');
 if(eyebrow)eyebrow.textContent=`TẢI BÁO GIÁ ${typeName}`;
 $('#hrcPdfChoiceTitle').textContent='Chọn mẫu file PDF';
 if(note)note.textContent=`Chọn cách hiển thị cột chiết khấu trong file báo giá ${typeName}.`;
 openModal('hrcPdfChoice');
}
globalThis.openHrcPdfChoice=openHrcPdfChoice;
$('#printQuote').onclick=openHrcPdfChoice;
$('#downloadHrcPdfHiddenCk').onclick=()=>{closeModal('hrcPdfChoice');createPdf(state.type==='B2B'?{hideB2bDiscountColumn:true}:{hideHrcDiscountColumn:true})};
$('#downloadHrcPdfShownCk').onclick=()=>{closeModal('hrcPdfChoice');createPdf(state.type==='B2B'?{hideB2bDiscountColumn:false}:{hideHrcDiscountColumn:false})};
$('#applyQuoteDefaultDiscount').onclick=()=>{const type=pendingQuoteDiscountType||state.type,value=Math.min(100,Math.max(0,inputNumber($('#quoteDefaultDiscount').value))),meta=quoteDiscountFormValues(type);closeModal('quoteDiscount');applyQuoteTypeAndDiscount({type,scope:'table',discount:value,...meta})};
$('#useManualDiscounts').onclick=()=>{const type=pendingQuoteDiscountType||state.type,meta=quoteDiscountFormValues(type);closeModal('quoteDiscount');applyQuoteTypeAndDiscount({type,scope:'manual',...meta})};
$$('[data-quote-discount-type]').forEach(button=>button.addEventListener('click',()=>setQuoteDiscountType(button.dataset.quoteDiscountType)));
$('#quoteDiscountPickCustomer')?.addEventListener('click',()=>document.querySelector('.customer-pick-button')?.click());
const quoteTopActionsToggle=$('#quoteTopActionsToggle'),quoteTopActions=quoteTopActionsToggle?.closest('.top-actions');if(quoteTopActionsToggle&&quoteTopActions)quoteTopActionsToggle.onclick=()=>{quoteTopActions.classList.toggle('is-expanded');const expanded=quoteTopActions.classList.contains('is-expanded'),label=quoteTopActionsToggle.querySelector('span');quoteTopActionsToggle.setAttribute('aria-expanded',String(expanded));if(label)label.textContent=expanded?'Ẩn thao tác báo giá ▴':'Thao tác báo giá ▾';else quoteTopActionsToggle.textContent=expanded?'Ẩn thao tác báo giá ▴':'Thao tác báo giá ▾';};
const mobileQuoteActionsToggle=$('#mobileQuoteActionsToggle'),mobileQuoteActions=$('#mobileQuoteActions');if(mobileQuoteActionsToggle&&mobileQuoteActions)mobileQuoteActionsToggle.onclick=()=>{mobileQuoteActions.hidden=!mobileQuoteActions.hidden;mobileQuoteActionsToggle.setAttribute('aria-expanded',String(!mobileQuoteActions.hidden));mobileQuoteActionsToggle.textContent=mobileQuoteActions.hidden?'Tác vụ báo giá ▾':'Ẩn tác vụ báo giá ▴';};
const customerInfoToggle=$('#customerInfoToggle'),customerCard=customerInfoToggle?.closest('.customer-card');if(customerInfoToggle&&customerCard){refreshCustomerInfoToggle();customerInfoToggle.onclick=()=>{customerCard.classList.toggle('is-expanded');refreshCustomerInfoToggle();};}
function toggleMobileSheet(id,force){
 const sheet=$('#'+id),nav=id==='mobileTemplateSheet'?$('#mobileTemplateNav'):$('#mobileMoreNav');
 if(!sheet)return;
 const open=force!==undefined?force:sheet.hidden;
 sheet.hidden=!open;
 nav?.setAttribute('aria-expanded',String(open));
 document.body.classList.toggle('mobile-sheet-open',open||Boolean($('.mobile-sheet:not([hidden])')));
}
function closeMobileSheets(){
 ['mobileTemplateSheet','mobileMoreSheet'].forEach(id=>toggleMobileSheet(id,false));
}
function refreshMobileTemplateOptions(){
 $$('[data-mobile-type]').forEach(button=>{
  const type=button.dataset.mobileType;
  button.hidden=!canUseQuoteType(type);
  button.classList.toggle('active',type===state.type);
 });
}
let mobileTemplateMode='new';
function openMobileTemplateSheet(mode){
 mobileTemplateMode=mode;
 const title=$('#mobileTemplateSheetTitle');
 if(title)title.textContent=mode==='switch'?'Đổi mẫu báo giá':'Tạo báo giá mới';
 refreshMobileTemplateOptions();
 toggleMobileSheet('mobileMoreSheet',false);
 toggleMobileSheet('mobileTemplateSheet',true);
}
async function createNewQuoteWithType(type){
 if(!canUseQuoteType(type))return;
 if(!(await confirmQuoteLeave({allowDiscard:true})))return;
 collect();
 state={type,quoteNo:makeNo(type),date:today(),customer:'',contact:'',phone:'',email:'',...currentUserOwner(),vat:8,notes:defaultNotes(type),notesVersion:2,rows:[]};
 hydrate();saveDraft();openQuoteDiscountChoice(type);toast(`Đã tạo báo giá mới mẫu ${type}`);
}
$('#mobileTemplateNav')?.addEventListener('click',async()=>{
 closeMobileSheets();
 if(!(await confirmQuoteLeave({allowDiscard:true})))return;
 startBlankQuote();
 openQuoteDiscountChoice(state.type);
});
$('#templateSwitchInline')?.addEventListener('click',()=>openMobileTemplateSheet('switch'));
$('#mobileMoreNav')?.addEventListener('click',()=>{toggleMobileSheet('mobileTemplateSheet',false);toggleMobileSheet('mobileMoreSheet')});
$('#mobileSearchNav')?.addEventListener('click',()=>{$('#openSearch2').click()});
$('#mobileAddRowNav')?.addEventListener('click',()=>{customerCard?.classList.add('is-expanded');refreshCustomerInfoToggle();customerCard?.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('#customerName')?.focus(),260)});
function runMobilePdfDownload(){closeMobileSheets();(globalThis.openHrcPdfChoice||createPdf)()}
$('#mobileDownloadNav')?.addEventListener('click',runMobilePdfDownload);
$('#mobileDownloadPdfA4')?.addEventListener('click',runMobilePdfDownload);
$$('[data-mobile-type]').forEach(button=>button.addEventListener('click',async()=>{const type=button.dataset.mobileType;closeMobileSheets();if(mobileTemplateMode==='new')return createNewQuoteWithType(type);document.querySelector(`.quote-type[data-type="${type}"]`)?.click()}));
$$('[data-click-target]').forEach(button=>button.addEventListener('click',()=>{closeMobileSheets();const target=$('#'+button.dataset.clickTarget);if(target&&!target.hidden)target.click();else toast('Tác vụ này hiện chưa khả dụng')}));
$$('[data-mobile-sheet-close]').forEach(button=>button.addEventListener('click',closeMobileSheets));
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMobileSheets()});
$('#mobileSapoCopy').onclick=()=>$('#previewPayload').click();
let confirmedSapoPayload=null,sapoStatusRequest=0,sapoConnectionRequest=0,sapoCopyContext=null;
function setSapoOrderLink(status){
 const updating=status?.status==='updating',cancelled=status?.status==='cancelled',copied=['created','existing'].includes(status?.status),link=$('#viewSapoOrder'),available=copied&&Boolean(status?.sapoOrderUrl);
 const headerOrder=document.getElementById('headerCreateOrder');if(headerOrder)headerOrder.hidden=copied;
 $('#previewPayload').hidden=copied;$('#mobileSapoCopy')?.toggleAttribute('hidden',copied);
 link.hidden=!available&&!cancelled&&!updating;link.classList.toggle('is-cancelled',cancelled);link.classList.toggle('is-updating',updating);link.setAttribute('aria-disabled',String(cancelled||updating));
 if(updating){link.removeAttribute('href');link.innerHTML='<span class="sapo-updating-icon" aria-hidden="true">↻</span><span>Đang cập nhật</span>';}
 else if(cancelled){link.removeAttribute('href');link.innerHTML='<span class="sapo-cancel-icon" aria-hidden="true">×</span><span>Đã hủy</span>';}
 else if(available){link.href=status.sapoOrderUrl;link.innerHTML='<img src="/sapo-icon.jpeg" alt=""><span>Xem đơn</span>';}
 else {link.removeAttribute('href');link.innerHTML='<img src="/sapo-icon.jpeg" alt=""><span>Xem đơn</span>';}
}
async function createExcel(){
 if(createExcel.pending)return;
 if(state._record?.id){try{await reloadCurrentQuote();toast('Đã nạp dữ liệu mới nhất trước khi tạo Excel');}catch(error){toast(error.message||'Không tải được dữ liệu mới nhất.');return}}
 if(!state.rows.length){toast('Chưa có sản phẩm để xuất Excel');return;}
 collect();createExcel.pending=true;
 try{
  const images=await loadExcelImages(state.rows);
  const missingImages=images.filter(image=>!image).length;if(missingImages)throw Error(`Còn ${missingImages} sản phẩm chưa tải được ảnh. Vui lòng kiểm tra ảnh trên báo giá rồi thử lại.`);
  const banner=await loadCanvasImage(state.type==='VIGIFTS'?'/vigifts-letterhead.png':'/hrc-letterhead.jpg');
  await QuoteExcel.download(state,{images,banner});BN.notifyEvent?.('quote_excel_download',{quoteNo:state.quoteNo,customer:state.customer});toast('Đã tải file Excel gồm báo giá và phí vận chuyển');
 }
 catch(error){console.error(error);toast(error?.message||'Không thể tạo file Excel. Vui lòng thử lại.');}
 finally{createExcel.pending=false;}
}
const sapoOrderStatusHtml=status=>{
 if(!status)return '';
 const complete=['created','existing'].includes(status.status),cancelled=status.status==='cancelled',code=status.sapoOrderCode||status.sapoOrderId||'';
 const detail=[complete?'Đơn Sapo đã sẵn sàng.':cancelled?'Đơn Sapo đã hủy.':'Trạng thái Sapo: '+status.status,code?`Mã đơn: ${code}`:'',status.message||''].filter(Boolean).join(' ');
 const link=complete&&status.sapoOrderUrl?`<a class="btn soft sapo-order-link" href="${esc(status.sapoOrderUrl)}" target="_blank" rel="noopener noreferrer">Xem đơn hàng Sapo</a>`:'';
 return `<div class="sapo-order-status"><p>${esc(detail)}</p>${link}</div>`;
};
async function refreshSapoOrderStatus(quoteNumber=state.quoteNo,{showUpdating=false,poll=false,recordId:explicitRecordId='',updatePageLink=true}={}){
 const recordId=explicitRecordId||state._record?.id;
 if(!recordId){if(updatePageLink)setSapoOrderLink(null);return null;}
 const request=++sapoStatusRequest,read=()=>BN.api('/quotes/'+encodeURIComponent(recordId)+'/sapo-status'),isCurrent=()=>explicitRecordId||state._record?.id===recordId;
 if(showUpdating&&updatePageLink)setSapoOrderLink({status:'updating'});
 try{
  let result=await read(),status=result.status,initialUpdate=status?.updatedAt||'';
  if(request!==sapoStatusRequest||!isCurrent())return null;
  // Keep the page responsive while allowing an in-flight Claw callback to update the button.
  if(poll&&status?.sapoOrderId&&!['cancelled'].includes(status.status)){
   if(updatePageLink)setSapoOrderLink({status:'updating'});
   for(let attempt=0;attempt<8;attempt++){
    await new Promise(resolve=>setTimeout(resolve,2500));
    if(request!==sapoStatusRequest||!isCurrent())return null;
    result=await read();status=result.status;
    if((status?.updatedAt||'')!==initialUpdate)break;
   }
  }
  if(request!==sapoStatusRequest||!isCurrent())return null;
  if(updatePageLink)setSapoOrderLink(status);const modalStatus=$('#sapoOrderStatus');
  if(modalStatus&&confirmedSapoPayload?.quote_number===quoteNumber)modalStatus.innerHTML=sapoOrderStatusHtml(status);
  return status;
 }catch{if(request===sapoStatusRequest&&updatePageLink)setSapoOrderLink(null);return null;}
}
BN.refreshSapoOrderLink=refreshSapoOrderStatus;
function sapoCopyErrorMessage(error){
 const messages={
  SAPO_SESSION_EXPIRED:'Phiên Sapo direct hết hạn. Manager cần đăng nhập lại Sapo rồi cập nhật phiên Sapo trên web báo giá.',
  SAPO_PERMISSION_DENIED:'Tài khoản Sapo hiện tại thiếu quyền tạo đơn/sản phẩm/khách hàng. Manager cần đổi sang tài khoản đủ quyền rồi cập nhật lại phiên.',
  SAPO_DIRECT_HTTP_ERROR:'Sapo đang trả lỗi khi tạo đơn. Anh kiểm tra Sapo rồi thử lại để tránh tạo trùng.',
  SAPO_DIRECT_UNREACHABLE:'Sapo direct chưa phản hồi. Anh kiểm tra mạng/Sapo rồi thử lại.',
  SAPO_COOKIE_MISSING:'Chưa cấu hình phiên Sapo direct. Manager cần cập nhật phiên Sapo trước khi copy đơn.',
 };
 return messages[error?.code]||error?.message||'Chưa xác nhận được kết quả chuyển báo giá. Anh kiểm tra Sapo trước khi thử lại để tránh tạo trùng.';
}
async function openSapoCopyPayload(payload,{recordId='',updatePageLink=true,revision=state._record?.revision,approvalStatus=state._record?.approvalStatus}={}){
 if(approvalStatus!=='approved'){toast('Báo giá cần được duyệt trước khi tạo đơn Sapo.');return;}
 if(updatePageLink&&BN.quoteHasUnsavedChanges?.()){toast('Vui lòng lưu báo giá trước khi tạo đơn Sapo.');return;}
  confirmedSapoPayload=payload;sapoCopyContext={recordId:recordId||state._record?.id||'',revision,updatePageLink};const q=confirmedSapoPayload,c=q.customer||{};
  const field=(label,value)=>`<div><span>${label}</span><strong>${esc(value||'Chưa nhập')}</strong></div>`;
  const formatUnit=typeof unitMoney==='function'?unitMoney:money;
 $('#sapoConfirmation').innerHTML=`<div class="sapo-confirm-fields">${field('Số báo giá',q.quote_number)}${field('Ngày báo giá',q.quote_date?.split('-').reverse().join('/'))}${field('Khách hàng',c.name)}${field('Mã số thuế',c.tax_code)}${field('Người liên hệ',c.contact)}${field('SĐT khách hàng',c.phone)}${field('Nhân viên phụ trách',q.responsible)}${field('SĐT phụ trách',q.responsible_phone)}</div><div class="sapo-confirm-table"><table><thead><tr><th>Sản phẩm / SKU</th><th>SL</th><th>Đơn giá</th><th>CK</th><th>Phí in/SP</th><th>VAT</th><th>Thành tiền</th><th>Ngày giao</th></tr></thead><tbody>${q.items.map((r,i)=>`<tr><td><b>${esc(r.name)}</b><small>${esc(r.sku)}</small></td><td>${esc(r.quantity)}</td><td>${formatUnit(r.unit_price)}</td><td>${r.discount_type==='amount'?formatUnit(r.discount_amount)+'/sp':esc(r.discount_percent)+'%'}</td><td>${formatUnit(r.print_fee)}</td><td>${esc(r.tax_percent)}%</td><td>${money(r.line_total)}</td><td><input type="date" data-sapo-delivery="${i}" aria-label="Ngày giao dòng ${i+1}" required value="${esc(r.delivery_date||q.delivery_date||'')}"></td></tr>`).join('')||'<tr><td colspan="7">Chưa có sản phẩm trong báo giá.</td></tr>'}</tbody></table></div><div class="sapo-confirm-totals">${field('Tiền hàng trước VAT',money(q.subtotal))}${field('Thuế VAT',money(q.vat_amount))}${field('Tổng thanh toán',money(q.total))}</div>${q.notes?`<div class="sapo-confirm-notes"><b>Ghi chú báo giá</b><p>${esc(q.notes)}</p></div>`:''}<div id="sapoOrderStatus"></div>`;
 const valid=Boolean(c.name&&q.items.length);
 $('#sendWebhook').textContent='Xác nhận copy vào Sapo';
 $('#sendWebhook').disabled=true;
 $('#sapoSendStatus').textContent=valid?'Đang kiểm tra kết nối Sapo…':'Vui lòng nhập khách hàng và thêm sản phẩm trước khi copy.';
 openModal('payload');
 await refreshSapoOrderStatus(q.quote_number,{recordId,updatePageLink});
 if(valid&&confirmedSapoPayload===q)await checkSapoCopyConnection();
}
async function checkSapoCopyConnection(){
 const q=confirmedSapoPayload,request=++sapoConnectionRequest;
 if(!q)return;
 const button=$('#sendWebhook');button.disabled=true;
 $('#sapoSendStatus').textContent='Đang kiểm tra kết nối Sapo…';
 try{
  const result=await BN.api('/sapo-connection');
  if(request!==sapoConnectionRequest||confirmedSapoPayload!==q)return;
  if(!result.ok)throw Error(result.message||'Chưa kết nối được Sapo.');
  $('#sapoSendStatus').textContent=result.message;
  button.disabled=!(q.customer?.name&&q.items?.length);
 }catch(error){
  if(request!==sapoConnectionRequest||confirmedSapoPayload!==q)return;
  $('#sapoSendStatus').textContent=(error.message||'Chưa kết nối được Sapo.')+' Vui lòng liên hệ Manager cập nhật kết nối, sau đó bấm Kiểm tra lại kết nối.';
 }
}
$('#retrySapoConnection')?.addEventListener('click',checkSapoCopyConnection);
BN.openSapoCopyPayload=openSapoCopyPayload;
$('#previewPayload').onclick=async()=>{
 saveDraft();await openSapoCopyPayload(quotePayload(),{recordId:state._record?.id});
};
$('#sendWebhook').onclick=async()=>{
 const q=confirmedSapoPayload,b=$('#sendWebhook');if(b.disabled||!q)return;
 b.disabled=true;b.textContent='Đang chuyển báo giá…';$('#sapoSendStatus').textContent='';
 try{
  const context=sapoCopyContext,delivery_dates=[...document.querySelectorAll('[data-sapo-delivery]')].map(el=>el.value);
  if(delivery_dates.length!==q.items.length||delivery_dates.some(date=>!date))throw Error('Vui lòng nhập ngày giao cho từng sản phẩm.');
  const result=await BN.api('/sapo-copy','POST',{quote_id:context.recordId,revision:context.revision,delivery_dates});
  if(!['created','existing'].includes(result.status)||!result.sapoOrderId)throw Error(result.message||'Sapo chưa xác nhận đơn hàng. Kiểm tra Sapo trước khi thử lại.');
  if(confirmedSapoPayload!==q)return;
  $('#sapoSendStatus').textContent=result.message;
  $('#sapoOrderStatus').innerHTML=sapoOrderStatusHtml(result)+(result.followup?`<p><b>Công nợ dự kiến trên web: ${money(result.followup.balance)}</b> · Chưa ghi nhận thu tiền. <a href="/receivables.html">Xem công nợ</a></p>`:'');
  if(result.followup&&state._record?.id===context.recordId){state.orderFollowup=result.followup;state.rows.forEach((row,i)=>{if(result.followup.lines[i]?.sku===row.sku)row.deliveryDate=result.followup.lines[i].deliveryDate;});saveDraft();BN.markQuoteSaved?.();}
  if(context?.updatePageLink&&state._record?.id===context.recordId)setSapoOrderLink(result);
  b.textContent=result.status==='existing'?'Đơn đã có trên Sapo':'Đã tạo đơn Sapo';
  confirmedSapoPayload=null;
 }
 catch(error){if(confirmedSapoPayload!==q)return;$('#sapoSendStatus').textContent=sapoCopyErrorMessage(error);b.textContent='Thử lại';b.disabled=false;}
};
document.addEventListener('keydown',e=>{if(e.key==='F2'){e.preventDefault();openModal('search');$('#searchInput').value='';drawResults()}if(e.key==='Escape')$$('.modal.open').forEach(m=>closeModal(m.id.replace('Modal','')))})
window.addEventListener('beforeunload',event=>{if(!quoteHasUnsavedChanges())return;event.preventDefault();event.returnValue='';});

let selectedQuoteRow=null;
document.getElementById('quoteRows').addEventListener('focusin',e=>{const tr=e.target.closest('tr[data-id]');if(tr)selectedQuoteRow=tr.dataset.id});
document.getElementById('quoteRows').addEventListener('click',e=>{const tr=e.target.closest('tr[data-id]');if(tr)selectedQuoteRow=tr.dataset.id});
document.addEventListener('keydown',e=>{
 if(!['F6','F7'].includes(e.key)||e.ctrlKey||e.altKey||e.metaKey)return;
 e.preventDefault();if(document.querySelector('.modal.open'))return;
 const rows=[...document.querySelectorAll('#quoteRows tr[data-id]')];
 const tr=rows.find(r=>r.dataset.id===selectedQuoteRow)||rows[0];
 if(!tr){toast('Thêm sản phẩm trước khi nhập chiết khấu hoặc phí in');return;}
 const input=tr.querySelector('[data-field="'+(e.key==='F6'?'discount':'printFee')+'"]');
 if(!input){toast('Phí in có trên báo giá B2B và Vigifts');return;}
 input.focus();input.select();input.scrollIntoView({block:'nearest'});
});

// Product master data is independent of the quotation currently being edited.
let editingProduct=null,productSaving=false;
const productDialog=document.createElement('div');productDialog.className='modal';productDialog.id='productEditorModal';productDialog.setAttribute('aria-hidden','true');
productDialog.innerHTML=`<div class="modal-backdrop"></div><div class="dialog product-editor" role="dialog" aria-modal="true" aria-labelledby="productEditorTitle"><div class="dialog-head"><div><p class="eyebrow">DANH MỤC SẢN PHẨM</p><h2 id="productEditorTitle">Thêm sản phẩm</h2></div><button type="button" class="icon-btn" aria-label="Đóng">×</button></div><p class="search-help">Lưu dùng chung trên web. Chưa đồng bộ thay đổi lên Sapo.</p><form id="productEditorForm"><div id="productEditorFields"></div><p id="productEditorStatus" role="status"></p><div class="dialog-actions"><button class="btn ghost" type="button" id="cancelProductEdit">Hủy</button><button class="btn primary" type="submit" id="saveProductEdit">Lưu sản phẩm</button></div></form></div>`;
document.body.append(productDialog);
function closeProductEditor(){if(productSaving)return;closeModal('productEditor');openModal('search');}
productDialog.querySelector('.modal-backdrop').onclick=productDialog.querySelector('.icon-btn').onclick=closeProductEditor;
$('#cancelProductEdit').onclick=closeProductEditor;
const catalogActions=document.createElement('div');catalogActions.className='catalog-actions';catalogActions.id='catalogActions';$('#catalogSnapshot').before(catalogActions);
const addProductButton=document.createElement('button');addProductButton.type='button';addProductButton.className='btn primary';addProductButton.id='createProduct';addProductButton.textContent='＋ Thêm sản phẩm';catalogActions.append(addProductButton);addProductButton.onclick=()=>openProductEditor();
const catalogMoreToggle=document.createElement('button'),catalogMoreActions=document.createElement('div');catalogMoreToggle.type='button';catalogMoreToggle.className='btn ghost catalog-more-toggle';catalogMoreToggle.textContent='⋯';catalogMoreToggle.title='Tác vụ quản trị';catalogMoreToggle.setAttribute('aria-label','Hiện tác vụ quản trị');catalogMoreToggle.setAttribute('aria-expanded','false');catalogMoreToggle.hidden=true;catalogMoreActions.id='catalogMoreActions';catalogMoreActions.className='catalog-more-actions';catalogMoreActions.hidden=true;catalogActions.append(catalogMoreToggle,catalogMoreActions);catalogMoreToggle.onclick=()=>{catalogMoreActions.hidden=!catalogMoreActions.hidden;catalogMoreToggle.setAttribute('aria-expanded',String(!catalogMoreActions.hidden));};new MutationObserver(()=>{catalogMoreToggle.hidden=!catalogMoreActions.children.length;if(!catalogMoreActions.children.length){catalogMoreActions.hidden=true;catalogMoreToggle.setAttribute('aria-expanded','false');}}).observe(catalogMoreActions,{childList:true});
function openProductEditor(sku){
 if(!catalogMeta.pricePolicies.length){toast('Vui lòng đợi tải xong danh mục.');return;}
 editingProduct=sku?catalog.find(p=>p.sku===sku):null;
 const p=editingProduct||{sku:'',name:'',unit:'Cái',brand:'',pattern:'',image:'',taxBasis:'Giá chưa bao gồm thuế',taxable:true,taxIn:8,taxOut:8,prices:[],stock:[]};
 const field=(name,label,value,type='text',attrs='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value??'')}" ${attrs}></label>`;
 const number=(name,label,value,max=1e6,min=0)=>field(name,label,value,'number',`step="any" min="${min}" max="${max}"`);
 $('#productEditorTitle').textContent=editingProduct?'Cập nhật sản phẩm':'Thêm sản phẩm';
 $('#productEditorFields').innerHTML=`<fieldset><legend>Thông tin sản phẩm</legend><div class="product-form-grid">${field('sku','Mã SKU *',p.sku,'text',`required maxlength="200" ${editingProduct?'readonly':''}`)}${field('name','Tên sản phẩm *',p.name,'text','required maxlength="2000"')}${field('unit','Đơn vị tính',p.unit)}${field('brand','Nhãn hiệu',p.brand,'text','list="productBrands"')}<datalist id="productBrands"><option>MINH LONG</option><option>MINH LONG - LYS</option><option>Lock</option></datalist>${field('pattern','Hoa văn / phiên bản',p.pattern)}<label>Áp dụng thuế<select name="taxable"><option value="true" ${p.taxable?'selected':''}>Có</option><option value="false" ${!p.taxable?'selected':''}>Không</option></select></label>${number('taxIn','Thuế đầu vào (%)',p.taxIn,100)}${number('taxOut','Thuế đầu ra (%)',p.taxOut,100)}<label>Cơ sở giá<select name="taxBasis"><option ${p.taxBasis!=='Giá đã bao gồm thuế'?'selected':''}>Giá chưa bao gồm thuế</option><option ${p.taxBasis==='Giá đã bao gồm thuế'?'selected':''}>Giá đã bao gồm thuế</option></select></label></div></fieldset><fieldset><legend>Hình ảnh đại diện</legend><div class="product-form-grid">${field('image','Đường dẫn ảnh HTTPS',p.image?.startsWith('data:')?'':p.image,'url')}<label>Hoặc chọn ảnh từ máy<input id="productImageUpload" type="file" accept="image/jpeg,image/png,image/webp"></label></div><div id="productImagePreview" class="product-image-preview"></div><button type="button" class="btn ghost" id="clearProductImage">Xóa ảnh</button></fieldset><fieldset><legend>Chính sách giá (đồng)</legend><div class="product-form-grid">${catalogMeta.pricePolicies.map((n,i)=>number('price'+i,esc(n),p.prices[i],1e12)).join('')}</div><p class="search-help">Để trống nếu chưa có giá. Giá bằng 0 được lưu là 0 đồng.</p></fieldset><fieldset><legend>Quy cách đóng thùng</legend><div class="product-form-grid">${[['perCarton','Sản phẩm / thùng'],['cartonWeight','Khối lượng / thùng (kg)'],['cartonLength','Chiều dài thùng (cm)'],['cartonWidth','Chiều rộng thùng (cm)'],['cartonHeight','Chiều cao thùng (cm)']].map(([k,n])=>number(k,n,p[k])).join('')}</div></fieldset><fieldset><legend>Tồn kho</legend><div class="product-form-grid">${catalogMeta.warehouses.map((w,i)=>number('stock'+i,esc(w),p.stock[i],1e12,-1e12)).join('')}</div><p class="search-help">Để trống nếu chưa có số liệu.</p></fieldset>`;
 const form=$('#productEditorForm');form._image=p.image||'';
 const preview=()=>{$('#productImagePreview').innerHTML=form._image?`<img src="${esc(form._image)}" alt="Ảnh đại diện">`:'';};preview();
 form.elements.image.oninput=()=>{form._image=form.elements.image.value.trim();preview();};
 $('#clearProductImage').onclick=()=>{form._image='';form.elements.image.value='';$('#productImageUpload').value='';preview();};
 $('#productImageUpload').onchange=async e=>{const file=e.target.files[0];if(!file)return;$('#saveProductEdit').disabled=true;try{if(file.size>15000000)throw Error('Chọn ảnh dưới 15 MB.');const value=await compressImage(file);if(value.length>700000)throw Error('Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn.');form._image=value;form.elements.image.value='';preview();$('#productEditorStatus').textContent='';}catch(err){$('#productEditorStatus').textContent=err.message||'Không đọc được ảnh.';}finally{$('#saveProductEdit').disabled=false;}};
 $('#productEditorStatus').textContent='';closeModal('search');openModal('productEditor');form.elements[editingProduct?'name':'sku'].focus();
}
$('#productEditorForm').onsubmit=async e=>{
 e.preventDefault();if(productSaving)return;const f=e.currentTarget;
 const numeric=k=>f.elements[k].value===''?null:Number(f.elements[k].value);
 const product={};for(const k of ['sku','name','unit','brand','pattern','taxBasis'])product[k]=f.elements[k].value.trim();product.image=f._image;product.taxable=f.elements.taxable.value==='true';
 for(const k of ['taxIn','taxOut'])product[k]=numeric(k);
 for(const k of ['perCarton','cartonWeight','cartonLength','cartonWidth','cartonHeight'])product[k]=numeric(k)??0;
 product.prices=Object.fromEntries(catalogMeta.pricePolicies.map((n,i)=>[n,numeric('price'+i)]));product.stock=Object.fromEntries(catalogMeta.warehouses.map((n,i)=>[n,numeric('stock'+i)]));
 productSaving=true;$('#saveProductEdit').disabled=true;$('#productEditorStatus').textContent='Đang lưu…';
 try{await BN.api('/products',editingProduct?'PUT':'POST',{product,revision:editingProduct?.revision||0,stockRevision:catalogMeta.stockRevision||0});await loadCatalog();productSaving=false;closeProductEditor();$('#searchInput').value=product.sku;drawResults();toast('Đã lưu sản phẩm. Bấm Chọn để thêm vào báo giá.');}catch(err){$('#productEditorStatus').textContent=err.message;}finally{productSaving=false;$('#saveProductEdit').disabled=false;}
};
