self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let note = null;
    try {
      const response = await fetch('/api/staff/push/notifications?limit=1', {cache: 'no-store', credentials: 'include'});
      if (response.ok) {
        const data = await response.json();
        note = (data.notifications || [])[0] || null;
      }
    } catch {}
    try {
      const windows = await clients.matchAll({type: 'window', includeUncontrolled: true});
      for (const client of windows) client.postMessage({type: 'web-push-notification', eventType: note?.eventType || '', id: note?.id || '', data: note?.data || {}});
    } catch {}
    const title = note?.title || 'Có cập nhật mới';
    const body = note?.body || 'Mở để xem chi tiết.';
    await self.registration.showNotification(title, {
      body,
      tag: note?.id || 'bach-ngan-notification',
      icon: '/favicon-192.webp',
      badge: '/favicon-32.webp',
      data: {url: note?.url || '/quote', id: note?.id || ''},
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    let path=event.notification.data?.url||'/quote';
    const id=event.notification.data?.id;
    if(id){try{const response=await fetch('/api/staff/push/notifications?limit=50',{cache:'no-store',credentials:'include'});if(response.ok){const note=(await response.json()).notifications?.find(note=>note.id===id);if(note?.url)path=note.url;}}catch{}}
    const destination=new URL(path,self.location.origin);
    const target=destination.origin===self.location.origin?destination.href:new URL('/quote',self.location.origin).href;
    const windows = await clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        return client.navigate(target);
      }
    }
    return clients.openWindow(target);
  })());
});
