<script lang="ts">
	import { sound } from '#lib/sound';

	interface Props {
		gameType: 'nuts' | 'escape';
		onClose: () => void;
	}

	let { gameType, onClose }: Props = $props();
</script>

<div
	class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-pop-in"
>
	<div
		class="w-full max-w-sm bg-[#1e1933] border-2 border-amber-400/30 rounded-3xl p-6 shadow-2xl flex flex-col text-white"
	>
		<!-- Header -->
		<div class="flex items-center justify-between mb-4">
			<h3 class="text-xl font-black text-amber-400 uppercase tracking-wide">
				{gameType === 'nuts' ? 'How to Play Nuts & Bolts' : 'How to Play Escape'}
			</h3>
			<button
				type="button"
				onclick={() => {
					sound.playTap();
					onClose();
				}}
				class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 font-black cursor-pointer"
				aria-label="Close"
			>
				✕
			</button>
		</div>

		<!-- Rules list -->
		{#if gameType === 'nuts'}
			<div class="flex flex-col gap-3 text-sm text-slate-300">
				<div class="flex gap-3 items-start bg-white/5 p-3 rounded-2xl">
					<span class="text-2xl">🔩</span>
					<p><strong class="text-white">Tap a bolt</strong> to unscrew its top nut into the air.</p>
				</div>
				<div class="flex gap-3 items-start bg-white/5 p-3 rounded-2xl">
					<span class="text-2xl">🎨</span>
					<p><strong class="text-white">Match Colors:</strong> You can only place a nut onto an empty bolt or onto another nut of the exact same color!</p>
				</div>
				<div class="flex gap-3 items-start bg-white/5 p-3 rounded-2xl">
					<span class="text-2xl">🏆</span>
					<p><strong class="text-white">Goal:</strong> Sort all bolts so that each bolt contains nuts of only one single color.</p>
				</div>
				<div class="flex gap-3 items-start bg-white/5 p-3 rounded-2xl">
					<span class="text-2xl">💡</span>
					<p><strong class="text-white">Powerups:</strong> Use <span class="text-amber-400 font-bold">Undo</span>, <span class="text-amber-400 font-bold">Hint</span>, or add an extra bolt with <span class="text-amber-400 font-bold">+1</span> if you get stuck!</p>
				</div>
			</div>
		{:else}
			<div class="flex flex-col gap-3 text-sm text-slate-300">
				<div class="flex gap-3 items-start bg-white/5 p-3 rounded-2xl">
					<span class="text-2xl">🚗</span>
					<p><strong class="text-white">Red Car Mission:</strong> Help the red truck escape through the exit opening on the right side of the board!</p>
				</div>
				<div class="flex gap-3 items-start bg-white/5 p-3 rounded-2xl">
					<span class="text-2xl">↔️</span>
					<p><strong class="text-white">Sliding Vehicles:</strong> Horizontal vehicles only slide left and right. Vertical vehicles only slide up and down.</p>
				</div>
				<div class="flex gap-3 items-start bg-white/5 p-3 rounded-2xl">
					<span class="text-2xl">🛑</span>
					<p><strong class="text-white">Clear the Path:</strong> Slide blocking cars and trucks out of the way to open the lane for the red car.</p>
				</div>
				<div class="flex gap-3 items-start bg-white/5 p-3 rounded-2xl">
					<span class="text-2xl">💡</span>
					<p><strong class="text-white">Hints:</strong> Stuck? Tap the <span class="text-amber-400 font-bold">Hint</span> button to show which car to slide next!</p>
				</div>
			</div>
		{/if}

		<!-- Got It Button -->
		<button
			type="button"
			onclick={() => {
				sound.playTap();
				onClose();
			}}
			class="mt-6 w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold rounded-2xl shadow-lg active:scale-98 cursor-pointer"
		>
			GOT IT!
		</button>
	</div>
</div>
