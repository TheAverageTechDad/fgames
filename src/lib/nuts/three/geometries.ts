import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
let shaftGeometryCache: THREE.BufferGeometry | null = null;

let nutGeometryCache: THREE.BufferGeometry | null = null;
let boltBaseGeometryCache: THREE.BufferGeometry | null = null;
let capGeometryCache: THREE.BufferGeometry | null = null;

/**
 * Creates the rounded beveled hexagonal nut geometry with center hole
 * Scaled for clean, spacious mobile puzzle proportions
 */
export function getNutGeometry(): THREE.BufferGeometry {
	if (nutGeometryCache) return nutGeometryCache;

	const shape = new THREE.Shape();
	const sides = 6;
	const outerRadius = 0.78;
	const cornerRadius = 0.09;
	const holeRadius = 0.32;

	// Build rounded hexagon oriented with flat front face
	const angleStep = (Math.PI * 2) / sides;
	const vertices: { x: number; y: number }[] = [];

	for (let i = 0; i < sides; i++) {
		const a = i * angleStep;
		vertices.push({
			x: Math.cos(a) * outerRadius,
			y: Math.sin(a) * outerRadius
		});
	}

	for (let i = 0; i < sides; i++) {
		const curr = vertices[i];
		const next = vertices[(i + 1) % sides];
		const prev = vertices[(i + sides - 1) % sides];

		const dPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
		const lenPrev = Math.hypot(dPrev.x, dPrev.y);
		const dNext = { x: next.x - curr.x, y: next.y - curr.y };
		const lenNext = Math.hypot(dNext.x, dNext.y);

		const p1 = {
			x: curr.x + (dPrev.x / lenPrev) * cornerRadius,
			y: curr.y + (dPrev.y / lenPrev) * cornerRadius
		};
		const p2 = {
			x: curr.x + (dNext.x / lenNext) * cornerRadius,
			y: curr.y + (dNext.y / lenNext) * cornerRadius
		};

		if (i === 0) shape.moveTo(p1.x, p1.y);
		else shape.lineTo(p1.x, p1.y);
		shape.quadraticCurveTo(curr.x, curr.y, p2.x, p2.y);
	}
	shape.closePath();

	// Circular hole in the center for the threaded bolt
	const holePath = new THREE.Path();
	holePath.absarc(0, 0, holeRadius, 0, Math.PI * 2, true);
	shape.holes.push(holePath);

	// Extrude with smooth bevels
	const extrudeSettings: THREE.ExtrudeGeometryOptions = {
		depth: 0.42,
		bevelEnabled: true,
		bevelSegments: 2,
		steps: 1,
        curveSegments: 6,
		bevelSize: 0.05,
		bevelThickness: 0.04
	};

	const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
	geom.center();
	// Rotate so hole is vertical along Y
	geom.rotateX(Math.PI / 2);

	nutGeometryCache = geom;
	return geom;
}

/**
 * Creates circular pedestal base for bolt
 */
export function getBoltBaseGeometry(): THREE.BufferGeometry {
	if (boltBaseGeometryCache) return boltBaseGeometryCache;

	const shape = new THREE.Shape();
	shape.moveTo(0, 0);
	shape.lineTo(0.92, 0);
	shape.lineTo(0.92, 0.07);
	shape.lineTo(0.80, 0.12);
	shape.lineTo(0.36, 0.12);
	shape.lineTo(0.36, 0.16);
	shape.lineTo(0, 0.16);
	shape.closePath();

	const geom = new THREE.LatheGeometry(shape.getPoints(), 24);
	boltBaseGeometryCache = geom;
	return geom;
}

/**
 * Constructs a complete 3D bolt group with threaded shaft, top dome cap, and circular base
 */
export function createBoltMeshGroup(
	shaftMaterial: THREE.Material,
	baseMaterial: THREE.Material,
	isExtraEmpty = false
): THREE.Group {
	const group = new THREE.Group();

	// 1. Circular Base Pedestal (Washer)
	const base = new THREE.Mesh(getBoltBaseGeometry(), baseMaterial);
	base.receiveShadow = true;
	group.add(base);

	if (isExtraEmpty) {
		// Locked extra bolt socket (dark socket ring)
		const peg = new THREE.Mesh(
			new THREE.CylinderGeometry(0.20, 0.20, 0.18, 16),
			baseMaterial
		);
		peg.position.y = 0.18;
		group.add(peg);
		return group;
	}


    // Reuse one merged shaft geometry for every bolt: two draw calls per bolt.
    if (!shaftGeometryCache) {
        const height=2.45,radius=.27;
        const core=new THREE.CylinderGeometry(radius*.94,radius*.94,height,16).translate(0,.12+height/2,0);
        const cap=new THREE.SphereGeometry(radius*.95,16,8,0,Math.PI*2,0,Math.PI/2).translate(0,.12+height,0);
        const parts:THREE.BufferGeometry[]=[core,cap];
        for(let i=0;i<12;i++)parts.push(new THREE.TorusGeometry(radius,.022,6,16).rotateX(Math.PI/2).translate(0,.24+i*(height-.24)/12,0));
        shaftGeometryCache=mergeGeometries(parts);
        parts.forEach(part=>part.dispose());
    }
    group.add(new THREE.Mesh(shaftGeometryCache!,shaftMaterial));
    return group;
}

/**
 * Acorn cap nut that locks a finished bolt: a short hex collar with a dome that covers the shaft tip.
 * Origin is the collar's bottom face, so it sits straight on the top nut.
 */
export function getCapGeometry(): THREE.BufferGeometry {
	if (capGeometryCache) return capGeometryCache;
	const collar = new THREE.CylinderGeometry(0.58, 0.58, 0.34, 6).rotateY(Math.PI / 6).translate(0, 0.17, 0);
	const dome = new THREE.SphereGeometry(0.42, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.34, 0);
	const flatCollar = collar.toNonIndexed();
	flatCollar.computeVertexNormals(); // crisp hex faces; the dome keeps its smooth normals
	const smoothDome = dome.toNonIndexed();
	capGeometryCache = mergeGeometries([flatCollar, smoothDome]);
	[collar, dome, flatCollar, smoothDome].forEach((part) => part.dispose());
	return capGeometryCache;
}
