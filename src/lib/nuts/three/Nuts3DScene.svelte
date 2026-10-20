<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { getNutGeometry, createBoltMeshGroup } from './geometries';
	import { getNutIconTexture } from './textures';
	import { NUT_THEMES, type NutColor, type NutItem } from '../types';
	import { sound } from '#lib/sound';

	interface Props {
		bolts: NutItem[][];
		selectedBolt: number | null;
		hintMove: { from: number; to: number } | null;
		isWon: boolean;
		onBoltClick: (index: number) => void;
	}

	let {
		bolts,
		selectedBolt,
		hintMove,
		isWon,
		onBoltClick
	}: Props = $props();

	let container: HTMLDivElement;
	let canvas: HTMLCanvasElement;

	// Three.js core
	let renderer: THREE.WebGLRenderer;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let animationFrameId: number;
	let raycaster: THREE.Raycaster;
	let pointer: THREE.Vector2;

	// Constants for 3D layout (Scaled down & spaced out for clean, airy layout)
	const NUT_HEIGHT = 0.50;
	const NUT_BASE_Y = 0.22;
	const SHAFT_TOP_Y = 2.57;
	const HOVER_Y_OFFSET = 3.25;

	const BOLT_SPACING_X_TOP = 2.24;
	const BOLT_SPACING_X_BOTTOM = 1.95;
	const TOP_Y = 1.30;
	const BOTTOM_Y = -2.35;

	function getBoltPosition(index: number, total: number): THREE.Vector3 {
		if (total <= 4) {
			const x = (index - (total - 1) / 2) * BOLT_SPACING_X_TOP;
			return new THREE.Vector3(x, 0, 0);
		}
		if (total <= 6) {
			const isTop = index < 3;
			const col = isTop ? index : index - 3;
			const x = (col - 1) * 2.3;
			const y = isTop ? 1.4 : -1.8;
			return new THREE.Vector3(x, y, 0);
		}
		if (index < 4) {
			// Top row of 4 bolts
			const x = (index - 1.5) * BOLT_SPACING_X_TOP;
			return new THREE.Vector3(x, TOP_Y, 0);
		} else {
			// Bottom row of remaining bolts (centered)
			const bottomCount = total - 4;
			const bottomIdx = index - 4;
			const x = (bottomIdx - (bottomCount - 1) / 2) * BOLT_SPACING_X_BOTTOM;
			return new THREE.Vector3(x, BOTTOM_Y, 0);
		}
	}

	// Nut animation state structure
	interface NutAnimation {
		state: 'resting' | 'unscrewing' | 'hovering' | 'screwing_down' | 'flying' | 'squashing';
		fromPos: THREE.Vector3;
		toPos: THREE.Vector3;
		arcPeakY: number;
		startRotY: number;
		targetRotY: number;
		progress: number;
		duration: number;
		squashTimer: number;
	}

	interface NutInstance {
		id: string;
		color: NutColor;
		group: THREE.Group;
		nutMesh: THREE.Mesh;
		currentBoltIndex: number;
		currentSlotIndex: number;
		targetBoltIndex: number;
		targetSlotIndex: number;
		anim: NutAnimation;
	}

	const nutInstances: Map<string, NutInstance> = new Map();
	const boltMeshes: THREE.Group[] = [];

	// Materials (Clean matte finish for nuts, crisp metallic for screw shafts)
	const nutMaterials: Map<NutColor, THREE.MeshStandardMaterial> = new Map();
	let boltMaterial: THREE.MeshStandardMaterial;
	let baseMaterial: THREE.MeshStandardMaterial;
	let lockedBaseMaterial: THREE.MeshStandardMaterial;
	let hintSourceMarker: THREE.Group;
	let hintTargetMarker: THREE.Group;

	function getNutMaterial(color: NutColor): THREE.MeshStandardMaterial {
		if (nutMaterials.has(color)) return nutMaterials.get(color)!;

		const theme = NUT_THEMES[color];
		const mat = new THREE.MeshStandardMaterial({
			color: new THREE.Color(theme.primary),
			roughness: 0.62,
			metalness: 0.04
		});
		nutMaterials.set(color, mat);
		return mat;
	}

	onMount(() => {
		initThree();
		buildScene();
		animate();

		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
			cancelAnimationFrame(animationFrameId);
			renderer.dispose();
		};
	});

	function initThree() {
		scene = new THREE.Scene();

		// Camera with downward perspective showing top facets and beveled edges
		camera = new THREE.PerspectiveCamera(28, container.clientWidth / container.clientHeight, 0.1, 100);
		updateCameraFraming();

		renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			alpha: true,
			preserveDrawingBuffer: true,
			powerPreference: 'high-performance'
		});
		renderer.setSize(container.clientWidth, container.clientHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.22;

		raycaster = new THREE.Raycaster();
		pointer = new THREE.Vector2();

		if (typeof window !== 'undefined') {
			(window as any).__nuts = {
				scene,
				camera,
				boltMeshes,
				getBoltNdc: (idx: number) => {
					if (!boltMeshes[idx]) return null;
					const v = new THREE.Vector3();
					boltMeshes[idx].getWorldPosition(v);
					v.y += 1.5; // center of bolt column
					v.project(camera);
					return { x: v.x, y: v.y };
				}
			};
		}

		// Studio 3-Point + Hemisphere Lighting
		// 1. Soft purple ambient bounce matching background
		const ambient = new THREE.AmbientLight(new THREE.Color('#581c87'), 1.4);
		scene.add(ambient);

		// 2. Hemisphere Light (Soft Sky White above, Slate/Ground below)
		const hemiLight = new THREE.HemisphereLight(0xffffff, 0x3b2d54, 1.6);
		scene.add(hemiLight);

		// 3. Main Key Light (Warm white, cast soft shadows)
		const keyLight = new THREE.DirectionalLight(new THREE.Color('#ffffff'), 2.6);
		keyLight.position.set(-6, 16, 12);
		keyLight.castShadow = true;
		keyLight.shadow.mapSize.width = 1024;
		keyLight.shadow.mapSize.height = 1024;
		keyLight.shadow.camera.near = 0.5;
		keyLight.shadow.camera.far = 40;
		keyLight.shadow.bias = -0.0008;
		scene.add(keyLight);

		// 4. Cool Specular Rim Light (Cyan/Blue back highlight)
		const rimLight = new THREE.DirectionalLight(new THREE.Color('#93c5fd'), 2.2);
		rimLight.position.set(8, 12, -7);
		scene.add(rimLight);

		// 5. Direct Top Highlight
		const topLight = new THREE.DirectionalLight(new THREE.Color('#f8fafc'), 1.8);
		topLight.position.set(0, 16, 4);
		scene.add(topLight);

		// Metallic Screw Bolt Materials (Crisp brushed stainless steel with specular highlights)
		boltMaterial = new THREE.MeshStandardMaterial({
			color: new THREE.Color('#f8fafc'),
			metalness: 0.78,
			roughness: 0.22,
			emissive: new THREE.Color('#334155'),
			emissiveIntensity: 0.2
		});

		baseMaterial = new THREE.MeshStandardMaterial({
			color: new THREE.Color('#cbd5e1'),
			metalness: 0.70,
			roughness: 0.28
		});

		lockedBaseMaterial = new THREE.MeshStandardMaterial({
			color: new THREE.Color('#2d1f47'),
			metalness: 0.2,
			roughness: 0.6
		});

		// 3D Hint Source Marker (Pulsing Gold Torus Ring)
		hintSourceMarker = new THREE.Group();
		const srcRingGeom = new THREE.TorusGeometry(0.88, 0.045, 16, 32);
		srcRingGeom.rotateX(Math.PI / 2);
		const srcRingMat = new THREE.MeshBasicMaterial({
			color: 0xfbbf24,
			transparent: true,
			opacity: 0.85
		});
		hintSourceMarker.add(new THREE.Mesh(srcRingGeom, srcRingMat));
		hintSourceMarker.visible = false;
		scene.add(hintSourceMarker);

		// 3D Hint Target Marker (Pulsing Cyan Torus Ring)
		hintTargetMarker = new THREE.Group();
		const dstRingGeom = new THREE.TorusGeometry(0.88, 0.045, 16, 32);
		dstRingGeom.rotateX(Math.PI / 2);
		const dstRingMat = new THREE.MeshBasicMaterial({
			color: 0x38bdf8,
			transparent: true,
			opacity: 0.85
		});
		hintTargetMarker.add(new THREE.Mesh(dstRingGeom, dstRingMat));
		hintTargetMarker.visible = false;
		scene.add(hintTargetMarker);
	}

	function buildScene() {
		boltMeshes.forEach((m) => scene.remove(m));
		boltMeshes.length = 0;

		const totalBolts = Math.max(bolts.length, 9);

		for (let i = 0; i < totalBolts; i++) {
			const isExtraEmpty = i >= bolts.length;
			const bMat = isExtraEmpty ? lockedBaseMaterial : baseMaterial;
			const boltGroup = createBoltMeshGroup(boltMaterial, bMat, isExtraEmpty);

			const pos = getBoltPosition(i, totalBolts);
			boltGroup.position.copy(pos);
			boltGroup.userData = { boltIndex: i };

			// Add large invisible hit target cylinder to make every bolt easy to tap/click
			const hitGeom = new THREE.CylinderGeometry(1.05, 1.05, 4.8, 16);
			const hitMat = new THREE.MeshBasicMaterial({
				transparent: true,
				opacity: 0,
				depthWrite: false
			});
			const hitMesh = new THREE.Mesh(hitGeom, hitMat);
			hitMesh.position.y = 2.1;
			hitMesh.userData = { boltIndex: i };
			boltGroup.add(hitMesh);

			scene.add(boltGroup);
			boltMeshes.push(boltGroup);
		}

		syncNuts();
	}

	function createNutGroup(id: string, color: NutColor): { group: THREE.Group; nutMesh: THREE.Mesh } {
		const group = new THREE.Group();
		const geom = getNutGeometry();

		const nutMesh = new THREE.Mesh(geom, getNutMaterial(color));
		nutMesh.castShadow = true;
		nutMesh.receiveShadow = true;
		group.add(nutMesh);

		// Embossed suit badge on front face
		const iconTex = getNutIconTexture(color);
		const iconMat = new THREE.MeshBasicMaterial({
			map: iconTex,
			transparent: true,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -1
		});
		const iconPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.36), iconMat);
		iconPlane.position.set(0, 0, 0.745);
		iconPlane.renderOrder = 10;
		group.add(iconPlane);

		return { group, nutMesh };
	}

	function syncNuts() {
		const totalBolts = Math.max(bolts.length, 9);
		const activeKeys = new Set<string>();

		bolts.forEach((boltNuts, bIdx) => {
			const boltPos = getBoltPosition(bIdx, totalBolts);

			boltNuts.forEach((nutItem, sIdx) => {
				activeKeys.add(nutItem.id);

				const isSelected = selectedBolt === bIdx && sIdx === boltNuts.length - 1;
				const restingY = boltPos.y + NUT_BASE_Y + sIdx * NUT_HEIGHT;
				const hoverY = boltPos.y + HOVER_Y_OFFSET;

				let instance = nutInstances.get(nutItem.id);

				if (!instance) {
					// Brand new nut: place directly at resting or hover
					const { group, nutMesh } = createNutGroup(nutItem.id, nutItem.color);
					const initialY = isSelected ? hoverY : restingY;
					group.position.set(boltPos.x, initialY, boltPos.z);
					group.rotation.y = isSelected ? -Math.PI * 4 : 0;
					group.userData = { boltIndex: bIdx, slotIndex: sIdx, nutId: nutItem.id };

					scene.add(group);

					instance = {
						id: nutItem.id,
						color: nutItem.color,
						group,
						nutMesh,
						currentBoltIndex: bIdx,
						currentSlotIndex: sIdx,
						targetBoltIndex: bIdx,
						targetSlotIndex: sIdx,
						anim: {
							state: isSelected ? 'hovering' : 'resting',
							fromPos: group.position.clone(),
							toPos: group.position.clone(),
							arcPeakY: 0,
							startRotY: group.rotation.y,
							targetRotY: group.rotation.y,
							progress: 1,
							duration: 0.3,
							squashTimer: 0
						}
					};
					nutInstances.set(nutItem.id, instance);
				} else {
					// Existing nut: check if state changed!
					const prevBolt = instance.targetBoltIndex;
					const prevSlot = instance.targetSlotIndex;

					instance.targetBoltIndex = bIdx;
					instance.targetSlotIndex = sIdx;
					instance.group.userData = { boltIndex: bIdx, slotIndex: sIdx, nutId: nutItem.id };

					if (prevBolt !== bIdx) {
						// TRANSFERRED TO ANOTHER BOLT: Fly along 3D arc!
						const startPos = instance.group.position.clone();
						const destHoverPos = new THREE.Vector3(boltPos.x, hoverY, boltPos.z);
						const destRestPos = new THREE.Vector3(boltPos.x, restingY, boltPos.z);
						const peakY = Math.max(startPos.y, destHoverPos.y) + 1.25;

						instance.anim = {
							state: 'flying',
							fromPos: startPos,
							toPos: destHoverPos,
							arcPeakY: peakY,
							startRotY: instance.group.rotation.y,
							targetRotY: instance.group.rotation.y - Math.PI * 2,
							progress: 0,
							duration: 0.36,
							squashTimer: 0
						};
					} else if (isSelected && instance.anim.state !== 'hovering' && instance.anim.state !== 'unscrewing') {
						// NUT SELECTED: Unscrew upwards!
						instance.anim = {
							state: 'unscrewing',
							fromPos: instance.group.position.clone(),
							toPos: new THREE.Vector3(boltPos.x, hoverY, boltPos.z),
							arcPeakY: 0,
							startRotY: instance.group.rotation.y,
							targetRotY: -Math.PI * 4,
							progress: 0,
							duration: 0.34,
							squashTimer: 0
						};
					} else if (!isSelected && (instance.anim.state === 'hovering' || instance.anim.state === 'unscrewing')) {
						// DESELECTED: Screw back down!
						instance.anim = {
							state: 'screwing_down',
							fromPos: instance.group.position.clone(),
							toPos: new THREE.Vector3(boltPos.x, restingY, boltPos.z),
							arcPeakY: 0,
							startRotY: instance.group.rotation.y,
							targetRotY: 0,
							progress: 0,
							duration: 0.30,
							squashTimer: 0
						};
					}
				}
			});
		});

		// Remove nuts that were removed (e.g. level reset)
		for (const [id, inst] of nutInstances.entries()) {
			if (!activeKeys.has(id)) {
				scene.remove(inst.group);
				nutInstances.delete(id);
			}
		}
	}

	let lastBoltsLen = -1;
	$effect(() => {
		// Deeply track bolts state, selectedBolt, and hintMove
		const _b = bolts.map((b) => b.map((n) => n.id).join(',')).join(';');
		const _s = selectedBolt;
		const _h = hintMove;

		if (scene && bolts && bolts.length > 0) {
			if (bolts.length !== lastBoltsLen) {
				lastBoltsLen = bolts.length;
				buildScene();
			} else {
				syncNuts();
			}
		}
	});

	let lastPointerTime = 0;

	function handlePointerDown(event: MouseEvent | PointerEvent) {
		const now = performance.now();
		if (now - lastPointerTime < 120) return;
		lastPointerTime = now;

		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		raycaster.setFromCamera(pointer, camera);
		const intersects = raycaster.intersectObjects(scene.children, true);

		if (intersects.length > 0) {
			for (const hit of intersects) {
				let curr: THREE.Object3D | null = hit.object;
				while (curr) {
					if (curr.userData && curr.userData.boltIndex !== undefined) {
						const bIdx = curr.userData.boltIndex;
						if (bIdx < bolts.length) {
							onBoltClick(bIdx);
							return;
						}
					}
					curr = curr.parent;
				}
			}
		}
	}

	function updateCameraFraming() {
		if (!container || !camera) return;
		const w = container.clientWidth;
		const h = container.clientHeight;
		if (w === 0 || h === 0) return;
		const aspect = w / h;
		camera.aspect = aspect;

		// Frame all bolts comfortably with side padding
		const hSpanNeeded = 10.4;
		const vSpanNeeded = 8.6;
		const halfFovRad = THREE.MathUtils.degToRad(camera.fov / 2);
		const tanFov = Math.tan(halfFovRad);

		const zForHeight = (vSpanNeeded / 2) / tanFov;
		const zForWidth = (hSpanNeeded / 2) / (tanFov * aspect);
		const targetZ = Math.max(26.5, zForHeight, zForWidth);

		camera.position.z = targetZ;
		camera.position.y = targetZ * 0.33;
		camera.lookAt(0, -0.6, 0);
		camera.updateProjectionMatrix();
	}

	function handleResize() {
		if (!container || !renderer || !camera) return;
		updateCameraFraming();
		renderer.setSize(container.clientWidth, container.clientHeight);
	}

	let clock = new THREE.Clock();

	function animate() {
		animationFrameId = requestAnimationFrame(animate);
		const rawDelta = clock.getDelta();
		const delta = Math.min(rawDelta, 0.05); // Cap to 50ms to prevent jumps if tab backgrounded
		const time = clock.getElapsedTime();
		const totalBolts = Math.max(bolts.length, 9);

		for (const inst of nutInstances.values()) {
			const anim = inst.anim;
			const boltPos = getBoltPosition(inst.targetBoltIndex, totalBolts);
			const restingY = boltPos.y + NUT_BASE_Y + inst.targetSlotIndex * NUT_HEIGHT;
			const hoverY = boltPos.y + HOVER_Y_OFFSET;

			if (anim.state === 'unscrewing') {
				anim.progress = Math.min(1.0, anim.progress + delta / anim.duration);
				const t = easeOutCubic(anim.progress);

				inst.group.position.y = THREE.MathUtils.lerp(anim.fromPos.y, anim.toPos.y, t);
				// Unthreading rotation coupled to rise
				inst.group.rotation.y = THREE.MathUtils.lerp(anim.startRotY, anim.targetRotY, t);

				if (anim.progress >= 1.0) {
					anim.state = 'hovering';
				}
			} else if (anim.state === 'hovering') {
				// Gentle sinusoidal floating while waiting above bolt
				const hoverFloat = Math.sin(time * 5.5) * 0.08;
				inst.group.position.set(boltPos.x, hoverY + hoverFloat, boltPos.z);
				inst.group.rotation.y = -Math.PI * 4;
			} else if (anim.state === 'flying') {
				// Parabolic arc flight from Source Bolt to Dest Bolt
				anim.progress = Math.min(1.0, anim.progress + delta / anim.duration);
				const u = anim.progress;
				const t = easeInOutQuad(u);

				// Horizontal (X, Z) interpolation + slight forward camera bulge
				const curX = THREE.MathUtils.lerp(anim.fromPos.x, anim.toPos.x, t);
				const curZ = THREE.MathUtils.lerp(anim.fromPos.z, anim.toPos.z, t) + Math.sin(Math.PI * u) * 0.5;

				// Parabolic vertical arc
				const baseY = THREE.MathUtils.lerp(anim.fromPos.y, anim.toPos.y, t);
				const arcY = Math.sin(Math.PI * u) * (anim.arcPeakY - baseY);
				const curY = baseY + arcY;

				inst.group.position.set(curX, curY, curZ);
				inst.group.rotation.y = THREE.MathUtils.lerp(anim.startRotY, anim.targetRotY, t);

				if (anim.progress >= 1.0) {
					// Reached top of destination bolt -> now screw down into target slot!
					anim.state = 'screwing_down';
					anim.fromPos.copy(inst.group.position);
					anim.toPos.set(boltPos.x, restingY, boltPos.z);
					anim.startRotY = inst.group.rotation.y;
					anim.targetRotY = 0;
					anim.progress = 0;
					anim.duration = 0.28;
				}
			} else if (anim.state === 'screwing_down') {
				anim.progress = Math.min(1.0, anim.progress + delta / anim.duration);
				const t = easeInQuad(anim.progress);

				inst.group.position.y = THREE.MathUtils.lerp(anim.fromPos.y, anim.toPos.y, t);
				inst.group.position.x = boltPos.x;
				inst.group.position.z = boltPos.z;
				// Clockwise rotation coupled to descent
				inst.group.rotation.y = THREE.MathUtils.lerp(anim.startRotY, anim.targetRotY, t);

				if (anim.progress >= 1.0) {
					// Impact! Trigger juicy squash-and-stretch
					anim.state = 'squashing';
					anim.squashTimer = 0;
					inst.currentBoltIndex = inst.targetBoltIndex;
					inst.currentSlotIndex = inst.targetSlotIndex;
				}
			} else if (anim.state === 'squashing') {
				anim.squashTimer += delta;
				const duration = 0.18;
				const p = anim.squashTimer / duration;

				if (p < 1.0) {
					// Squash down on Y, bulge out on X & Z, then spring back
					const squashFactor = Math.sin(p * Math.PI);
					const scaleY = 1.0 - 0.16 * squashFactor;
					const scaleXZ = 1.0 + 0.09 * squashFactor;
					inst.group.scale.set(scaleXZ, scaleY, scaleXZ);
				} else {
					inst.group.scale.set(1, 1, 1);
					anim.state = 'resting';
				}

				inst.group.position.set(boltPos.x, restingY, boltPos.z);
				inst.group.rotation.y = 0;
			} else {
				// Resting on bolt
				inst.group.position.set(boltPos.x, restingY, boltPos.z);
				inst.group.rotation.y = 0;
				inst.group.scale.set(1, 1, 1);
			}
		}

		// 3D Hint Indicators (Pulsing glowing rings above source and destination)
		if (hintMove) {
			const total = Math.max(bolts.length, 9);
			const srcPos = getBoltPosition(hintMove.from, total);
			const dstPos = getBoltPosition(hintMove.to, total);
			const pulse = 1.0 + Math.sin(time * 6.5) * 0.12;

			if (hintSourceMarker) {
				hintSourceMarker.position.set(srcPos.x, srcPos.y + 3.4, srcPos.z);
				hintSourceMarker.scale.set(pulse, pulse, pulse);
				hintSourceMarker.rotation.y = time * 2.0;
				hintSourceMarker.visible = true;
			}
			if (hintTargetMarker) {
				hintTargetMarker.position.set(dstPos.x, dstPos.y + 3.4, dstPos.z);
				hintTargetMarker.scale.set(pulse, pulse, pulse);
				hintTargetMarker.rotation.y = -time * 2.0;
				hintTargetMarker.visible = true;
			}

			const srcBolt = boltMeshes[hintMove.from];
			if (srcBolt) {
				srcBolt.rotation.y = Math.sin(time * 8.0) * 0.08;
			}
		} else {
			if (hintSourceMarker) hintSourceMarker.visible = false;
			if (hintTargetMarker) hintTargetMarker.visible = false;
		}

		renderer.render(scene, camera);
	}

	function easeOutCubic(t: number): number {
		return 1 - Math.pow(1 - t, 3);
	}

	function easeInQuad(t: number): number {
		return t * t;
	}

	function easeInOutQuad(t: number): number {
		return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
	}
</script>

<div
	bind:this={container}
	class="relative w-full h-full flex-1 flex items-center justify-center select-none overflow-hidden touch-none"
	role="application"
	aria-label="Nuts 3D Board"
>
	<canvas
		bind:this={canvas}
		onpointerdown={handlePointerDown}
		class="w-full h-full cursor-pointer touch-none"
	></canvas>
</div>
