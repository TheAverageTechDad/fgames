<script lang="ts">
	import './layout.css';
	import type { LayoutProps } from './$types';
	import { onMount } from 'svelte';

	let { children }: LayoutProps = $props();

	onMount(() => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').catch(() => {});
		}
	});
</script>

{@render children()}
