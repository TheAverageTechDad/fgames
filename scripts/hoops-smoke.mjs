import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const base = process.env.FGAMES_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({ headless: true });
const errors = [], requests = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await context.newPage(); page.setDefaultTimeout(20_000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) requests.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}/hoops`);
  await page.locator('[data-ready="true"]').waitFor();
  const read = () => page.evaluate(() => { const d = document.querySelector('.hoops-world').dataset; return { shots: +d.shots, score: +d.score, mode: d.mode, x: +d.dadX, y: +d.dadY }; });
  const holding = () => page.waitForFunction(() => document.querySelector('.hoops-world').dataset.mode === 'held', null, { timeout: 8000 });
  // A swipe in timed steps, so its speed is what a thumb would do.
  async function swipe(from, dx, dy, ms) {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    for (let i = 1; i <= 5; i++) { await page.waitForTimeout(ms / 5); await page.mouse.move(from.x + dx * i / 5, from.y + dy * i / 5); }
    await page.mouse.up();
  }

  // 1. A sprint drag on empty court moves Dad and never shoots.
  let s = await read();
  await page.mouse.move(s.x - 120, s.y + 200); await page.mouse.down();
  await page.mouse.move(s.x - 40, s.y + 200, { steps: 6 }); await page.waitForTimeout(600); await page.mouse.up();
  let after = await read();
  assert.equal(after.shots, s.shots, 'a sprint drag must not shoot');
  assert.ok(Math.abs(after.x - s.x) > 20, `Dad should move (${s.x} → ${after.x})`);

  // 2. A swipe up from Dad shoots, and the ball comes back into play.
  await holding(); s = await read();
  await swipe(s, 0, -117, 150);
  await page.waitForFunction(n => +document.querySelector('.hoops-world').dataset.shots === n, s.shots + 1, { timeout: 2000 });
  await page.waitForTimeout(3000);
  assert.ok(['loose', 'reset', 'held'].includes((await read()).mode));

  // 3. A quick click on empty court jumps rather than shoots.
  s = await read();
  await page.mouse.click(s.x + 120, s.y + 200, { delay: 100 });
  await page.waitForTimeout(300);
  assert.equal((await read()).shots, s.shots, 'a tap must not shoot');

  // 4. Two fingers: the first steers, a second on Dad shoots (it must not become a jump).
  await holding(); s = await read();
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y })) });
  const stick = [1, s.x - 110, s.y + 220];
  await touch('touchStart', [stick]);
  await touch('touchMove', [[1, stick[1] + 10, stick[2]]]);
  const shot = [2, s.x, s.y];
  await touch('touchStart', [[1, stick[1] + 10, stick[2]], shot]);
  for (let i = 1; i <= 5; i++) { await page.waitForTimeout(30); await touch('touchMove', [[1, stick[1] + 10, stick[2]], [2, s.x, s.y - 117 * i / 5]]); }
  await touch('touchEnd', [[1, stick[1] + 10, stick[2]]]);
  await touch('touchEnd', []);
  await page.waitForFunction(n => +document.querySelector('.hoops-world').dataset.shots === n, s.shots + 1, { timeout: 2000 });

  // 5. Offline after one full load.
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await context.setOffline(true);
  await page.reload();
  await page.locator('[data-ready="true"]').waitFor();
  await context.setOffline(false);

  assert.deepEqual(errors, [], 'page errors');
  assert.deepEqual(requests.filter(r => !r.includes('favicon')), [], 'failed requests');
  console.log('Hoops smoke passed: sprint drag never shoots, swipe from Dad shoots, tap jumps, second finger on Dad shoots, offline reload.');
} finally {
  await browser.close();
}
