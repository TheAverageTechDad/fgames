import * as THREE from 'three';
import {getNutGeometry,createBoltMeshGroup,getCapGeometry} from './geometries';
import {getNutIconTexture,makeCanvas} from './textures';
import {NUT_THEMES,type NutColor,type NutItem} from '../types';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
export interface SceneState {bolts:NutItem[][];selectedBolt:number|null;hintMove:{from:number;to:number}|null;isWon:boolean;capacity:number;guided:boolean;nudge?:{bolt:number;at:number}|null;}
export interface Viewport {width:number;height:number;dpr:number;}
export interface SceneCallbacks {bolt:(index:number)=>void;settled:()=>void;targets:(targets:{x:number;y:number}[])=>void;ready:()=>void;}
/** The existing Three scene runs unchanged in a worker, with a main-thread fallback. */
export function createNutsRenderer(canvas:HTMLCanvasElement|OffscreenCanvas,viewport:Viewport,state:SceneState,callbacks:SceneCallbacks){
 let {bolts,selectedBolt,hintMove,isWon,capacity,guided}=state;
 let lastNudge=state.nudge?.at??0;
 const onBoltClick=callbacks.bolt,onSettled=callbacks.settled;
 // ponytail: a static puzzle board is cheap, so it always renders at native resolution (up to 3x)
 const pixelRatio=()=>Math.min(viewport.dpr||1,3);
 let alive=true,ready=false;
 const schedule=typeof requestAnimationFrame==='function'?requestAnimationFrame:(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),16) as unknown as number;
 const cancel=typeof cancelAnimationFrame==='function'?cancelAnimationFrame:clearTimeout;
	// Three.js core
	let renderer!: THREE.WebGLRenderer;
	let scene!: THREE.Scene;
	let camera!: THREE.PerspectiveCamera;
	let animationFrameId: number;
	let raycaster: THREE.Raycaster;
	let pointer: THREE.Vector2;

	// Constants for 3D layout (Scaled down & spaced out for clean, airy layout)
	const NUT_HEIGHT = 0.50;
	const NUT_BASE_Y = 0.42; // nut is .50 tall and centred: its bottom rests on the base hub (y .16)
	const SHAFT_TOP_Y = 2.57; // the shaft is built for 4 nuts; taller stacks stretch it (see buildScene)
	// Lift height for a selected nut: clear of the shaft tip at any capacity (3.25 for the usual 4).
	const hoverOffset = () => Math.max(3.25, NUT_BASE_Y + capacity * NUT_HEIGHT + 0.83);
	let HOVER_Y_OFFSET = hoverOffset();

	const BOLT_SPACING_X_TOP = 2.24;
	const BOLT_SPACING_X_BOTTOM = 1.95;

	function getBoltPosition(index: number, total: number): THREE.Vector3 {
		if (total <= 4) {
			const x = (index - (total - 1) / 2) * BOLT_SPACING_X_TOP;
			return new THREE.Vector3(x, 0, 0);
		}
		// Two rows. The gap follows the stack height so a lifted nut on the bottom row stays clear of
		// the row above, whatever the level's capacity.
		const rowGap = HOVER_Y_OFFSET + 0.9;
		const topCount = total <= 6 ? 3 : Math.ceil(total / 2);
		const isTop = index < topCount;
		const count = isTop ? topCount : total - topCount;
		const col = isTop ? index : index - topCount;
		const spacing = total <= 6 ? 2.3 : BOLT_SPACING_X_BOTTOM;
		return new THREE.Vector3((col - (count - 1) / 2) * spacing, isTop ? rowGap / 2 : -rowGap / 2, 0);
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
        delay?: number;
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
	// One gold acorn nut per bolt: screwed on once that bolt's set is finished, so it reads as locked.
	const caps: THREE.Mesh[] = [];
	const capProgress: number[] = [];
	const capWobble: number[] = [];
	const CAP_DROP = 0.32;
	const WOBBLE = 0.45;

	// Materials (Clean matte finish for nuts, crisp metallic for screw shafts)
	const nutMaterials: Map<NutColor, THREE.MeshPhysicalMaterial> = new Map();
	let boltMaterial: THREE.MeshStandardMaterial;
	let baseMaterial: THREE.MeshStandardMaterial;
	let lockedBaseMaterial: THREE.MeshStandardMaterial;
	let capMaterial: THREE.MeshStandardMaterial;
	let hintSourceMarker: THREE.Group;
	let hintTargetMarker: THREE.Group;

	function getNutMaterial(color: NutColor): THREE.MeshPhysicalMaterial {
		if (nutMaterials.has(color)) return nutMaterials.get(color)!;

		const theme = NUT_THEMES[color];
		// glossy toy plastic: a clear coat over a saturated base, like the reference game's nuts
		const mat = new THREE.MeshPhysicalMaterial({
			color: new THREE.Color(theme.primary),
			roughness: 0.42,
			metalness: 0,
			clearcoat: 0.8,
			clearcoatRoughness: 0.22
		});
		nutMaterials.set(color, mat);
		return mat;
	}


	function initThree() {
		scene = new THREE.Scene();

		// Camera with downward perspective showing top facets and beveled edges
		camera = new THREE.PerspectiveCamera(28, viewport.width / viewport.height, 0.1, 100);
		updateCameraFraming();

		renderer = new THREE.WebGLRenderer({
			canvas: canvas as HTMLCanvasElement,
			antialias: true,
			alpha: true,
			preserveDrawingBuffer: false,
			powerPreference: 'default'
		});
		renderer.setSize(viewport.width, viewport.height, false);
		renderer.setPixelRatio(pixelRatio());
		renderer.shadowMap.enabled = false;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		// Neutral keeps the nut colours saturated (ACES at 1.22 washed them out, as it did in Catcha)
		renderer.toneMapping = THREE.NeutralToneMapping;
		renderer.toneMappingExposure = 1.0;
		// reflections for the steel bolts and the nuts' clear coat
		const pmrem = new THREE.PMREMGenerator(renderer);
		scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		scene.environmentIntensity = 0.7;
		pmrem.dispose();

		raycaster = new THREE.Raycaster();
		pointer = new THREE.Vector2();


		// Studio 3-Point + Hemisphere Lighting
		// 1. Soft purple ambient bounce matching background
		const ambient = new THREE.AmbientLight(new THREE.Color('#fff6e6'), 0.25);
		scene.add(ambient);

		// 2. Hemisphere Light (Soft Sky White above, Slate/Ground below)
		const hemiLight = new THREE.HemisphereLight(0xffffff, 0x6b7058, 0.45);
		scene.add(hemiLight);

		// 3. Main Key Light (Warm white, cast soft shadows)
		const keyLight = new THREE.DirectionalLight(new THREE.Color('#ffffff'), 2.0);
		keyLight.position.set(-6, 16, 12);
		keyLight.castShadow = false;
		keyLight.shadow.mapSize.width = 1024;
		keyLight.shadow.mapSize.height = 1024;
		keyLight.shadow.camera.near = 0.5;
		keyLight.shadow.camera.far = 40;
		keyLight.shadow.bias = -0.0008;
		scene.add(keyLight);

		// 4. Cool Specular Rim Light (Cyan/Blue back highlight)
		const rimLight = new THREE.DirectionalLight(new THREE.Color('#93c5fd'), 0.7);
		rimLight.position.set(8, 12, -7);
		scene.add(rimLight);

		// 5. Direct Top Highlight
		const topLight = new THREE.DirectionalLight(new THREE.Color('#f8fafc'), 0.9);
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

		capMaterial = new THREE.MeshStandardMaterial({
			color: new THREE.Color('#f5b82e'),
			metalness: 0.75,
			roughness: 0.3,
			emissive: new THREE.Color('#5c3b00'),
			emissiveIntensity: 0.25
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
		HOVER_Y_OFFSET = hoverOffset();
		boltMeshes.forEach((m) => scene.remove(m));
		boltMeshes.length = 0;
		caps.forEach((cap) => scene.remove(cap));
		caps.length = capProgress.length = capWobble.length = 0;

		const totalBolts = bolts.length;

		for (let i = 0; i < totalBolts; i++) {
			const isExtraEmpty = i >= bolts.length;
			const bMat = isExtraEmpty ? lockedBaseMaterial : baseMaterial;
			const boltGroup = createBoltMeshGroup(boltMaterial, bMat, isExtraEmpty);
			// keep the shaft tip above the stack when a level holds more than 4 nuts
			boltGroup.children.at(-1)!.scale.y = Math.max(1, (NUT_BASE_Y + capacity * NUT_HEIGHT + 0.15) / SHAFT_TOP_Y);

			const pos = getBoltPosition(i, totalBolts);
			boltGroup.position.copy(pos);
			boltGroup.userData = { boltIndex: i };

			const shadowCanvas=makeCanvas(64,64);shadowCanvas.width=64;shadowCanvas.height=64;
            const ctx=shadowCanvas.getContext('2d') as CanvasRenderingContext2D;const gradient=ctx.createRadialGradient(32,32,2,32,32,32);gradient.addColorStop(0,'rgba(36,27,58,.35)');gradient.addColorStop(1,'rgba(36,27,58,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
            const blob=new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
            blob.position.set(0,-.18,-.2);blob.rotation.x=-.45;boltGroup.add(blob);
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

			const cap = new THREE.Mesh(getCapGeometry(), capMaterial);
			cap.visible = false;
			scene.add(cap);
			caps.push(cap);
			capProgress.push(0);
			capWobble.push(0);
		}

		syncNuts();
        updateCameraFraming();
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
		const iconPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.40), iconMat);
		iconPlane.position.set(0, 0, 0.745);
		iconPlane.renderOrder = 10;
		group.add(iconPlane);

		return { group, nutMesh };
	}

	function syncNuts() {
		const totalBolts = bolts.length;
		const activeKeys = new Set<string>();
        let stagger=0;

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
                            delay: stagger++ * 0.06,
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
                for(const child of inst.group.children){if(child instanceof THREE.Mesh && child!==inst.nutMesh){child.geometry.dispose();const materials=Array.isArray(child.material)?child.material:[child.material];materials.forEach(material=>material.dispose());}}
				nutInstances.delete(id);
			}
		}
	}

	let lastPointerTime = 0;

	function pointerDown(x:number,y:number) {
		const now = performance.now();
		if (now - lastPointerTime < 120) return;
		lastPointerTime = now;

        pointer.set(x,y);

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
		if (!camera) return;
		const w = viewport.width;
		const h = viewport.height;
		if (w === 0 || h === 0) return;
		const aspect = w / h;
		camera.aspect = aspect;


        const positions=bolts.map((_,i)=>getBoltPosition(i,bolts.length));
        if(!positions.length)return;
        const minX=Math.min(...positions.map(p=>p.x))-1.0;
        const maxX=Math.max(...positions.map(p=>p.x))+1.0;
        const minY=Math.min(...positions.map(p=>p.y))-.7;
        const maxY=Math.max(...positions.map(p=>p.y))+HOVER_Y_OFFSET+1.4;
        const centerY=(minY+maxY)/2;
        const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
        const distance=Math.max((maxX-minX)/(2*tan*aspect),(maxY-minY)/(2*tan))*1.06;
        camera.position.set(0,centerY+distance*.23,distance);
        camera.lookAt(0,centerY,0);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        boltTargets=positions.map(p=>{p=p.clone();p.y+=1.4;p.project(camera);return {x:(p.x+1)*50,y:(1-p.y)*50};});
        callbacks.targets(boltTargets);

	}

	function handleResize() {
		if (!renderer || !camera) return;
		updateCameraFraming();
		renderer.setPixelRatio(pixelRatio());
		renderer.setSize(viewport.width, viewport.height, false);
	}

	let clock = new THREE.Clock();
    let moving=false;
    
    let boltTargets: {x:number;y:number}[]=[];
    


	function animate() {
		animationFrameId = schedule(animate);
		const rawDelta = clock.getDelta();
		const delta = Math.min(rawDelta, 0.05); // Cap to 50ms to prevent jumps if tab backgrounded
		const time = clock.getElapsedTime();
		const totalBolts = bolts.length;

		for (const inst of nutInstances.values()) {
			const anim = inst.anim;
			const boltPos = getBoltPosition(inst.targetBoltIndex, totalBolts);
			const restingY = boltPos.y + NUT_BASE_Y + inst.targetSlotIndex * NUT_HEIGHT;
			const hoverY = boltPos.y + HOVER_Y_OFFSET;

			if(anim.delay && anim.delay>0){anim.delay-=delta;continue;}
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

		// Locking caps: drop and screw on once a finished bolt's nuts have all landed.
		bolts.forEach((nuts, i) => {
			const cap = caps[i];
			if (!cap) return;
			const finished = nuts.length === capacity && nuts.every((n) => n.color === nuts[0].color);
			if (!finished) { cap.visible = false; capProgress[i] = 0; capWobble[i] = 0; return; }
			if (!nuts.every((n) => nutInstances.get(n.id)?.anim.state === 'resting')) return;
			const pos = getBoltPosition(i, totalBolts);
			capProgress[i] = Math.min(1, capProgress[i] + delta / CAP_DROP);
			const t = easeOutCubic(capProgress[i]);
			capWobble[i] = Math.max(0, capWobble[i] - delta);
			const w = capWobble[i] / WOBBLE;
			cap.visible = true;
			cap.position.set(pos.x, pos.y + NUT_BASE_Y + capacity * NUT_HEIGHT - NUT_HEIGHT / 2 + (1 - t) * 0.9, pos.z);
			cap.rotation.set(0, (1 - t) * -Math.PI * 2, Math.sin(w * Math.PI * 6) * 0.14 * w);
		});

		// 3D Hint Indicators (Pulsing glowing rings above source and destination)
		if (hintMove) {
			const total = bolts.length;
			const srcPos = getBoltPosition(hintMove.from, total);
			const dstPos = getBoltPosition(hintMove.to, total);
			const pulse = 1.0 + Math.sin(time * 6.5) * 0.12;

			if (hintSourceMarker) {
				hintSourceMarker.position.set(srcPos.x, srcPos.y + HOVER_Y_OFFSET + 0.15, srcPos.z);
				hintSourceMarker.scale.set(pulse, pulse, pulse);
				hintSourceMarker.rotation.y = time * 2.0;
				hintSourceMarker.visible = true;
			}
			if (hintTargetMarker) {
				hintTargetMarker.position.set(dstPos.x, dstPos.y + HOVER_Y_OFFSET + 0.15, dstPos.z);
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

        const active=[...nutInstances.values()].some(n=>['flying','screwing_down','squashing'].includes(n.anim.state));
        if(moving&&!active)onSettled();
        moving=active;
        renderer.render(scene, camera);
        if(!ready){
            ready=true;
            // Reveal only after the GPU completes its first frame. This prevents the
            // compositor from blocking the UI on a cold shader/driver setup.
            const gl=renderer.getContext() as WebGL2RenderingContext;const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
            const reveal=()=>{if(!alive){if(fence)gl.deleteSync(fence);return;}if(fence&&gl.clientWaitSync(fence,0,0)===gl.TIMEOUT_EXPIRED){setTimeout(reveal,8);return;}if(fence)gl.deleteSync(fence);callbacks.ready();};
            reveal();
        }
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

 initThree();buildScene();
 void renderer.compileAsync(scene,camera).then(()=>{if(alive)animate();});
 return {
  update(next:SceneState){const oldLength=bolts.length,oldCapacity=capacity;({bolts,selectedBolt,hintMove,isWon,capacity,guided}=next);if(next.nudge&&next.nudge.at!==lastNudge){lastNudge=next.nudge.at;capWobble[next.nudge.bolt]=WOBBLE;}if(oldLength!==bolts.length||oldCapacity!==capacity)buildScene();else syncNuts();},
  resize(next:Viewport){viewport=next;handleResize();},
  pointer:pointerDown,
  destroy(){alive=false;cancel(animationFrameId);scene.traverse(obj=>{if(obj instanceof THREE.Mesh){obj.geometry.dispose();const materials=Array.isArray(obj.material)?obj.material:[obj.material];for(const material of materials){if(material.map)material.map.dispose();material.dispose();}}});renderer.dispose();}
 };
}
