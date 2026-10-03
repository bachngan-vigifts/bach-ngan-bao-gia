import { createHash, createHmac } from 'node:crypto';
import { QuotationError } from './quotation-store.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
const encode=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
export function signedStorageRequest(config,method,key,body='',extra={},query={}) {
  const now=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=now.slice(0,8);
  const pathname='/'+key.split('/').map(encode).join('/');
  const url=new URL(config.endpoint);url.pathname=pathname;
  const queryString=Object.keys(query).sort().map(k=>encode(k)+'='+encode(String(query[k]))).join('&');url.search=queryString;
  const payloadHash=digest(body),headers={...extra,host:url.host,'x-amz-date':now,'x-amz-content-sha256':payloadHash};
  const names=Object.keys(headers).sort(),canonical=names.map(name=>name+':'+String(headers[name]).trim()+'\n').join('');
  const request=[method,pathname,queryString,canonical,names.join(';'),payloadHash].join('\n');
  const scope=day+'/'+config.region+'/s3/aws4_request';
  const signingKey=hmac(hmac(hmac(hmac('AWS4'+config.secret,day),config.region),'s3'),'aws4_request');
  const signature=createHmac('sha256',signingKey).update('AWS4-HMAC-SHA256\n'+now+'\n'+scope+'\n'+digest(request)).digest('hex');
  headers.authorization='AWS4-HMAC-SHA256 Credential='+config.accessKey+'/'+scope+', SignedHeaders='+names.join(';')+', Signature='+signature;
  delete headers.host;
  return {url:url.href,options:{method,headers,...(['GET','HEAD'].includes(method)?{}:{body})}};
}
export async function checkNeonStorage(env,request=fetch) {
  const endpoint=env.NEON_MIGRATION_S3_ENDPOINT;
  if(!endpoint||!env.NEON_MIGRATION_S3_ACCESS_KEY||!env.NEON_MIGRATION_S3_SECRET)throw new QuotationError(503,'Chưa có kết nối kho Neon kiểm thử.');
  if(new URL(endpoint).hostname!=='br-jolly-sky-b3ytom90.storage.c-4.ap-southeast-1.aws.neon.tech')throw new QuotationError(403,'Chỉ được kiểm tra nhánh Neon riêng.');
  const config={endpoint,region:'ap-southeast-1',accessKey:env.NEON_MIGRATION_S3_ACCESS_KEY,secret:env.NEON_MIGRATION_S3_SECRET};
  const send=(method,key,body='',headers={})=>{const r=signedStorageRequest(config,method,key,body,headers);return request(r.url,r.options);};
  const bucket='bao-gia-files',head=await send('HEAD',bucket);
  if(head.status!==200){
    if(head.status!==404)return {ok:false,step:'head-bucket',httpStatus:head.status,branch:'migration-web-20261002'};
    const created=await send('PUT',bucket);
    if(!created.ok)return {ok:false,step:'create-bucket',httpStatus:created.status,branch:'migration-web-20261002'};
  }
  const key=bucket+'/.migration-checks/'+crypto.randomUUID();
  const first=await send('PUT',key,'initial',{'if-none-match':'*','content-type':'text/plain'});
  if(!first.ok)return {ok:false,step:'write-new',httpStatus:first.status};
  const etag=first.headers.get('etag');
  if(!etag)return {ok:false,step:'missing-etag',httpStatus:first.status};
  const update=await send('PUT',key,'updated',{'if-match':etag,'content-type':'text/plain'});
  if(!update.ok)return {ok:false,step:'conditional-update',httpStatus:update.status};
  const conflict=await send('PUT',key,'must-not-be-written',{'if-match':'"invalid-etag"','content-type':'text/plain'});
  const read=await send('GET',key);
  const preserved=read.ok&&(await read.text())==='updated';
  const result={ok:conflict.status===412&&preserved,step:'conditional-conflict',httpStatus:conflict.status,preserved,branch:'migration-web-20261002'};
  // Disposable probe bytes only. No source file or application row is touched.
  await send('DELETE',key);
  return result;
}
