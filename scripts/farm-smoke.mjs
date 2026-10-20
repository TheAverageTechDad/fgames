import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.FGAMES_URL || 'http://127.0.0.1:5182';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [], requests = [];
const report = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await context.newPage(); page.setDefaultTimeout(20_000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) requests.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}/farm`);
  await page.locator('[data-ready="true"]').waitFor();
  async function current() {
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('pocket-farm:v1')));
    await page.getByRole('button', { name: 'Back to farming', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.matches('[data-farm-canvas]'));
    return s;
  }
  async function walk(x, z) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const s = await current();
      const dx = x - s.player.x, dz = z - s.player.z;
      if (Math.hypot(dx, dz) < 0.18) return;
      for (const [delta, negative, positive] of [[dx, 'ArrowLeft', 'ArrowRight'], [dz, 'ArrowUp', 'ArrowDown']]) {
        if (Math.abs(delta) < 0.07) continue;
        const key = delta < 0 ? negative : positive;
        await page.keyboard.down(key);
        await page.waitForTimeout(Math.max(40, Math.abs(delta) / 3.1 * 1000));
        await page.keyboard.up(key);
      }
    }
    const s = await current();
    assert(Math.hypot(x - s.player.x, z - s.player.z) < 0.45, `Unable to reach ${x},${z}: ${JSON.stringify(s.player)}`);
  }
  // Genuine touch input, followed by cancellation, must move then release the character.
  const cdp = await context.newCDPSession(page);
  const initial = await current();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 500 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 225, y: 500 }] });
  await page.waitForTimeout(250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const touched = await current();
  assert(touched.player.x > initial.player.x + 0.2);
  await page.waitForTimeout(250);
  assert(Math.abs((await current()).player.x - touched.player.x) < 0.05);
  report.push('Real one-thumb drag moves the character; cancellation releases movement.');

  await walk(-2.9, 1.25);
  assert((await current()).seeds.tomato > 0);
  const cells = (await current()).plots[0].cells;
  for (const cell of cells) await walk(cell.x, cell.z);
  await walk(0, 0);
  await page.waitForTimeout(8200);
  await page.screenshot({ path: 'test-results/farm-portrait-390.png' });
  for (const cell of cells) await walk(cell.x, cell.z);
  const harvested = await current();
  console.log('Harvested', harvested.produce, harvested.plots[0].cells.map(c => c.stage));
  assert(harvested.produce.tomato >= 20);
  await walk(0, 1.5);
  await walk(2.45, 1.5);
  assert.equal((await current()).produce.tomato, 0);
  await walk(2.9, 3.2);
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-wallet]')?.textContent;
    return Number(text) >= 40;
  }, undefined, { timeout: 35_000 });
  await walk(0, 2);
  await walk(0, -1.85);
  const earned = (await current()).wallet;
  await walk(1.85, -1.85);
  await page.waitForFunction(() => document.querySelector('.field-count')?.textContent?.includes('2 fields'));
  const purchased = await current();
  assert.equal(purchased.plots.length, 2);
  assert.equal(purchased.wallet, earned - 40);
  await page.reload(); await page.locator('[data-ready="true"]').waitFor();
  const resumed = await current();
  assert.equal(resumed.plots.length, 2); assert.equal(resumed.wallet, purchased.wallet);
  report.push('Seeds → planting → growth → harvest → delivery → customer sales → cash → first land purchase, then reload without duplicate spending.');
  await page.screenshot({ path: 'test-results/farm-expanded-390.png' });

  await page.getByRole('button', { name: 'Mute sound', exact: true }).click();
  assert((await current()).muted);
  await page.getByRole('button', { name: 'Back to arcade', exact: true }).click();
  await page.getByRole('button', { name: 'Play Pocket Farm', exact: true }).waitFor();
  assert.equal(await page.locator('[data-farm-canvas]').count(), 0);
  await page.getByRole('button', { name: 'Play Pocket Farm', exact: true }).click();
  await page.locator('[data-ready="true"]').waitFor();
  assert.equal(await page.locator('[data-farm-canvas]').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Turn sound on', exact: true }).count(), 1);
  report.push('Arcade launch, home navigation, renderer teardown, single-canvas return, and persisted mute setting.');
  for (const viewport of [{ width: 375, height: 667 }, { width: 1024, height: 900 }]) {
    await page.setViewportSize(viewport);
    const bounds = await page.locator('.farm-shell').boundingBox();
    assert(bounds.height <= viewport.height && bounds.width <= 500);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `test-results/farm-${viewport.width}.png` });
  }
  report.push('390×844, 375×667, and 1024×900 layouts remain upright and fit the viewport.');
  await context.close();
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  await writeFile('test-results/farm-smoke.json', JSON.stringify({ report, errors, requests }, null, 2));
  console.log(report.join('\n'));
} finally { await browser.close(); }
