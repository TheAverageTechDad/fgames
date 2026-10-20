<script lang="ts">
	import confetti from 'canvas-confetti';
	import Vehicle from './Vehicle.svelte';
	import { buildGrid, solveEscape, type VehicleMove } from './solver';
	import { getEscapeLevel } from './generator';
	import { sound } from '#lib/sound';
	import type { EscapeLevel, VehicleData } from './types';
	import { onMount } from 'svelte';

	interface Props {
		initialLevelId?: number;
		difficulty?: 'easy' | 'medium' | 'hard' | 'extra_hard';
		onBack: () => void;
	}

	let { initialLevelId = 1, difficulty = 'medium', onBack }: Props = $props();

	let currentLevelId = $state(1);
	let unlockedThrough = $state(1);

	$effect(() => {
		currentLevelId = initialLevelId;
		unlockedThrough = initialLevelId;
	});

	const currentLevel = $derived(getEscapeLevel(currentLevelId, difficulty));

	// Vehicles state
	let vehicles: VehicleData[] = $state([]);
	let moveHistory: { id: string; prevRow: number; prevCol: number }[] = $state([]);
	let hintsCount = $state(3);
	let hintMove = $state<VehicleMove | null>(null);
	let isWon = $state(false);
	let isExiting = $state(false);

	// Board geometry
	let boardSize = $state(350);
	const PADDING = 10;
	const GAP = 5;
	const CELL_SIZE = $derived((boardSize - PADDING * 2 - GAP * 5) / 6);

	onMount(() => {
		const updateBoardSize = () => {
			boardSize = Math.max(180, Math.min(350, window.innerWidth - 32, window.innerHeight - 180));
		};
		updateBoardSize();
		window.addEventListener('resize', updateBoardSize);
		return () => window.removeEventListener('resize', updateBoardSize);
	});

	// Dragging state
	let activeVehicleId = $state<string | null>(null);
	let dragOffset = $state(0); // in pixels along movement axis
	let dragMinPx = $state(0);
	let dragMaxPx = $state(0);
	let dragStartPointer = 0;
	let dragStartPos = 0; // initial row or col
	let hasHitBump = false;

	function initLevel(lvl: EscapeLevel) {
		// Clone vehicles and verify no overlaps exist
		const grid: (string | null)[][] = Array.from({ length: 6 }, () => Array(6).fill(null));
		const safeVehicles: VehicleData[] = [];

		for (const v of lvl.vehicles) {
			const clone = { ...v };
			let hasConflict = false;
			for (let i = 0; i < clone.length; i++) {
				const r = clone.orientation === 'V' ? clone.row + i : clone.row;
				const c = clone.orientation === 'H' ? clone.col + i : clone.col;
				if (r >= 0 && r < 6 && c >= 0 && c < 6 && grid[r][c] !== null) {
					hasConflict = true;
					break;
				}
			}
			if (!hasConflict) {
				for (let i = 0; i < clone.length; i++) {
					const r = clone.orientation === 'V' ? clone.row + i : clone.row;
					const c = clone.orientation === 'H' ? clone.col + i : clone.col;
					if (r >= 0 && r < 6 && c >= 0 && c < 6) grid[r][c] = clone.id;
				}
			}
			safeVehicles.push(clone);
		}

		vehicles = safeVehicles;
		moveHistory = [];
		hintsCount = 3;
		hintMove = null;
		isWon = false;
		isExiting = false;
		activeVehicleId = null;
		dragOffset = 0;
		hasHitBump = false;
	}

	$effect(() => {
		if (currentLevel) {
			initLevel(currentLevel);
		}
	});

	// Compute allowed movement range for a vehicle
	function getMovementRange(v: VehicleData) {
		const grid = buildGrid(vehicles);

		if (v.orientation === 'H') {
			// Row is fixed. Find min col
			let minCol = v.col;
			while (minCol > 0 && grid[v.row][minCol - 1] === null) {
				minCol--;
			}
			// Find max col
			let maxCol = v.col;
			while (maxCol + v.length < 6 && grid[v.row][maxCol + v.length] === null) {
				maxCol++;
			}
			// For red target truck, if it can reach col 4 and exit is clear, allow sliding past col 4!
			const extraExitCol = v.isTarget && maxCol === 4 ? 6 : maxCol;

			return { minPos: minCol, maxPos: extraExitCol };
		} else {
			// Col is fixed. Find min row
			let minRow = v.row;
			while (minRow > 0 && grid[minRow - 1][v.col] === null) {
				minRow--;
			}
			// Find max row
			let maxRow = v.row;
			while (maxRow + v.length < 6 && grid[maxRow + v.length][v.col] === null) {
				maxRow++;
			}
			return { minPos: minRow, maxPos: maxRow };
		}
	}

	function handlePointerDown(e: PointerEvent, v: VehicleData) {
		if (isWon || isExiting) return;
		if (e.currentTarget instanceof HTMLElement) {
			e.currentTarget.setPointerCapture(e.pointerId);
		}

		activeVehicleId = v.id;
		hintMove = null;
		hasHitBump = false;

		const { minPos, maxPos } = getMovementRange(v);
		const stepPx = CELL_SIZE + GAP;

		if (v.orientation === 'H') {
			dragStartPointer = e.clientX;
			dragStartPos = v.col;
			dragMinPx = (minPos - v.col) * stepPx;
			dragMaxPx = (maxPos - v.col) * stepPx;
		} else {
			dragStartPointer = e.clientY;
			dragStartPos = v.row;
			dragMinPx = (minPos - v.row) * stepPx;
			dragMaxPx = (maxPos - v.row) * stepPx;
		}

		dragOffset = 0;
		sound.playCarSlide();
	}

	function handlePointerMove(e: PointerEvent) {
		if (!activeVehicleId) return;

		const v = vehicles.find((item) => item.id === activeVehicleId);
		if (!v) return;

		const currentPointer = v.orientation === 'H' ? e.clientX : e.clientY;
		const rawDelta = currentPointer - dragStartPointer;

		// Elastic bumper resistance when pulling past allowed bounds
		if (rawDelta < dragMinPx) {
			const over = dragMinPx - rawDelta;
			dragOffset = dragMinPx - Math.min(6, Math.log1p(over) * 2.5);
			if (!hasHitBump && over > 5) {
				hasHitBump = true;
				sound.playCarBump();
				sound.playHaptic(10);
			}
		} else if (rawDelta > dragMaxPx) {
			const over = rawDelta - dragMaxPx;
			dragOffset = dragMaxPx + Math.min(6, Math.log1p(over) * 2.5);
			if (!hasHitBump && over > 5) {
				hasHitBump = true;
				sound.playCarBump();
				sound.playHaptic(10);
			}
		} else {
			dragOffset = rawDelta;
			hasHitBump = false;
		}
	}

	function handlePointerUp(e: PointerEvent) {
		if (!activeVehicleId) return;
		if (e.type === 'pointercancel') {
			activeVehicleId = null;
			dragOffset = 0;
			return;
		}

		const v = vehicles.find((item) => item.id === activeVehicleId);
		if (!v) {
			activeVehicleId = null;
			return;
		}

		const stepPx = CELL_SIZE + GAP;
		const steps = Math.round(dragOffset / stepPx);
		const targetPos = dragStartPos + steps;

		moveVehicle(v, targetPos);
		activeVehicleId = null;
		dragOffset = 0;
	}

	function moveVehicle(v: VehicleData, targetPos: number) {
		if (isWon || isExiting) return;
		const { minPos, maxPos } = getMovementRange(v);
		if (targetPos < minPos || targetPos > maxPos) return;
		if (v.isTarget && targetPos >= 4) {
			moveHistory.push({ id: v.id, prevRow: v.row, prevCol: v.col });
			v.col = 4;
			triggerWin();
			return;
		}

		if (v.orientation === 'H') {
			if (v.col !== targetPos) {
				moveHistory.push({ id: v.id, prevRow: v.row, prevCol: v.col });
				v.col = targetPos;
				sound.playCarSnap();
				sound.playHaptic(15);
			}
		} else {
			if (v.row !== targetPos) {
				moveHistory.push({ id: v.id, prevRow: v.row, prevCol: v.col });
				v.row = targetPos;
				sound.playCarSnap();
				sound.playHaptic(15);
			}
		}

		hintMove = null;
	}

	function handleVehicleKeydown(event: KeyboardEvent, v: VehicleData) {
		const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 :
			event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
		if (!step || (v.orientation === 'H' && !['ArrowLeft', 'ArrowRight'].includes(event.key)) ||
			(v.orientation === 'V' && !['ArrowUp', 'ArrowDown'].includes(event.key))) return;
		event.preventDefault();
		moveVehicle(v, (v.orientation === 'H' ? v.col : v.row) + step);
	}

	function triggerWin() {
		isExiting = true;
		sound.playCarExit();
		sound.playHaptic([40, 60, 100]);

		setTimeout(() => {
			isWon = true;
			isExiting = false;
			unlockedThrough = Math.max(unlockedThrough, currentLevelId + 1);
			sound.playUnstoppable();
			try {
				confetti({
					particleCount: 120,
					spread: 80,
					origin: { y: 0.55 }
				});
			} catch (_) {}

			// Save progress
			try {
				localStorage.setItem(`fgames_escape_${difficulty}_level`, unlockedThrough.toString());
			} catch (_) {}
		}, 650);
	}

	function handleUndo() {
		if (moveHistory.length === 0 || isWon || isExiting) {
			sound.playError();
			return;
		}
		const lastMove = moveHistory.pop()!;
		const v = vehicles.find((item) => item.id === lastMove.id);
		if (v) {
			v.row = lastMove.prevRow;
			v.col = lastMove.prevCol;
			hintMove = null;
			sound.playCarSnap();
		}
	}

	function handleHint() {
		if (isWon || isExiting) return;
		if (hintsCount <= 0) {
			sound.playError();
			return;
		}

		const path = solveEscape(vehicles);
		if (path && path.length > 0) {
			hintMove = path[0];
			hintsCount--;
			sound.playBoltComplete();
		} else {
			sound.playError();
		}
	}

	function handleRestart() {
		sound.playTap();
		initLevel(currentLevel);
	}

	function nextLevel() {
		if (!isWon && currentLevelId >= unlockedThrough) return;
		sound.playTap();
		currentLevelId++;
	}

	function prevLevel() {
		if (currentLevelId > 1) {
			sound.playTap();
			currentLevelId--;
		}
	}
</script>

<div
	class="relative flex flex-col justify-between w-full h-full min-h-0 max-w-md mx-auto select-none overflow-hidden rounded-3xl shadow-2xl"
	style="background: radial-gradient(circle at 50% 25%, #232c28 0%, #171d1b 60%, #0e1211 100%);"
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
	role="application"
	aria-label="Escape Game Board"
>
	<!-- TOP BAR (Back, Difficulty/Level, Restart) -->
	<header class="flex items-center justify-between px-6 pt-5 pb-2 z-20">
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
				<span class="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-0.5">
					{difficulty.replace('_', ' ')}
				</span>
				<h2 class="text-2xl font-black text-white tracking-wide drop-shadow-md">
					{currentLevel.name}
				</h2>
				<span class="text-[10px] font-bold text-slate-400">{moveHistory.length} moves</span>
			</div>

			<button
				type="button"
				onclick={nextLevel}
				disabled={currentLevelId >= unlockedThrough && !isWon}
				class="w-7 h-7 bg-white/15 hover:bg-white/25 disabled:opacity-25 rounded-full flex items-center justify-center text-white text-xs font-black transition-transform active:scale-90 cursor-pointer"
				aria-label="Next level"
			>
				▶
			</button>
		</div>

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

	<!-- PLAYING FIELD: 6x6 ASPHALT GRID WITH EXIT OPENING -->
	<main class="flex-1 flex flex-col justify-center items-center px-4 py-2 z-10">
		<div class="relative" style="width: {boardSize}px; height: {boardSize}px;">
			<!-- Outer Rounded Concrete Curb Frame (Matching Image 2) -->
			<div
				class="absolute inset-0 rounded-3xl bg-[#37413d] border-[7px] border-[#4b5550] shadow-[0_14px_28px_rgba(0,0,0,0.65)]"
			></div>

			<!-- Exit Gate Opening on Row 2 Right Curb -->
			<div
				class="absolute -right-2 w-6 bg-[#272c29] border-y-[3px] border-[#4b5550] flex flex-col items-center justify-center gap-0.5 z-10"
				style="top: {PADDING + 2 * (CELL_SIZE + GAP)}px; height: {CELL_SIZE}px;"
			>
				<span class="text-emerald-400 font-black text-[11px] leading-tight select-none animate-pulse">&gt;</span>
				<span class="text-emerald-400 font-black text-[11px] leading-tight select-none animate-pulse">&gt;</span>
				<span class="text-emerald-400 font-black text-[11px] leading-tight select-none animate-pulse">&gt;</span>
			</div>

			<!-- Solid Asphalt Parking Lot Surface (Smooth and clean without spreadsheet grid lines) -->
			<div
				class="absolute inset-[10px] rounded-2xl bg-[#272c29] shadow-inner overflow-hidden"
			></div>

			<!-- Positioned Draggable Vehicles -->
			<div class="absolute inset-[10px] pointer-events-none">
				{#each vehicles as v (v.id)}
					{@const isDragging = activeVehicleId === v.id}
					{@const isEscaping = v.isTarget && isExiting}
					{@const currentLeft =
						PADDING +
						v.col * (CELL_SIZE + GAP) -
						PADDING +
						(isDragging && v.orientation === 'H' ? dragOffset : 0) +
						(isEscaping ? 240 : 0)}
					{@const currentTop =
						PADDING +
						v.row * (CELL_SIZE + GAP) -
						PADDING +
						(isDragging && v.orientation === 'V' ? dragOffset : 0)}
					{@const vWidth =
						v.orientation === 'H'
							? v.length * CELL_SIZE + (v.length - 1) * GAP
							: CELL_SIZE}
					{@const vHeight =
						v.orientation === 'V'
							? v.length * CELL_SIZE + (v.length - 1) * GAP
							: CELL_SIZE}

					<div
						class="absolute pointer-events-auto touch-none transition-all cursor-grab active:cursor-grabbing"
						class:duration-500={isEscaping}
						class:ease-in={isEscaping}
						style="left: {currentLeft}px; top: {currentTop}px; width: {vWidth}px; height: {vHeight}px; z-index: {isDragging ? 35 : isEscaping ? 40 : 20};"
						onpointerdown={(e) => handlePointerDown(e, v)}
						onkeydown={(e) => handleVehicleKeydown(e, v)}
						role="button"
						tabindex="0"
						aria-label={v.isTarget ? 'Red Escape Vehicle' : `${v.color} ${v.type}`}
					>
						<Vehicle
							vehicle={v}
							{isDragging}
							isHint={hintMove?.id === v.id}
							hintDirection={hintMove?.id === v.id ? hintMove.direction : undefined}
							cellSize={CELL_SIZE}
							gap={GAP}
						/>
					</div>
				{/each}
			</div>
		</div>
	</main>

	<!-- BOTTOM ACTION CONTROLS (Undo, Hint) -->
	<footer class="flex items-center justify-around px-12 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 z-20">
		<!-- Undo Button -->
		<div class="flex flex-col items-center">
			<button
				type="button"
				onclick={handleUndo}
				disabled={moveHistory.length === 0 || isWon || isExiting}
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
				disabled={isWon || isExiting || hintsCount <= 0}
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
	</footer>

	<!-- UNSTOPPABLE! BANNER (Exact Replica of Frame 039 from video!) -->
	{#if isWon}
		<div
			class="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 animate-pop-in"
		>
			<!-- Spinning sparkles ring -->
			<div class="relative flex flex-col items-center text-center">
				<div class="absolute -inset-16 flex items-center justify-center pointer-events-none animate-star-spin opacity-80">
						<span class="absolute top-2 left-6 text-2xl">✨</span>
						<span class="absolute top-4 right-8 text-3xl">✨</span>
						<span class="absolute bottom-6 left-10 text-2xl">✨</span>
						<span class="absolute bottom-4 right-10 text-3xl">✨</span>
				</div>

				<h1
					class="text-4xl sm:text-5xl font-black text-[#facc15] tracking-tight drop-shadow-[0_4px_12px_rgba(250,204,21,0.6)] uppercase mb-3 scale-110"
				>
					UNSTOPPABLE!
				</h1>
			<p class="text-slate-300 text-base font-bold mb-6">Cleared in {moveHistory.length} moves.</p>

				<div class="flex flex-col gap-3 w-64 mt-2">
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
