globalThis.StockFile={
 normalize(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]/g,'');},
 header(rows){return rows.slice(0,200).findIndex(row=>row.some(v=>['sku','masku','mahang','masanpham'].includes(this.normalize(v))));},
 parse(rows,header,skuColumn,mapping,hiddenRows=[]){
  const bySku=new Map();let blanks=0,hidden=0,duplicates=0;
  for(let i=header+1;i<rows.length;i++){
   if(hiddenRows[i]?.hidden){hidden++;continue;}
   const row=rows[i]||[],sku=String(row[skuColumn]??'').trim();if(!sku)continue;
   const key=sku.toLowerCase(),existing=bySku.get(key);if(existing)duplicates++;
   const stock={};for(const [warehouse,column]of Object.entries(mapping)){
    let value=row[column];if(value===null||value===undefined||String(value).trim()===''){blanks++;continue;}
    if(typeof value==='string'){value=value.trim().replace(/\s/g,'');if(value.includes(','))value=value.replace(/\./g,'').replace(',','.');else if(/^-?\d{1,3}(?:\.\d{3})+$/.test(value))value=value.replace(/\./g,'');}
    if(typeof value!=='number'&&!/^-?\d+(?:\.\d+)?$/.test(String(value).trim()))throw Error(`Dòng ${i+1}, ${warehouse}: số tồn không hợp lệ. Dùng ô số trong Excel.`);
    const number=Number(value);if(!Number.isFinite(number)||Math.abs(number)>1e12)throw Error(`Dòng ${i+1}: số tồn quá lớn.`);stock[warehouse]=Math.sign(number)*Math.floor(Math.abs(number)+0.5);
   }
   if(!Object.keys(stock).length)continue;
   if(!existing){bySku.set(key,{sku,stock});continue;}
   // A repeated SKU in an inventory export is another snapshot; retain its highest count per warehouse.
   for(const [warehouse,value]of Object.entries(stock))if(!(warehouse in existing.stock)||value>existing.stock[warehouse])existing.stock[warehouse]=value;
  }
  return {rows:[...bySku.values()],blanks,hidden,duplicates};
 }
};
