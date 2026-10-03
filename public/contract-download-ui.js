(() => {
  const m = document.createElement("div");
  m.className = "modal";
  m.id = "contractDocumentModal";
  m.setAttribute("aria-hidden", "true");
  m.innerHTML = `<div class="modal-backdrop" data-contract-doc-close></div><div class="dialog"><div class="dialog-head"><div><p class="eyebrow">HỢP ĐỒNG KINH TẾ</p><h2 id="contractDocTitle">Sinh HĐKT</h2></div><button class="icon-btn" data-contract-doc-close aria-label="Đóng">×</button></div><form><div class="contract-form-grid"><label class="field-wide">Tìm báo giá<input name="quoteSearch" maxlength="200" autocomplete="off" placeholder="Nhập số báo giá hoặc tên khách hàng để lọc danh sách"></label><label class="field-wide">Số báo giá<select name="quoteId" id="contractQuoteOptions"></select><input name="quoteNo" type="hidden"><small id="contractQuoteStatus" class="search-help"></small></label><label class="field-wide">Tên khách hàng<input name="name" required maxlength="500"></label><label>Mã khách hàng<input name="customerCode" maxlength="100"></label><label>MST<input name="taxCode" maxlength="100"></label><label>Người đại diện<input name="representativeName" maxlength="500"></label><label>Chức vụ<input name="representativeTitle" maxlength="300"></label><label class="field-wide">Địa chỉ khách hàng<textarea name="address" required rows="2" maxlength="2000"></textarea></label><label>Pháp nhân<select name="legalEntity" required><option>Bách Ngân</option><option>VIGIFTS</option></select></label><label>Tài khoản thu tiền<select name="collectionAccountName" required></select></label><label class="field-wide">Địa chỉ giao hàng<textarea name="deliveryAddress" required rows="2" maxlength="2000"></textarea></label><label class="field-wide">Thời gian giao hàng<input name="deliveryTime" required maxlength="2000"></label><label>Phương thức thanh toán<input name="paymentMethod" required maxlength="1000"></label><label>Thanh toán trước (%)<input name="depositRate" type="number" min="0" max="100" step="0.01" required></label><label>Hạn thanh toán (ngày)<input name="paymentDays" type="number" min="0" step="1" required></label></div><p class="payload-note" id="contractDocNote">Dữ liệu này sẽ được lưu theo báo giá. Sau khi sinh HĐKT, nút Tải HĐKT mới hiện.</p><p role="alert"></p><div class="dialog-actions"><button type="button" class="btn ghost" data-contract-doc-close>Hủy</button><button class="btn primary" id="contractDocSubmit">Sinh HĐKT</button></div></form></div>`;
  document.body.append(m);
  const f = m.querySelector("form"),
    title = m.querySelector("#contractDocTitle"),
    note = m.querySelector("#contractDocNote"),
    submit = m.querySelector("#contractDocSubmit"),
    alertBox = m.querySelector("[role=alert]"),
    quoteStatus = m.querySelector("#contractQuoteStatus"),
    quoteOptionsList = m.querySelector("#contractQuoteOptions"),
    accounts = { VIGIFTS: ["ACB Vigifts"], "Bách Ngân": ["ACB Bách Ngân", "VCB Bách Ngân"] };
  let mode = "generate", selectedRecord = null, selectedQuoteData = null, quoteOptions = [], quoteSearchTimer = null;
  const CURRENT_QUOTE_VALUE = "__current_quote__";
  const set = (n, v) => (f.elements[n].value = v ?? ""),
    escHtml = value => String(value ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
    close = () => {
      m.classList.remove("open");
      m.setAttribute("aria-hidden", "true");
      delete m.dataset.clawDirty;
    },
    openModal = () => {
      m.classList.add("open");
      m.setAttribute("aria-hidden", "false");
    },
    cleanNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0,
    clone = value => JSON.parse(JSON.stringify(value || {})),
    lines = text => String(text || "").split(/\n/).map(x => x.replace(/^\s*-\s*/, "")),
    line = (text, key) => lines(text).find(x => x.toLowerCase().startsWith(key.toLowerCase()))?.split(":").slice(1).join(":").trim() || "",
    isCurrentSelected = () => Boolean(selectedRecord?.id && state?._record?.id && selectedRecord.id === state._record.id);

  function paymentRate(value) {
    const text = String(value || "");
    const direct = text.match(/(?:tạm ứng|đặt cọc|thanh toán trước|thanh toán lần 1|lần 1|ứng trước)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*%/i)?.[1] || text.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:trị giá|giá trị|hợp đồng|đơn hàng)?[^\n\r]{0,80}(?:tạm ứng|đặt cọc|thanh toán trước|thanh toán lần 1|lần 1|ứng trước)/i)?.[1];
    if (direct) return Number(String(direct).replace(",", "."));
    const pair = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:\/|-|–|:)\s*(\d+(?:[.,]\d+)?)\b/);
    if (pair) {
      const first = Number(pair[1].replace(",", ".")), second = Number(pair[2].replace(",", "."));
      if (first > 0 && second >= 0 && Math.abs(first + second - 100) < 0.001) return first;
    }
    return "";
  }
  function updateAccounts(selected = "") {
    const legal = f.elements.legalEntity.value || "Bách Ngân", select = f.elements.collectionAccountName, values = accounts[legal] || [];
    select.innerHTML = `<option value="">Chọn tài khoản thu tiền</option>${values.map(value => `<option value="${escHtml(value)}">${escHtml(value)}</option>`).join("")}`;
    select.value = values.includes(selected) ? selected : (values.length === 1 ? values[0] : "");
  }
  function hasDocument() {
    return Boolean(state?.contractDocument?.contractNumber);
  }
  function refreshButtons() {
    const generated = hasDocument();
    [$("#downloadContractFile"), $("#mobileDownloadContract")].filter(Boolean).forEach(button => {
      button.hidden = !generated;
      button.disabled = !generated;
      button.title = generated ? `Tải HĐKT ${state.contractDocument.contractNumber}` : "Cần bấm Sinh HĐKT trước.";
    });
    [$("#printDeliveryNote"), $("#mobilePrintDeliveryNote")].filter(Boolean).forEach(button => {
      button.hidden = !generated;
      button.disabled = !generated;
      button.title = generated ? `In phiếu giao hàng ${state.contractDocument.contractNumber}` : "Cần bấm Sinh HĐKT trước.";
    });
    [$("#createContractCrm"), $("#mobileContract")].filter(Boolean).forEach(button => {
      const label = generated ? "Sửa thông tin HĐKT" : "Sinh HĐKT";
      button.querySelector("span") ? button.querySelector("span").textContent = label : button.textContent = label;
    });
  }
  BN.refreshContractDocumentAction = refreshButtons;

  function quotePayloadFromData(data) {
    const source = clone(data), rows = Array.isArray(source.rows) ? source.rows : [];
    const { subtotal: sub, tax } = QuoteMath.totals(source), total = sub + tax;
    const after = row => QuoteMath.after(row, source), rate = row => QuoteMath.rate(row, source);
    return {
      contract_word_edits: source.contractDocument?.wordEdits || [],
      quote_number: source.quoteNo,
      quote_type: source.type,
      quote_date: source.date,
      responsible: source.owner,
      responsible_phone: source.ownerPhone || "",
      customer: {
        sapo_id: source.customerId && !source.customerId.startsWith("local_") ? source.customerId : null,
        local_id: source.customerId?.startsWith("local_") ? source.customerId : null,
        name: source.customer,
        tax_code: source.customerTaxCode || "",
        customer_code: source.customerCode || "",
        established_date: source.customerEstablishedDate || "",
        address: source.customerAddress || "",
        customer_type: source.customerType || "",
        discounts: source.customerDiscounts || {},
        contact: source.contact,
        contact_name: source.contact,
        phone: source.phone,
        contact_phone: source.phone,
        email: source.email,
      },
      items: rows.map((r, i) => {
        const cartons = r.perCarton ? Math.ceil(Number(r.qty || 0) / Number(r.perCarton || 1)) : 0, priceAfter = after(r);
        return {
          line: i + 1,
          tax_percent: rate(r),
          price_policy: r.pricePolicy || "",
          sku: r.sku,
          name: r.name,
          description: r.description || "",
          bundle_contents: r.bundleContents || "",
          print_description: r.printDescription || "",
          packaging_description: r.packagingDescription || "theo tiêu chuẩn nhà sản xuất",
          unit: r.unit,
          quantity: r.qty,
          unit_price: r.price,
          unit_price_manual: Boolean(r.manualPrice),
          discount_type: r.discountType || "percent",
          discount_percent: r.discountType === "amount" ? 0 : (Number.isFinite(Number(r.discount)) ? Number(r.discount) : 0),
          discount_amount: r.discountType === "amount" ? r.discount : r.price * r.discount / 100,
          print_fee: r.printFee,
          price_after_discount: priceAfter,
          line_total: priceAfter * r.qty,
          status: r.status || "Đợi triển khai",
          delivery_date: r.deliveryDate || "",
          cartons,
          weight_kg: cartons * Number(r.cartonWeight || 0),
          image_url: String(r.image || "").startsWith("data:") ? "[uploaded-on-device]" : (r.image || ""),
        };
      }),
      vat_percent: new Set(rows.map(row => rate(row))).size > 1 ? null : (rows.length ? rate(rows[0]) : source.vat),
      vat_amount: tax,
      subtotal: sub,
      subtotal_before_vat: sub,
      total,
      total_in_words: HrcPdf.amountInWords(total),
      notes: source.notes,
      contract_number: source.contractDocument?.contractNumber || source.contractNumber || "",
      so_hd: source.soHd || "",
      legal_entity: source.legalEntity || "",
      payment_days: source.paymentDays ?? "",
      delivery_date: source.deliveryDate || "",
      customer_tax_code: source.customerTaxCode || "",
      collection_account_name: source.collectionAccountName || "",
      payment: source.payment || "",
      deposit: source.deposit || "",
      delivery: source.delivery || "",
    };
  }
  async function profileFor(data) {
    let profile = {}, address = data.customerAddress || "";
    if (data.customerId) {
      try {
        const q = quotePayloadFromData(data);
        const list = await BN.api("/customers?q=" + encodeURIComponent(q.customer?.customer_code || q.customer?.name || data.customer || ""));
        address = list.customers.find(x => x.id === data.customerId)?.address || address;
        profile = (await BN.api("/customer-contract-profile?customer_id=" + encodeURIComponent(data.customerId))).profile || {};
      } catch {}
    }
    return { profile, address };
  }
  function setQuoteSelection(record, data) {
    selectedRecord = record || null;
    selectedQuoteData = clone(data || {});
    set("quoteNo", selectedQuoteData.quoteNo || record?.quoteNo || "");
    renderQuoteOptions();
    f.elements.quoteId.value = selectedRecord?.id || CURRENT_QUOTE_VALUE;
    quoteStatus.textContent = selectedRecord?.id ? `Đang chọn ${selectedQuoteData.quoteNo || selectedRecord.quoteNo || ""} · ${selectedQuoteData.customer || selectedRecord.customer || "Chưa nhập khách hàng"}` : "Đang dùng báo giá đang mở, sẽ lưu báo giá trước khi sinh HĐKT.";
  }
  async function loadQuoteRecord(id) {
    const record = await BN.api("/quotes/" + encodeURIComponent(id));
    setQuoteSelection({ id: record.id, revision: record.revision, canEdit: record.canEdit, approvalStatus: record.approvalStatus }, record.data);
    return record;
  }
  function optionLabel(item) {
    return [item.quoteNo, item.customer || "Chưa nhập khách hàng", item.creatorName, item.contractNumber ? `HĐKT ${item.contractNumber}` : ""].filter(Boolean).join(" · ");
  }
  function renderQuoteOptions() {
    const selectedId = selectedRecord?.id || CURRENT_QUOTE_VALUE, merged = [...quoteOptions];
    if (selectedRecord?.id && !merged.some(item => item.id === selectedRecord.id)) merged.unshift({ id: selectedRecord.id, quoteNo: selectedQuoteData?.quoteNo || selectedRecord.quoteNo || "", customer: selectedQuoteData?.customer || selectedRecord.customer || "" });
    if (!selectedRecord?.id) merged.unshift({ id: CURRENT_QUOTE_VALUE, quoteNo: selectedQuoteData?.quoteNo || "Báo giá đang mở", customer: selectedQuoteData?.customer || "Chưa lưu lên hệ thống" });
    quoteOptionsList.innerHTML = merged.length ? merged.map(item => `<option value="${escHtml(item.id)}">${escHtml(optionLabel(item))}</option>`).join("") : `<option value="">Không có báo giá phù hợp</option>`;
    quoteOptionsList.value = selectedId;
  }
  async function searchQuotes(queryText) {
    const q = String(queryText || "").trim();
    try {
      const data = await BN.api("/quotes" + (q ? "?customer=" + encodeURIComponent(q) : ""));
      quoteOptions = data.records || [];
      renderQuoteOptions();
      quoteStatus.textContent = quoteOptions.length ? `Danh sách có ${quoteOptions.length} báo giá phù hợp. Chọn một số báo giá trong danh sách.` : "Chưa tìm thấy báo giá phù hợp.";
    } catch (error) {
      quoteStatus.textContent = error.message || "Chưa tìm được báo giá.";
    }
  }
  async function chooseQuoteFromInput() {
    const id = f.elements.quoteId.value;
    if (id === CURRENT_QUOTE_VALUE) return true;
    if (!id) {
      alertBox.textContent = "Chọn số báo giá trong danh sách trước khi sinh HĐKT.";
      return false;
    }
    if (selectedRecord?.id === id) return true;
    await loadQuoteRecord(id);
    await fillFromSelected();
    return true;
  }
  function detailsFor(data, savedDetails, profile, address) {
    const q = quotePayloadFromData(data), c = q.customer || {}, quotePaymentTerms = lines(q.notes).filter(x => /(thanh toán|tạm ứng|đặt cọc|còn lại)/i.test(x)).join("\n");
    return {
      name: savedDetails.name || profile.name || c.name || "",
      customerCode: savedDetails.customerCode || profile.customerCode || c.customer_code || "",
      taxCode: savedDetails.taxCode || profile.taxCode || c.tax_code || "",
      representativeName: savedDetails.representativeName || profile.representativeName || c.representative_name || c.contact_name || c.contact || "",
      representativeTitle: savedDetails.representativeTitle || profile.representativeTitle || c.representative_title || "",
      address: savedDetails.address || profile.address || address || "",
      legalEntity: savedDetails.legalEntity || (q.quote_type === "VIGIFTS" ? "VIGIFTS" : "Bách Ngân"),
      collectionAccountName: savedDetails.collectionAccountName || profile.collectionAccountName || q.collection_account_name || "",
      deliveryAddress: savedDetails.deliveryAddress || profile.deliveryAddress || line(q.notes, "Địa điểm giao hàng") || address || "",
      deliveryTime: savedDetails.deliveryTime || profile.deliveryTime || line(q.notes, "Thời gian giao hàng") || "",
      paymentMethod: savedDetails.paymentMethod || profile.paymentMethod || line(q.notes, "Phương thức thanh toán") || "Chuyển khoản",
      depositRate: savedDetails.depositRate ?? (paymentRate(quotePaymentTerms) || profile.depositRate || ""),
      paymentDays: savedDetails.paymentDays ?? (profile.paymentDays ?? ""),
    };
  }
  async function fillFromSelected() {
    const data = selectedQuoteData || {};
    if (!["HRC", "B2B", "VIGIFTS"].includes(data.type)) { toast("Loại báo giá này chưa hỗ trợ HĐKT."); return false; }
    const saved = data.contractDocument || {}, savedDetails = saved.details || {}, { profile, address } = await profileFor(data), values = detailsFor(data, savedDetails, profile, address);
    for (const [key, value] of Object.entries(values)) if (key !== "collectionAccountName") set(key, value);
    set("legalEntity", values.legalEntity);
    updateAccounts(values.collectionAccountName);
    const has = Boolean(saved.contractNumber);
    title.textContent = mode === "download" ? "Xác nhận tải HĐKT" : (has ? "Sửa thông tin HĐKT" : "Sinh HĐKT");
    submit.textContent = mode === "download" ? "Xác nhận tải HĐKT" : (has ? "Lưu lại thông tin HĐKT" : "Sinh HĐKT");
    note.textContent = has ? `Số HĐKT đã sinh: ${saved.contractNumber}. Có thể chỉnh thông tin rồi xác nhận để lưu lại.` : "Dữ liệu này sẽ được lưu theo báo giá đã chọn. Sau khi sinh HĐKT, nút Tải HĐKT mới hiện cho báo giá đó.";
    return true;
  }
  async function fill(modeName, quoteId = "") {
    mode = modeName;
    alertBox.textContent = "";
    if (quoteId) await loadQuoteRecord(quoteId);
    else {
      if (BN.reloadCurrentQuote) {
        try { await BN.reloadCurrentQuote(); }
        catch (error) { toast(error.message || "Không tải được dữ liệu báo giá mới nhất."); return false; }
      }
      setQuoteSelection(state._record ? { ...state._record, quoteNo: state.quoteNo, customer: state.customer } : null, state);
    }
    if (mode === "download" && !selectedQuoteData?.contractDocument?.contractNumber) { toast("Vui lòng bấm Sinh HĐKT trước."); return false; }
    if (!(await fillFromSelected())) return false;
    openModal();
    quoteStatus.textContent = "Đang tải danh sách báo giá đã lưu...";
    searchQuotes("");
    setTimeout(() => f.elements.quoteSearch.focus(), 30);
    return true;
  }
  function detailsFromForm() {
    const d = Object.fromEntries(new FormData(f));
    return {
      quoteNo: d.quoteNo || "",
      name: d.name || "",
      customerCode: d.customerCode || "",
      taxCode: d.taxCode || "",
      representativeName: d.representativeName || "",
      representativeTitle: d.representativeTitle || "",
      address: d.address || "",
      legalEntity: d.legalEntity || "Bách Ngân",
      collectionAccountName: d.collectionAccountName || "",
      deliveryAddress: d.deliveryAddress || "",
      deliveryTime: d.deliveryTime || "",
      paymentMethod: d.paymentMethod || "",
      depositRate: cleanNumber(d.depositRate),
      paymentDays: Math.trunc(cleanNumber(d.paymentDays)),
    };
  }
  async function saveProfile(details) {
    if (!selectedQuoteData?.customerId) return;
    await BN.api("/customer-contract-profile", "PUT", {
      customerId: selectedQuoteData.customerId,
      representativeName: details.representativeName,
      representativeTitle: details.representativeTitle,
      deliveryAddress: details.deliveryAddress,
      deliveryTime: details.deliveryTime,
      paymentMethod: details.paymentMethod,
      depositRate: details.depositRate,
      paymentDays: details.paymentDays,
      contactName: "",
      contactPhone: "",
      taxCode: details.taxCode,
      customerCode: details.customerCode,
      address: details.address,
    });
  }
  function applyDetailsToQuote(q, details) {
    q.customer = { ...(q.customer || {}), name: details.name, tax_code: details.taxCode, customer_code: details.customerCode, address: details.address, contact_name: details.representativeName };
    q.contractDetails = { deliveryAddress: details.deliveryAddress, deliveryTime: details.deliveryTime, paymentMethod: details.paymentMethod, depositRate: details.depositRate, paymentDays: details.paymentDays };
    const keepNote = line => !/(tạm ứng|đặt cọc|thanh toán trước|thanh toán lần 1|\blần 1\b|ứng trước|còn lại)/i.test(line);
    const baseNotes = lines(q.notes).filter(keepNote).map(line => `- ${line}`).join("\n");
    q.notes = `${baseNotes}\n- Thời gian giao hàng: ${details.deliveryTime}\n- Địa điểm giao hàng: ${details.deliveryAddress}\n- Phương thức thanh toán: ${details.paymentMethod}\n- Thanh toán trước ${details.depositRate}%`;
    return q;
  }
  async function ensureSelectedSaved() {
    if (selectedRecord?.id) return selectedRecord;
    if (!(await saveToLibrary())) throw Error("Chưa lưu được báo giá để cấp số HĐKT.");
    setQuoteSelection({ ...state._record, quoteNo: state.quoteNo, customer: state.customer }, state);
    return selectedRecord;
  }
  async function persist(details, contractNumber) {
    const contractDocument = { contractNumber, quoteNo: selectedQuoteData.quoteNo, generatedAt: new Date().toISOString(), details };
    selectedQuoteData = {
      ...selectedQuoteData,
      contractDocument,
      customer: details.name || selectedQuoteData.customer || "",
      customerCode: details.customerCode || selectedQuoteData.customerCode || "",
      customerTaxCode: details.taxCode || selectedQuoteData.customerTaxCode || "",
      customerAddress: details.address || selectedQuoteData.customerAddress || "",
    };
    if (isCurrentSelected() || !selectedRecord?.id) {
      Object.assign(state, selectedQuoteData);
      saveDraft();
      if (!(await saveToLibrary())) throw Error("Chưa lưu được báo giá để ghi thông tin HĐKT.");
      selectedRecord = { ...state._record, quoteNo: state.quoteNo, customer: state.customer };
      selectedQuoteData = clone(state);
      refreshButtons();
      return;
    }
    const result = await BN.api("/quotes/" + encodeURIComponent(selectedRecord.id), "PUT", { data: selectedQuoteData, revision: selectedRecord.revision });
    selectedRecord = { ...selectedRecord, ...result, revision: result.revision };
  }
  async function downloadNow(details) {
    const q = applyDetailsToQuote(quotePayloadFromData(selectedQuoteData), details);
    await ContractDocument.download({ quote: q, contractNumber: selectedQuoteData.contractDocument.contractNumber, details });
    BN.notifyEvent?.("contract_download", { quoteNo: q.quote_number, customer: q.customer?.name || details.name, contractNumber: selectedQuoteData.contractDocument.contractNumber });
  }
  const printNumber = value => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(value) || 0);
  const printDate = value => {
    const date = value ? new Date(`${value}T00:00:00`) : new Date();
    if (Number.isNaN(date.getTime())) return "Ngày &nbsp; &nbsp; Tháng &nbsp; &nbsp; Năm 2026";
    return `Ngày ${String(date.getDate()).padStart(2, "0")} Tháng ${String(date.getMonth() + 1).padStart(2, "0")} Năm ${date.getFullYear()}`;
  };
  const printImage = value => {
    const raw = String(value || "").trim();
    if (!raw || (!/^https:\/\//i.test(raw) && !/^data:image\//i.test(raw))) return "&nbsp;";
    return `<img src="${escHtml(raw)}" alt="" style="max-width:70px; max-height:58px; object-fit:contain;" />`;
  };
  function deliveryRowsHtml(data) {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (!rows.length) {
      return `<tr><td colspan="8" style="text-align:center;padding:10px;">Chưa có sản phẩm</td></tr>`;
    }
    return rows.map((line, index) => `
 <tr style="font-family:Arial,sans-serif; font-size: 12px; vertical-align: middle;">
 <td style="text-align: center;">${index + 1}</td>
 <td style="text-align: center;">${escHtml(line.barcode || line.variantBarcode || line.sku || "")}</td>
 <td style="text-align: center;">${escHtml(line.variantCode || line.sku || "")}</td>
 <td style="text-align: left; padding-left: 5px;">${escHtml(line.name || "")}</td>
 <td style="text-align: center;">${escHtml(line.unit || "")}</td>
 <td style="text-align: center;">${printNumber(line.qty)}</td>
 <td style="text-align: center;">${printImage(line.image)}</td>
 <td style="text-align: center;">&nbsp;</td>
 </tr>`).join("");
  }
  function deliveryNoteHtml(data) {
    const details = data.contractDocument?.details || {}, contractNumber = data.contractDocument?.contractNumber || data.contractNumber || "";
    const customerName = details.name || data.customer || "", billingAddress = details.address || data.customerAddress || "";
    const recipient = details.representativeName || data.contact || "", phone = data.phone || data.ownerPhone || "";
    const orderCode = contractNumber || data.sapoOrderCode || data.quoteNo || "";
    return `<!doctype html><html><head><meta charset="utf-8"><title>Phiếu giao hàng ${escHtml(orderCode)}</title><style>
 @page { size: A4 portrait; margin: 10mm; }
 body { margin: 0; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
 img { break-inside: avoid; }
 table { border-collapse: separate; }
 .delivery-table th, .delivery-table td { border-bottom: 1px solid #7a7676; border-right: 1px solid #7a7676; padding: 6px 5px; font-family: Times New Roman, Times, serif; font-size: 13pt; }
 @media print { .print-toolbar { display: none !important; } }
</style></head><body><div class="print-toolbar" style="position:sticky;top:0;z-index:9;background:#fff;padding:8px;text-align:right;border-bottom:1px solid #ddd"><button onclick="window.print()" style="padding:8px 14px;font-weight:700">In / Lưu PDF</button></div>
<div style="width: 100%; text-align: center;"><img alt="" src="https://sf-static.upanhlaylink.com/img/image_20251204301bf3a5e0d39aa0de60d170cbd54dc5.jpg" style="width: 100%; max-width: 800px; height: auto;" /></div>
<div style="width: 100%; text-align: center; margin-top: 15px;"><span style="font-size:24px; font-family:Times New Roman,Times,serif;"><strong>BIÊN BẢN BÀN GIAO SẢN PHẨM</strong></span></div>
<div style="margin-top: 15px; font-family:Times New Roman,Times,serif; font-size:13pt; line-height: 150%;">
<p style="margin: 0 0 5px 0;"><u><strong>BÊN GIAO SẢN PHẨM:</strong></u></p>
<p style="margin: 0 0 3px 15px;"><strong>CÔNG TY TNHH SẢN XUẤT THƯƠNG MẠI BÁCH NGÂN</strong></p>
<p style="margin: 0 0 3px 15px;"><strong>Địa chỉ:</strong> 102B đường 3 Tháng 2, Phường Tân An, TP. Cần Thơ</p>
<p style="margin: 0 0 3px 15px;"><strong>Điện thoại:</strong> 0907 168 234</p>
<p style="margin: 0 0 10px 15px;"><strong>Đại diện:</strong> Huỳnh Châu Yến &nbsp;&nbsp;&nbsp; <strong>Chức vụ:</strong> Phụ trách kinh doanh</p>
<p style="margin: 0 0 5px 0;"><u><strong>BÊN NHẬN SẢN PHẨM:</strong></u></p>
<p style="margin: 0 0 3px 15px;"><strong style="font-size:18px;">${escHtml(customerName)}</strong></p>
<p style="margin: 0 0 3px 15px;"><strong>Đ/C:</strong> ${escHtml(billingAddress)}</p>
<p style="margin: 0 0 3px 15px;"><strong>Người nhận:</strong> ${escHtml(recipient)} &nbsp;&nbsp;&nbsp; <strong>ĐT:</strong> ${escHtml(phone)}</p>
<p style="margin: 0 0 10px 15px;"><strong style="font-size:18px;">Số PO:</strong> <span style="font-size:18px;">${escHtml(orderCode)}</span></p>
</div>
<table class="delivery-table" cellpadding="0" cellspacing="0" style="width: 100%; border-left: 1px solid #7a7676; border-top: 1px solid #7a7676; margin-top: 8px;">
 <thead>
 <tr style="font-family:Arial,sans-serif; font-size: 12px; font-weight: 600; text-align: center;">
 <td style="width: 6%;">STT</td>
 <td style="width: 12%;">MÃ VINXD</td>
 <td style="width: 12%;">MÃ NCC</td>
 <td style="width: 29%;">Tên sản phẩm</td>
 <td style="width: 8%;">ĐVT</td>
 <td style="width: 8%;">Số lượng</td>
 <td style="width: 13%;">Hình ảnh</td>
 <td style="width: 12%;">Ghi chú</td>
 </tr>
 </thead>
 <tbody>${deliveryRowsHtml(data)}</tbody>
</table>
<div style="width:100%; margin-top: 10px; font-family:Times New Roman,Times,serif; font-size:14px;"><p style="margin: 0;"><strong>Ghi chú:</strong><br />- Phiếu bàn giao sản phẩm này cũng chính là biên bản nghiệm thu sản phẩm và được kết thúc ngay sau khi hai bên ký giao - nhận đầy đủ sản phẩm.</p></div>
<footer style="page-break-after: always; margin-top: 15px;"><table style="width: 100%; border: none; font-family:Times New Roman,Times,serif;"><tbody>
 <tr><td colspan="2" style="text-align: right; padding-right: 40px; font-style: italic; font-size: 14px;">${printDate(data.date)}</td></tr>
 <tr><td style="width: 50%; text-align: center; font-weight: bold; font-size: 14px;">ĐẠI DIỆN BÊN NHẬN<br /><span style="font-weight: normal; font-style: italic; font-size: 12px;">(Ký, ghi rõ họ tên)</span></td><td style="width: 50%; text-align: center; font-weight: bold; font-size: 14px;">ĐẠI DIỆN BÊN GIAO<br /><span style="font-weight: normal; font-style: italic; font-size: 12px;">(Ký, ghi rõ họ tên)</span></td></tr>
 <tr><td style="height: 60px;" colspan="2"></td></tr>
</tbody></table></footer><script>window.addEventListener("load",()=>setTimeout(()=>{window.focus();window.print();},250));</script></body></html>`;
  }
  function openDeliveryPrint(data, popup = null) {
    const target = popup || window.open("", "_blank", "width=1100,height=800");
    if (!target) { toast("Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép popup rồi thử lại."); return; }
    if (!data?.contractDocument?.contractNumber) { target.close(); toast("Vui lòng bấm Sinh HĐKT trước."); return; }
    target.document.open();
    target.document.write(deliveryNoteHtml(data));
    target.document.close();
    BN.notifyEvent?.("delivery_note_print", { quoteNo: data.quoteNo, customer: data.customer || "", contractNumber: data.contractDocument.contractNumber });
  }
  async function printDeliveryNote(quoteId = "") {
    const popup = window.open("", "_blank", "width=1100,height=800");
    if (!popup) { toast("Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép popup rồi thử lại."); return; }
    popup.document.write('<!doctype html><title>Đang chuẩn bị phiếu giao hàng</title><p style="font:16px Arial;padding:24px">Đang chuẩn bị phiếu giao hàng...</p>');
    try {
      if (quoteId) {
        const record = await BN.api("/quotes/" + encodeURIComponent(quoteId));
        openDeliveryPrint(record.data, popup);
        return;
      }
      if (BN.reloadCurrentQuote) await BN.reloadCurrentQuote();
      openDeliveryPrint(state, popup);
    } catch (error) {
      popup.close();
      toast(error.message || "Chưa in được phiếu giao hàng.");
    }
  }
  async function askCopyToSapo(details) {
    if (!BN.openSapoCopyPayload) return;
    if (!confirm("Đã sinh HĐKT. Có copy báo giá này vào Sapo không?")) return;
    const q = applyDetailsToQuote(quotePayloadFromData(selectedQuoteData), details);
    try {
      await BN.openSapoCopyPayload(q, { recordId: selectedRecord?.id || "", updatePageLink: isCurrentSelected() });
    } catch (error) {
      toast(error.message || "Chưa mở được popup copy Sapo.");
    }
  }
  async function submitForm(event) {
    event.preventDefault();
    if (f.dataset.busy) return;
    f.dataset.busy = "1";
    const original = submit.textContent;
    submit.disabled = true;
    alertBox.textContent = "";
    try {
      if (!(await chooseQuoteFromInput())) return;
      const details = detailsFromForm();
      await saveProfile(details);
      await ensureSelectedSaved();
      const hadContract = Boolean(selectedQuoteData.contractDocument?.contractNumber);
      let contractNumber = selectedQuoteData.contractDocument?.contractNumber;
      if (!contractNumber) {
        submit.textContent = "Đang cấp số HĐKT…";
        const numbered = await BN.api("/contract/document-number", "POST", { quote_id: selectedRecord.id, customer_code: details.customerCode, tax_code: details.taxCode });
        contractNumber = numbered.contractNumber;
      }
      submit.textContent = mode === "download" ? "Đang tạo file…" : "Đang lưu HĐKT…";
      await persist(details, contractNumber);
      if (mode === "download") await downloadNow(details);
      close();
      toast(mode === "download" ? "Đã tải file HĐKT." : "Đã sinh HĐKT. Nút Tải HĐKT đã hiện.");
      if (mode !== "download" && !hadContract) await askCopyToSapo(details);
    } catch (error) {
      alertBox.textContent = error.message || "Chưa xử lý được HĐKT.";
    } finally {
      delete f.dataset.busy;
      submit.disabled = false;
      submit.textContent = original;
      refreshButtons();
    }
  }
  m.querySelectorAll("[data-contract-doc-close]").forEach(button => (button.onclick = close));
  f.elements.legalEntity.addEventListener("change", () => updateAccounts(f.elements.collectionAccountName.value));
  f.elements.quoteSearch.addEventListener("input", () => {
    clearTimeout(quoteSearchTimer);
    quoteSearchTimer = setTimeout(() => searchQuotes(f.elements.quoteSearch.value), 250);
  });
  f.elements.quoteId.addEventListener("change", () => chooseQuoteFromInput().catch(error => { alertBox.textContent = error.message; }));
  f.addEventListener("submit", submitForm);
  [$("#createContractCrm"), $("#mobileContract")].filter(Boolean).forEach(button => (button.onclick = () => fill("generate")));
  [$("#downloadContractFile"), $("#mobileDownloadContract")].filter(Boolean).forEach(button => (button.onclick = () => hasDocument() ? fill("download") : toast("Vui lòng bấm Sinh HĐKT trước.")));
  [$("#printDeliveryNote"), $("#mobilePrintDeliveryNote")].filter(Boolean).forEach(button => (button.onclick = () => hasDocument() ? printDeliveryNote() : toast("Vui lòng bấm Sinh HĐKT trước.")));
  BN.openContractDocumentForQuoteId = (id, download = true) => fill(download ? "download" : "generate", id);
  BN.printDeliveryNoteForQuoteId = id => printDeliveryNote(id);
  refreshButtons();
})();
