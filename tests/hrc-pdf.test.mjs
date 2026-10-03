import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

vm.runInThisContext(readFileSync('public/quote-math.js', 'utf8'), {filename: 'quote-math.js'});
vm.runInThisContext(readFileSync('public/hrc-pdf.js', 'utf8'), {filename: 'hrc-pdf.js'});

test('HRC PDF table follows the quotation product columns', () => {
  const drawn = [];
  const context = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'left', textBaseline: 'alphabetic',
    fillRect() {}, strokeRect() {}, drawImage() {}, translate() {},
    measureText(value) { return {width: String(value).length * 8}; },
    fillText(value) { drawn.push(String(value)); },
  };
  const state = {
    type: 'HRC', quoteNo: 'BGHRC-TEST', date: '2026-09-16', customer: 'Khách hàng', contact: '', phone: '', owner: '', ownerPhone: '', vat: 8, notes: '',
    rows: [{sku: 'SP-01', name: 'Sản phẩm mẫu', unit: 'Cái', qty: 18, price: 93000, discount: 20, discountType: 'percent', taxRate: 8}],
  };
  HrcPdf.createPages({state, images: [null], banner: {width: 100, height: 20}, createCanvas: () => ({getContext: () => context})});
  for (const header of ['HÌNH ẢNH', 'SẢN PHẨM /', 'MÃ HÀNG', 'CK', 'ĐƠN GIÁ', 'THÀNH TIỀN']) assert.ok(drawn.includes(header), `missing ${header}`);
  assert.ok(drawn.includes('20%'));
  assert.ok(drawn.includes('74.400,00'));
  assert.equal(drawn.includes('74.000'), false);
  assert.ok(drawn.includes('Mã hàng: SP-01'));
  assert.equal(drawn.includes('Product Code/'), false);
});

test('B2B PDF can show or hide the discount column', () => {
  const draw = state => {
    const drawn = [];
    const context = {
      font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'left', textBaseline: 'alphabetic',
      fillRect() {}, strokeRect() {}, drawImage() {}, translate() {},
      measureText(value) { return {width: String(value).length * 8}; },
      fillText(value) { drawn.push(String(value)); },
    };
    HrcPdf.createPages({state, images: [null], banner: {width: 100, height: 20}, createCanvas: () => ({getContext: () => context})});
    return drawn;
  };
  const base = {
    type: 'B2B', quoteNo: 'BGB2B-TEST', date: '2026-09-30', customer: 'Khách hàng', contact: '', phone: '', email: '', owner: '', ownerPhone: '', vat: 8, notes: '',
    rows: [{sku: 'SP-01', name: 'Sản phẩm mẫu', unit: 'Cái', qty: 10, price: 100000, discount: 10, discountType: 'percent', printFee: 5000, taxRate: 8}],
  };
  const shown = draw({...base, hideB2bDiscountColumn: false});
  assert.ok(shown.includes('CK'));
  assert.ok(shown.includes('10%'));
  assert.ok(shown.includes('95.000,00'));

  const hidden = draw({...base, hideB2bDiscountColumn: true});
  assert.equal(hidden.includes('CK'), false);
  assert.equal(hidden.includes('10%'), false);
  assert.ok(hidden.includes('95.000,00'));
});
