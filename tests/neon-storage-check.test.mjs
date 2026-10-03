import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNeonStorage } from '../lib/neon-storage-check.mjs';
const env={NEON_MIGRATION_S3_ENDPOINT:'https://br-jolly-sky-b3ytom90.storage.c-4.ap-southeast-1.aws.neon.tech',NEON_MIGRATION_S3_ACCESS_KEY:'fake',NEON_MIGRATION_S3_SECRET:'fake'};
test('storage probe refuses production endpoints before sending any request',async()=>{
 let calls=0;await assert.rejects(checkNeonStorage({...env,NEON_MIGRATION_S3_ENDPOINT:'https://production.invalid'},async()=>{calls++;}));assert.equal(calls,0);
});
test('storage probe fails closed when the service ignores conditional writes',async()=>{
 let content='';const writes=[];
 const request=async(url,o)=>{
  assert.equal(new URL(url).hostname,new URL(env.NEON_MIGRATION_S3_ENDPOINT).hostname);
  if(o.method==='HEAD')return new Response(null,{status:200});
  if(o.method==='PUT'){content=o.body;writes.push(o.headers);return new Response(null,{status:200,headers:{etag:'"fake-etag"'}});}
  if(o.method==='GET')return new Response(content);
  if(o.method==='DELETE')return new Response(null,{status:204});
 };
 const result=await checkNeonStorage(env,request);assert.equal(result.ok,false);assert.equal(result.preserved,false);
 assert.equal(writes[0]['if-none-match'],'*');assert.equal(writes[1]['if-match'],'"fake-etag"');assert.equal(writes[2]['if-match'],'"invalid-etag"');
});
test('storage probe accepts conflict detection only when stale writes return 412 and preserve bytes',async()=>{
 let content='';const request=async(url,o)=>{
  if(o.method==='HEAD')return new Response(null,{status:200});
  if(o.method==='PUT'){if(o.headers['if-match']==='"invalid-etag"')return new Response(null,{status:412});content=o.body;return new Response(null,{headers:{etag:'"fake-etag"'}});}
  if(o.method==='GET')return new Response(content);
  return new Response(null,{status:204});
 };
 assert.equal((await checkNeonStorage(env,request)).ok,true);
});
