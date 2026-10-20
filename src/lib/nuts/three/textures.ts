import * as THREE from 'three';
import { NUT_THEMES, type NutColor } from '../types';

const textureCache = new Map<NutColor, THREE.CanvasTexture>();

/**
 * Creates a high-res canvas texture for each nut color featuring the embossed icon
 */
export function getNutIconTexture(color: NutColor): THREE.CanvasTexture {
	if (textureCache.has(color)) {
		return textureCache.get(color)!;
	}

	const size = 128;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d')!;

	const theme = NUT_THEMES[color];

	// Transparent background so the glossy physical material shines through
	ctx.clearRect(0, 0, size, size);

	// Center icon symbol
	ctx.save();
	ctx.translate(size / 2, size / 2);

	// Draw embossed symbol based on color
	drawIcon(ctx, color);

	ctx.restore();

	const texture = new THREE.CanvasTexture(canvas);
	texture.wrapS = THREE.ClampToEdgeWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	textureCache.set(color, texture);
	return texture;
}

function drawIcon(ctx: CanvasRenderingContext2D, color: NutColor) {
	// Shadow for emboss effect
	ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
	ctx.shadowBlur = 1;
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = 1;

	// High-contrast foreground icon badge
	const theme = NUT_THEMES[color];
	ctx.fillStyle = '#ffffff';
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
	ctx.lineWidth = 2.5;

	const scale = 2.5;
	ctx.scale(scale, scale);

	switch (color) {
		case 'blue': // Water drop
			ctx.beginPath();
			ctx.moveTo(0, -18);
			ctx.bezierCurveTo(12, -4, 15, 8, 14, 14);
			ctx.bezierCurveTo(12, 20, -12, 20, -14, 14);
			ctx.bezierCurveTo(-15, 8, -12, -4, 0, -18);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			break;

		case 'orange': // Lightning / Diamond
			ctx.beginPath();
			ctx.moveTo(3, -24);
			ctx.lineTo(-14, 2);
			ctx.lineTo(-1, 2);
			ctx.lineTo(-4, 24);
			ctx.lineTo(14, -2);
			ctx.lineTo(1, -2);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			break;

		case 'pink': // Crown
			ctx.beginPath();
			ctx.moveTo(-20, 16);
			ctx.lineTo(-20, -6);
			ctx.lineTo(-10, 4);
			ctx.lineTo(0, -18);
			ctx.lineTo(10, 4);
			ctx.lineTo(20, -6);
			ctx.lineTo(20, 16);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			// Base line
			ctx.fillRect(-20, 12, 40, 5);
			break;

		case 'green': // Clover / Club
			// 3 circles
			ctx.beginPath();
			ctx.arc(0, -11, 8.5, 0, Math.PI * 2);
			ctx.arc(-10, 2, 8.5, 0, Math.PI * 2);
			ctx.arc(10, 2, 8.5, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			// stem
			ctx.beginPath();
			ctx.moveTo(-2, 2);
			ctx.lineTo(-5, 18);
			ctx.lineTo(5, 18);
			ctx.lineTo(2, 2);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			break;

		case 'red': // Heart
			ctx.beginPath();
			ctx.moveTo(0, 18);
			ctx.bezierCurveTo(-22, 4, -22, -18, 0, -8);
			ctx.bezierCurveTo(22, -18, 22, 4, 0, 18);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			break;

		case 'yellow': // Sun
			// Center circle
			ctx.beginPath();
			ctx.arc(0, 0, 9, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			// Rays
			ctx.lineWidth = 2.5;
			for (let i = 0; i < 8; i++) {
				const a = (i * Math.PI) / 4;
				ctx.beginPath();
				ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
				ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 18);
				ctx.stroke();
			}
			break;

		default:
			// Star
			ctx.beginPath();
			for (let i = 0; i < 5; i++) {
				const rOut = 18;
				const rIn = 8;
				const aOut = (i * Math.PI * 2) / 5 - Math.PI / 2;
				const aIn = aOut + Math.PI / 5;
				if (i === 0) ctx.moveTo(Math.cos(aOut) * rOut, Math.sin(aOut) * rOut);
				else ctx.lineTo(Math.cos(aOut) * rOut, Math.sin(aOut) * rOut);
				ctx.lineTo(Math.cos(aIn) * rIn, Math.sin(aIn) * rIn);
			}
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			break;
	}
}

/**
 * Creates normal map for metallic screw thread
 */
export function getThreadNormalMap(): THREE.CanvasTexture {
	const width = 512;
	const height = 512;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;

	// Draw diagonal thread ridges
	const threadCount = 16;
	const h = height / threadCount;

	for (let i = 0; i < threadCount; i++) {
		const y = i * h;
		const grad = ctx.createLinearGradient(0, y, 0, y + h);
		// Normal map RGB: X=Red, Y=Green, Z=Blue
		grad.addColorStop(0, 'rgb(128, 220, 255)');
		grad.addColorStop(0.5, 'rgb(128, 128, 255)');
		grad.addColorStop(1, 'rgb(128, 40, 255)');
		ctx.fillStyle = grad;
		ctx.fillRect(0, y, width, h);
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(1, 2);
	return texture;
}
