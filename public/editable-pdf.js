/* Vector-text PDF export: images stay raster, while quotation text remains selectable. */
globalThis.EditableQuotePdf=(()=>{
 const W=595.28,H=841.89,M=12,blue=PDFLib.rgb(.06,.16,.34),line=PDFLib.rgb(.12,.15,.2),header=PDFLib.rgb(.76,.85,.92);
 const number=value=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(Number(value)||0);
 const unitNumber=value=>new Intl.NumberFormat('vi-VN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
 const printFee=row=>{const value=row?.printFee??row?.print_fee??0;return typeof value==='number'?value:Number(String(value).replace(/\./g,'').replace(',','.'))||0;};
 const fetchBytes=async url=>{const response=await fetch(url);if(!response.ok)throw new Error('Không tải được font PDF.');return await response.arrayBuffer()};
 const imageBytes=async image=>{if(!image)return null;const canvas=document.createElement('canvas'),ratio=Math.min(1,1000/Math.max(image.naturalWidth||image.width,1));canvas.width=Math.max(1,Math.round((image.naturalWidth||image.width)*ratio));canvas.height=Math.max(1,Math.round((image.naturalHeight||image.height)*ratio));const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);return new Promise(resolve=>canvas.toBlob(async blob=>resolve(blob?await blob.arrayBuffer():null),'image/jpeg',.9))};
 const wrap=(font,value,size,width)=>{const lines=[];for(const paragraph of String(value??'').split('\n')){let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){const next=line?line+' '+word:word;if(font.widthOfTextAtSize(next,size)<=width){line=next;continue}if(line)lines.push(line);line=word;}lines.push(line);}return lines.length?lines:[''];};
 // Use the approved HRC layout for geometry, but draw into PDF vector primitives.
 // Canvas coordinates retain the original template's margins and pagination.
 function createHrcVector({pdf,regular,bold,state,images,banner,imageAssets,bannerAsset}) {
  const sourceWidth=1240, sourceHeight=1754, scale=W/sourceWidth;
  const assets=new Map(images.map((image,index)=>[image,imageAssets[index]]));
  assets.set(banner,bannerAsset);
  const color=value=>{const hex=String(value||'#000').replace('#','');const full=hex.length===3?[...hex].map(c=>c+c).join(''):hex;return PDFLib.rgb(...[0,2,4].map(i=>parseInt(full.slice(i,i+2),16)/255));};
  function createCanvas() {
   const page=pdf.addPage([W,H]);let tx=0,ty=0;
   const context={
    font:'20px "Times New Roman"',fillStyle:'#000',strokeStyle:'#000',lineWidth:1,textAlign:'left',textBaseline:'alphabetic',
    translate(x,y){tx+=x;ty+=y;},
    measureText(value){const size=Number(this.font.match(/([\d.]+)px/)[1]);return {width:(this.font.includes('bold')?bold:regular).widthOfTextAtSize(String(value),size)};},
    fillRect(x,y,width,height){page.drawRectangle({x:(tx+x)*scale,y:H-(ty+y+height)*scale,width:width*scale,height:height*scale,color:color(this.fillStyle)});},
    strokeRect(x,y,width,height){page.drawRectangle({x:(tx+x)*scale,y:H-(ty+y+height)*scale,width:width*scale,height:height*scale,borderColor:color(this.strokeStyle),borderWidth:this.lineWidth*scale});},
    fillText(value,x,y){
     const text=String(value),size=Number(this.font.match(/([\d.]+)px/)[1]),font=this.font.includes('bold')?bold:regular;
     const width=font.widthOfTextAtSize(text,size),offset=this.textAlign==='center'?width/2:this.textAlign==='right'?width:0;
     page.drawText(text,{x:(tx+x-offset)*scale,y:H-(ty+y)*scale,size:size*scale,font,color:color(this.fillStyle),...(this.font.includes('italic')?{ySkew:PDFLib.degrees(10)}:{})});
    },
    drawImage(image,x,y,width,height){const asset=assets.get(image);if(asset)page.drawImage(asset,{x:(tx+x)*scale,y:H-(ty+y+height)*scale,width:width*scale,height:height*scale});}
   };
   return {width:sourceWidth,height:sourceHeight,getContext:()=>context};
  }
  const rows=state.rows.map(row=>{
   const parts=[];
   if(Number(row.perCarton)>0)parts.push(`${Number(row.perCarton).toLocaleString('vi-VN')} ${row.unit||'cái'}/thùng`);
   if(Number(row.cartonWeight)>0)parts.push(`nặng ${Number(row.cartonWeight).toLocaleString('vi-VN')} kg/thùng`);
   return {...row,name:[row.name,parts.length?`Đóng gói: ${parts.join('; ')}`:''].filter(Boolean).join('\n')};
  });
  HrcPdf.createPages({state:{...state,rows},images,banner,createCanvas,width:sourceWidth,height:sourceHeight});
  return pdf.save();
 }
 async function create({state,images,banner}){
  const isB2b=state.type==='B2B'||state.type==='VIGIFTS';
  const showB2bDiscountColumn=state.type==='B2B'&&state.hideB2bDiscountColumn!==true;
  const M=isB2b?W*10/210:12;
  const topInset=isB2b?H*15/297-8:0,staffShift=state.type==='B2B'?W*10/210:state.type==='VIGIFTS'?W*20/210:0;
  if(!globalThis.fontkit)throw new Error('Chưa tải được bộ font cho PDF. Vui lòng tải lại trang.');
  const pdf=await PDFLib.PDFDocument.create();pdf.registerFontkit(globalThis.fontkit);
  const regular=await pdf.embedFont(await fetchBytes('/fonts/TimesNewRoman.ttf'),{subset:true}),bold=await pdf.embedFont(await fetchBytes('/fonts/TimesNewRomanBold.ttf'),{subset:true});
  const imageAssets=await Promise.all(images.map(async image=>{const bytes=await imageBytes(image);return bytes?pdf.embedJpg(bytes):null;}));
  const bannerBytes=await imageBytes(banner),bannerAsset=bannerBytes?await pdf.embedJpg(bannerBytes):null;
  if(state.type==='HRC')return createHrcVector({pdf,regular,bold,state,images,banner,imageAssets,bannerAsset});
  const isVigifts=state.type==='VIGIFTS';
  // Vigifts keeps its own compact table so discount is visible beside the price.
  const columns=isVigifts?[18,132,23,22,55,42,30,38,45,45]:isB2b?(showB2bDiscountColumn?[18,122,24,22,62,39,26,34,43,45]:[22,142,30,30,78,48,37,50,51]):[20,60,140,35,40,63,70,68];
  const scale=(W-M*2)/columns.reduce((sum,width)=>sum+width,0),widths=columns.map(width=>width*scale);
  let page,y;
  const rect=(x,top,width,height,fill=PDFLib.rgb(1,1,1))=>page.drawRectangle({x,y:H-top-height,width,height,color:fill,borderColor:line,borderWidth:.45});
  const write=(value,x,top,options={})=>page.drawText(String(value??''),{x,y:H-top-(options.size||8),font:options.bold?bold:regular,size:options.size||8,color:options.color||PDFLib.rgb(0,0,0)});
  const cell=(value,x,top,width,height,options={})=>{rect(x,top,width,height,options.fill);const size=options.size||7.2,lines=wrap(options.bold?bold:regular,value,size,width-7),lh=size+2,block=lines.length*lh,start=top+(height-block)/2+1;lines.forEach((text,index)=>{const textWidth=(options.bold?bold:regular).widthOfTextAtSize(text,size);const left=options.align==='right'?x+width-4-textWidth:options.align==='left'?x+4:x+(width-textWidth)/2;write(text,left,start+index*lh,{size,bold:options.bold});});};
  const drawImage=(asset,x,top,width,height)=>{if(!asset)return;const ratio=Math.min(width/asset.width,height/asset.height),w=asset.width*ratio,h=asset.height*ratio;page.drawImage(asset,{x:x+(width-w)/2,y:H-top-height+(height-h)/2,width:w,height:h});};
  const title=continued=>{page=pdf.addPage([W,H]);y=12;if(continued&&isB2b)return;if(bannerAsset)drawImage(bannerAsset,M,8+topInset,W-M*2,64);const titleTop=(bannerAsset?79:20)+topInset;write(isVigifts?'BẢNG CHÀO GIÁ':isB2b?'BẢNG CHÀO GIÁ':'BẢNG BÁO GIÁ',W/2-(isB2b?48:45),titleTop,{size:14,bold:true,color:blue});write(`Ngày ${(state.date||'').split('-').reverse().join('/')}`,W/2-35,titleTop+19,{size:8});if(continued){write('Tiếp theo',M,titleTop+36,{size:8,italic:true});y=titleTop+48;return;}const customer=[`Số BG: ${state.quoteNo||''}`,`Tên khách hàng: ${state.customer||''}`,`Người liên hệ: ${state.contact||''}${state.phone?' · '+state.phone:''}`];const staff=[`Phụ trách: ${state.owner||''}`,`SĐT: ${state.ownerPhone||''}`];customer.forEach((text,index)=>write(text,M,titleTop+38+index*12,{size:7.4,bold:true}));staff.forEach((text,index)=>{const w=bold.widthOfTextAtSize(text,7.4);write(text,W-M-staffShift-w,titleTop+38+index*12,{size:7.4,bold:true});});write(`Kính gửi: ${state.customer||'Quý khách hàng'};`,M,titleTop+79,{size:8.5,bold:true});write('Rất cảm ơn sự quan tâm của Quý khách đến sản phẩm của Công ty chúng tôi.',M,titleTop+94,{size:7.5});write('Theo yêu cầu của Quý khách, chúng tôi xin gửi bảng chào giá các sản phẩm theo chi tiết như sau:',M,titleTop+107,{size:7.5});y=titleTop+121;};
  const tableHeader=()=>{let x=M;const labels=isVigifts?['STT','TÊN HÀNG','ĐVT','SL','Maquette','ĐƠN GIÁ','CK','PHÍ IN','GIÁ SAU CK','THÀNH TIỀN']:isB2b?(showB2bDiscountColumn?['STT','TÊN HÀNG','ĐVT','SL','Maquette','ĐƠN GIÁ','CK','PHÍ IN','GIÁ SAU CK','THÀNH TIỀN']:['STT','TÊN HÀNG','ĐVT','SL','Maquette','ĐƠN GIÁ','PHÍ IN','GIÁ SAU GIẢM','THÀNH TIỀN']):['STT','MÃ HÀNG','TÊN HÀNG','ĐVT','SL','ĐƠN GIÁ','THÀNH TIỀN','HÌNH ẢNH'];labels.forEach((label,index)=>{cell(label,x,y,widths[index],27,{fill:header,size:6.5,bold:true});x+=widths[index];});y+=27;};
  const b2bDescription=row=>[row.name,`- Thương hiệu: ${row.brand||'Gốm sứ Minh Long I'}`,`- Mã hàng: ${row.sku}`,row.bundleContents?`- Bộ gồm: ${row.bundleContents}`:'',`- In ấn logo: ${row.printFee>0?(row.printDescription||'Có tính phí in ấn logo'):'Chưa bao gồm chi phí in ấn logo'}`,`- Đóng gói: ${row.packagingDescription||'theo tiêu chuẩn nhà sản xuất'}`].filter(Boolean).join('\n');
  const hrcDescription=row=>{const number=value=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:3}).format(Number(value));const parts=[];if(Number(row.perCarton)>0)parts.push(`${number(row.perCarton)} ${row.unit||'cái'}/thùng`);if(Number(row.cartonWeight)>0)parts.push(`nặng ${number(row.cartonWeight)} kg/thùng`);return [row.name,parts.length?`Đóng gói: ${parts.join('; ')}`:''].filter(Boolean).join('\n');};
  title(false);tableHeader();
  for(let index=0;index<state.rows.length;index++){
   const row=state.rows[index],fee=printFee(row),pdfRow={...row,printFee:fee},after=QuoteMath.after(pdfRow,state),description=isVigifts?[row.name,`- Thương hiệu: ${row.brand||'Chưa ghi'}`,`- In ấn logo: ${fee>0?(row.printDescription||'Có tính phí in ấn logo'):'Chưa bao gồm chi phí in ấn logo'}`,`- Mã hàng: ${row.sku}`,`- Đóng gói: ${row.packagingDescription||'theo tiêu chuẩn nhà sản xuất'}`].join('\n'):isB2b?b2bDescription(pdfRow):hrcDescription(row);const discount=row.discountType==='amount'?`${unitNumber(row.discount)} đ`:`${number(row.discount)}%`;const values=isVigifts?[index+1,description,row.unit||'',row.qty,'',unitNumber(row.price),discount,fee>0?unitNumber(fee):'',unitNumber(after),number(after*Number(row.qty))]:isB2b?(showB2bDiscountColumn?[index+1,description,row.unit||'',row.qty,'',unitNumber(row.price),discount,fee>0?unitNumber(fee):'',unitNumber(after),number(after*Number(row.qty))]:[index+1,description,row.unit||'',row.qty,'',unitNumber(row.price),fee>0?unitNumber(fee):'',unitNumber(after),number(after*Number(row.qty))]):[index+1,row.sku,description,row.unit||'',row.qty,unitNumber(row.price),number(after*Number(row.qty)),''];const descriptionColumn=isB2b?1:2;const descriptionLines=wrap(regular,values[descriptionColumn],isVigifts?6.8:7,widths[descriptionColumn]-7).length;const contentHeight=isVigifts?Math.max(...values.map((value,column)=>wrap(column===values.length-1?bold:regular,value,6.8,widths[column]-7).length*8.8+8)):0;const asset=imageAssets[index],imageHeight=isVigifts&&asset?Math.min(64,(widths[4]-4)*asset.height/asset.width)+4:0;const rowHeight=isVigifts?Math.max(contentHeight,imageHeight):isB2b?Math.max(62,descriptionLines*8.8+10):Math.max(66,descriptionLines*9+12);const tableBottom=isB2b?H-M:H-135;if(y+rowHeight>tableBottom){title(true);tableHeader();}let x=M;values.forEach((value,column)=>{const numeric=isB2b?column>=5:column>=5&&column<=6;cell(value,x,y,widths[column],rowHeight,{size:isB2b?6.8:7.2,bold:isB2b?column===values.length-1:numeric,align:numeric?'right':column===descriptionColumn?'left':'center'});if(column===(isB2b?4:7))drawImage(imageAssets[index],x+2,y+2,widths[column]-4,rowHeight-4);x+=widths[column];});y+=rowHeight;
  }
  const totals=QuoteMath.totals(state),lastWidth=widths[widths.length-1],labelWidth=widths.slice(0,-1).reduce((sum,width)=>sum+width,0),totalRowHeight=isB2b?15:24;if(y+totalRowHeight*3+10>H-80){title(true);}for(const [label,value] of [['Tổng thành tiền',totals.subtotal],[totals.label,totals.tax],['Tổng thanh toán',totals.total]]){cell(label,M,y,labelWidth,totalRowHeight,{size:8,bold:true,align:'right'});cell(number(value),M+labelWidth,y,lastWidth,totalRowHeight,{size:8,bold:true,align:'right'});y+=totalRowHeight;}y+=10;const amountWords=globalThis.HrcPdf.amountInWords(totals.total),noteWidth=W-M*2,noteSize=9.8,noteLineHeight=13;for(const text of wrap(regular,'Số tiền bằng chữ: '+amountWords+'.',9,noteWidth)){write(text,M,y,{size:9,bold:true});y+=12;}y+=7;for(const note of String(state.notes||'').split('\n').filter(Boolean)){for(const text of wrap(regular,note,noteSize,noteWidth)){if(y+noteLineHeight>H-45){title(true);}write(text,M,y,{size:noteSize,bold:/hiệu lực|thời gian giao hàng|địa chỉ giao hàng|thanh toán|tạm ứng|số tài khoản/i.test(text)});y+=noteLineHeight;}}write('Phụ trách kinh doanh',W-145,Math.min(y+32,H-(isVigifts?H*10/297+8:26)),{size:8,bold:true});return await pdf.save();
 }
 return {create};
})();
