import { expect, test } from '@playwright/test';

test('ana sayfa ve oda akışında kritik konsol hatası yoktur', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Kız Tavlası Online' })).toBeVisible();

  await page.getByLabel('Oyuncu adın').fill('Konsol Testi');
  await page.getByRole('button', { name: 'Oda Oluştur' }).click();
  await expect(page).toHaveURL(/\/oda\//);
  await expect(page.getByText('Rakip bekleniyor', { exact: false })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test('mobil (375x667) görünümde yatay taşma ve konsol hatası oluşmaz, dokunma alanları en az 44px', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Kız Tavlası Online' })).toBeVisible();

  const hasOverflowHome = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflowHome).toBe(false);

  const createBtnBox = await page.getByRole('button', { name: 'Oda Oluştur' }).boundingBox();
  expect(createBtnBox?.height).toBeGreaterThanOrEqual(44);

  await page.getByLabel('Oyuncu adın').fill('Mobil Oyuncu');
  await page.getByRole('button', { name: 'Oda Oluştur' }).click();
  await expect(page).toHaveURL(/\/oda\//);
  await expect(page.getByText('Rakip bekleniyor', { exact: false })).toBeVisible();

  const hasOverflowLobby = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflowLobby).toBe(false);
  expect(consoleErrors).toEqual([]);
});
