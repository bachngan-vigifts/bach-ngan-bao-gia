import {QuotationError} from './quotation-store.mjs';

// Photon supports search-as-you-type. Public Nominatim explicitly does not.
// https://github.com/komoot/photon/blob/master/docs/api-v1.md
const cache=new Map(), pending=new Map(), ttl=10*60*1000;
export async function searchAddresses(query,request=fetch,env={}) {
 const q=typeof query==='string'?query.trim().replace(/\s+/g,' '):'';
 if(q.length<3||q.length>250)throw new QuotationError(400,'Nhập địa chỉ từ 3 đến 250 ký tự, kèm quận/huyện và tỉnh/thành phố.');
 const endpoint=env.ADDRESS_SEARCH_URL||'https://photon.komoot.io/api/';
 const key=endpoint+'|'+q.toLocaleLowerCase('vi');
 const saved=cache.get(key);if(saved&&saved.expires>Date.now())return saved.value;
 if(pending.has(key))return pending.get(key);
 const run=(async()=>{
  const url=new URL(endpoint);url.searchParams.set('q',q);url.searchParams.set('limit','8');url.searchParams.set('countrycode','VN');url.searchParams.set('bbox','102,8,110,24');
  let data;
  try{
   const response=await request(url.href,{headers:{Accept:'application/json','User-Agent':'BachNganQuote/1.0 (https://bach-ngan-bao-gia.lucky-thyme-5212.chatgpt.site)'},signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('provider unavailable');data=await response.json();
   if(!Array.isArray(data.features))throw Error('invalid response');
  }catch{throw new QuotationError(502,'Dịch vụ tìm địa chỉ đang bận. Bấm Tìm địa chỉ để thử lại.');}
  const matches=[],seen=new Set();
  for(const f of data.features){
   const p=f.properties||{},[lng,lat]=f.geometry?.coordinates||[];
   if(String(p.countrycode).toUpperCase()!=='VN'||typeof lat!=='number'||typeof lng!=='number'||!Number.isFinite(lat)||!Number.isFinite(lng)||lat<8||lat>24||lng<102||lng>110)continue;
   const street=[p.housenumber,p.street].filter(Boolean).join(' ');
   const parts=[p.name,street,p.locality,p.district,p.city,p.county,p.state,p.country].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim());
   const label=[...new Set(parts)].join(', ').slice(0,700);
   const id=label+'|'+lat+'|'+lng;if(!label||seen.has(id))continue;seen.add(id);matches.push({label,lat,lng});
  }
  const value={matches:matches.slice(0,8)};
  if(cache.size>=100)cache.delete(cache.keys().next().value);
  cache.set(key,{value,expires:Date.now()+ttl});return value;
 })();
 pending.set(key,run);try{return await run;}finally{pending.delete(key);}
}
