/* ================================================================
   Muslim Hub Service Worker v4
   - Persistent adhan alarms via SW interval (30s resolution)
   - showNotification fires even with screen off / app closed
   - Offline cache for adhan MP3 + app shell
   - Handles CACHE_ADHAN, CHECK_ADHAN_CACHE, SCHEDULE_ADHANS
================================================================ */

const APP_CACHE   = 'muslim-hub-app-v4';
const ADHAN_CACHE = 'muslim-hub-adhan-v4';

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(APP_CACHE)
      .then(c => c.addAll(['./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png']).catch(() => {}))
  );
});

// ── Activate ──────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== APP_CACHE && k !== ADHAN_CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch — cache-first for audio, network-first for app ──────
self.addEventListener('fetch', e => {
  const u = e.request.url;
  // Audio files: cache-first
  if (/\.(mp3|ogg|wav)(\?|$)/.test(u)) {
    e.respondWith(
      caches.open(ADHAN_CACHE).then(async cache => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        try {
          const resp = await fetch(e.request, { mode: 'cors' });
          if (resp.ok) cache.put(e.request, resp.clone());
          return resp;
        } catch (err) {
          return new Response('', { status: 503 });
        }
      })
    );
    return;
  }
  // App shell
  if (/\/(index\.html)?$/.test(new URL(u).pathname)) {
    e.respondWith(
      caches.match('./index.html')
        .then(r => r || fetch(e.request))
        .catch(() => fetch(e.request))
    );
  }
});

// ── Prayer alarm engine ───────────────────────────────────────
let scheduled = [];   // [{name, time, adhanVoice, adhanUrl, fired}]
let alarmTimer = null;

function ensureAlarmRunning() {
  if (alarmTimer) return;
  alarmTimer = setInterval(checkAlarms, 30 * 1000); // every 30 s
  checkAlarms(); // immediate
}

async function checkAlarms() {
  if (!scheduled.length) {
    clearInterval(alarmTimer);
    alarmTimer = null;
    return;
  }
  const now = Date.now();
  for (const p of scheduled) {
    // Fire if within ±60 seconds of prayer time
    if (!p.fired && Math.abs(p.time - now) <= 60000) {
      p.fired = true;
      await triggerAdhan(p);
    }
  }
  // Purge prayers more than 10 minutes past
  scheduled = scheduled.filter(p => p.time > now - 10 * 60 * 1000);
  if (!scheduled.length) {
    clearInterval(alarmTimer);
    alarmTimer = null;
  }
}

async function triggerAdhan(prayer) {
  const EMOJI = { Fajr:'🌅', Dhuhr:'🌤️', Asr:'⛅', Maghrib:'🌇', Isha:'🌙' };
  const ARABIC = { Fajr:'الفجر', Dhuhr:'الظهر', Asr:'العصر', Maghrib:'المغرب', Isha:'العشاء' };
  const emoji  = EMOJI[prayer.name]  || '🕌';
  const arabic = ARABIC[prayer.name] || prayer.name;

  // 1. Tell every open client to play audio immediately
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });
  let hasVisibleClient = false;
  for (const c of clients) {
    try {
      c.postMessage({
        type:        'PLAY_ADHAN',
        prayerName:  prayer.name,
        adhanUrl:    prayer.adhanUrl,
        adhanVoice:  prayer.adhanVoice
      });
      hasVisibleClient = true;
    } catch (e) {}
  }

  // 2. Always show a notification — this is what wakes the screen
  //    and what plays audio when the app is in background/closed.
  //    requireInteraction keeps it visible until dismissed.
  try {
    await self.registration.showNotification(
      `${emoji} ${prayer.name} Prayer Time`,
      {
        body:              `${arabic} — حان وقت الصلاة`,
        icon:              './icons/icon-192.png',
        badge:             './icons/icon-72.png',
        tag:               'prayer-' + prayer.name,
        renotify:          true,
        requireInteraction: true,
        silent:            false,
        vibrate:           [500, 200, 500, 200, 500, 200, 1000, 300, 1000],
        data: {
          prayerName: prayer.name,
          adhanUrl:   prayer.adhanUrl,
          adhanVoice: prayer.adhanVoice
        },
        actions: [
          { action: 'open',    title: '🕌 Open App & Play Adhan' },
          { action: 'dismiss', title: '✓ Acknowledged' }
        ]
      }
    );
  } catch (e) {
    console.warn('[SW] showNotification failed:', e);
  }

  // 3. Pre-warm adhan cache so it plays instantly on tap
  if (prayer.adhanUrl) {
    try {
      const cache = await caches.open(ADHAN_CACHE);
      const hit = await cache.match(prayer.adhanUrl);
      if (!hit) {
        const resp = await fetch(prayer.adhanUrl, { mode: 'cors' });
        if (resp.ok) cache.put(prayer.adhanUrl, resp.clone());
      }
    } catch (e) {}
  }
}

// ── Notification click ────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;

  const data = e.notification.data || {};
  e.waitUntil((async () => {
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });
    // Focus existing window first
    for (const c of clients) {
      if ('focus' in c) {
        await c.focus();
        c.postMessage({
          type:       'PLAY_ADHAN',
          prayerName: data.prayerName,
          adhanUrl:   data.adhanUrl,
          adhanVoice: data.adhanVoice
        });
        return;
      }
    }
    // No window open — open one and play after load
    if (self.clients.openWindow) {
      const win = await self.clients.openWindow('./');
      if (win) {
        // Give the page ~2s to initialise then trigger adhan
        setTimeout(() => {
          win.postMessage({
            type:       'PLAY_ADHAN',
            prayerName: data.prayerName,
            adhanUrl:   data.adhanUrl,
            adhanVoice: data.adhanVoice
          });
        }, 2000);
      }
    }
  })());
});

// ── Message handler ───────────────────────────────────────────
self.addEventListener('message', e => {
  const msg = e.data || {};

  switch (msg.type) {

    // App sends this after calculating prayer times
    case 'SCHEDULE_ADHANS': {
      scheduled = (msg.prayers || []).map(p => ({ ...p, fired: false }));
      if (scheduled.length) ensureAlarmRunning();
      // Pre-cache the chosen adhan audio now
      if (msg.preloadUrl) {
        caches.open(ADHAN_CACHE).then(async cache => {
          const hit = await cache.match(msg.preloadUrl);
          if (!hit) {
            try {
              const resp = await fetch(msg.preloadUrl, { mode: 'cors' });
              if (resp.ok) cache.put(msg.preloadUrl, resp.clone());
            } catch (_) {}
          }
        }).catch(() => {});
      }
      break;
    }

    // User taps "Download for Offline" in the voice picker
    case 'CACHE_ADHAN': {
      e.waitUntil((async () => {
        const cache = await caches.open(ADHAN_CACHE);
        for (const url of (msg.urls || [])) {
          try {
            const hit = await cache.match(url);
            if (hit) {
              notifyClients({ type: 'ADHAN_CACHED', url, voice: msg.voice, fromCache: true });
              return;
            }
            const resp = await fetch(url, { mode: 'cors' });
            if (resp.ok) {
              await cache.put(url, resp.clone());
              notifyClients({ type: 'ADHAN_CACHED', url, voice: msg.voice });
              return;
            }
          } catch (_) {}
        }
        // All URLs failed
        notifyClients({ type: 'ADHAN_CACHE_FAILED', voice: msg.voice });
      })());
      break;
    }

    // App asks: which voices are already cached?
    case 'CHECK_ADHAN_CACHE': {
      e.waitUntil((async () => {
        const cache  = await caches.open(ADHAN_CACHE);
        const result = {};
        for (const [voice, urls] of Object.entries(msg.voices || {})) {
          for (const url of urls) {
            const hit = await cache.match(url).catch(() => null);
            if (hit) { result[voice] = url; break; }
          }
        }
        notifyClients({ type: 'ADHAN_CACHE_STATUS', result });
      })());
      break;
    }

    case 'CLEAR_ADHAN_CACHE':
      e.waitUntil(caches.delete(ADHAN_CACHE).catch(() => {}));
      break;

    case 'PING':
      if (e.source) e.source.postMessage({ type: 'PONG' });
      break;
  }
});

// Background sync (Android Chrome, if granted)
self.addEventListener('periodicsync', e => {
  if (e.tag === 'prayer-check') e.waitUntil(checkAlarms());
});

// ── Helper ────────────────────────────────────────────────────
async function notifyClients(payload) {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });
  for (const c of clients) {
    try { c.postMessage(payload); } catch (_) {}
  }
}
