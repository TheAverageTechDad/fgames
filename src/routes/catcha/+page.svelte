<script lang="ts">
	import { onMount } from 'svelte';

	// ponytail: Catcha boots at import time and has no destroy(); links in and out of this page use
	// data-sveltekit-reload, so the browser tears down its WebGL context, loop and listeners.
	onMount(() => {
		addEventListener('error', (event) => {
			const box = document.getElementById('fatal')!;
			box.style.display = 'grid';
			box.textContent = `${event.message}\n\n${event.error?.stack ?? ''}`;
		});
		// iOS Safari pinch-zoom and long-press menus ignore touch-action on the page itself.
		for (const type of ['gesturestart', 'gesturechange', 'contextmenu', 'selectstart', 'dragstart'])
			document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
		import('#lib/games/catcha/main.js');
	});
</script>

<svelte:head>
	<title>Catcha</title>
</svelte:head>

<pre id="fatal"></pre>

<style>
	/* From Catcha's index.html: a fixed, unscrollable stage under the notch. */
	:global(:root) {
		--safe-top: env(safe-area-inset-top, 0px);
		--safe-right: env(safe-area-inset-right, 0px);
		--safe-bottom: env(safe-area-inset-bottom, 0px);
		--safe-left: env(safe-area-inset-left, 0px);
	}
	:global(html),
	:global(body) {
		margin: 0;
		position: fixed;
		inset: 0;
		overflow: hidden;
		overscroll-behavior: none;
		touch-action: none;
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
		-webkit-text-size-adjust: 100%;
		text-size-adjust: 100%;
		color: #cfd6e4;
		font: 13px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
	}
	@media (display-mode: standalone), (display-mode: fullscreen) {
		:global(html),
		:global(body) {
			bottom: auto;
			height: 100vh;
			height: 100lvh;
		}
		:global(body) {
			overflow: visible;
		}
	}
	:global(body) {
		background: #087573 url('/catcha/assets/icons/icon-192.png') center / 128px no-repeat;
	}
	:global(.rotated) {
		--safe-left: env(safe-area-inset-top, 0px);
		--safe-top: env(safe-area-inset-right, 0px);
		--safe-right: env(safe-area-inset-bottom, 0px);
		--safe-bottom: env(safe-area-inset-left, 0px);
	}
	:global(.rotated canvas) {
		transform-origin: 0 0;
	}
	:global(canvas) {
		display: block;
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		touch-action: none;
		outline: none;
	}
	#fatal {
		position: fixed;
		inset: 0;
		display: none;
		place-items: center;
		padding: 24px;
		background: #10060a;
		color: #ffb4b4;
		font-family: ui-monospace, SFMono-Regular, monospace;
		white-space: pre-wrap;
	}
</style>
