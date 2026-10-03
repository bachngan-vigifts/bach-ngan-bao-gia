import { signedStorageRequest } from './neon-storage-check.mjs';
const metadataHeaders={contentType:'content-type',contentDisposition:'content-disposition',cacheControl:'cache-control',contentEncoding:'content-encoding',contentLanguage:'content-language'};
const etag=response=>(response.headers.get('etag')||'').replace(/^"|"$/g,'');
const xml=value=>value.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const tag=(value,name)=>xml(value.match(new RegExp('<'+name+'>([\\s\\S]*?)</'+name+'>'))?.[1]||'');
function storageError(response){return Error('Kho file Neon chưa thực hiện được yêu cầu ('+response.status+').');}

export function createNeonBucket(config,request=fetch){
  const send=(method,key,body='',headers={},query={})=>{const r=signedStorageRequest(config,method,key,body,headers,query);return request(r.url,r.options);};
  return {
    provider:'neon',
    async get(key){
      const response=await send('GET',config.bucket+'/'+key);if(response.status===404)return null;if(!response.ok)throw storageError(response);
      const httpMetadata=Object.fromEntries(Object.entries(metadataHeaders).map(([name,header])=>[name,response.headers.get(header)]).filter(([,value])=>value));
      let customMetadata={};for(const [header,value] of response.headers)if(header.startsWith('x-amz-meta-'))customMetadata[header.slice(11)]=value;
      if(customMetadata['bn-custom-metadata'])customMetadata=JSON.parse(Buffer.from(customMetadata['bn-custom-metadata'],'base64').toString('utf8'));
      return {key,etag:etag(response),size:Number(response.headers.get('content-length')||0),uploaded:new Date(response.headers.get('last-modified')||0),httpMetadata,customMetadata,
        body:response.body,arrayBuffer:()=>response.arrayBuffer(),text:()=>response.text(),json:()=>response.json(),writeHttpMetadata:headers=>{for(const [name,value] of Object.entries(httpMetadata))headers.set(metadataHeaders[name],value);}};
    },
    async put(key,value,options={}){
      let bytes=typeof value==='string'?Buffer.from(value):value instanceof ArrayBuffer?Buffer.from(value):ArrayBuffer.isView(value)?Buffer.from(value.buffer,value.byteOffset,value.byteLength):null;
      if(!bytes){if(value instanceof ReadableStream)bytes=Buffer.from(await new Response(value).arrayBuffer());else throw Error('Unsupported storage body');}
      const headers={};for(const [name,header] of Object.entries(metadataHeaders))if(options.httpMetadata?.[name])headers[header]=String(options.httpMetadata[name]);
      if(options.customMetadata)headers['x-amz-meta-bn-custom-metadata']=Buffer.from(JSON.stringify(options.customMetadata)).toString('base64');
      if(options.onlyIf?.etagMatches)headers['if-match']='"'+options.onlyIf.etagMatches.replace(/^"|"$/g,'')+'"';
      if(options.onlyIf?.etagDoesNotMatch)headers['if-none-match']=options.onlyIf.etagDoesNotMatch;
      const response=await send('PUT',config.bucket+'/'+key,bytes,headers);if(response.status===412)return null;if(!response.ok)throw storageError(response);
      return {key,etag:etag(response),size:bytes.byteLength,uploaded:new Date(),httpMetadata:options.httpMetadata||{},customMetadata:options.customMetadata||{}};
    },
    async delete(key){for(const item of Array.isArray(key)?key:[key]){const response=await send('DELETE',config.bucket+'/'+item);if(!response.ok&&response.status!==404)throw storageError(response);}},
    async list(options={}){
      const query={'list-type':2,'max-keys':options.limit||1000,'encoding-type':'url'};
      if(options.prefix)query.prefix=options.prefix;if(options.cursor)query['continuation-token']=options.cursor;
      const response=await send('GET',config.bucket,'',{},query);if(!response.ok)throw storageError(response);
      const text=await response.text(),objects=[...text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(match=>({key:decodeURIComponent(tag(match[1],'Key')),etag:tag(match[1],'ETag').replace(/^"|"$/g,''),size:Number(tag(match[1],'Size')),uploaded:new Date(tag(match[1],'LastModified'))}));
      const truncated=tag(text,'IsTruncated')==='true';return {objects,truncated,cursor:truncated?tag(text,'NextContinuationToken'):undefined};
    },
  };
}
