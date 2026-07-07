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
