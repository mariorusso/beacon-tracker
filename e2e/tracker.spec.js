import { test, expect } from '@playwright/test';

// stub sendBeacon so we can see what gets sent, and stop links from
// navigating away (tel:, new tabs)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__sent = [];
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: (_url, data) => {
        data.text().then((text) => window.__sent.push(...JSON.parse(text).items));
        return true;
      },
    });
    window.addEventListener('click', (e) => {
      if (e.target.closest('a')) e.preventDefault();
    });
  });
  await page.goto('/');
});

async function sent(page) {
  await page.evaluate(() => window.BeaconTracker.flush());
  return page.evaluate(() => window.__sent);
}

const find = (events, match) =>
  events.filter((e) => Object.entries(match).every(([k, v]) => e[k] === v));

const card = (page, n) => page.locator(`[data-track-id="listing-${n}"]`);

test('only counts impressions for cards that have been on screen', async ({ page }) => {
  await expect
    .poll(async () => find(await sent(page), { id: 'listing-1', type: 'impression' }).length)
    .toBe(1);
  // the second list is below a 70vh spacer
  expect(find(await sent(page), { id: 'listing-8', type: 'impression' })).toHaveLength(0);

  await card(page, 8).scrollIntoViewIfNeeded();
  await expect
    .poll(async () => find(await sent(page), { id: 'listing-8', type: 'impression' }).length)
    .toBe(1);

  // scrolling back up doesn't count listing-1 again
  await card(page, 1).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  expect(find(await sent(page), { id: 'listing-1', type: 'impression' })).toHaveLength(1);
});

test('includes the sub item and page', async ({ page }) => {
  await expect
    .poll(async () => find(await sent(page), { id: 'listing-1', type: 'impression' })[0])
    .toEqual({ id: 'listing-1', item: 'offer-1', page: '/', type: 'impression' });
});

test('classifies clicks from the link', async ({ page }) => {
  const listing = card(page, 1);
  await listing.getByRole('link', { name: /^Call/ }).click();
  await listing.getByRole('link', { name: /^Directions/ }).click();
  await listing.getByRole('link', { name: /^Instagram/ }).click();
  await listing.getByRole('link', { name: /^Website/ }).click();
  await listing.getByRole('button', { name: /^Book/ }).click();

  await expect
    .poll(async () =>
      find(await sent(page), { id: 'listing-1' })
        .filter((e) => e.type !== 'impression')
        .map((e) => e.type)
    )
    .toEqual(['click_phone', 'click_directions', 'click_instagram', 'click_outbound', 'click_book']);
});

test('ignores a quick double click', async ({ page }) => {
  await card(page, 2).getByRole('link', { name: /^Call/ }).dblclick();
  await page.waitForTimeout(300);
  expect(find(await sent(page), { id: 'listing-2', type: 'click_phone' })).toHaveLength(1);
});

test('ignores clicks outside tracked elements', async ({ page }) => {
  await page.getByRole('button', { name: 'Load 2 more listings' }).click();
  await page.waitForTimeout(300);
  expect((await sent(page)).filter((e) => e.type !== 'impression')).toHaveLength(0);
});

test('a swipe is not a click, a keyboard press is', async ({ page }) => {
  const call = card(page, 3).getByRole('link', { name: /^Call/ });

  // pointer pressed in one place and released 100px away, like swiping a carousel
  await call.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const opts = { bubbles: true, clientX: box.x, clientY: box.y };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('click', { ...opts, clientX: box.x + 100, detail: 1 }));
  });
  await page.waitForTimeout(300);
  expect(find(await sent(page), { id: 'listing-3', type: 'click_phone' })).toHaveLength(0);

  // keyboard should still count (this one failed in Firefox before the keydown fix)
  await call.focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => find(await sent(page), { id: 'listing-3', type: 'click_phone' }).length)
    .toBe(1);
});

test('picks up cards added after load', async ({ page }) => {
  await page.getByRole('button', { name: 'Load 2 more listings' }).click();
  await card(page, 10).scrollIntoViewIfNeeded();
  await expect
    .poll(async () => find(await sent(page), { id: 'listing-10', type: 'impression' }).length)
    .toBe(1);
});

test('restarts counting after client-side navigation', async ({ page }) => {
  await expect
    .poll(async () => find(await sent(page), { type: 'impression', page: '/' }).length)
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Client-side navigate' }).click();
  await expect(page).toHaveURL(/\/listings\/2$/);

  await expect
    .poll(async () => find(await sent(page), { type: 'impression', page: '/listings/:id' }).length)
    .toBeGreaterThan(0);
});

test('the real beacon reaches the collector', async ({ page }, testInfo) => {
  // fresh page without the stub
  const fresh = await page.context().newPage();
  const id = `${testInfo.project.name}-${Date.now()}`;
  await fresh.goto('/');
  await fresh.evaluate((id) => window.BeaconTracker.track(id, 'click_test'), id);

  await expect
    .poll(async () => {
      const rows = await (await fresh.request.get('/stats')).json();
      return rows.find((r) => r.id === id)?.count;
    })
    .toBe(1);
  await fresh.close();
});
