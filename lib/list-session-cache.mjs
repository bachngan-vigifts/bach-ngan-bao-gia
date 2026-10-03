// Optional, per-session display snapshots; always revalidate against the server.
export const LIST_CACHE_MS=4*60*60*1000;
const prefix='bn-lists:v1:';
export function clearListCache(storage){try{for(const key of Object.keys(storage||{}))if(key.startsWith(prefix))storage.removeItem(key);}catch{}}
export async function revalidatedList(storage,scope,path,fetcher,publish,{force=false,now=Date.now()}={}){
 const key=prefix+JSON.stringify([scope,path]);
 if(!force)try{const saved=JSON.parse(storage?.getItem(key)||'null');if(saved&&now>=saved.at&&now-saved.at<LIST_CACHE_MS)publish(saved.value,true);}catch{}
 try{
  const value=await fetcher();
  try{storage?.setItem(key,JSON.stringify({at:Date.now(),value}));}catch{}
  publish(value,false);return value;
 }catch(error){
  // Never retain an unverified snapshot after a failed authorization/read.
  try{storage?.removeItem(key);}catch{}
  throw error;
 }
}
