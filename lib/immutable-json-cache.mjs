// Only use for immutable, versioned R2 objects; never current.json or indexes.
const buckets=new WeakMap();
const ttl=4*60*60*1000;
export async function immutableJson(bucket,key,{now=Date.now(),force=false}={}){
 let cache=buckets.get(bucket);if(!cache){cache=new Map();buckets.set(bucket,cache);}
 const hit=cache.get(key);
 if(!force&&hit&&now>=hit.at&&now-hit.at<ttl)return structuredClone(hit.value);
 const object=await bucket.get(key);if(!object)return null;
 const value=await object.json();
 if(cache.size>=6)cache.delete(cache.keys().next().value);
 cache.set(key,{at:now,value});
 return structuredClone(value);
}
