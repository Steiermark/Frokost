self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data;try{data=event.data.json();}catch{return;}
  const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T');
  const deadline=new Date(data.date+'T12:00:00Z');deadline.setUTCDate(deadline.getUTCDate()-2);
  if(local>=deadline.toISOString().slice(0,10)+'T12:00')return;
  await self.registration.showNotification(data.title,{body:data.body,icon:'/lunch-icon-192.png',badge:'/favicon.svg',tag:data.tag,data:{url:'/'}});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const window of windows){if(new URL(window.url).origin===self.location.origin){await window.navigate('/');return window.focus();}}
  return self.clients.openWindow('/');
 })());
});
