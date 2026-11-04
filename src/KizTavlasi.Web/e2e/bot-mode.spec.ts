import { expect, test, type Page } from '@playwright/test';

/**
 * Yapay zekâya karşı tek oyunculu mod ve izleyici modu.
 * Bot sunucuda oynar (TurnAutomationService); E2E sunucusunda düşünme süresi kısaltılır.
 */
test.describe('Yapay zekâya karşı oyun ve izleyici', () => {
  async function playUntilMatchEnds(page: Page, maxActions = 600): Promise<void> {
    for (let i = 0; i < maxActions; i++) {
      if (await page.getByRole('dialog', { name: 'Maç sonucu' }).isVisible().catch(() => false)) {
        return;
      }

      let acted = false;
      const moveButton = page.getByRole('button', { name: /haneyi oyna/ }).first();
      if (await moveButton.isVisible().catch(() => false)) {
        await moveButton.click({ timeout: 2000 }).catch(() => {});
        acted = true;
      } else {
        const rollButton = page.getByRole('button', { name: /zar at/i });
        if (await rollButton.isEnabled().catch(() => false)) {
          await rollButton.click({ timeout: 2000 }).catch(() => {});
          acted = true;
        }
      }

      await page.waitForTimeout(acted ? 120 : 200);
    }
    throw new Error('Bot maçı beklenen sürede tamamlanmadı.');
  }

  test('ana sayfadan bota karşı maç kurulur, izleyici katılır ve maç sonuna kadar oynanır', async ({ browser }) => {
    test.setTimeout(240_000);
    const playerContext = await browser.newContext();
    const spectatorContext = await browser.newContext();
    const page = await playerContext.newPage();
    const spectatorPage = await spectatorContext.newPage();

    try {
      await page.goto('/');
      await page.getByLabel('Oyuncu adın').fill('Ayşe');
      await page.getByRole('radio', { name: 'Tek El' }).click();
      await page.getByRole('radio', { name: /Kolay/ }).click();
      await page.getByRole('button', { name: /yapay zekâya karşı oyna/i }).click();

      await expect(page).toHaveURL(/\/oda\/[A-Z0-9]{6}/);
      const roomUrl = page.url();
      await expect(page.getByText('Çırak Bot')).toBeVisible();
      // Bot odasında davet kartı gösterilmez.
      await expect(page.getByRole('button', { name: 'Linki Kopyala' })).toHaveCount(0);

      // Üçüncü kişi: koltuklar dolu, atılmak yerine izlemeyi seçer.
      await spectatorPage.goto(roomUrl);
      await expect(spectatorPage.getByRole('heading', { name: 'Masa dolu' })).toBeVisible();
      await spectatorPage.getByRole('button', { name: 'Maçı İzle' }).click();
      await expect(spectatorPage.getByText('Oda sahibinin oyunu başlatması bekleniyor', { exact: false })).toBeVisible();
      await expect(page.getByLabel('1 izleyici')).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: 'Bota Karşı Başlat' }).click();
      await expect(page.getByRole('region', { name: /tavla tahtası/i })).toBeVisible({ timeout: 15_000 });
      await expect(spectatorPage.getByRole('region', { name: /tavla tahtası/i })).toBeVisible({ timeout: 15_000 });
      await expect(spectatorPage.getByText('İzleyici', { exact: true })).toBeVisible();
      await expect(spectatorPage.getByRole('button', { name: /zar at/i })).toHaveCount(0);

      await playUntilMatchEnds(page);

      await expect(page.getByRole('dialog', { name: 'Maç sonucu' })).toBeVisible();
      await expect(spectatorPage.getByRole('dialog', { name: 'Maç sonucu' })).toBeVisible({ timeout: 15_000 });
      await expect(spectatorPage.getByRole('button', { name: 'Rövanş İste' })).toHaveCount(0);

      // Bot rövanşı kendiliğinden kabul eder.
      await page.getByRole('button', { name: 'Rövanş İste' }).click();
      await expect(page.getByRole('dialog', { name: 'Maç sonucu' })).toBeHidden({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: /zar at/i })).toBeVisible({ timeout: 15_000 });
    } finally {
      await playerContext.close();
      await spectatorContext.close();
    }
  });
});
