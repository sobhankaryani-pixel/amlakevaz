/* Notifications only: never cache API responses, tokens or private pages. */
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const title=typeof data.title==='string'?data.title.slice(0,150):'املاک خودمونی اوز';
 const body=typeof data.body==='string'?data.body.slice(0,250):'اعلان جدید مدیریتی دارید.';
 event.waitUntil(self.registration.showNotification(title,{body,icon:'/brand/logo-emblem-v2.png',badge:'/brand/logo-emblem-v2.png',tag:typeof data.tag==='string'?data.tag:'evaz-manager',data:{url:'/management/'},dir:'rtl',lang:'fa',renotify:false}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const target=new URL('/management/',self.location.origin).href;for(const client of windows){const url=new URL(client.url);if(url.origin===self.location.origin&&url.pathname.startsWith('/management/')){await client.focus();return}}await self.clients.openWindow(target)})());
});
