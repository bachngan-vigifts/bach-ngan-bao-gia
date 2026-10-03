/* Client-only Excel export. Files are downloaded to the device and never uploaded. */
globalThis.QuoteExcel=(()=>{
 const NAVY='102A56',BLUE='C2DAEB',PALE='EAF1FB',BORDER='26374F',WHITE='FFFFFF',AMBER='FFF2CC';
 const loadExcelJs=()=>new Promise((resolve,reject)=>{
  if(globalThis.ExcelJS)return resolve();
  const existing=document.querySelector('script[data-exceljs]');
  if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(Error('Không tải được bộ tạo Excel.')),{once:true});return;}
  const script=document.createElement('script');script.dataset.exceljs='';script.src='/exceljs.min.js?v=4.4.0';script.onload=resolve;script.onerror=()=>reject(Error('Không tải được bộ tạo Excel. Vui lòng tải lại trang.'));document.head.append(script);
 });
 const cleanFile=value=>String(value||'Bao-gia').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim();
 const date=value=>String(value||'').split('-').reverse().join('/');
 const money='#,##0 "đ"',number='#,##0.###';
 const thin={style:'thin',color:{argb:BORDER}},border={top:thin,left:thin,bottom:thin,right:thin};
 const center={horizontal:'center',vertical:'middle',wrapText:true},left={horizontal:'left',vertical:'top',wrapText:true},right={horizontal:'right',vertical:'middle'};
 const font=(bold=false,size=10,color='000000',italic=false)=>({name:'Arial',size,bold,color:{argb:color},italic});
 const fill=color=>({type:'pattern',pattern:'solid',fgColor:{argb:color}});
 const taxRate=(row,state)=>(Number.isFinite(Number(row.taxRate))?Number(row.taxRate):Number(state.vat||0))/100;
 const description=(row,state)=>{
  if(state.type==='HRC'){
   const packing=[Number(row.perCarton)>0?`${Number(row.perCarton).toLocaleString('vi-VN')} ${row.unit||'cái'}/thùng`:'',Number(row.cartonWeight)>0?`nặng ${Number(row.cartonWeight).toLocaleString('vi-VN')} kg/thùng`:''].filter(Boolean).join('; ');
   return [row.name,packing?`Đóng gói: ${packing}`:''].filter(Boolean).join('\n');
  }
  return [row.name,`- Thương hiệu: ${row.brand||(state.type==='B2B'?'Gốm sứ Minh Long I':'Chưa ghi')}`,row.bundleContents?`- Bộ gồm: ${row.bundleContents}`:'',`- In ấn logo: ${Number(row.printFee)>0?(row.printDescription||'In ấn logo như thiết kế được phê duyệt.'):'Chưa bao gồm chi phí in ấn logo'}`,`- Mã hàng: ${row.sku||''}`,`- Đóng gói: ${row.packagingDescription||'theo tiêu chuẩn nhà sản xuất'}`].filter(Boolean).join('\n');
 };
 const imageData=source=>{
  if(!source)return null;if(typeof source==='string'&&/^data:image\//.test(source))return source;
  const canvas=document.createElement('canvas'),w=source.naturalWidth||source.width,h=source.naturalHeight||source.height;if(!w||!h)return null;
  const ratio=Math.min(1,900/Math.max(w,h));canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.88);
 };
 const addImage=(workbook,sheet,source,range)=>{const data=imageData(source);if(!data)return false;const id=workbook.addImage({base64:data,extension:data.startsWith('data:image/png')?'png':'jpeg'});sheet.addImage(id,range);return true;};
 const imageSize=source=>{
  if(source&&typeof source!=='string')return{width:source.naturalWidth||source.width||1,height:source.naturalHeight||source.height||1};
  if(typeof source==='string'&&source.startsWith('data:image/png'))try{const raw=atob(source.split(',')[1]),byte=index=>raw.charCodeAt(index),value=index=>(byte(index)<<24)|(byte(index+1)<<16)|(byte(index+2)<<8)|byte(index+3);return{width:value(16)>>>0,height:value(20)>>>0};}catch{}
  if(typeof source==='string'&&/^data:image\/jpe?g[;,]/i.test(source))try{
   const raw=atob(source.split(',')[1]),byte=i=>raw.charCodeAt(i),word=i=>byte(i)*256+byte(i+1);
   for(let i=2;i+8<raw.length;){
    if(byte(i++)!==255)continue;while(byte(i)===255)i++;const marker=byte(i++);
    if(marker===217||marker===218)break;if(marker===216||marker===1||(marker>=208&&marker<=215))continue;
    const length=word(i);if(length<2||i+length>raw.length)break;
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return{width:word(i+5),height:word(i+3)};
    i+=length;
   }
  }catch{}
  return null;
 };
 // ExcelJS fractional cell coordinates use its internal column units, not pixels.
 // Native offsets are EMUs (9,525 per pixel); explicit extents survive XLSX export.
 const imageAnchor=(column,row,left,top,width,height)=>({tl:{nativeCol:column-1,nativeRow:row-1,nativeColOff:Math.round(left*9525),nativeRowOff:Math.round(top*9525)},ext:{width,height},editAs:'oneCell'});
 const addCellImage=(workbook,sheet,source,column,rowNumber)=>{
  const data=imageData(source);if(!data)return false;
  const original=imageSize(source);if(!original?.width||!original?.height)return false;
  const columnPixels=Math.max(30,(sheet.getColumn(column).width||8.43)*7),rowPixels=Math.max(30,(sheet.getRow(rowNumber).height||18)*96/72),padding=4,availableWidth=columnPixels-padding*2,availableHeight=rowPixels-padding*2,scale=Math.min(availableWidth/original.width,availableHeight/original.height),width=Math.max(1,original.width*scale),height=Math.max(1,original.height*scale),left=(columnPixels-width)/2,top=(rowPixels-height)/2,id=workbook.addImage({base64:data,extension:data.startsWith('data:image/png')?'png':'jpeg'});
  sheet.addImage(id,imageAnchor(column,rowNumber,left,top,width,height));return true;
 };
 const applyCell=(cell,{bold=false,size=10,color='000000',bg,align=left,fmt,borders=false,italic=false}={})=>{cell.font=font(bold,size,color,italic);cell.alignment=align;if(bg)cell.fill=fill(bg);if(fmt)cell.numFmt=fmt;if(borders)cell.border=border;};
 const mergeWrite=(sheet,range,value,style={})=>{sheet.mergeCells(range);const cell=sheet.getCell(range.split(':')[0]);cell.value=value;applyCell(cell,style);return cell;};
 const setWidths=(sheet,widths)=>widths.forEach((width,index)=>{sheet.getColumn(index+1).width=width;});
 const styleTableRow=(row,last,header=false)=>{row.eachCell({includeEmpty:true},(cell,column)=>{if(column>last)return;applyCell(cell,{bold:header,size:header?9:10,color:header?NAVY:'000000',bg:header?BLUE:undefined,align:header?center:(column===3||column===2?left:center),borders:true});});};
 function addHeader(workbook,sheet,state,banner,lastColumn){
  sheet.properties.defaultRowHeight=18;sheet.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.39,right:.39,top:.59,bottom:.39,header:.2,footer:.2},horizontalCentered:true};
  sheet.getRow(1).height=24;sheet.getRow(2).height=24;sheet.getRow(3).height=24;
  const bannerSize=imageSize(banner),bannerWidth=Array.from({length:lastColumn},(_,i)=>(sheet.getColumn(i+1).width||8.43)*7).reduce((sum,width)=>sum+width,0)-8;
  let hasBanner=false;
  if(bannerSize?.width&&bannerSize?.height){
   const height=bannerWidth*bannerSize.height/bannerSize.width;
   for(let row=1;row<=3;row++)sheet.getRow(row).height=(height+8)*72/96/3;
   hasBanner=addImage(workbook,sheet,banner,imageAnchor(1,1,4,4,bannerWidth,height));
  }
  if(!hasBanner)mergeWrite(sheet,`A1:${sheet.getColumn(lastColumn).letter}3`,state.type==='VIGIFTS'?'VIGIFTS':'BÁCH NGÂN',{bold:true,size:16,color:NAVY,align:center});
  mergeWrite(sheet,`A4:${sheet.getColumn(lastColumn).letter}4`,state.type==='HRC'?'BẢNG BÁO GIÁ':'BẢNG CHÀO GIÁ',{bold:true,size:16,color:NAVY,align:center});sheet.getRow(4).height=24;
  mergeWrite(sheet,`A5:${sheet.getColumn(lastColumn).letter}5`,`Ngày ${date(state.date)}`,{size:10,align:center});
  const rightStart=state.type==='VIGIFTS'?Math.max(5,lastColumn-4):Math.max(6,lastColumn-3),leftEnd=rightStart-1,lastLetter=sheet.getColumn(lastColumn).letter,rightLetter=sheet.getColumn(rightStart).letter,leftLetter=sheet.getColumn(leftEnd).letter;
  mergeWrite(sheet,`A7:${leftLetter}7`,`Số BG: ${state.quoteNo||''}`,{bold:true});mergeWrite(sheet,`${rightLetter}7:${lastLetter}7`,`Phụ trách: ${state.owner||''}`,{bold:true,align:left});
  mergeWrite(sheet,`A8:${leftLetter}8`,`Tên khách hàng: ${state.customer||''}`,{bold:true});mergeWrite(sheet,`${rightLetter}8:${lastLetter}8`,`SĐT: ${state.ownerPhone||''}`,{bold:true,align:left});
  mergeWrite(sheet,`A9:${leftLetter}9`,`Người liên hệ: ${state.contact||''}${state.phone?' · '+state.phone:''}`,{bold:true});
  mergeWrite(sheet,`A11:${lastLetter}11`,`Kính gửi: ${state.customer||'Quý khách hàng'};`,{bold:true,size:11});
  mergeWrite(sheet,`A12:${lastLetter}12`,'Rất cảm ơn sự quan tâm của Quý khách đến sản phẩm của Công ty chúng tôi.');
  mergeWrite(sheet,`A13:${lastLetter}13`,'Theo yêu cầu của Quý khách, chúng tôi xin gửi bảng chào giá các sản phẩm theo chi tiết như sau:');
 }
 function addQuoteSheet(workbook,state,images,banner){
  const b2b=state.type==='B2B'||state.type==='VIGIFTS',headers=b2b?['STT','TÊN HÀNG','ĐVT','SL','Maquette','ĐƠN GIÁ','CK','GIÁ SAU CK','PHÍ IN','GIÁ SAU CK','THÀNH TIỀN']:['STT','MÃ HÀNG','TÊN HÀNG','ĐVT','SL','ĐƠN GIÁ','GIÁ CK','THÀNH TIỀN','HÌNH ẢNH'];
  const widths=b2b?[6,34,9,8,16,14,11,15,13,15,17]:[6,14,34,9,9,15,15,17,17],sheet=workbook.addWorksheet(state.type,{views:[{state:'normal',showGridLines:false}],properties:{tabColor:{argb:state.type==='VIGIFTS'?'E88400':state.type==='B2B'?'6C20D7':'0877D1'}}});
  setWidths(sheet,widths);addHeader(workbook,sheet,state,banner,headers.length);const headerRow=14;sheet.getRow(headerRow).values=headers;sheet.getRow(headerRow).height=38;styleTableRow(sheet.getRow(headerRow),headers.length,true);
  const first=headerRow+1,hiddenTaxColumn=headers.length+1;sheet.getColumn(hiddenTaxColumn).hidden=true;
  state.rows.forEach((item,index)=>{
   const r=first+index,row=sheet.getRow(r),desc=description(item,state),discount=Number(item.discount)||0,price=Number(item.price)||0,qty=Number(item.qty)||0,printFee=Number(item.printFee)||0;
   const discountedPrice=item.discountType==='amount'?Math.max(0,price-discount):Math.max(0,price*(1-discount/100)),afterPrice=discountedPrice+printFee,lineTotal=qty*afterPrice;
   const lines=desc.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/(b2b?42:44))),0);row.height=Math.max(b2b?62:58,lines*14+8);
   if(b2b){
    row.values=[index+1,desc,item.unit||'',qty,'',price,discount,item.discountType==='amount'?{formula:`MAX(0,F${r}-G${r})`,result:discountedPrice}:{formula:`MAX(0,F${r}*(1-G${r}))`,result:discountedPrice},printFee,{formula:`H${r}+I${r}`,result:afterPrice},{formula:`D${r}*J${r}`,result:lineTotal},taxRate(item,state)];
    row.getCell(6).numFmt=money;row.getCell(7).numFmt=item.discountType==='amount'?money:'0.##%';if(item.discountType!=='amount')row.getCell(7).value=discount/100;[8,9,10,11].forEach(c=>row.getCell(c).numFmt=money);
    if(addCellImage(workbook,sheet,images[index],5,r))row.getCell(5).value='';
   }else{
    row.values=[index+1,item.sku||'',desc,item.unit||'',qty,price,item.discountType==='amount'?{formula:`MAX(0,F${r}-${discount})`,result:discountedPrice}:{formula:`MAX(0,F${r}*(1-${discount/100}))`,result:discountedPrice},{formula:`E${r}*G${r}`,result:qty*discountedPrice},'',taxRate(item,state)];[6,7,8].forEach(c=>row.getCell(c).numFmt=money);
    if(addCellImage(workbook,sheet,images[index],9,r))row.getCell(9).value='';
   }
   styleTableRow(row,headers.length);row.getCell(b2b?2:3).alignment=left;row.getCell(hiddenTaxColumn).numFmt='0.00%';
  });
  const last=first+state.rows.length-1,totalStart=last+1,lastLetter=sheet.getColumn(headers.length).letter,labelEnd=sheet.getColumn(headers.length-1).letter,amountColumn=lastLetter,lineAmountColumn=b2b?'K':'H',totalRange=`${lineAmountColumn}${first}:${lineAmountColumn}${last}`,totals=QuoteMath.totals(state);
  [['Tổng thành tiền',{formula:`SUM(${totalRange})`,result:totals.subtotal}],['Thuế VAT',{formula:`SUMPRODUCT(${totalRange},${sheet.getColumn(hiddenTaxColumn).letter}${first}:${sheet.getColumn(hiddenTaxColumn).letter}${last})`,result:totals.tax}],['Tổng thanh toán',{formula:`${amountColumn}${totalStart}+${amountColumn}${totalStart+1}`,result:totals.total}]].forEach(([label,value],index)=>{
   const r=totalStart+index;mergeWrite(sheet,`A${r}:${labelEnd}${r}`,label,{bold:true,bg:index===2?NAVY:PALE,color:index===2?WHITE:NAVY,align:right,borders:true});const cell=sheet.getCell(`${amountColumn}${r}`);cell.value=value;applyCell(cell,{bold:true,bg:index===2?NAVY:PALE,color:index===2?WHITE:NAVY,align:right,fmt:money,borders:true});sheet.getRow(r).height=22;
  });
  let cursor=totalStart+4;mergeWrite(sheet,`A${cursor}:${lastLetter}${cursor}`,`Số tiền bằng chữ: ${HrcPdf.amountInWords(QuoteMath.totals(state).total)}.`,{bold:true,italic:true});cursor+=2;mergeWrite(sheet,`A${cursor}:${lastLetter}${cursor}`,'Ghi chú:',{bold:true,size:11});cursor++;
  for(const note of String(state.notes||'').replaceAll('\\n','\n').split(/\r?\n/).filter(Boolean)){mergeWrite(sheet,`A${cursor}:${lastLetter}${cursor}`,note,{bold:/hiệu lực|thời gian giao hàng|địa chỉ giao hàng|thanh toán|tạm ứng|số tài khoản/i.test(note)});sheet.getRow(cursor).height=Math.max(18,Math.ceil(note.length/105)*15);cursor++;}
  cursor+=2;mergeWrite(sheet,`${sheet.getColumn(Math.max(2,headers.length-3)).letter}${cursor}:${lastLetter}${cursor}`,state.type==='VIGIFTS'?'CÔNG TY TNHH SXTM QUẢNG CÁO VIGIFTS':'Phụ trách kinh doanh',{bold:true,align:center});
  sheet.autoFilter={from:{row:headerRow,column:1},to:{row:last,column:headers.length}};sheet.pageSetup.printArea=`A1:${lastLetter}${cursor+2}`;sheet.headerFooter.oddFooter='Trang &P/&N';
  return sheet;
 }
 function addShippingSheet(workbook,state){
  const sheet=workbook.addWorksheet('Phí vận chuyển',{views:[{state:'normal',showGridLines:false}],properties:{tabColor:{argb:'2D9D78'}}}),headers=['STT','MÃ HÀNG','SẢN PHẨM','SL','SP/THÙNG','KG/THÙNG','DÀI (CM)','RỘNG (CM)','CAO (CM)','SỐ THÙNG','TỔNG KG','THỂ TÍCH (M³)','KG QUY ĐỔI','KG TÍNH CƯỚC','PHÍ VẬN CHUYỂN'];setWidths(sheet,[6,14,34,9,11,12,11,11,11,11,12,14,13,14,18]);
  mergeWrite(sheet,'A1:O1','TÍNH ĐÓNG THÙNG & PHÍ VẬN CHUYỂN',{bold:true,size:16,color:NAVY,align:center});sheet.getRow(1).height=28;
  sheet.getCell('A3').value='Cước (đ/kg)';sheet.getCell('B3').value=Number(state.shipping?.rate)||0;sheet.getCell('C3').value='Hệ số quy đổi';sheet.getCell('D3').value=Number(state.shipping?.divisor)||5000;sheet.getCell('E3').value='Phụ phí (đ)';sheet.getCell('F3').value=Number(state.shipping?.extra)||0;
  for(const cell of ['A3','C3','E3'])applyCell(sheet.getCell(cell),{bold:true,bg:PALE,color:NAVY,align:center,borders:true});for(const cell of ['B3','D3','F3'])applyCell(sheet.getCell(cell),{bold:true,bg:AMBER,align:right,fmt:cell==='D3'?number:money,borders:true});
  mergeWrite(sheet,'H3:O3','Các ô màu vàng có thể chỉnh theo đơn vị vận chuyển.',{italic:true,color:'6B7280',align:left});
  const header=6;sheet.getRow(header).values=headers;sheet.getRow(header).height=38;styleTableRow(sheet.getRow(header),headers.length,true);const first=header+1;
  const shippingResults=[];state.rows.forEach((item,index)=>{const r=first+index,row=sheet.getRow(r),qty=Number(item.qty)||0,perCarton=Number(item.perCarton)||0,weight=Number(item.cartonWeight)||0,length=Number(item.cartonLength)||0,width=Number(item.cartonWidth)||0,height=Number(item.cartonHeight)||0,cartons=perCarton?Math.ceil(qty/perCarton):0,totalKg=cartons*weight,volume=cartons*length*width*height/1000000,volumeKg=cartons*length*width*height/(Number(state.shipping?.divisor)||5000),billable=Math.max(totalKg,volumeKg),fee=billable*(Number(state.shipping?.rate)||0);shippingResults.push({cartons,totalKg,volume,volumeKg,billable,fee});row.values=[index+1,item.sku||'',item.name||'',qty,perCarton,weight,length,width,height,{formula:`IFERROR(ROUNDUP(D${r}/E${r},0),0)`,result:cartons},{formula:`J${r}*F${r}`,result:totalKg},{formula:`J${r}*G${r}*H${r}*I${r}/1000000`,result:volume},{formula:`J${r}*G${r}*H${r}*I${r}/$D$3`,result:volumeKg},{formula:`MAX(K${r},M${r})`,result:billable},{formula:`N${r}*$B$3`,result:fee}];row.height=Math.max(36,Math.ceil(String(item.name||'').length/45)*14+8);styleTableRow(row,headers.length);[4,5,6,7,8,9].forEach(c=>{row.getCell(c).fill=fill(AMBER);});[4,5,6,7,8,9,10,11,13,14].forEach(c=>row.getCell(c).numFmt=number);row.getCell(12).numFmt='0.000';row.getCell(15).numFmt=money;row.getCell(3).alignment=left;});
  const last=first+state.rows.length-1,total=last+1,sums=key=>shippingResults.reduce((sum,item)=>sum+item[key],0);mergeWrite(sheet,`A${total}:I${total}`,'TỔNG CỘNG',{bold:true,bg:NAVY,color:WHITE,align:right,borders:true});for(const [column,key] of [['J','cartons'],['K','totalKg'],['L','volume'],['M','volumeKg'],['N','billable']]){const cell=sheet.getCell(`${column}${total}`);cell.value={formula:`SUM(${column}${first}:${column}${last})`,result:sums(key)};applyCell(cell,{bold:true,bg:NAVY,color:WHITE,align:right,fmt:column==='L'?'0.000':number,borders:true});}const fee=sheet.getCell(`O${total}`);fee.value={formula:`SUM(O${first}:O${last})+$F$3`,result:sums('fee')+(Number(state.shipping?.extra)||0)};applyCell(fee,{bold:true,bg:NAVY,color:WHITE,align:right,fmt:money,borders:true});
  sheet.autoFilter={from:{row:header,column:1},to:{row:last,column:headers.length}};sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.35,right:.35,top:.5,bottom:.4,header:.2,footer:.2}};sheet.pageSetup.printArea=`A1:O${total}`;sheet.headerFooter.oddFooter='Trang &P/&N';return sheet;
 }
 async function build(state,{images=[],banner=null}={}){if(!globalThis.ExcelJS)throw Error('Chưa tải được bộ tạo Excel.');const workbook=new ExcelJS.Workbook();workbook.creator='Phần mềm báo giá Bách Ngân - VIGIFTS';workbook.created=new Date();workbook.modified=new Date();workbook.calcProperties.fullCalcOnLoad=true;addQuoteSheet(workbook,state,images,banner);addShippingSheet(workbook,state);return workbook;}
 async function download(state,assets={}){await loadExcelJs();const workbook=await build(state,assets),bytes=await workbook.xlsx.writeBuffer(),blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${cleanFile(state.quoteNo)} - ${cleanFile(state.customer)}.xlsx`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 return {build,download};
})();
