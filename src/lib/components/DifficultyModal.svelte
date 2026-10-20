<script lang="ts">
 import {sound} from '#lib/sound';
 import {savedLevel,difficulties,type Difficulty,type Library} from '#lib/level-library';
 import {onMount} from 'svelte';
 import GameHeader from './GameHeader.svelte';
 import BoardPreview from './BoardPreview.svelte';
 import HowToPlayModal from './HowToPlayModal.svelte';
 import Icon from './Icon.svelte';
 let {gameType,currentDifficulty='easy',library,onSelectDifficulty,onPlay,onBack}:{gameType:'nuts'|'escape';currentDifficulty:Difficulty;library?:Library;onSelectDifficulty:(d:Difficulty)=>void;onPlay:(level:number)=>void;onBack:()=>void}=$props();
 let help=$state(false),selectedLevel=$state(1),unlocked=$state(1);
 const labels=['Easy','Medium','Hard','Extra Hard'];
 const skins=['mint','sky','coral','grape'];
 $effect(()=>{unlocked=savedLevel(gameType,currentDifficulty);selectedLevel=unlocked;});
 function choose(d:Difficulty){sound.playTap();onSelectDifficulty(d);}
</script>
<div class="difficulty-screen">
 <GameHeader title={gameType==='nuts'?'Nuts & Bolts':'Escape'} {onBack}/>
 <main class="difficulty-content">
 {#if library}<BoardPreview game={gameType} level={library[currentDifficulty][selectedLevel-1]}/>{/if}
 <p class="game-description">{gameType==='nuts'?'Sort matching colours onto each bolt.':'Clear a path for the red car.'}</p>
 <h2>Choose your challenge</h2>
 <div class="difficulty-options" role="group" aria-label="Difficulty">
 {#each difficulties as d,i}<button class={`toy-button ${currentDifficulty===d?skins[i]:''}`} aria-pressed={currentDifficulty===d} onclick={()=>choose(d)}>{labels[i]}{#if currentDifficulty===d}<Icon name="check" size={20}/>{/if}</button>{/each}
 </div>
 <label class="level-choice">Level <select aria-label="Choose level" bind:value={selectedLevel}>{#each Array.from({length:unlocked},(_,i)=>i+1) as level}<option value={level}>{level}</option>{/each}</select><span>of 100</span></label>
 <div class="play-row"><button class="toy-button coral" onclick={()=>{sound.playTap();onPlay(selectedLevel);}}><Icon name="play"/>Play · Level {selectedLevel}</button><button class="toy-button icon-button" onclick={()=>help=true} aria-label="How to play"><Icon name="question"/></button></div>
 </main>
 {#if help}<HowToPlayModal {gameType} onClose={()=>help=false}/>{/if}
</div>
