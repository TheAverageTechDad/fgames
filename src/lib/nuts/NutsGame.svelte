<script lang="ts">
	import confetti from 'canvas-confetti';
	import Bolt from './Bolt.svelte';
	import Nuts3DScene from './three/Nuts3DScene.svelte';
	import { solveNutsGame, isLevelSolved } from './solver';
	import { getNutsLevel } from './generator';
	import { sound } from '#lib/sound';
	import type { NutColor, NutsLevel, NutItem } from './types';

	interface Props {
		initialLevelId?: number;
		difficulty?: 'easy' | 'medium' | 'hard' | 'extra_hard';
		onBack: () => void;
	}

	let { initialLevelId = 1, difficulty = 'medium', onBack }: Props = $props();

	let currentLevelId = $state(1);

	$effect(() => {
		currentLevelId = initialLevelId;
	});

	const currentLevel = $derived(getNutsLevel(currentLevelId, difficulty));

	// Game state
	let bolts: NutItem[][] = $state([]);
	let selectedBolt = $state<number | null>(null);
	let moveHistory: { from: number; to: number; count: number }[] = $state([]);
	let hintsCount = $state(3);
	let hintMove = $state<{ from: number; to: number } | null>(null);
	let isWon = $state(false);
	let hasAddedBolt = $state(false);

	let nutIdSeq = 0;
	// Initialize level
	function initLevel(lvl: NutsLevel) {
		nutIdSeq = 0;
		bolts = lvl.bolts.map((b) => b.map((color) => ({ id: `nut-${++nutIdSeq}-${color}`, color })));
		selectedBolt = null;
		moveHistory = [];
		hintMove = null;
		isWon = false;
		hasAddedBolt = false;
	}

	$effect(() => {
		if (currentLevel) {
			initLevel(currentLevel);
		}
	});

	// Split bolts into two rows: top row has 4 bolts (like the original video), bottom row has remaining
	const topCount = $derived(bolts.length >= 8 ? 4 : Math.ceil(bolts.length / 2));
	const topRowBolts = $derived(bolts.slice(0, topCount));
	const bottomRowBolts = $derived(bolts.slice(topCount));

	function handleBoltClick(index: number) {
		if (isWon) return;
		if (index < 0 || index >= bolts.length) {
			sound.playError();
			return;
		}

		// 1. If no bolt is selected yet
		if (selectedBolt === null) {
			const clickedBolt = bolts[index];
			if (clickedBolt.length === 0) {
				sound.playTap();
				return;
			}
			// If already complete, no need to touch
			if (clickedBolt.length === 4 && clickedBolt.every((c) => c.color === clickedBolt[0].color)) {
				sound.playTap();
				return;
			}
			selectedBolt = index;
			sound.playUnscrew();
			sound.playHaptic(12);
			return;
		}

		// 2. If same bolt tapped again -> deselect
		if (selectedBolt === index) {
			selectedBolt = null;
			sound.playScrewDown();
			sound.playHaptic(10);
			return;
		}

		// 3. Move from selectedBolt to target index
		const src = bolts[selectedBolt];
		const dst = bolts[index];

		if (dst.length >= 4) {
			sound.playError();
			sound.playHaptic([20, 30, 20]);
			return;
		}

		const topNut = src[src.length - 1];

		// Check if destination is empty OR matching color
		if (dst.length > 0 && dst[dst.length - 1].color !== topNut.color) {
			sound.playError();
			sound.playHaptic([20, 30, 20]);
			return;
		}

		// Apply move (1 nut at a time for true 3D unthreading & threading physics)
		const fromIdx = selectedBolt;
		dst.push(src.pop()!);
		bolts = bolts.map((b) => [...b]);
		moveHistory.push({ from: fromIdx, to: index, count: 1 });
		selectedBolt = null;
		hintMove = null;
		sound.playScrewDown();
		sound.playHaptic(18);

		// Check if target bolt just completed
		if (dst.length === 4 && dst.every((c) => c.color === dst[0].color)) {
			sound.playBoltComplete();
			sound.playHaptic([30, 40, 50]);
		}

		// Check win condition
		const colorMatrix = bolts.map((b) => b.map((n) => n.color));
		if (isLevelSolved(colorMatrix)) {
			isWon = true;
			sound.playVictory();
			sound.playHaptic([50, 60, 100]);
			try {
				confetti({
					particleCount: 100,
					spread: 75,
					origin: { y: 0.6 }
				});
			} catch (_) {}

			try {
				localStorage.setItem(`fgames_nuts_${difficulty}_level`, (currentLevelId + 1).toString());
			} catch (_) {}
		}
	}

	function handleUndo() {
		if (moveHistory.length === 0 || isWon) {
			sound.playError();
			sound.playHaptic([20, 30]);
			return;
		}
		const lastMove = moveHistory.pop()!;
		const src = bolts[lastMove.to];
		const dst = bolts[lastMove.from];

		for (let m = 0; m < lastMove.count; m++) {
			dst.push(src.pop()!);
		}
		bolts = bolts.map((b) => [...b]);
		selectedBolt = null;
		hintMove = null;
		sound.playScrewDown();
		sound.playHaptic(15);
	}

	function handleHint() {
		if (isWon) return;
		if (hintsCount <= 0) {
			sound.playError();
			return;
		}

		const colorMatrix = bolts.map((b) => b.map((n) => n.color));
		const solution = solveNutsGame(colorMatrix, 4);
		if (solution && solution.length > 0) {
			const next = solution[0];
			hintMove = { from: next.from, to: next.to };
			hintsCount--;
			sound.playBoltComplete();
			sound.playHaptic([20, 40]);
		} else {
			sound.playError();
		}
	}

	function handleAddBolt() {
		if (hasAddedBolt || isWon) {
			sound.playError();
			return;
		}
		bolts.push([]);
		bolts = bolts.map((b) => [...b]);
		hasAddedBolt = true;
		sound.playBoltComplete();
		sound.playHaptic([30, 50, 80]);
	}

	function handleRestart() {
		sound.playTap();
		initLevel(currentLevel);
	}

	function nextLevel() {
		sound.playTap();
		currentLevelId++;
		try {
			localStorage.setItem(`fgames_nuts_${difficulty}_level`, currentLevelId.toString());
		} catch (_) {}
	}

	function prevLevel() {
		if (currentLevelId > 1) {
			sound.playTap();
			currentLevelId--;
			try {
				localStorage.setItem(`fgames_nuts_${difficulty}_level`, currentLevelId.toString());
			} catch (_) {}
		}
	}
</script>

<div
	class="relative flex flex-col justify-between w-full h-full min-h-[640px] max-w-md mx-auto select-none overflow-hidden rounded-3xl shadow-2xl"
	style="background: radial-gradient(circle at 50% 20%, #2e224e 0%, #1a122e 60%, #120b22 100%);"
>
	<!-- TOP BAR (Exact match of video: Back, MEDIUM/Level 1, Restart) -->
	<header class="flex items-center justify-between px-6 pt-5 pb-2 z-20">
		<!-- Back Button -->
		<button
			type="button"
			onclick={onBack}
			class="w-11 h-11 bg-white/95 rounded-full flex items-center justify-center text-slate-800 shadow-lg active:scale-90 transition-transform cursor-pointer"
			aria-label="Back to main menu"
		>
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="15 18 9 12 15 6"></polyline>
			</svg>
		</button>

		<!-- Level Badge & Title with Previous/Next Arrows -->
		<div class="flex items-center gap-2.5">
			<button
				type="button"
				onclick={prevLevel}
				disabled={currentLevelId <= 1}
				class="w-7 h-7 bg-white/15 hover:bg-white/25 disabled:opacity-25 rounded-full flex items-center justify-center text-white text-xs font-black transition-transform active:scale-90 cursor-pointer"
				aria-label="Previous level"
			>
				◀
			</button>

			<div class="flex flex-col items-center">
				<span class="text-[11px] font-extrabold uppercase tracking-widest text-slate-300/80 mb-0.5">
					{difficulty.replace('_', ' ')}
				</span>
				<h2 class="text-2xl font-black text-white tracking-wide drop-shadow-md">
					{currentLevel.name}
				</h2>
			</div>

			<button
				type="button"
				onclick={nextLevel}
				class="w-7 h-7 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white text-xs font-black transition-transform active:scale-90 cursor-pointer"
				aria-label="Next level"
			>
				▶
			</button>
		</div>

		<!-- Restart Button -->
		<button
			type="button"
			onclick={handleRestart}
			class="w-11 h-11 bg-white/95 rounded-full flex items-center justify-center text-slate-800 shadow-lg active:scale-90 transition-transform cursor-pointer"
			aria-label="Restart level"
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l6 5.81" />
			</svg>
		</button>
	</header>

	<!-- PLAYING FIELD: Three.js 3D WebGL Scene with True Unscrewing Physics -->
	<main class="flex-1 w-full h-full flex flex-col items-center justify-center relative overflow-hidden z-10 min-h-[420px]">
		<Nuts3DScene
			{bolts}
			{selectedBolt}
			{hintMove}
			{isWon}
			onBoltClick={handleBoltClick}
		/>
	</main>

	<!-- BOTTOM ACTION CONTROLS (Undo, Hint, Add Bolt) -->
	<footer class="flex items-center justify-around px-8 pb-8 pt-2 z-20">
		<!-- Undo Button -->
		<div class="flex flex-col items-center">
			<button
				type="button"
				onclick={handleUndo}
				disabled={moveHistory.length === 0 || isWon}
				class="w-14 h-14 rounded-full bg-gradient-to-b from-amber-400 to-amber-500 shadow-[0_6px_0_#b45309] text-white flex items-center justify-center active:translate-y-1 active:shadow-[0_2px_0_#b45309] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
				aria-label="Undo move"
			>
				<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
					<path d="M9 14 4 9l5-5" />
					<path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
				</svg>
			</button>
			<span class="text-xs font-bold text-amber-200/90 mt-1.5">Undo</span>
		</div>

		<!-- Hint Button with Badge -->
		<div class="flex flex-col items-center relative">
			<button
				type="button"
				onclick={handleHint}
				disabled={isWon || hintsCount <= 0}
				class="w-14 h-14 rounded-full bg-gradient-to-b from-amber-400 to-amber-500 shadow-[0_6px_0_#b45309] text-white flex items-center justify-center active:translate-y-1 active:shadow-[0_2px_0_#b45309] transition-all cursor-pointer disabled:opacity-50"
				aria-label="Use hint"
			>
				<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
					<path d="M9 18h6" />
					<path d="M10 22h4" />
				</svg>
			</button>
			<!-- Badge Count -->
			<span class="absolute -top-1.5 -right-1 bg-white text-slate-800 text-xs font-extrabold w-5 h-5 rounded-full flex items-center justify-center shadow-md">
				{hintsCount}
			</span>
			<span class="text-xs font-bold text-amber-200/90 mt-1.5">Hint</span>
		</div>

		<!-- Add Bolt (+1) Button -->
		<div class="flex flex-col items-center relative">
			<button
				type="button"
				onclick={handleAddBolt}
				disabled={hasAddedBolt || isWon}
				class="w-14 h-14 rounded-full bg-gradient-to-b from-amber-400 to-amber-500 shadow-[0_6px_0_#b45309] text-white flex items-center justify-center active:translate-y-1 active:shadow-[0_2px_0_#b45309] transition-all cursor-pointer disabled:opacity-50"
				aria-label="Add extra bolt"
			>
				<div class="flex items-center font-black text-xl leading-none">
					<span>+1</span>
				</div>
			</button>
			<span class="text-xs font-bold text-amber-200/90 mt-1.5">Add</span>
		</div>
	</footer>

	<!-- LEVEL COMPLETE MODAL -->
	{#if isWon}
		<div
			class="absolute inset-0 bg-black/75 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 animate-pop-in"
		>
			<div class="w-full max-w-xs bg-gradient-to-b from-[#2a1d49] to-[#1a122e] rounded-3xl p-6 border-2 border-amber-400/40 shadow-2xl flex flex-col items-center text-center">
				<div class="text-5xl mb-2 animate-bounce">🏆</div>
				<h3 class="text-2xl font-black text-amber-400 mb-1 tracking-wider uppercase">Level Cleared!</h3>
				<p class="text-slate-300 text-sm mb-4">All nuts sorted with perfection!</p>

				<!-- Stars -->
				<div class="flex gap-2 text-3xl mb-6 text-amber-400">
					<span>⭐</span>
					<span>⭐</span>
					<span>⭐</span>
				</div>

				<div class="flex flex-col gap-3 w-full">
					<button
						type="button"
						onclick={nextLevel}
						class="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-extrabold rounded-2xl shadow-[0_5px_0_#9a3412] active:translate-y-1 active:shadow-none transition-all cursor-pointer text-lg tracking-wide"
					>
						NEXT LEVEL
					</button>

					<button
						type="button"
						onclick={handleRestart}
						class="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl transition-all cursor-pointer text-sm"
					>
						Replay
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
