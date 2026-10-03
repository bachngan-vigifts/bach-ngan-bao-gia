/* Builds the Bách Ngân contract paperwork as separate editable DOCX files. */
globalThis.ContractDocument = (() => {
  const {unzipSync, zipSync, strFromU8, strToU8} = globalThis.fflate || {};
  const bachNganTemplates = [
    {path: '/mau-hop-dong-bach-ngan-hdkt.docx?v=bach-ngan-template-20260922-handover', name: 'HOP_DONG_KINH_TE', file: 'HDKT'},
    {path: '/mau-hop-dong-bach-ngan-bien-ban.docx?v=bach-ngan-template-20260922-handover', name: 'BIEN_BAN_BAN_GIAO_VA_NGHIEM_THU_SAN_PHAM', file: 'BBNT'},
    {path: '/mau-hop-dong-bach-ngan-tam-ung.docx?v=bach-ngan-template-20260922-handover', name: 'DE_NGHI_TAM_UNG', file: 'TAM_UNG'}
  ];
  const vigiftsTemplates = [
    {path: '/mau-hop-dong-vigifts-hdkt.docx', name: 'HOP_DONG_KINH_TE_VIGIFTS', file: 'HDKT'},
    {path: '/mau-hop-dong-vigifts-bien-ban.docx', name: 'BIEN_BAN_BAN_GIAO_VA_NGHIEM_THU_SAN_PHAM_VIGIFTS', file: 'BBNT'},
    {path: '/mau-hop-dong-vigifts-tam-ung.docx', name: 'DE_NGHI_TAM_UNG_VIGIFTS', file: 'TAM_UNG'}
  ];
  const templatesFor = quote => quote.quote_type === 'VIGIFTS'
    ? vigiftsTemplates
    : bachNganTemplates.map(t=>t.file==='HDKT'?{...t,path:quote.quote_type==='HRC'?'/mau-hop-dong-hrc-hdkt.docx':'/mau-hop-dong-b2b-hdkt.docx'}:t);
  const money = value => new Intl.NumberFormat('vi-VN', {maximumFractionDigits: 0}).format(Math.round(Number(value) || 0));
  const unitMoney = value => new Intl.NumberFormat('vi-VN', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number(value) || 0);
  const clean = value => String(value ?? '').replace(/^\s*[-–]\s*/, '').trim();
  const upper = value => String(value || '').toLocaleUpperCase('vi-VN');
  const xml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[char]));
  const xmlText = value => String(value ?? '').split(/\r?\n/).map(xml).join('</w:t><w:br/><w:t>');
  const token = key => `&lt;&lt;${key}&gt;&gt;`;
  const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const xmlGap = '(?:\\s|<[^>]+>)*';
  const tokenPattern = key => {
    const body = Array.from(String(key)).map(char => /\s/.test(char) ? xmlGap : `${escapeRegExp(char)}${xmlGap}`).join('');
    return new RegExp(`&lt;${xmlGap}&lt;${xmlGap}${body}&gt;${xmlGap}&gt;`, 'g');
  };
  const replaceToken = (source, key, value) => source.replaceAll(token(key), xmlText(value)).replace(tokenPattern(key), xmlText(value));
  const replaceTokens = (source, values) => Object.entries(values).reduce((result, [key, value]) => replaceToken(result, key, value), source);
  const removeLeftoverTokens = source => source.replace(new RegExp(`&lt;${xmlGap}&lt;${xmlGap}[\\s\\S]{0,240}?&gt;${xmlGap}&gt;`, 'g'), '');
  const dateParts = value => {
    const date = value ? new Date(`${value}T00:00:00`) : new Date();
    if (Number.isNaN(date.getTime())) return {day: '', month: '', year: ''};
    return {day: String(date.getDate()).padStart(2, '0'), month: String(date.getMonth() + 1).padStart(2, '0'), year: String(date.getFullYear())};
  };
  const amountInWords = value => globalThis.HrcPdf?.amountInWords ? globalThis.HrcPdf.amountInWords(Math.round(Number(value) || 0)) : 'Không đồng';
  const noteLines = notes => String(notes || '').split(/\r?\n/).map(clean).filter(Boolean);
  const paymentRate = value => {
    const text = String(value || '');
    const direct = text.match(/(?:tạm ứng|đặt cọc|thanh toán trước|thanh toán lần 1|lần 1|ứng trước)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*%/i)?.[1]
      || text.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:trị giá|giá trị|hợp đồng|đơn hàng)?[^\n\r]{0,80}(?:tạm ứng|đặt cọc|thanh toán trước|thanh toán lần 1|lần 1|ứng trước)/i)?.[1];
    if (direct) return Number(String(direct).replace(',', '.'));
    const pair = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:\/|-|–|:)\s*(\d+(?:[.,]\d+)?)\b/);
    if (pair) {
      const first = Number(pair[1].replace(',', '.')), second = Number(pair[2].replace(',', '.'));
      if (first > 0 && second >= 0 && Math.abs(first + second - 100) < 0.001) return first;
    }
    return NaN;
  };
  const noteValue = (lines, label) => {
    const line = lines.find(item => item.toLocaleLowerCase('vi-VN').startsWith(label.toLocaleLowerCase('vi-VN')));
    return line ? line.slice(line.indexOf(':') + 1).trim() : '';
  };
  const safeFilePart = value => String(value || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/, '').slice(0, 120) || 'Khach-hang';
  const asciiFilePart = value => safeFilePart(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9._ -]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'HDKT';
  const archiveName = (quote, contractNumber) => {
    const fallback = quote.quote_number || quote.quoteNo || quote.customer?.customer_code || quote.customer?.name || 'HDKT';
    return `HDKT_${asciiFilePart(contractNumber || fallback)}`;
  };
  const paymentDetails = (quote, details = {}) => {
    const lines = noteLines(quote.notes);
    const paymentLines = lines.filter(line => /(thanh toán|tạm ứng|đặt cọc|còn lại)/i.test(line));
    const noteRate = paymentRate(paymentLines.join(' '));
    const detailRate = Number(details.depositRate);
    const useContractDetailsFirst = ['B2B', 'HRC'].includes(quote.quote_type);
    const depositRate = (useContractDetailsFirst ? [detailRate, noteRate] : [noteRate, detailRate]).find(Number.isFinite);
    if (!(depositRate >= 0 && depositRate <= 100)) throw new Error('Cần nhập tỷ lệ thanh toán trước từ 0 đến 100%.');
    const total = Number(quote.total) || 0;
    const deposit = Math.round(total * depositRate / 100);
    const remaining = total - deposit;
    return {depositRate, deposit, remaining, paymentText: paymentLines.join('\n') || 'Theo thỏa thuận của hai bên.', deadline: Number(details.paymentDays) > 0 ? `trong ${details.paymentDays} ngày` : (paymentLines.find(line => /(thời hạn|trong vòng|ngày)/i.test(line)) || '')};
  };
  const paymentClause = payment => {
    const deadline = payment.deadline ? `, chậm nhất ${payment.deadline}` : '';
    if (payment.depositRate === 100) return `Thanh toán trước 100% giá trị hợp đồng trước khi giao hàng${deadline}.`;
    if (payment.depositRate === 0) return `Thanh toán 100% giá trị hợp đồng sau khi giao hàng và nhận đủ chứng từ thanh toán${deadline}.`;
    return `Bên A thanh toán cho Bên B ${money(payment.depositRate)}% giá trị của hợp đồng tương ứng với số tiền là ${money(payment.deposit)} đồng (Bằng chữ: ${amountInWords(payment.deposit)}) ngay sau khi ký hợp đồng. Thanh toán ${money(100 - payment.depositRate)}% giá trị còn lại tương ứng ${money(payment.remaining)} đồng (Bằng chữ: ${amountInWords(payment.remaining)}) ngay sau khi nhận hàng${deadline}.`;
  };
  const withoutRepeatedName = item => {
    const description = String(item.description || '').trim();
    const name = String(item.name || '').trim();
    if (!description) return '';
    if (!name) return description;
    const normalizedDescription = description.replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
    const normalizedName = name.replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
    if (normalizedDescription === normalizedName) return '';
    return normalizedDescription.startsWith(normalizedName)
      ? description.slice(name.length).replace(/^\s*[-–:|,;.]\s*/, '').trim()
      : description;
  };
  const productDescription = item => [withoutRepeatedName(item), item.bundle_contents ? `Bộ gồm: ${item.bundle_contents}` : '', item.print_description ? `In ấn: ${item.print_description}` : '', item.packaging_description ? `Đóng gói: ${item.packaging_description}` : ''].filter(Boolean).join('\n');
  const packing = item => {
    if (item.packaging_description) return item.packaging_description;
    const parts = [];
    if (Number(item.cartons) > 0 && Number(item.quantity) > 0) parts.push(`${money(Number(item.quantity) / Number(item.cartons))} ${item.unit || 'cái'}/thùng`);
    if (Number(item.weight_kg) > 0 && Number(item.cartons) > 0) parts.push(`nặng ${money(Number(item.weight_kg) / Number(item.cartons))} kg/thùng`);
    return parts.join('; ');
  };
  const contractUnitPrice = item => {
    const quoted = Number(item.price_after_discount);
    if (Number.isFinite(quoted) && quoted >= 0) return quoted;
    const quantity = Number(item.quantity), total = Number(item.line_total);
    if (Number.isFinite(quantity) && quantity > 0 && Number.isFinite(total)) return total / quantity;
    const price = Number(item.unit_price);
    return Number.isFinite(price) ? price : 0;
  };
  const itemValues = (item, index) => ({'Start: [Related Chi tiết đơn hàngs]': '', End: '', '[STT]': index + 1, '[Sản phẩm].[Tên sản phẩm]': item.name || '', '[Mô tả sản phẩm]': productDescription(item), '[Số lượng]': money(item.quantity), '[đơn giá bán]': unitMoney(contractUnitPrice(item)), '[Đơn giá bán]': unitMoney(contractUnitPrice(item)), '[Thành tiền (-VAT)]': money(item.line_total), '[Thành tiền (+VAT)]': money(Number(item.line_total) * (1 + (Number(item.tax_percent) || 0) / 100)), '[Đóng gói]': packing(item)});
  const expandItems = (source, items) => source.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, row => row.includes('Related Chi tiết đơn hàngs') ? items.map((item, index) => replaceTokens(row, itemValues(item, index))).join('') : row);
  const buildXml = (source, quote, contractNumber) => {
    const lines = noteLines(quote.notes), payment = paymentDetails(quote, quote.contractDetails), date = dateParts(quote.quote_date);
    const deliveryTime = quote.contractDetails?.deliveryTime || noteValue(lines, 'Thời gian giao hàng') || noteValue(lines, 'Giao hàng') || 'Theo thỏa thuận của hai bên.';
    const deliveryPlace = quote.contractDetails?.deliveryAddress || noteValue(lines, 'Địa điểm giao hàng') || 'Theo thỏa thuận của hai bên.';
    const paymentMethod = quote.contractDetails?.paymentMethod || noteValue(lines, 'Phương thức thanh toán') || 'Chuyển khoản.';
    const customer = quote.customer || {};
    const paymentText = paymentClause(payment);
    const partyAName = customer.contact_name || customer.contact || '';
    const values = {'[Số HĐ]': contractNumber, '[dấu thời gian]': `${date.day}/${date.month}/${date.year}`, '[Ngày ký]': `${date.day}/${date.month}/${date.year}`, '[KH_NDP].[TênKH]': customer.name || '', '[KH_NDP].[dia chi]': customer.address || '', '[KH_NDP].[Dia Chi]': customer.address || '', '[KH_NDP].[Ma So Thue]': customer.tax_code || '', '[Bên A]': partyAName, '[Bên A ký tên]': upper(partyAName), '[Chức vụ]': quote.contractTitle || '', '[Thời gian giao hàng]': deliveryTime, '[Địa điểm giao hàng]': deliveryPlace, '[Phương thức thanh toán]': paymentMethod, '[Thời hạn thanh toán]': paymentText, '[hình thức thanh toán]': paymentText, '[Tỉ lệ cọc]': money(payment.depositRate), '[số tiền tạm ứng]': money(payment.deposit), '[bằng chữ tạm ứng]': amountInWords(payment.deposit), '[Thành Tiền (-Thuế)]': money(quote.subtotal), '[Tiền thuế]': money(quote.vat_amount), '[Thành tiền (+thuế)]': money(quote.total), '[Số tiền bằng chữ]': amountInWords(quote.total)};
    let result = replaceTokens(expandItems(source, quote.items || []), values);
    result = result.replace('Hôm nay, ngày      tháng      năm 2025, chúng tôi gồm:', `Hôm nay, ngày ${date.day} tháng ${date.month} năm ${date.year}, chúng tôi gồm:`);
    result = result.replace('TP Cần Thơ, ngày 04 tháng 06 năm 2025', `TP Cần Thơ, ngày ${date.day} tháng ${date.month} năm ${date.year}`);
    result = result.replace('ký ngày  07  tháng 05  năm 2025', `ký ngày ${date.day} tháng ${date.month} năm ${date.year}`);
    result = result.replace('5.2   Địa điểm giao hàng: Theo thoả thuận của từng khách hàng (bắt buộc sửa lại).', `5.2   Địa điểm giao hàng: ${deliveryPlace}`);
    result = result.replace('Phương thức thanh toán: Chuyển khoản.', xml(`Phương thức thanh toán: ${paymentMethod}`));
    return removeLeftoverTokens(result);
  };
  const templateMark = (quote, documentType = 'HDKT') => `${quote.quote_type === 'VIGIFTS' ? 'VG' : 'BN'}-${documentType}-20261002`;
  function addWebSourceFooter(files, quote, documentType) {
    const mark = templateMark(quote, documentType);
    const paragraph = `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="B8B8B8"/><w:sz w:val="16"/></w:rPr><w:t>${xml(mark)}</w:t></w:r></w:p>`;
    const existingFooters = Object.keys(files).filter(path => /^word\/footer[^/]*\.xml$/.test(path));
    for (const path of existingFooters) files[path] = strToU8(strFromU8(files[path]).replace('</w:ftr>', `${paragraph}</w:ftr>`));
    const path = 'word/footerWebSource.xml';
    files[path] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paragraph}</w:ftr>`);
    const relPath = 'word/_rels/document.xml.rels';
    let relationships = files[relPath] ? strFromU8(files[relPath]) : '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    let id = 'rIdWebSource';
    while (relationships.includes(`Id="${id}"`)) id += '1';
    relationships = relationships.replace('</Relationships>', `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footerWebSource.xml"/></Relationships>`);
    files[relPath] = strToU8(relationships);
    let documentXml = strFromU8(files['word/document.xml']);
    documentXml = documentXml.replace(/<w:sectPr\b([^>]*)>([\s\S]*?)<\/w:sectPr>/g, (section, attrs, content) => {
      const references = ['default', 'first', 'even'].filter(type => !new RegExp(`<w:footerReference[^>]*w:type="${type}"`).test(content)).map(type => `<w:footerReference w:type="${type}" r:id="${id}"/>`).join('');
      content = content.replace(/^((?:<w:headerReference\b[^>]*\/>)*)([\s\S]*)$/, (_, headers, rest) => headers + references + rest);
      content = content.replace(/w:footer="[^"]*"/, 'w:footer="360"');
      return `<w:sectPr${attrs}>${content}</w:sectPr>`;
    });
    files['word/document.xml'] = strToU8(documentXml);
    const types = strFromU8(files['[Content_Types].xml']);
    files['[Content_Types].xml'] = strToU8(types.replace('</Types>', '<Override PartName="/word/footerWebSource.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'));
  }
  async function build({quote, contractNumber, templateBytes, details, documentType = 'HDKT'}) {
    if (!unzipSync) throw new Error('Chưa tải được bộ tạo file HĐKT. Vui lòng tải lại trang.');
    if (!['HRC', 'B2B', 'VIGIFTS'].includes(quote.quote_type)) throw new Error('Loại báo giá không hỗ trợ tải HĐKT.');
    if (!contractNumber) throw new Error('Thiếu số HĐKT.');
    const files = unzipSync(new Uint8Array(templateBytes)), path = 'word/document.xml';
    if (!files[path]) throw new Error('Mẫu HĐKT không hợp lệ.');
    const filledQuote = {...quote,...(documentType==='HDKT'&&details?.signedDate?{quote_date:details.signedDate}:{}), contractDetails: details || {}, customer: {...(quote.customer || {}), contact_name: details?.representativeName || quote.customer?.contact_name || quote.customer?.contact || ''}, contractTitle: details?.representativeTitle || ''};
    files[path] = strToU8(buildXml(strFromU8(files[path]), filledQuote, contractNumber));
    addWebSourceFooter(files, quote, documentType);
    const output=zipSync(files, {level: 6});
    const edits=documentType==='HDKT'?quote.contract_word_edits:quote.contract_document_edits?.[documentType];
    if(edits?.length){if(!globalThis.ContractWordEdit)throw new Error('Chưa tải công cụ chỉnh Word.');return globalThis.ContractWordEdit.apply(output,edits);}
    return output;
  }
  async function buildPack({quote, contractNumber, details, templateFiles}) {
    const folder = archiveName(quote, contractNumber), files = {};
    for (const template of templateFiles) files[`${template.file || template.name}.docx`] = await build({quote, contractNumber, details, templateBytes: template.templateBytes, documentType: template.file || (template.name.includes('BIEN_BAN') ? 'BBNT' : template.name.includes('TAM_UNG') ? 'TAM_UNG' : 'HDKT')});
    return {bytes: zipSync(files, {level: 6}), folder};
  }
  async function download({quote, contractNumber, details}) {
    const templateFiles = await Promise.all(templatesFor(quote).map(async template => {
      const response = await fetch(template.path, {cache: 'no-store'});
      if (!response.ok) throw new Error('Không tải được mẫu biểu HĐKT.');
      return {...template, templateBytes: await response.arrayBuffer()};
    }));
    const archive = await buildPack({quote, contractNumber, details, templateFiles});
    const blob = new Blob([archive.bytes], {type: 'application/zip'}), link = document.createElement('a');
    await (await import('/r2-export.js')).saveExport(blob,`${archive.folder}.zip`);
    link.href = URL.createObjectURL(blob); link.download = `${archive.folder}.zip`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  return {build, buildPack, download, paymentDetails, contractUnitPrice, templatesFor};
})();
