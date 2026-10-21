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
  // Arrow keys move along the screen, which shows the farm at 45°: Right walks world (+x, -z), Down walks (+x, +z).
  async function walk(x, z, downFirst = false) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const s = await current();
      const dx = x - s.player.x, dz = z - s.player.z;
      if (Math.hypot(dx, dz) < 0.18) return;
      const legs = [[(dx - dz) * Math.SQRT1_2, 'ArrowLeft', 'ArrowRight'], [(dx + dz) * Math.SQRT1_2, 'ArrowUp', 'ArrowDown']];
      // She runs at 3.6 and slows towards 55% of that as the basket fills (model.ts speed()).
      const load = Object.values(s.produce).reduce((a, b) => a + b, 0) / (24 + 12 * ((s.purchased > 1) + (s.purchased > 3)));
      const pace = 3.6 * (1 - 0.45 * load);
      for (const [delta, negative, positive] of downFirst ? legs.reverse() : legs) {
        if (Math.abs(delta) < 0.07) continue;
        const key = delta < 0 ? negative : positive;
        await page.keyboard.down(key);
        await page.waitForTimeout(Math.max(40, Math.abs(delta) / pace * 1000));
        await page.keyboard.up(key);
      }
    }
    const s = await current();
    assert(Math.hypot(x - s.player.x, z - s.player.z) < 0.45, `Unable to reach ${x},${z}: ${JSON.stringify(s.player)}`);
  }
  // Rows nearest the path first, snaking so each step crosses one plant.
  const snake = cells => [-24, -32, -40].flatMap((z, r) => {
    const row = cells.filter(c => Math.round(c.z * 10) === z).sort((a, b) => a.x - b.x);
    return r % 2 ? row.reverse() : row;
  });
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

  await walk(-3.8, -0.4);
  assert.equal((await current()).seeds.tomato, 9);
  const cells = snake((await current()).plots[0].cells);
  // Round the seed stand, into the near corner of the field.
  await walk(cells[0].x, cells[0].z, true);
  for (const cell of cells) await walk(cell.x, cell.z);
  await walk(0, 0);
  await page.waitForTimeout(8200);
  await page.screenshot({ path: 'test-results/farm-portrait-390.png' });
  await walk(cells[0].x, cells[0].z, true);
  for (const cell of cells) await walk(cell.x, cell.z);
  const harvested = await current();
  console.log('Harvested', harvested.produce, harvested.plots[0].cells.map(c => c.stage));
  assert(harvested.produce.tomato >= 20);
  await walk(0, 0);
  await walk(1.5, 2.9);
  assert.equal((await current()).produce.tomato, 0);
  await walk(2.05, 3.7);
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-wallet]')?.textContent;
    return Number(text) >= 40;
  }, undefined, { timeout: 35_000 });
  await walk(0, 0, true);
  const earned = (await current()).wallet;
  await walk(3.2, -3.2);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('pocket-farm:v1')).purchased === 1);
  const purchased = await current();
  assert.equal(purchased.plots.length, 2);
  // The purchase costs 40; completing the "buy the field" goal may pay its reward back in the same moment.
  assert(purchased.wallet <= earned - 30, `charged ${earned} → ${purchased.wallet}`);
  assert(purchased.goal >= 3, `goals completed: ${purchased.goal}`);
  await page.reload(); await page.locator('[data-ready="true"]').waitFor();
  const resumed = await current();
  assert.equal(resumed.plots.length, 2); assert.equal(resumed.purchased, 1); assert.equal(resumed.wallet, purchased.wallet);
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
  // Starting over: two taps in the pause menu clear the farm and reload a fresh one.
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.locator('[data-reset]').click();
  await Promise.all([page.waitForEvent('load'), page.locator('[data-reset]').click()]);
  await page.locator('[data-ready="true"]').waitFor();
  const fresh = JSON.parse(await page.evaluate(() => localStorage.getItem('pocket-farm:v1')) ?? '{"wallet":0,"purchased":0}');
  assert.equal(fresh.wallet, 0); assert.equal(fresh.purchased ?? 0, 0);
  report.push('Start a new farm (two taps) clears the save and reloads a fresh farm.');
  await context.close();
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  await writeFile('test-results/farm-smoke.json', JSON.stringify({ report, errors, requests }, null, 2));
  console.log(report.join('\n'));
} finally { await browser.close(); }
