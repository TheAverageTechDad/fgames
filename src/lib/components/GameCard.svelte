<script lang="ts">
	import { sound } from '#lib/sound';

	interface Props {
		title: string;
		imageSrc?: string;
		badge?: string;
		badgeColor?: string;
		bgGradient?: string;
		onClick?: () => void;
		disabled?: boolean;
	}

	let {
		title,
		imageSrc,
		badge,
		badgeColor = '#06b6d4',
		bgGradient = 'from-[#2e2640] to-[#1c172b]',
		onClick,
		disabled = false
	}: Props = $props();
</script>

<button
	type="button"
	onclick={() => {
		if (!disabled && onClick) {
			sound.playTap();
			onClick();
		} else if (disabled) {
			sound.playError();
		}
	}}
	class="relative w-full aspect-[3/4] rounded-[24px] sm:rounded-[28px] overflow-hidden shadow-[0_10px_25px_rgba(0,0,0,0.55)] border-2 border-white/10 hover:border-white/30 text-left transition-all duration-200 active:scale-95 cursor-pointer group select-none bg-[#181329]"
	class:opacity-80={disabled}
	aria-label={title}
>
	{#if imageSrc}
		<img
			src={imageSrc}
			alt={title}
			class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-103 pointer-events-none"
			class:grayscale-[35%]={disabled}
		/>

		{#if disabled}
			<!-- Disabled / Coming Soon overlay badge -->
			<div class="absolute inset-0 bg-black/35 backdrop-blur-[1px] flex items-center justify-center">
				<span class="px-3 py-1 bg-black/80 border border-white/20 rounded-full text-[10px] font-black uppercase tracking-wider text-white/90 shadow-lg">
					Coming Soon
				</span>
			</div>
		{/if}
	{:else}
		<!-- Fallback HTML/CSS Card -->
		<div class="w-full h-full bg-gradient-to-b {bgGradient} p-3 flex flex-col justify-between">
			<div class="z-10">
				<h4 class="text-xs sm:text-sm font-black text-white/95 uppercase tracking-wide leading-tight group-hover:text-amber-300 transition-colors">
					{title}
				</h4>
				<div class="w-6 h-1 bg-amber-400 rounded-full mt-1"></div>
			</div>

			{#if badge}
				<div
					class="absolute -left-2 top-10 px-2.5 py-0.5 rounded-r-full text-[9px] font-black uppercase text-white shadow-md z-20"
					style="background: {badgeColor};"
				>
					{badge}
				</div>
			{/if}
		</div>
	{/if}
</button>
