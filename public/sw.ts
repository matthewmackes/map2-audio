/**
 * Service Worker for HOST MACHINE PAGE
 * Enables persistent notifications and background alert handling
 * 
 * Place this file at /public/sw.js
 */

const CACHE_NAME = 'host-machine-v1'
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
]

// Install event - cache essential assets
self.addEventListener('install', (event: ExtendableEvent) => {
  console.log('[Service Worker] Installing...')

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching essential assets')
      return cache.addAll(ASSETS_TO_CACHE).catch((error) => {
        console.warn('[Service Worker] Some assets failed to cache:', error)
        // Continue even if some assets fail
        return Promise.resolve()
      })
    })
  )

  // Activate immediately
  ;(self as any).skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event: ExtendableEvent) => {
  console.log('[Service Worker] Activating...')

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )

  // Take control of all pages immediately
  ;(self as any).clients.claim()
})

// Fetch event - cache strategy for offline support
self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Network first for API calls, cache for static assets
  if (request.url.includes('/api/') || request.url.includes('/ws/')) {
    // Network first for API/WebSocket
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.ok && request.method === 'GET') {
            const cache = caches.open(CACHE_NAME)
            cache.then((c) => c.put(request, response.clone()))
          }
          return response
        })
        .catch(() => {
          // Fall back to cache if network fails
          return caches.match(request).then((cached) => {
            return cached || new Response('Offline - API not available', { status: 503 })
          })
        })
    )
  } else {
    // Cache first for static assets
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached
        }

        return fetch(request)
          .then((response) => {
            // Cache successful responses
            if (response.ok) {
              const cache = caches.open(CACHE_NAME)
              cache.then((c) => c.put(request, response.clone()))
            }
            return response
          })
          .catch(() => {
            return new Response('Offline - Asset not available', { status: 503 })
          })
      })
    )
  }
})

// Handle notification clicks
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  const { notification, action } = event
  console.log('[Service Worker] Notification clicked:', action)

  notification.close()

  const alertData = notification.data || {}

  event.waitUntil(
    ;(self as any).clients.matchAll({ type: 'window' }).then((clients: any[]) => {
      // Check if window is already open
      for (const client of clients) {
        if (client.url === '/' && 'focus' in client) {
          client.focus()
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: {
              action,
              alertData,
            },
          })
          return
        }
      }

      // Open new window if none found
      if ((self as any).clients.openWindow) {
        return (self as any).clients.openWindow('/').then((client: any) => {
          if (client && 'postMessage' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              data: {
                action,
                alertData,
              },
            })
          }
        })
      }
    })
  )
})

// Handle notification close
self.addEventListener('notificationclose', (event: NotificationEvent) => {
  console.log('[Service Worker] Notification closed:', event.notification.data)
})

// Background sync for alerts (future enhancement)
self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-alerts') {
    event.waitUntil(
      fetch('/api/alerts/sync')
        .then((response) => response.json())
        .then((data) => {
          // Process synced alerts
          console.log('[Service Worker] Synced alerts:', data)
        })
        .catch((error) => {
          console.error('[Service Worker] Sync failed:', error)
          // Retry sync
          throw error
        })
    )
  }
})

// Message handler for client communication
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const { type, data } = event.data

  console.log('[Service Worker] Message received:', type)

  if (type === 'SKIP_WAITING') {
    ;(self as any).skipWaiting()
  }

  if (type === 'CHECK_ALERTS') {
    // Periodically check for alerts
    fetch('/api/system/health-overview')
      .then((response) => response.json())
      .then((health) => {
        // Send alert to client if needed
        if (health.cpu_usage_percent > 90) {
          ;(self as any).registration.showNotification('CPU Alert', {
            body: `CPU usage is ${health.cpu_usage_percent}%`,
            tag: 'cpu-alert',
            requireInteraction: true,
          })
        }
      })
      .catch((error) => {
        console.error('[Service Worker] Failed to check alerts:', error)
      })
  }

  if (type === 'CLEAR_CACHE') {
    event.waitUntil(caches.delete(CACHE_NAME))
  }
})

// Periodic background sync for alert checking (requires permission)
const ALERT_CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes

let lastAlertCheck = 0

setInterval(() => {
  const now = Date.now()
  if (now - lastAlertCheck > ALERT_CHECK_INTERVAL) {
    lastAlertCheck = now

    fetch('/api/system/health-overview')
      .then((response) => response.json())
      .then((health) => {
        const thresholds = {
          tempCritical: 85,
          cpuCritical: 90,
          memCritical: 90,
          diskCritical: 95,
        }

        if (health.cpu_temp_celsius > thresholds.tempCritical) {
          ;(self as any).registration.showNotification('🌡️ Temperature Critical', {
            body: `CPU temperature: ${health.cpu_temp_celsius}°C`,
            tag: 'temp-critical',
            requireInteraction: true,
          })
        }

        if (health.cpu_usage_percent > thresholds.cpuCritical) {
          ;(self as any).registration.showNotification('⚙️ CPU Critical', {
            body: `CPU usage: ${health.cpu_usage_percent}%`,
            tag: 'cpu-critical',
            requireInteraction: true,
          })
        }

        if (health.memory_usage_percent > thresholds.memCritical) {
          ;(self as any).registration.showNotification('💾 Memory Critical', {
            body: `Memory usage: ${health.memory_usage_percent}%`,
            tag: 'mem-critical',
            requireInteraction: true,
          })
        }
      })
      .catch((error) => {
        console.error('[Service Worker] Background alert check failed:', error)
      })
  }
}, 60000) // Check every minute

export {}
