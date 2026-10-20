<script lang="ts">
	import './layout.css';
	import type { LayoutProps } from './$types';
	import { onMount } from 'svelte';

	let { children }: LayoutProps = $props();


    onMount(() => {
        if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
        const register = () => {
            if (!navigator.onLine) return;
            // A failed update must not break a previously installed offline app.
            void navigator.serviceWorker.register('/service-worker.js').catch(() => {});
        };
        register();
        window.addEventListener('online', register);
        return () => window.removeEventListener('online', register);
    });

</script>

{@render children()}
