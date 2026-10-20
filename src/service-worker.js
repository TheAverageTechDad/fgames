import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';

const CACHE_NAME = `fgames-cache-${version}`;

function getPath(entry) {
	if (!entry) return null;
	const p = typeof entry === 'string' ? entry : entry.path;
	if (!p || typeof p !== 'string') return null;
	return p.startsWith('/') ? p : `/${p}`;
}

const rawList = ['/', ...immutable, ...assets, ...prerendered];
const ASSETS_TO_CACHE = Array.from(
	new Set(
		rawList
			.map(getPath)
			.filter((p) => p && !p.includes('.DS_Store'))
	)
);

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_NAME);
			await Promise.allSettled(
				ASSETS_TO_CACHE.map((url) =>
					cache.add(url).catch((err) => {
						console.warn('[SW] Could not precache:', url, err);
					})
				)
			);
			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys.map((key) => {
					if (key !== CACHE_NAME) {
						return caches.delete(key);
					}
				})
			);
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Only handle same-origin requests
	if (url.origin !== location.origin) return;

	event.respondWith(
		(async () => {
			const cachedResponse = await caches.match(request);
			if (cachedResponse) {
				// Revalidate in background for page navigation
				if (request.mode === 'navigate') {
					fetch(request)
						.then((networkResponse) => {
							if (networkResponse && networkResponse.status === 200) {
								caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
							}
						})
						.catch(() => {});
				}
				return cachedResponse;
			}

			// If not in cache, fetch from network
			try {
				const networkResponse = await fetch(request);
				if (networkResponse && networkResponse.status === 200) {
					const responseToCache = networkResponse.clone();
					const cache = await caches.open(CACHE_NAME);
					cache.put(request, responseToCache);
				}
				return networkResponse;
			} catch {
				// If network fails (offline), return index.html for navigation requests
				if (request.mode === 'navigate') {
					const cache = await caches.open(CACHE_NAME);
					const fallback = await cache.match('/');
					if (fallback) return fallback;
				}

				return new Response('Offline: Game assets are cached and available offline.', {
					status: 503,
					statusText: 'Service Unavailable',
					headers: new Headers({ 'Content-Type': 'text/plain' })
				});
			}
		})()
	);
});
