<script lang="ts">
 import GameApp from '#lib/GameApp.svelte';
 let {data}=$props();
</script>
<GameApp library={data.library} />
