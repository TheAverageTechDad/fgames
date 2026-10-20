import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const base = process.env.FGAMES_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch();
try {
 for (const fallback of [false, true]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (fallback) await page.addInitScript(() => { HTMLCanvasElement.prototype.transferControlToOffscreen = undefined; });
  await page.goto(base);
  await page.getByRole('button', { name: 'Play Nuts & Bolts', exact: true }).click();
  await page.getByRole('button', { name: 'Play · Level 1', exact: true }).click();
  await page.locator('[data-bolt="0"]').waitFor();
  const levels = JSON.parse(await readFile('static/levels/nuts/easy.json', 'utf8'));
  for (const [index, move] of levels[0].solution.entries()) {
   await page.locator(`[data-bolt="${move.from}"]`).click();
   await page.locator(`[data-bolt="${move.to}"]`).click();
   if (index === 0) {
    for (let i = 0; i < 20; i++) await page.locator(`[data-bolt="${move.to}"]`).dispatchEvent('pointerdown');
    assert.match(await page.locator('.header-title').innerText(), /1 moves/i);
   }
   assert.equal(await page.getByRole('dialog', { name: 'Level complete', exact: true }).count(), 0);
   await page.waitForFunction(() => !document.querySelector('button[aria-label="Restart level"]')?.disabled);
  }
  await page.getByRole('dialog', { name: 'Level complete', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForURL(/stage=2/);
  await page.getByRole('heading', { name: 'Level 2', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Level 2', exact: true }).waitFor();
  await page.locator('[data-bolt="0"]').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS', fallback ? 'main-thread fallback' : 'background renderer', 'rapid-tap guard, Next and reload');
  await context.close();
 }
} finally { await browser.close(); }
