import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

// Keep the full-resolution original out of the offline download.
const source = 'assets/branding/pocket-arcade.png';
const output = 'static/icons';
await mkdir(output, { recursive: true });
for (const size of [192, 512]) {
	await sharp(source).resize(size, size).png().toFile(`${output}/pocket-${size}.png`);
	// Inset the complete artwork into the central maskable safe area.
	const inset = Math.round(size * 0.78);
	const tile = await sharp(source).resize(inset, inset).png().toBuffer();
	await sharp({
		create: { width: size, height: size, channels: 4, background: '#fffbed' }
	}).composite([{ input: tile, gravity: 'centre' }])
		.png().toFile(`${output}/pocket-maskable-${size}.png`);
}
await sharp(source).resize(180, 180).png().toFile(`${output}/pocket-apple.png`);
await sharp(`${output}/pocket-favicon.svg`).resize(32, 32).png()
	.toFile('static/favicon.png');
