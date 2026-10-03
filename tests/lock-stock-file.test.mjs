import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../public/stock-file.js';

test('Lock workbook selects SKU, ignores other fields and skips hidden rows before validation',()=>{
 const context={};vm.createContext(context);vm.runInContext(readFileSync('public/xlsx.full.min.js','utf8'),context);const {XLSX}=context;
 const book=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet([[],['MÃ HÀNG','Material code','DIỄN GIẢI','GIÁ','TỒN'],['A','wrong','name',113000,'1.541'],['A','wrong','hidden',200,'INVALID'],['B','wrong','name',20,'49,7'],['C','','',30,0]]);
 ws['!rows']=[];ws['!rows'][3]={hidden:true};XLSX.utils.book_append_sheet(book,ws,'Lock');
 const loaded=XLSX.read(XLSX.write(book,{type:'array',bookType:'xlsx'}),{type:'array',cellStyles:true}),sheet=loaded.Sheets.Lock;
 const rows=XLSX.utils.sheet_to_json(sheet,{header:1,range:0,defval:null,raw:true,blankrows:true});
 assert.equal(StockFile.header(rows),1);
 const result=StockFile.parse(rows,1,0,{NCC:4},sheet['!rows']);
 assert.equal(result.hidden,1);
 assert.deepEqual(result.rows,[{sku:'A',stock:{NCC:1541}},{sku:'B',stock:{NCC:50}},{sku:'C',stock:{NCC:0}}]);
});
