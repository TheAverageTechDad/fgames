import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';

const CACHE_NAME = `fgames-cache-${version}`;

// Combine build chunks and static assets (icons, vehicles, images)
const ASSETS_TO_CACHE = [
	'/',
	...immutable,
	...assets.filter((file) => !file.startsWith('/.DS_Store')),
	...prerendered
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(ASSETS_TO_CACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => {
				return Promise.all(
					keys.map((key) => {
						if (key !== CACHE_NAME) {
							return caches.delete(key);
						}
					})
				);
			})
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Only handle same-origin requests
	if (url.origin !== location.origin) return;

	event.respondWith(
		caches.match(request).then((cachedResponse) => {
			if (cachedResponse) {
				// Cache hit: return cached asset immediately
				// If navigating, also refresh in background
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

			// Not in cache: fetch from network and store in cache
			return fetch(request)
				.then((networkResponse) => {
					if (networkResponse && networkResponse.status === 200) {
						const responseToCache = networkResponse.clone();
						caches.open(CACHE_NAME).then((cache) => {
							cache.put(request, responseToCache);
						});
					}
					return networkResponse;
				})
				.catch(async () => {
					// Offline fallback for navigation requests
					if (request.mode === 'navigate') {
						const cache = await caches.open(CACHE_NAME);
						const rootCached = await cache.match('/');
						if (rootCached) return rootCached;
					}
					return new Response('Offline: Game assets are cached and available offline.', {
						status: 503,
						statusText: 'Service Unavailable',
						headers: new Headers({ 'Content-Type': 'text/plain' })
					});
				});
		})
	);
});
