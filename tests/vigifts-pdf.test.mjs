import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import fontkit from '@pdf-lib/fontkit';

function loadPdfRuntime() {
  vm.runInThisContext(readFileSync('public/pdf-lib.min.js', 'utf8'), {filename: 'pdf-lib.min.js'});
  vm.runInThisContext(readFileSync('public/quote-math.js', 'utf8'), {filename: 'quote-math.js'});
  vm.runInThisContext(readFileSync('public/hrc-pdf.js', 'utf8'), {filename: 'hrc-pdf.js'});
  vm.runInThisContext(readFileSync('public/editable-pdf.js', 'utf8'), {filename: 'editable-pdf.js'});
  globalThis.fontkit = fontkit;
}

function mockFontFetch() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => ({
    ok: true,
    arrayBuffer: async () => {
      const data = readFileSync(join('public', String(url)));
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    },
  });
  return () => { globalThis.fetch = originalFetch; };
}

async function drawnTextFor(state) {
  const drawn = [];
  const originalCreate = globalThis.PDFLib.PDFDocument.create;
  globalThis.PDFLib.PDFDocument.create = async (...args) => {
    const pdf = await originalCreate.apply(globalThis.PDFLib.PDFDocument, args);
    const originalAddPage = pdf.addPage.bind(pdf);
    pdf.addPage = (...pageArgs) => {
      const page = originalAddPage(...pageArgs);
      const originalDrawText = page.drawText.bind(page);
      page.drawText = (value, options) => {
        drawn.push(String(value ?? ''));
        return originalDrawText(value, options);
      };
      return page;
    };
    return pdf;
  };
  try {
    await globalThis.EditableQuotePdf.create({state, images: [null], banner: null});
    return drawn.join('\n');
  } finally {
    globalThis.PDFLib.PDFDocument.create = originalCreate;
  }
}

test('VIGIFTS PDF prints the per-item discount and print fee', async () => {
  loadPdfRuntime();
  const restoreFetch = mockFontFetch();
  try {
    const state = {
      type: 'VIGIFTS', quoteNo: 'BGVG-TEST', date: '2026-09-10', customer: 'Khách hàng', contact: '', phone: '', email: '', owner: 'Nhân viên', ownerPhone: '', vat: 8, notes: '',
      rows: [{sku: 'SP01', name: 'Sản phẩm', unit: 'Cái', qty: 10, price: 100000, discount: 10, discountType: 'percent', printFee: 25000, printDescription: 'In logo'}],
    };
    const text = await drawnTextFor(state);
    assert.match(text, /CK/);
    assert.match(text, /10%/);
    assert.match(text, /25\.000,00/);
  } finally {
    restoreFetch();
  }
});

test('B2B editable PDF honors the show or hide discount column choice', async () => {
  loadPdfRuntime();
  const restoreFetch = mockFontFetch();
  try {
    const base = {
      type: 'B2B', quoteNo: 'BGB2B-TEST', date: '2026-10-01', customer: 'Khách hàng', contact: '', phone: '', email: '', owner: 'Nhân viên', ownerPhone: '', vat: 8, notes: '',
      rows: [{sku: 'SP01', name: 'Sản phẩm', unit: 'Cái', qty: 10, price: 100000, discount: 10, discountType: 'percent', printFee: 5000, printDescription: 'In logo'}],
    };
    const shown = await drawnTextFor({...base, hideB2bDiscountColumn: false});
    assert.match(shown, /CK/);
    assert.match(shown, /10%/);

    const hidden = await drawnTextFor({...base, hideB2bDiscountColumn: true});
    assert.doesNotMatch(hidden, /CK/);
    assert.doesNotMatch(hidden, /10%/);
  } finally {
    restoreFetch();
  }
});
