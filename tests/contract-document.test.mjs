import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as fflate from 'fflate';
import {saveCustomerContractProfile} from '../lib/customer-contract-profile.mjs';

globalThis.fflate=fflate;
globalThis.HrcPdf={amountInWords:value=>`Bằng chữ ${value}`};
(0,eval)(readFileSync('public/contract-document.js','utf8'));

test('contract document fills HĐKT values and payment terms from quotation notes',async()=>{
 const quote={quote_type:'B2B',quote_number:'BGTEST-001',quote_date:'2026-09-08',customer:{name:'CÔNG TY MẪU',address:'Cần Thơ',tax_code:'1800000000',contact_name:'nguyễn văn a'},subtotal:1000000,vat_amount:80000,total:1080000,notes:'- Thời gian giao hàng: Trong vòng 10 ngày sau khi chốt đơn.\n- Địa điểm giao hàng: Kho khách hàng tại Cần Thơ.\n- Phương thức thanh toán: Chuyển khoản.\n- Bên Mua tạm ứng 30% trị giá hợp đồng ngay sau khi ký.\n- 70% trị giá còn lại thanh toán trước khi nhận hàng.',items:[{name:'Ly mẫu',description:'Ly sứ',bundle_contents:'01 ly + 01 nắp',print_description:'In logo',packaging_description:'Hộp carton',quantity:2,unit:'Cái',unit_price:500000,line_total:1000000,tax_percent:8}]};
 const bytes=await ContractDocument.build({quote,contractNumber:'09-01/08092026/HĐKT/BN-KH001',templateBytes:readFileSync('public/mau-hop-dong-bach-ngan-hdkt.docx')});
 const documentXml=fflate.strFromU8(fflate.unzipSync(bytes)['word/document.xml']);
 for(const value of ['09-01/08092026/HĐKT/BN-KH001','CÔNG TY MẪU','Bên A thanh toán cho Bên B 30%','324.000','756.000','Thanh toán 70% giá trị còn lại','Trong vòng 10 ngày'])assert.ok(documentXml.includes(value));
 assert.equal((documentXml.match(/Bên A thanh toán cho Bên B 30%/g)||[]).length,1);
 assert.ok(documentXml.includes('nguyễn văn a'));
 assert.ok(documentXml.includes('NGUYỄN VĂN A'));
 assert.ok(documentXml.includes('Phương thức thanh toán: Chuyển khoản'));
 assert.equal(documentXml.includes('Ông Người đại diện'),false);
 assert.equal(documentXml.includes('&lt;&lt;'),false);
});

test('contract documents are separated into a customer-named ZIP folder',async()=>{
 const quote={quote_type:'B2B',quote_date:'2026-09-08',customer:{name:'CÔNG TY MẪU',address:'Cần Thơ',tax_code:'1800000000'},subtotal:1000000,vat_amount:80000,total:1080000,notes:'- Tạm ứng 30% ngay sau khi ký.',items:[{name:'Ly mẫu',quantity:2,unit_price:500000,line_total:1000000,tax_percent:8,packaging_description:'Hộp carton'}]};
 const templateFiles=[
  {name:'HOP_DONG_KINH_TE',templateBytes:readFileSync('public/mau-hop-dong-bach-ngan-hdkt.docx')},
  {name:'BIEN_BAN_BAN_GIAO_VA_NGHIEM_THU_SAN_PHAM',templateBytes:readFileSync('public/mau-hop-dong-bach-ngan-bien-ban.docx')},
  {name:'DE_NGHI_TAM_UNG',templateBytes:readFileSync('public/mau-hop-dong-bach-ngan-tam-ung.docx')}
 ];
 const archive=await ContractDocument.buildPack({quote,contractNumber:'09-01/08092026/HĐKT/BN-KH001',templateFiles});
 const files=fflate.unzipSync(archive.bytes),base='CÔNG TY MẪU_09_2026/';
 assert.equal(archive.folder,'CÔNG TY MẪU_09_2026');
 assert.deepEqual(Object.keys(files).sort(),[
  `${base}BIEN_BAN_BAN_GIAO_VA_NGHIEM_THU_SAN_PHAM_09-01-08092026-HĐKT-BN-KH001.docx`,
  `${base}DE_NGHI_TAM_UNG_09-01-08092026-HĐKT-BN-KH001.docx`,
  `${base}HOP_DONG_KINH_TE_09-01-08092026-HĐKT-BN-KH001.docx`
 ].sort());
 const acceptance=fflate.strFromU8(fflate.unzipSync(files[`${base}BIEN_BAN_BAN_GIAO_VA_NGHIEM_THU_SAN_PHAM_09-01-08092026-HĐKT-BN-KH001.docx`])['word/document.xml']);
 assert.ok(acceptance.includes('Hộp carton'));
 assert.equal(acceptance.includes('&lt;&lt;'),false);
});

test('contract document uses the quotation price after discount instead of the original list price',async()=>{
 const quote={quote_type:'B2B',quote_number:'BGTEST-PRICE',quote_date:'2026-09-16',customer:{name:'CÔNG TY MẪU',address:'Cần Thơ',tax_code:'1800000000'},subtotal:38401800,vat_amount:3072144,total:41473944,notes:'- Tạm ứng 30% ngay sau khi ký.',items:[{name:'Bình giữ nhiệt',quantity:200,unit:'Bộ',unit_price:356481,price_after_discount:192009,line_total:38401800,tax_percent:8}]};
 assert.equal(ContractDocument.contractUnitPrice(quote.items[0]),192009);
 const bytes=await ContractDocument.build({quote,contractNumber:'09-03/16092026/HĐKT/BN-KH001',templateBytes:readFileSync('public/mau-hop-dong-bach-ngan-hdkt.docx')});
 const documentXml=fflate.strFromU8(fflate.unzipSync(bytes)['word/document.xml']);
 assert.ok(documentXml.includes('192.009,00'));
 assert.equal(documentXml.includes('356.481'),false);
});

test('contract document keeps exact unit price with two decimals',async()=>{
 const quote={quote_type:'HRC',quote_number:'BGHRC-PRICE',quote_date:'2026-09-26',customer:{name:'CÔNG TY MẪU',address:'Cần Thơ',tax_code:'1800000000'},subtotal:1339200,vat_amount:107136,total:1446336,notes:'- Tạm ứng 30% ngay sau khi ký.',items:[{name:'Dĩa lót tách 12.5 cm Came Hương biển kem (041264089) - Came - HB kem - L1',quantity:18,unit:'Cái',unit_price:93000,price_after_discount:74400,line_total:1339200,tax_percent:8}]};
 assert.equal(ContractDocument.contractUnitPrice(quote.items[0]),74400);
 const bytes=await ContractDocument.build({quote,contractNumber:'09-16/28092026/HĐKT/BN-TTBM',templateBytes:readFileSync('public/mau-hop-dong-bach-ngan-hdkt.docx')});
 const documentXml=fflate.strFromU8(fflate.unzipSync(bytes)['word/document.xml']);
 assert.ok(documentXml.includes('74.400,00'));
 assert.equal(documentXml.includes('74.000'),false);
});

test('contract document product description does not repeat product name and keeps line breaks',async()=>{
 const productName='Bộ trà 1.3 L Hoàng cung Hồn Việt (01134003803) - Hoang Cung - Honviet - L1';
 const quote={quote_type:'B2B',quote_number:'BGTEST-DESC',quote_date:'2026-09-28',customer:{name:'CÔNG TY MẪU',address:'Cần Thơ',tax_code:'1800000000'},subtotal:1000000,vat_amount:80000,total:1080000,notes:'- Tạm ứng 30% ngay sau khi ký.',items:[{name:productName,description:productName,print_description:'In ấn logo như thiết kế được phê duyệt.',packaging_description:'theo tiêu chuẩn nhà sản xuất',quantity:1,unit:'Bộ',unit_price:1000000,line_total:1000000,tax_percent:8}]};
 for(const template of ['public/mau-hop-dong-bach-ngan-hdkt.docx','public/mau-hop-dong-bach-ngan-bien-ban.docx']){
  const bytes=await ContractDocument.build({quote,contractNumber:'09-06/28092026/HĐKT/BN-KH001',templateBytes:readFileSync(template)});
  const documentXml=fflate.strFromU8(fflate.unzipSync(bytes)['word/document.xml']);
  assert.equal((documentXml.match(new RegExp(productName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length,1);
  assert.ok(documentXml.includes('In ấn: In ấn logo như thiết kế được phê duyệt.'));
  assert.ok(documentXml.includes('Đóng gói: theo tiêu chuẩn nhà sản xuất'));
  assert.ok(documentXml.includes('<w:br/>'));
 }
});

test('Vigifts contract pack uses the approved dynamic templates',async()=>{
 const quote={quote_type:'VIGIFTS',quote_date:'2026-09-16',customer:{name:'CÔNG TY KHÁCH TEST VIGIFTS',address:'Cần Thơ',tax_code:'1801234567',contact_name:'Trần Thị B'},subtotal:2500000,vat_amount:200000,total:2700000,notes:'- Bên Mua tạm ứng 30% trị giá hợp đồng ngay sau khi ký.',items:[{name:'Sản phẩm VIGIFTS TEST',quantity:5,unit:'Cái',unit_price:500000,line_total:2500000,tax_percent:8,packaging_description:'Hộp quà'}]};
 const templateFiles=[
  {name:'HOP_DONG_KINH_TE_VIGIFTS',templateBytes:readFileSync('public/mau-hop-dong-vigifts-hdkt.docx')},
  {name:'BIEN_BAN_BAN_GIAO_VA_NGHIEM_THU_SAN_PHAM_VIGIFTS',templateBytes:readFileSync('public/mau-hop-dong-vigifts-bien-ban.docx')},
  {name:'DE_NGHI_TAM_UNG_VIGIFTS',templateBytes:readFileSync('public/mau-hop-dong-vigifts-tam-ung.docx')}
 ];
 const archive=await ContractDocument.buildPack({quote,contractNumber:'16-01/16092026/HĐKT/VIGIFTS-KH001',templateFiles});
 const documents=Object.values(fflate.unzipSync(archive.bytes)).map(file=>fflate.strFromU8(fflate.unzipSync(file)['word/document.xml']));
 assert.equal(documents.length,3);
 for(const documentXml of documents) assert.equal(documentXml.includes('&lt;&lt;'),false);
 const contract=documents.find(documentXml=>documentXml.includes('Sản phẩm VIGIFTS TEST'));
 assert.ok(contract.includes('CÔNG TY KHÁCH TEST VIGIFTS'));
 assert.equal(contract.includes('0100150619-052'),false);
});

test('contract document requires a deposit percentage in quotation notes',()=>{
 assert.throws(()=>ContractDocument.paymentDetails({total:1000000,notes:'- Phương thức thanh toán: Chuyển khoản.'}),/tỷ lệ thanh toán trước/);
});

test('contract document uses current quotation payment rate before old saved profile rate',()=>{
 const quote={total:13219200,notes:'- Phương thức thanh toán: Chuyển khoản.\n- Bên Mua tạm ứng 50% trị giá hợp đồng ngay sau khi ký.\n- 50% trị giá còn lại thanh toán trước khi nhận hàng.'};
 const payment=ContractDocument.paymentDetails(quote,{depositRate:30,paymentTerms:'Không dùng trường này để gán HĐKT.'});
 assert.equal(payment.depositRate,50);
 assert.equal(payment.deposit,6609600);
 assert.equal(payment.remaining,6609600);
});

test('B2B and HRC contract documents use the form deposit rate before old quotation notes',()=>{
 for(const quoteType of ['B2B','HRC']){
  const quote={quote_type:quoteType,total:13219200,notes:'- Phương thức thanh toán: Chuyển khoản.\n- Bên Mua tạm ứng 30% trị giá hợp đồng ngay sau khi ký.\n- 70% trị giá còn lại thanh toán trước khi nhận hàng.'};
  const payment=ContractDocument.paymentDetails(quote,{depositRate:50,paymentTerms:'Ô nhập trong form HĐKT.'});
  assert.equal(payment.depositRate,50);
  assert.equal(payment.deposit,6609600);
  assert.equal(payment.remaining,6609600);
 }
});

test('contract document uses saved profile keys for representative and delivery details',async()=>{
 const quote={quote_type:'B2B',quote_number:'BGTEST-PROFILE',quote_date:'2026-09-21',customer:{name:'CÔNG TY MẪU',address:'Cần Thơ',tax_code:'1800000000',contact_name:'Liên hệ cũ'},subtotal:1000000,vat_amount:80000,total:1080000,notes:'- Thời gian giao hàng: Ghi chú cũ.\n- Địa điểm giao hàng: Địa điểm cũ.\n- Tạm ứng 30% ngay sau khi ký.',items:[]};
 const details={representativeName:'Ông Nguyễn Đại Diện',representativeTitle:'Giám đốc',deliveryTime:'Trong 15 ngày sau khi duyệt mẫu',deliveryAddress:'Kho nhận hàng mới',depositRate:30,paymentDays:7};
 const bytes=await ContractDocument.build({quote,contractNumber:'09-05/21092026/HĐKT/BN-KH001',details,templateBytes:readFileSync('public/mau-hop-dong-bach-ngan-hdkt.docx')});
 const documentXml=fflate.strFromU8(fflate.unzipSync(bytes)['word/document.xml']);
 for(const value of ['Ông Nguyễn Đại Diện','Giám đốc','Trong 15 ngày sau khi duyệt mẫu','Kho nhận hàng mới'])assert.ok(documentXml.includes(value));
 assert.equal(documentXml.includes('Ghi chú cũ'),false);
 assert.equal(documentXml.includes('Địa điểm cũ'),false);
 assert.equal(documentXml.includes('&lt;&lt;'),false);
});

test('contract document accepts full payment before delivery',async()=>{
 const quote={quote_type:'B2B',quote_number:'BGTEST-100',quote_date:'2026-09-10',customer:{name:'CÔNG TY MẪU',address:'Cần Thơ',tax_code:'1800000000'},subtotal:1000000,vat_amount:80000,total:1080000,notes:'- Thanh toán trước 100% trước khi giao hàng.',items:[]};
 const details={depositRate:100,paymentDays:0};
 const payment=ContractDocument.paymentDetails(quote,details);
 assert.equal(payment.deposit,1080000);assert.equal(payment.remaining,0);
 const bytes=await ContractDocument.build({quote,contractNumber:'09-02/10092026/HĐKT/BN-KH001',details,templateBytes:readFileSync('public/mau-hop-dong-bach-ngan-hdkt.docx')});
 const documentXml=fflate.strFromU8(fflate.unzipSync(bytes)['word/document.xml']);
 assert.ok(documentXml.includes('Thanh toán trước 100% giá trị hợp đồng trước khi giao hàng'));
 assert.equal(documentXml.includes('Thanh toán còn lại 0'),false);
});

test('customer contract profile stores a zero percent advance payment',async()=>{
 let stored;
 const db={prepare:sql=>({bind:(...values)=>({first:async()=>sql.startsWith('SELECT id')?{id:'KH1'}:null,run:async()=>{stored=JSON.parse(values[1]);return {success:true};}})})};
 const input={customerId:'KH1',depositRate:0,paymentDays:0,paymentTerms:''};
 const result=await saveCustomerContractProfile(db,input);
 assert.equal(result.profile.depositRate,0);assert.equal(stored.depositRate,0);
 await assert.rejects(()=>saveCustomerContractProfile(db,{...input,depositRate:101}),/từ 0 đến 100%/);
});

test('contract document supports zero percent advance payment',async()=>{
 const quote={quote_type:'B2B',quote_number:'BGTEST-0',quote_date:'2026-09-10',customer:{name:'CÔNG TY MẪU',address:'Cần Thơ',tax_code:'1800000000'},subtotal:1000000,vat_amount:80000,total:1080000,notes:'- Thanh toán sau khi giao hàng.',items:[]};
 const details={depositRate:0,paymentDays:15};
 const payment=ContractDocument.paymentDetails(quote,details);
 assert.equal(payment.depositRate,0);assert.equal(payment.deposit,0);assert.equal(payment.remaining,1080000);
 const bytes=await ContractDocument.build({quote,contractNumber:'09-04/10092026/HĐKT/BN-KH001',details,templateBytes:readFileSync('public/mau-hop-dong-bach-ngan-hdkt.docx')});
 const documentXml=fflate.strFromU8(fflate.unzipSync(bytes)['word/document.xml']);
 assert.ok(documentXml.includes('Thanh toán 100% giá trị hợp đồng sau khi giao hàng và nhận đủ chứng từ thanh toán'));
 assert.ok(documentXml.includes('chậm nhất trong 15 ngày'));
});
