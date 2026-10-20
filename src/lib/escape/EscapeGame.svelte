<script lang="ts">
 import {levelTransition} from '#lib/components/level-transition';
 import solverWorkerUrl from '../solver.worker.ts?worker&url';
 import {createOfflineWorker} from '#lib/offline-worker';
 import {goto} from '$app/navigation';
 import {page} from '$app/state';
	import confetti from 'canvas-confetti';
	import Vehicle from './Vehicle.svelte';
	import { buildGrid, solveEscape, type VehicleMove } from './solver';
	import { saveProgress, readHints, saveHints, type StoredEscapeLevel } from '#lib/level-library';
	import { sound } from '#lib/sound';
	import type { EscapeLevel, VehicleData } from './types';
	import { onMount, onDestroy } from 'svelte';
 import PlayHeader from '#lib/components/PlayHeader.svelte';
 import RoundControl from '#lib/components/RoundControl.svelte';
 import WinCard from '#lib/components/WinCard.svelte';
 import Icon from '#lib/components/Icon.svelte';

	interface Props {
        levels: StoredEscapeLevel[];
		initialLevelId?: number;
		difficulty?: 'easy' | 'medium' | 'hard' | 'extra_hard';
		onBack: () => void;
	}

	let { levels, initialLevelId = 1, difficulty = 'medium', onBack }: Props = $props();

	let currentLevelId = $state(1);
	let unlockedThrough = $state(1);

	$effect(() => {
		currentLevelId = initialLevelId;
		unlockedThrough = initialLevelId;
	});

	const currentLevel = $derived(levels[Math.min(levels.length-1, Math.max(0, currentLevelId-1))]);

	// Vehicles state
	let vehicles: VehicleData[] = $state([]);
	let moveHistory: { id: string; prevRow: number; prevCol: number }[] = $state([]);
	let hintsCount = $state(3);
	let hintMove = $state<VehicleMove | null>(null);
	let isWon = $state(false);
	let isExiting = $state(false);

	// Board geometry
	let boardSize = $state(350);
 let boardArea: HTMLElement;
 let settling=$state(false),hintBusy=$state(false),tutorial=$state(false);
 let timer: ReturnType<typeof setTimeout> | undefined;
 let hintWorker:Worker|undefined;
 let disposed=false;
 const guidedMove=$derived(tutorial&&moveHistory.length<2?currentLevel.solution[moveHistory.length]:null);
 onMount(()=>{hintsCount=readHints('escape');try{tutorial=currentLevelId===1&&!localStorage.getItem('fgames_escape_tutorial');}catch{}});
 onDestroy(()=>{disposed=true;clearTimeout(timer);hintWorker?.terminate();});
	const PADDING = 10;
	const GAP = 5;
	const CELL_SIZE = $derived((boardSize - PADDING * 2 - GAP * 5) / 6);


 onMount(()=>{
  const resize=()=>{boardSize=Math.max(180,Math.min(boardArea.clientWidth-36,boardArea.clientHeight-20));};
  const observer=new ResizeObserver(resize);observer.observe(boardArea);resize();return ()=>observer.disconnect();
 });

	// Dragging state
	let activeVehicleId = $state<string | null>(null);
	let dragOffset = $state(0); // in pixels along movement axis
	let dragMinPx = $state(0);
	let dragMaxPx = $state(0);
	let activePointerId: number | null = null;
    let dragStartPointer = 0;
	let dragStartPos = 0; // initial row or col
	let hasHitBump = $state(false);

	function initLevel(lvl: EscapeLevel) {
        clearTimeout(timer);hintWorker?.terminate();settling=false;hintBusy=false;
        const safeVehicles=lvl.vehicles.map(v=>({...v}));
		vehicles = safeVehicles;
		moveHistory = [];
		hintMove = null;
		isWon = false;
		isExiting = false;
		activeVehicleId = null;
        activePointerId=null;
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
		if (isWon || isExiting || settling || hintBusy || activeVehicleId) return;
        activePointerId=e.pointerId;
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
		if (!activeVehicleId || e.pointerId!==activePointerId) return;

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
		if (!activeVehicleId || e.pointerId!==activePointerId) return;
		if (e.type === 'pointercancel') {
            activePointerId=null;
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
		const steps = Math.round(Math.max(dragMinPx,Math.min(dragMaxPx,dragOffset)) / stepPx);
		const targetPos = dragStartPos + steps;

		moveVehicle(v, targetPos);
		activeVehicleId = null;
		dragOffset = 0;
	}

	function moveVehicle(v: VehicleData, targetPos: number) {
		if (isWon || isExiting || settling || hintBusy) return;
		const { minPos, maxPos } = getMovementRange(v);
		if (targetPos < minPos || targetPos > maxPos) {sound.playCarBump();return;}
        const previous=v.orientation==='H'?v.col:v.row;
        if(previous===targetPos)return;
        if(guidedMove && (v.id!==guidedMove.id || targetPos-previous!==(guidedMove.direction==='LEFT'||guidedMove.direction==='UP'?-1:1)*guidedMove.steps))tutorial=false;
        settling=true;
        clearTimeout(timer);timer=setTimeout(()=>settling=false,130);
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
        if(moveHistory.length>=2){tutorial=false;try{localStorage.setItem('fgames_escape_tutorial','true');}catch{}}
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

		clearTimeout(timer);
        timer=setTimeout(() => {
			isWon = true;
            settling=false;
			isExiting = false;
			unlockedThrough = Math.max(unlockedThrough, currentLevelId + 1);
			sound.playVictory();
			try {
				confetti({
					particleCount: 120,
					spread: 80,
					origin: { y: 0.55 }
				});
			} catch (_) {}

            saveProgress('escape',difficulty,currentLevelId+1);
		}, 650);
	}

	function handleUndo() {
		if (moveHistory.length === 0 || isWon || isExiting || settling || hintBusy) {
			sound.playError();
			return;
		}
		tutorial=false;settling=true;clearTimeout(timer);timer=setTimeout(()=>settling=false,130);
        const lastMove = moveHistory.pop()!;
		const v = vehicles.find((item) => item.id === lastMove.id);
		if (v) {
			v.row = lastMove.prevRow;
			v.col = lastMove.prevCol;
			hintMove = null;
			sound.playCarSnap();
		}
	}

	async function handleHint() {
		if (isWon || isExiting || settling || hintBusy) return;
		if (hintsCount <= 0) {
			sound.playError();
			return;
		}


        hintBusy=true;hintWorker?.terminate();
        try{hintWorker=await createOfflineWorker(solverWorkerUrl);}catch{hintBusy=false;sound.playError();return;}
        if(disposed){hintWorker.terminate();return;}
        hintWorker.onmessage=({data})=>{hintBusy=false;if(data){hintMove=data;hintsCount--;saveHints('escape',hintsCount);sound.playTap();}else sound.playError();hintWorker?.terminate();};
        hintWorker.onerror=()=>{hintBusy=false;hintWorker?.terminate();sound.playError();};
        hintWorker.postMessage({game:'escape',state:$state.snapshot(vehicles)});
    }

	function handleRestart() {
        if(isExiting||settling||hintBusy)return;
		sound.playTap();
		initLevel(currentLevel);
	}

	function nextLevel() {
		if (!isWon && currentLevelId >= unlockedThrough) return;
		sound.playTap();
		if(currentLevelId>=levels.length){onBack();return;}
        tutorial=false; currentLevelId++; void goto(`/escape/play?difficulty=${difficulty}&stage=${currentLevelId}`,{replace:true,reset:false,state:page.state});
	}

	function prevLevel() {
		if (currentLevelId > 1) {
			sound.playTap();
			currentLevelId--;
		}
	}
</script>


<div class="game-screen escape-screen" onpointermove={handlePointerMove} onpointerup={handlePointerUp} onpointercancel={handlePointerUp} role="application" aria-label="Escape game">
 <PlayHeader level={currentLevelId} {difficulty} {onBack} onRestart={handleRestart}/>
	<main class="escape-field" bind:this={boardArea} use:levelTransition={currentLevelId}>
		<div class="relative" style="width: {boardSize}px; height: {boardSize}px;">
			<!-- Outer Rounded Concrete Curb Frame (Matching Image 2) -->
			<div
				class="absolute inset-0 rounded-3xl bg-[#fff6e6] border-[4px] border-[#241b3a] shadow-[0_7px_0_#241b3a]"
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
						(isEscaping ? boardSize : 0)}
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
						class="absolute pointer-events-auto touch-none cursor-grab active:cursor-grabbing car-piece"
                        data-vehicle={v.id}
                        data-row={v.row} data-col={v.col}
                        data-orientation={v.orientation}
						class:duration-500={isEscaping}
						class:ease-in={isEscaping}
						style="transition: {isDragging?'none':isEscaping?'left 500ms ease-in':'left 120ms ease-out, top 120ms ease-out, transform 120ms ease-out'}; transform: {isDragging&&hasHitBump?'scale(0.97)':'none'}; left: {currentLeft}px; top: {currentTop}px; width: {vWidth}px; height: {vHeight}px; z-index: {isDragging ? 35 : isEscaping ? 40 : 20};"
						onpointerdown={(e) => handlePointerDown(e, v)}
						onkeydown={(e) => handleVehicleKeydown(e, v)}
						role="button"
						tabindex="0"
						aria-label={v.isTarget ? 'Red car' : `${v.color} ${v.type}`}
					>
                        {#if isEscaping}<span class="exit-streak" aria-hidden="true"></span>{/if}
                        {#if guidedMove?.id===v.id}<span class="car-guide" aria-hidden="true"><Icon name="hand-pointing" size={32}/></span>{/if}
						<Vehicle
							vehicle={v}
							{isDragging}
							isHint={(hintMove??guidedMove)?.id === v.id}
							hintDirection={(hintMove??guidedMove)?.id === v.id ? (hintMove??guidedMove)?.direction : undefined}
							cellSize={CELL_SIZE}
							gap={GAP}
						/>
					</div>
				{/each}
			</div>
		</div>
	{#if guidedMove}<p class="field-tip"><Icon name="hand-pointing"/>Slide the marked car {guidedMove.direction.toLowerCase()}</p>{/if}
	</main>

 <!-- ponytail: controls stay enabled while a car settles (the handlers ignore those taps); dimming them made the row flicker -->
 <footer class="play-controls">
  <RoundControl icon="arrow-u-up-left" label="Undo" disabled={!moveHistory.length||isWon} ariaLabel="Undo move" onclick={handleUndo}/>
  <RoundControl icon="lightbulb" label={hintBusy?'Thinking…':'Hint'} skin="grape" badge={hintsCount} disabled={isWon||hintsCount<=0} ariaLabel={`Use hint, ${hintsCount} left`} onclick={handleHint}/>
 </footer>
 {#if isWon}<WinCard moves={moveHistory.length} best={currentLevel.minMoves} last={currentLevelId===levels.length} onNext={nextLevel} onReplay={handleRestart}/>{/if}
</div>
<style>.exit-streak{position:absolute;right:95%;top:20%;width:70px;height:60%;border-top:4px solid #fff6e6;border-bottom:4px solid #fff6e6;opacity:.7;pointer-events:none}.car-guide{position:absolute;z-index:50;left:30%;top:40%;pointer-events:none;color:#fff6e6;filter:drop-shadow(1px 2px 1px #241b3a)}</style>
