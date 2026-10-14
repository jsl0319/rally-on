/* Push only: no page, authentication or financial-response caching. */
function binding(value) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('rally-push', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('settings');
    open.onerror = () => reject(new Error('binding unavailable'));
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('settings', value === undefined ? 'readonly' : 'readwrite');
      const store = tx.objectStore('settings');
      const req = value === undefined ? store.get('subscription') : store.put(value, 'subscription');
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onerror = () => { db.close(); reject(new Error('binding unavailable')); };
    };
  });
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type !== 'RALLY_PUSH_BINDING' || !event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  event.waitUntil((async () => {
    await binding(typeof event.data.id === 'string' ? event.data.id : '');
    if (!event.data.id) for (const notification of await self.registration.getNotifications()) notification.close();
    event.ports[0]?.postMessage({ ok: true });
  })());
});
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data;
    try { data = event.data?.json(); } catch { return; }
    if (data?.version !== 1 || !/^[0-9a-f-]{36}$/i.test(data.notificationId || '') || !data.subscriptionId) return;
    if (await binding() !== data.subscriptionId) return;
    await self.registration.showNotification('랠리온', {
      body: '새 알림이 있어요. 앱에서 확인해 주세요.',
      icon: '/images/brand/app-icon-1024.png',
      tag: `rally-${data.notificationId}`,
      data: { href: `/my/notifications/open/${data.notificationId}`, subscriptionId: data.subscriptionId },
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data;
    const href = data?.subscriptionId === await binding() && /^\/my\/notifications\/open\/[0-9a-f-]{36}$/i.test(data?.href || '') ? data.href : '/my/notifications';
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(href); await existing.focus(); }
    else await self.clients.openWindow(href);
  })());
});
