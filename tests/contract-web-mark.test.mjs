import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as fflate from 'fflate';
globalThis.fflate=fflate;
globalThis.HrcPdf={amountInWords:()=>''};
(0,eval)(readFileSync('public/contract-document.js','utf8'));
for(const [entity,code,type] of [['bach-ngan','BN','B2B'],['vigifts','VG','VIGIFTS']]){
 for(const [suffix,documentType] of [['hdkt','HDKT'],['bien-ban','BBNT'],['tam-ung','TAM_UNG']]){
  test(`web source marker survives export for ${entity} ${documentType}`,async()=>{
   const template=readFileSync(`public/mau-hop-dong-${entity}-${suffix}.docx`);
   const bytes=await ContractDocument.build({quote:{quote_type:type,quote_date:'2026-10-02',customer:{name:'Khách thử'},items:[],subtotal:0,total:0,vat_amount:0},contractNumber:'TEST-001',details:{depositRate:30},documentType,templateBytes:template});
   const files=fflate.unzipSync(bytes),document=fflate.strFromU8(files['word/document.xml']);
   const footer=fflate.strFromU8(files['word/footerWebSource.xml']);
   assert.ok(footer.includes(`WEB-${code}-${documentType}-20261002`));
   assert.ok(footer.includes('Xuất từ web báo giá'));
   assert.ok(fflate.strFromU8(files['[Content_Types].xml']).includes('/word/footerWebSource.xml'));
   const rels=fflate.strFromU8(files['word/_rels/document.xml.rels']);
   assert.ok(rels.includes('Target="footerWebSource.xml"'));
   for(const section of document.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)){
    for(const variant of ['default','first','even'])assert.ok(section[0].includes(`w:type="${variant}" r:id="rIdWebSource"`));
   }
   const before=fflate.unzipSync(template);
   for(const path of Object.keys(before).filter(path=>path.startsWith('word/media/')))assert.deepEqual(files[path],before[path]);
  });
 }
}
