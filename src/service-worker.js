import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';

const CACHE_PREFIX = 'fgames-cache-';
const CACHE_NAME = `${CACHE_PREFIX}${version}`;

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
			await cache.addAll(ASSETS_TO_CACHE);
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
					if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) {
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
			const cache = await caches.open(CACHE_NAME);
			// The cached files are static and have identical content across request headers.
            // Module requests may add Origin (Vite sends Vary: Origin); route queries
            // select local game state rather than a different HTML document.
            const knownPath = ASSETS_TO_CACHE.includes(url.pathname);
            const cachedResponse = await cache.match(knownPath ? url.pathname : request, { ignoreVary: knownPath });
			if (request.mode !== 'navigate' && cachedResponse) return cachedResponse;

			// Navigation uses the latest shell when online and the cached shell offline.
			try {
				const networkResponse = await fetch(request);
				if (networkResponse.ok) {
					event.waitUntil(cache.put(request, networkResponse.clone()));
				}
				return networkResponse;
			} catch {
				if (cachedResponse) return cachedResponse;
				if (request.mode === 'navigate') {
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
