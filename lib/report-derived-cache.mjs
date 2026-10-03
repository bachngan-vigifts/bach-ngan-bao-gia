// Replaceable derived report artifacts, never authoritative business data.
// Bump the caller's versioned name whenever its calculation rules change.
export const REPORT_CACHE_MS = 4 * 60 * 60 * 1000;
export async function reportDigest(value) {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function derivedReportCache(bucket,name,{force=false,now=Date.now()}={}) {
 const key='derived-reports/'+name+'.json';let previous={};
 if(!force&&bucket)try{const object=await bucket.get(key);const saved=object?await object.json():null;if(saved?.version===1)previous=saved.entries||{};}catch{/* Recompute if optional cache is unavailable. */}
 const entries={};let dirty=force;
 return {
  async get(id,input,calculate,reusable=()=>true){
   const fingerprint=await reportDigest(input),old=previous[id];
   if(old?.fingerprint===fingerprint&&now>=old.at&&now-old.at<REPORT_CACHE_MS&&reusable(old.value)){
    entries[id]=old;return old.value;
   }
   const value=await calculate(); // Never persist failures or partial calculations.
   entries[id]={fingerprint,at:now,value};dirty=true;return value;
  },
  async save(){
   if(!bucket?.put)return;
   if(Object.keys(previous).length!==Object.keys(entries).length)dirty=true;
   if(dirty)try{await bucket.put(key,JSON.stringify({version:1,entries}),{httpMetadata:{contentType:'application/json'}});}catch{/* A cache write failure must not discard live report results. */}
  }
 };
}
