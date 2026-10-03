let exportReady:Promise<void>|null=null;
export function loadExport(){return exportReady||(exportReady=(async()=>{for(const src of ['/fflate.min.js','/hrc-pdf.js','/contract-word-edit.js','/contract-document.js?v=delivery-date-20261003'])await new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=()=>resolve();s.onerror=()=>{s.remove();reject(Error('Chưa tải được công cụ xuất hồ sơ. Vui lòng thử lại.'));};document.head.appendChild(s);});})().catch(e=>{exportReady=null;throw e;}));}
export async function authorizeContractExport(record:{id:string,revision:number}){
 const response=await fetch('/api/staff/quotes/'+encodeURIComponent(record.id)+'/contract-approval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'export',revision:record.revision})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Chưa được phép xuất HĐKT.');return result;
}
