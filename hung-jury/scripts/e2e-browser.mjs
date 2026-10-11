// Browser end-to-end test. Needs: npm i -D playwright-core, a Chromium, and a server started with
// USE_STUB_JUDGE=true HJ_TIMER_SCALE=0.1 NEXT_PUBLIC_USE_MOCKS=false (built with NEXT_PUBLIC_USE_MOCKS=false) on a fresh process.
import { chromium } from 'playwright-core';
const base = 'http://localhost:3057';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const log = (m) => console.log(m);
async function user(handle) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`[${handle}] pageerror ${e.message}`));
  await page.goto(base + '/signin');
  await page.getByLabel('Handle').fill(handle);
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await page.waitForURL(/avatar/);
  await page.locator('.avatar-grid button').first().click();
  await page.getByRole('button', { name: 'Use this avatar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/avatar'));
  return page;
}
const dave = await user('e2e_dave');
const maya = await user('e2e_maya');
const ann = await user('e2e_ann');
log('signed in x3');
await dave.goto(base + '/');
await dave.getByPlaceholder('The Case of the Missing Oat Milk').fill('The Great Pizza Heist');
await dave.getByPlaceholder('Tell the court your side of the story...').fill('Maya ate the last slice of my pizza and denied it.');
await dave.getByPlaceholder('maya').fill('e2e_maya');
await dave.locator('section[aria-label="File a case"] button[type=submit], section[aria-label="File a case"] button').last().click();
await dave.waitForURL(/waiting\/(.+)\?role=plaintiff/, { timeout: 10000 });
const id = dave.url().match(/waiting\/([^?]+)/)[1];
log('filed ' + id);
await maya.goto(`${base}/summons/${id}`);
await maya.getByRole('button', { name: /Accept and enter court/ }).click();
await maya.waitForURL(/waiting/);
log('maya accepted');
await dave.waitForFunction(() => document.body.innerText.includes('Both sides are here'), null, { timeout: 15000 });
log('dave sees both present');
await ann.goto(`${base}/case/${id}`);
await dave.getByRole('button', { name: 'Start trial' }).click();
await dave.waitForURL(/case\//, { timeout: 15000 });
await maya.waitForURL(/case\//, { timeout: 15000 });
log('both in court');
for (let i = 0; i < 120; i++) {
  for (const [p, who] of [[dave, 'plaintiff'], [maya, 'defendant']]) {
    const box = p.getByPlaceholder('Your turn to speak');
    if (await box.isVisible().catch(() => false) && await box.isEnabled().catch(() => false)) {
      await box.fill(`This is my honest account from the ${who}.`);
      await p.getByRole('button', { name: /send|speak|submit/i }).first().click().catch(() => {});
      log(`${who} spoke`);
    }
  }
  if (await ann.locator('article[aria-label="Case verdict"]').isVisible()) { log('ann sees the verdict panel'); break; }
  await new Promise((r) => setTimeout(r, 1000));
}
await ann.getByRole('button',{name:'Guilty'}).first().click().catch(()=>{});
await new Promise((r)=>setTimeout(r,1000));
await ann.screenshot({ path: 'ann.png', fullPage: true });
await dave.screenshot({ path: 'dave.png', fullPage: true });
await browser.close();
