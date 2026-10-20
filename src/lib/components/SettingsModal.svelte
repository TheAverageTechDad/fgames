<script lang="ts">
	import { sound } from '#lib/sound';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let isMuted = $state(sound.muted);

	function toggleAudio() {
		sound.toggleMute();
		isMuted = sound.muted;
		if (!isMuted) sound.playTap();
	}
</script>

<div
	class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-pop-in"
>
	<div
		class="w-full max-w-sm bg-[#1e1933] border-2 border-amber-400/30 rounded-3xl p-6 shadow-2xl flex flex-col text-white"
	>
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<h3 class="text-xl font-black text-amber-400 uppercase tracking-wide">
				Settings
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

		<!-- Options -->
		<div class="flex flex-col gap-4">
			<!-- Sound Effects Toggle -->
			<div class="flex items-center justify-between bg-white/5 p-4 rounded-2xl">
				<div class="flex items-center gap-3">
					<span class="text-2xl">{isMuted ? '🔇' : '🔊'}</span>
					<div>
						<h4 class="font-bold text-white text-base">Sound Effects</h4>
						<p class="text-xs text-slate-400">In-game audio & chimes</p>
					</div>
				</div>
				<button
					type="button"
					onclick={toggleAudio}
					class="w-14 h-8 rounded-full transition-colors p-1 flex items-center cursor-pointer {isMuted ? 'bg-slate-700' : 'bg-emerald-500 justify-end'}"
					aria-label="Toggle sound"
				>
					<div class="w-6 h-6 rounded-full bg-white shadow-md"></div>
				</button>
			</div>

			<!-- Vibration / Haptics info -->
			<div class="flex items-center justify-between bg-white/5 p-4 rounded-2xl">
				<div class="flex items-center gap-3">
					<span class="text-2xl">📳</span>
					<div>
						<h4 class="font-bold text-white text-base">Haptics</h4>
						<p class="text-xs text-slate-400">Tactile touch feedback</p>
					</div>
				</div>
				<span class="text-xs font-bold text-emerald-400 bg-emerald-500/20 px-2.5 py-1 rounded-full">
					Enabled
				</span>
			</div>
		</div>

		<!-- Close Button -->
		<button
			type="button"
			onclick={() => {
				sound.playTap();
				onClose();
			}}
			class="mt-6 w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold rounded-2xl shadow-lg active:scale-98 cursor-pointer"
		>
			DONE
		</button>
	</div>
</div>
