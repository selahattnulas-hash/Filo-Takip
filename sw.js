const FN="https://itsdtgvicgynymjrdhgn.supabase.co/functions/v1/watch-push";
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("push",e=>{let d={};try{d=e.data.json()}catch(x){d={title:"Filo Takip",body:e.data?e.data.text():""}}
  e.waitUntil(self.registration.showNotification(d.title||"Filo Takip",{body:d.body||"",tag:d.tag||undefined,renotify:true,requireInteraction:true,data:d,
    actions:d.id?[{action:"ack",title:"Gördüm"},{action:"snooze",title:"30 dk sustur"}]:[]}))});
self.addEventListener("message",e=>{});
function openApp(url){const u=new URL(url||"./",self.registration.scope).href,t=(u.match(/sofor=([^&]+)/)||[])[1];
  return self.clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>{for(const c of cs){if(t?c.url.includes("sofor="+t):!c.url.includes("sofor=")){if(url&&"navigate" in c)return c.navigate(u).then(w=>w&&w.focus?w.focus():null).catch(()=>self.clients.openWindow(u));if("focus" in c)return c.focus()}}return self.clients.openWindow(u)})}
self.addEventListener("notificationclick",e=>{const d=e.notification.data||{};e.notification.close();
  const q=d.id&&d.t?FN+"?ack="+encodeURIComponent(d.id)+"&t="+encodeURIComponent(d.t)+"&s="+encodeURIComponent(d.s||"")+(e.action=="snooze"?"&snooze=30":""):null;
  e.waitUntil(Promise.all([q?fetch(q).catch(()=>{}):null,e.action?null:openApp(d.url)]))});
