import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/Users/supermx/.gemini/antigravity/brain/ca98a1e8-457a-4dc8-9762-e5fa03cbd3c2';
const OUT_DIR = '/Users/supermx/Projects/fgames/static/vehicles';

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const IMAGES = [
  { file: 'red_truck_1792455461917.jpg', base: 'red_truck' },
  { file: 'car_white_1792455475961.jpg', base: 'car_white' },
  { file: 'car_blue_1792455489581.jpg', base: 'car_blue' },
  { file: 'car_tan_1792455503473.jpg', base: 'car_tan' },
  { file: 'truck_tanker_1792455518991.jpg', base: 'truck_tanker', flip180: true },
  { file: 'bus_purple_1792455535122.jpg', base: 'bus_purple', flip180: true }
];

async function processImage(item) {
  const inPath = path.join(ARTIFACT_DIR, item.file);
  const img = sharp(inPath);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  
  const rgba = Buffer.alloc(width * height * 4);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qHead = 0;
  let qTail = 0;
  
  // Studio background / shadow detection:
  // Studio white floor and drop shadows are near-white or neutral grey (diff <= 14)
  function isBgPixel(pIdx) {
    const idx = pIdx * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    
    // Very bright white
    if (r >= 235 && g >= 235 && b >= 235) return true;
    
    // Neutral studio floor shadow
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (r >= 165 && g >= 165 && b >= 165 && maxDiff <= 14) return true;
    
    return false;
  }
  
  // Seed the queue with all border pixels that are background candidates
  for (let x = 0; x < width; x++) {
    if (isBgPixel(x)) {
      visited[x] = 1;
      queue[qTail++] = x;
    }
    const bIdx = (height - 1) * width + x;
    if (isBgPixel(bIdx)) {
      visited[bIdx] = 1;
      queue[qTail++] = bIdx;
    }
  }
  
  for (let y = 0; y < height; y++) {
    const lIdx = y * width;
    if (!visited[lIdx] && isBgPixel(lIdx)) {
      visited[lIdx] = 1;
      queue[qTail++] = lIdx;
    }
    const rIdx = y * width + (width - 1);
    if (!visited[rIdx] && isBgPixel(rIdx)) {
      visited[rIdx] = 1;
      queue[qTail++] = rIdx;
    }
  }
  
  // BFS Flood Fill
  while (qHead < qTail) {
    const cur = queue[qHead++];
    const cx = cur % width;
    const cy = Math.floor(cur / width);
    
    const neighbors = [cur - 1, cur + 1, cur - width, cur + width];
    for (const nb of neighbors) {
      if (nb < 0 || nb >= width * height) continue;
      const nx = nb % width;
      if (Math.abs(nx - cx) > 1) continue; // no wrap
      
      if (!visited[nb] && isBgPixel(nb)) {
        visited[nb] = 1;
        queue[qTail++] = nb;
      }
    }
  }
  
  let minX = width, maxX = 0, minY = height, maxY = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const srcIdx = p * channels;
      const dstIdx = p * 4;
      
      const r = data[srcIdx];
      const g = data[srcIdx + 1];
      const b = data[srcIdx + 2];
      
      if (visited[p]) {
        // Transparent background
        rgba[dstIdx] = 0;
        rgba[dstIdx + 1] = 0;
        rgba[dstIdx + 2] = 0;
        rgba[dstIdx + 3] = 0;
      } else {
        // Foreground vehicle
        rgba[dstIdx] = r;
        rgba[dstIdx + 1] = g;
        rgba[dstIdx + 2] = b;
        rgba[dstIdx + 3] = 255;
        
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  
  // Add 2px padding
  const pad = 2;
  const cropLeft = Math.max(0, minX - pad);
  const cropTop = Math.max(0, minY - pad);
  const cropWidth = Math.min(width - cropLeft, (maxX - minX + 1) + pad * 2);
  const cropHeight = Math.min(height - cropTop, (maxY - minY + 1) + pad * 2);
  
  console.log(`Extracting ${item.base}: crop [${cropLeft}, ${cropTop}, ${cropWidth}, ${cropHeight}]`);
  
  let baseSharp = sharp(rgba, {
    raw: { width, height, channels: 4 }
  }).extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight });
  
  if (item.flip180) {
    baseSharp = baseSharp.rotate(180);
  }
  
  const baseBuf = await baseSharp.png({ compressionLevel: 9 }).toBuffer();
  
  // Save standard file
  await sharp(baseBuf).toFile(path.join(OUT_DIR, `${item.base}.png`));
  
  // Save _v and _h files
  if (item.base === 'red_truck') {
    // Red truck is horizontal by default, facing RIGHT
    await sharp(baseBuf).toFile(path.join(OUT_DIR, 'red_truck_h.png'));
    await sharp(baseBuf).rotate(270).toFile(path.join(OUT_DIR, 'red_truck_v.png'));
  } else {
    // Other vehicles are vertical by default, facing UP
    await sharp(baseBuf).toFile(path.join(OUT_DIR, `${item.base}_v.png`));
    await sharp(baseBuf).rotate(90).toFile(path.join(OUT_DIR, `${item.base}_h.png`));
  }
  
  console.log(`Finished ${item.base}`);
}

for (const img of IMAGES) {
  await processImage(img);
}
console.log('All vehicles cleanly extracted without fringe!');
