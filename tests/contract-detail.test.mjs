import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as fflate from 'fflate';
import {quotePayloadFromData,applyDetailsToQuote} from '../lib/contract-detail.mjs';
globalThis.fflate=fflate;
(0,eval)(readFileSync('public/hrc-pdf.js','utf8'));
(0,eval)(readFileSync('public/contract-document.js','utf8'));
const data={type:'B2B',quoteNo:'BG-TEST',date:'2026-10-03',customer:'Khách gốc',notes:'- Giao theo lịch.\n- Thanh toán trước 20%',vat:8,rows:[{sku:'LY01',name:'Ly sứ',qty:2,price:100000,discount:10,discountType:'percent',taxRate:8,printFee:5000}],contractDocument:{contractNumber:'HD-01',details:{name:'CÔNG TY KIỂM THỬ',customerCode:'KH01',taxCode:'1800000000',address:'Cần Thơ',representativeName:'Nguyễn Văn A',representativeTitle:'Giám đốc',depositRate:30,paymentDays:15,deliveryAddress:'Kho khách hàng',deliveryTime:'10 ngày',paymentMethod:'Chuyển khoản'}}};
test('detail uses same payload and totals as existing download, without mutating source',()=>{
 const source=readFileSync('public/contract-download-ui.js','utf8');const start=source.indexOf('  function quotePayloadFromData(data)'),end=source.indexOf('  async function profileFor',start);
 const old=new Function('clone','QuoteMath','HrcPdf',source.slice(start,end)+';return quotePayloadFromData;')(structuredClone,globalThis.QuoteMath,globalThis.HrcPdf);
 const before=JSON.stringify(data);assert.deepEqual(quotePayloadFromData(data),old(data));assert.equal(quotePayloadFromData(data).total,205200);assert.equal(JSON.stringify(data),before);
});
test('saved details produce actual contract and three-document archive',async()=>{
 const q=applyDetailsToQuote(quotePayloadFromData(data),data.contractDocument.details);
 const files=[['HDKT','hdkt'],['BBNT','bien-ban'],['TAM_UNG','tam-ung']].map(([file,name])=>({file,name,templateBytes:readFileSync('public/mau-hop-dong-bach-ngan-'+name+'.docx')}));
 const pack=await globalThis.ContractDocument.buildPack({quote:q,contractNumber:'HD-01',details:data.contractDocument.details,templateFiles:files});
 const archive=fflate.unzipSync(pack.bytes);assert.equal(Object.keys(archive).length,3);
 const doc=fflate.strFromU8(fflate.unzipSync(archive['HDKT.docx'])['word/document.xml']);
 assert.ok(doc.includes('CÔNG TY KIỂM THỬ'));assert.ok(doc.includes('HD-01'));assert.ok(doc.includes('30%'));assert.ok(doc.includes('61.560'));
});
