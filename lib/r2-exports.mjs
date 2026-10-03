import {createHash} from 'node:crypto';
const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json','Cache-Control':'no-store, private'}});
export async function exportFiles(request,bucket,member){
 const url=new URL(request.url),prefix=`exports/${member.id}/`;
 if(request.method==='GET'){
  const id=url.searchParams.get('id');
  if(id){if(!/^[a-f0-9]{64}$/.test(id))return new Response('Not found',{status:404});const file=await bucket.get(prefix+id);if(!file)return new Response('Not found',{status:404});return new Response(file.body,{headers:{'Content-Type':file.httpMetadata?.contentType||'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.customMetadata?.fileName||'file')}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
  let cursor;const files=[];do{const page=await bucket.list({prefix,limit:1000,cursor});for(const item of page.objects)if(item.key.endsWith('.json')){const object=await bucket.get(item.key);if(object)files.push(await object.json());}cursor=page.truncated?page.cursor:undefined;}while(cursor);
  return json({files:files.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))});
 }
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 const reader=request.body.getReader(),parts=[];let n=0;for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>21000000){await reader.cancel();return new Response('Tệp tối đa 20 MB',{status:413});}parts.push(value);}
 const form=await new Response(Buffer.concat(parts),{headers:{'Content-Type':request.headers.get('content-type')}}).formData();
 const file=form.get('file');if(!file||typeof file==='string'||file.size>20000000)return new Response('Tệp không hợp lệ',{status:400});
 const allowed=['application/pdf','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
 if(!allowed.includes(file.type))return new Response('Chỉ lưu PDF, DOCX hoặc bộ hồ sơ ZIP; Excel chỉ tải về',{status:415});
 const bytes=Buffer.from(await file.arrayBuffer());if(file.type==='application/pdf'?bytes.subarray(0,5).toString()!=='%PDF-':bytes.subarray(0,2).toString()!=='PK')return new Response('Nội dung tệp không hợp lệ',{status:400});
 const fileName=file.name.replace(/[\r\n/\\]/g,'-').slice(0,200),id=createHash('sha256').update(member.id+'\n'+fileName+'\n').update(bytes).digest('hex'),key=prefix+id;
 const checksum=createHash('sha256').update(bytes).digest('hex');
 await bucket.put(key,bytes,{httpMetadata:{contentType:file.type},customMetadata:{fileName,sha256:checksum}});
 const check=await bucket.get(key);if(!check||createHash('sha256').update(Buffer.from(await check.arrayBuffer())).digest('hex')!==checksum)throw Error('Chưa kiểm tra được bản lưu R2');
 const record={id,fileName,size:bytes.length,createdAt:new Date().toISOString(),url:'/api/staff/export-files?id='+id};await bucket.put(key+'.json',JSON.stringify(record),{httpMetadata:{contentType:'application/json'}});return json(record);
}
