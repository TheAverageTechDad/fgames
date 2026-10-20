<script lang="ts">
	import Nut from './Nut.svelte';
	import type { NutColor } from './types';

	interface Props {
		index: number;
		nuts: NutColor[];
		capacity?: number;
		isSelected?: boolean;
		isHintSource?: boolean;
		isHintTarget?: boolean;
		isLocked?: boolean;
		scale?: number;
		onSelect: (index: number) => void;
	}

	let {
		index,
		nuts,
		capacity = 4,
		isSelected = false,
		isHintSource = false,
		isHintTarget = false,
		isLocked = false,
		scale = 1,
		onSelect
	}: Props = $props();

	// Check if this bolt is fully completed with 4 matching nuts
	const isComplete = $derived(
		nuts.length === capacity && nuts.every((n) => n === nuts[0])
	);
</script>

<button
	type="button"
	class="relative flex flex-col items-center justify-end group cursor-pointer focus:outline-none transition-transform active:scale-95 py-1 px-0.5"
	style="transform: scale({scale}); transform-origin: bottom center;"
	onclick={() => onSelect(index)}
	disabled={isLocked}
	aria-label="Bolt {index + 1}"
>
	<!-- Hint Glow Rings -->
	{#if isHintSource}
		<div
			class="absolute -top-4 w-16 h-16 rounded-full border-4 border-amber-400 bg-amber-400/20 animate-ping pointer-events-none"
		></div>
	{/if}
	{#if isHintTarget}
		<div
			class="absolute -bottom-2 w-20 h-8 rounded-full border-2 border-emerald-400 bg-emerald-400/30 animate-pulse pointer-events-none"
		></div>
	{/if}

	<!-- Completed Bolt Crown Glow / Sparkles -->
	{#if isComplete}
		<div class="absolute -top-6 text-amber-300 animate-bounce pointer-events-none text-xl">
			✨
		</div>
	{/if}

	<!-- Container for the Screw Rod and Stacked Nuts -->
	<div class="relative w-[76px] h-[132px] flex flex-col items-center justify-end">
		<!-- The Metallic Threaded Screw Rod in the center -->
		<div
			class="absolute bottom-2 left-1/2 -translate-x-1/2 w-[18px] h-[122px] rounded-t-full overflow-hidden flex flex-col justify-end shadow-inner"
			style="background: linear-gradient(90deg, #64748b 0%, #cbd5e1 45%, #94a3b8 70%, #475569 100%);"
		>
			<!-- Screw Threads (Repeated SVG thread ridges) -->
			<svg width="18" height="122" class="w-full h-full opacity-60">
				<pattern id="threads-{index}" width="18" height="8" patternUnits="userSpaceOnUse">
					<line x1="0" y1="2" x2="18" y2="6" stroke="#334155" stroke-width="1.8" />
					<line x1="0" y1="3" x2="18" y2="7" stroke="#ffffff" stroke-width="0.8" opacity="0.8" />
				</pattern>
				<rect width="18" height="122" fill="url(#threads-{index})" />
			</svg>
		</div>

		<!-- Stacked Nuts (from bottom to top) -->
		<div class="relative z-10 flex flex-col-reverse items-center justify-end w-full">
			{#each nuts as color, idx (idx)}
				{@const isTop = idx === nuts.length - 1}
				<Nut {color} isSelected={isTop && isSelected} />
			{/each}
		</div>

		<!-- Circular Pedestal Base -->
		<div class="relative z-0 -mt-2 w-[72px] h-[22px]">
			{#if isLocked}
				<!-- Dark locked socket base -->
				<svg viewBox="0 0 72 22" class="w-full h-full">
					<ellipse cx="36" cy="14" rx="30" ry="7" fill="#151322" />
					<ellipse cx="36" cy="10" rx="30" ry="7" fill="#2d2942" />
					<ellipse cx="36" cy="9" rx="26" ry="5.5" fill="#1a1727" />
					<ellipse cx="36" cy="8" rx="8" ry="3" fill="#3b3558" />
					<rect x="30" y="3" width="12" height="6" rx="2" fill="#3b3558" />
				</svg>
			{:else}
				<!-- Silver metallic circular pedestal -->
				<svg viewBox="0 0 72 22" class="w-full h-full drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
					<defs>
						<linearGradient id="base-rim-{index}" x1="0%" y1="0%" x2="100%" y2="0%">
							<stop offset="0%" stop-color="#475569" />
							<stop offset="50%" stop-color="#cbd5e1" />
							<stop offset="100%" stop-color="#334155" />
						</linearGradient>
						<linearGradient id="base-top-{index}" x1="0%" y1="0%" x2="0%" y2="100%">
							<stop offset="0%" stop-color="#e2e8f0" />
							<stop offset="100%" stop-color="#94a3b8" />
						</linearGradient>
					</defs>
					<!-- Base bottom thickness -->
					<ellipse cx="36" cy="14" rx="34" ry="7.5" fill="#334155" />
					<rect x="2" y="7" width="68" height="7" fill="url(#base-rim-{index})" />
					<!-- Base top ellipse face -->
					<ellipse
						cx="36"
						cy="7"
						rx="34"
						ry="7.5"
						fill="url(#base-top-{index})"
						stroke="rgba(255,255,255,0.7)"
						stroke-width="0.75"
					/>
					<!-- Inner inset ring -->
					<ellipse cx="36" cy="7" rx="24" ry="5.5" fill="none" stroke="#64748b" stroke-width="0.8" />
				</svg>
			{/if}
		</div>
	</div>
</button>
