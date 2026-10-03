import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('supplier forms prefer Sapo supplier options and fall back to Minh Long I for internal orders',async()=>{
 const source=await readFile(new URL('../public/incoming-stock-ui.js',import.meta.url),'utf8');
 const apiSource=await readFile(new URL('../lib/staff-api.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("const minhLongSupplierName='CÔNG TY TNHH MINH LONG I'"));
 assert.ok(source.includes('const shouldDefaultMinhLongSupplier=items=>items.length>0&&items.every(isMinhLongFamilyItem);'));
 assert.ok(source.includes("Chọn nhà cung cấp từ Sapo"));
 assert.ok(source.includes("Không tải được NCC từ Sapo"));
 assert.ok(source.includes('Tạm dùng NCC Minh Long I để lập phiếu nội bộ'));
 assert.ok(apiSource.includes("suppliers:[{id:'',name:'CÔNG TY TNHH MINH LONG I',fallback:true}]"));
 assert.ok(source.includes("button.disabled=false;button.textContent='Xác nhận tạo đơn nhập Sapo'"));
});
