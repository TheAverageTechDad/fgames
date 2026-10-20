<script lang="ts">
	import { NUT_THEMES, type NutColor } from './types';

	interface Props {
		color: NutColor;
		isSelected?: boolean;
		isMoving?: boolean;
		size?: number; // scale
	}

	let { color, isSelected = false, isMoving = false, size = 1 }: Props = $props();

	const theme = $derived(NUT_THEMES[color]);
</script>

<div
	class="relative transition-all duration-300 ease-out select-none"
	class:translate-y-[-75px]={isSelected}
	class:z-30={isSelected}
	class:animate-nut-float={isSelected}
	style="width: {72 * size}px; height: {34 * size}px; margin-top: -6px;"
>
	<!-- Drop shadow under nut -->
	{#if isSelected}
		<div
			class="absolute left-1/2 -bottom-16 -translate-x-1/2 w-12 h-3 bg-black/40 rounded-full blur-sm pointer-events-none transition-opacity duration-300"
		></div>
	{/if}

	<svg
		viewBox="0 0 72 34"
		class="w-full h-full overflow-visible drop-shadow-[0_4px_6px_rgba(0,0,0,0.45)]"
	>
		<defs>
			<!-- Top face gradient -->
			<linearGradient id="top-grad-{color}" x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" stop-color={theme.highlight} />
				<stop offset="40%" stop-color={theme.topFace} />
				<stop offset="100%" stop-color={theme.leftFace} />
			</linearGradient>

			<!-- Center face gradient -->
			<linearGradient id="front-grad-{color}" x1="0%" y1="0%" x2="0%" y2="100%">
				<stop offset="0%" stop-color={theme.primary} />
				<stop offset="100%" stop-color={theme.rightFace} />
			</linearGradient>

			<!-- Left face gradient -->
			<linearGradient id="left-grad-{color}" x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" stop-color={theme.leftFace} />
				<stop offset="100%" stop-color={theme.rightFace} />
			</linearGradient>

			<!-- Right face gradient -->
			<linearGradient id="right-grad-{color}" x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" stop-color={theme.rightFace} />
				<stop offset="100%" stop-color={theme.holeShadow} />
			</linearGradient>

			<!-- Hole inner cylinder shadow -->
			<linearGradient id="hole-grad-{color}" x1="0%" y1="0%" x2="0%" y2="100%">
				<stop offset="0%" stop-color="#0f172a" />
				<stop offset="100%" stop-color="#334155" />
			</linearGradient>
		</defs>

		<!-- 1. LEFT FACET -->
		<polygon
			points="3,11 20,18 20,31 3,24"
			fill="url(#left-grad-{color})"
			stroke={theme.leftFace}
			stroke-width="0.5"
		/>

		<!-- 2. RIGHT FACET -->
		<polygon
			points="52,18 69,11 69,24 52,31"
			fill="url(#right-grad-{color})"
			stroke={theme.rightFace}
			stroke-width="0.5"
		/>

		<!-- 3. CENTER FRONT FACET -->
		<polygon
			points="20,18 52,18 52,31 20,31"
			fill="url(#front-grad-{color})"
			stroke={theme.primary}
			stroke-width="0.5"
		/>

		<!-- Bevel highlight line between center facet and bottom -->
		<line x1="20" y1="31" x2="52" y2="31" stroke="rgba(255,255,255,0.25)" stroke-width="1" />
		<line x1="20" y1="18" x2="20" y2="31" stroke="rgba(255,255,255,0.3)" stroke-width="0.8" />
		<line x1="52" y1="18" x2="52" y2="31" stroke="rgba(0,0,0,0.3)" stroke-width="0.8" />

		<!-- 4. TOP HEXAGON FACE -->
		<polygon
			points="20,4 52,4 69,11 52,18 20,18 3,11"
			fill="url(#top-grad-{color})"
			stroke="rgba(255,255,255,0.5)"
			stroke-width="0.75"
		/>

		<!-- Inner Hole (Thread Cylinder inside nut) -->
		<ellipse cx="36" cy="11" rx="10.5" ry="4.5" fill="url(#hole-grad-{color})" />
		<ellipse cx="36" cy="11" rx="10.5" ry="4.5" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="1" />

		<!-- 5. EMBOSSED SYMBOL ON FRONT FACET -->
		<g transform="translate(30, 20) scale(0.55)">
			<!-- Shadow of icon -->
			<g fill="rgba(0,0,0,0.45)" transform="translate(0, 1)">
				{@html theme.iconSvg}
			</g>
			<!-- Main icon in highlight color -->
			<g fill={theme.highlight} opacity="0.95">
				{@html theme.iconSvg}
			</g>
		</g>
	</svg>
</div>
