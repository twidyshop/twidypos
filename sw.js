const CACHE='twidypos-shell-v1';
const SHELL=['/','/landing-premium.css'];
const CDN=[
 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0',
 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.allSettled([...SHELL,...CDN].map(url=>cache.add(url)));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('twidypos-')&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin===self.location.origin&&req.mode==='navigate'){
  event.respondWith((async()=>{
   try{const response=await fetch(req);const cache=await caches.open(CACHE);cache.put('/',response.clone());return response;}
   catch{return (await caches.match(req))||(await caches.match('/'))||Response.error();}
  })());
  return;
 }
 if((url.origin===self.location.origin&&url.pathname.endsWith('.css'))||CDN.some(item=>req.url.startsWith(item))){
  event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(req);if(cached)return cached;try{const response=await fetch(req);if(response.ok)cache.put(req,response.clone());return response;}catch{return cached||Response.error();}})());
 }
});
