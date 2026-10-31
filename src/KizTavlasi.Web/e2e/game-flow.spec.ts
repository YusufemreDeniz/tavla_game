import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Ana E2E senaryosu: iki ayrı tarayıcı bağlamıyla oda kurma, katılma,
 * maç oynama, yenileme sonrası geri dönme ve rövanş akışı.
 */
test.describe('Kız Tavlası tam oyun akışı', () => {
  let hostContext: BrowserContext;
  let guestContext: BrowserContext;
  let hostPage: Page;
  let guestPage: Page;

  test.beforeAll(async ({ browser }) => {
    hostContext = await browser.newContext();
    guestContext = await browser.newContext();
    hostPage = await hostContext.newPage();
    guestPage = await guestContext.newPage();
  });

  test.afterAll(async () => {
    await hostContext?.close();
    await guestContext?.close();
  });

  async function rollUntilMatchEnds(maxRolls = 500): Promise<void> {
    // Sıra kimdeyse zar atar; çift bonusu bekliyorsa haneden pul seçer.
    for (let i = 0; i < maxRolls; i++) {
      const hostDialog = hostPage.getByRole('dialog', { name: 'Maç sonucu' });
      if (await hostDialog.isVisible().catch(() => false)) {
        return;
      }

      let acted = false;
      for (const page of [hostPage, guestPage]) {
        // Bekleyen hamle varsa parlayan haneye dokun.
        const moveButton = page.getByRole('button', { name: /haneyi oyna/ }).first();
        if (await moveButton.isVisible().catch(() => false)) {
          await moveButton.click({ timeout: 2000 }).catch(() => {});
          acted = true;
          break;
        }

        const rollButton = page.getByRole('button', { name: /zar at/i });
        if (await rollButton.isEnabled().catch(() => false)) {
          await rollButton.click({ timeout: 2000 }).catch(() => {});
          acted = true;
          break;
        }
      }

      await hostPage.waitForTimeout(acted ? 120 : 250);
    }
    throw new Error('Maç beklenen hamle sayısında tamamlanmadı.');
  }

  test('oda kurma, katılma, oynama, yenileme ve rövanş', async () => {
    test.setTimeout(300_000);
    // 1. Birinci oyuncu oda oluşturur.
    await hostPage.goto('/');
    await hostPage.getByLabel('Oyuncu adın').fill('Ayşe');
    await hostPage.getByRole('radio', { name: 'Tek El' }).click();
    await hostPage.getByRole('button', { name: 'Oda Oluştur' }).click();

    // 2. Paylaşım linki (oda kodu) alınır.
    await expect(hostPage).toHaveURL(/\/oda\/[A-Z0-9]{6}/);
    const roomCode = hostPage.url().split('/oda/')[1];
    await expect(hostPage.getByText('Rakip bekleniyor', { exact: false })).toBeVisible();

    // 3. İkinci oyuncu farklı browser context ile katılır.
    await guestPage.goto(`/oda/${roomCode}`);
    await guestPage.getByLabel('Oyuncu adın').fill('Fatma');
    await guestPage.getByRole('button', { name: 'Odaya Katıl' }).click();

    // Lobi: iki oyuncu iki ekranda da görünür.
    await expect(hostPage.getByText('Fatma')).toBeVisible();
    await expect(guestPage.getByText('Ayşe')).toBeVisible();
    await expect(
      guestPage.getByText('Oda sahibinin oyunu başlatması bekleniyor', { exact: false }),
    ).toBeVisible();

    // 4. Host oyunu başlatır.
    await hostPage.getByRole('button', { name: 'Oyunu Başlat' }).click();

    // 5. İki taraf da aynı başlangıç sonucunu (oyun ekranını) görür.
    await expect(hostPage.getByRole('button', { name: /zar at/i })).toBeVisible({ timeout: 15_000 });
    await expect(guestPage.getByRole('button', { name: /zar at/i })).toBeVisible({ timeout: 15_000 });
    await expect(hostPage.getByText('başlıyor!', { exact: false })).toBeVisible();

    // 6-8. Aktif oyuncu zar atar; sırası olmayanın butonu devre dışıdır.
    const hostCanRoll = await hostPage.getByRole('button', { name: /zar at/i }).isEnabled();
    const activePage = hostCanRoll ? hostPage : guestPage;
    const passivePage = hostCanRoll ? guestPage : hostPage;

    await expect(passivePage.getByRole('button', { name: /zar at/i })).toBeDisabled();
    await activePage.getByRole('button', { name: /zar at/i }).click();

    // 7. Her iki ekran da atışı görür (geçmişe düşer).
    await expect(activePage.getByText(/attı/, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(passivePage.getByText(/attı/, { exact: false }).first()).toBeVisible({ timeout: 10_000 });

    // 9-10. Oyunculardan biri sayfayı yeniler ve aynı koltukla geri döner.
    await guestPage.reload();
    await expect(guestPage.getByRole('button', { name: /zar at/i })).toBeVisible({ timeout: 15_000 });
    await expect(guestPage.getByText('Fatma').first()).toBeVisible();

    // 11. Oyun tamamlanır.
    await rollUntilMatchEnds();

    // 12. Sonuç her iki ekranda gösterilir.
    await expect(hostPage.getByRole('dialog', { name: 'Maç sonucu' })).toBeVisible({ timeout: 15_000 });
    await expect(guestPage.getByRole('dialog', { name: 'Maç sonucu' })).toBeVisible({ timeout: 15_000 });

    // 13. Rövanş akışı çalışır.
    await hostPage.getByRole('button', { name: 'Rövanş İste' }).click();
    await expect(guestPage.getByText('Rakibin rövanş istiyor', { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    await guestPage.getByRole('button', { name: 'Kabul Et' }).click();

    // Yeni maç başlar; iki ekranda da oyun görünür.
    await expect(hostPage.getByRole('button', { name: /zar at/i })).toBeVisible({ timeout: 15_000 });
    await expect(guestPage.getByRole('button', { name: /zar at/i })).toBeVisible({ timeout: 15_000 });
  });
});
