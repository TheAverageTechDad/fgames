<script lang="ts">
	import type { VehicleData, FacingDirection } from './types';

	interface Props {
		vehicle: VehicleData;
		isDragging?: boolean;
		isHint?: boolean;
		hintDirection?: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
		cellSize: number; // in pixels
		gap: number;      // grid gap in pixels
	}

	let {
		vehicle,
		isDragging = false,
		isHint = false,
		hintDirection,
		cellSize,
		gap
	}: Props = $props();

	// Facing direction resolution
	const facing = $derived<FacingDirection>(
		vehicle.facing || (vehicle.orientation === 'H' ? 'RIGHT' : 'DOWN')
	);

	// Select sprite asset path based on vehicle type, color, length, orientation
	const spriteSrc = $derived.by(() => {
		const isH = vehicle.orientation === 'H';
		const suffix = isH ? '_h.png' : '_v.png';

		if (vehicle.isTarget || vehicle.color === 'red') {
			return `/vehicles/red_truck${suffix}`;
		}

		if (vehicle.length === 3) {
			if (vehicle.subtype === 'tanker' || vehicle.color === 'lilac') {
				return `/vehicles/truck_tanker${suffix}`;
			}
			return `/vehicles/bus_purple${suffix}`;
		}

		// Length 2 cars
		if (vehicle.color === 'white') {
			return `/vehicles/car_white${suffix}`;
		}
		if (vehicle.color === 'blue') {
			return `/vehicles/car_blue${suffix}`;
		}
		// Tan / SUV / default
		return `/vehicles/car_tan${suffix}`;
	});

	// Transform based on facing direction
	// Base _h images face RIGHT (0deg)
	// Base _v images face UP (0deg)
	const flipTransform = $derived.by(() => {
		if (vehicle.orientation === 'H') {
			if (facing === 'LEFT') return 'scaleX(-1)';
			return 'none';
		} else {
			if (facing === 'DOWN') return 'scaleY(-1)';
			return 'none';
		}
	});
</script>

<div
	class="relative w-full h-full select-none cursor-grab active:cursor-grabbing transition-transform duration-100 flex items-center justify-center p-[2px]"
	class:scale-[1.04]={isDragging}
	class:z-30={isDragging}
>
	<!-- Hint Glow & Arrow -->
	{#if isHint}
		<div
			class="absolute -inset-1 rounded-2xl border-2 border-amber-400 bg-amber-400/25 animate-pulse pointer-events-none z-40"
		></div>
		{#if hintDirection}
			<div
				class="absolute inset-0 flex items-center justify-center z-50 pointer-events-none text-amber-300 font-black text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] animate-bounce"
			>
				{#if hintDirection === 'LEFT'} ⬅️
				{:else if hintDirection === 'RIGHT'} ➡️
				{:else if hintDirection === 'UP'} ⬆️
				{:else} ⬇️
				{/if}
			</div>
		{/if}
	{/if}

	<!-- High Resolution 3D Rendered Vehicle Sprite -->
	<img
		src={spriteSrc}
		alt=""
		draggable="false"
		class="w-full h-full object-contain pointer-events-none transition-[filter] duration-150 select-none"
		style:transform={flipTransform}
		style:filter={isDragging
			? 'drop-shadow(0 14px 18px rgba(0,0,0,0.65)) drop-shadow(0 4px 6px rgba(0,0,0,0.4)) brightness(1.05)'
			: 'drop-shadow(0 6px 8px rgba(0,0,0,0.52))'}
	/>
</div>
