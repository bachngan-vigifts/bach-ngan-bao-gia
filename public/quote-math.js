(function(root){
  const rate=(r,s)=>Number.isFinite(r.taxRate)?r.taxRate:Number(s.vat||0);
  const discounted=r=>Math.max(0,Number(r.price||0)-(r.discountType==='amount'?Number(r.discount||0):Number(r.price||0)*Number(r.discount||0)/100));
  const after=(r,s)=>discounted(r)+(s.type!=='HRC'?Number(r.printFee||0):0);
  const totals=s=>{let subtotal=0,tax=0;const rates=new Set();for(const r of s.rows){const line=after(r,s)*Number(r.qty||0),vat=rate(r,s);subtotal+=line;tax+=line*vat/100;rates.add(vat)}return{subtotal,tax,total:subtotal+tax,label:rates.size>1?'Thuế VAT theo sản phẩm':`Thuế VAT ${rates.size?[...rates][0]:s.vat||0}%`}};
  const printingWorkshops=['Xưởng in Tiến phát','Thương Bé Ba','Trọng Tín','Xưởng in Hạnh Nguyên (Anh Liêm)','Minh Long'];
  const printingInfo=s=>{
    const rows=(s.rows||[]).filter(row=>Number(row.printFee)>0&&Number(row.qty)>0);
    const enabled=['B2B','VIGIFTS'].includes(s.type)&&rows.length>0;
    const minhLong=rows.length>0&&rows.every(row=>/minh long|healthy cook|su duong sinh/.test(normalize(`${row.brand||''} ${row.name||''}`)));
    return {enabled,defaultWorkshop:minhLong?printingWorkshops[0]:printingWorkshops[1]};
  };
  const profit=(s,shippingFee=null)=>{
    const revenue=totals(s).subtotal,cost=s.rows.reduce((sum,row)=>sum+(Number(row.costPrice)||0)*Number(row.qty||0),0);
    const shippingCost=s.shipping?.payer==='sender'&&Number.isFinite(shippingFee)?Math.max(0,shippingFee):0;
    const hasLineCosts=s.rows.some(row=>row.printing&&Number.isFinite(row.printing.unitPrice));
    const printingCost=printingInfo(s).enabled?(hasLineCosts?s.rows.reduce((sum,row)=>sum+Math.round(Math.max(0,Number(row.printing?.unitPrice)||0)*Math.max(0,Number(row.qty)||0)),0):Math.max(0,Number(s.printing?.totalCost)||0)):0;
    const gross=revenue-cost-shippingCost-printingCost;
    return {revenue,cost,shippingCost,printingCost,gross,margin:revenue?gross/revenue*100:0};
  };
  const netPrice=(raw,tax,included)=>included?raw/(1+tax/100):raw;
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
  const defaultCostDiscount=product=>{
    const text=normalize([product?.brand,product?.name,product?.sku,product?.pattern].filter(Boolean).join(' '));
    if(!text)return null;
    if(text.includes('healthy cook'))return 15;
    if(/\blys\b/.test(text)||text.includes('minh long - lys'))return 19;
    if(/\blocknlock\b/.test(text)||/\block n lock\b/.test(text)||text.includes('lock&lock')||text.includes('lock & lock')||/\block\b/.test(text))return 58;
    if(text.includes('minh long'))return 25;
    return null;
  };
  const purchasePrice=(price,discount)=>{const value=Number(price)||0,percent=Number(discount);return value<=0||!Number.isFinite(percent)?0:Math.round(value*(100-Math.min(100,Math.max(0,percent)))/100)};
  const defaultCostPrice=(product,price)=>{const discount=defaultCostDiscount(product);return discount===null?0:purchasePrice(price,discount)};
  const customerDiscount=(brand,discounts={},mode='percent',price=0)=>{
    const normalized=normalize(brand);
    const key=normalized==='minh long - lys'?'lys':['minh long','minh long i'].includes(normalized)?'minhLong':['lock','locknlock','lock&lock','lock & lock'].includes(normalized)?'lock':null;
    const percent=key&&discounts?.[key];
    return typeof percent==='number'&&Number.isFinite(percent)&&percent>=0&&percent<=100?(mode==='amount'?price*percent/100:percent):0;
  };
  root.QuoteMath={printingInfo,printingWorkshops,rate,after,totals,profit,netPrice,discounted,customerDiscount,defaultCostDiscount,purchasePrice,defaultCostPrice};
})(globalThis);
