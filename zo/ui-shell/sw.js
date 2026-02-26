/**
 * Zo-Qore Service Worker
 * 
 * Provides offline capability and caching for the Zo-Qore UI.
 * Caches static assets and API responses for resilience.
 * 
 * Version: 1.0.0
 */

const CACHE_NAME = 'zo-qore-v1';
const STATIC_CACHE_NAME = 'zo-qore-static-v1';
const API_CACHE_NAME = 'zo-qore-api-v1';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/tokens.css',
  '/components.css',
  '/components.js',
  '/virtual-list.js',
  '/void.css',
  '/void.js',
  '/reveal.css',
  '/reveal.js',
  '/constellation.css',
  '/constellation-graph.js',
  '/path.css',
  '/path.js',
  '/risk-register.css',
  '/risk-register.js',
  '/autonomy.css',
  '/autonomy.js',
  '/zo-nav.css',
  '/zo-nav.js',
  '/responsive.css',
  '/onboarding.css',
  '/onboarding.js',
  '/planning-client.js'
];

// API endpoints to cache with network-first strategy
const API_CACHE_PATTERNS = [
  /\/api\/projects\/[^/]+\/void\/thoughts$/,
  /\/api\/projects\/[^/]+\/reveal\/clusters$/,
  /\/api\/projects\/[^/]+\/path\/phases$/,
  /\/api\/projects\/[^/]+\/risk\/entries$/,
  /\/api\/nav-state$/
];

// Maximum age for cached API responses (5 minutes)
const API_MAX_AGE = 5 * 60 * 1000;

/**
 * Install event - cache static assets
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS.map(url => {
          return new Request(url, { cache: 'reload' });
        })).catch((err) => {
          // Log but don't fail - some assets may not exist
          console.warn('[SW] Some static assets failed to cache:', err.message);
        });
      })
      .then(() => {
        console.log('[SW] Install complete');
        return self.skipWaiting();
      })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name.startsWith('zo-qore-') && 
                     name !== CACHE_NAME && 
                     name !== STATIC_CACHE_NAME && 
                     name !== API_CACHE_NAME;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activate complete');
        return self.clients.claim();
      })
  );
});

/**
 * Fetch event - serve from cache or network
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Handle API requests with network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static assets with cache-first strategy
  event.respondWith(handleStaticRequest(request));
});

/**
 * Handle API requests - network first, fallback to cache
 */
async function handleApiRequest(request) {
  const url = new URL(request.url);
  
  // Check if this is a cacheable API endpoint
  const isCacheable = API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
  
  // For non-GET requests, always go to network
  if (request.method !== 'GET') {
    return fetch(request);
  }

  // Try network first
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses for cacheable endpoints
    if (networkResponse.ok && isCacheable) {
      const cache = await caches.open(API_CACHE_NAME);
      const responseToCache = networkResponse.clone();
      
      // Add timestamp for TTL
      const headers = new Headers(responseToCache.headers);
      headers.set('x-sw-cache-time', Date.now().toString());
      
      cache.put(request, new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      }));
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    console.log('[SW] Network failed for API request, trying cache:', url.pathname);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Check if cached response is still valid
      const cacheTime = cachedResponse.headers.get('x-sw-cache-time');
      if (cacheTime) {
        const age = Date.now() - parseInt(cacheTime);
        if (age < API_MAX_AGE) {
          return cachedResponse;
        }
      } else {
        return cachedResponse;
      }
    }
    
    // Return offline response
    return new Response(
      JSON.stringify({
        error: {
          code: 'OFFLINE',
          title: 'You are offline',
          detail: 'This request could not be completed because you are offline.',
          resolution: 'Please check your connection and try again.',
          severity: 'warning'
        }
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Handle static asset requests - cache first, fallback to network
 */
async function handleStaticRequest(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Revalidate in background
    revalidateCache(request);
    return cachedResponse;
  }

  // Try network
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Return offline fallback for HTML pages
    if (request.headers.get('Accept')?.includes('text/html')) {
      return caches.match('/index.html');
    }
    
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Revalidate cache entry in background
 */
async function revalidateCache(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse);
    }
  } catch (error) {
    // Ignore revalidation errors
  }
}

/**
 * Message handler - for cache management
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => caches.delete(name))
        );
      }).then(() => {
        event.ports[0].postMessage({ success: true });
      })
    );
  }
  
  if (event.data && event.data.type === 'GET_CACHE_STATUS') {
    event.waitUntil(
      caches.keys().then(async (cacheNames) => {
        const status = {};
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          status[name] = keys.length;
        }
        event.ports[0].postMessage(status);
      })
    );
  }
});

console.log('[SW] Service Worker loaded');
