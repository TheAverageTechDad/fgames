<script lang="ts">
 import DifficultyModal from '#lib/components/DifficultyModal.svelte';
 import GameHeader from '#lib/components/GameHeader.svelte';
 import Icon from '#lib/components/Icon.svelte';
 import NutsGame from '#lib/nuts/NutsGame.svelte';
 import EscapeGame from '#lib/escape/EscapeGame.svelte';
 import {sound} from '#lib/sound';
 import {installHaptics} from '#lib/haptics';
 import {onMount} from 'svelte';
 import {page} from '$app/state';
 import {goto} from '$app/navigation';
 import {savedLevel,type Library,type Difficulty,type StoredNutsLevel,type StoredEscapeLevel} from '#lib/level-library';
 let {library}:{library?:Library}=$props();
 const selectedGame=$derived(page.params.game==='escape'?'escape':'nuts');
 const screen=$derived(!page.params.game?'home':page.url.pathname.endsWith('/play')?'play':'difficulty');
 // the status-bar strip shows the page background: match the screen so play runs edge to edge
 $effect(()=>{document.documentElement.style.setProperty('--screen-bg',screen!=='play'?'#fff6e6':selectedGame==='nuts'?'#e1e8d1':'#d3deca');});
 const currentDifficulty=$derived((['easy','medium','hard','extra_hard'].includes(page.url.searchParams.get('difficulty')??'')?page.url.searchParams.get('difficulty'):'easy') as Difficulty);
 let initialLevel=$state(1);
 $effect(()=>{initialLevel=Math.max(1,Math.min(savedLevel(selectedGame,currentDifficulty),Number(page.url.searchParams.get('stage'))||savedLevel(selectedGame,currentDifficulty)));});
 onMount(()=>{
  if(import.meta.env.DEV){const p=new URLSearchParams(location.search),g=p.get('game');if(g==='nuts'||g==='escape')void goto(`/${g}/play?difficulty=${p.get('diff')??'easy'}`);}
  return installHaptics();
 });
 function backTo(url:string){
  if((page.state as {parent?:string}).parent && history.length>1)history.back();
  else void goto(url,{replace:true});
 }
 const goHome=()=>backTo('/');
 const goDifficulty=()=>backTo(`/${selectedGame}?difficulty=${currentDifficulty}`);
</script>
<svelte:head><title>{screen==='home'?'Offline Games':selectedGame==='nuts'?'Nuts & Bolts · Offline Games':'Escape · Offline Games'}</title></svelte:head>
<div class="app-surround"><div class="app-shell">
 {#key `${screen}-${selectedGame}`}
 <div class="screen-transition">
 {#if screen==='home'}
 <div class="home-screen">
 <GameHeader title="Offline Games"/>
 <main class="game-library">
 <p class="home-intro">Little games. Any spare moment.</p>
 {#each [{game:'farm',title:'Pocket Farm',description:'Plant a little. Grow something lovely.',skin:'mint'},{game:'catcha',title:'Catcha',description:'Tidy, cook and play together.',skin:'coral'},{game:'nuts',title:'Nuts & Bolts',description:'A little order. A clear head.',skin:'mint'},{game:'escape',title:'Escape',description:'Make room. Find your way out.',skin:'sky'}] as game}
 <button class={`library-card toy-card ${game.skin}`} onclick={()=>{sound.playTap();if(game.game==='catcha')location.href='/catcha';else goto(`/${game.game}`,{state:{parent:'/'}});}} aria-label={`Play ${game.title}`}>
 <div class="library-art"><img src={`/cards/${game.game}-gameplay.webp`} alt={`${game.title} gameplay`} width="640" height="340"/></div>
 <div class="library-label"><div><h2>{game.title}</h2><p>{game.description}</p></div><span class="card-play"><Icon name="play" size={26}/></span></div>
 </button>
 {/each}
 </main>
 </div>
 {:else if screen==='difficulty'}
 <DifficultyModal gameType={selectedGame} {currentDifficulty} {library} onSelectDifficulty={d=>goto(`/${selectedGame}?difficulty=${d}`,{replace:true,reset:false,state:page.state})} onPlay={level=>goto(`/${selectedGame}/play?difficulty=${currentDifficulty}&stage=${level}`,{state:{parent:`/${selectedGame}`}})} onBack={goHome}/>
 {:else if library}
 {#key currentDifficulty}
 {#if selectedGame==='nuts'}<NutsGame levels={library[currentDifficulty] as StoredNutsLevel[]} initialLevelId={initialLevel} difficulty={currentDifficulty} onBack={goDifficulty}/>
 {:else}<EscapeGame levels={library[currentDifficulty] as StoredEscapeLevel[]} initialLevelId={initialLevel} difficulty={currentDifficulty} onBack={goDifficulty}/>{/if}
 {/key}
 {/if}
 </div>
 {/key}
</div></div>
