import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ExcelJS from 'exceljs';

globalThis.ExcelJS=ExcelJS;
for(const file of ['public/quote-math.js','public/hrc-pdf.js','public/excel-export.js'])vm.runInThisContext(readFileSync(file,'utf8'));
const banner=`data:image/jpeg;base64,${readFileSync('public/hrc-letterhead.jpg').toString('base64')}`;
const photo=`data:image/png;base64,${readFileSync('public/vigifts-letterhead.png').toString('base64')}`;
const base={quoteNo:'BG-001',date:'2026-09-09',customer:'Khách hàng mẫu',contact:'Anh A',phone:'0900000000',owner:'Nhân viên A',ownerPhone:'0911111111',vat:8,notes:'- Báo giá có hiệu lực 7 ngày.\n- Thời gian giao hàng: Theo thỏa thuận.',shipping:{divisor:5000,rate:12000,extra:50000},rows:[{sku:'SP01',name:'Sản phẩm mẫu',brand:'MINH LONG',unit:'Cái',qty:12,price:100000,discount:10,discountType:'percent',printFee:5000,printDescription:'In ấn logo như thiết kế được phê duyệt.',perCarton:6,cartonWeight:4,cartonLength:40,cartonWidth:30,cartonHeight:20,taxRate:8}]};

for(const type of ['HRC','B2B','VIGIFTS'])test(`Excel ${type} follows its quotation layout, embeds images and includes shipping formulas`,async()=>{
 const workbook=await QuoteExcel.build({...base,type},{images:[photo],banner}),bytes=await workbook.xlsx.writeBuffer(),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(bytes);
 assert.deepEqual(loaded.worksheets.map(sheet=>sheet.name),[type,'Phí vận chuyển']);
 const quote=loaded.getWorksheet(type),shipping=loaded.getWorksheet('Phí vận chuyển');
 assert.equal(quote.getCell('A4').value,type==='HRC'?'BẢNG BÁO GIÁ':'BẢNG CHÀO GIÁ');
 assert.ok(quote.getImages().length>=2,'letterhead and product image must be embedded');
 const productImage=quote.getImages()[1],productRatio=productImage.range.ext.width/productImage.range.ext.height;
 assert.ok(Math.abs(productRatio-(1688/212))<.05,'product image must retain its original aspect ratio');
 assert.equal(shipping.getCell('J7').value.formula,'IFERROR(ROUNDUP(D7/E7,0),0)');
 assert.equal(shipping.getCell('O8').value.formula,'SUM(O7:O7)+$F$3');
 if(type==='HRC')assert.equal(quote.getCell('I16').value.formula,'SUM(H15:H15)');
 if(type==='VIGIFTS'){
  assert.equal(quote.getCell('F15').value,100000);
  assert.deepEqual(quote.getCell('H15').value,{formula:'MAX(0,F15*(1-G15))',result:90000});
  assert.deepEqual(quote.getCell('J15').value,{formula:'H15+I15',result:95000});
  assert.deepEqual(quote.getCell('K15').value,{formula:'D15*J15',result:1140000});
  assert.equal(quote.getCell('K16').value.result,1140000);
  assert.equal(quote.getCell('K17').value.result,91200);
  assert.equal(quote.getCell('K18').value.result,1231200);
 }
 assert.equal(shipping.getCell('B3').value,12000);
 assert.equal(shipping.getCell('D3').value,5000);
 assert.match(quote.pageSetup.printArea,/^A1:/);
});

test('Excel exporter remains client-only and does not call quotation storage APIs',()=>{
 const source=readFileSync('public/excel-export.js','utf8');assert.equal(source.includes('BN.api'),false);assert.equal(source.includes("fetch('/api"),false);
});

for(const type of ['HRC','B2B','VIGIFTS'])test(`Excel ${type} preserves JPEG ratio and physical image offsets after serialization`,async()=>{
 const workbook=await QuoteExcel.build({...base,type},{images:[banner],banner});
 const bytes=await workbook.xlsx.writeBuffer(),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(bytes);
 const sheet=loaded.getWorksheet(type),[header,product]=sheet.getImages();
 // Source is the actual JPEG letterhead. Read its SOF dimensions independently.
 const jpeg=readFileSync('public/hrc-letterhead.jpg');let sourceWidth,sourceHeight;
 for(let i=2;i<jpeg.length-8;i++)if(jpeg[i]===255&&[192,194].includes(jpeg[i+1])){sourceHeight=jpeg.readUInt16BE(i+5);sourceWidth=jpeg.readUInt16BE(i+7);break;}
 assert.ok(sourceWidth&&sourceHeight);
 for(const image of [header,product])assert.ok(Math.abs(image.range.ext.width/image.range.ext.height-sourceWidth/sourceHeight)<0.00001);
 const column=type==='HRC'?9:5,cw=sheet.getColumn(column).width*7,rh=sheet.getRow(15).height*4/3;
 const x=product.range.tl.nativeColOff/9525,y=product.range.tl.nativeRowOff/9525;
 assert.equal(product.range.tl.nativeCol,column-1);assert.equal(product.range.tl.nativeRow,14);
 assert.ok(Math.abs(x-(cw-product.range.ext.width)/2)<.001);
 assert.ok(Math.abs(y-(rh-product.range.ext.height)/2)<.001);
 assert.ok(product.range.ext.width<=cw-8+.001&&product.range.ext.height<=rh-8+.001);
 const reserved=[1,2,3].reduce((n,r)=>n+sheet.getRow(r).height*4/3,0);
 assert.ok(Math.abs(reserved-header.range.ext.height-8)<.001,'header rows must grow to the original banner ratio');
});
