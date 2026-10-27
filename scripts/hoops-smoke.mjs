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
  const read = () => page.evaluate(() => { const d = document.querySelector('.hoops-world').dataset; return { shots: +d.shots, score: +d.score, mode: d.mode, x: +d.dadX, y: +d.dadY, rx: +d.rimX, ry: +d.rimY }; });
  // After a shot the rebound is Dad's to fetch; a reload gives him the ball back for the next check.
  const holding = async () => { if ((await read()).mode !== 'held') { await page.reload(); await page.locator('[data-ready="true"]').waitFor(); } };
  const away = (s, px) => { const len = Math.hypot(s.rx - s.x, s.ry - s.y); return { x: s.x - (s.rx - s.x) / len * px, y: s.y - (s.ry - s.y) / len * px }; };
  // Hold Dad still past the aim delay, pull back `px` away from the rim, let go.
  async function pullShot(px) {
    const s = await read();
    await page.mouse.move(s.x, s.y); await page.mouse.down(); await page.waitForTimeout(250);
    const to = away(s, px); await page.mouse.move(to.x, to.y, { steps: 4 }); await page.mouse.up();
  }

  // 1. A drag that starts on Dad and moves straight away is movement, even a sprint; so is one on empty court.
  // Touches through CDP, with the touch-down and the first move sent together as a real finger's are: the headless
  // renderer can take longer than the aim's hold between two separate round trips.
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y })) });
  for (const offset of [0, 120]) {
    await holding(); const s = await read();
    const x0 = s.x - offset, y = s.y + offset, dir = s.x > 195 ? -80 : 80; // toward the middle, never into a sideline
    await Promise.all([touch('touchStart', [[1, x0, y]]), touch('touchMove', [[1, x0 + dir / 3, y]])]);
    await touch('touchMove', [[1, x0 + (dir * 2) / 3, y]]); await touch('touchMove', [[1, x0 + dir, y]]);
    await page.waitForTimeout(600); await touch('touchEnd', []);
    const after = await read();
    assert.equal(after.shots, s.shots, 'a drag must not shoot');
    assert.ok(Math.abs(after.x - s.x) > 20, `Dad should move (${s.x} → ${after.x})`);
    await page.waitForTimeout(500);
  }

  // 2. Hold Dad, pull back, let go: a shot, and the ball comes back into play.
  await holding(); let s = await read();
  await pullShot(78);
  await page.waitForFunction(n => +document.querySelector('.hoops-world').dataset.shots === n, s.shots + 1, { timeout: 2000 });

  // 3. Sliding back onto Dad cancels: no shot, still dribbling.
  await holding(); s = await read();
  await pullShot(8); await page.waitForTimeout(300);
  assert.equal((await read()).shots, s.shots, 'a pull slid back onto Dad must cancel');
  assert.equal((await read()).mode, 'held');

  // 4. A quick click on empty court jumps rather than shoots.
  s = await read();
  await page.mouse.click(s.x + 120, s.y + 200, { delay: 100 });
  await page.waitForTimeout(300);
  assert.equal((await read()).shots, s.shots, 'a tap must not shoot');

  // 5. Two fingers: the first steers, a second held on Dad aims and shoots (it must not become a jump).
  await holding(); s = await read();
  const stick = [1, s.x - 110, s.y + 220], to = away(s, 78);
  await touch('touchStart', [stick]);
  await touch('touchStart', [stick, [2, s.x, s.y]]);
  await page.waitForTimeout(250);
  for (let i = 1; i <= 4; i++) await touch('touchMove', [stick, [2, s.x + (to.x - s.x) * i / 4, s.y + (to.y - s.y) * i / 4]]);
  await touch('touchEnd', [stick]);
  await touch('touchEnd', []);
  await page.waitForFunction(n => +document.querySelector('.hoops-world').dataset.shots === n, s.shots + 1, { timeout: 2000 });

  // 6. Jump shot: hold Dad and pull back with one finger, tap with another (he jumps at once), let go in the air.
  await holding(); s = await read();
  const pull = away(s, 78);
  await touch('touchStart', [[1, s.x, s.y]]); await page.waitForTimeout(250);
  await touch('touchMove', [[1, pull.x, pull.y]]);
  await touch('touchStart', [[1, pull.x, pull.y], [2, s.x + 120, s.y + 200]]);
  await touch('touchEnd', [[1, pull.x, pull.y]]); await page.waitForTimeout(250);
  await touch('touchEnd', []);
  await page.waitForFunction(n => +document.querySelector('.hoops-world').dataset.shots === n, s.shots + 1, { timeout: 2000 });

  // 7. Offline after one full load.
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await context.setOffline(true);
  await page.reload();
  await page.locator('[data-ready="true"]').waitFor();
  await context.setOffline(false);

  assert.deepEqual(errors, [], 'page errors');
  assert.deepEqual(requests.filter(r => !r.includes('favicon')), [], 'failed requests');
  console.log('Hoops smoke passed: drags (even from Dad) move, hold-pull-release shoots, slide-back cancels, tap jumps, second finger on Dad shoots, jump shot, offline reload.');
} finally {
  await browser.close();
}
