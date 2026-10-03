/* Lalamove only places an order after a staff member reviews the returned fee. */
(() => {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<div class="modal-backdrop"></div><div class="dialog payload-dialog" role="dialog" aria-modal="true"><div class="dialog-head"><div><p class="eyebrow">GIAO HÀNG LALAMOVE</p><h2>Đặt Lalamove</h2></div><button class="icon-btn" type="button">×</button></div><form><div class="contract-form-grid"><label class="field-wide">Địa chỉ lấy hàng<input name="pickup_address" list="lalamove-pickup-results" data-place="pickup" autocomplete="off" required><datalist id="lalamove-pickup-results"></datalist><small data-place-status="pickup">Gõ tối thiểu 3 ký tự rồi chọn gợi ý địa chỉ.</small></label><input name="pickup_lat" type="hidden"><input name="pickup_lng" type="hidden"><label>Tên người gửi<input name="sender_name" required readonly></label><label>SĐT người gửi<input name="sender_phone" type="tel" required readonly></label><label class="field-wide">Địa chỉ giao hàng<input name="dropoff_address" list="lalamove-dropoff-results" data-place="dropoff" autocomplete="off" required><datalist id="lalamove-dropoff-results"></datalist><small data-place-status="dropoff">Gõ tối thiểu 3 ký tự rồi chọn gợi ý địa chỉ.</small></label><input name="dropoff_lat" type="hidden"><input name="dropoff_lng" type="hidden"><label>Tên người nhận<input name="recipient_name" required></label><label>SĐT người nhận<input name="recipient_phone" type="tel" required></label><label>Số thùng<input name="item_quantity" type="number" min="1" step="1" required></label><label>Số kg<input name="item_weight_kg" type="number" min="0.1" step="0.1" required></label><label>Loại xe<select name="service_type"><option value="MOTORCYCLE">Xe máy</option><option value="CAR">Ô tô</option><option value="VAN">Xe van</option><option value="TRUCK">Xe tải</option></select></label><label>Hình thức giao<select name="delivery_speed"><option value="NORMAL">Bình thường</option><option value="EXPRESS">Hỏa tốc</option><option value="SLOW">Chậm</option></select></label><label class="field-wide">Ghi chú<textarea name="remarks" rows="2"></textarea></label></div><p class="payload-note">Chỉ cần nhập địa chỉ và chọn gợi ý. Tọa độ được lưu ẩn để lấy cước chính xác; “Xem cước” chưa đặt xe.</p><div class="lalamove-result" role="status"></div><div class="dialog-actions"><button type="button" class="btn ghost">Hủy</button><button type="button" class="btn soft" data-rate>Xem cước</button><button type="submit" class="btn primary" disabled>Đặt xe</button></div></form></div>`;
  document.body.append(modal);
  const form = modal.querySelector('form');
  const vehicleTypes = [['MOTORCYCLE','Xe máy - tối đa 30kg',30],['MOTORCYCLE_BAGA','Xe máy baga - tối đa 50kg',50],['PICK_UP_TRUCK','Ba gác / pickup / tải nhỏ 500kg',500],['VAN','Van 500kg - 1.5CBM',500],['VAN_750KG','Van 750kg - 3CBM',750],['VAN1000','Van 1000kg - 4CBM',1000],['TRUCK175','Tải/van 500kg',500],['TRUCK_750KG','Tải 750kg',750],['TRUCK330','Tải 1000kg - 5CBM',1000],['TRUCK_1250KG','Tải 1250kg - 7CBM',1250],['TRUCK_1500','Tải 1500kg - 7.5CBM',1500],['TRUCK550','Tải 2000kg - 10CBM',2000],['TRUCK_2500','Tải 2500kg - 11CBM',2500],['TRUCK_3500','Tải 3500kg',3500],['TRUCK_5000','Tải 5000kg',5000],['TRUCK_8000','Tải 8000kg',8000],['TRUCK_15000','Tải 15000kg',15000],['TRUCK_18000','Tải 18000kg',18000]];
  form.elements.service_type.replaceChildren(...vehicleTypes.map(([value,label]) => new Option(label, value)));
  const history = document.createElement('section');
  history.className = 'lalamove-history';
  history.innerHTML = '<b>Địa chỉ Lalamove đã dùng</b><small>Đang tải lịch sử...</small><div></div>';
  form.querySelector('.contract-form-grid').before(history);
  const result = modal.querySelector('[role=status]');
  const rateButton = modal.querySelector('[data-rate]');
  const placeButton = modal.querySelector('[type=submit]');
  const places = {pickup: new Map(), dropoff: new Map()};
  const searches = {pickup:{revision:0,timer:null},dropoff:{revision:0,timer:null}};
  let formRevision=0,historyRevision=0;
  let latestQuote = null;
  const set = (name, value) => { form.elements[name].value = value ?? ''; };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const close = () => { modal.classList.remove('open'); historyRevision++; ['pickup','dropoff'].forEach(clearSearch); };
  modal.querySelectorAll('.modal-backdrop,.icon-btn,.dialog-actions [type=button]:first-child').forEach(button => { button.onclick = close; });
  const totalCartons = quote => Math.max(1, Math.ceil((quote.items || []).reduce((sum, item) => sum + Number(item.cartons || 0), 0)));
  const totalWeight = quote => Math.max(.1, Math.round((quote.items || []).reduce((sum, item) => sum + Number(item.weight_kg || 0), 0) * 10) / 10);
  const responsePrice = data => data?.fee ?? data?.price ?? data?.totalFee ?? data?.total_fee ?? data?.data?.fee ?? data?.data?.price ?? data?.data?.totalFee ?? '';
  const responseMessage = data => data?.message || data?.data?.message || '';
  const distance = data => data?.distance_m ?? data?.lalamove?.data?.distance?.value ?? data?.data?.distance?.value;
  const orderId = data => data?.order_id ?? data?.orderId ?? data?.data?.order_id ?? data?.data?.orderId ?? data?.lalamove?.data?.orderId ?? '';
  const orderLink = data => data?.share_link ?? data?.shareLink ?? data?.order_url ?? data?.orderUrl ?? data?.data?.share_link ?? data?.data?.shareLink ?? data?.lalamove?.data?.shareLink ?? '';
  const coordinatesReady = kind => form.elements[`${kind}_lat`].value !== '' && form.elements[`${kind}_lng`].value !== '';
  const placeStatus = kind => modal.querySelector(`[data-place-status="${kind}"]`);
  const historyList = history.querySelector('div');
  const historyNote = history.querySelector('small');
  function invalidateQuote(message = '') {
    latestQuote = null;
    placeButton.disabled = true;
    placeButton.textContent = 'Đặt xe';
    if (message) result.textContent = message;
  }
  function quoteExpired(data) {
    const expires = data?.expires_at ?? data?.expiresAt ?? data?.data?.expires_at ?? data?.data?.expiresAt ?? data?.lalamove?.data?.expiresAt;
    return expires && Number.isFinite(Date.parse(expires)) && Date.now() >= Date.parse(expires);
  }
  function applyHistory(item) {
    formRevision++;
    ['pickup','dropoff'].forEach(clearSearch);
    set('pickup_address', item.pickup_address || '');
    set('pickup_lat', item.pickup_lat ?? '');
    set('pickup_lng', item.pickup_lng ?? '');
    set('dropoff_address', item.dropoff_address || '');
    set('dropoff_lat', item.dropoff_lat ?? '');
    set('dropoff_lng', item.dropoff_lng ?? '');
    set('recipient_name', item.recipient_name || form.elements.recipient_name.value);
    set('recipient_phone', item.recipient_phone || form.elements.recipient_phone.value);
    if (vehicleTypes.some(([value]) => value === item.service_type)) set('service_type', item.service_type);
    ['pickup','dropoff'].forEach(kind=>{placeStatus(kind).textContent=coordinatesReady(kind)?'Đã dùng địa chỉ cũ và tọa độ đã lưu.':'Địa chỉ cũ chưa có tọa độ. Bấm Tìm địa chỉ rồi chọn kết quả.';});
    invalidateQuote();
    if (item.last_fee !== undefined && item.last_fee !== null && item.last_fee !== '') result.innerHTML = `<b>Cước lần gần nhất: ${escape(Number(item.last_fee).toLocaleString('vi-VN'))}đ</b>`;
  }
  function renderHistory(addresses) {
    historyList.replaceChildren();
    if (!addresses.length) { historyNote.textContent = 'Chưa có địa chỉ Lalamove đã dùng.'; return; }
    historyNote.textContent = '20 chuyến gần nhất, chuyến mới nhất ở trên.';
    addresses.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${item.pickup_address || 'Chưa có điểm lấy'} → ${item.dropoff_address || 'Chưa có điểm giao'}`;
      button.onclick = () => applyHistory(item);
      historyList.append(button);
    });
  }
  const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
  const historyKey = item => [item.pickup_address, item.dropoff_address, item.recipient_phone, item.service_type].map(normalized).join('|');
  function isPreferredHistory(item, quote, customerPhone) {
    const phone = normalized(customerPhone);
    const recipientPhone = normalized(item.recipient_phone || item.customer_phone || '');
    const currentAddress = normalized(form.elements.dropoff_address.value || quote.customer?.address || '');
    const savedAddress = normalized(item.dropoff_address || '');
    return Boolean((phone && recipientPhone === phone) || (currentAddress.length >= 12 && (savedAddress === currentAddress || savedAddress.includes(currentAddress) || currentAddress.includes(savedAddress))));
  }
  function sortHistory(addresses, quote, customerPhone, matched) {
    const phone = normalized(customerPhone);
    const customer = normalized(quote.customer?.name || quote.customer?.contact_name || '');
    const deliveryAddress = normalized(quote.customer?.address || '');
    const matchedKeys = new Set(matched.map(historyKey));
    const score = item => {
      const itemPhone = normalized(item.recipient_phone || item.customer_phone || '');
      const itemText = normalized([item.pickup_address, item.dropoff_address, item.recipient_name, item.customer_name].join(' '));
      return (matchedKeys.has(historyKey(item)) ? 1000 : 0)
        + (phone && itemPhone === phone ? 500 : 0)
        + (deliveryAddress && itemText.includes(deliveryAddress) ? 200 : 0)
        + (customer && itemText.includes(customer) ? 100 : 0);
    };
    const unique = new Map();
    addresses.forEach(item => { if (!unique.has(historyKey(item))) unique.set(historyKey(item), item); });
    return [...unique.values()].sort((left, right) => score(right) - score(left));
  }
  async function refreshHistory(quote, customerPhone) {
    const revision=++historyRevision,startedAt=formRevision;
    historyNote.textContent = 'Đang tải lịch sử...';
    historyList.replaceChildren();
    try {
      const [allData, matchedData] = await Promise.all([
        BN.api('/lalamove/history', 'POST', {limit: 20}),
        BN.api('/lalamove/history', 'POST', {q: quote.quote_number || quote.quoteNo || '', customer_phone: customerPhone || '', limit: 20})
      ]);
      if(revision!==historyRevision||!modal.classList.contains('open'))return;
      const recent = (allData.addresses || []).slice(0, 20);
      renderHistory(recent);
      const preferred = sortHistory([...(matchedData.addresses || []), ...recent], quote, customerPhone, matchedData.addresses || []).find(item => isPreferredHistory(item, quote, customerPhone));
      if (preferred && startedAt===formRevision) {
        applyHistory(preferred);
        historyNote.textContent = 'Đã tự chọn tuyến trùng SĐT hoặc địa chỉ người nhận. Bạn có thể chọn tuyến khác bên dưới.';
      }
    } catch (error) { if(revision===historyRevision)historyNote.textContent = error.message; }
  }
  function clearSearch(kind) {
    const search=searches[kind];clearTimeout(search.timer);search.revision++;
    places[kind].clear();search.list?.replaceChildren();if(search.list)search.list.hidden=true;
    if(search.input)search.input.setAttribute('aria-expanded','false');
    if(search.button){search.button.disabled=false;search.button.textContent='Tìm địa chỉ';}
  }
  function applyPlace(kind,selected) {
    formRevision++;clearSearch(kind);
    set(`${kind}_address`,selected.label);set(`${kind}_lat`,selected.lat);set(`${kind}_lng`,selected.lng);
    placeStatus(kind).textContent='Đã chọn địa chỉ và tọa độ.';invalidateQuote();searches[kind].input.focus();
  }
  async function searchPlace(kind) {
    const search=searches[kind],query=search.input.value.trim();clearSearch(kind);
    if(query.length<3){placeStatus(kind).textContent='Gõ tối thiểu 3 ký tự, kèm quận/huyện và tỉnh/thành phố.';return;}
    const revision=search.revision;
    search.button.disabled=true;search.button.textContent='Đang tìm…';
    placeStatus(kind).textContent = 'Đang tìm địa chỉ...';
    try {
      const {matches=[]}=await BN.api('/lalamove/addresses?q='+encodeURIComponent(query));
      if(revision!==search.revision||query!==search.input.value.trim()||!modal.classList.contains('open'))return;
      matches.forEach((match,index) => {
        const option=document.createElement('button');option.type='button';option.className='place-option';option.textContent=match.label;
        option.setAttribute('role','option');option.setAttribute('aria-selected','false');
        option.onclick=()=>applyPlace(kind,match);
        option.onkeydown=event=>{if(event.key==='Escape'){search.list.hidden=true;search.input.setAttribute('aria-expanded','false');search.input.focus();event.preventDefault();}else if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const buttons=search.list.querySelectorAll('button');buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}};
        search.list.append(option);
      });
      search.list.hidden=!matches.length;search.input.setAttribute('aria-expanded',String(Boolean(matches.length)));
      placeStatus(kind).textContent=matches.length?'Chọn địa chỉ đúng trong danh sách bên dưới.':'Không tìm thấy địa chỉ. Thêm quận/huyện, tỉnh/thành phố hoặc tên địa điểm gần đó rồi tìm lại.';
    } catch(error) { if(revision===search.revision)placeStatus(kind).textContent=error.message||'Chưa tìm được địa chỉ. Bấm Tìm địa chỉ để thử lại.'; }
    finally {if(revision===search.revision){search.button.disabled=false;search.button.textContent='Tìm địa chỉ';}}
  }
  modal.querySelectorAll('[data-place]').forEach(input => {
    const kind=input.dataset.place,search=searches[kind],label=input.closest('label'),status=placeStatus(kind),field=document.createElement('div'),row=document.createElement('div'),button=document.createElement('button'),list=document.createElement('div');
    field.className='field-wide place-field';row.className='place-input-row';button.type='button';button.className='btn soft';button.textContent='Tìm địa chỉ';button.setAttribute('aria-label',kind==='pickup'?'Tìm địa chỉ lấy hàng':'Tìm địa chỉ giao hàng');
    input.removeAttribute('list');input.id=`lalamove-${kind}-address`;input.maxLength=250;input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
    document.getElementById(`lalamove-${kind}-results`).remove();list.id=`lalamove-${kind}-results`;list.className='place-results';list.hidden=true;list.setAttribute('role','listbox');list.setAttribute('aria-label',kind==='pickup'?'Gợi ý địa chỉ lấy hàng':'Gợi ý địa chỉ giao hàng');input.setAttribute('aria-controls',list.id);
    status.id=`lalamove-${kind}-status`;status.setAttribute('role','status');input.setAttribute('aria-describedby',status.id);
    label.before(field);label.htmlFor=input.id;label.className='';row.append(input,button);field.append(label,row,status,list);
    Object.assign(search,{input,button,list});button.onclick=()=>searchPlace(kind);
    input.addEventListener('input',()=>{formRevision++;clearSearch(kind);set(`${kind}_lat`,'');set(`${kind}_lng`,'');invalidateQuote();placeStatus(kind).textContent='Gõ tối thiểu 3 ký tự, kèm quận/huyện và tỉnh/thành phố.';if(input.value.trim().length>=3)search.timer=setTimeout(()=>searchPlace(kind),700);});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();searchPlace(kind);}else if(event.key==='ArrowDown'&&!list.hidden){event.preventDefault();list.querySelector('button')?.focus();}else if(event.key==='Escape'){clearSearch(kind);event.preventDefault();}});
  });
  const attribution=document.createElement('small');attribution.className='place-attribution';attribution.innerHTML='Dữ liệu địa chỉ: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>';form.querySelector('.contract-form-grid').after(attribution);
  const payload = action => {
    const values = Object.fromEntries(new FormData(form));
    const quote = quotePayload(), kg = Number(values.item_weight_kg);
    return {source:'quote_web',action,quote_number:quote.quote_number || quote.quoteNo || quote.id,service_type:values.service_type,delivery_speed:values.delivery_speed,language:'vi_VN',pickup_address:values.pickup_address,pickup_lat:values.pickup_lat,pickup_lng:values.pickup_lng,dropoff_address:values.dropoff_address,dropoff_lat:values.dropoff_lat,dropoff_lng:values.dropoff_lng,sender_name:values.sender_name,sender_phone:values.sender_phone,customer_id:state.customerId || '',recipient_name:values.recipient_name,recipient_phone:values.recipient_phone,item_quantity:Number(values.item_quantity),item_weight:`${kg} KG`,item_weight_kg:kg,item_categories:['OFFICE_ITEM'],remarks:values.remarks || `Giao hàng báo giá ${quote.quote_number || quote.quoteNo}`,schedule_at:'',confirmed:action==='place_order',confirmed_by:action==='place_order'?(BN.user?.name || 'web_quote_user'):'',confirmed_at:action==='place_order'?new Date().toISOString():'',confirmed_price:action==='place_order'?responsePrice(latestQuote):''};
  };
  const showResult = data => {
    const price = responsePrice(data), fee = price === '' ? '' : `${escape(price)} ${escape(data?.currency || 'VND')}`, meters = Number(distance(data));
    result.innerHTML = `${fee ? `<b>Cước Lalamove: ${fee}</b>` : '<b>Đã nhận phản hồi từ luồng Lalamove.</b>'}${Number.isFinite(meters) ? `<br>Khoảng cách: ${(meters / 1000).toFixed(1)} km` : ''}${responseMessage(data) ? `<br>${escape(responseMessage(data))}` : ''}`;
  };
  async function getRate() {
    if (!form.reportValidity()) return;
    if (!coordinatesReady('pickup') || !coordinatesReady('dropoff')) { result.textContent = 'Vui lòng chọn gợi ý cho cả địa chỉ lấy và địa chỉ giao để xác nhận tọa độ.'; return; }
    rateButton.disabled = true; result.textContent = 'Đang lấy cước Lalamove...';
    try { latestQuote = await BN.api('/lalamove', 'POST', payload('quote')); showResult(latestQuote); placeButton.disabled = false; placeButton.textContent = 'Xác nhận đặt xe'; }
    catch (error) { latestQuote = null; placeButton.disabled = true; result.textContent = error.message; }
    finally { rateButton.disabled = false; }
  }
  async function open() {
    const quote = quotePayload(), customer = quote.customer || {};
    let recipientName = customer.contact_name || customer.contact || customer.name || '', recipientPhone = customer.contact_phone || customer.phone || '';
    if (state.customerId) try { const data = await BN.api('/customers?q=' + encodeURIComponent(customer.customer_code || customer.name)); const saved = data.customers.find(item => item.id === state.customerId); recipientName = saved?.contact || recipientName; recipientPhone = saved?.phone || recipientPhone; } catch {}
    formRevision++;['pickup','dropoff'].forEach(kind => { clearSearch(kind); set(`${kind}_lat`, ''); set(`${kind}_lng`, ''); placeStatus(kind).textContent = 'Gõ tối thiểu 3 ký tự hoặc bấm Tìm địa chỉ, rồi chọn kết quả.'; });
    const weight = totalWeight(quote);
    set('pickup_address', ''); set('dropoff_address', customer.address || ''); set('sender_name', BN.user?.name || ''); set('sender_phone', BN.user?.phone || ''); set('recipient_name', recipientName); set('recipient_phone', recipientPhone); set('item_quantity', totalCartons(quote)); set('item_weight_kg', weight); set('service_type', vehicleTypes.find(([, ,load]) => load >= weight)?.[0] || 'TRUCK_18000'); set('remarks', `Giao hàng báo giá ${quote.quote_number || quote.quoteNo || ''}`);
    invalidateQuote(); result.textContent = ''; modal.classList.add('open');
    refreshHistory(quote, recipientPhone);
  }
  [document.getElementById('openLalamove'), document.getElementById('mobileLalamove')].filter(Boolean).forEach(button => { button.onclick = open; });
  rateButton.onclick = getRate;
  form.querySelectorAll('select,input:not([type=hidden]):not([name=pickup_address]):not([name=dropoff_address]),textarea').forEach(input => {
    input.addEventListener('change', () => invalidateQuote('Thông tin đã thay đổi. Vui lòng xem cước lại trước khi đặt xe.'));
  });
  form.onsubmit = async event => {
    event.preventDefault();
    if (!latestQuote || !coordinatesReady('pickup') || !coordinatesReady('dropoff')) return;
    if (quoteExpired(latestQuote)) { invalidateQuote('Báo giá Lalamove đã hết hạn. Vui lòng xem cước lại.'); return; }
    const quote = quotePayload(), price = responsePrice(latestQuote);
    if (!confirm(`Xác nhận đặt xe Lalamove?\n\nSố báo giá: ${quote.quote_number || ''}\nNgười nhận: ${form.elements.recipient_name.value} - ${form.elements.recipient_phone.value}\nĐiểm giao: ${form.elements.dropoff_address.value}\nCước đã xem: ${price || 'chưa xác định'} ${latestQuote.currency || 'VND'}`)) return;
    placeButton.disabled = true; result.textContent = 'Đang đặt xe Lalamove...';
    try { const placed = await BN.api('/lalamove', 'POST', payload('place_order')); showResult(placed); const id = orderId(placed), link = orderLink(placed); result.innerHTML += `<br><b>Đã đặt xe thành công${id ? ` · Mã đơn: ${escape(id)}` : ''}.</b>${link ? `<br><a href="${escape(link)}" target="_blank" rel="noopener noreferrer">Theo dõi đơn Lalamove</a>` : ''}`; placeButton.textContent = 'Đã đặt xe'; }
    catch (error) { result.textContent = error.message; placeButton.disabled = false; }
  };
})();
