<script lang="ts">
  import PhonicsGame from '#lib/games/phonics/PhonicsGame.svelte';
</script>

<svelte:head>
  <title>Sound It Out · Pocket Arcade</title>
  <meta name="description" content="Slide along the word, hear each sound, read it." />
  <meta name="theme-color" content="#fff6e6" />
  <link rel="preload" href="/fonts/Andika-Bold-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<PhonicsGame />
