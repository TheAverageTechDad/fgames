<script lang="ts">
	import GameCard from '#lib/components/GameCard.svelte';
	import DifficultyModal from '#lib/components/DifficultyModal.svelte';
	import SettingsModal from '#lib/components/SettingsModal.svelte';
	import NutsGame from '#lib/nuts/NutsGame.svelte';
	import EscapeGame from '#lib/escape/EscapeGame.svelte';
	import { sound } from '#lib/sound';

	import { onMount } from 'svelte';

	type Screen = 'home' | 'pregame' | 'game_nuts' | 'game_escape';
	type Difficulty = 'easy' | 'medium' | 'hard' | 'extra_hard';

	let currentScreen = $state<Screen>('home');
	let selectedGame = $state<'nuts' | 'escape'>('nuts');
	let currentDifficulty = $state<Difficulty>('medium');
	let initialNutsLevel = $state<number>(1);
	let initialEscapeLevel = $state<number>(1);
	let showSettings = $state(false);

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const g = params.get('game');
		const lvl = params.get('level');
		const diff = params.get('diff') as Difficulty | null;
		if (diff && ['easy', 'medium', 'hard', 'extra_hard'].includes(diff)) {
			currentDifficulty = diff;
		}
		if (lvl) {
			const parsed = parseInt(lvl, 10);
			if (!isNaN(parsed)) {
				initialEscapeLevel = parsed;
				initialNutsLevel = parsed;
			}
		}
		if (g === 'nuts') currentScreen = 'game_nuts';
		else if (g === 'escape') currentScreen = 'game_escape';
		else if (g === 'pregame') currentScreen = 'pregame';
	});

	function openPreGame(game: 'nuts' | 'escape') {
		selectedGame = game;
		currentScreen = 'pregame';
	}

	function startGame() {
		try {
			const saved = localStorage.getItem(`fgames_${selectedGame}_${currentDifficulty}_level`);
			if (saved) {
				const lvl = parseInt(saved, 10);
				if (!isNaN(lvl)) {
					if (selectedGame === 'nuts') initialNutsLevel = lvl;
					else initialEscapeLevel = lvl;
				}
			} else {
				if (selectedGame === 'nuts') initialNutsLevel = 1;
				else initialEscapeLevel = 1;
			}
		} catch {}

		if (selectedGame === 'nuts') {
			currentScreen = 'game_nuts';
		} else {
			currentScreen = 'game_escape';
		}
	}

	function goToHome() {
		sound.playTap();
		currentScreen = 'home';
	}
</script>

<svelte:head>
	<title>Offline Games - Nuts & Bolts & Escape</title>
</svelte:head>

<div class="min-h-screen w-full bg-[#0f0c18] flex items-center justify-center p-0 sm:p-4 text-white font-['Fredoka','Nunito',sans-serif]">
	<div class="w-full sm:max-w-md h-dvh sm:h-[840px] bg-[#171224] sm:rounded-[36px] overflow-hidden flex flex-col relative shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/5">
		
		<!-- 1. HOME SCREEN (Offline Games Hub) -->
		{#if currentScreen === 'home'}
			<div class="flex flex-col h-full overflow-y-auto bg-[#f8efdf] text-[#251a35]">
				<!-- Header matching video frame 025 -->
				<header class="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 sticky top-0 bg-[#f8efdf]/95 backdrop-blur-md z-30 border-b border-[#251a35]/10">
					<!-- Menu hamburger -->
					<button
						type="button"
						onclick={() => {
							sound.playTap();
							showSettings = true;
						}}
						class="w-10 h-10 rounded-xl bg-[#251a35] hover:bg-[#3a2c52] flex flex-col items-center justify-center gap-1 cursor-pointer"
						aria-label="Settings"
					>
						<span class="w-5 h-0.5 bg-white rounded-full"></span>
						<span class="w-5 h-0.5 bg-white rounded-full"></span>
						<span class="w-5 h-0.5 bg-white rounded-full"></span>
					</button>

					<div class="flex items-center gap-2 px-3 py-2 bg-white/80 text-[#315344] rounded-full font-black text-xs shadow-sm">
						<span class="w-2 h-2 rounded-full bg-[#37a46b]"></span>
						PLAY OFFLINE
					</div>
				</header>

				<!-- Hero Header Subtitle -->
				<div class="px-5 pt-4 pb-2 text-center">
					<h1 class="text-3xl sm:text-4xl font-black tracking-tight text-[#251a35]">
						OFFLINE GAMES
					</h1>
					<p class="text-sm font-bold text-[#6f6175] mt-1">
						Two satisfying puzzles, ready whenever you are.
					</p>
				</div>

				<!-- Games Grid -->
				<main class="flex-1 px-4 py-3">
					<div class="grid grid-cols-2 gap-3.5 pb-6">
						<!-- Card 1: NUTS AND BOLTS (Featured) -->
						<GameCard
							title="NUTS AND BOLTS"
							imageSrc="/cards/card_nuts_bolts.jpg"
							onClick={() => openPreGame('nuts')}
						/>

						<!-- Card 2: ESCAPE (Featured) -->
						<GameCard
							title="ESCAPE"
							imageSrc="/cards/card_escape.jpg"
							onClick={() => openPreGame('escape')}
						/>
					</div>
				</main>
				<p class="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs font-bold text-[#8a7d88]">Your progress saves on this device.</p>
			</div>

		<!-- 2. PRE-GAME DIFFICULTY MODAL -->
		{:else if currentScreen === 'pregame'}
			<DifficultyModal
				gameType={selectedGame}
				{currentDifficulty}
				onSelectDifficulty={(d: Difficulty) => (currentDifficulty = d)}
				onPlay={startGame}
				onBack={goToHome}
			/>

		<!-- 3. NUTS AND BOLTS GAME -->
		{:else if currentScreen === 'game_nuts'}
			<NutsGame
				initialLevelId={initialNutsLevel}
				difficulty={currentDifficulty}
				onBack={() => (currentScreen = 'pregame')}
			/>

		<!-- 4. ESCAPE GAME -->
		{:else if currentScreen === 'game_escape'}
			<EscapeGame
				initialLevelId={initialEscapeLevel}
				difficulty={currentDifficulty}
				onBack={() => (currentScreen = 'pregame')}
			/>
		{/if}

		<!-- Settings Modal -->
		{#if showSettings}
			<SettingsModal onClose={() => (showSettings = false)} />
		{/if}

	</div>
</div>
