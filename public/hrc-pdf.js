/* HRC quotation layout, shared by the browser export and PDF verification. */
globalThis.HrcPdf = (() => {
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  function amountInWords(value) {
    const number = Math.round(Number(value));
    if (!Number.isSafeInteger(number) || number < 0) throw new Error('Tổng thanh toán không hợp lệ.');
    if (!number) return 'Không đồng';
    function triple(n, full) {
      const h = Math.floor(n / 100), t = Math.floor(n / 10) % 10, u = n % 10, words = [];
      if (h || full) words.push(digits[h], 'trăm');
      if (t > 1) words.push(digits[t], 'mươi');
      else if (t === 1) words.push('mười');
      else if (u && (h || full)) words.push('lẻ');
      if (u) words.push(u === 1 && t > 1 ? 'mốt' : u === 5 && t > 0 ? 'lăm' : digits[u]);
      return words.join(' ');
    }
    const groups = []; let remaining = number;
    while (remaining) { groups.push(remaining % 1000); remaining = Math.floor(remaining / 1000); }
    const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
    const words = [];
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i]) words.push(triple(groups[i], i < groups.length - 1 && groups[i] < 100), units[i]);
    }
    const result = words.filter(Boolean).join(' ') + ' đồng';
    return result[0].toUpperCase() + result.slice(1);
  }
  const font = (size = 21, bold = false, italic = false) => `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px "Times New Roman"`;
  function lines(c, text, width) {
    const result = [];
    for (const paragraph of String(text ?? '').split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (c.measureText(line ? line + ' ' + word : word).width <= width) { line = line ? line + ' ' + word : word; continue; }
        if (line) result.push(line);
        line = '';
        for (const char of word) {
          if (line && c.measureText(line + char).width > width) { result.push(line); line = ''; }
          line += char;
        }
      }
      result.push(line);
    }
    return result;
  }
  function createPages({ state, images, banner, createCanvas, width = 1240, height = 1754 }) {
    if (!banner) throw new Error('Chưa tải được ảnh tiêu đề HRC. Anh tải lại trang rồi xuất PDF.');
    // A4: top 15 mm; left, right and bottom 10 mm. All drawing uses this printable area.
    const leftMargin = width * 10 / 210, topMargin = height * 15 / 297, bottomMargin = height * 10 / 297;
    const W = width - 2 * leftMargin, H = height - topMargin - bottomMargin;
    const M = 1, right = W - M, bottom = H - 30, pages = [];
    const isVigifts = state.type === 'VIGIFTS';
    const isB2b = state.type === 'B2B' || isVigifts;
    const showB2bDiscountColumn = state.type === 'B2B' && state.hideB2bDiscountColumn !== true;
    const hideHrcDiscountColumn = state.type === 'HRC' && state.hideHrcDiscountColumn === true;
    const baseWidths = isB2b ? (showB2bDiscountColumn ? [35,246,45,55,164,95,58,78,105,119] : [35,270,45,55,185,105,75,105,120]) : hideHrcDiscountColumn ? [36,118,304,54,68,112,112,132] : [36,118,268,54,68,100,56,100,128];
    const widths = baseWidths.map(n => n * (W - 2 * M) / baseWidths.reduce((a,b)=>a+b,0));
    const headers = hideHrcDiscountColumn
      ? ['STT', 'HÌNH ẢNH', 'SẢN PHẨM /\nMÃ HÀNG', 'ĐVT', 'SỐ\nLƯỢNG', 'ĐƠN GIÁ', 'ĐƠN GIÁ\nCK', 'THÀNH TIỀN']
      : ['STT', 'HÌNH ẢNH', 'SẢN PHẨM /\nMÃ HÀNG', 'ĐVT', 'SỐ\nLƯỢNG', 'ĐƠN GIÁ', 'CK', 'ĐƠN GIÁ\nCK', 'THÀNH TIỀN'];
    const amount = n => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(n);
    const unitAmount = n => new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
    const after = r => QuoteMath.after(r,state);
    const {subtotal,tax,total,label:taxLabel}=QuoteMath.totals(state);
    const words = amountInWords(total);
    let canvas, c, y;
    function text(value, x, baseline, options = {}) {
      c.font = font(options.size, options.bold, options.italic); c.fillStyle = options.color || '#000';
      c.textAlign = options.align || 'left'; c.textBaseline = 'alphabetic'; c.fillText(String(value ?? ''), x, baseline);
    }
    function block(value, options = {}) {
      const size = options.size || 21, lineHeight = options.lineHeight || 28, x = options.x ?? M + 24, w = options.width || right - x;
      c.font = font(size, options.bold, options.italic);
      for (const line of lines(c, value, w)) {
        if (y + lineHeight > bottom) newPage(true);
        text(line, x, y + size, options); y += lineHeight;
      }
    }
    function fitImage(img, x, top, w, h) {
      if (!img) return;
      const scale = Math.min(w / img.width, h / img.height);
      c.drawImage(img, x + (w - img.width * scale) / 2, top + (h - img.height * scale) / 2, img.width * scale, img.height * scale);
    }
    function cell(value, x, top, w, h, options = {}) {
      c.fillStyle = isVigifts&&options.fill?'#d9d9d9':options.fill || '#fff'; c.fillRect(x, top, w, h);
      c.strokeStyle = '#000'; c.lineWidth = 1.5; c.strokeRect(x, top, w, h);
      let size = options.size || 20; c.font = font(size, options.bold);
      if(options.align==='right'){while(size>10&&c.measureText(String(value)).width>w-12){size--;c.font=font(size,options.bold);}}
      const wrapped = lines(c, value, w - 12), lh = size + 3;
      wrapped.forEach((line, i) => text(line, options.align === 'right' ? x + w - 6 : options.align==='left'?x+6:x + w / 2,
        top + h / 2 - (wrapped.length - 1) * lh / 2 + size * .34 + i * lh,
        { ...options, size, align: options.align || 'center' }));
    }
    function newPage(continued = false) {
      canvas = createCanvas(width, height); c = canvas.getContext('2d'); pages.push(canvas);
      c.fillStyle = '#fff'; c.fillRect(0, 0, width, height);
      c.translate(leftMargin, topMargin);
      // Continuation pages start at the top printable margin, without a repeated
      // letterhead, quotation title, customer summary, or continuation caption.
      if(continued){y=0;return;}
      if(isVigifts){
        c.drawImage(banner,M+35,0,W-70,(W-70)*banner.height/banner.width);
        text('BẢNG CHÀO GIÁ',W/2,174,{size:30,bold:true,align:'center'});
        text(`Ngày ${(state.date||'').split('-').reverse().join('/')}`,W/2,199,{size:20,align:'center'});
        y=216;
        customerSummary();
        block(`Kính gửi: ${state.customer||'Quý khách hàng'};`,{x:M,bold:true,size:20,lineHeight:26});
        block('Rất cám ơn sự quan tâm của Quý khách đến sản phẩm của Công ty chúng tôi.',{x:M,size:18,lineHeight:24});
        block('Theo yêu cầu của Quý khách, chúng tôi xin gửi bảng chào giá các sản phẩm theo chi tiết như sau:',{x:M,size:18,lineHeight:24});
        return;
      }
      const bannerWidth = W - 2 * M - 120;
      c.drawImage(banner, M + 60, 0, bannerWidth, bannerWidth * banner.height / banner.width);
      text(isB2b ? 'BẢNG CHÀO GIÁ' : 'BẢNG BÁO GIÁ', W / 2, 216, { size: 35, bold: true, align: 'center' });
      y = 240;
      customerSummary();
      if(isB2b)y += 8;
      block(`Kính gửi: ${state.customer || 'Quý khách hàng'};`, { x: M, bold: true, size: 23, lineHeight: 29 });
      block('Rất cảm ơn sự quan tâm của Quý khách đến sản phẩm của Công ty chúng tôi.', { x: M, size: 23, lineHeight: 31 });
      block('Theo yêu cầu của Quý khách, chúng tôi xin gửi bảng chào giá các sản phẩm sứ theo chi tiết như sau:', { x: M, size: 22, lineHeight: 30 }); y += 8;
    }
    function customerSummary(){
      const staffShift=width*20/210;
      const leftX=M+10,split=W*.70-staffShift,gap=26;
      const customer=[`Số BG: ${state.quoteNo||''}`,`Tên khách hàng: ${state.customer||''}`,`Người liên hệ: ${state.contact||''}${state.phone?' · '+state.phone:''}`];
      if(isB2b&&state.email)customer.push(`Email: ${state.email}`);
      const staff=[`Ngày: ${(state.date||'').split('-').reverse().join('/')}`,`Phụ trách: ${state.owner||''}`,`SĐT: ${state.ownerPhone||''}`];
      const start=y;
      function column(values,x,w,align){let yy=start;c.font=font(21,true);for(const value of values){const wrapped=lines(c,value,w);wrapped.forEach(v=>{text(v,x,yy+21,{bold:true,size:21,align});yy+=27;});}return yy;}
      const customerEnd=column(customer,leftX,split-leftX-gap,'left');
      const staffEnd=column(staff,right-staffShift,right-staffShift-split,'right');
      y=Math.max(customerEnd,staffEnd)+8;
    }
    function tableHeader() {
      if (isB2b) {
        const top = 34, sub = 128; let x = M;
        ['STT','TÊN HÀNG','ĐVT','SL','Maquette'].forEach((label,i)=>{cell(label,x,y,widths[i],top+sub,{fill:'#c2daeb',bold:true,size:i===0?(isVigifts?10:12):i===2?14:16});x+=widths[i];});
        const priceEndIndex=showB2bDiscountColumn?9:8;
        const priceWidth=widths.slice(5,priceEndIndex).reduce((a,b)=>a+b,0);
        cell('ĐƠN GIÁ (-VAT)',x,y,priceWidth,top,{fill:'#c2daeb',bold:true,size:19});
        (showB2bDiscountColumn?['Đơn giá chưa bao gồm chi phí in logo','CK','Phí in logo','Đơn giá sau giảm đã bao gồm chi phí in logo']:['Đơn giá chưa bao gồm chi phí in logo','Phí in logo','Đơn giá sau giảm đã bao gồm chi phí in logo']).forEach((label,i)=>{cell(label,x,y+top,widths[i+5],sub,{fill:'#c2daeb',bold:true,size:17});x+=widths[i+5];});
        cell('THÀNH TIỀN (-VAT)',x,y,widths[showB2bDiscountColumn?9:8],top+sub,{fill:'#c2daeb',bold:true,size:17});
        y+=top+sub;return;
      }
      const headerHeight = Math.max(76, ...headers.map((label, i) => { const size = i === 0 ? 15 : i === 4 ? 16 : 17; c.font = font(size, true); return lines(c, label, widths[i] - 12).length * (size + 3) + 12; }));
      let x = M; headers.forEach((label, i) => { cell(label, x, y, widths[i], headerHeight, { fill: '#c2daeb', bold: true, size: i === 0 ? 15 : i === 4 ? 16 : 17 }); x += widths[i]; }); y += headerHeight;
    }
    newPage(); tableHeader();
    state.rows.forEach((r, index) => {
      const description = isVigifts?[r.name,`- Thương hiệu: ${r.brand||'Chưa ghi'}`,`- In ấn logo: ${r.printFee>0?(r.printDescription||'Có tính phí in ấn logo'):'Chưa bao gồm chi phí in ấn logo'}`,`- Mã hàng: ${r.sku}`,`- Đóng gói: ${r.packagingDescription||'theo tiêu chuẩn nhà sản xuất'}`].join('\n'):[r.name,'- Thương hiệu: Gốm sứ Minh Long I',`- Mã hàng: ${r.sku}`,r.bundleContents?`- Bộ gồm: ${r.bundleContents}`:'',`- In ấn logo: ${r.printFee>0?(r.printDescription||'Có tính phí in ấn logo'):'Chưa bao gồm chi phí in ấn logo'}`,`- Đóng gói: ${r.packagingDescription||'theo tiêu chuẩn nhà sản xuất'}`].filter(Boolean).join('\n');
      const discount = r.discountType === 'amount' ? `${unitAmount(r.discount)} đ` : Number(r.discount) ? `${Number(r.discount)}%` : '-';
      const hrcProduct = [r.name, r.sku ? `Mã hàng: ${r.sku}` : ''].filter(Boolean).join('\n');
      const values = isB2b
        ? (showB2bDiscountColumn
          ? [index+1,description,r.unit||'',r.qty,'',unitAmount(r.price),discount,r.printFee?unitAmount(r.printFee):'',unitAmount(after(r)),amount(after(r)*Number(r.qty))]
          : [index+1,description,r.unit||'',r.qty,'',unitAmount(r.price),r.printFee?unitAmount(r.printFee):'',unitAmount(after(r)),amount(after(r)*Number(r.qty))])
        : hideHrcDiscountColumn
          ? [index+1,'',hrcProduct,r.unit||'',r.qty,unitAmount(r.price),unitAmount(after(r)),amount(after(r)*Number(r.qty))]
          : [index+1,'',hrcProduct,r.unit||'',r.qty,unitAmount(r.price),discount,unitAmount(after(r)),amount(after(r)*Number(r.qty))];
      const rowSize=isB2b?18:17;c.font=font(rowSize);
      const rowHeight=Math.max(isB2b?224:132,...values.map((v,i)=>lines(c,v,widths[i]-12).length*(rowSize+3)+22));
      if(rowHeight>bottom-(isB2b?162:120))throw new Error('Mô tả sản phẩm quá dài để vừa một trang PDF. Anh rút gọn mô tả rồi xuất lại.');
      if(y+rowHeight>bottom){newPage(true);tableHeader();}
      let x=M;
      values.forEach((value,i)=>{
        const numeric=isB2b?i>=5:i>=4&&i<=(hideHrcDiscountColumn?7:8);
        const descriptionColumn=isB2b?1:2;
        const amountColumnIndex=isB2b?(showB2bDiscountColumn?9:8):(hideHrcDiscountColumn?7:8);
        cell(value,x,y,widths[i],rowHeight,{size:rowSize,bold:isB2b?i===amountColumnIndex:numeric,align:numeric?'right':i===descriptionColumn?'left':'center'});
        if(i===(isB2b?4:1))fitImage(images[index],x+3,y+3,widths[i]-6,rowHeight-6);
        x+=widths[i];
      });y+=rowHeight;
    });
    const amountColumnIndex = isB2b ? (showB2bDiscountColumn ? 9 : 8) : hideHrcDiscountColumn ? 7 : 8;
    const labelWidth = widths.slice(0, amountColumnIndex).reduce((a, b) => a + b, 0);
    [['Tổng thành tiền', subtotal], [taxLabel, tax], ['Tổng Thanh Toán', total]].forEach(([label, value]) => {
      if(y+36>bottom)newPage(true);
      cell(label, M, y, labelWidth, 36, { bold: true, align: 'right', size: 22 });
      cell(amount(value), M + labelWidth, y, widths[amountColumnIndex], 36, { bold: true, align: 'right', size: 22 }); y += 36;
    });
    y += 12; block('Số tiền bằng chữ: ' + words + '.', { bold: true, italic: true }); y += 12;
    // Flow notes line by line instead of moving the entire block to a new page.
    const notes = String(state.notes ?? '').replaceAll('\\n','\n');
    if(notes.trim()){
      if(y+56>bottom)newPage(true);
      block('Ghi chú:', { bold: true, size: 25, lineHeight: 32 });
      notes.split('\n').filter(line=>line.trim()).forEach(line => block(line, { size: 24, lineHeight: 32, bold: /hiệu lực|thời gian giao hàng|địa chỉ giao hàng|thanh toán|tạm ứng|số tài khoản/i.test(line), color: '#000' }));
    }
    if(isVigifts){
      if(y+105>bottom)newPage(true);
      text('CÔNG TY TNHH SXTM QUẢNG CÁO VIGIFTS',W*.73,y+38,{size:18,bold:true,align:'center'});
    }else{
    if (y + 100 > bottom) newPage(true);
    const signatureX = W * .72;
    text('Phụ trách kinh doanh', signatureX, y + 28, { bold: true, size: 23, align: 'center' });
    }
    pages.forEach((page, index) => {
      const ctx = page.getContext('2d'); ctx.font = font(17); ctx.fillStyle = '#666'; ctx.textAlign = 'center';
      ctx.fillText(`Trang ${index + 1}/${pages.length}`, W / 2, H - 5);
    });
    return pages;
  }
  return { amountInWords, createPages };
})();
