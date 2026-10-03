import {createHash} from 'node:crypto';
const ROOT='media-v1/';
const INDEX=ROOT+'index.json';
const JOB=ROOT+'migration.json';
const BASE='https://baogia.minhlongonline.com/api/staff/media-file?key=';
const hash=value=>createHash('sha256').update(value).digest('hex');
const types=new Set(['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword']);
const hosts=new Set(['sapo.dktcdn.net','bizweb.dktcdn.net','drive.google.com','drive.usercontent.google.com','lh3.googleusercontent.com','www.appsheet.com','appsheet.com','cdn.haitrieu.com','toyotacantho.net.vn','xskthaugiang.vn','www.seabank.com.vn','www.vietcombank.com.vn']);
const field=k=>/^(image|images|image_url|imageUrl|image_source_path|logo|customerLogo|attachments?|files?|Ảnh|Hình ảnh|Logo|Đính kèm.*|Lưu HĐKT|fileUrl|file_url|designImage)$/i.test(k);
export const mediaId=hash;
const managed=value=>typeof value==='string'&&value.startsWith(BASE)&&/^[a-f0-9]{64}$/.test(value.slice(BASE.length));
const source=value=>typeof value==='string'&&!managed(value)&&(/^(https:\/\/|data:)/i.test(value)||/^[^?#]+\.(png|jpe?g|webp|gif|svg|pdf|docx?)$/i.test(value));
export function mediaSources(value, inherited=false, out=new Set()){
 if(typeof value==='string'){if(inherited&&source(value))out.add(value);return out;}
 if(Array.isArray(value)){for(const v of value)mediaSources(v,inherited,out);return out;}
 if(value&&typeof value==='object')for(const [k,v] of Object.entries(value))mediaSources(v,field(k)||(inherited&&['url','src','path','data'].includes(k)),out);
 return out;
}
export function rewriteMedia(value,index,inherited=false){
 if(typeof value==='string')return inherited&&index[hash(value)]?BASE+hash(value):value;
 if(Array.isArray(value))return value.map(v=>rewriteMedia(v,index,inherited));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewriteMedia(v,index,field(k)||(inherited&&['url','src','path','data'].includes(k)))]));
 return value;
}
const getJson=async(bucket,key,fallback)=>{const obj=await bucket.get(key);return obj?obj.json():fallback;};
const putJson=(bucket,key,value,options={})=>bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'},...options});
export async function mappedMediaResponse(response,bucket){
 if(!bucket||!response.ok||!response.headers.get('content-type')?.includes('application/json')||response.headers.has('content-disposition'))return response;
 const index=await getJson(bucket,INDEX,{});if(!Object.keys(index).length)return response;
 const data=await response.json(),headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');
 return new Response(JSON.stringify(rewriteMedia(data,index)),{status:response.status,headers});
}
async function limitedBytes(response){
 if(Number(response.headers.get('content-length'))>20000000)throw Error('Tệp vượt 20 MB');
 const reader=response.body.getReader(),parts=[];let n=0;
 for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>20000000){await reader.cancel();throw Error('Tệp vượt 20 MB');}parts.push(value);}
 return Buffer.concat(parts.map(p=>Buffer.from(p)),n);
}
function allowedUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&!['443'].includes(u.port)||!hosts.has(u.hostname))throw Error('Nguồn cần kết nối hoặc xác minh quyền truy cập');return u;}
export async function copyMedia(bucket,value,request=fetch){
 const id=hash(value),key=ROOT+'objects/'+id;
 let old=await bucket.get(key);
 if(old&&old.customMetadata?.sha256){const bytes=Buffer.from(await old.arrayBuffer());if(hash(bytes)!==old.customMetadata.sha256)throw Error('Tệp lưu trữ không khớp checksum');return {id,key,size:bytes.length,contentType:old.httpMetadata?.contentType};}
 let bytes,type;
 const ext=String(value).split('?')[0].match(/\.(png|webp|gif|svg)$/i)?.[1]?.toLowerCase()||'jpg';
 const cached=await bucket.get('vigifts-media/'+id+'.'+ext);
 if(cached){bytes=Buffer.from(await cached.arrayBuffer());type=cached.httpMetadata?.contentType||'image/jpeg';}
 else if(value.startsWith('data:')){
  const match=value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);if(!match||!types.has(match[1]))throw Error('Định dạng tệp không hỗ trợ');
  type=match[1];bytes=Buffer.from(match[2],'base64');
 }else{
  let u=allowedUrl(value),response;
  if(u.hostname==='drive.google.com'){
   const driveId=u.pathname.match(/\/d\/([\w-]+)/)?.[1]||u.searchParams.get('id');
   if(driveId&&!u.pathname.includes('thumbnail'))u=new URL('https://drive.usercontent.google.com/download?id='+encodeURIComponent(driveId)+'&export=download');
  }
  for(let step=0;step<5;step++){
   response=await request(u.href,{redirect:'manual',signal:AbortSignal.timeout(12000)});
   if(response.status>=300&&response.status<400){u=allowedUrl(new URL(response.headers.get('location'),u).href);continue;}break;
  }
  if(!response?.ok)throw Error('Không tải được nguồn ('+(response?.status||0)+')');
  type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();if(!types.has(type))throw Error('Nguồn trả về trang đăng nhập hoặc định dạng chưa hỗ trợ');
  bytes=await limitedBytes(response);
 }
 if(!bytes.length||bytes.length>20000000)throw Error('Dung lượng tệp không hợp lệ');
 const checksum=hash(bytes);
 await bucket.put(key,bytes,{httpMetadata:{contentType:type},customMetadata:{sha256:checksum}});
 const verified=await bucket.get(key);if(!verified||hash(Buffer.from(await verified.arrayBuffer()))!==checksum)throw Error('Chưa xác minh được bản sao R2');
 return {id,key,size:bytes.length,contentType:type};
}
export async function storeInlineProductImage(bucket,value){
 if(!value?.startsWith('data:'))return value;
 const saved=await copyMedia(bucket,value);return BASE+saved.id;
}
export async function serveMediaFile(bucket,key){
 if(!/^[a-f0-9]{64}$/.test(key||''))return new Response('Not found',{status:404});
 const object=await bucket.get(ROOT+'objects/'+key);if(!object)return new Response('Not found',{status:404});
 return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Content-Disposition':(object.httpMetadata?.contentType||'').startsWith('image/')?'inline':'attachment'}});
}
const tables=[{name:'product_edits',columns:['data']},{name:'vigifts_appsheet_rows',columns:['values_json','raw_json']},{name:'vigifts_product_image_map',columns:['image_url','image_source_path']},{name:'staff_quotations',columns:['data']}];
function status(job){if(!job)return {stage:'not_started'};return {stage:job.stage,scanned:job.scanned,total:job.sources.length,processed:job.processed,copied:job.copied,bytes:job.bytes,failed:job.failed.length,failures:job.failed.slice(0,30),updatedAt:job.updatedAt};}
export async function mediaMigrationStatus(bucket){return status(await getJson(bucket,JOB,null));}
export async function advanceMediaMigration(db,bucket){
 // Conditional lock prevents two open admin tabs from changing a shared cursor.
 const lockKey=ROOT+'lock',lock=await bucket.get(lockKey),stamp=Date.now();
 if(lock&&Number(await lock.text())>stamp-120000)throw Error('Một lượt chuyển đang chạy. Vui lòng chờ.');
 const taken=await bucket.put(lockKey,String(stamp),{onlyIf:lock?{etagMatches:lock.etag}:{etagDoesNotMatch:'*'}});if(!taken)throw Error('Một lượt chuyển đang chạy.');
 try{
 let job=await getJson(bucket,JOB,null);
 if(!job){
  const names=new Set(((await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results||[]).map(r=>r.name));
  job={stage:'scan',tables:tables.filter(t=>names.has(t.name)),table:0,offset:0,scanned:0,sources:[],processed:0,copied:0,bytes:0,failed:[]};
  const pointer=await getJson(bucket,'catalogs/current.json',null);
  if(pointer)job.sources=[...mediaSources(await getJson(bucket,pointer.key,{}))];
  // The image sheet is an established source used by /api/images in this app.
  try{
   const response=await fetch('https://docs.google.com/spreadsheets/d/1166xitL8s5Du4cWE194b6GCjhcC4zgF2XslelnGBfH4/export?format=csv&gid=959071204',{signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const csv=await response.text();if(/<html/i.test(csv.slice(0,500)))throw Error('Nguồn yêu cầu đăng nhập');
   const all=new Set(job.sources);for(const row of parseImageCsv(csv).slice(1))if(row[0]&&row[1])all.add(row[1].trim());job.sources=[...all];
  }catch(error){job.failed.push({id:'product-image-sheet',reason:'Chưa đọc được bảng ảnh sản phẩm: '+error.message});}

 }
 if(job.stage==='scan'){
  const t=job.tables[job.table];
  if(!t)job.stage='copy';
  else{
   const rows=(await db.prepare(`SELECT rowid AS _media_rowid,${t.columns.map(c=>'"'+c+'"').join(',')} FROM "${t.name}" ORDER BY rowid LIMIT 100 OFFSET ?`).bind(job.offset).all()).results||[];
   const sources=new Set(job.sources);
   for(const row of rows){
    for(const c of t.columns){let value=row[c];if(!value)continue;try{value=JSON.parse(value);}catch{value={[c]:value};}mediaSources(value,false,sources);
     if(t.name==='staff_quotations'&&value.r2Key)mediaSources(await getJson(bucket,value.r2Key,{}),false,sources);
    }
   }
   job.sources=[...sources];job.scanned+=rows.length;job.offset+=rows.length;if(rows.length<100){job.table++;job.offset=0;}
  }
 }else if(job.stage==='copy'){
  const index=await getJson(bucket,INDEX,{});
  const batch=job.sources.slice(job.processed,job.processed+8);
  const results=await Promise.allSettled(batch.map(s=>copyMedia(bucket,s)));
  for(let i=0;i<results.length;i++){
   const r=results[i];if(r.status==='fulfilled'){index[r.value.id]=r.value;job.copied++;job.bytes+=r.value.size;}
   else job.failed.push({id:hash(batch[i]),reason:r.reason?.message||'Không tải được tệp'});
  }
  await putJson(bucket,INDEX,index);job.processed+=batch.length;
  if(job.processed===job.sources.length){job.stage='compact';job.table=0;job.offset=0;}
 }else if(job.stage==='compact'){
  const t=job.tables[job.table];
  if(!t)job.stage=job.failed.length?'complete_with_errors':'complete';
  else{
   const index=await getJson(bucket,INDEX,{});
   const rows=(await db.prepare(`SELECT rowid AS _media_rowid,${t.columns.map(c=>'"'+c+'"').join(',')} FROM "${t.name}" ORDER BY rowid LIMIT 100 OFFSET ?`).bind(job.offset).all()).results||[];
   for(const row of rows)for(const c of t.columns){
    // Only remove inline payloads from D1. External references remain intact;
    // the read layer switches only verified copies to R2.
    if(!String(row[c]||'').includes('data:'))continue;
    let value;try{value=JSON.parse(row[c]);}catch{continue;}
    const rewritten=JSON.stringify(rewriteMedia(value,index));if(rewritten===row[c])continue;
    await putJson(bucket,ROOT+'originals/'+t.name+'/'+row._media_rowid+'/'+hash(row[c])+'.json',{column:c,original:row[c]});
    await db.prepare(`UPDATE "${t.name}" SET "${c}"=? WHERE rowid=? AND "${c}"=?`).bind(rewritten,row._media_rowid,row[c]).run();
   }
   job.offset+=rows.length;if(rows.length<100){job.table++;job.offset=0;}
  }
 }
 job.updatedAt=new Date().toISOString();await putJson(bucket,JOB,job);return status(job);
 }finally{await bucket.delete(lockKey);}
}

function parseImageCsv(text){const out=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))out.push(row);row=[];cell='';}else cell+=ch;}row.push(cell);if(row.some(Boolean))out.push(row);return out;}
