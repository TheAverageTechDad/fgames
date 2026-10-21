<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	let ready = $state(false);

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
		// main.js awaits its room, characters and UI at the top level, so the import settles once it can draw.
		import('#lib/games/catcha/main.js')
			.then(() => requestAnimationFrame(() => (ready = true)))
			.catch((error) => dispatchEvent(new ErrorEvent('error', { message: String(error), error })));
	});
</script>

<svelte:head>
	<title>Catcha</title>
</svelte:head>

{#if !ready}
	<div class="catcha-loading" role="status" out:fade={{ duration: 300 }}>
		<div class="loading-spark" aria-hidden="true">✦</div>
		<h2>Getting the house ready</h2>
		<p>A tidy house, one little toy at a time.</p>
	</div>
{/if}
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
		background: #9ed8cf;
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
	/* Same splash as Pocket Farm's, in Catcha's teal. */
	.catcha-loading {
		position: fixed;
		inset: 0;
		z-index: 1;
		background: #9ed8cf;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		text-align: center;
		padding: 35px;
		gap: 16px;
		font-family: 'Lilita One', sans-serif;
	}
	.catcha-loading h2 {
		font-size: 30px;
		color: #10504c;
	}
	.catcha-loading p {
		font-size: 16px;
		color: #3a7a72;
	}
	.loading-spark {
		font-size: 80px;
		line-height: 1;
		color: #ffd36b;
		text-shadow: 0 4px 0 #4f9e93;
	}
	#fatal {
		position: fixed;
		z-index: 2;
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
