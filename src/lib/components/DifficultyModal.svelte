<script lang="ts">
	import { sound } from '#lib/sound';
	import HowToPlayModal from './HowToPlayModal.svelte';
	import SettingsModal from './SettingsModal.svelte';
	import { onMount } from 'svelte';

	interface Props {
		gameType: 'nuts' | 'escape';
		currentDifficulty: 'easy' | 'medium' | 'hard' | 'extra_hard';
		onSelectDifficulty: (d: 'easy' | 'medium' | 'hard' | 'extra_hard') => void;
		onPlay: () => void;
		onBack: () => void;
	}

	let {
		gameType,
		currentDifficulty = 'medium',
		onSelectDifficulty,
		onPlay,
		onBack
	}: Props = $props();

	let showHowToPlay = $state(false);
	let showSettings = $state(false);

	const difficulties: ('easy' | 'medium' | 'hard' | 'extra_hard')[] = [
		'easy',
		'medium',
		'hard',
		'extra_hard'
	];

	const difficultyLabels = ['EASY', 'MEDIUM', 'HARD', 'EXTRA HARD'];

	let sliderPos = $state(0.333);
	let isDragging = $state(false);
	let trackElement: HTMLDivElement | null = $state(null);

	// Saved levels per difficulty
	let savedLevels: Record<string, number> = $state({
		easy: 1,
		medium: 1,
		hard: 1,
		extra_hard: 1
	});

	$effect(() => {
		const idx = difficulties.indexOf(currentDifficulty);
		if (idx !== -1 && !isDragging) {
			sliderPos = idx / 3;
		}
	});

	onMount(() => {
		savedLevels.medium = gameType === 'escape' ? 19 : 1;
		try {
			for (const d of difficulties) {
				const key = `fgames_${gameType}_${d}_level`;
				const stored = localStorage.getItem(key);
				if (stored) {
					const parsed = parseInt(stored, 10);
					if (Number.isFinite(parsed) && parsed > 0) savedLevels[d] = parsed;
				}
			}
		} catch {}
	});

	// Active difficulty index derived from slider position (0 to 3)
	const activeIndex = $derived(Math.round(sliderPos * 3));
	const activeDifficulty = $derived(difficulties[activeIndex]);

	// Color interpolation across the 4 difficulty stops
	function getInterpolatedColor(t: number): string {
		const stops = [
			[34, 197, 94],   // Easy: green (#22c55e)
			[245, 158, 11],  // Medium: orange (#f59e0b)
			[239, 68, 68],   // Hard: red (#ef4444)
			[147, 51, 234]   // Extra Hard: purple (#9333ea)
		];
		const scaled = Math.max(0, Math.min(3, t * 3));
		const idx = Math.min(2, Math.floor(scaled));
		const f = scaled - idx;
		const c1 = stops[idx];
		const c2 = stops[idx + 1];
		const r = Math.round(c1[0] + (c2[0] - c1[0]) * f);
		const g = Math.round(c1[1] + (c2[1] - c1[1]) * f);
		const b = Math.round(c1[2] + (c2[2] - c1[2]) * f);
		return `rgb(${r}, ${g}, ${b})`;
	}

	const activeColor = $derived(getInterpolatedColor(sliderPos));
	const currentLevelNumber = $derived(savedLevels[activeDifficulty] || 1);

	// Pointer drag handling
	function updateSliderFromPointer(clientX: number) {
		if (!trackElement) return;
		const rect = trackElement.getBoundingClientRect();
		const raw = (clientX - rect.left) / rect.width;
		const clamped = Math.max(0, Math.min(1, raw));
		sliderPos = clamped;
	}

	function handlePointerDown(e: PointerEvent) {
		isDragging = true;
		(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
		updateSliderFromPointer(e.clientX);
		sound.playTap();
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) return;
		updateSliderFromPointer(e.clientX);
	}

	function handlePointerUp(e: PointerEvent) {
		if (!isDragging) return;
		isDragging = false;
		(e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);

		// Snap to closest discrete difficulty step
		const snappedIndex = Math.round(sliderPos * 3);
		sliderPos = snappedIndex / 3;
		const targetDiff = difficulties[snappedIndex];
		onSelectDifficulty(targetDiff);
		sound.playBoltComplete();
	}

	function selectStop(index: number) {
		sound.playTap();
		sliderPos = index / 3;
		onSelectDifficulty(difficulties[index]);
	}
</script>

<div
	class="relative flex flex-col justify-between w-full h-full min-h-0 max-w-md mx-auto select-none overflow-y-auto rounded-3xl shadow-2xl"
	style="background: {gameType === 'nuts' ? '#22193b' : '#232b28'};"
>
	<!-- TOP SECTION: HEADER & INSTRUCTIONS -->
	<div class="px-6 pt-5 pb-6 flex flex-col items-center text-center z-10">
		<!-- Top Bar -->
		<div class="flex items-center justify-between w-full mb-6">
			<button
				type="button"
				onclick={() => {
					sound.playTap();
					onBack();
				}}
				class="w-11 h-11 bg-white/95 rounded-full flex items-center justify-center text-slate-800 shadow-lg active:scale-90 transition-transform cursor-pointer"
				aria-label="Back"
			>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 18 9 12 15 6"></polyline>
				</svg>
			</button>

			<h2 class="text-2xl font-black text-white tracking-wider uppercase drop-shadow-md">
				{gameType === 'nuts' ? 'NUTS AND BOLTS' : 'ESCAPE'}
			</h2>

			<button
				type="button"
				onclick={() => {
					sound.playTap();
					showSettings = true;
				}}
				class="w-11 h-11 bg-white/95 rounded-full flex items-center justify-center text-slate-800 shadow-lg active:scale-90 transition-transform cursor-pointer"
				aria-label="Settings"
			>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="3"></circle>
					<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
				</svg>
			</button>
		</div>

		<!-- Subtitle Instruction -->
		<p class="text-sm font-bold text-white/90 leading-snug max-w-xs drop-shadow-sm">
			{#if gameType === 'nuts'}
				Move nuts between the bolts until all the nuts on each bolt are the same colour!
				<span class="block mt-1 font-normal text-white/80">You can only move nuts onto other nuts of the same colour.</span>
			{:else}
				Slide the cars to clear a path and move the red car out of the board!
			{/if}
		</p>
	</div>

	<!-- BOTTOM CREAM CARD (Matching Frames 004 and 028) -->
	<div class="relative bg-[#f6eee3] rounded-t-[40px] px-6 pt-14 pb-8 flex flex-col items-center shadow-[0_-8px_20px_rgba(0,0,0,0.3)]">
		<!-- Circular Avatar floating on top border -->
		<div
			class="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-[#f6eee3] p-1.5 shadow-xl flex items-center justify-center"
		>
			<div
				class="relative w-full h-full rounded-full flex items-center justify-center border-4 border-black shadow-inner overflow-hidden"
				style="background: {activeColor}; transition: {isDragging ? 'none' : 'background 0.25s ease-out'};"
			>
				<!-- 1. Easy Face (Green Happy Face) -->
				<div
					class="absolute inset-0 flex items-center justify-center transition-opacity"
					style="opacity: {Math.max(0, 1 - Math.abs(sliderPos * 3 - 0) * 1.5)};"
				>
					<svg viewBox="0 0 64 64" class="w-14 h-14">
						<!-- Eyes -->
						<circle cx="22" cy="28" r="4.5" fill="#000" />
						<circle cx="42" cy="28" r="4.5" fill="#000" />
						<circle cx="23.5" cy="26.5" r="1.5" fill="#fff" />
						<circle cx="43.5" cy="26.5" r="1.5" fill="#fff" />
						<!-- Smile -->
						<path d="M 22 38 Q 32 48 42 38" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" />
					</svg>
				</div>

				<!-- 2. Medium Face (Orange Smug Face - Exact match to frame 004) -->
				<div
					class="absolute inset-0 flex items-center justify-center transition-opacity"
					style="opacity: {Math.max(0, 1 - Math.abs(sliderPos * 3 - 1) * 1.5)};"
				>
					<svg viewBox="0 0 64 64" class="w-14 h-14">
						<!-- Smug half-circle eyes with flat top -->
						<path d="M 17 28 Q 23 37 29 28 Z" fill="#000" />
						<path d="M 35 28 Q 41 37 47 28 Z" fill="#000" />
						<!-- Smirk mouth -->
						<path d="M 27 41 Q 33 41 38 38" fill="none" stroke="#000" stroke-width="4.5" stroke-linecap="round" />
					</svg>
				</div>

				<!-- 3. Hard Face (Red Devil with Horns - Exact match to frame 005) -->
				<div
					class="absolute inset-0 flex items-center justify-center transition-opacity"
					style="opacity: {Math.max(0, 1 - Math.abs(sliderPos * 3 - 2) * 1.5)};"
				>
					<svg viewBox="0 0 64 64" class="w-15 h-15">
						<!-- Devil Horns -->
						<path d="M 12 18 C 10 10 16 7 19 14 C 18 19 15 20 12 18 Z" fill="#000" />
						<path d="M 52 18 C 54 10 48 7 45 14 C 46 19 49 20 52 18 Z" fill="#000" />
						<!-- Slanted devil eyes -->
						<polygon points="17,25 29,31 23,34" fill="#000" />
						<polygon points="47,25 35,31 41,34" fill="#000" />
						<!-- Sly smirk -->
						<path d="M 27 43 Q 34 43 41 38" fill="none" stroke="#000" stroke-width="4.5" stroke-linecap="round" />
					</svg>
				</div>

				<!-- 4. Extra Hard Face (Purple Fierce Devil - Exact match to frame 006) -->
				<div
					class="absolute inset-0 flex items-center justify-center transition-opacity"
					style="opacity: {Math.max(0, 1 - Math.abs(sliderPos * 3 - 3) * 1.5)};"
				>
					<svg viewBox="0 0 64 64" class="w-15 h-15">
						<!-- Big Fierce Horns -->
						<path d="M 10 20 C 7 8 16 5 21 13 C 19 21 14 22 10 20 Z" fill="#000" />
						<path d="M 54 20 C 57 8 48 5 43 13 C 45 21 50 22 54 20 Z" fill="#000" />
						<!-- Angled fierce eyes -->
						<polygon points="15,26 30,34 22,37" fill="#000" />
						<polygon points="49,26 34,34 42,37" fill="#000" />
						<!-- Menacing mouth with fangs -->
						<path d="M 26 43 Q 32 46 39 40" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round" />
					</svg>
				</div>
			</div>
		</div>

		<!-- Difficulty Title Reel (Smooth vertical slide & cross-fade) -->
		<div class="h-10 relative overflow-hidden w-full flex justify-center mt-2 mb-4">
			{#each difficultyLabels as label, idx}
				<h3
					class="absolute text-3xl font-black tracking-wide uppercase transition-all duration-150"
					style="
						color: {activeColor};
						opacity: {Math.max(0, 1 - Math.abs(sliderPos * 3 - idx) * 1.5)};
						transform: translateY({(idx - sliderPos * 3) * 36}px);
					"
				>
					{label}
				</h3>
			{/each}
		</div>

		<!-- Interactive Draggable Difficulty Slider Track -->
		<div
			bind:this={trackElement}
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerUp}
			class="w-full max-w-xs h-12 bg-slate-300 rounded-full p-1.5 flex items-center relative shadow-inner mb-8 cursor-pointer touch-none select-none"
			role="slider"
			tabindex="0"
			aria-valuemin="0"
			aria-valuemax="3"
			aria-valuenow={activeIndex}
			aria-label="Difficulty Slider"
		>
			<!-- Smooth Colored Gradient Track Fill -->
			<div
				class="absolute left-1.5 top-1.5 bottom-1.5 rounded-full"
				style="
					background: linear-gradient(90deg, #22c55e 0%, #f59e0b 33%, #ef4444 66%, #9333ea 100%);
					width: calc({sliderPos * 100}% - {sliderPos * 16}px + 16px);
					transition: {isDragging ? 'none' : 'width 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'};
				"
			></div>

			<!-- 4 Discrete Snap Stop Dots -->
			<div class="relative z-10 w-full flex justify-between items-center px-2 pointer-events-none">
				{#each [0, 1, 2, 3] as step}
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							selectStop(step);
						}}
						class="w-4 h-4 rounded-full pointer-events-auto flex items-center justify-center"
						aria-label="Set to {difficultyLabels[step]}"
					>
						<span
							class="w-2.5 h-2.5 rounded-full transition-transform"
							style="background: {step <= sliderPos * 3 + 0.15 ? 'rgba(255,255,255,0.7)' : 'rgba(100,116,139,0.7)'};"
						></span>
					</button>
				{/each}
			</div>

			<!-- Big White Draggable Thumb with Colored Center Dot -->
			<div
				class="absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-[0_4px_10px_rgba(0,0,0,0.35)] flex items-center justify-center pointer-events-none"
				style="
					left: calc({sliderPos * 100}% - {sliderPos * 40}px);
					transition: {isDragging ? 'none' : 'left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'};
				"
			>
				<div
					class="w-5 h-5 rounded-full shadow-inner transition-colors duration-150"
					style="background: {activeColor};"
				></div>
			</div>
		</div>

		<!-- Play and Help Buttons Row -->
		<div class="flex items-center gap-3 w-full max-w-xs">
			<!-- Big Dynamic Play Button -->
			<button
				type="button"
				onclick={() => {
					sound.playTap();
					onPlay();
				}}
				class="flex-1 py-4 text-white rounded-2xl active:translate-y-1 active:shadow-none transition-all flex flex-col items-center justify-center cursor-pointer font-black shadow-[0_6px_0_rgba(0,0,0,0.25)]"
				style="
					background: {activeColor};
					transition: {isDragging ? 'none' : 'background 0.25s ease-out'};
				"
			>
				<span class="text-2xl tracking-wider uppercase leading-none drop-shadow-sm">PLAY</span>
				<span class="text-xs text-white/90 font-bold mt-0.5">
					Level {currentLevelNumber}
				</span>
			</button>

			<!-- Help ? Button -->
			<button
				type="button"
				onclick={() => {
					sound.playTap();
					showHowToPlay = true;
				}}
				class="w-16 h-16 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-2xl shadow-[0_6px_0_#3730a3] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center cursor-pointer font-black text-2xl"
				aria-label="How to play rules"
			>
				?
			</button>
		</div>
	</div>

	<!-- Modals -->
	{#if showHowToPlay}
		<HowToPlayModal {gameType} onClose={() => (showHowToPlay = false)} />
	{/if}

	{#if showSettings}
		<SettingsModal onClose={() => (showSettings = false)} />
	{/if}
</div>
