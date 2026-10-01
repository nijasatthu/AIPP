const CACHE='aipp-pwa-v6.3.2-1';
const CORE=[
  './','./index.html','./styles.css','./app.js','./pwa-helper.js','./manifest.webmanifest',
  './icon-192.png','./icon-512.png','./apple-touch-icon.png','./aipp_logo_1024.png',
  './carriers/viettel.svg','./carriers/vinaphone.svg','./carriers/mobifone.svg',
  './carriers/vietnamobile.svg','./carriers/gmobile.svg','./carriers/itel.svg','./carriers/wintel.svg'
];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
