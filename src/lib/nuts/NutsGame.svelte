<script lang="ts">
 import {levelTransition} from '#lib/components/level-transition';
 import solverWorkerUrl from '../solver.worker.ts?worker&url';
 import {createOfflineWorker} from '#lib/offline-worker';
 import {goto} from '$app/navigation';
 import {page} from '$app/state';
	import confetti from 'canvas-confetti';
	import { onMount, onDestroy } from 'svelte';
 import { groupMoveCount } from './moves';
 import GameHeader from '#lib/components/GameHeader.svelte';
 import WinCard from '#lib/components/WinCard.svelte';
 import Icon from '#lib/components/Icon.svelte';
	import Nuts3DScene from './three/Nuts3DScene.svelte';
	import { isLevelSolved } from './solver';
	import { saveProgress, readHints, saveHints, type StoredNutsLevel } from '#lib/level-library';
	import { sound } from '#lib/sound';
	import type { NutsLevel, NutItem } from './types';

	interface Props {
        levels: StoredNutsLevel[];
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

	// Game state
	let bolts: NutItem[][] = $state([]);
	let selectedBolt = $state<number | null>(null);
	let moveHistory: { from: number; to: number; count: number }[] = $state([]);
	let hintsCount = $state(3);
	let hintMove = $state<{ from: number; to: number } | null>(null);
	let isWon = $state(false);
	let hasAddedBolt = $state(false);

	let busy = $state(false);
 let hintBusy = $state(false);
 let hintWorker: Worker | undefined;
 let disposed=false;
 let tutorial = $state(false);
 let showBoltTip = $state(false);
 const capacity = $derived(currentLevel.capacity ?? 4);
 const guidedMove = $derived(tutorial && moveHistory.length < 2 ? currentLevel.solution[moveHistory.length] : null);
 onMount(()=>{ hintsCount=readHints('nuts');try{tutorial=currentLevelId===1&&!localStorage.getItem('fgames_nuts_tutorial');showBoltTip=!localStorage.getItem('fgames_bolt_tip');}catch{} });
 onDestroy(()=>{disposed=true;hintWorker?.terminate();});
 let nutIdSeq = 0;
	// Initialize level
	function initLevel(lvl: NutsLevel) {
		nutIdSeq += 1000;
        busy=false; hintBusy=false; hintWorker?.terminate();
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


	function handleBoltClick(index: number) {
		if (isWon || busy || hintBusy) return;
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
			if (clickedBolt.length === capacity && clickedBolt.every((c) => c.color === clickedBolt[0].color)) {
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

		if (dst.length >= capacity) {
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


        const count=groupMoveCount(src,dst,capacity);
        if(!count)return;
        const fromIdx=selectedBolt;
        if(guidedMove && (fromIdx!==guidedMove.from || index!==guidedMove.to)) tutorial=false;
        busy=true;
        for(let i=0;i<count;i++)dst.push(src.pop()!);
        bolts=bolts.map(b=>[...b]);
        moveHistory.push({from:fromIdx,to:index,count});
        selectedBolt=null; hintMove=null;
        if(moveHistory.length>=2){tutorial=false;try{localStorage.setItem('fgames_nuts_tutorial','true');}catch{}}
    }
    function finishAnimation(){
        if(!busy)return;
        busy=false;
        sound.playScrewDown();
        const last=moveHistory.at(-1);
        if(last&&bolts[last.to].length===capacity&&bolts[last.to].every(n=>n.color===bolts[last.to][0].color))sound.playBoltComplete();
        else sound.resetCombo();
        if(isLevelSolved(bolts.map(b=>b.map(n=>n.color)),capacity)){
            isWon=true; saveProgress('nuts',difficulty,currentLevelId+1);sound.playVictory();
            if(!matchMedia('(prefers-reduced-motion: reduce)').matches)confetti({particleCount:60,spread:65,origin:{y:.6}});
        }
    }

	function handleUndo() {
		if (moveHistory.length === 0 || isWon || busy || hintBusy) {
			sound.playError();
			sound.playHaptic([20, 30]);
			return;
		}
		busy=true; tutorial=false;
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

	async function handleHint() {
		if (isWon || busy || hintBusy) return;
		if (hintsCount <= 0) {
			sound.playError();
			return;
		}


        hintBusy=true;
        hintWorker?.terminate();
        try{hintWorker=await createOfflineWorker(solverWorkerUrl);}catch{hintBusy=false;sound.playError();return;}
        if(disposed){hintWorker.terminate();return;}
        hintWorker.onmessage=({data})=>{hintBusy=false;if(data){hintMove=data;hintsCount--;saveHints('nuts',hintsCount);sound.playTap();}else sound.playError();hintWorker?.terminate();};
        hintWorker.onerror=()=>{hintBusy=false;hintWorker?.terminate();sound.playError();};
        hintWorker.postMessage({game:'nuts',state:bolts.map(b=>b.map(n=>n.color)),capacity});
    }

	function handleAddBolt() {
		if (hasAddedBolt || isWon || busy || hintBusy) {
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
        if(busy||hintBusy)return;
		sound.playTap();
		initLevel(currentLevel);
	}

	function nextLevel() {
		if (!isWon && currentLevelId >= unlockedThrough) return;
		sound.playTap();
		if(currentLevelId>=levels.length){onBack();return;}
        tutorial=false; currentLevelId++; void goto(`/nuts/play?difficulty=${difficulty}&stage=${currentLevelId}`,{replace:true,reset:false,state:page.state});
	}

</script>


<div class="game-screen nuts-screen">
 <GameHeader title={`Level ${currentLevelId}`} subtitle={`${difficulty.replace('_',' ')} · ${moveHistory.length} moves`} {onBack}/>
 <main class="nuts-field" use:levelTransition={currentLevelId}>
  <Nuts3DScene {bolts} {selectedBolt} hintMove={hintMove??guidedMove} {isWon} {capacity} onBoltClick={handleBoltClick} onSettled={finishAnimation} guided={!!guidedMove}/>
 </main>
 {#if guidedMove}<p class="guidance" aria-live="polite"><Icon name="hand-pointing"/>Tap {selectedBolt===guidedMove.from?'the marked empty or matching bolt':'the marked source bolt'}</p>{/if}
 {#if showBoltTip}<button class="bolt-tip" onclick={()=>{showBoltTip=false;try{localStorage.setItem('fgames_bolt_tip','true');}catch{}}}>+1 Bolt adds an empty bolt for this level. Tap to dismiss.</button>{/if}
 <footer class="power-row">
  <button class="toy-button" onclick={handleUndo} disabled={!moveHistory.length||isWon||busy||hintBusy} aria-label="Undo move"><Icon name="arrow-u-up-left"/><span>Undo</span></button>
  <button class="toy-button grape" onclick={handleHint} disabled={isWon||busy||hintBusy||hintsCount<=0} aria-label="Use hint"><Icon name="lightbulb"/><span>{hintBusy?'Thinking…':`Hint · ${hintsCount}`}</span></button>
  <button class="toy-button mint" onclick={handleAddBolt} disabled={hasAddedBolt||isWon||busy||hintBusy} aria-label="Add extra bolt"><Icon name="plus"/><span>+1 Bolt</span></button>
  <button class="toy-button" onclick={handleRestart} disabled={busy} aria-label="Restart level"><Icon name="arrow-counter-clockwise"/><span>Restart</span></button>
 </footer>
 {#if isWon}<WinCard moves={moveHistory.length} best={currentLevel.minMoves} assisted={hasAddedBolt} last={currentLevelId===levels.length} onNext={nextLevel} onReplay={handleRestart}/>{/if}
</div>
