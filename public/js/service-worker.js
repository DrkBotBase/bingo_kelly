const version = 'v1';
const CACHE_NAME = `bingo-pwa-${version}`;
const DYNAMIC_CACHE = `bingo-dynamic-${version}`;
const API_CACHE = `bingo-api-${version}`;
const OFFLINE_URL = '/offline.html';

const urlsToCache = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/js/service-worker.js',
  '/j-192.png',
  '/j-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        for (const url of urlsToCache) {
          try {
            const response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response);
            } else {
              console.warn(`⚠️ No se pudo cachear: ${url} (${response.status})`);
            }
          } catch (error) {
            console.error(`❌ Error cacheando ${url}:`, error);
          }
        }
        
        const offlineCheck = await cache.match('/offline.html');
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE && cacheName !== API_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          return response;
        })
        .catch(async (error) => {
          const cachedOffline = await caches.match('/offline.html');
          if (cachedOffline) {
            return cachedOffline;
          }
          try {
            const offlineResponse = await fetch('/offline.html');
            if (offlineResponse.ok) {
              const cache = await caches.open(CACHE_NAME);
              await cache.put('/offline.html', offlineResponse.clone());
              return offlineResponse;
            }
          } catch (err) {
            console.error('❌ Error cargando offline.html:', err);
          }
          
          return new Response(`
            <!DOCTYPE html>
            <html>
            <head><title>Sin conexión</title></head>
            <body>
              <h1>📡 Sin conexión</h1>
              <p>No tienes internet. Reconoéctate para seguir jugando.</p>
              <button onclick="location.reload()">Reintentar</button>
            </body>
            </html>
          `, {
            status: 503,
            headers: { 'Content-Type': 'text/html' }
          });
        })
    );
    return;
  }
  
  if (event.request.url.includes('/js/') || 
      event.request.url.includes('/css/') ||
      event.request.url.match(/\.(png|jpg|jpeg|gif|svg|ico)$/)) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(DYNAMIC_CACHE).then(cache => {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }
        
        return fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }
  
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(API_CACHE).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response(JSON.stringify({ 
            error: 'Sin conexión', 
            offline: true 
          }), { 
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/offline.html');
        }
        return new Response('Recurso no disponible', { status: 404 });
      });
    })
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'sync-marcados') {
    event.waitUntil(syncMarcadosPendientes());
  }
});

self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : '¡Nueva notificación!',
    icon: '/j-192.png',
    badge: '/j-192.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Ver juego',
        icon: '/j-192.png'
      },
      {
        action: 'close',
        title: 'Cerrar',
        icon: '/j-192.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Bingo Amigos', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

async function syncMarcadosPendientes() {
  try {
    const cache = await caches.open('pending-marcados');
    const requests = await cache.keys();
    
    for (const request of requests) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.delete(request);
        }
      } catch (error) {
        console.log('❌ Error sincronizando:', error);
      }
    }
  } catch (error) {
    console.log('❌ Error en sync:', error);
  }
}